
require('dotenv').config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// Fail hard in production if JWT_SECRET is not explicitly set.
// A hardcoded fallback in a public repo is a critical security vulnerability —
// anyone who has seen this code can forge valid admin tokens.
if (isProduction && !process.env.JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is required in production. ' +
    'Set it to a long, random secret (e.g. openssl rand -hex 64).'
  );
}

if (!isProduction && !process.env.JWT_SECRET) {
  console.warn(
    '[WARN] JWT_SECRET is not set. Using an insecure development fallback. ' +
    'This MUST be overridden in production via the JWT_SECRET environment variable.'
  );
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev_super_secret_jwt_key_evidence_action_safe_water_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  databaseUrl: process.env.DATABASE_URL,
  pg: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'evidence_action',
  },

  roles: {
    FIELD_OFFICER: 'FIELD_OFFICER',
    HQ_APPROVER: 'HQ_APPROVER',
    ADMIN: 'ADMIN',
  },

  visitStatus: {
    DRAFT: 'DRAFT',
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    COMPLETED: 'COMPLETED',
  },

  decisionAction: {
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
  },
};

module.exports = config;

