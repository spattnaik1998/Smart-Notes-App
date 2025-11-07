const express = require('express');
const router = express.Router();
const prisma = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { elaborateNote } = require('../services/elaborate');
const { generateImageCaption } = require('../services/image-caption');
const { buildQueries, rerankResults, elaborateNote: elaborateNoteOpenAI } = require('../services/openai');
const { searchWeb } = require('../services/serper');
const { generateHash, isCacheValid } = require('../utils/hash');
const { logRequest, logResponse, logError, hashContent } = require('../utils/logger');
const { recordAiOperation } = require('../utils/metrics');
const { aiOperationRateLimiter } = require('../middleware/rateLimiter');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads/images';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `image-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed.'));
    }
  }
});

// POST /api/notes - Create a new text note
router.post('/', async (req, res, next) => {
  try {
    const { chapterId, title, bodyMd } = req.body;

    // Validation
    if (!chapterId || !title) {
      return res.status(400).json({
        error: { message: 'chapterId and title are required' }
      });
    }

    // Verify chapter exists
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      return res.status(404).json({
        error: { message: 'Chapter not found' }
      });
    }

    const note = await prisma.note.create({
      data: {
        chapterId,
        kind: 'text',
        title,
        bodyMd: bodyMd || '',
      },
      include: {
        references: {
          orderBy: { rank: 'asc' },
        },
      },
    });

    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
});

