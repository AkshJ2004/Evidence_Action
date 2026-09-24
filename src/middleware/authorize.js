/**
 * Authorization Middleware
 * 
 * Requirement 3.3: Authorisation is enforced on the server.
 * Restricts access to endpoints based on user roles.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required prior to authorization.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}]. Your current role is: ${req.user.role}.`,
      });
    }

    next();
  };
}

module.exports = {
  requireRole,
};
