/**
 * Centralized Error Handling Middleware
 * 
 * Ensures all unhandled errors return standardized JSON responses.
 * Never leaks database connection passwords, credentials, or internal stack traces to clients.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(' [Server Error]:', err.message);

  // PostgreSQL check constraint or foreign key constraint violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with that unique value already exists.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced entity does not exist or cannot be removed due to foreign key constraints.' });
  }
  if (err.code === '23514') {
    return res.status(400).json({ error: 'Data violates database validation constraints (e.g., negative cost or empty rejection remark).' });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'An internal server error occurred.' : err.message;

  return res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { details: err.message }),
  });
}

module.exports = errorHandler;
