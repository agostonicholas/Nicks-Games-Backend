const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.port || 5000;
const SCORE_FILE = path.join(__dirname, "scores.json");

app.use(express.json());

app.use(cors({
    origin: "https://agostonicholas.github.io"
}));

if (!fs.existsSync(SCORE_FILE)) {
  fs.writeFileSync(SCORE_FILE, JSON.stringify({}));
}

const users = [
    { username: 'user1', password: 'pass1' },
];

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, username });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(409).json({ success: false, message: 'User exists' });
    }
    users.push({ username, password });
    res.json({ success: true, username });
});

app.post("/api/save-score", (req, res) => {
    const { game, score } = req.body;

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