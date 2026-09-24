/**
 * HQ Summary Routes
 * 
 * Section 3.2: Counts of visits by status, and a per-location breakdown with total planned cost.
 * Restricted to HQ Approvers and Admins.
 */
const express = require('express');
const db = require('../db');
const { roles, visitStatus } = require('../config');
const authenticate = require('../middleware/auth');
const { requireRole } = require('../middleware/authorize');

const router = express.Router();

router.use(authenticate);
router.use(requireRole(roles.HQ_APPROVER, roles.ADMIN));

/**
 * GET /api/summary
 * Returns HQ operational overview:
 * 1. Global counts of visits grouped by status
 * 2. Per-location breakdown showing total visits and total planned cost
 */
router.get('/', async (req, res, next) => {
  try {
    // 1. Overall counts by status
    const statusCountsResult = await db.query(`
      SELECT 
        status, 
        COUNT(*)::int AS count,
        COALESCE(SUM(estimated_cost), 0)::numeric(12,2) AS total_cost
      FROM visits
      GROUP BY status
    `);

    // Ensure all defined statuses exist in output map even if count is 0
    const countsByStatus = {};
    for (const st of Object.values(visitStatus)) {
      countsByStatus[st] = { count: 0, total_cost: 0 };
    }

    let globalTotalVisits = 0;
    let globalTotalCost = 0;

    for (const row of statusCountsResult.rows) {
      const count = parseInt(row.count, 10);
      const cost = parseFloat(row.total_cost);
      countsByStatus[row.status] = { count, total_cost: cost };
      globalTotalVisits += count;
      globalTotalCost += cost;
    }

    // 2. Per-location breakdown with total planned cost and counts
    const locationBreakdownResult = await db.query(`
      SELECT 
        l.id AS location_id,
        l.name AS location_name,
        l.district,
        l.state,
        COUNT(v.id)::int AS total_visits,
        COALESCE(SUM(v.estimated_cost), 0)::numeric(12,2) AS total_planned_cost,
        COUNT(CASE WHEN v.status = 'PENDING' THEN 1 END)::int AS pending_visits,
        COUNT(CASE WHEN v.status = 'APPROVED' THEN 1 END)::int AS approved_visits,
        COUNT(CASE WHEN v.status = 'COMPLETED' THEN 1 END)::int AS completed_visits,
        COUNT(CASE WHEN v.status = 'REJECTED' THEN 1 END)::int AS rejected_visits,
        COUNT(CASE WHEN v.status = 'DRAFT' THEN 1 END)::int AS draft_visits
      FROM locations l
      LEFT JOIN visits v ON l.id = v.location_id
      GROUP BY l.id, l.name, l.district, l.state
      ORDER BY total_planned_cost DESC, l.name ASC
    `);

    return res.json({
      summary: {
        total_visits: globalTotalVisits,
        total_planned_cost: globalTotalCost,
        status_counts: countsByStatus,
        location_breakdown: locationBreakdownResult.rows.map(loc => ({
          ...loc,
          total_planned_cost: parseFloat(loc.total_planned_cost),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
