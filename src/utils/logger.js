const winston = require('winston');
const crypto = require('crypto');

// Determine log level based on environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create winston logger with structured logging
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'notes-app' },
  transports: [
    // Console transport for all environments
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
          const reqId = requestId ? `[${requestId}] ` : '';
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level}: ${reqId}${message}${metaStr}`;
        })
      )
    }),
    // File transport for production
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    ] : [])
  ]
});

/**
 * Sanitize sensitive data for logging
 * - Never logs raw note bodies in production
 * - Logs content hashes instead
 * - Redacts PII
 */
function sanitizeForLogging(data, options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const sanitized = { ...data };

  // Hash note bodies in production
  if (sanitized.bodyMd !== undefined) {
    if (isProduction) {
      sanitized.bodyMd = `[HASH:${hashContent(sanitized.bodyMd)}]`;
    } else {
      // In dev, show truncated version
      sanitized.bodyMd = sanitized.bodyMd.length > 100
        ? `${sanitized.bodyMd.substring(0, 100)}... [${sanitized.bodyMd.length} chars]`
        : sanitized.bodyMd;
    }
  }

  // Hash image captions in production
  if (sanitized.imageCaption !== undefined && isProduction) {
    sanitized.imageCaption = `[HASH:${hashContent(sanitized.imageCaption)}]`;
  }

  // Redact API keys
  if (sanitized.apiKey) {
    sanitized.apiKey = '[REDACTED]';
  }

  // Redact authorization headers
  if (sanitized.authorization) {
    sanitized.authorization = '[REDACTED]';
  }

  return sanitized;
}

/**
 * Generate hash of content for logging
 */
function hashContent(content) {
  if (!content) return 'empty';
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Create child logger with request context
 */
function createRequestLogger(req) {
  const requestId = req.id || generateRequestId();
  req.id = requestId; // Store on request for later use

  return logger.child({
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress
  });
}

/**
 * Log request with sanitized data
 */
function logRequest(req, data = {}) {
  const reqLogger = req.logger || createRequestLogger(req);
  const sanitized = sanitizeForLogging(data);

  reqLogger.info('Request', {
    ...sanitized,
    userId: req.userId || req.body?.userId
  });
}

/**
 * Log response with sanitized data
 */
function logResponse(req, statusCode, data = {}) {
  const reqLogger = req.logger || createRequestLogger(req);
  const sanitized = sanitizeForLogging(data);

  reqLogger.info('Response', {
    statusCode,
    ...sanitized
  });
}

/**
 * Log error with full context
 */
function logError(req, error, context = {}) {
  const reqLogger = req.logger || createRequestLogger(req);
  const sanitized = sanitizeForLogging(context);

  reqLogger.error('Error occurred', {
    error: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    ...sanitized
  });
}

module.exports = {
  logger,
  sanitizeForLogging,
  hashContent,
  generateRequestId,
  createRequestLogger,
  logRequest,
  logResponse,
  logError
};
