const promClient = require('prom-client');

// Create a Registry which registers the metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

/**
 * HTTP Request Duration Histogram
 * Tracks latency of HTTP requests by method, route, and status code
 */
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30], // Buckets in seconds
  registers: [register]
});

/**
 * HTTP Request Counter
 * Tracks total number of HTTP requests
 */
const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

/**
 * Error Counter
 * Tracks total number of errors by type and route
 */
const errorCounter = new promClient.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'route', 'status_code'],
  registers: [register]
});

/**
 * AI Operation Duration Histogram
 * Tracks latency of AI operations (elaboration, image captioning)
 */
const aiOperationDuration = new promClient.Histogram({
  name: 'ai_operation_duration_seconds',
  help: 'Duration of AI operations in seconds',
  labelNames: ['operation', 'cached'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60], // AI operations can be slower
  registers: [register]
});

/**
 * Database Operation Duration Histogram
 * Tracks latency of database operations
 */
const dbOperationDuration = new promClient.Histogram({
  name: 'db_operation_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

/**
 * Active Connections Gauge
 * Tracks current number of active connections
 */
const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register]
});

/**
 * Rate Limit Counter
 * Tracks rate limit hits
 */
const rateLimitCounter = new promClient.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['type', 'identifier'],
  registers: [register]
});

/**
 * Record HTTP request metrics
 */
function recordHttpRequest(method, route, statusCode, durationSeconds) {
  httpRequestDuration.labels(method, route, statusCode).observe(durationSeconds);
  httpRequestCounter.labels(method, route, statusCode).inc();
}

/**
 * Record error metrics
 */
function recordError(type, route, statusCode = 500) {
  errorCounter.labels(type, route, statusCode).inc();
}

/**
 * Record AI operation metrics
 */
function recordAiOperation(operation, durationSeconds, cached = false) {
  aiOperationDuration.labels(operation, cached.toString()).observe(durationSeconds);
}

/**
 * Record database operation metrics
 */
function recordDbOperation(operation, model, durationSeconds) {
  dbOperationDuration.labels(operation, model).observe(durationSeconds);
}

/**
 * Record rate limit hit
 */
function recordRateLimitHit(type, identifier) {
  rateLimitCounter.labels(type, identifier).inc();
}

/**
 * Increment active connections
 */
function incrementActiveConnections() {
  activeConnections.inc();
}

/**
 * Decrement active connections
 */
function decrementActiveConnections() {
  activeConnections.dec();
}

/**
 * Get current metrics
 */
async function getMetrics() {
  return await register.metrics();
}

/**
 * Middleware to track HTTP request metrics
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();

  // Increment active connections
  incrementActiveConnections();

  // Store start time on request
  req._startTime = startTime;

  // Override res.end to capture metrics
  const originalEnd = res.end;
  res.end = function (...args) {
    // Calculate duration
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds

    // Get route pattern (or path if no route)
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Record metrics
    recordHttpRequest(method, route, statusCode, duration);

    // Record error if status code >= 400
    if (statusCode >= 400) {
      const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
      recordError(errorType, route, statusCode);
    }

    // Decrement active connections
    decrementActiveConnections();

    // Call original end
    originalEnd.apply(res, args);
  };

  next();
}

module.exports = {
  register,
  httpRequestDuration,
  httpRequestCounter,
  errorCounter,
  aiOperationDuration,
  dbOperationDuration,
  activeConnections,
  rateLimitCounter,
  recordHttpRequest,
  recordError,
  recordAiOperation,
  recordDbOperation,
  recordRateLimitHit,
  incrementActiveConnections,
  decrementActiveConnections,
  getMetrics,
  metricsMiddleware
};
