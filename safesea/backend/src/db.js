const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'safesea',
  password: process.env.PGPASSWORD || 'safesea',
  database: process.env.PGDATABASE || 'safesea',
  max: 10,
});

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..', '..', 'db');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      console.log(`[db] waiting for postgres... (${i + 1}/${retries})`);
      await sleep(2000);
    }
  }
  throw new Error('Postgres not reachable');
}

async function init() {
  await waitForDb();
  const schema = fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('[db] schema ensured');

  // Seed only once, on an empty database, so restarts never duplicate rows.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n === 0) {
    const seed = fs.readFileSync(path.join(DB_DIR, 'seed.sql'), 'utf8');
    await pool.query(seed);
    console.log('[db] seed data inserted');
  } else {
    console.log('[db] seed skipped (database already populated)');
  }
}

async function adminEmail() {
  const { rows } = await pool.query("SELECT email FROM users WHERE role='admin' ORDER BY id LIMIT 1");
  return rows[0] ? rows[0].email : 'admin@safesea.in';
}

module.exports = { pool, init, adminEmail };
