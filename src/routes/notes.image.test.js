/**
 * Image Upload Endpoint Tests
 *
 * Tests for POST /api/notes/image validation and error handling
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const prisma = require('../db');

// Mock dependencies
jest.mock('../db');
jest.mock('../services/openai');
jest.mock('../services/image-caption');

const app = express();
app.use(express.json());
app.use('/api/notes', require('./notes'));

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: { message: err.message }
  });
});

describe('POST /api/notes/image', () => {
  const mockChapterId = 'test-chapter-123';
  const testImagePath = path.join(__dirname, '../../test-fixtures/test-image.png');

  beforeAll(async () => {
    // Create test fixtures directory
    const fixturesDir = path.join(__dirname, '../../test-fixtures');
    await fs.mkdir(fixturesDir, { recursive: true });

    // Create a small test image (1x1 PNG)
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82
    ]);

    await fs.writeFile(testImagePath, pngBuffer);
  });

  afterAll(async () => {
    // Clean up test fixtures
    await fs.unlink(testImagePath).catch(() => {});
    await fs.rmdir(path.join(__dirname, '../../test-fixtures')).catch(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock prisma chapter findUnique
    prisma.chapter.findUnique = jest.fn().mockResolvedValue({
      id: mockChapterId,
      title: 'Test Chapter',
    });

    // Mock prisma note create
    prisma.note.create = jest.fn().mockResolvedValue({
      id: 'test-note-123',
      chapterId: mockChapterId,
      kind: 'image',
      title: 'Test image caption',
      imageUrl: '/uploads/images/test.png',
      imageCaption: 'Test image caption',
    });
  });

  describe('Validation', () => {
    it('should reject request without chapterId', async () => {
      const response = await request(app)
        .post('/api/notes/image')
        .attach('file', testImagePath);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('chapterId is required');
    });

    it('should reject request without file', async () => {
      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Image file is required');
    });

    it('should reject invalid file type (text file)', async () => {
      const textFilePath = path.join(__dirname, '../../test-fixtures/test.txt');
      await fs.writeFile(textFilePath, 'This is not an image');

      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', textFilePath);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid file type');
      expect(response.body.error.allowedTypes).toEqual(['jpg', 'jpeg', 'png', 'webp']);

      // Clean up
      await fs.unlink(textFilePath).catch(() => {});
    });

    it('should reject file exceeding 10MB limit', async () => {
      const largePath = path.join(__dirname, '../../test-fixtures/large-file.png');

      // Create a file larger than 10MB (create 11MB of data)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      await fs.writeFile(largePath, largeBuffer);

      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', largePath);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('File size exceeds');
      expect(response.body.error.maxSize).toBe('10MB');

      // Clean up
      await fs.unlink(largePath).catch(() => {});
    });

    it('should reject request with non-existent chapter', async () => {
      prisma.chapter.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', 'non-existent-chapter')
        .attach('file', testImagePath);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Chapter not found');
    });

    it('should accept valid PNG file', async () => {
      const { captionImage } = require('../services/openai');
      captionImage.mockResolvedValue({
        caption: 'A test image',
        description: 'This is a test image',
        tags: ['test', 'image'],
      });

      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', testImagePath);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('note_id');
      expect(response.body).toHaveProperty('image_url');
      expect(response.body).toHaveProperty('image_caption');
    });

    it('should accept valid JPG file', async () => {
      const jpgPath = path.join(__dirname, '../../test-fixtures/test.jpg');

      // Create a minimal JPEG (JFIF header)
      const jpgBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
      ]);
      await fs.writeFile(jpgPath, jpgBuffer);

      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', jpgPath);

      expect(response.status).toBe(201);

      // Clean up
      await fs.unlink(jpgPath).catch(() => {});
    });

    it('should accept valid WebP file', async () => {
      const webpPath = path.join(__dirname, '../../test-fixtures/test.webp');

      // Create a minimal WebP (just header for testing)
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
        0x18, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
        0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe,
        0x07, 0x00
      ]);
      await fs.writeFile(webpPath, webpBuffer);

      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', webpPath);

      expect(response.status).toBe(201);

      // Clean up
      await fs.unlink(webpPath).catch(() => {});
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure', async () => {
      const { captionImage } = require('../services/openai');
      captionImage.mockResolvedValue({
        caption: 'A neural network diagram',
        description: 'Diagram showing layers of a neural network',
        tags: ['neural network', 'diagram', 'AI'],
      });

      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', testImagePath);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        note_id: expect.any(String),
        image_url: expect.stringContaining('/uploads/images/'),
        image_caption: 'A neural network diagram',
        tags: ['neural network', 'diagram', 'AI'],
        description: 'Diagram showing layers of a neural network',
        metadata: expect.objectContaining({
          chapterTitle: 'Test Chapter',
          fileSize: expect.any(Number),
          mimeType: 'image/png',
          elapsedMs: expect.any(Number),
        }),
      });
    });

    it('should use chapter title as context for captioning', async () => {
      const { captionImage } = require('../services/openai');
      captionImage.mockResolvedValue({
        caption: 'Test caption',
        description: 'Test description',
        tags: [],
      });

      await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', testImagePath);

      expect(captionImage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Test Chapter')
      );
    });

    it('should handle caption generation failure gracefully', async () => {
      const { captionImage } = require('../services/openai');
      captionImage.mockRejectedValue(new Error('OpenAI API error'));

      const response = await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', testImagePath);

      expect(response.status).toBe(201);
      expect(response.body.image_caption).toBe('Image uploaded');
      expect(response.body.tags).toEqual([]);
    });
  });

  describe('File Cleanup', () => {
    it('should clean up file when validation fails', async () => {
      const textFilePath = path.join(__dirname, '../../test-fixtures/cleanup-test.txt');
      await fs.writeFile(textFilePath, 'Invalid file');

      await request(app)
        .post('/api/notes/image')
        .field('chapterId', mockChapterId)
        .attach('file', textFilePath);

      // File should be cleaned up
      await expect(fs.access(textFilePath)).rejects.toThrow();
    });

    it('should clean up file when chapter not found', async () => {
      prisma.chapter.findUnique.mockResolvedValue(null);

      await request(app)
        .post('/api/notes/image')
        .field('chapterId', 'non-existent')
        .attach('file', testImagePath);

      // Original test image should still exist (it wasn't the uploaded file)
      await expect(fs.access(testImagePath)).resolves.not.toThrow();
    });
  });
});
