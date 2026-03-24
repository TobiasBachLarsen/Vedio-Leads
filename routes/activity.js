const fetch = require("node-fetch");

// ── Default call scripts ──────────────────────────────────────────────────────
const DEFAULT_SCRIPTS = [
  {
    id: "script_cold",
    name: "Kold opkald",
    text: `Hej [navn], mit navn er [dit navn] fra Vedio. Har du 2 minutter til en hurtig snak?

Vi hjælper B2B-virksomheder med at finde, berige og bearbejde leads automatisk via CVR-data og AI.

Må jeg spørge — bruger I i dag et system til at finde nye kunder, eller er det mere manuelt?

Hvad er den største udfordring ved jeres nuværende lead-proces? Tid, kvalitet, opfølgning?

Det vi ser mange opleve er netop det — vi automatiserer hele prospecting-delen, så I kan fokusere på selve salget.

Ville det give mening at sætte 30 min af til en demo, så I kan se det i praksis? Hvad passer dig bedst — tirsdag eller onsdag?`,
    steps: []
  },
  {
    id: "script_followup",
    name: "Opfølgning",
    text: `Hej [navn], det er [dit navn] fra Vedio igen. Vi talte for [X dage] siden — har du haft tid til at tænke over det?

Jeg husker du nævnte [pain] som den største udfordring. Er det stadig aktuelt?

Siden vi talte har vi hjulpet en virksomhed i [deres branche] med netop det — de oplevede [resultat].

Er der noget der mangler for at I kan tage en beslutning? Hvem else skal med i loopet?

Lad os sætte en demo i kalenderen — hvornår passer det dig?`,
    steps: []
  }
];

module.exports = function(app, deps) {
  const { authMiddleware, loadUserData, saveUserData } = deps;

  // ── Calls ─────────────────────────────────────────────────────────────────────
  app.get("/api/calls", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    res.json(d.callLog || []);
  });

  app.post("/api/calls", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    if (!d.callLog) d.callLog = [];
    const call = {
      id: "call_" + Date.now(),
      createdAt: new Date().toISOString(),
      ...req.body
    };
    d.callLog.unshift(call);
    saveUserData(req.userId, d);
    res.json(call);
  });

  app.patch("/api/calls/:id", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    if (!d.callLog) d.callLog = [];
    const idx = d.callLog.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Opkald ikke fundet" });
    d.callLog[idx] = { ...d.callLog[idx], ...req.body };
    saveUserData(req.userId, d);
    res.json(d.callLog[idx]);
  });

  app.delete("/api/calls/:id", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    d.callLog = (d.callLog || []).filter(c => c.id !== req.params.id);
    saveUserData(req.userId, d);
    res.json({ ok: true });
  });

  // ── Demos ─────────────────────────────────────────────────────────────────────
  app.get("/api/demos", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    res.json(d.demoLog || []);
  });

  app.post("/api/demos", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    if (!d.demoLog) d.demoLog = [];
    const demo = {
      id: "demo_" + Date.now(),
      createdAt: new Date().toISOString(),
      status: "scheduled",
      ...req.body
    };
    d.demoLog.unshift(demo);
    saveUserData(req.userId, d);
    res.json(demo);
  });

  app.patch("/api/demos/:id", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    if (!d.demoLog) d.demoLog = [];
    const idx = d.demoLog.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Demo ikke fundet" });
    d.demoLog[idx] = { ...d.demoLog[idx], ...req.body };
    saveUserData(req.userId, d);
    res.json(d.demoLog[idx]);
  });

  app.delete("/api/demos/:id", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    d.demoLog = (d.demoLog || []).filter(x => x.id !== req.params.id);
    saveUserData(req.userId, d);
    res.json({ ok: true });
  });

  // ── Call Scripts ──────────────────────────────────────────────────────────────
  app.get("/api/scripts", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    if (!d.callScripts || d.callScripts.length === 0) {
      d.callScripts = JSON.parse(JSON.stringify(DEFAULT_SCRIPTS));
      saveUserData(req.userId, d);
    }
    res.json(d.callScripts);
  });

  app.post("/api/scripts", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    if (!d.callScripts) d.callScripts = [];
    const script = {
      id: "script_" + Date.now(),
      createdAt: new Date().toISOString(),
      steps: [],
      ...req.body
    };
    d.callScripts.push(script);
    saveUserData(req.userId, d);
    res.json(script);
  });

  app.patch("/api/scripts/:id", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    if (!d.callScripts) d.callScripts = [];
    const idx = d.callScripts.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Script ikke fundet" });
    d.callScripts[idx] = { ...d.callScripts[idx], ...req.body };
    saveUserData(req.userId, d);
    res.json(d.callScripts[idx]);
  });

  app.delete("/api/scripts/:id", authMiddleware, (req, res) => {
    const d = loadUserData(req.userId);
    d.callScripts = (d.callScripts || []).filter(s => s.id !== req.params.id);
    saveUserData(req.userId, d);
    res.json({ ok: true });
  });

  // ── AI Analysis (calls + demos) ───────────────────────────────────────────────
  app.post("/api/analyze", authMiddleware, async (req, res) => {
    const { type, notes, duration, outcome, companyName, contactName, pains, solutions } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Return basic rule-based analysis if no API key
      const score = outcome === "interested" || outcome === "booked" ? 8 :
                    outcome === "callback" ? 6 :
                    outcome === "not-interested" ? 4 : 5;
      return res.json({
        score,
        summary: `${type === "call" ? "Opkald" : "Demo"} afsluttet med udfald: ${outcome || "ukendt"}.`,
        strengths: ["God forberedelse", "Klart kommunikeret"],
        improvements: ["Husk at stille åbne spørgsmål", "Sæt altid en konkret næste dato"],
        nextStep: outcome === "callback" ? "Ring igen om 2-3 dage" : "Opfølg via email inden 24 timer"
      });
    }
    try {
      const prompt = type === "call"
        ? `Analyser dette salgsopkald og giv konkret feedback på dansk.\n\nVirksomhed: ${companyName || "Ukendt"}\nKontakt: ${contactName || "Ukendt"}\nVarighed: ${Math.floor((duration||0)/60)} min\nUdfald: ${outcome || "ukendt"}\nNotater:\n${notes || "(ingen notater)"}\n\nGiv:\n1. Score 1-10\n2. Hvad gik godt (2-3 punkter)\n3. Hvad kan forbedres (2-3 punkter)\n4. Anbefalet næste skridt\nSvar som JSON: {score, summary, strengths:[], improvements:[], nextStep}`
        : `Analyser denne demo og giv feedback på dansk.\n\nVirksomhed: ${companyName || "Ukendt"}\nKontakt: ${contactName || "Ukendt"}\nSmerter: ${(pains||[]).join(", ") || "(ingen)"}\nLøsninger: ${(solutions||[]).join(", ") || "(ingen)"}\nNotater: ${notes || "(ingen)"}\n\nGiv:\n1. Score 1-10\n2. Hvad gik godt\n3. Hvad kan forbedres\n4. Næste skridt for at lukke dealen\nSvar som JSON: {score, summary, strengths:[], improvements:[], nextStep}`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await r.json();
      const text = data.content?.[0]?.text || "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 5, summary: text, strengths: [], improvements: [], nextStep: "" };
      res.json(analysis);
    } catch (err) {
      res.json({ score: 5, summary: "AI-analyse ikke tilgængelig.", strengths: [], improvements: [], nextStep: "" });
    }
  });
};
