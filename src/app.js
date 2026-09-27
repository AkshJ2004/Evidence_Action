
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const db = require('./db');

const authRoutes = require('./routes/auth.routes');
const visitRoutes = require('./routes/visits.routes');
const locationRoutes = require('./routes/locations.routes');
const summaryRoutes = require('./routes/summary.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// --- Security headers (helmet) ---
// Adds X-Frame-Options, X-Content-Type-Options, Referrer-Policy, etc.
// Content-Security-Policy is relaxed to allow the same-origin frontend to load.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  })
);

// --- CORS ---
// Locked to the origins that legitimately need to call this API.
// In production, replace the array with your actual deployed domain.
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server calls (no Origin header) and tools like Postman/supertest.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: Origin '${origin}' is not allowed.`), false);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/summary', summaryRoutes);

// --- Health check: actually verifies DB connectivity ---
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      status: 'healthy',
      service: 'Evidence Action - India Safe Water Program Operations Platform',
      database: 'reachable',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Return 503 so load balancers / monitoring can detect a dead DB.
    res.status(503).json({
      status: 'unhealthy',
      service: 'Evidence Action - India Safe Water Program Operations Platform',
      database: 'unreachable',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint '${req.originalUrl}' not found.` });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use(errorHandler);

module.exports = app;
