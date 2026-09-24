/**
 * Express Application Configuration
 * 
 * Configures Express middleware, security, static file serving, and API route mounts.
 */
const express = require('express');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const visitRoutes = require('./routes/visits.routes');
const locationRoutes = require('./routes/locations.routes');
const summaryRoutes = require('./routes/summary.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets from public/ directory
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/summary', summaryRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Evidence Action - India Safe Water Program Operations Platform',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint '${req.originalUrl}' not found.` });
});

// Fallback to index.html for frontend single-page navigation
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
