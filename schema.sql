-- ==============================================================================
-- Schema Definition: India Safe Water Program - Operations Management Platform
-- Database: PostgreSQL (compatible with standard PostgreSQL 13+)
-- ==============================================================================

-- Drop tables in reverse dependency order for clean migrations/resets
DROP TABLE IF EXISTS approval_decisions CASCADE;
DROP TABLE IF EXISTS visits CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- Stores system users across all roles: FIELD_OFFICER, HQ_APPROVER, ADMIN.
-- Passwords must NEVER be stored in plain text; store bcrypt password hashes.
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('FIELD_OFFICER', 'HQ_APPROVER', 'ADMIN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique index on email automatically created by UNIQUE constraint,
-- but explicitly documented for authentication lookups:
-- SELECT * FROM users WHERE email = $1;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ------------------------------------------------------------------------------
-- 2. LOCATIONS TABLE
-- Program locations/facilities visited by field officers.
-- ------------------------------------------------------------------------------
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    district VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 3. VISITS TABLE
-- Field visits planned by officers. Enforces visit lifecycle states:
-- DRAFT, PENDING, APPROVED, REJECTED, COMPLETED.
-- ------------------------------------------------------------------------------
CREATE TABLE visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    officer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    planned_date DATE NOT NULL,
    estimated_cost NUMERIC(12, 2) NOT NULL CHECK (estimated_cost >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for visits table:
-- 1. officer_id index: High-frequency filter for Field Officers who may only view their own visits.
CREATE INDEX idx_visits_officer_id ON visits(officer_id);

-- 2. status index: Filter for HQ Approvers (PENDING) and used in HQ status aggregation.
CREATE INDEX idx_visits_status ON visits(status);

-- 3. location_id index: Foreign key indexing for JOINs and HQ summary per-location breakdown.
CREATE INDEX idx_visits_location_id ON visits(location_id);

-- 4. planned_date index: Enables efficient chronological sorting for paginated visit lists.
CREATE INDEX idx_visits_planned_date ON visits(planned_date DESC);

-- Composite index for the most common query: an officer filtering visits by status
CREATE INDEX idx_visits_officer_status ON visits(officer_id, status);

-- ------------------------------------------------------------------------------
-- 4. APPROVAL_DECISIONS TABLE
-- Full audit trail of decisions made on visits.
-- Ensures that rejection always includes written remarks at the database level!
-- ------------------------------------------------------------------------------
CREATE TABLE approval_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    decider_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(20) NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Enforce requirement: A rejection must carry a written remark; an approval may.
    CONSTRAINT chk_decision_remarks CHECK (
        action != 'REJECTED' OR (remarks IS NOT NULL AND length(trim(remarks)) > 0)
    )
);

-- Index for retrieving full decision history of a visit in chronological order
CREATE INDEX idx_approval_decisions_visit_id ON approval_decisions(visit_id, created_at ASC);
