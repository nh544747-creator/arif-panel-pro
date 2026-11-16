
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN = process.env.ADMIN_USERNAME || "admin";
const PASS = process.env.ADMIN_PASSWORD;
const SECRET = process.env.SESSION_SECRET;
const PROD = process.env.NODE_ENV === "production";

if (PROD && (!PASS || PASS.length < 14 || !SECRET || SECRET.length < 32)) {
  throw Error("Set ADMIN_PASSWORD (14+ chars) and SESSION_SECRET (32+ chars).");
}

if (!PASS) console.warn("Set ADMIN_PASSWORD before using the panel.");

const db = new Database(
  process.env.DB_PATH || path.join(__dirname, "arif-panel.sqlite")
);

db.pragma("journal_mode=WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS players (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 game_uid TEXT,
 contact TEXT,
 status TEXT DEFAULT 'active',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 game TEXT DEFAULT 'Free Fire',
 mode TEXT DEFAULT 'Squad',
 event_date TEXT,
 entry_fee TEXT,
 prize TEXT,
 status TEXT DEFAULT 'upcoming',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS registrations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 tournament_id INTEGER NOT NULL,
 player_id INTEGER NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS results (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 tournament_id INTEGER NOT NULL,
 player_id INTEGER NOT NULL,
 placement INTEGER NOT NULL,
 points INTEGER DEFAULT 0,
 note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rooms (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 tournament_id INTEGER NOT NULL UNIQUE,
 room_code TEXT NOT NULL,
 room_password TEXT NOT NULL,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));

app.use(session({
 name: "arif.sid",
 secret: SECRET || "local-development-secret-change-before-deploying",
 resave: false,
 saveUninitialized: false,
 cookie: {
  httpOnly: true,
  sameSite: "lax",
  secure: PROD,
  maxAge: 8 * 60 * 60 * 1000
 }
}));

app.use("/api/login", rateLimit({
 windowMs: 15 * 60 * 1000,
 limit: 8,
 standardHeaders: true,
 legacyHeaders: false
}));

// Serve the already-uploaded root index.html
app.get("/", (req, res) => {
 res.sendFile(path.join(__dirname, "index.html"));
});

// Optional static assets
app.use(express.static(path.join(__dirname, "public")));

const hash = PASS ? bcrypt.hashSync(PASS, 12) : null;

function admin(req, res, next) {
 if (req.session?.admin) return next();
 res.status(401).json({ error: "Admin login required" });
}

function textok(v, n = 100) {
 return typeof v === "string" &&
  v.trim().length > 0 &&
  v.trim().length <= n;
}

app.get("/api/health", (req, res) =>
 res.json({ ok: true, app: "ARIF PANEL PRO ONLINE" })
);

app.get("/api/me", (req, res) =>
 res.json({ loggedIn: !!req.session?.admin })
);

app.post("/api/login", async (req, res) => {
 const { username, password } = req.body || {};

 if (!hash || username !== ADMIN ||
     typeof password !== "string" ||
     !(await bcrypt.compare(password, hash))) {
  return res.status(401).json({ error: "ভুল username অথবা password" });
 }

 req.session.regenerate(err => {
  if (err) return res.status(500).json({ error: "Session error" });
  req.session.admin = true;
  res.json({ ok: true });
 });
});

app.post("/api/logout", (req, res) => {
 req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/public/tournaments", (req, res) => {
 res.json(db.prepare(
  "SELECT id,title,game,mode,event_date,entry_fee,prize,status FROM tournaments ORDER BY id DESC"
 ).all());
});

app.post("/api/public/register", (req, res) => {
 const { name, game_uid, contact, tournament_id } = req.body || {};

 if (!textok(name, 60) ||
     (game_uid && !textok(game_uid, 40)) ||
     (contact && !textok(contact, 80))) {
  return res.status(400).json({ error: "তথ্য ঠিকভাবে পূরণ করো" });
 }

 const tournament = db.prepare(
  "SELECT id,status FROM tournaments WHERE id=?"
 ).get(Number(tournament_id));

 if (!tournament || tournament.status !== "upcoming") {
  return res.status(400).json({ error: "রেজিস্ট্রেশন বন্ধ" });
 }

 try {
  const id = db.transaction(() => {
   const player = db.prepare(
    "INSERT INTO players(name,game_uid,contact) VALUES(?,?,?)"
   ).run(name.trim(), game_uid || "", contact || "");

   db.prepare(
    "INSERT INTO registrations(tournament_id,player_id) VALUES(?,?)"
   ).run(tournament.id, player.lastInsertRowid);

   return player.lastInsertRowid;
  })();

  res.json({ ok: true, player_id: id });
 } catch (err) {
  res.status(400).json({ error: "রেজিস্ট্রেশন সম্পন্ন হয়নি" });
 }
});

app.get("/api/admin/summary", admin, (req, res) => {
 res.json({
  players: db.prepare("SELECT count(*) n FROM players").get().n,
  activePlayers: db.prepare("SELECT count(*) n FROM players WHERE status='active'").get().n,
  tournaments: db.prepare("SELECT count(*) n FROM tournaments").get().n,
  registrations: db.prepare("SELECT count(*) n FROM registrations").get().n
 });
});

app.get("/api/admin/players", admin, (req, res) => {
 res.json(db.prepare("SELECT * FROM players ORDER BY id DESC").all());
});

app.patch("/api/admin/players/:id", admin, (req, res) => {
 const { status } = req.body || {};
 if (!["active", "inactive"].includes(status))
  return res.status(400).json({ error: "Invalid status" });

 const result = db.prepare(
  "UPDATE players SET status=? WHERE id=?"
 ).run(status, Number(req.params.id));

 res.json({ ok: result.changes > 0 });
});

app.delete("/api/admin/players/:id", admin, (req, res) => {
 const id = Number(req.params.id);
 db.prepare("DELETE FROM results WHERE player_id=?").run(id);
 db.prepare("DELETE FROM registrations WHERE player_id=?").run(id);
 const result = db.prepare("DELETE FROM players WHERE id=?").run(id);
 res.json({ ok: result.changes > 0 });
});

app.get("/api/admin/tournaments", admin, (req, res) => {
 res.json(db.prepare("SELECT * FROM tournaments ORDER BY id DESC").all());
});

app.post("/api/admin/tournaments", admin, (req, res) => {
 const { title, game, mode, event_date, entry_fee, prize } = req.body || {};

 if (!textok(title, 100))
  return res.status(400).json({ error: "Tournament title required" });

 const result = db.prepare(
  "INSERT INTO tournaments(title,game,mode,event_date,entry_fee,prize) VALUES(?,?,?,?,?,?)"
 ).run(
  title.trim(), game || "Free Fire", mode || "Squad",
  event_date || "", entry_fee || "", prize || ""
 );

 res.json({ ok: true, id: result.lastInsertRowid });
});

app.patch("/api/admin/tournaments/:id", admin, (req, res) => {
 const { status } = req.body || {};
 if (!["upcoming", "live", "completed", "cancelled"].includes(status))
  return res.status(400).json({ error: "Invalid status" });

 const result = db.prepare(
  "UPDATE tournaments SET status=? WHERE id=?"
 ).run(status, Number(req.params.id));

 res.json({ ok: result.changes > 0 });
});

app.delete("/api/admin/tournaments/:id", admin, (req, res) => {
 const id = Number(req.params.id);
 db.prepare("DELETE FROM results WHERE tournament_id=?").run(id);
 db.prepare("DELETE FROM registrations WHERE tournament_id=?").run(id);
 db.prepare("DELETE FROM rooms WHERE tournament_id=?").run(id);
 const result = db.prepare("DELETE FROM tournaments WHERE id=?").run(id);
 res.json({ ok: result.changes > 0 });
});

app.get("/api/admin/registrations/:id", admin, (req, res) => {
 res.json(db.prepare(
  `SELECT p.id,p.name,p.game_uid,p.contact,p.status,r.created_at
   FROM registrations r JOIN players p ON p.id=r.player_id
   WHERE r.tournament_id=? ORDER BY r.id DESC`
 ).all(Number(req.params.id)));
});

app.put("/api/admin/rooms/:id", admin, (req, res) => {
 const { room_code, room_password } = req.body || {};

 if (!textok(room_code, 50) || !textok(room_password, 50))
  return res.status(400).json({ error: "Room ID/password required" });

 db.prepare(
  `INSERT INTO rooms(tournament_id,room_code,room_password)
   VALUES(?,?,?)
   ON CONFLICT(tournament_id) DO UPDATE SET
   room_code=excluded.room_code,
   room_password=excluded.room_password,
   updated_at=CURRENT_TIMESTAMP`
 ).run(Number(req.params.id), room_code.trim(), room_password.trim());

 res.json({ ok: true });
});

app.get("/api/admin/room/:id", admin, (req, res) => {
 res.json(db.prepare(
  "SELECT room_code,room_password,updated_at FROM rooms WHERE tournament_id=?"
 ).get(Number(req.params.id)) || null);
});

app.post("/api/admin/results", admin, (req, res) => {
 const { tournament_id, player_id, placement, points, note } = req.body || {};

 if (!Number.isInteger(Number(placement)) || Number(placement) < 1)
  return res.status(400).json({ error: "Invalid placement" });

 db.prepare(
  "INSERT INTO results(tournament_id,player_id,placement,points,note) VALUES(?,?,?,?,?)"
 ).run(
  Number(tournament_id), Number(player_id),
  Number(placement), Number(points) || 0, note || ""
 );

 res.json({ ok: true });
});

app.get("/api/admin/results/:id", admin, (req, res) => {
 res.json(db.prepare(
  `SELECT p.name,r.placement,r.points,r.note
   FROM results r JOIN players p ON p.id=r.player_id
   WHERE r.tournament_id=? ORDER BY r.placement`
 ).all(Number(req.params.id)));
});

app.listen(PORT, () => {
 console.log("ARIF PANEL PRO listening on " + PORT);
});
