/**
 * Centralized Error Handling Middleware
 *
 * Rule: Log the FULL technical error on the server (for developers to debug).
 *       Send only a safe, friendly message to the client (so users are not confused
 *       by stack traces, SQL errors, or internal system details).
 *
 * The client never learns:
 *   - Database query text or table names
 *   - Stack traces or file paths
 *   - Environment config or credentials
 *   - Which specific system component failed
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars

  // ─── 1. Log everything on the server so developers can investigate ────────
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error(' [Server Error] at:', new Date().toISOString());
  console.error(' Route:  ', req.method, req.originalUrl);
  console.error(' User:   ', req.user ? `${req.user.email} (${req.user.role})` : 'Unauthenticated');
  console.error(' Message:', err.message);
  console.error(' Code:   ', err.code || 'N/A');
  if (process.env.NODE_ENV !== 'production') {
    console.error(' Stack:', err.stack);
  }
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ─── 2. Map database constraint errors to friendly messages ───────────────

  // Duplicate unique value (e.g., trying to register same email twice)
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'This action could not be completed because a duplicate record already exists.',
      friendly: true,
    });
  }

  // Foreign key violation (e.g., referencing a deleted location)
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'This action could not be completed because it references data that no longer exists. Please refresh and try again.',
      friendly: true,
    });
  }

  // Check constraint violation (e.g., rejection without remarks, negative cost)
  if (err.code === '23514') {
    return res.status(400).json({
      error: 'The submitted data did not meet the required conditions. Please review your inputs and try again.',
      friendly: true,
    });
  }

  // ─── 3. Map HTTP status codes to friendly messages ────────────────────────

  const statusCode = err.statusCode || 500;

  // 4xx errors are caused by the client — their message is already user-friendly
  // (these are thrown intentionally in route handlers with clear messages)
  if (statusCode >= 400 && statusCode < 500) {
    return res.status(statusCode).json({
      error: err.message,
      friendly: true,
    });
  }

  // ─── 4. 500-level errors: server/infrastructure failure ───────────────────
  // Do NOT expose internal details. Show a generic, calm message.
  return res.status(500).json({
    error: 'Something went wrong on our end. The team has been notified. Please try again in a moment.',
    friendly: true,
    // Only in development mode, attach a hint — NEVER in production
    ...(process.env.NODE_ENV === 'development' && {
      dev_hint: 'Check server console for full error details. This message is only visible in development mode.',
    }),
  });
}

module.exports = errorHandler;

