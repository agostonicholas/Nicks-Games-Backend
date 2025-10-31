const { Pool } = require("pg");
const { URL } = require("url");
const bcrypt = require("bcrypt");

const DEFAULT_DB_URL = "postgres://neon:npg@localhost:5000/neondb";
const isTestEnv =
  process.env.NODE_ENV === "test" || process.env.USE_PGMEM === "true";

function buildPoolConfig(rawUrl) {
  if (!rawUrl) {
    throw new Error(
      "Missing DATABASE_URL. Set it to your Neon or local Postgres connection string."
    );
  }

  const url = new URL(rawUrl);

  const config = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database: decodeURIComponent(url.pathname?.slice(1) || ""),
    application_name: process.env.PG_APP_NAME || "nicks-games-backend",
  };

  const sslMode = url.searchParams.get("sslmode");
  const wantsSSL =
    sslMode === "require" ||
    sslMode === "prefer" ||
    url.hostname.endsWith("neon.tech");

  if (sslMode === "disable") {
    config.ssl = false;
  } else if (wantsSSL) {
    config.ssl = { rejectUnauthorized: false };
  }

  const channelBinding =
    url.searchParams.get("channel_binding") || process.env.PGCHANNELBINDING;
  if (channelBinding) {
    config.channelBinding = channelBinding;
  }

  return config;
}

let pool;

if (isTestEnv) {
  const { newDb } = require("pg-mem");
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool: MemPool } = mem.adapters.createPg();
  pool = new MemPool();
} else {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    DEFAULT_DB_URL;

  pool = new Pool(buildPoolConfig(connectionString));
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      score_id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
      game_id TEXT NOT NULL,
      score INTEGER NOT NULL
    )
  `);

  await pool.query(`
    ALTER TABLE scores
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await ensureGuestUser();
}

async function getUserByUsername(username) {
  const { rows } = await pool.query(
    `
      SELECT user_id, username, password, created_at
      FROM users
      WHERE username = $1
    `,
    [username]
  );
  return rows[0] || null;
}

async function getUserById(userId) {
  const { rows } = await pool.query(
    `
      SELECT user_id, username, password, created_at
      FROM users
      WHERE user_id = $1
    `,
    [userId]
  );
  return rows[0] || null;
}

async function createUser({ username, passwordHash }) {
  const { rows } = await pool.query(
    `
      INSERT INTO users (username, password)
      VALUES ($1, $2)
      ON CONFLICT (username) DO NOTHING
      RETURNING user_id, username, password, created_at
    `,
    [username, passwordHash]
  );

  if (rows[0]) {
    return rows[0];
  }

  return getUserByUsername(username);
}

async function ensureGuestUser() {
  const existing = await getUserByUsername("guest");
  if (existing) {
    return existing;
  }

  const guestPassword = process.env.GUEST_PASSWORD || "guest";
  const hash = await bcrypt.hash(guestPassword, 12);
  return createUser({ username: "guest", passwordHash: hash });
}

async function createScore({ userId, gameId, score }) {
  const { rows } = await pool.query(
    `
      INSERT INTO scores (user_id, game_id, score)
      VALUES ($1, $2, $3)
      RETURNING score_id, user_id, game_id, score, created_at
    `,
    [userId, gameId, score]
  );
  return rows[0];
}

async function getTopScores(gameId, limit = 5) {
  const { rows } = await pool.query(
    `
      SELECT
        s.score_id,
        s.game_id,
        s.score,
        s.created_at,
        u.username
      FROM scores s
      LEFT JOIN users u ON u.user_id = s.user_id
      WHERE s.game_id = $1
      ORDER BY s.score DESC, s.created_at ASC, s.score_id ASC
      LIMIT $2
    `,
    [gameId, limit]
  );

  return rows.map((row) => ({
    username: row.username || "guest",
    score: row.score,
    ts: row.created_at ? new Date(row.created_at).getTime() : null,
  }));
}

process.on("SIGINT", async () => {
  if (!pool) return;
  try {
    await pool.end();
  } finally {
    process.exit(0);
  }
});

module.exports = {
  initDb,
  getUserByUsername,
  getUserById,
  createUser,
  createScore,
  getTopScores,
  ensureGuestUser,
  query: (text, params) => pool.query(text, params),
  pool,
};
