const rateLimit = require('express-rate-limit');
const { recordRateLimitHit } = require('../utils/metrics');
const { logger } = require('../utils/logger');

/**
 * IP-based rate limiter for general API endpoints
 * Limits requests per IP address
 */
const ipRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    }
  },
  handler: (req, res, next, options) => {
    // Record rate limit hit
    const ip = req.ip || req.connection.remoteAddress;
    recordRateLimitHit('ip', ip);

    // Log rate limit hit
    if (req.logger) {
      req.logger.warn('Rate limit exceeded', {
        type: 'ip',
        identifier: ip,
        path: req.path
      });
    } else {
      logger.warn('Rate limit exceeded', {
        type: 'ip',
        identifier: ip,
        path: req.path
      });
    }

    res.status(429).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiting for health check
    return req.path === '/health' || req.path === '/metrics';
  }
});

/**
 * User-based rate limiter for authenticated endpoints
 * Limits requests per user ID
 */
const userRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each user to 200 requests per windowMs (more generous than IP)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use userId from body or query, fallback to IP
    return req.body?.userId || req.query?.userId || req.ip || req.connection.remoteAddress;
  },
  message: {
    error: {
      message: 'Too many requests from this user, please try again later.',
      retryAfter: '15 minutes'
    }
  },
  handler: (req, res, next, options) => {
    // Record rate limit hit
    const userId = req.body?.userId || req.query?.userId || 'unknown';
    recordRateLimitHit('user', userId);

    // Log rate limit hit
    if (req.logger) {
      req.logger.warn('Rate limit exceeded', {
        type: 'user',
        identifier: userId,
        path: req.path
      });
    } else {
      logger.warn('Rate limit exceeded', {
        type: 'user',
        identifier: userId,
        path: req.path
      });
    }

    res.status(429).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiting for health check and metrics
    return req.path === '/health' || req.path === '/metrics';
  }
});

/**
 * Strict rate limiter for AI operations (more restrictive)
 */
const aiOperationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit AI operations to 30 per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Combine user ID and IP for AI operations
    const userId = req.body?.userId || req.query?.userId || 'anonymous';
    const ip = req.ip || req.connection.remoteAddress;
    return `${userId}:${ip}`;
  },
  message: {
    error: {
      message: 'Too many AI operations requested, please try again later.',
      retryAfter: '15 minutes'
    }
  },
  handler: (req, res, next, options) => {
    // Record rate limit hit
    const userId = req.body?.userId || req.query?.userId || 'anonymous';
    recordRateLimitHit('ai_operation', userId);

    // Log rate limit hit
    if (req.logger) {
      req.logger.warn('AI operation rate limit exceeded', {
        type: 'ai_operation',
        identifier: userId,
        path: req.path
      });
    } else {
      logger.warn('AI operation rate limit exceeded', {
        type: 'ai_operation',
        identifier: userId,
        path: req.path
      });
    }

    res.status(429).json(options.message);
  }
});

module.exports = {
  ipRateLimiter,
  userRateLimiter,
  aiOperationRateLimiter
};
