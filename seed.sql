-- ==============================================================================
-- Seed Data: India Safe Water Program - Operations Management Platform
-- Seeded accounts with password: Password123!
-- ==============================================================================

-- Clear existing data if resetting
DELETE FROM approval_decisions;
DELETE FROM visits;
DELETE FROM locations;
DELETE FROM users;

-- ------------------------------------------------------------------------------
-- 1. SEED USERS
-- Password for all accounts: Password123!
-- Bcrypt Hash ($2b$10$LCIlobuWArQWYqum0aSax.PM14MVpWGS0104mjXO8989.T6ryRtXe)
-- ------------------------------------------------------------------------------
INSERT INTO users (id, email, password_hash, full_name, role) VALUES
(
    '11111111-1111-1111-1111-111111111111',
    'officer1@evidenceaction.org',
    '$2b$10$LCIlobuWArQWYqum0aSax.PM14MVpWGS0104mjXO8989.T6ryRtXe',
    'Aarav Sharma',
    'FIELD_OFFICER'
),
(
    '22222222-2222-2222-2222-222222222222',
    'officer2@evidenceaction.org',
    '$2b$10$LCIlobuWArQWYqum0aSax.PM14MVpWGS0104mjXO8989.T6ryRtXe',
    'Priya Patel',
    'FIELD_OFFICER'
),
(
    '33333333-3333-3333-3333-333333333333',
    'approver@evidenceaction.org',
    '$2b$10$LCIlobuWArQWYqum0aSax.PM14MVpWGS0104mjXO8989.T6ryRtXe',
    'Sunil Kumar',
    'HQ_APPROVER'
),
(
    '44444444-4444-4444-4444-444444444444',
    'admin@evidenceaction.org',
    '$2b$10$LCIlobuWArQWYqum0aSax.PM14MVpWGS0104mjXO8989.T6ryRtXe',
    'Deepa Menon',
    'ADMIN'
);

-- ------------------------------------------------------------------------------
-- 2. SEED LOCATIONS
-- ------------------------------------------------------------------------------
INSERT INTO locations (id, name, district, state) VALUES
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Gaya Community Water Purification Station',
    'Gaya',
    'Bihar'
),
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Nalgonda Safe Water Remediation Unit',
    'Nalgonda',
    'Telangana'
),
(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Balasore Rural Water Quality Lab',
    'Balasore',
    'Odisha'
);

-- ------------------------------------------------------------------------------
-- 3. SEED VISITS IN DIFFERENT STATES
-- States represented: DRAFT, PENDING, APPROVED, REJECTED, COMPLETED
-- ------------------------------------------------------------------------------

-- Visit 1: DRAFT (Officer 1)
INSERT INTO visits (id, title, purpose, location_id, officer_id, planned_date, estimated_cost, status, created_at, updated_at) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'Routine Water Quality Assessment & Free Chlorine Testing',
    'Measure residual free chlorine levels across 12 tapstands and test turbidity.',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    CURRENT_DATE + INTERVAL '5 days',
    3500.00,
    'DRAFT',
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
);

-- Visit 2: PENDING (Officer 1 - submitted for approval)
INSERT INTO visits (id, title, purpose, location_id, officer_id, planned_date, estimated_cost, status, created_at, updated_at) VALUES
(
    '00000000-0000-0000-0000-000000000002',
    'Disinfection Unit Sensor Calibration & Maintenance',
    'Perform periodic sensor check and replace worn gaskets on chemical dosing pump.',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    CURRENT_DATE + INTERVAL '7 days',
    8200.00,
    'PENDING',
    CURRENT_TIMESTAMP - INTERVAL '3 days',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
);

-- Visit 3: APPROVED (Officer 1 - approved by Sunil Kumar)
INSERT INTO visits (id, title, purpose, location_id, officer_id, planned_date, estimated_cost, status, created_at, updated_at) VALUES
(
    '00000000-0000-0000-0000-000000000003',
    'Quarterly Community Dispenser Audit & Refill Inspection',
    'Inspect chlorine dispenser hardware, restock inventory, and meet Village Water Committee.',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    CURRENT_DATE + INTERVAL '2 days',
    5400.00,
    'APPROVED',
    CURRENT_TIMESTAMP - INTERVAL '5 days',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
);

-- Approval Decision Record for Visit 3
INSERT INTO approval_decisions (id, visit_id, decider_id, action, remarks, created_at) VALUES
(
    'd0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    '33333333-3333-3333-3333-333333333333',
    'APPROVED',
    'Quarterly inspection approved. Ensure committee meeting minutes are recorded.',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
);

-- Visit 4: REJECTED (Officer 2 - rejected by Sunil Kumar with required remarks)
INSERT INTO visits (id, title, purpose, location_id, officer_id, planned_date, estimated_cost, status, created_at, updated_at) VALUES
(
    '00000000-0000-0000-0000-000000000004',
    'Emergency Hydro-geological Borewell Diagnostic Survey',
    'Comprehensive multi-point geophysical resistivity survey for new deep borewell site.',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '22222222-2222-2222-2222-222222222222',
    CURRENT_DATE + INTERVAL '10 days',
    42000.00,
    'REJECTED',
    CURRENT_TIMESTAMP - INTERVAL '4 days',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
);

-- Decision Record for Visit 4 (Rejection requires remarks)
INSERT INTO approval_decisions (id, visit_id, decider_id, action, remarks, created_at) VALUES
(
    'd0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000004',
    '33333333-3333-3333-3333-333333333333',
    'REJECTED',
    'Budget exceeds standard single-visit threshold. Please provide comparative vendor estimates and split survey into two phases before resubmitting.',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
);

-- Visit 5: COMPLETED (Officer 2 - previously approved, completed after visit)
INSERT INTO visits (id, title, purpose, location_id, officer_id, planned_date, estimated_cost, status, created_at, updated_at) VALUES
(
    '00000000-0000-0000-0000-000000000005',
    'Chlorine Dosing Baseline Water Quality Validation',
    'Baseline water testing post monsoon and dispenser calibration verification.',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    CURRENT_DATE - INTERVAL '3 days',
    6100.00,
    'COMPLETED',
    CURRENT_TIMESTAMP - INTERVAL '8 days',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
);

-- Approval Decision Record for Visit 5
INSERT INTO approval_decisions (id, visit_id, decider_id, action, remarks, created_at) VALUES
(
    'd0000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000005',
    '33333333-3333-3333-3333-333333333333',
    'APPROVED',
    'Approved as per monsoon response plan.',
    CURRENT_TIMESTAMP - INTERVAL '5 days'
);
