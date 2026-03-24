const fs = require("fs");

module.exports = function(app, deps) {
  const { sessions, authMiddleware, loadUsers, USERS_FILE } = deps;

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const users = loadUsers();
    const user = users.find((u) => (u.email === email || u.id === email) && u.password === password);
    if (!user) return res.status(401).json({ error: "Forkert email eller adgangskode" });
    const token = Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
    sessions.set(token, user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, color: user.color, avatar: user.avatar || null } });
  });

  app.get("/api/auth/me", authMiddleware, (req, res) => {
    const users = loadUsers();
    const user = users.find((u) => u.id === req.userId);
    if (!user) return res.status(404).json({ error: "Bruger ikke fundet" });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, color: user.color, avatar: user.avatar || null });
  });

  app.post("/api/auth/logout", authMiddleware, (req, res) => {
    const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
    sessions.delete(token);
    res.json({ ok: true });
  });

  app.patch("/api/auth/profile", authMiddleware, (req, res) => {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: "Bruger ikke fundet" });
    const { name, email, color, avatar } = req.body;
    if (name && name.trim()) users[idx].name = name.trim();
    if (email && email.trim()) {
      const taken = users.find((u) => u.email === email.trim() && u.id !== req.userId);
      if (taken) return res.status(400).json({ error: "Email er allerede i brug af en anden bruger" });
      users[idx].email = email.trim();
    }
    if (color) users[idx].color = color;
    if (avatar !== undefined) users[idx].avatar = avatar; // base64 data URL or null
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    const u = users[idx];
    res.json({ id: u.id, name: u.name, email: u.email, role: u.role, color: u.color, avatar: u.avatar || null });
  });

  app.post("/api/auth/change-password", authMiddleware, (req, res) => {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: "Bruger ikke fundet" });
    const { currentPassword, newPassword } = req.body;
    if (users[idx].password !== currentPassword)
      return res.status(400).json({ error: "Nuværende adgangskode er forkert" });
    if (!newPassword || newPassword.length < 3)
      return res.status(400).json({ error: "Ny adgangskode skal være mindst 3 tegn" });
    users[idx].password = newPassword;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    res.json({ ok: true });
  });
};
