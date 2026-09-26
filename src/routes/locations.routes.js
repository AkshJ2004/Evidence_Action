
const express = require('express');
const db = require('../db');
const authenticate = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, name, district, state, created_at FROM locations ORDER BY name ASC'
    );
    return res.json({ locations: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
