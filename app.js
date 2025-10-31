const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const {
  getUserByUsername,
  ensureGuestUser,
  createUser,
  createScore,
  getTopScores,
} = require("./db");

const app = express();

app.use(
  cors({
    origin: ["https://agostonicholas.github.io", "http://127.0.0.1:3000"],
  })
);

app.use(express.json());

app.post("/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Username and Password" });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid Username and Password" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid Username and Password" });
    }

    console.log(`User ${username} logged in successfully.`);
    return res.status(200).json({ success: true, username });
  } catch (err) {
    console.error("login error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
});

app.post("/register", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "").trim();

  try {
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Username and Password" });
    }

    if (username.length < 2 || username.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Username must be between 2 and 4 characters",
      });
    }

    if (password.length < 6 || password.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 6 and 20 characters",
      });
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ success: false, message: "User exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await createUser({ username, passwordHash });
    console.log(`${username} registered.`);
    return res.status(201).json({ success: true, username });
  } catch (error) {
    console.error("Error during registration:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
});

app.post("/api/save-score", async (req, res) => {
  try {
    const gameID = String(req.body.id ?? "").trim();
    let username = String(req.body.username ?? "").trim().toLowerCase();
    if (!username) {
      username = "guest";
    }
    const nScore = Number(req.body.score);

    if (!gameID) return res.status(400).json({ error: "Game id is required" });
    if (!Number.isFinite(nScore))
      return res.status(400).json({ error: "Score must be a number" });

    let user = await getUserByUsername(username);

    if (!user) {
      if (username === "guest") {
        user = await ensureGuestUser();
      } else {
        return res.status(404).json({ error: "User not found" });
      }
    }

    await createScore({ userId: user.user_id, gameId: gameID, score: nScore });
    const topFive = await getTopScores(gameID, 5);

    return res.status(201).json({ success: true, id: gameID, top5: topFive });
  } catch (err) {
    console.error("save-score error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/leaderboard/:id", async (req, res) => {
  try {
    const gameID = String(req.params.id);
    const topFive = await getTopScores(gameID, 5);
    return res.status(200).json({ id: gameID, top5: topFive });
  } catch (e) {
    console.error("leaderboard error:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = app;