// POST /api/notes/image - Upload an image and create an image note
router.post('/image', aiOperationRateLimiter, upload.single('file'), async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { chapterId } = req.body;

    console.log('[ImageUpload] Starting image upload...');

    // Log image upload request
    if (req.logger) {
      req.logger.info('[ImageUpload] Request received', {
        chapterId,
        hasFile: !!req.file
      });
    }

    // Step 1: Validate required fields
    if (!chapterId) {
      if (req.logger) {
        req.logger.warn('[ImageUpload] Missing chapterId');
      }
      return res.status(400).json({
        error: { message: 'chapterId is required' }
      });
    }

    if (!req.file) {
      if (req.logger) {
        req.logger.warn('[ImageUpload] Missing file');
      }
      return res.status(400).json({
        error: { message: 'Image file is required' }
      });
    }

    // Step 2: Additional file validation (redundant check for safety)
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(err =>
        console.warn('Failed to delete invalid file:', err.message)
      );

      return res.status(400).json({
        error: {
          message: 'Invalid file type. Only JPG, PNG, and WebP are allowed.',
          allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
          receivedType: req.file.mimetype,
        }
      });
    }

    // Check file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (req.file.size > maxSize) {
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(err =>
        console.warn('Failed to delete oversized file:', err.message)
      );

      return res.status(400).json({
        error: {
          message: 'File size exceeds maximum limit of 10MB',
          maxSize: '10MB',
          receivedSize: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`,
        }
      });
    }

    console.log(`[ImageUpload] File validated: ${req.file.filename} (${(req.file.size / 1024).toFixed(2)}KB)`);

    // Step 3: Verify chapter exists and get title for context
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, title: true }
    });

    if (!chapter) {
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(err =>
        console.warn('Failed to delete file after chapter not found:', err.message)
      );

      return res.status(404).json({
        error: { message: 'Chapter not found' }
      });
    }

    console.log(`[ImageUpload] Chapter found: "${chapter.title}"`);

    // Step 4: Generate public URL
    const imageUrl = `/uploads/images/${req.file.filename}`;
    const imagePath = req.file.path;

    // Step 5: Generate caption with chapter context using OpenAI Vision (P5)
    let captionData = {
      caption: 'Image uploaded',
      description: '',
      tags: [],
    };

    try {
      console.log(`[ImageUpload] Generating caption with context: "${chapter.title}"`);
      const { captionImage } = require('../services/openai');

      // Use chapter title as context for better captioning
      const context = `Image from chapter: "${chapter.title}"`;
      captionData = await captionImage(imagePath, context);

      console.log(`[ImageUpload] Caption generated: "${captionData.caption}"`);
      console.log(`[ImageUpload] Tags: ${captionData.tags.join(', ')}`);
    } catch (error) {
      console.error('[ImageUpload] Failed to generate caption:', error.message);
      // Continue with default caption
    }

    // Step 6: Create note with image data
    const note = await prisma.note.create({
      data: {
        chapterId,
        kind: 'image',
        title: captionData.caption.substring(0, 100), // Use caption as title
        imageUrl,
        imageCaption: captionData.caption,
        // Store full caption data including tags and description
        elaborationJson: JSON.stringify({
          caption: captionData.caption,
          description: captionData.description,
          tags: captionData.tags,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = elapsedTime / 1000;
    console.log(`[ImageUpload] ✅ Image note created in ${elapsedTime}ms (ID: ${note.id})`);

    // Record metrics
    recordAiOperation('image_caption', elapsedSeconds, false);

    // Log success
    if (req.logger) {
      req.logger.info('[ImageUpload] Image uploaded successfully', {
        noteId: note.id,
        chapterId,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        elapsedSeconds: elapsedSeconds.toFixed(3),
        captionHash: hashContent(captionData.caption)
      });
    }

    // Step 7: Return structured response
    res.status(201).json({
      note_id: note.id,
      image_url: imageUrl,
      image_caption: captionData.caption,
      tags: captionData.tags,
      description: captionData.description,
      metadata: {
        chapterTitle: chapter.title,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        elapsedMs: elapsedTime,
      },
    });

  } catch (error) {
    // Clean up file on error if it exists
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(err =>
        console.warn('Failed to delete file after error:', err.message)
      );
    }

    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = elapsedTime / 1000;
    console.error(`[ImageUpload] ❌ Failed after ${elapsedTime}ms:`, error.message);

    // Record failed AI operation
    recordAiOperation('image_caption_failed', elapsedSeconds, false);

    // Log error
    if (req.logger) {
      logError(req, error, {
        operation: 'image_upload',
        chapterId: req.body.chapterId,
        elapsedSeconds: elapsedSeconds.toFixed(3)
      });
    }

    next(error);
  }
});

// GET /api/notes - Get all notes (with optional chapter filter)
router.get('/', async (req, res, next) => {
  try {
    const { chapter_id, chapterId } = req.query;
    const targetChapterId = chapter_id || chapterId;

    const where = targetChapterId ? { chapterId: targetChapterId } : {};

    const notes = await prisma.note.findMany({
      where,
      include: {
        references: {
          orderBy: { rank: 'asc' },
        },
        chapter: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(notes);
  } catch (error) {
    next(error);
  }
});

// GET /api/notes/:id - Get a single note by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const note = await prisma.note.findUnique({
      where: { id },
      include: {
        references: {
          orderBy: { rank: 'asc' },
        },
        chapter: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!note) {
      return res.status(404).json({
        error: { message: 'Note not found' }
      });
    }

    res.json(note);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notes/:id - Update a note (partial update)
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, bodyMd, imageCaption } = req.body;

    // Check if note exists
    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        error: { message: 'Note not found' }
      });
    }

    // Build update data
    const data = {};
    if (title !== undefined) data.title = title;
    if (bodyMd !== undefined) data.bodyMd = bodyMd;
    if (imageCaption !== undefined) data.imageCaption = imageCaption;

    const note = await prisma.note.update({
      where: { id },
      data,
      include: {
        references: {
          orderBy: { rank: 'asc' },
        },
      },
    });

    res.json(note);
  } catch (error) {
    next(error);
  }
});

// PUT /api/notes/:id - Update a note (full update)
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, bodyMd, imageCaption } = req.body;

    // Check if note exists
    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        error: { message: 'Note not found' }
      });
    }

    // Validate required fields based on note type
    if (existing.kind === 'text' && !title) {
      return res.status(400).json({
        error: { message: 'Title is required for text notes' }
      });
    }

    // Build update data (full update)
    const data = {
      title: title || existing.title,
      bodyMd: bodyMd !== undefined ? bodyMd : existing.bodyMd,
      imageCaption: imageCaption !== undefined ? imageCaption : existing.imageCaption,
    };

    const note = await prisma.note.update({
      where: { id },
      data,
      include: {
        references: {
          orderBy: { rank: 'asc' },
        },
      },
    });

    res.json(note);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notes/:id - Delete a note
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if note exists
    const existing = await prisma.note.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        error: { message: 'Note not found' }
      });
    }

    // Delete associated image file if it's an image note
    if (existing.kind === 'image' && existing.imageUrl) {
      try {
        // Remove leading slash from imageUrl if present (e.g., /uploads/images/... -> uploads/images/...)
        const relativePath = existing.imageUrl.startsWith('/') ? existing.imageUrl.substring(1) : existing.imageUrl;
        const imagePath = path.join(process.cwd(), relativePath);
        await fs.unlink(imagePath);
        console.log(`Deleted image file: ${imagePath}`);
      } catch (error) {
        console.error('Failed to delete image file:', error);
        // Continue with note deletion even if file deletion fails
      }
    }

    // Delete note (will cascade delete references)
    await prisma.note.delete({ where: { id } });

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/notes/:id/elaborate - Generate AI elaboration with references
// Apply AI operation rate limiter to this endpoint
router.post('/:id/elaborate', aiOperationRateLimiter, async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;
    const { force = false } = req.body; // Force regeneration even if cached

    // Log request (body hash only in production)
    if (req.logger) {
      req.logger.info('[Elaborate] Request received', {
        noteId: id,
        force,
        bodyHash: hashContent(req.body?.bodyMd || '')
      });
    }

    // Step 1: Load note
    console.log(`[Elaborate] Loading note ${id}...`);
    const note = await prisma.note.findUnique({
      where: { id },
      include: {
        references: {
          orderBy: { rank: 'asc' },
        },
      },
    });

    if (!note) {
      if (req.logger) {
        req.logger.warn('[Elaborate] Note not found', { noteId: id });
      }
      return res.status(404).json({
        error: { message: 'Note not found' }
      });
    }

    // Step 2: Validate note is not empty
    if (!note.bodyMd || note.bodyMd.trim().length === 0) {
      if (req.logger) {
        req.logger.warn('[Elaborate] Empty note', { noteId: id });
      }
      return res.status(400).json({
        error: { message: 'Cannot elaborate on an empty note' }
      });
    }

    // Step 3: Check cache by content hash (24h TTL)
    const contentHash = generateHash(note.bodyMd);
    console.log(`[Elaborate] Content hash: ${contentHash.substring(0, 16)}...`);

    if (note.elaborationJson && !force) {
      try {
        const cached = JSON.parse(note.elaborationJson);

        // Check if cache is valid (content hash matches and within 24h)
        if (cached.contentHash === contentHash && isCacheValid(note.updatedAt, 24)) {
          const elapsedTime = (Date.now() - startTime) / 1000;
          console.log(`[Elaborate] Returning cached elaboration (age: ${Math.round((Date.now() - new Date(note.updatedAt)) / (1000 * 60 * 60))}h)`);

          // Record metrics for cached operation
          recordAiOperation('elaborate', elapsedTime, true);

          if (req.logger) {
            req.logger.info('[Elaborate] Returned cached result', {
              noteId: id,
              cached: true,
              elapsedSeconds: elapsedTime.toFixed(3),
              bodyHash: contentHash.substring(0, 16)
            });
          }

          return res.json({
            sections: cached.sections || [{ type: 'elaboration', content: cached.elaboratedContent }],
            references: note.references.map(ref => ({
              rank: ref.rank,
              title: ref.title,
              url: ref.url,
              snippet: ref.snippet,
            })),
            metadata: {
              cached: true,
              cacheAge: new Date(note.updatedAt).toISOString(),
              searchQuery: cached.searchQuery,
              tokens: cached.tokens || { total: 0 },
            },
          });
        } else {
          console.log(`[Elaborate] Cache invalid (hash mismatch or expired)`);
        }
      } catch (parseError) {
        console.warn(`[Elaborate] Failed to parse cached elaboration:`, parseError.message);
      }
    }

    // Step 4: Generate new elaboration
    console.log(`[Elaborate] Generating new elaboration...`);

    // Step 4a: Build search queries (P1)
    console.log(`[Elaborate] Building search queries...`);
    const { queries, keywords } = await buildQueries(note.bodyMd, 1);
    const searchQuery = queries[0] || keywords.join(' ');
    console.log(`[Elaborate] Search query: "${searchQuery}"`);

    // Step 4b: Search web with Serper (top 10)
    console.log(`[Elaborate] Searching web (top 10 results)...`);
    const searchResults = await searchWeb(searchQuery, 10, 'us');
    console.log(`[Elaborate] Found ${searchResults.length} search results`);

    if (searchResults.length === 0) {
      console.warn(`[Elaborate] No search results found`);

      // Generate elaboration without references
      const elaborationContent = await elaborateNoteOpenAI(note.bodyMd, []);

      const responseData = {
        contentHash,
        sections: [
          {
            type: 'elaboration',
            content: elaborationContent,
          },
        ],
        references: [],
        searchQuery,
        tokens: { total: 0 },
      };

      // Save to database
      await prisma.note.update({
        where: { id },
        data: {
          elaborationJson: JSON.stringify(responseData),
        },
      });

      const elapsedTime = Date.now() - startTime;
      console.log(`[Elaborate] Completed in ${elapsedTime}ms (no references)`);

      return res.json({
        sections: responseData.sections,
        references: [],
        metadata: {
          cached: false,
          searchQuery,
          tokens: responseData.tokens,
          elapsedMs: elapsedTime,
        },
      });
    }

    // Step 4c: Re-rank results (P2) - select top 3-6
    console.log(`[Elaborate] Re-ranking results (selecting 3-6 best)...`);
    const reranked = await rerankResults(note.bodyMd, searchResults, 6);
    const selectedIndices = reranked.rankedIndices.slice(0, 6); // Max 6
    const topSources = selectedIndices.map(idx => searchResults[idx]);

    console.log(`[Elaborate] Selected ${topSources.length} top sources`);
    topSources.forEach((source, idx) => {
      console.log(`  [${idx + 1}] ${source.title.substring(0, 60)}...`);
    });

    // Step 4d: Generate elaboration with citations (P3)
    console.log(`[Elaborate] Generating elaboration with inline citations...`);
    const elaborationContent = await elaborateNoteOpenAI(note.bodyMd, topSources);

    // Step 5: Structure response
    const sections = [
      {
        type: 'summary',
        content: note.bodyMd.substring(0, 200),
      },
      {
        type: 'elaboration',
        content: elaborationContent,
      },
    ];

    const references = topSources.map((source, idx) => ({
      rank: idx + 1,
      title: source.title,
      url: source.url,
      snippet: source.snippet || '',
    }));

    // Estimate token count (rough approximation: 1 token ≈ 4 chars)
    const totalChars = note.bodyMd.length + elaborationContent.length + JSON.stringify(topSources).length;
    const estimatedTokens = Math.ceil(totalChars / 4);

    const responseData = {
      contentHash,
      sections,
      references,
      searchQuery,
      tokens: {
        total: estimatedTokens,
        input: Math.ceil((note.bodyMd.length + JSON.stringify(topSources).length) / 4),
        output: Math.ceil(elaborationContent.length / 4),
      },
    };

    // Step 6: Persist to database
    console.log(`[Elaborate] Persisting elaboration to database...`);

    // Delete old references
    await prisma.reference.deleteMany({
      where: { noteId: id },
    });

    // Create new references
    if (references.length > 0) {
      await prisma.reference.createMany({
        data: references.map(ref => ({
          noteId: id,
          rank: ref.rank,
          title: ref.title,
          url: ref.url,
          snippet: ref.snippet,
        })),
      });
    }

    // Update note with elaboration JSON
    await prisma.note.update({
      where: { id },
      data: {
        elaborationJson: JSON.stringify(responseData),
      },
    });

    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = elapsedTime / 1000;
    console.log(`[Elaborate] ✅ Completed in ${elapsedTime}ms`);

    // Record metrics for fresh elaboration
    recordAiOperation('elaborate', elapsedSeconds, false);

    // Log success
    if (req.logger) {
      req.logger.info('[Elaborate] Generated fresh elaboration', {
        noteId: id,
        cached: false,
        elapsedSeconds: elapsedSeconds.toFixed(3),
        sourcesUsed: topSources.length,
        bodyHash: contentHash.substring(0, 16),
        tokens: responseData.tokens.total
      });
    }

    // Step 7: Return response
    res.json({
      sections,
      references,
      metadata: {
        cached: false,
        searchQuery,
        tokens: responseData.tokens,
        elapsedMs: elapsedTime,
        sourcesFound: searchResults.length,
        sourcesUsed: topSources.length,
      },
    });

  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = elapsedTime / 1000;
    console.error(`[Elaborate] ❌ Failed after ${elapsedTime}ms:`, error.message);

    // Record failed AI operation metrics
    recordAiOperation('elaborate_failed', elapsedSeconds, false);

    // Log error with context
    if (req.logger) {
      logError(req, error, {
        noteId: req.params.id,
        operation: 'elaborate',
        elapsedSeconds: elapsedSeconds.toFixed(3)
      });
    }

    next(error);
  }
});

module.exports = router;
