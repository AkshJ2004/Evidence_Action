/**
 * Main Application Server Entrypoint
 */
const app = require('./app');
const config = require('./config');
const { getDb } = require('./db');

async function startServer() {
  try {
    // Ensure database connection is ready
    await getDb();

    app.listen(config.port, () => {
      console.log('================================================================');
      console.log(` Evidence Action - Operations Management Platform running`);
      console.log(` Local Server:   http://localhost:${config.port}`);
      console.log(` Environment:    ${config.nodeEnv}`);
      console.log('================================================================');
    });
  } catch (err) {
    console.error(' Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
