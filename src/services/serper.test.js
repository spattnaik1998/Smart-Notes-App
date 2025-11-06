const axios = require('axios');
const { searchWeb } = require('./serper');

// Mock axios
jest.mock('axios');

describe('Serper Service - searchWeb', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Reset environment
    process.env = { ...originalEnv };
    process.env.SERPER_API_KEY = 'test-api-key-12345';
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Successful searches', () => {
    it('should return normalized results for a successful search', async () => {
      const mockResponse = {
        data: {
          organic: [
            {
              title: 'Neural Networks Explained',
              link: 'https://example.com/neural-networks',
              snippet: 'A comprehensive guide to neural networks',
            },
            {
              title: 'Deep Learning Tutorial',
              link: 'https://example.com/deep-learning',
              snippet: 'Learn about deep learning and AI',
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const results = await searchWeb('neural networks', 10, 'us');

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: 'Neural Networks Explained',
        url: 'https://example.com/neural-networks',
        snippet: 'A comprehensive guide to neural networks',
        source: 'serper',
      });
      expect(results[0]).toHaveProperty('retrieved_at');
      expect(new Date(results[0].retrieved_at)).toBeInstanceOf(Date);

      // Verify axios was called correctly
      expect(axios.post).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        {
          q: 'neural networks',
          num: 10,
          gl: 'us',
        },
        expect.objectContaining({
          headers: {
            'X-API-KEY': 'test-api-key-12345',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should use default parameters when not provided', async () => {
      const mockResponse = {
        data: {
          organic: [
            {
              title: 'Test Result',
              link: 'https://example.com',
              snippet: 'Test snippet',
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await searchWeb('test query');

      expect(axios.post).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        {
          q: 'test query',
          num: 10,
          gl: 'us',
        },
        expect.any(Object)
      );
    });

    it('should handle custom num and gl parameters', async () => {
      const mockResponse = {
        data: { organic: [] },
      };

      axios.post.mockResolvedValue(mockResponse);

      await searchWeb('test', 5, 'uk');

      expect(axios.post).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        {
          q: 'test',
          num: 5,
          gl: 'uk',
        },
        expect.any(Object)
      );
    });

    it('should trim whitespace from query', async () => {
      const mockResponse = {
        data: { organic: [] },
      };

      axios.post.mockResolvedValue(mockResponse);

      await searchWeb('  test query  ');

      expect(axios.post).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        expect.objectContaining({
          q: 'test query',
        }),
        expect.any(Object)
      );
    });
  });

  describe('Empty results', () => {
    it('should return empty array when no organic results', async () => {
      const mockResponse = {
        data: {
          organic: [],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const results = await searchWeb('nonexistent search query');

      expect(results).toEqual([]);
      expect(results).toHaveLength(0);
    });

    it('should return empty array when organic field is missing', async () => {
      const mockResponse = {
        data: {},
      };

      axios.post.mockResolvedValue(mockResponse);

      const results = await searchWeb('test');

      expect(results).toEqual([]);
    });

    it('should handle results with missing fields', async () => {
      const mockResponse = {
        data: {
          organic: [
            {
              title: 'Result 1',
              // missing link and snippet
            },
            {
              // missing all fields
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const results = await searchWeb('test');

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: 'Result 1',
        url: '',
        snippet: '',
        source: 'serper',
      });
      expect(results[1]).toMatchObject({
        title: 'Untitled',
        url: '',
        snippet: '',
        source: 'serper',
      });
    });
  });

  describe('HTTP error cases', () => {
    it('should throw error on 401 Unauthorized (invalid API key)', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Invalid API key' },
        },
      });

      await expect(searchWeb('test')).rejects.toThrow(
        'Serper API authentication failed: Invalid API key'
      );
    });

    it('should throw error on 429 Rate Limit', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: {},
        },
      });

      await expect(searchWeb('test')).rejects.toThrow(
        'Serper API rate limit exceeded'
      );
    });

    it('should throw error on 400 Bad Request', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 400,
          statusText: 'Bad Request',
          data: { message: 'Invalid query parameter' },
        },
      });

      await expect(searchWeb('test')).rejects.toThrow(
        'Serper API bad request: Invalid query parameter'
      );
    });

    it('should throw error on 500 Internal Server Error', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Server error' },
        },
      });

      await expect(searchWeb('test')).rejects.toThrow(
        'Serper API error (500): Server error'
      );
    });

    it('should handle HTTP error without message', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 503,
          statusText: 'Service Unavailable',
          data: {},
        },
      });

      await expect(searchWeb('test')).rejects.toThrow(
        'Serper API error (503): Service Unavailable'
      );
    });
  });

  describe('Network errors', () => {
    it('should throw error on network failure', async () => {
      axios.post.mockRejectedValue({
        request: {},
        message: 'Network Error',
      });

      await expect(searchWeb('test')).rejects.toThrow(
        'Serper API network error: No response received'
      );
    });

    it('should throw error on timeout', async () => {
      axios.post.mockRejectedValue({
        request: {},
        message: 'timeout of 10000ms exceeded',
      });

      await expect(searchWeb('test')).rejects.toThrow(
        'Serper API network error: No response received'
      );
    });
  });

  describe('Validation errors', () => {
    it('should throw error when API key is missing', async () => {
      delete process.env.SERPER_API_KEY;

      await expect(searchWeb('test')).rejects.toThrow(
        'SERPER_API_KEY is not set in environment variables'
      );

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should throw error when query is empty string', async () => {
      await expect(searchWeb('')).rejects.toThrow(
        'Search query (q) must be a non-empty string'
      );

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should throw error when query is whitespace only', async () => {
      await expect(searchWeb('   ')).rejects.toThrow(
        'Search query (q) must be a non-empty string'
      );

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should throw error when query is not a string', async () => {
      await expect(searchWeb(123)).rejects.toThrow(
        'Search query (q) must be a non-empty string'
      );

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should throw error when num is less than 1', async () => {
      await expect(searchWeb('test', 0)).rejects.toThrow(
        'Number of results (num) must be between 1 and 100'
      );

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should throw error when num is greater than 100', async () => {
      await expect(searchWeb('test', 101)).rejects.toThrow(
        'Number of results (num) must be between 1 and 100'
      );

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should throw error when num is not a number', async () => {
      await expect(searchWeb('test', 'ten')).rejects.toThrow(
        'Number of results (num) must be between 1 and 100'
      );

      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('Other errors', () => {
    it('should handle unknown errors', async () => {
      axios.post.mockRejectedValue(new Error('Unknown error occurred'));

      await expect(searchWeb('test')).rejects.toThrow(
        'Serper API request failed: Unknown error occurred'
      );
    });
  });
});
