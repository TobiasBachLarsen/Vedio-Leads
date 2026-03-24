module.exports = function(app, deps) {
  const { authMiddleware, loadUserData, saveUserData, loadUsers } = deps;

  // ── Leads ─────────────────────────────────────────────────────────────────────
  app.get("/api/leads", authMiddleware, (req, res) => res.json(loadUserData(req.userId)));

  app.post("/api/leads", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    const { company, listId } = req.body;
    if (!company?.cvr) return res.status(400).json({ error: "Mangler CVR" });
    if (d.leads.find((l) => l.cvr === company.cvr)) return res.status(409).json({ error: "Lead findes allerede" });
    d.leads.push({ ...company, listId: listId || "ungrouped", addedAt: new Date().toISOString() });
    saveUserData(req.userId, d);
    res.json({ ok: true });
  });

  app.delete("/api/leads/:cvr", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    d.leads = d.leads.filter((l) => l.cvr !== req.params.cvr);
    saveUserData(req.userId, d);
    res.json({ ok: true });
  });

  app.patch("/api/leads/:cvr", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    const lead = d.leads.find((l) => l.cvr === req.params.cvr);
    if (!lead) return res.status(404).json({ error: "Lead ikke fundet" });
    Object.assign(lead, req.body);
    saveUserData(req.userId, d);
    res.json({ ok: true });
  });

  // ── ICP / Pipeline / Notes / Tags / Followup ──────────────────────────────────
  app.patch("/api/meta/:cvr", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    const { cvr } = req.params;
    const { icpScore, pipeline, pipelines: newPipelines, note, tags, followup, contacts, deal, history } = req.body;
    if (icpScore !== undefined) { d.icpScores = d.icpScores || {}; d.icpScores[cvr] = icpScore; }
    if (pipeline !== undefined) { d.pipeline = d.pipeline || {}; d.pipeline[cvr] = pipeline; }
    if (newPipelines !== undefined) { d.pipelines = newPipelines; }
    if (note !== undefined) { d.notes = d.notes || {}; d.notes[cvr] = note; }
    if (tags !== undefined) { d.tags = d.tags || {}; d.tags[cvr] = tags; }
    if (followup !== undefined) { d.followup = d.followup || {}; d.followup[cvr] = followup; }
    if (contacts !== undefined) { d.contacts = d.contacts || {}; d.contacts[cvr] = contacts; }
    if (deal !== undefined) { d.deal = d.deal || {}; d.deal[cvr] = deal; }
    if (history !== undefined) { d.history = d.history || {}; d.history[cvr] = history; }
    saveUserData(req.userId, d);
    res.json({ ok: true });
  });

  // ── Cross-user pipeline push (SDR → AE) ───────────────────────────────────────
  app.post("/api/pipeline-push", authMiddleware, (req, res) => {
    const { cvr, company, aeStage } = req.body;
    if (!cvr || !aeStage) return res.status(400).json({ error: "cvr og aeStage er påkrævet" });
    const users = loadUsers();
    const aeUsers = users.filter(u => u.role === "AE");
    aeUsers.forEach(aeUser => {
      const d = loadUserData(aeUser.id);
      // Add lead to AE's leads list if not already there
      if (company && !d.leads.find(l => l.cvr === cvr)) {
        d.leads.push({ ...company, addedAt: new Date().toISOString(), listId: "ungrouped" });
      }
      // Set AE pipeline stage
      if (!d.pipelines) d.pipelines = { sdr: {}, ae: {} };
      if (!d.pipelines.ae) d.pipelines.ae = {};
      d.pipelines.ae[cvr] = aeStage;
      d.pipeline = d.pipeline || {};
      d.pipeline[cvr] = aeStage;
      saveUserData(aeUser.id, d);
    });
    res.json({ ok: true, pushedTo: aeUsers.map(u => u.name) });
  });

  // ── Lister ────────────────────────────────────────────────────────────────────
  app.post("/api/lists", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Navn mangler" });
    const list = { id: "list_" + Date.now(), name: name.trim(), createdAt: new Date().toISOString() };
    d.lists = d.lists || [{ id: "all", name: "Alle leads" }];
    d.lists.push(list);
    saveUserData(req.userId, d);
    res.json(list);
  });

  app.delete("/api/lists/:id", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    d.lists = (d.lists || []).filter((l) => l.id !== req.params.id);
    d.leads = (d.leads || []).map((l) => (l.listId === req.params.id ? { ...l, listId: "ungrouped" } : l));
    saveUserData(req.userId, d);
    res.json({ ok: true });
  });
};
