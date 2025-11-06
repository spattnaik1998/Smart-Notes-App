const express = require('express');
const router = express.Router();
const prisma = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { elaborateNote } = require('../services/elaborate');
const { generateImageCaption } = require('../services/image-caption');

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
  try {
    const { id } = req.params;
    const { force = false } = req.body; // Force regeneration even if cached

    // Get the note
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

    // Check if note is empty
    if (!note.bodyMd || note.bodyMd.trim().length === 0) {
      return res.status(400).json({
        error: { message: 'Cannot elaborate on an empty note' }
      });
    }

    // Return cached elaboration if available and not forcing regeneration
    if (note.elaborationJson && !force) {
      return res.json({
        ...JSON.parse(note.elaborationJson),
        cached: true,
      });
    }

    // Generate elaboration
    const elaboration = await elaborateNote(note);

    // Save elaboration to database
    const updatedNote = await prisma.note.update({
      where: { id },
      data: {
        elaborationJson: JSON.stringify(elaboration),
      },
    });

    // Save references
    if (elaboration.references && elaboration.references.length > 0) {
      // Delete old references
      await prisma.reference.deleteMany({
        where: { noteId: id },
      });

      // Create new references
      await prisma.reference.createMany({
        data: elaboration.references.map((ref, index) => ({
          noteId: id,
          rank: index + 1,
          title: ref.title,
          url: ref.url,
          snippet: ref.snippet || '',
        })),
      });
    }

    res.json({
      ...elaboration,
      cached: false,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
