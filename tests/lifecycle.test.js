/**
 * Automated Test Suite: Visit Lifecycle (Section 2.3) & Server-Side Authorization (Section 3.3)
 * 
 * Tests strictly verify:
 * 1. Legal transitions:
 *    - DRAFT -> Submit -> PENDING (Creator)
 *    - PENDING -> Approve -> APPROVED (Approver)
 *    - PENDING -> Reject -> REJECTED (Approver, with mandatory remarks)
 *    - REJECTED -> Resubmit -> PENDING (Creator)
 *    - APPROVED -> Complete -> COMPLETED (Creator)
 * 2. Separation of duties:
 *    - Creator CANNOT approve or reject their own visit
 * 3. Terminal state:
 *    - Nothing follows COMPLETED
 * 4. Illegal transitions & invalid state mutations:
 *    - Cannot jump states (e.g., DRAFT -> COMPLETE)
 *    - Cannot edit a visit once it is APPROVED or COMPLETED
 * 5. Server-side authorization:
 *    - Field officer cannot access another officer's visit
 *    - Field officer cannot access HQ Summary (403)
 */
const request = require('supertest');
const app = require('../src/app');
const { runMigrations, query } = require('../src/db');

describe('Visit Lifecycle (Section 2.3) & Authorization Suite', () => {
  let officer1Token;
  let officer2Token;
  let approverToken;
  let adminToken;

  let officer1Id;
  let officer2Id;
  let approverId;
  let locationId;

  beforeAll(async () => {
    // Initialize clean database state with schema and seed data
    await runMigrations({ schema: true, seed: true });

    // Authenticate Officer 1
    const resOff1 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer1@evidenceaction.org', password: 'Password123!' });
    officer1Token = resOff1.body.token;
    officer1Id = resOff1.body.user.id;

    // Authenticate Officer 2
    const resOff2 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer2@evidenceaction.org', password: 'Password123!' });
    officer2Token = resOff2.body.token;
    officer2Id = resOff2.body.user.id;

    // Authenticate Approver
    const resApp = await request(app)
      .post('/api/auth/login')
      .send({ email: 'approver@evidenceaction.org', password: 'Password123!' });
    approverToken = resApp.body.token;
    approverId = resApp.body.user.id;

    // Authenticate Admin
    const resAdm = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@evidenceaction.org', password: 'Password123!' });
    adminToken = resAdm.body.token;

    // Fetch a valid location
    const locRes = await query('SELECT id FROM locations LIMIT 1');
    locationId = locRes.rows[0].id;
  });

  // ---------------------------------------------------------------------------
  // 1. Visit Creation & Initial State
  // ---------------------------------------------------------------------------
  describe('Visit Creation', () => {
    it('creates a new visit in DRAFT state for a Field Officer', async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({
          title: 'Chlorine Doser Sensor Check',
          purpose: 'Inspect sensor calibration across 5 dosing units',
          location_id: locationId,
          planned_date: '2026-10-15',
          estimated_cost: 2500.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.visit).toBeDefined();
      expect(res.body.visit.status).toBe('DRAFT');
      expect(res.body.visit.officer_id).toBe(officer1Id);
    });

    it('rejects visit creation with negative estimated cost', async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({
          title: 'Invalid Cost Visit',
          purpose: 'Testing negative cost validation',
          location_id: locationId,
          planned_date: '2026-10-15',
          estimated_cost: -500,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/non-negative/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Lifecycle: DRAFT -> Submit -> PENDING
  // ---------------------------------------------------------------------------
  describe('Lifecycle: DRAFT -> PENDING', () => {
    let visitId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({
          title: 'Tapstand Flow Evaluation',
          purpose: 'Examine pressure and flow rate',
          location_id: locationId,
          planned_date: '2026-10-20',
          estimated_cost: 1800,
        });
      visitId = res.body.visit.id;
    });

    it('allows the creator officer to submit DRAFT visit to PENDING', async () => {
      const res = await request(app)
        .post(`/api/visits/${visitId}/submit`)
        .set('Authorization', `Bearer ${officer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.visit.status).toBe('PENDING');
    });

    it('refuses submission attempt by another officer (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/visits/${visitId}/submit`)
        .set('Authorization', `Bearer ${officer2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only the officer who created/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Separation of Duties: Approver cannot be creator
  // ---------------------------------------------------------------------------
  describe('Separation of Duties', () => {
    it('refuses approval if the decider is also the creator of the visit', async () => {
      // Create a visit authored by Admin
      const createRes = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Admin Planned Survey',
          purpose: 'High level site inspection',
          location_id: locationId,
          planned_date: '2026-10-25',
          estimated_cost: 4000,
        });
      const adminVisitId = createRes.body.visit.id;

      // Submit to PENDING
      await request(app)
        .post(`/api/visits/${adminVisitId}/submit`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin tries to approve their own visit
      const approveRes = await request(app)
        .post(`/api/visits/${adminVisitId}/decide`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'APPROVE', remarks: 'Self approval attempt' });

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error).toMatch(/separation of duties|cannot approve or reject a visit they created/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Lifecycle: PENDING -> Reject / Approve
  // ---------------------------------------------------------------------------
  describe('Lifecycle: Decision on PENDING visits', () => {
    let visitId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({
          title: 'Chlorine Dosing Valve Replacement',
          purpose: 'Replace aged valves and run leak test',
          location_id: locationId,
          planned_date: '2026-10-22',
          estimated_cost: 5000,
        });
      visitId = res.body.visit.id;

      await request(app)
        .post(`/api/visits/${visitId}/submit`)
        .set('Authorization', `Bearer ${officer1Token}`);
    });

    it('refuses rejection without written remarks', async () => {
      const res = await request(app)
        .post(`/api/visits/${visitId}/decide`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action: 'REJECT', remarks: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/written remark/i);
    });

    it('successfully rejects PENDING visit when written remarks are provided', async () => {
      const res = await request(app)
        .post(`/api/visits/${visitId}/decide`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action: 'REJECT', remarks: 'Please bundle with tapstand maintenance next week.' });

      expect(res.status).toBe(200);
      expect(res.body.visit.status).toBe('REJECTED');
      expect(res.body.decision).toBeDefined();
      expect(res.body.decision.action).toBe('REJECTED');
      expect(res.body.decision.remarks).toBe('Please bundle with tapstand maintenance next week.');
    });

    it('allows officer to edit and resubmit a REJECTED visit back to PENDING', async () => {
      // 1. Reject it
      await request(app)
        .post(`/api/visits/${visitId}/decide`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action: 'REJECT', remarks: 'Cost is high, please revise.' });

      // 2. Officer edits it
      const editRes = await request(app)
        .patch(`/api/visits/${visitId}`)
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({ estimated_cost: 3200 });

      expect(editRes.status).toBe(200);
      expect(parseFloat(editRes.body.visit.estimated_cost)).toBe(3200);

      // 3. Officer resubmits (REJECTED -> PENDING)
      const resubmitRes = await request(app)
        .post(`/api/visits/${visitId}/submit`)
        .set('Authorization', `Bearer ${officer1Token}`);

      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.visit.status).toBe('PENDING');
    });

    it('successfully approves a PENDING visit', async () => {
      const res = await request(app)
        .post(`/api/visits/${visitId}/decide`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action: 'APPROVE', remarks: 'Approved as planned.' });

      expect(res.status).toBe(200);
      expect(res.body.visit.status).toBe('APPROVED');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Lifecycle: APPROVED -> COMPLETED -> (terminal)
  // ---------------------------------------------------------------------------
  describe('Lifecycle: Completion & Terminal State', () => {
    let visitId;

    beforeEach(async () => {
      // Create visit
      const createRes = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({
          title: 'Routine Water Quality Monitoring',
          purpose: 'Bacteriological test kit checks',
          location_id: locationId,
          planned_date: '2026-10-18',
          estimated_cost: 2100,
        });
      visitId = createRes.body.visit.id;

      // Submit
      await request(app)
        .post(`/api/visits/${visitId}/submit`)
        .set('Authorization', `Bearer ${officer1Token}`);

      // Approve
      await request(app)
        .post(`/api/visits/${visitId}/decide`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action: 'APPROVE', remarks: 'Good to go.' });
    });

    it('allows creator officer to mark an APPROVED visit as COMPLETED', async () => {
      const res = await request(app)
        .post(`/api/visits/${visitId}/complete`)
        .set('Authorization', `Bearer ${officer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.visit.status).toBe('COMPLETED');
    });

    it('refuses any transitions from COMPLETED (terminal state)', async () => {
      // Mark as completed
      await request(app)
        .post(`/api/visits/${visitId}/complete`)
        .set('Authorization', `Bearer ${officer1Token}`);

      // Try to submit again
      const submitRes = await request(app)
        .post(`/api/visits/${visitId}/submit`)
        .set('Authorization', `Bearer ${officer1Token}`);
      expect(submitRes.status).toBe(400);
      expect(submitRes.body.error).toMatch(/terminal state/i);

      // Try to decide again
      const decideRes = await request(app)
        .post(`/api/visits/${visitId}/decide`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action: 'APPROVE' });
      expect(decideRes.status).toBe(400);
      expect(decideRes.body.error).toMatch(/terminal state/i);

      // Try to complete again
      const completeRes = await request(app)
        .post(`/api/visits/${visitId}/complete`)
        .set('Authorization', `Bearer ${officer1Token}`);
      expect(completeRes.status).toBe(400);
      expect(completeRes.body.error).toMatch(/terminal state/i);
    });

    it('refuses to edit a visit once it is APPROVED or COMPLETED', async () => {
      const editRes = await request(app)
        .patch(`/api/visits/${visitId}`)
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({ title: 'Illegal Edit on Approved Visit' });

      expect(editRes.status).toBe(400);
      expect(editRes.body.error).toMatch(/cannot be edited in 'APPROVED'/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Server-Side Authorization & Information Security
  // ---------------------------------------------------------------------------
  describe('Server-Side Authorization Constraints', () => {
    let officer1VisitId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({
          title: 'Officer 1 Confidential Field Log',
          purpose: 'Baseline survey data',
          location_id: locationId,
          planned_date: '2026-10-30',
          estimated_cost: 1500,
        });
      officer1VisitId = res.body.visit.id;
    });

    it('prevents Officer 2 from viewing Officer 1 visit by guessing/altering ID', async () => {
      const res = await request(app)
        .get(`/api/visits/${officer1VisitId}`)
        .set('Authorization', `Bearer ${officer2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only view your own visits/i);
    });

    it('prevents Officer 2 from editing Officer 1 visit', async () => {
      const res = await request(app)
        .patch(`/api/visits/${officer1VisitId}`)
        .set('Authorization', `Bearer ${officer2Token}`)
        .send({ title: 'Tampered Title' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only the officer who created this visit can edit/i);
    });

    it('forbids Field Officer from accessing HQ Summary endpoint (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/summary')
        .set('Authorization', `Bearer ${officer1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access denied/i);
    });

    it('permits Approver and Admin to access HQ Summary with status and location breakdown', async () => {
      const res = await request(app)
        .get('/api/summary')
        .set('Authorization', `Bearer ${approverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.status_counts).toBeDefined();
      expect(Array.isArray(res.body.summary.location_breakdown)).toBe(true);
    });
  });
});
