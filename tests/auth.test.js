const path = require('path');
const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const request = require('supertest');

// use a temp scores file for tests (set BEFORE requiring the app)
process.env.USERS_FILE = path.join(__dirname, 'users.test.json');
process.env.SCORE_FILE = path.join(__dirname, 'scores.test.json');
const app = require('../app');
app.use(express.json());

if (!fs.existsSync(process.env.USERS_FILE)) {
  fs.writeFileSync(process.env.USERS_FILE, '[]', 'utf8');
}

function readUsers() {
  const raw = fs.readFileSync(process.env.USERS_FILE, 'utf8');
  return JSON.parse(raw || '[]');
}
function readScores() {
  const raw = fs.readFileSync(process.env.SCORE_FILE, 'utf8');
  return JSON.parse(raw || '{}');
}

beforeEach(() => {
  fs.writeFileSync(process.env.USERS_FILE, '[]', 'utf8'); // users = []
  fs.writeFileSync(process.env.SCORE_FILE, '{}', 'utf8'); // scores = {}
});

describe('Scores API (id-based)', () => {
  test('creates a new score for a game id and returns top5 (201)', async () => {
    const res = await request(app)
      .post('/api/save-score')
      .send({ id: 2, username: 'nick', score: 150 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe('2');               // normalized to string is fine
    expect(Array.isArray(res.body.top5)).toBe(true);
    expect(res.body.top5[0].username).toBe('nick');
    expect(res.body.top5[0].score).toBe(150);

    // verify file persisted correctly
    const data = JSON.parse(fs.readFileSync(process.env.SCORE_FILE, 'utf8'));
    expect(Array.isArray(data['2'])).toBe(true);
    expect(data['2'][0].score).toBe(150);
  });

  test('keeps scores sorted desc and trims to top 5', async () => {
    const gameId = 1;
    const scores = [120, 500, 300, 250, 999, 10, 700]; // 7 entries

    for (const [i, sc] of scores.entries()) {
      const res = await request(app)
        .post('/api/save-score')
        .send({ id: gameId, username: `u${i}`, score: sc })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(201);
    }

    const resLb = await request(app).get(`/api/leaderboard/${gameId}`);
    expect(resLb.status).toBe(200);
    expect(Array.isArray(resLb.body.top5)).toBe(true);
    expect(resLb.body.top5).toHaveLength(5);

    const onlyScores = resLb.body.top5.map(e => e.score);
    const sorted = [...onlyScores].sort((a, b) => b - a);
    expect(onlyScores).toEqual(sorted);
    // should include the 5 biggest: 999, 700, 500, 300, 250
    expect(onlyScores).toEqual([999, 700, 500, 300, 250]);
  });

  test('leaderboard for game with no scores returns empty array', async () => {
    const res = await request(app).get('/api/leaderboard/9999');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('9999');
    expect(Array.isArray(res.body.top5)).toBe(true);
    expect(res.body.top5).toHaveLength(0);
  });

  test('validation: missing id returns 400', async () => {
    const res = await request(app)
      .post('/api/save-score')
      .send({ username: 'nick', score: 100 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  test('validation: non-numeric score returns 400', async () => {
    const res = await request(app)
      .post('/api/save-score')
      .send({ id: 2, username: 'nick', score: 'not-a-number' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });
});

describe('POST /register validation + persistence', () => {
  test('registers a valid user (username length 2-4, password 6-20) and writes to file', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'nick', password: 'secret12' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.username).toBe('nick'); // should be lowercased

    const users = readUsers();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe('nick');
    expect(users[0].passwordHash).toBeDefined();
  });

  test('trims and lowercases username before saving', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: '  NiCk  ', password: 'secret12' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    const users = readUsers();
    expect(users[0].username).toBe('nick');
  });

  test('rejects missing username or password (400)', async () => {
    const r1 = await request(app)
      .post('/register')
      .send({ password: 'secret12' })
      .set('Content-Type', 'application/json');
    expect(r1.status).toBe(400);

    const r2 = await request(app)
      .post('/register')
      .send({ username: 'ni' })
      .set('Content-Type', 'application/json');
    expect(r2.status).toBe(400);
  });

  test('rejects username too short (<2) (400)', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'n', password: 'secret12' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  test('rejects username too long (>4) (400)', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'nicky', password: 'secret12' }) // length 5
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  test('rejects password too short (<6) (400)', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'ni', password: 'short' }) // 5
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  test('rejects password too long (>20) (400)', async () => {
    const longPwd = 'a'.repeat(21);
    const res = await request(app)
      .post('/register')
      .send({ username: 'ni', password: longPwd })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  test('rejects duplicate username (409)', async () => {
    await request(app)
      .post('/register')
      .send({ username: 'nick', password: 'secret12' })
      .set('Content-Type', 'application/json');

    const dup = await request(app)
      .post('/register')
      .send({ username: 'nick', password: 'another12' })
      .set('Content-Type', 'application/json');

    expect(dup.status).toBe(409);
    expect(dup.body.success).toBe(false);

    const users = readUsers();
    expect(users).toHaveLength(1);
  });

  test('duplicate is case-insensitive (Nick vs nick) → 409', async () => {
    await request(app)
      .post('/register')
      .send({ username: 'Nick', password: 'secret12' })
      .set('Content-Type', 'application/json');

    const dup = await request(app)
      .post('/register')
      .send({ username: 'nick', password: 'otherpass' })
      .set('Content-Type', 'application/json');

    expect(dup.status).toBe(409);
  });
});
