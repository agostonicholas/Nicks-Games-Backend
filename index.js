const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.port || 5000;
const SCORE_FILE = path.join(__dirname, "scores.json");
const bcrypt = require("bcrypt");

app.use(cors({
    origin: ["https://agostonicholas.github.io",
    "http://127.0.0.1:5500"]
}));

app.use(express.json());

const usersJSON = path.join(__dirname, 'users.json');

if (!fs.existsSync(SCORE_FILE)) {
  fs.writeFileSync(SCORE_FILE, JSON.stringify({}));
}

async function loadUsers() {
  try {
    const txt = fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(txt || '[]');
  } catch {
    return [];
  }
}
async function saveUsers(users) {
  fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

app.post('/login', async (req, res) => {
    if (!username || !password){
        return res.status(400).json({ success: false, message: 'Invalid Username and Password'});
    }

    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const users = await loadUsers()
    const user = users.find(u => u.username === username && bcrypt.compareSync(password, u.password));
    
    if (user && bcrypt.compareSync(password, user.password)) {
        console.log(`User ${username} logged in successfully.`);
        return res.status(200).json({ success: true, username });
    } else {
        return res.status(401).json({ success: false, message: 'Invalid Username and Password' });
    }
});

app.post('/register', async (req, res) => {
        try {
            if (!username || !password) {
                return res.status(400).json({ success: false, message: 'Invalid Username and Password' });
            }

            const username = String(req.body.username || '').trim().toLowerCase();
            const password = String(req.body.password || '').trim();
            const users = await loadUsers();
            
            if (users.some(u => u.username === username)) {
                return res.status(409).json({ success: false, message: 'User exists' });
            } else {
                const passwordHash = await bcrypt.hash(password, 12);
                users.push({ username, passwordHash, createdAt: Date.now() });
                await saveUsers(users);
                return res.status(201).json({ success: true, username });
            }
    } catch (error) {
        console.error('Error during registration:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.post("/save-score", (req, res) => {
    const { game, score } = req.body;
    const SCORE_FILE = path.join(__dirname, "scores.json");

    if (!game || !score) {
        return res.status(400).json({ error: "Game and score are required." });
    }

    fs.readFile(SCORE_FILE, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Failed to read scores file." });
        }

        let scores = JSON.parse(data || "{}");
        scores[game] = score;

        fs.writeFile(SCORE_FILE, JSON.stringify(scores, null, 2), "utf8", (err) => {
            if (err) {
                return res.status(500).json({ error: "Failed to save score." });
            }
            res.json({ message: "Score saved successfully." });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});