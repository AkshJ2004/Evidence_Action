
function errorHandler(err, req, res, next) { 

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

  if (err.code === '23505') {
    return res.status(409).json({
      error: 'This action could not be completed because a duplicate record already exists.',
      friendly: true,
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      error: 'This action could not be completed because it references data that no longer exists. Please refresh and try again.',
      friendly: true,
    });
  }

  if (err.code === '23514') {
    return res.status(400).json({
      error: 'The submitted data did not meet the required conditions. Please review your inputs and try again.',
      friendly: true,
    });
  }

  const statusCode = err.statusCode || 500;

  if (statusCode >= 400 && statusCode < 500) {
    return res.status(statusCode).json({
      error: err.message,
      friendly: true,
    });
  }

  return res.status(500).json({
    error: 'Something went wrong on our end. The team has been notified. Please try again in a moment.',
    friendly: true,
    
    ...(process.env.NODE_ENV === 'development' && {
      dev_hint: 'Check server console for full error details. This message is only visible in development mode.',
    }),
  });
}

module.exports = errorHandler;
