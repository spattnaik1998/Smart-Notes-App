const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// P6: PII Redaction Utility
// ============================================================================

/**
 * Redact Personally Identifiable Information (PII) from text
 * Removes: emails, phone numbers, SSNs, credit cards, IP addresses
 *
 * @param {string} text - Text to redact
 * @returns {string} - Redacted text
 */
function redactPII(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let redacted = text;

  // Email addresses
  redacted = redacted.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]'
  );

  // Phone numbers (various formats)
  redacted = redacted.replace(
    /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    '[PHONE_REDACTED]'
  );

  // SSN (XXX-XX-XXXX)
  redacted = redacted.replace(
    /\b\d{3}-\d{2}-\d{4}\b/g,
    '[SSN_REDACTED]'
  );

  // Credit card numbers (simplified - 13-19 digits)
  redacted = redacted.replace(
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4,7}\b/g,
    '[CARD_REDACTED]'
  );

  // IP addresses (IPv4)
  redacted = redacted.replace(
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    '[IP_REDACTED]'
  );

  // API keys and tokens (common patterns)
  redacted = redacted.replace(
    /\b(sk-[a-zA-Z0-9]{20,}|pk_[a-zA-Z0-9]{20,})\b/g,
    '[API_KEY_REDACTED]'
  );

  return redacted;
}

// ============================================================================
// P0: Summarize Note (JSON mode)
// ============================================================================

/**
 * Generate a concise summary of a note
 *
 * @param {string} noteContent - The note content to summarize
 * @param {number} maxLength - Maximum summary length in characters (default: 200)
 * @returns {Promise<{summary: string, keyPoints: string[]}>} - Summary and key points
 */
