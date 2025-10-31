process.env.NODE_ENV = "test";
process.env.USE_PGMEM = "true";

const request = require("supertest");
const app = require("../app");
const { initDb, pool, ensureGuestUser } = require("../db");

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await pool.query("TRUNCATE scores RESTART IDENTITY CASCADE");
  await pool.query("DELETE FROM users WHERE username <> $1", ["guest"]);
  await ensureGuestUser();
});

afterAll(async () => {
  await pool.end();
});

describe("Auth endpoints", () => {
  test("registers and logs in a user", async () => {
    const registerRes = await request(app).post("/register").send({
      username: "ab",
      password: "secret12",
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body).toMatchObject({ success: true, username: "ab" });

    const loginRes = await request(app).post("/login").send({
      username: "ab",
      password: "secret12",
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toMatchObject({ success: true, username: "ab" });
  });
});

describe("Score endpoints", () => {
  test("rejects score submissions for unknown users", async () => {
    const res = await request(app).post("/api/save-score").send({
      id: "pong",
      username: "zz",
      score: 42,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  test("creates a guest score when username omitted", async () => {
    const res = await request(app)
      .post("/api/save-score")
      .send({ id: "pong", score: 123 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe("pong");
    expect(res.body.top5[0].username).toBe("guest");
    expect(res.body.top5[0].score).toBe(123);
  });

  test("maintains per-game leaderboards limited to top 5", async () => {
    const users = ["aa", "bb", "cc", "dd", "ee", "ff"];
    for (const user of users) {
      await request(app).post("/register").send({
        username: user,
        password: "secret12",
      });
    }

    const scores = [
      { username: "aa", score: 10 },
      { username: "bb", score: 90 },
      { username: "cc", score: 70 },
      { username: "dd", score: 50 },
      { username: "ee", score: 30 },
      { username: "ff", score: 110 },
    ];

    for (const entry of scores) {
      const submit = await request(app).post("/api/save-score").send({
        id: "pong",
        username: entry.username,
        score: entry.score,
      });
      expect(submit.status).toBe(201);
    }

    const leaderboardRes = await request(app).get("/api/leaderboard/pong");

    expect(leaderboardRes.status).toBe(200);
    expect(leaderboardRes.body.id).toBe("pong");
    expect(leaderboardRes.body.top5).toHaveLength(5);
    expect(leaderboardRes.body.top5.map((s) => s.score)).toEqual([
      110, 90, 70, 50, 30,
    ]);
    expect(leaderboardRes.body.top5.map((s) => s.username)).toEqual([
      "ff",
      "bb",
      "cc",
      "dd",
      "ee",
    ]);

    await request(app).post("/api/save-score").send({
      id: "brick",
      username: "aa",
      score: 999,
    });

    const brickRes = await request(app).get("/api/leaderboard/brick");
    expect(brickRes.status).toBe(200);
    expect(brickRes.body.id).toBe("brick");
    expect(brickRes.body.top5).toHaveLength(1);
    expect(brickRes.body.top5[0].username).toBe("aa");
    expect(brickRes.body.top5[0].score).toBe(999);
  });
});
