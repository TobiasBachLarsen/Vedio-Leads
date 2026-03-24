const fetch = require("node-fetch");

module.exports = function(app, deps) {

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
    res.json({
      status: "ok",
      provider: "datafordeler",
      hasDatafordeler: !!process.env.DATAFORDELER_KEY,
      version: "2.3.0",
    });
  });
};
