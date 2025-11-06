const crypto = require('crypto');

/**
 * Generate a SHA-256 hash of content
 * Used for caching elaborations based on note content
 *
 * @param {string} content - Content to hash
 * @returns {string} - Hex-encoded hash
 */
function generateHash(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  return crypto
    .createHash('sha256')
    .update(content.trim())
    .digest('hex');
}

/**
 * Check if cached data is still valid (within TTL)
 *
 * @param {Date|string} cachedAt - When the data was cached
 * @param {number} ttlHours - Time to live in hours (default: 24)
 * @returns {boolean} - True if cache is still valid
 */
function isCacheValid(cachedAt, ttlHours = 24) {
  if (!cachedAt) return false;

  const cacheDate = new Date(cachedAt);
  const now = new Date();
  const ageInHours = (now - cacheDate) / (1000 * 60 * 60);

  return ageInHours < ttlHours;
}

module.exports = {
  generateHash,
  isCacheValid,
};
