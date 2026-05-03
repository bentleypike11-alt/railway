const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const Database = require('better-sqlite3');
require('dotenv').config();

// ================= DATABASE =================
const db = new Database('data.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  bio TEXT DEFAULT ''
)
`).run();

// ================= DISCORD BOT =================
const bot = new Client({
  intents: [GatewayIntentBits.Guilds]
});

bot.once('ready', () => {
  console.log(`Bot logged in as ${bot.user.tag}`);
});

bot.login(process.env.BOT_TOKEN);

// ================= WEB SERVER =================
const app = express();

app.use(express.static('public'));
app.use(express.json());

app.use(session({
  secret: 'super-secret',
  resave: false,
  saveUninitialized: false
}));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// ================= HOME =================
app.get('/', (req, res) => {
  if (!req.session.user) return res.sendFile(__dirname + '/public/login.html');
  res.sendFile(__dirname + '/public/dashboard.html');
});

// ================= LOGIN =================
app.get('/login', (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

// ================= CALLBACK =================
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const token = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const user = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${token.data.access_token}`
      }
    });

    req.session.user = user.data;

    db.prepare(`
      INSERT INTO users (id, username)
      VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username
    `).run(user.data.id, user.data.username);

    res.redirect('/');
  } catch (err) {
    console.log(err);
    res.send('Login failed');
  }
});

// ================= USER API =================
app.get('/api/user', (req, res) => {
  if (!req.session.user) return res.status(401).json({});

  const settings = db.prepare('SELECT * FROM users WHERE id=?')
    .get(req.session.user.id);

  res.json({
    discord: req.session.user,
    settings
  });
});

// ================= SAVE SETTINGS =================
app.post('/api/save', (req, res) => {
  if (!req.session.user) return res.sendStatus(401);

  db.prepare(`
    UPDATE users SET bio=? WHERE id=?
  `).run(req.body.bio, req.session.user.id);

  res.json({ ok: true });
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ================= START =================
app.listen(process.env.PORT || 3000, () => {
  console.log('Web panel running');
});