import pg from "pg";

const { Pool } = pg;

export const db = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "chatapp",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

export async function setupDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS channels (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      is_dm       BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id  INT REFERENCES channels(id) ON DELETE CASCADE,
      user_id     INT REFERENCES users(id)    ON DELETE CASCADE,
      PRIMARY KEY (channel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          SERIAL PRIMARY KEY,
      channel_id  INT REFERENCES channels(id) ON DELETE CASCADE,
      user_id     INT REFERENCES users(id)    ON DELETE CASCADE,
      content     TEXT,
      file_url    TEXT,
      file_name   TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel
      ON messages(channel_id, created_at DESC);
  `);

  // Seed a default #general channel
  const { rows } = await db.query(
    "SELECT id FROM channels WHERE is_dm = FALSE LIMIT 1"
  );
  if (rows.length === 0) {
    await db.query("INSERT INTO channels (name) VALUES ('general')");
    console.log("Created default #general channel");
  }
}
