require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const app = express();

// Import utilities and middleware
const { logger, logError } = require('./utils/logger');
const { metricsMiddleware, getMetrics } = require('./utils/metrics');
const { requestTrackingMiddleware } = require('./middleware/requestTracking');
const { ipRateLimiter, userRateLimiter } = require('./middleware/rateLimiter');

// Security - Helmet middleware for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now (configure based on your needs)
  crossOriginEmbedderPolicy: false
}));

// CORS configuration with APP_BASE_URL
const allowedOrigins = [
  process.env.APP_BASE_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request tracking middleware (adds request ID and logger)
app.use(requestTrackingMiddleware);

// Metrics middleware (tracks latency and requests)
app.use(metricsMiddleware);

// IP-based rate limiting for all routes
app.use(ipRateLimiter);

// Static files for frontend (HTML, CSS, JS)
app.use(express.static('public'));

// Static files for uploaded images
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Metrics endpoint (Prometheus format)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', 'text/plain');
    res.send(await getMetrics());
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to retrieve metrics' } });
  }
});

// API Routes with user-based rate limiting
app.use('/api/chapters', userRateLimiter, require('./routes/chapters'));
app.use('/api/notes', userRateLimiter, require('./routes/notes'));

// 404 handler
app.use((req, res) => {
  if (req.logger) {
    req.logger.warn('Route not found', { path: req.path });
  }
  res.status(404).json({ error: { message: 'Route not found' } });
});

// Error handler with structured logging
app.use((err, req, res, next) => {
  // Log error with request context
  if (req.logger) {
    logError(req, err, {
      path: req.path,
      method: req.method,
      body: req.body
    });
  } else {
    logger.error('Unhandled error', {
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }

  // Respond with error
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      requestId: req.id,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    corsOrigins: allowedOrigins
  });
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
});
