
DROP TABLE IF EXISTS approval_decisions CASCADE;
DROP TABLE IF EXISTS visits CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('FIELD_OFFICER', 'HQ_APPROVER', 'ADMIN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    district VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE INDEX idx_visits_officer_id ON visits(officer_id);

CREATE INDEX idx_visits_status ON visits(status);

CREATE INDEX idx_visits_location_id ON visits(location_id);

CREATE INDEX idx_visits_planned_date ON visits(planned_date DESC);

CREATE INDEX idx_visits_officer_status ON visits(officer_id, status);

CREATE TABLE approval_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    decider_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(20) NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_decision_remarks CHECK (
        action != 'REJECTED' OR (remarks IS NOT NULL AND length(trim(remarks)) > 0)
    )
);

CREATE INDEX idx_approval_decisions_visit_id ON approval_decisions(visit_id, created_at ASC);
