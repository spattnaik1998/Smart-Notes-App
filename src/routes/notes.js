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
router.post('/image', upload.single('file'), async (req, res, next) => {
  try {
    const { chapterId } = req.body;

    // Validation
    if (!chapterId) {
      return res.status(400).json({
        error: { message: 'chapterId is required' }
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: { message: 'Image file is required' }
      });
    }

    // Verify chapter exists
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      return res.status(404).json({
        error: { message: 'Chapter not found' }
      });
    }

    // Generate image URL
    const imageUrl = `/uploads/images/${req.file.filename}`;
    const imagePath = req.file.path;

    // Generate caption using OpenAI Vision
    let imageCaption = 'Image uploaded';
    try {
      imageCaption = await generateImageCaption(imagePath);
    } catch (error) {
      console.error('Failed to generate image caption:', error);
      // Continue with default caption
    }

    // Create note
    const note = await prisma.note.create({
      data: {
        chapterId,
        kind: 'image',
        title: imageCaption.substring(0, 100), // Use caption as title
        imageUrl,
        imageCaption,
      },
    });

    res.status(201).json(note);
  } catch (error) {
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

// PATCH /api/notes/:id - Update a note
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
        const imagePath = path.join(process.cwd(), existing.imageUrl);
        await fs.unlink(imagePath);
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
router.post('/:id/elaborate', async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;
    const { force = false } = req.body; // Force regeneration even if cached

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
      return res.status(404).json({
        error: { message: 'Note not found' }
      });
    }

    // Step 2: Validate note is not empty
    if (!note.bodyMd || note.bodyMd.trim().length === 0) {
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
          console.log(`[Elaborate] Returning cached elaboration (age: ${Math.round((Date.now() - new Date(note.updatedAt)) / (1000 * 60 * 60))}h)`);

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
    console.log(`[Elaborate] ✅ Completed in ${elapsedTime}ms`);

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
    console.error(`[Elaborate] ❌ Failed after ${elapsedTime}ms:`, error.message);
    next(error);
  }
});

module.exports = router;
