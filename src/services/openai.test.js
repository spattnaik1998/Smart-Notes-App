const OpenAI = require('openai');
const fs = require('fs').promises;
const {
  summarizeNote,
  buildQueries,
  rerankResults,
  elaborateNote,
  formatReferences,
  captionImage,
  redactPII,
} = require('./openai');

// Mock OpenAI
jest.mock('openai');

// Mock fs
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

describe('OpenAI Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ============================================================================
  // P6: PII Redaction Tests
  // ============================================================================

  describe('redactPII', () => {
    it('should redact email addresses', () => {
      const text = 'Contact me at john.doe@example.com or support@company.org';
      const redacted = redactPII(text);
      expect(redacted).toBe('Contact me at [EMAIL_REDACTED] or [EMAIL_REDACTED]');
    });

    it('should redact phone numbers (various formats)', () => {
      const text = 'Call 555-123-4567 or (555) 987-6543 or 555.111.2222';
      const redacted = redactPII(text);
      expect(redacted).toContain('[PHONE_REDACTED]');
      expect(redacted).not.toContain('555-123-4567');
    });

    it('should redact SSN', () => {
      const text = 'SSN: 123-45-6789';
      const redacted = redactPII(text);
      expect(redacted).toBe('SSN: [SSN_REDACTED]');
    });

    it('should redact credit card numbers', () => {
      const text = 'Card: 4111 1111 1111 1111 or 5500-0000-0000-0004';
      const redacted = redactPII(text);
      expect(redacted).toContain('[CARD_REDACTED]');
      expect(redacted).not.toContain('4111');
    });

    it('should redact IP addresses', () => {
      const text = 'Server at 192.168.1.1 or 10.0.0.255';
      const redacted = redactPII(text);
      expect(redacted).toBe('Server at [IP_REDACTED] or [IP_REDACTED]');
    });

    it('should redact API keys', () => {
      const text = 'Key: sk-proj1234567890abcdefghijklmnop';
      const redacted = redactPII(text);
      expect(redacted).toContain('[API_KEY_REDACTED]');
    });

    it('should handle empty or non-string input', () => {
      expect(redactPII('')).toBe('');
      expect(redactPII(null)).toBe(null);
      expect(redactPII(undefined)).toBe(undefined);
    });

    it('should not modify text without PII', () => {
      const text = 'This is a clean note about machine learning';
      const redacted = redactPII(text);
      expect(redacted).toBe(text);
    });
  });

  // ============================================================================
  // P0: Summarize Note Tests
  // ============================================================================

  describe('summarizeNote', () => {
    let mockCreate;

    beforeEach(() => {
      mockCreate = jest.fn();
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));
    });

    it('should generate a summary with key points', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Neural networks are computing systems inspired by biological brains.',
                keyPoints: ['Inspired by biology', 'Process information through layers', 'Used in deep learning'],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await summarizeNote('Neural networks are computing systems...');

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('keyPoints');
      expect(result.summary).toBe('Neural networks are computing systems inspired by biological brains.');
      expect(result.keyPoints).toHaveLength(3);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0.3,
        })
      );
    });

    it('should handle custom maxLength parameter', async () => {
      const mockResponse = {
        choices: [{ message: { content: JSON.stringify({ summary: 'Short', keyPoints: [] }) } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      await summarizeNote('Test content', 100);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('100 characters'),
            }),
          ]),
        })
      );
    });

    it('should throw error when API key is missing', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(summarizeNote('test')).rejects.toThrow('OPENAI_API_KEY is not set');
    });

    it('should throw error for empty content', async () => {
      await expect(summarizeNote('')).rejects.toThrow('Note content must be a non-empty string');
    });

    it('should handle 401 authentication error', async () => {
      mockCreate.mockRejectedValue({ status: 401, message: 'Unauthorized' });

      await expect(summarizeNote('test')).rejects.toThrow('OpenAI API authentication failed');
    });

    it('should handle 429 rate limit error', async () => {
      mockCreate.mockRejectedValue({ status: 429, message: 'Rate limit' });

      await expect(summarizeNote('test')).rejects.toThrow('OpenAI API rate limit exceeded');
    });
  });

  // ============================================================================
  // P1: Build Queries Tests
  // ============================================================================

  describe('buildQueries', () => {
    let mockCreate;

    beforeEach(() => {
      mockCreate = jest.fn();
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));
    });

    it('should generate search queries and keywords', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                queries: ['neural networks deep learning', 'machine learning basics', 'AI fundamentals'],
                keywords: ['neural', 'networks', 'AI', 'machine learning', 'deep learning'],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await buildQueries('Neural networks overview');

      expect(result).toHaveProperty('queries');
      expect(result).toHaveProperty('keywords');
      expect(result.queries).toHaveLength(3);
      expect(result.keywords.length).toBeGreaterThan(0);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
          temperature: 0.4,
        })
      );
    });

    it('should use custom numQueries parameter', async () => {
      const mockResponse = {
        choices: [{ message: { content: JSON.stringify({ queries: [], keywords: [] }) } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      await buildQueries('test', 5);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('5 optimized search queries'),
            }),
          ]),
        })
      );
    });

    it('should throw error for missing API key', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(buildQueries('test')).rejects.toThrow('OPENAI_API_KEY is not set');
    });
  });

  // ============================================================================
  // P2: Re-rank Results Tests
  // ============================================================================

  describe('rerankResults', () => {
    let mockCreate;

    beforeEach(() => {
      mockCreate = jest.fn();
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));
    });

    const sampleResults = [
      { title: 'Result 1', url: 'https://example1.com', snippet: 'Snippet 1' },
      { title: 'Result 2', url: 'https://example2.com', snippet: 'Snippet 2' },
      { title: 'Result 3', url: 'https://example3.com', snippet: 'Snippet 3' },
    ];

    it('should re-rank search results', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                rankedIndices: [1, 0, 2],
                reasoning: 'Ranked by relevance and credibility',
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await rerankResults('test content', sampleResults, 3);

      expect(result).toHaveProperty('rankedIndices');
      expect(result).toHaveProperty('reasoning');
      expect(result.rankedIndices).toEqual([1, 0, 2]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
          temperature: 0.2,
        })
      );
    });

    it('should handle empty results array', async () => {
      const result = await rerankResults('test', [], 5);

      expect(result.rankedIndices).toEqual([]);
      expect(result.reasoning).toBe('No results to rank');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should limit results to topN', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                rankedIndices: [0, 1, 2, 3, 4, 5],
                reasoning: 'All ranked',
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await rerankResults('test', sampleResults, 2);

      expect(result.rankedIndices.length).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================================
  // P3: Elaborate Note Tests
  // ============================================================================

  describe('elaborateNote', () => {
    let mockCreate;

    beforeEach(() => {
      mockCreate = jest.fn();
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));
    });

    const sampleSources = [
      { title: 'Source 1', url: 'https://example1.com', snippet: 'Info about topic' },
      { title: 'Source 2', url: 'https://example2.com', snippet: 'More details' },
    ];

    it('should generate elaboration with citations', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '# Elaboration\n\nNeural networks are powerful [1]. They use layers [2].',
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await elaborateNote('Neural networks overview', sampleSources);

      expect(typeof result).toBe('string');
      expect(result).toContain('[1]');
      expect(result).toContain('[2]');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.7,
        })
      );
    });

    it('should work without sources', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Elaboration without citations.' } }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await elaborateNote('Test content');

      expect(typeof result).toBe('string');
      expect(result).toBe('Elaboration without citations.');
    });

    it('should throw error for missing API key', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(elaborateNote('test')).rejects.toThrow('OPENAI_API_KEY is not set');
    });
  });

  // ============================================================================
  // P4: Format References Tests
  // ============================================================================

  describe('formatReferences', () => {
    const sampleReferences = [
      {
        rank: 1,
        title: 'Neural Networks Explained',
        url: 'https://example.com/nn',
        snippet: 'A guide to neural networks',
      },
      {
        rank: 2,
        title: 'Deep Learning Basics',
        url: 'https://example.com/dl',
        snippet: 'Introduction to deep learning',
      },
    ];

    it('should format references in numbered style', () => {
      const result = formatReferences(sampleReferences, 'numbered');

      expect(result).toContain('[1] Neural Networks Explained');
      expect(result).toContain('https://example.com/nn');
      expect(result).toContain('A guide to neural networks');
      expect(result).toContain('[2] Deep Learning Basics');
    });

    it('should format references in APA style', () => {
      const result = formatReferences(sampleReferences, 'apa');

      expect(result).toContain('Neural Networks Explained. Retrieved from https://example.com/nn');
      expect(result).toContain('Deep Learning Basics. Retrieved from https://example.com/dl');
    });

    it('should format references in MLA style', () => {
      const result = formatReferences(sampleReferences, 'mla');

      expect(result).toContain('"Neural Networks Explained." Web. <https://example.com/nn>');
      expect(result).toContain('"Deep Learning Basics." Web. <https://example.com/dl>');
    });

    it('should handle empty references', () => {
      const result = formatReferences([]);
      expect(result).toBe('No references available.');
    });

    it('should default to numbered style for invalid style', () => {
      const result = formatReferences(sampleReferences, 'invalid');
      expect(result).toContain('[1]');
    });
  });

  // ============================================================================
  // P5: Caption Image Tests
  // ============================================================================

  describe('captionImage', () => {
    let mockCreate;

    beforeEach(() => {
      mockCreate = jest.fn();
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      // Mock fs.readFile
      fs.readFile.mockResolvedValue(Buffer.from('fake-image-data'));
    });

    it('should generate image caption with JSON mode', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                caption: 'A diagram showing neural network architecture',
                description: 'Detailed description of the neural network diagram',
                tags: ['neural network', 'diagram', 'AI'],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await captionImage('/path/to/image.jpg');

      expect(result).toHaveProperty('caption');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('tags');
      expect(result.tags).toBeInstanceOf(Array);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
        })
      );

      expect(fs.readFile).toHaveBeenCalledWith('/path/to/image.jpg');
    });

    it('should handle different image formats', async () => {
      const mockResponse = {
        choices: [{ message: { content: JSON.stringify({ caption: '', description: '', tags: [] }) } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      await captionImage('/path/to/image.png');
      await captionImage('/path/to/image.webp');

      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should include context when provided', async () => {
      const mockResponse = {
        choices: [{ message: { content: JSON.stringify({ caption: '', description: '', tags: [] }) } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      await captionImage('/path/to/image.jpg', 'Machine learning diagram');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining('Machine learning diagram'),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it('should throw error when image file not found', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(captionImage('/nonexistent.jpg')).rejects.toThrow('Image file not found');
    });

    it('should throw error for missing API key', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(captionImage('/path/to/image.jpg')).rejects.toThrow('OPENAI_API_KEY is not set');
    });

    it('should throw error for empty path', async () => {
      await expect(captionImage('')).rejects.toThrow('Image path must be a non-empty string');
    });
  });
});
