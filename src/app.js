
const express = require('express');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const visitRoutes = require('./routes/visits.routes');
const locationRoutes = require('./routes/locations.routes');
const summaryRoutes = require('./routes/summary.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/summary', summaryRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Evidence Action - India Safe Water Program Operations Platform',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint '${req.originalUrl}' not found.` });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use(errorHandler);

module.exports = app;