async function summarizeNote(noteContent, maxLength = 200) {
  // Validate API key
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }

  // Validate input
  if (!noteContent || typeof noteContent !== 'string') {
    throw new Error('Note content must be a non-empty string');
  }

  // Redact PII before sending
  const redactedContent = redactPII(noteContent);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates concise summaries. Return JSON with "summary" (string) and "keyPoints" (array of strings).',
        },
        {
          role: 'user',
          content: `Summarize this note in ${maxLength} characters or less. Extract 2-4 key points.\n\nNote:\n${redactedContent}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      summary: result.summary || '',
      keyPoints: result.keyPoints || result.key_points || [],
    };
  } catch (error) {
    if (error.status === 401) {
      throw new Error('OpenAI API authentication failed: Invalid API key');
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded');
    }
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

// ============================================================================
// P1: Build Search Queries (JSON mode)
// ============================================================================

/**
 * Generate optimized search queries for a note
 *
 * @param {string} noteContent - The note content
 * @param {number} numQueries - Number of queries to generate (default: 3)
 * @returns {Promise<{queries: string[], keywords: string[]}>} - Search queries and keywords
 */
async function buildQueries(noteContent, numQueries = 3) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }

  if (!noteContent || typeof noteContent !== 'string') {
    throw new Error('Note content must be a non-empty string');
  }

  const redactedContent = redactPII(noteContent);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a search query expert. Generate ${numQueries} optimized search queries and 5-7 keywords for finding authoritative sources. Return JSON with "queries" (array of strings) and "keywords" (array of strings).`,
        },
        {
          role: 'user',
          content: `Generate ${numQueries} search queries to find authoritative web sources about this topic:\n\n${redactedContent}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      queries: result.queries || [],
      keywords: result.keywords || [],
    };
  } catch (error) {
    if (error.status === 401) {
      throw new Error('OpenAI API authentication failed: Invalid API key');
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded');
    }
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

// ============================================================================
// P2: Re-rank Search Results (JSON mode)
// ============================================================================

/**
 * Re-rank search results by relevance and credibility
 *
 * @param {string} noteContent - The note content
 * @param {Array<{title: string, url: string, snippet: string}>} searchResults - Search results to re-rank
 * @param {number} topN - Number of top results to return (default: 5)
 * @returns {Promise<{rankedIndices: number[], reasoning: string}>} - Ranked indices and reasoning
 */
async function rerankResults(noteContent, searchResults, topN = 5) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }

  if (!noteContent || typeof noteContent !== 'string') {
    throw new Error('Note content must be a non-empty string');
  }

  if (!Array.isArray(searchResults) || searchResults.length === 0) {
    return { rankedIndices: [], reasoning: 'No results to rank' };
  }

  const redactedContent = redactPII(noteContent);

  // Format search results for the prompt
  const resultsText = searchResults
    .map((result, idx) => {
      return `[${idx}] ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet || 'No snippet'}`;
    })
    .join('\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at evaluating source credibility. Rank search results by relevance and authority. Prefer:
- Educational institutions (.edu)
- Official documentation
- Reputable publishers
- Recent sources
- Diverse domains (avoid duplicates)

Return JSON with "rankedIndices" (array of indices in ranked order, up to ${topN}) and "reasoning" (brief explanation).`,
        },
        {
          role: 'user',
          content: `Note:\n${redactedContent}\n\nSearch Results:\n${resultsText}\n\nRank the top ${topN} most credible and relevant sources.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      rankedIndices: (result.rankedIndices || result.ranked_indices || []).slice(0, topN),
      reasoning: result.reasoning || '',
    };
  } catch (error) {
    if (error.status === 401) {
      throw new Error('OpenAI API authentication failed: Invalid API key');
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded');
    }
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

// ============================================================================
// P3: Elaborate Note (Markdown)
// ============================================================================

/**
 * Generate a detailed elaboration with inline citations
 *
 * @param {string} noteContent - The note content
 * @param {Array<{title: string, url: string, snippet: string}>} sources - Sources for citations
 * @returns {Promise<string>} - Elaborated content in Markdown with citations
 */
async function elaborateNote(noteContent, sources = []) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }

  if (!noteContent || typeof noteContent !== 'string') {
    throw new Error('Note content must be a non-empty string');
  }

  const redactedContent = redactPII(noteContent);

  // Format sources with citation numbers
  const sourcesContext = sources
    .map((source, idx) => {
      return `[${idx + 1}] ${source.title}\n${source.snippet || ''}\nURL: ${source.url}`;
    })
    .join('\n\n');

  const systemPrompt = sources.length > 0
    ? `You are a helpful educational assistant that provides detailed, well-researched elaborations.

Write a comprehensive 2-4 paragraph elaboration that:
1. Expands on the key concepts in the note
2. Provides additional context and explanations
3. Includes inline citations like [1], [2], [3] referencing the provided sources
4. Uses clear, accessible language
5. Uses Markdown formatting (headings, lists, bold, etc.)

Include at least 2-3 citations from the provided sources.`
    : `You are a helpful educational assistant. Provide a detailed 2-3 paragraph elaboration on the topic. Use Markdown formatting.`;

  const userPrompt = sources.length > 0
    ? `Note:\n${redactedContent}\n\nSources:\n${sourcesContext}\n\nProvide an elaboration with inline citations.`
    : `Note:\n${redactedContent}\n\nProvide a detailed elaboration.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    if (error.status === 401) {
      throw new Error('OpenAI API authentication failed: Invalid API key');
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded');
    }
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

// ============================================================================
// P4: Format References (Plain Text)
// ============================================================================

/**
 * Format references as a clean, copy-friendly list
 *
 * @param {Array<{rank: number, title: string, url: string, snippet: string}>} references - References to format
 * @param {string} style - Citation style: 'numbered', 'apa', 'mla' (default: 'numbered')
 * @returns {string} - Formatted references in plain text
 */
function formatReferences(references, style = 'numbered') {
  if (!Array.isArray(references) || references.length === 0) {
    return 'No references available.';
  }

  switch (style) {
    case 'numbered':
      return references
        .map((ref) => {
          return `[${ref.rank}] ${ref.title}\n    ${ref.url}\n    ${ref.snippet || ''}`;
        })
        .join('\n\n');

    case 'apa':
      return references
        .map((ref) => {
          const title = ref.title;
          const url = ref.url;
          return `${title}. Retrieved from ${url}`;
        })
        .join('\n\n');

    case 'mla':
      return references
        .map((ref) => {
          const title = ref.title;
          const url = ref.url;
          return `"${title}." Web. <${url}>`;
        })
        .join('\n\n');

    default:
      return formatReferences(references, 'numbered');
  }
}

// ============================================================================
// P5: Caption Image (JSON mode with Vision)
// ============================================================================

/**
 * Generate a caption for an image using OpenAI Vision
 *
 * @param {string} imagePath - Path to the image file
 * @param {string} context - Optional context about the image (default: '')
 * @returns {Promise<{caption: string, description: string, tags: string[]}>} - Caption, description, and tags
 */
async function captionImage(imagePath, context = '') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }

  if (!imagePath || typeof imagePath !== 'string') {
    throw new Error('Image path must be a non-empty string');
  }

  try {
    // Read image file and convert to base64
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Determine MIME type from file extension
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';

    const userPrompt = context
      ? `Generate a caption for this image. Context: ${context}\n\nReturn JSON with "caption" (1-2 sentences), "description" (detailed), and "tags" (array of keywords).`
      : 'Generate a caption for this image. Return JSON with "caption" (1-2 sentences), "description" (detailed description), and "tags" (array of keywords).';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.5,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      caption: result.caption || '',
      description: result.description || '',
      tags: result.tags || [],
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Image file not found: ${imagePath}`);
    } else if (error.status === 401) {
      throw new Error('OpenAI API authentication failed: Invalid API key');
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded');
    }
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Core functions
  summarizeNote,
  buildQueries,
  rerankResults,
  elaborateNote,
  formatReferences,
  captionImage,

  // Utilities
  redactPII,
};
