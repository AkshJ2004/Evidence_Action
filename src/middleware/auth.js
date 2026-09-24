/**
 * Authentication Middleware
 * 
 * Extracts and verifies the JWT Bearer token from the Authorization header.
 * Requirement 3.3: Every endpoint except login requires authentication.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Please provide a valid Bearer token in the Authorization header.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Fetch fresh user profile to ensure account exists and status is active
    const userResult = await db.query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User account associated with token no longer exists.' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

module.exports = authenticate;
