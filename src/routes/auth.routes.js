/**
 * Authentication Routes
 * 
 * Implements login and current user profile inspection.
 * Passwords are verified against bcrypt hashes and never logged or exposed.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const authenticate = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Accepts email and password, returns JWT token and user profile.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Both email and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Query user by email
    const result = await db.query(
      'SELECT id, email, password_hash, full_name, role FROM users WHERE LOWER(email) = $1',
      [trimmedEmail]
    );

    if (result.rows.length === 0) {
      // Use generic error message to prevent user enumeration
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    // Verify bcrypt password hash
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Sign JWT token with user id and role
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Returns profile of currently authenticated user.
 */
router.get('/me', authenticate, async (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
