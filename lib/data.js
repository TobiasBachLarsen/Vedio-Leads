const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {}
  return {
    leads: [],
    lists: [{ id: "all", name: "Alle leads" }],
    icpScores: {},
    pipeline: {},
    pipelines: { sdr: {}, ae: {} },
    notes: {},
    tags: {},
    followup: {},
    contacts: {},
    deal: {},
    history: {},
  };
}

function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

module.exports = { DATA_FILE, loadData, saveData };
