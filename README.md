# 📝 Gen-AI Notes App

> An intelligent note-taking application powered by AI that transforms your notes into comprehensive learning resources with automatic elaboration, image captioning, and web-sourced references.

![Node.js](https://img.shields.io/badge/Node.js-v16+-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

---

## ✨ Features

### 🤖 AI-Powered Intelligence
- **Smart Elaboration**: Automatically generates detailed explanations with inline citations from credible web sources
- **Image Captioning**: AI-generated captions, descriptions, and tags using OpenAI Vision
- **Intelligent Caching**: 24-hour content-based caching for lightning-fast responses
- **Source Ranking**: Automatically ranks and selects the most credible references (prefers .edu domains)

### 📚 Core Functionality
- **Markdown Support**: Write notes in Markdown with live preview
- **Chapter Organization**: Organize notes into topics/courses
- **Dual Note Types**: Text notes and image notes with AI analysis
- **Auto-Save**: Three-way autosave (1.5s debounce, blur event, Ctrl/Cmd+S)
- **Offline Support**: Queues changes when offline and syncs automatically

### 🔒 Enterprise-Grade Security
- **CORS Protection**: Configurable allowed origins
- **Security Headers**: Helmet middleware (XSS, CSP, etc.)
- **Rate Limiting**: Multi-tier (IP, User, AI operations)
- **Request Tracking**: Unique IDs with X-Request-ID headers
- **Production-Safe Logging**: Sensitive data hashed, never logged raw

### 📊 Monitoring & Observability
- **Structured Logging**: Winston with JSON output and request context
- **Prometheus Metrics**: HTTP latency histograms, error counters, AI operation tracking
- **Health Checks**: `/health` endpoint with environment info
- **Real-Time Metrics**: `/metrics` endpoint for monitoring dashboards

---

## 🚀 Quick Start

### Prerequisites
- Node.js v16+ ([Download](https://nodejs.org/))
- npm (comes with Node.js)
- OpenAI API Key ([Get one here](https://platform.openai.com/api-keys))
- Serper API Key ([Get one here](https://serper.dev/api-key))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/notes-app.git
cd notes-app

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your API keys

# 4. Setup database
npm run db:generate
npm run db:migrate

# 5. Create required directories
mkdir uploads\images
mkdir logs

# 6. Start the application
npm run dev
```

### Access the App
Open your browser to **http://localhost:3000**

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL="file:./dev.db"

# AI Services
OPENAI_API_KEY="sk-..."
SERPER_API_KEY="..."

# Server
PORT=3000
NODE_ENV=development

# CORS (comma-separated origins for production)
APP_BASE_URL="http://localhost:3000"

# Logging
LOG_LEVEL="debug"  # debug | info | warn | error
```

### Rate Limits

Configure in `src/middleware/rateLimiter.js`:

| Type | Default Limit | Window |
|------|--------------|--------|
| IP-based | 100 requests | 15 min |
| User-based | 200 requests | 15 min |
| AI Operations | 30 requests | 15 min |

---

## 📖 Usage Guide

### Creating Notes

1. **Create a Chapter**
   - Click "+ New Chapter" in the sidebar
   - Enter a title and optional description
   - Chapter appears in the navigation

2. **Create a Text Note**
   - Hover over a chapter → Click "+ Note"
   - Choose "OK" for text note
   - Write in Markdown format
   - Auto-saves as you type

3. **Create an Image Note**
   - Hover over a chapter → Click "+ Note"
   - Choose "Cancel" for image note
   - Upload JPG/PNG/WebP (max 10MB)
   - AI generates caption and tags automatically

### AI Elaboration

1. Click the 💬 icon next to any text note
2. Wait 10-30 seconds for AI to:
   - Build optimized search queries
   - Fetch top web sources
   - Rank by credibility
   - Generate detailed elaboration with citations
3. View inline citations [1], [2], [3]
4. Click references to visit sources
5. Cached results load instantly (<1 second)

### Auto-Save

Your notes save automatically:
- **1.5 seconds** after you stop typing
- **Immediately** when you click away (blur)
- **Instantly** when you press Ctrl+S (Windows/Linux) or Cmd+S (Mac)

Watch the status indicator:
- 💾 **Saving...** (blue) - Save in progress
- ✓ **Saved** (green) - Successfully saved
- ● **Unsaved** (gray) - Changes pending
- ⚠️ **Offline** (yellow) - No connection
- ✗ **Error** (red) - Save failed

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express.js |
| **Database** | SQLite with Prisma ORM |
| **Frontend** | Vanilla JavaScript, Tailwind CSS |
| **AI/ML** | OpenAI GPT-4o, GPT-4o-mini |
| **Search** | Serper API |
| **Security** | Helmet, CORS, express-rate-limit |
| **Logging** | Winston (structured JSON) |
| **Metrics** | Prometheus (prom-client) |

### Project Structure

```
Notes_App/
├── src/
│   ├── server.js                # Express server + middleware
│   ├── db.js                    # Prisma client
│   ├── routes/
│   │   ├── chapters.js          # Chapter CRUD
│   │   ├── notes.js             # Notes + AI operations
│   │   └── notes.image.test.js  # Image upload tests
│   ├── services/
│   │   ├── openai.js            # OpenAI integration
│   │   ├── serper.js            # Web search
│   │   ├── elaborate.js         # Elaboration pipeline
│   │   └── image-caption.js     # Image AI
│   ├── middleware/
│   │   ├── rateLimiter.js       # Rate limiting
│   │   └── requestTracking.js   # Request IDs
│   └── utils/
│       ├── logger.js            # Winston logging
│       ├── metrics.js           # Prometheus metrics
│       └── hash.js              # Content hashing
├── public/
│   ├── index.html               # Frontend UI
│   └── app.js                   # Client-side logic
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── seed.js                  # Demo data
├── uploads/                     # Image storage
├── logs/                        # Production logs
└── .env                         # Configuration
```

---

## 🔐 Security Features

### Data Protection
- **PII Redaction**: Automatically redacts emails, phone numbers, SSNs, credit cards before sending to AI
- **Production Logging**: Note bodies logged as SHA-256 hashes only
- **API Key Security**: Never logged or exposed in responses
- **Content Hashing**: Cache invalidation based on content changes

### Request Security
- **CORS**: Whitelist-based origin validation
- **Helmet**: Comprehensive security headers
- **Rate Limiting**: Prevents abuse and DDoS
- **Request IDs**: Full traceability with X-Request-ID headers

### Input Validation
- File type validation (MIME + extension)
- File size limits (10MB for images)
- Required field validation
- SQL injection prevention (Prisma ORM)

---

## 📊 Monitoring

### Prometheus Metrics

Visit `http://localhost:3000/metrics` to view:

```
http_request_duration_seconds      # Request latency histogram
http_requests_total                # Total request counter
errors_total                       # Error counter by type
ai_operation_duration_seconds      # AI operation latency
rate_limit_hits_total              # Rate limit violations
active_connections                 # Current connections
```

### Structured Logs

All logs include:
- **timestamp**: ISO format
- **level**: debug, info, warn, error
- **requestId**: Unique per request
- **context**: Method, path, IP, userId
- **sanitized data**: Hashed in production

Example log:
```json
{
  "timestamp": "2025-11-06 23:28:46",
  "level": "info",
  "message": "[Elaborate] Generated fresh elaboration",
  "requestId": "ae33c548691e98a9",
  "noteId": "clxyz123",
  "bodyHash": "7f9a3c2e1d4b5a6f",
  "elapsedSeconds": "12.345",
  "service": "notes-app"
}
```

---

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Manual Testing

```bash
# Health check
curl http://localhost:3000/health

# List chapters
curl http://localhost:3000/api/chapters

# Create note
curl -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"chapterId":"...", "title":"Test", "bodyMd":"# Test"}'

# Test rate limiting (send 101 requests)
for i in {1..101}; do curl http://localhost:3000/health; done
```

---

## 📚 API Documentation

### Chapters

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chapters` | Create chapter |
| GET | `/api/chapters` | List all chapters |
| GET | `/api/chapters/:id` | Get single chapter |
| PATCH | `/api/chapters/:id` | Update chapter |
| DELETE | `/api/chapters/:id` | Delete chapter |

### Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/notes` | Create text note |
| POST | `/api/notes/image` | Upload image note |
| GET | `/api/notes` | List all notes |
| GET | `/api/notes/:id` | Get single note |
| PATCH | `/api/notes/:id` | Partial update |
| PUT | `/api/notes/:id` | Full update (autosave) |
| DELETE | `/api/notes/:id` | Delete note |
| POST | `/api/notes/:id/elaborate` | Generate AI elaboration |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |

---

## 🚢 Deployment

### Production Build

```bash
# Set environment
export NODE_ENV=production

# Install production dependencies only
npm install --production

# Run migrations
npm run db:migrate

# Start with PM2 (recommended)
pm2 start src/server.js --name notes-app

# Or with npm
npm start
```

### Production Considerations

1. **Environment Variables**
   - Set `NODE_ENV=production`
   - Configure `APP_BASE_URL` to your domain
   - Use strong `DATABASE_URL` (consider PostgreSQL)

2. **Logging**
   - Logs written to `logs/error.log` and `logs/combined.log`
   - Set up log rotation (e.g., winston-daily-rotate-file)

3. **Monitoring**
   - Configure Prometheus scraping of `/metrics`
   - Set up Grafana dashboards
   - Configure alerting for errors and rate limits

4. **Security**
   - Enable HTTPS (use reverse proxy like Nginx)
   - Set strict CORS origins
   - Review and adjust rate limits
   - Enable firewall rules

5. **Database**
   - Consider PostgreSQL for production scale
   - Set up automated backups
   - Configure connection pooling

---

## 🛠️ Development

### Database Management

```bash
# Open Prisma Studio (visual editor)
npm run db:studio

# Reset database (WARNING: deletes all data)
npm run db:reset

# Create new migration
npx prisma migrate dev --name migration_name

# Seed database
npm run db:seed
```

### Adding New Features

1. **Backend Route**: Add to `src/routes/`
2. **Frontend Logic**: Update `public/app.js`
3. **Database Schema**: Modify `prisma/schema.prisma` and migrate
4. **Logging**: Use `req.logger` for structured logs
5. **Metrics**: Use `recordMetric()` functions
6. **Tests**: Add tests to `src/routes/*.test.js`

### Code Style

- Use async/await for asynchronous operations
- Always use structured logging (never `console.log` in production)
- Sanitize data before logging (use `sanitizeForLogging()`)
- Add request IDs to all log messages
- Record metrics for new endpoints

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Port already in use | Change `PORT` in `.env` or kill process on port 3000 |
| Database locked | Close Prisma Studio or other DB connections |
| Images not loading | Verify `uploads/images/` directory exists |
| Elaboration fails | Check `OPENAI_API_KEY` and `SERPER_API_KEY` in `.env` |
| CORS errors | Add origin to `APP_BASE_URL` or check CORS config |
| Rate limit hit | Wait 15 minutes or restart server to reset |
| Logs not appearing | Create `logs/` directory for production mode |

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Check server logs
tail -f logs/combined.log

# Check error logs
tail -f logs/error.log
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
