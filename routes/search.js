const fetch = require("node-fetch");

module.exports = function(app, deps) {
  const { searchByBranch, lookupDatafordeler, BRANCH_CODES } = deps;

  // ── Søg virksomheder (Datafordeler GraphQL — branchebaseret)
  app.get("/api/search", async (req, res) => {
    const { branche = "", zipFrom, zipTo, from = 0, q = "" } = req.query;

    const b2 = (branche || "").trim().substring(0, 2);
    if (!b2) {
      return res.status(400).json({ error: "Vælg en branche for at søge", code: "NO_BRANCH" });
    }
    if (!BRANCH_CODES[b2]) {
      return res.status(400).json({ error: `Ukendt branchekode: ${b2}`, code: "UNKNOWN_BRANCH" });
    }

    try {
      const filters = {};
      if (zipFrom) filters.zipFrom = zipFrom;
      if (zipTo)   filters.zipTo   = zipTo;
      const result = await searchByBranch(b2, filters, Number(from), q.trim());
      return res.json({ ...result, from: Number(from), provider: "datafordeler" });
    } catch (err) {
      console.error("Søgefejl:", err.message);
      res.status(502).json({ error: err.message, code: "SEARCH_ERROR" });
    }
  });

  // Enkelt CVR-opslag (altid via Datafordeler GraphQL)
  app.get("/api/company/:cvr", async (req, res) => {
    try {
      let company = await lookupDatafordeler(req.params.cvr);
      if (process.env.CLEARBIT_KEY) {
        const key = process.env.CLEARBIT_KEY;
        if (key && company.email) {
          try {
            const domain = company.email.split("@")[1];
            const r = await fetch(`https://company.clearbit.com/v2/companies/find?domain=${domain}`, {
              headers: { Authorization: `Bearer ${key}` },
            });
            if (r.ok) {
              const data = await r.json();
              company = {
                ...company,
                web: data.domain || company.web,
                li: data.linkedin?.handle || company.li,
                fb: data.facebook?.handle || company.fb,
                tech: data.tech || company.tech,
              };
            }
          } catch (e) { /* ignore enrichment errors */ }
        }
      }
      res.json(company);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
};
