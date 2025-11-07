const { generateRequestId, createRequestLogger } = require('../utils/logger');

/**
 * Middleware to add request ID and logger to each request
 */
function requestTrackingMiddleware(req, res, next) {
  // Generate and attach request ID
  req.id = generateRequestId();

  // Create request-scoped logger
  req.logger = createRequestLogger(req);

  // Log incoming request
  req.logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  // Add request ID to response header for tracing
  res.setHeader('X-Request-ID', req.id);

  next();
}

module.exports = { requestTrackingMiddleware };
