/**
 * Central Configuration Module
 * Loads environment variables and provides system constants and defaults.
 */
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev_super_secret_jwt_key_evidence_action_safe_water_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  
  // Database configuration
  databaseUrl: process.env.DATABASE_URL,
  pg: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'evidence_action',
  },

  // Domain Roles & Enums
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
  }
};

module.exports = config;
