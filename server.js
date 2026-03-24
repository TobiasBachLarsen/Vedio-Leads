require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const { loadData, saveData } = require("./lib/data");
const { searchByBranch, lookupDatafordeler } = require("./lib/datafordeler");
const { BRANCH_CODES } = require("./lib/branches");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Mount routes ──────────────────────────────────────────────────────────────
const deps = {
  loadData,
  saveData,
  searchByBranch,
  lookupDatafordeler,
  BRANCH_CODES,
};

require("./routes/search")(app, deps);
require("./routes/leads")(app, deps);
require("./routes/activity")(app, deps);
require("./routes/misc")(app, deps);

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎯 Vedio Sales kører på http://localhost:${PORT}`);
  console.log(`📡 Provider: Datafordeler GraphQL`);
  console.log(`🔑 API-nøgle: ${process.env.DATAFORDELER_KEY ? "konfigureret" : "⚠️  DATAFORDELER_KEY mangler i .env"}`);
  if (process.env.CLEARBIT_KEY) console.log("✨ Clearbit enrichment: aktiveret");
  if (process.env.N8N_WEBHOOK_URL) console.log("⚡ n8n webhook: konfigureret");
  console.log("\nStop med Ctrl+C\n");
});
