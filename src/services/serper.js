const axios = require('axios');

/**
 * Serper API Service
 * Provides web search functionality using the Serper (Google Search) API
 */

const SERPER_API_URL = 'https://google.serper.dev/search';

/**
 * Search the web using Serper API
 *
 * @param {string} q - Search query
 * @param {number} num - Number of results to return (default: 10, max: 100)
 * @param {string} gl - Geographic location code (default: 'us')
 * @returns {Promise<Array>} - Array of normalized search results
 * @throws {Error} - If API request fails or API key is missing
 */
async function searchWeb(q, num = 10, gl = 'us') {
  // Validate API key
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY is not set in environment variables');
  }

  // Validate inputs
  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new Error('Search query (q) must be a non-empty string');
  }

  if (typeof num !== 'number' || num < 1 || num > 100) {
    throw new Error('Number of results (num) must be between 1 and 100');
  }

  try {
    const response = await axios.post(
      SERPER_API_URL,
      {
        q: q.trim(),
        num,
        gl,
      },
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      }
    );

    // Extract organic results
    const organicResults = response.data.organic || [];

    // Normalize results
    const normalizedResults = organicResults.map(result => ({
      title: result.title || 'Untitled',
      url: result.link || result.url || '',
      snippet: result.snippet || '',
      source: 'serper',
      retrieved_at: new Date().toISOString(),
    }));

    return normalizedResults;
  } catch (error) {
    // Handle different error types
    if (error.response) {
      // HTTP error response from Serper API
      const status = error.response.status;
      const message = error.response.data?.message || error.response.statusText;

      if (status === 401) {
        throw new Error('Serper API authentication failed: Invalid API key');
      } else if (status === 429) {
        throw new Error('Serper API rate limit exceeded');
      } else if (status === 400) {
        throw new Error(`Serper API bad request: ${message}`);
      } else {
        throw new Error(`Serper API error (${status}): ${message}`);
      }
    } else if (error.request) {
      // Network error - request was made but no response received
      throw new Error('Serper API network error: No response received');
    } else if (error.message.includes('SERPER_API_KEY')) {
      // Re-throw validation errors
      throw error;
    } else {
      // Other errors
      throw new Error(`Serper API request failed: ${error.message}`);
    }
  }
}

module.exports = {
  searchWeb,
};
