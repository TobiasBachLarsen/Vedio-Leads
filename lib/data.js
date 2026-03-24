const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data.json");
const USERS_FILE = path.join(__dirname, "../users.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {}
  return {
    leads: [],
    lists: [{ id: "all", name: "Alle leads" }],
    icpScores: {},
    pipeline: {},
    notes: {},
    tags: {},
    followup: {},
  };
}

function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch (e) {}
  return [];
}

function getUserDataFile(userId) {
  return path.join(__dirname, `../data_${userId}.json`);
}

function loadUserData(userId) {
  const file = getUserDataFile(userId);
  try {
    if (fs.existsSync(file)) {
      const d = JSON.parse(fs.readFileSync(file, "utf-8"));
      // Migrate old flat pipeline to dual pipelines if needed
      if (!d.pipelines && d.pipeline) {
        const SDR_STAGES = new Set(['Ny','Kontaktet','Kvalificeret']);
        d.pipelines = { sdr: {}, ae: {} };
        Object.entries(d.pipeline).forEach(([cvr, stage]) => {
          if (SDR_STAGES.has(stage)) d.pipelines.sdr[cvr] = stage;
          else d.pipelines.ae[cvr] = stage;
        });
      }
      if (!d.pipelines) d.pipelines = { sdr: {}, ae: {} };
      if (!d.pipelines.sdr) d.pipelines.sdr = {};
      if (!d.pipelines.ae) d.pipelines.ae = {};
      return d;
    }
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

function saveUserData(userId, d) {
  fs.writeFileSync(getUserDataFile(userId), JSON.stringify(d, null, 2));
}

module.exports = { DATA_FILE, USERS_FILE, loadData, saveData, loadUsers, getUserDataFile, loadUserData, saveUserData };
