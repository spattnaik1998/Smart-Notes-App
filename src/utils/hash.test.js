const { generateHash, isCacheValid } = require('./hash');

describe('Hash Utilities', () => {
  describe('generateHash', () => {
    it('should generate a consistent SHA-256 hash', () => {
      const content = 'Hello, World!';
      const hash1 = generateHash(content);
      const hash2 = generateHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should produce different hashes for different content', () => {
      const hash1 = generateHash('Content A');
      const hash2 = generateHash('Content B');

      expect(hash1).not.toBe(hash2);
    });

    it('should trim whitespace before hashing', () => {
      const hash1 = generateHash('  Hello  ');
      const hash2 = generateHash('Hello');

      expect(hash1).toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash = generateHash('');
      expect(hash).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(generateHash(null)).toBe('');
      expect(generateHash(undefined)).toBe('');
    });

    it('should be case-sensitive', () => {
      const hash1 = generateHash('Hello');
      const hash2 = generateHash('hello');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle unicode characters', () => {
      const content = 'Hello 世界 🌍';
      const hash = generateHash(content);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('isCacheValid', () => {
    it('should return true for recent cache (within TTL)', () => {
      const recentDate = new Date();
      const isValid = isCacheValid(recentDate, 24);

      expect(isValid).toBe(true);
    });

    it('should return false for expired cache (beyond TTL)', () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago

      const isValid = isCacheValid(oldDate, 24);

      expect(isValid).toBe(false);
    });

    it('should handle custom TTL values', () => {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      expect(isCacheValid(oneHourAgo, 2)).toBe(true); // Within 2 hour TTL
      expect(isCacheValid(oneHourAgo, 0.5)).toBe(false); // Beyond 0.5 hour TTL
    });

    it('should accept date strings', () => {
      const recentDate = new Date();
      const dateString = recentDate.toISOString();

      const isValid = isCacheValid(dateString, 24);

      expect(isValid).toBe(true);
    });

    it('should return false for null or undefined dates', () => {
      expect(isCacheValid(null, 24)).toBe(false);
      expect(isCacheValid(undefined, 24)).toBe(false);
    });

    it('should use default TTL of 24 hours', () => {
      const recentDate = new Date();
      const isValid = isCacheValid(recentDate); // No TTL specified

      expect(isValid).toBe(true);
    });

    it('should handle edge case: exactly at TTL boundary', () => {
      const exactlyAtBoundary = new Date();
      exactlyAtBoundary.setHours(exactlyAtBoundary.getHours() - 24);

      // Should be invalid (>= TTL is expired)
      const isValid = isCacheValid(exactlyAtBoundary, 24);

      expect(isValid).toBe(false);
    });

    it('should handle future dates', () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      const isValid = isCacheValid(futureDate, 24);

      expect(isValid).toBe(true);
    });
  });

  describe('Integration: Hash + Cache Validation', () => {
    it('should detect content changes via hash', () => {
      const originalContent = 'Original note content';
      const modifiedContent = 'Modified note content';

      const hash1 = generateHash(originalContent);
      const hash2 = generateHash(modifiedContent);

      expect(hash1).not.toBe(hash2);
    });

    it('should use hash to invalidate cache on content change', () => {
      const originalHash = generateHash('Original content');
      const newHash = generateHash('New content');
      const cachedAt = new Date();

      // Even if cache is recent, hash mismatch should invalidate
      const isCacheStillValid = (storedHash, currentHash, cachedDate) => {
        return storedHash === currentHash && isCacheValid(cachedDate, 24);
      };

      expect(isCacheStillValid(originalHash, newHash, cachedAt)).toBe(false);
      expect(isCacheStillValid(originalHash, originalHash, cachedAt)).toBe(true);
    });
  });
});
