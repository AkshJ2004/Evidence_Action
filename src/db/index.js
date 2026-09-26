const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { PGlite } = require('@electric-sql/pglite');
const config = require('../config');

let pool = null;
let pgliteInstance = null;

async function getDb() {
  if (pool) return { type: 'pool', instance: pool };
  if (pgliteInstance) return { type: 'pglite', instance: pgliteInstance };

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('embedded')) {
    try {
      const candidatePool = new Pool({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: 3000,
      });

      const client = await candidatePool.connect();
      client.release();
      pool = candidatePool;
      return { type: 'pool', instance: pool };
    } catch (err) {
      console.warn(`Could not connect to external PostgreSQL: ${err.message}. Falling back to embedded.`);
    }
  }

  pgliteInstance = new PGlite();
  
  try {
    const checkTable = await pgliteInstance.query("SELECT to_regclass('public.users') as exists");
    if (!checkTable.rows[0]?.exists) {
      const schemaSql = fs.readFileSync(path.join(__dirname, '../../schema.sql'), 'utf8');
      const seedSql = fs.readFileSync(path.join(__dirname, '../../seed.sql'), 'utf8');
      await pgliteInstance.exec(schemaSql);
      await pgliteInstance.exec(seedSql);
    }
  } catch (initErr) {
    console.error('Error auto-initializing embedded DB:', initErr);
  }

  return { type: 'pglite', instance: pgliteInstance };
}

async function query(text, params = []) {
  const db = await getDb();
  const res = await db.instance.query(text, params);
  return {
    rows: res.rows || [],
    rowCount: res.rowCount !== undefined ? res.rowCount : (res.affectedRows ?? (res.rows ? res.rows.length : 0)),
  };
}

async function getClient() {
  const db = await getDb();
  if (db.type === 'pool') {
    const client = await db.instance.connect();
    return {
      query: (text, params) => client.query(text, params),
      release: () => client.release(),
    };
  }

  return {
    query: async (text, params) => {
      const res = await db.instance.query(text, params);
      return {
        rows: res.rows || [],
        rowCount: res.rowCount !== undefined ? res.rowCount : (res.affectedRows ?? (res.rows ? res.rows.length : 0)),
      };
    },
    release: () => {},
  };
}

async function runMigrations({ schema = true, seed = true } = {}) {
  const db = await getDb();
  const schemaPath = path.join(__dirname, '../../schema.sql');
  const seedPath = path.join(__dirname, '../../seed.sql');

  if (schema) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    if (db.type === 'pool') {
      await db.instance.query(schemaSql);
    } else {
      await db.instance.exec(schemaSql);
    }
  }

  if (seed) {
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    if (db.type === 'pool') {
      await db.instance.query(seedSql);
    } else {
      await db.instance.exec(seedSql);
    }
  }
}

module.exports = {
  query,
  getClient,
  getDb,
  runMigrations,
  isEmbedded: () => !pool,
};
