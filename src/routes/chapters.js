const express = require('express');
const router = express.Router();
const prisma = require('../db');

// POST /api/chapters - Create a new chapter
router.post('/', async (req, res, next) => {
  try {
    const { userId, title, description, position } = req.body;

    // Validation
    if (!userId || !title) {
      return res.status(400).json({
        error: { message: 'userId and title are required' }
      });
    }

    // If position not provided, get the next position
    let chapterPosition = position;
    if (chapterPosition === undefined) {
      const lastChapter = await prisma.chapter.findFirst({
        where: { userId },
        orderBy: { position: 'desc' },
      });
      chapterPosition = lastChapter ? lastChapter.position + 1 : 1;
    }

    const chapter = await prisma.chapter.create({
      data: {
        userId,
        title,
        description,
        position: chapterPosition,
      },
      include: {
        notes: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    res.status(201).json(chapter);
  } catch (error) {
    next(error);
  }
});

// GET /api/chapters - Get all chapters (optionally filtered by userId)
router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.query;

    const where = userId ? { userId } : {};

    const chapters = await prisma.chapter.findMany({
      where,
      include: {
        notes: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            kind: true,
            title: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { position: 'asc' },
    });

    res.json(chapters);
  } catch (error) {
    next(error);
  }
});

// GET /api/chapters/:id - Get a single chapter by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: {
        notes: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!chapter) {
      return res.status(404).json({
        error: { message: 'Chapter not found' }
      });
    }

    res.json(chapter);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/chapters/:id - Update a chapter
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, position } = req.body;

    // Check if chapter exists
    const existing = await prisma.chapter.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        error: { message: 'Chapter not found' }
      });
    }

    // Build update data
    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (position !== undefined) data.position = position;

    const chapter = await prisma.chapter.update({
      where: { id },
      data,
      include: {
        notes: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    res.json(chapter);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/chapters/:id - Delete a chapter (cascade deletes notes)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if chapter exists
    const existing = await prisma.chapter.findUnique({
      where: { id },
      include: {
        _count: {
          select: { notes: true },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({
        error: { message: 'Chapter not found' }
      });
    }

    // Delete chapter (will cascade delete all notes due to onDelete: Cascade)
    await prisma.chapter.delete({ where: { id } });

    res.json({
      message: 'Chapter deleted successfully',
      deletedNotesCount: existing._count.notes,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
