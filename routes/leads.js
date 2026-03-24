module.exports = function(app, deps) {
  const { loadData, saveData } = deps;

  // ── Leads ─────────────────────────────────────────────────────────────────────
  app.get("/api/leads", (req, res) => res.json(loadData()));

  app.post("/api/leads", (req, res) => {
    const d = loadData();
    const { company, listId } = req.body;
    if (!company?.cvr) return res.status(400).json({ error: "Mangler CVR" });
    if (d.leads.find((l) => l.cvr === company.cvr)) return res.status(409).json({ error: "Lead findes allerede" });
    d.leads.push({ ...company, listId: listId || "ungrouped", addedAt: new Date().toISOString() });
    saveData(d);
    res.json({ ok: true });
  });

  app.delete("/api/leads/:cvr", (req, res) => {
    const d = loadData();
    d.leads = d.leads.filter((l) => l.cvr !== req.params.cvr);
    saveData(d);
    res.json({ ok: true });
  });

  app.patch("/api/leads/:cvr", (req, res) => {
    const d = loadData();
    const lead = d.leads.find((l) => l.cvr === req.params.cvr);
    if (!lead) return res.status(404).json({ error: "Lead ikke fundet" });
    const { callStatus, note, listId, name, phone, email, city } = req.body;
    if (callStatus !== undefined) lead.callStatus = callStatus;
    if (note !== undefined) lead.note = note;
    if (listId !== undefined) lead.listId = listId;
    if (name !== undefined) lead.name = name;
    if (phone !== undefined) lead.phone = phone;
    if (email !== undefined) lead.email = email;
    if (city !== undefined) lead.city = city;
    saveData(d);
    res.json({ ok: true });
  });

  // ── ICP / Pipeline / Notes / Tags / Followup ──────────────────────────────────
  app.patch("/api/meta/:cvr", (req, res) => {
    const d = loadData();
    const { cvr } = req.params;
    const { icpScore, pipeline, pipelines, note, tags, followup, contacts, deal, history } = req.body;
    if (icpScore !== undefined) { d.icpScores = d.icpScores || {}; d.icpScores[cvr] = icpScore; }
    if (pipeline !== undefined) { d.pipeline = d.pipeline || {}; d.pipeline[cvr] = pipeline; }
    if (pipelines !== undefined) { d.pipelines = pipelines; }
    if (note !== undefined) { d.notes = d.notes || {}; d.notes[cvr] = note; }
    if (tags !== undefined) { d.tags = d.tags || {}; d.tags[cvr] = tags; }
    if (followup !== undefined) { d.followup = d.followup || {}; d.followup[cvr] = followup; }
    if (contacts !== undefined) { d.contacts = d.contacts || {}; d.contacts[cvr] = contacts; }
    if (deal !== undefined) { d.deal = d.deal || {}; d.deal[cvr] = deal; }
    if (history !== undefined) { d.history = d.history || {}; d.history[cvr] = history; }
    saveData(d);
    res.json({ ok: true });
  });

  // ── Lister ────────────────────────────────────────────────────────────────────
  app.post("/api/lists", (req, res) => {
    const d = loadData();
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Navn mangler" });
    const list = { id: "list_" + Date.now(), name: name.trim(), createdAt: new Date().toISOString() };
    d.lists = d.lists || [{ id: "all", name: "Alle leads" }];
    d.lists.push(list);
    saveData(d);
    res.json(list);
  });

  app.delete("/api/lists/:id", (req, res) => {
    const d = loadData();
    d.lists = (d.lists || []).filter((l) => l.id !== req.params.id);
    d.leads = (d.leads || []).map((l) => (l.listId === req.params.id ? { ...l, listId: "ungrouped" } : l));
    saveData(d);
    res.json({ ok: true });
  });
};
