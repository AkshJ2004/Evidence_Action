
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config');

let pool = null;

async function getDb() {
  if (pool) return pool;

  const candidatePool = new Pool({
    connectionString: config.databaseUrl,
    host: config.pg.host,
    port: config.pg.port,
    user: config.pg.user,
    password: config.pg.password,
    database: config.pg.database,
    connectionTimeoutMillis: 5000,
  });

  const client = await candidatePool.connect();
  client.release();
  pool = candidatePool;
  return pool;
}

async function query(text, params = []) {
  const db = await getDb();
  const res = await db.query(text, params);
  return {
    rows: res.rows || [],
    rowCount: res.rowCount,
  };
}

async function getClient() {
  const db = await getDb();
  const client = await db.connect();
  return {
    query: (text, params) => client.query(text, params),
    release: () => client.release(),
  };
}

async function runMigrations({ schema = true, seed = true } = {}) {
  const db = await getDb();
  const schemaPath = path.join(__dirname, '../../schema.sql');
  const seedPath = path.join(__dirname, '../../seed.sql');

  if (schema) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await db.query(schemaSql);
  }

  if (seed) {
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await db.query(seedSql);
  }
}

module.exports = {
  query,
  getClient,
  getDb,
  runMigrations,
};
