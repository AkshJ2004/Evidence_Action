
const express = require('express');
const db = require('../db');
const { roles, visitStatus, decisionAction } = require('../config');
const authenticate = require('../middleware/auth');
const { validateTransition, validateEditable } = require('../services/visitLifecycle');

const router = express.Router();

router.use(authenticate);

router.post('/', async (req, res, next) => {
  try {
    const { title, purpose, location_id, planned_date, estimated_cost } = req.body;

    if (req.user.role === roles.HQ_APPROVER) {
      return res.status(403).json({ error: 'HQ Approvers cannot create field visits. Only Field Officers or Admins may create visits.' });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Visit title is required.' });
    }
    if (!purpose || typeof purpose !== 'string' || purpose.trim().length === 0) {
      return res.status(400).json({ error: 'Visit purpose is required.' });
    }
    if (!location_id) {
      return res.status(400).json({ error: 'Location ID is required.' });
    }
    if (!planned_date || isNaN(Date.parse(planned_date))) {
      return res.status(400).json({ error: 'A valid planned date is required (YYYY-MM-DD).' });
    }
    const cost = parseFloat(estimated_cost);
    if (isNaN(cost) || cost < 0) {
      return res.status(400).json({ error: 'Estimated cost must be a non-negative number.' });
    }

    const locationCheck = await db.query('SELECT id, name FROM locations WHERE id = $1', [location_id]);
    if (locationCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Specified location does not exist.' });
    }

    const result = await db.query(
      `INSERT INTO visits (
        title, purpose, location_id, officer_id, planned_date, estimated_cost, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        title.trim(),
        purpose.trim(),
        location_id,
        req.user.id,
        planned_date,
        cost,
        visitStatus.DRAFT,
      ]
    );

    return res.status(201).json({
      message: 'Visit created successfully in DRAFT status.',
      visit: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, location_id, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = [];
    const queryParams = [];

    if (req.user.role === roles.FIELD_OFFICER) {
      
      queryParams.push(req.user.id);
      whereClauses.push(`v.officer_id = $${queryParams.length}`);
    } else if (req.user.role === roles.HQ_APPROVER) {
      
      queryParams.push(req.user.id);
      whereClauses.push(`(v.status != 'DRAFT' OR v.officer_id = $${queryParams.length})`);
    }
    
    if (status) {
      const upperStatus = status.toUpperCase();
      if (!Object.values(visitStatus).includes(upperStatus)) {
        return res.status(400).json({
          error: `Invalid status filter '${status}'. Allowed: ${Object.values(visitStatus).join(', ')}`,
        });
      }
      queryParams.push(upperStatus);
      whereClauses.push(`v.status = $${queryParams.length}`);
    }

    if (location_id) {
      queryParams.push(location_id);
      whereClauses.push(`v.location_id = $${queryParams.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM visits v ${whereSql}`;
    const countResult = await db.query(countSql, queryParams);
    const total = parseInt(countResult.rows[0].total, 10);

    queryParams.push(limitNum);
    const limitParamIdx = queryParams.length;
    queryParams.push(offset);
    const offsetParamIdx = queryParams.length;

    const dataSql = `
      SELECT 
        v.id,
        v.title,
        v.purpose,
        v.location_id,
        l.name AS location_name,
        l.district AS location_district,
        l.state AS location_state,
        v.officer_id,
        u.full_name AS officer_name,
        u.email AS officer_email,
        v.planned_date,
        v.estimated_cost,
        v.status,
        v.created_at,
        v.updated_at
      FROM visits v
      JOIN locations l ON v.location_id = l.id
      JOIN users u ON v.officer_id = u.id
      ${whereSql}
      ORDER BY v.planned_date DESC, v.created_at DESC
      LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
    `;

    const visitsResult = await db.query(dataSql, queryParams);

    return res.json({
      visits: visitsResult.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const visitResult = await db.query(
      `SELECT 
        v.id,
        v.title,
        v.purpose,
        v.location_id,
        l.name AS location_name,
        l.district AS location_district,
        l.state AS location_state,
        v.officer_id,
        u.full_name AS officer_name,
        u.email AS officer_email,
        v.planned_date,
        v.estimated_cost,
        v.status,
        v.created_at,
        v.updated_at
      FROM visits v
      JOIN locations l ON v.location_id = l.id
      JOIN users u ON v.officer_id = u.id
      WHERE v.id = $1`,
      [id]
    );

    if (visitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Visit not found.' });
    }

    const visit = visitResult.rows[0];

    if (req.user.role === roles.FIELD_OFFICER && visit.officer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You can only view your own visits.' });
    }

    if (
      req.user.role === roles.HQ_APPROVER &&
      visit.status === visitStatus.DRAFT &&
      visit.officer_id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Access denied: Approvers cannot view draft visits created by other officers.' });
    }

    const decisionsResult = await db.query(
      `SELECT 
        ad.id,
        ad.action,
        ad.remarks,
        ad.created_at,
        u.id AS decider_id,
        u.full_name AS decider_name,
        u.email AS decider_email,
        u.role AS decider_role
      FROM approval_decisions ad
      JOIN users u ON ad.decider_id = u.id
      WHERE ad.visit_id = $1
      ORDER BY ad.created_at ASC`,
      [id]
    );

    return res.json({
      visit: {
        ...visit,
        decisions: decisionsResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, purpose, location_id, planned_date, estimated_cost } = req.body;

    const visitResult = await db.query('SELECT * FROM visits WHERE id = $1', [id]);
    if (visitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Visit not found.' });
    }

    const visit = visitResult.rows[0];

    const editCheck = validateEditable(visit, req.user);
    if (!editCheck.allowed) {
      return res.status(editCheck.statusCode || 400).json({ error: editCheck.error });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty.' });
      }
      params.push(title.trim());
      updates.push(`title = $${params.length}`);
    }

    if (purpose !== undefined) {
      if (typeof purpose !== 'string' || purpose.trim().length === 0) {
        return res.status(400).json({ error: 'Purpose cannot be empty.' });
      }
      params.push(purpose.trim());
      updates.push(`purpose = $${params.length}`);
    }

    if (location_id !== undefined) {
      const locCheck = await db.query('SELECT id FROM locations WHERE id = $1', [location_id]);
      if (locCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Specified location does not exist.' });
      }
      params.push(location_id);
      updates.push(`location_id = $${params.length}`);
    }

    if (planned_date !== undefined) {
      if (isNaN(Date.parse(planned_date))) {
        return res.status(400).json({ error: 'Invalid planned date.' });
      }
      params.push(planned_date);
      updates.push(`planned_date = $${params.length}`);
    }

    if (estimated_cost !== undefined) {
      const cost = parseFloat(estimated_cost);
      if (isNaN(cost) || cost < 0) {
        return res.status(400).json({ error: 'Estimated cost must be a non-negative number.' });
      }
      params.push(cost);
      updates.push(`estimated_cost = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No editable fields provided for update.' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    params.push(id);
    const updateSql = `
      UPDATE visits
      SET ${updates.join(', ')}
      WHERE id = $${params.length}
      RETURNING *
    `;

    const updatedResult = await db.query(updateSql, params);

    return res.json({
      message: 'Visit updated successfully.',
      visit: updatedResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/submit', async (req, res, next) => {
  try {
    const { id } = req.params;

    const visitResult = await db.query('SELECT * FROM visits WHERE id = $1', [id]);
    if (visitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Visit not found.' });
    }

    const visit = visitResult.rows[0];

    const transitionCheck = validateTransition('SUBMIT', visit, req.user);
    if (!transitionCheck.allowed) {
      return res.status(transitionCheck.statusCode || 400).json({ error: transitionCheck.error });
    }

    const updatedResult = await db.query(
      `UPDATE visits 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [transitionCheck.nextStatus, id]
    );

    return res.json({
      message: `Visit successfully submitted for approval (status changed to ${transitionCheck.nextStatus}).`,
      visit: updatedResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/decide', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, remarks } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required. Must be APPROVE or REJECT (or APPROVED / REJECTED).' });
    }

    const normalizedAction = action.toUpperCase().replace(/D$/, ''); 
    const canonicalAction = normalizedAction === 'APPROVE' ? 'APPROVE' : (normalizedAction === 'REJECT' ? 'REJECT' : null);

    if (!canonicalAction) {
      return res.status(400).json({ error: "Invalid action. Must be 'APPROVE' or 'REJECT'." });
    }

    const visitResult = await db.query('SELECT * FROM visits WHERE id = $1', [id]);
    if (visitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Visit not found.' });
    }

    const visit = visitResult.rows[0];

    const transitionCheck = validateTransition(canonicalAction, visit, req.user, remarks);
    if (!transitionCheck.allowed) {
      return res.status(transitionCheck.statusCode || 400).json({ error: transitionCheck.error });
    }

    const nextStatus = transitionCheck.nextStatus; 
    const writtenRemarks = remarks && remarks.trim() ? remarks.trim() : null;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Guard against race conditions: two approvers clicking simultaneously.
      // The WHERE status = 'PENDING' clause means only the FIRST request wins —
      // the second will match zero rows (rowCount === 0) and be rejected with 409.
      const updateResult = await client.query(
        `UPDATE visits
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND status = 'PENDING'
         RETURNING *`,
        [nextStatus, id]
      );

      if (updateResult.rowCount === 0) {
        // Another request already processed this decision — the visit is no longer PENDING.
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'This visit has already been decided by another approver. Refresh and try again.',
        });
      }

      const decisionResult = await client.query(
        `INSERT INTO approval_decisions (visit_id, decider_id, action, remarks)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, req.user.id, nextStatus, writtenRemarks]
      );

      await client.query('COMMIT');

      return res.json({
        message: `Visit decision recorded: ${nextStatus}.`,
        visit: updateResult.rows[0],
        decision: decisionResult.rows[0],
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});


router.post('/:id/complete', async (req, res, next) => {

  try {
    const { id } = req.params;

    const visitResult = await db.query('SELECT * FROM visits WHERE id = $1', [id]);
    if (visitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Visit not found.' });
    }

    const visit = visitResult.rows[0];

    const transitionCheck = validateTransition('COMPLETE', visit, req.user);
    if (!transitionCheck.allowed) {
      return res.status(transitionCheck.statusCode || 400).json({ error: transitionCheck.error });
    }

    const updatedResult = await db.query(
      `UPDATE visits 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [transitionCheck.nextStatus, id]
    );

    return res.json({
      message: 'Visit successfully marked as COMPLETED.',
      visit: updatedResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
