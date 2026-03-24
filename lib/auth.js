// ── Session store ─────────────────────────────────────────────────────────────
const sessions = new Map(); // token -> userId

function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token || !sessions.has(token)) return res.status(401).json({ error: "Ikke logget ind" });
  req.userId = sessions.get(token);
  next();
}

module.exports = { sessions, authMiddleware };
