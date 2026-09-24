/**
 * Database Connection Module
 * 
 * Provides unified interface to PostgreSQL using:
 * 1. Standard node-postgres (pg.Pool) when external PostgreSQL is configured
 * 2. Embedded official PostgreSQL engine (@electric-sql/pglite) when running
 *    in standalone/dev/test mode without an external PostgreSQL daemon.
 * 
 * Both modes execute standard PostgreSQL SQL syntax, types, constraints, and transactions.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { PGlite } = require('@electric-sql/pglite');
const config = require('../config');

let pool = null;
let pgliteInstance = null;
let isEmbedded = false;

/**
 * Initializes the database connection pool or embedded engine.
 */
async function getDb() {
  if (pool) return { type: 'pool', instance: pool };
  if (pgliteInstance) return { type: 'pglite', instance: pgliteInstance };

  // If explicit DATABASE_URL is provided and not 'embedded', attempt real pg connection
  const hasExternalPg = Boolean(
    process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('embedded')
  );

  if (hasExternalPg) {
    try {
      const candidatePool = new Pool({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: 3000,
      });

      // Quick connectivity check
      const client = await candidatePool.connect();
      client.release();
      pool = candidatePool;
      isEmbedded = false;
      console.log(' Connected to external PostgreSQL database.');
      return { type: 'pool', instance: pool };
    } catch (err) {
      console.warn(`! Could not connect to external PostgreSQL at ${config.databaseUrl}: ${err.message}`);
      console.warn(' Falling back to embedded PostgreSQL (PGlite) engine for reliable zero-config execution.');
    }
  }

  // Use embedded PostgreSQL engine
  isEmbedded = true;
  pgliteInstance = new PGlite();
  
  // Auto-run schema and seed for embedded instance if tables don't exist yet
  try {
    const checkTable = await pgliteInstance.query("SELECT to_regclass('public.users') as exists");
    if (!checkTable.rows[0]?.exists) {
      const schemaSql = fs.readFileSync(path.join(__dirname, '../../schema.sql'), 'utf8');
      const seedSql = fs.readFileSync(path.join(__dirname, '../../seed.sql'), 'utf8');
      await pgliteInstance.exec(schemaSql);
      await pgliteInstance.exec(seedSql);
      console.log(' Embedded PostgreSQL initialized with schema.sql and seed.sql.');
    }
  } catch (initErr) {
    console.error('Error auto-initializing embedded DB:', initErr);
  }

  return { type: 'pglite', instance: pgliteInstance };
}

/**
 * Executes a parameterized SQL query on the active PostgreSQL database.
 * @param {string} text - SQL statement with $1, $2 placeholders
 * @param {Array} params - Query parameters
 * @returns {Promise<{ rows: Array, rowCount: number }>}
 */
async function query(text, params = []) {
  const db = await getDb();
  if (db.type === 'pool') {
    const res = await db.instance.query(text, params);
    return {
      rows: res.rows,
      rowCount: res.rowCount,
    };
  } else {
    const res = await db.instance.query(text, params);
    return {
      rows: res.rows,
      rowCount: res.rowCount !== undefined ? res.rowCount : (res.affectedRows ?? res.rows.length),
    };
  }
}

/**
 * Provides a dedicated database client for transactions (BEGIN, COMMIT, ROLLBACK).
 * @returns {Promise<{ query: Function, release: Function }>}
 */
async function getClient() {
  const db = await getDb();
  if (db.type === 'pool') {
    const client = await db.instance.connect();
    return {
      query: (text, params) => client.query(text, params),
      release: () => client.release(),
    };
  } else {
    // PGlite executes within single-threaded wasm context; simulate transaction client
    return {
      query: async (text, params) => {
        const res = await db.instance.query(text, params);
        return {
          rows: res.rows,
          rowCount: res.rowCount !== undefined ? res.rowCount : (res.affectedRows ?? res.rows.length),
        };
      },
      release: () => {},
    };
  }
}

/**
 * Executes schema.sql and seed.sql scripts against the database.
 */
async function runMigrations({ schema = true, seed = true } = {}) {
  const db = await getDb();
  const schemaPath = path.join(__dirname, '../../schema.sql');
  const seedPath = path.join(__dirname, '../../seed.sql');

  if (schema) {
    console.log(' Running schema.sql...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    if (db.type === 'pool') {
      await db.instance.query(schemaSql);
    } else {
      await db.instance.exec(schemaSql);
    }
    console.log(' schema.sql applied successfully.');
  }

  if (seed) {
    console.log(' Running seed.sql...');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    if (db.type === 'pool') {
      await db.instance.query(seedSql);
    } else {
      await db.instance.exec(seedSql);
    }
    console.log(' seed.sql applied successfully.');
  }
}

module.exports = {
  query,
  getClient,
  getDb,
  runMigrations,
  isEmbedded: () => isEmbedded,
};
