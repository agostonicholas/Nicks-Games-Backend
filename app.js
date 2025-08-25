const express = require("express");
const cors = require("cors");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const app = express();
const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, "users.test.json");
const SCORE_FILE = process.env.SCORE_FILE || path.join(__dirname, "scores.test.json");
const bcrypt = require("bcrypt");

app.use(cors({
    origin: ["https://agostonicholas.github.io",
    "http://127.0.0.1:5500"]
}));

app.use(express.json());

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "[]", "utf8");
}
if (!fs.existsSync(SCORE_FILE)) {
  fs.writeFileSync(SCORE_FILE, "{}", "utf8");
}

// HELPER FUNCTIONS / / / / / / / /

async function loadUsers() {
  try {
    const txt = await fsp.readFile(USERS_FILE, 'utf8');   // NOTE: await + fsp
    return JSON.parse(txt || '[]');
  } catch (e) {
    console.error('loadUsers error from', USERS_FILE, e.message);
    return []; // or rethrow if you prefer
  }
}

async function saveUsers(users) {
  await fsp.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  console.log('Users saved.');
}

async function loadScores() {
  try {
    const txt = await fsp.readFile(SCORE_FILE, "utf8");
    return JSON.parse(txt || "{}");
  } catch {
    return {};
  }
}
async function saveScores(scores) {
  await fsp.writeFile(SCORE_FILE, JSON.stringify(scores, null, 2), "utf8");
}

// LOGIN / / / / / / / /

app.post('/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Invalid Username and Password' });
    }

    const users = await loadUsers();

    // find by username
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid Username and Password' });
    }

    // compare input password to stored hash
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid Username and Password' });
    }

    // success
    console.log(`User ${username} logged in successfully.`);
    return res.status(200).json({ success: true, username });
    
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// REGISTER / / / / / / / /

app.post('/register', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();    
    
  try {
    if (!username || !password) {
  return res.status(400).json({ success: false, message: 'Invalid Username and Password' });
}

if (username.length < 2 || username.length > 4) {
  return res.status(400).json({ success: false, message: 'Username must be between 2 and 4 characters' });
}

if (password.length < 6 || password.length > 20) {
  return res.status(400).json({ success: false, message: 'Password must be between 6 and 20 characters' });
}

            
    const users = await loadUsers();
            
    if (users.some(u => u.username === username)) { // if user exists
      return res.status(409).json({ success: false, message: 'User exists' });
    } else { // else register user
      const passwordHash = await bcrypt.hash(password, 12); // hash password
      users.push({ username, passwordHash, createdAt: Date.now() }); // add user to array
      await saveUsers(users); // save
      console.log(`${username} registered.`);
      return res.status(201).json({ success: true, username }); // respond
    }
  } catch (error) {
    console.error('Error during registration:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// SAVE SCORE / / / / / / / /

app.post('/api/save-score', async (req, res) => {
  try {
    const gameID  = String(req.body.id ?? '').trim();   // <-- from body, normalized
    const username = String(req.body.username ?? 'guest').trim().toLowerCase();
    const nScore  = Number(req.body.score);

    if (!gameID) return res.status(400).json({ error: 'Game id is required' });
    if (!Number.isFinite(nScore)) return res.status(400).json({ error: 'Score must be a number' });

    const scores = await loadScores();
    scores[gameID] ||= [];
    scores[gameID].push({ username, score: nScore, ts: Date.now() });
    scores[gameID].sort((a, b) => b.score - a.score);
    scores[gameID] = scores[gameID].slice(0, 5);

    await saveScores(scores);

    // IMPORTANT: return `id`, not `gameID`
    return res.status(201).json({ success: true, id: gameID, top5: scores[gameID] });
  } catch (err) {
    console.error('save-score error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// LEADERBOARD / / / / / / / /

app.get('/api/leaderboard/:id', async (req, res) => {
  try {
    const gameID = String(req.params.id);
    const scores = await loadScores();
    const topFive = (scores[gameID] || []).slice(0, 5);
    return res.status(200).json({ id: gameID, top5: topFive });
  } catch (e) {
    console.error('leaderboard error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
module.exports = app;