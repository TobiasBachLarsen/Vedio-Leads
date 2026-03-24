const fetch = require("node-fetch");

module.exports = function(app, deps) {
  const { authMiddleware, loadUsers, loadUserData } = deps;

  // ── Team stats ────────────────────────────────────────────────────────────────
  app.get("/api/stats/team", authMiddleware, (req, res) => {
    const users = loadUsers();
    const teamStats = users.map((u) => {
      const d = loadUserData(u.id);
      const aePipe = (d.pipelines && d.pipelines.ae) || d.pipeline || {};
      const sdrPipe = (d.pipelines && d.pipelines.sdr) || {};
      const stages = {};
      Object.values(aePipe).forEach((s) => { stages[s] = (stages[s] || 0) + 1; });
      Object.values(sdrPipe).forEach((s) => { stages[s] = (stages[s] || 0) + 1; });
      const wonLeads = d.leads.filter((l) => aePipe[l.cvr] === "Vundet");
      const lostLeads = d.leads.filter((l) => aePipe[l.cvr] === "Tabt");
      const wonValue = wonLeads.reduce((s, l) => s + (l.omsaetning || 0), 0);
      const winRate = (wonLeads.length + lostLeads.length) > 0
        ? Math.round((wonLeads.length / (wonLeads.length + lostLeads.length)) * 100)
        : 0;
      return {
        userId: u.id, name: u.name, role: u.role, color: u.color,
        leadsCount: d.leads.length, stages, wonValue, wonCount: wonLeads.length,
        lostCount: lostLeads.length, winRate,
      };
    });
    res.json(teamStats);
  });

  // ── n8n webhook proxy ─────────────────────────────────────────────────────────
  app.post("/api/webhook/n8n", async (req, res) => {
    const webhookUrl = req.body.webhookUrl || process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) return res.status(400).json({ error: "Ingen webhook URL konfigureret" });
    try {
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body.payload),
      });
      res.json({ ok: true, status: r.status });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // ── Status ────────────────────────────────────────────────────────────────────
  app.get("/api/status", (req, res) => {
    const hasDatafordeler = !!process.env.DATAFORDELER_KEY;
    const users = loadUsers();
    res.json({
      status: "ok",
      provider: "datafordeler",
      hasDatafordeler,
      userCount: users.length,
      version: "2.3.0",
      auth: true,
    });
  });
};
