
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
    
    await runMigrations({ schema: true, seed: true });

    const resOff1 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer1@evidenceaction.org', password: 'Password123!' });
    officer1Token = resOff1.body.token;
    officer1Id = resOff1.body.user.id;

    const resOff2 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer2@evidenceaction.org', password: 'Password123!' });
    officer2Token = resOff2.body.token;
    officer2Id = resOff2.body.user.id;

    const resApp = await request(app)
      .post('/api/auth/login')
      .send({ email: 'approver@evidenceaction.org', password: 'Password123!' });
    approverToken = resApp.body.token;
    approverId = resApp.body.user.id;

    const resAdm = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@evidenceaction.org', password: 'Password123!' });
    adminToken = resAdm.body.token;

    const locRes = await query('SELECT id FROM locations LIMIT 1');
    locationId = locRes.rows[0].id;
  });

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

  describe('Separation of Duties', () => {
    it('refuses approval if the decider is also the creator of the visit', async () => {
      
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

      await request(app)
        .post(`/api/visits/${adminVisitId}/submit`)
        .set('Authorization', `Bearer ${adminToken}`);

      const approveRes = await request(app)
        .post(`/api/visits/${adminVisitId}/decide`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'APPROVE', remarks: 'Self approval attempt' });

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error).toMatch(/separation of duties|cannot approve or reject a visit they created/i);
    });
  });

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
      
      await request(app)
        .post(`/api/visits/${visitId}/decide`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action: 'REJECT', remarks: 'Cost is high, please revise.' });

      const editRes = await request(app)
        .patch(`/api/visits/${visitId}`)
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({ estimated_cost: 3200 });

      expect(editRes.status).toBe(200);
      expect(parseFloat(editRes.body.visit.estimated_cost)).toBe(3200);

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

  describe('Lifecycle: Completion & Terminal State', () => {
    let visitId;

    beforeEach(async () => {
      
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

      await request(app)
        .post(`/api/visits/${visitId}/submit`)
        .set('Authorization', `Bearer ${officer1Token}`);

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
      
      await request(app)
        .post(`/api/visits/${visitId}/complete`)
        .set('Authorization', `Bearer ${officer1Token}`);

      const submitRes = await request(app)
        .post(`/api/visits/${visitId}/submit`)
        .set('Authorization', `Bearer ${officer1Token}`);
      expect(submitRes.status).toBe(400);
      expect(submitRes.body.error).toMatch(/terminal state/i);

      const decideRes = await request(app)
        .post(`/api/visits/${visitId}/decide`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action: 'APPROVE' });
      expect(decideRes.status).toBe(400);
      expect(decideRes.body.error).toMatch(/terminal state/i);

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

  afterAll(async () => {
    await runMigrations({ schema: true, seed: true });
  });
});
