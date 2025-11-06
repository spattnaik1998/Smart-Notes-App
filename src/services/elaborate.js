const OpenAI = require('openai');
const { searchWeb } = require('./serper');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract keywords from note content for search
 */
async function extractKeywords(noteContent) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts key search terms from text. Return 3-5 relevant keywords or phrases that would help find authoritative web sources about this topic. Return as a JSON array of strings.'
        },
        {
          role: 'user',
          content: `Extract search keywords from this note:\n\n${noteContent}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result.keywords || result.terms || [];
  } catch (error) {
    console.error('Failed to extract keywords:', error);
    // Fallback: use first sentence or title
    return [noteContent.split('\n')[0].substring(0, 100)];
  }
}

/**
 * Search web using Serper service (now using dedicated serper module)
 */
async function searchWebForElaboration(query) {
  try {
    const results = await searchWeb(query, 10, 'us');

    // Convert normalized results back to the format expected by the rest of the code
    return results.map(result => ({
      title: result.title,
      link: result.url,
      snippet: result.snippet,
    }));
  } catch (error) {
    console.error('Serper API error:', error.message);
    return [];
  }
}

/**
 * Re-rank and select best 3-6 sources
 */
async function rerankSources(noteContent, searchResults) {
  if (searchResults.length === 0) return [];

  try {
    const sourcesText = searchResults.map((result, idx) =>
      `[${idx}] ${result.title}\nURL: ${result.link}\nSnippet: ${result.snippet || ''}`
    ).join('\n\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that selects the most credible and relevant sources. Prefer recent, authoritative sources (educational institutions, official documentation, reputable publishers). Avoid duplicate domains. Return a JSON object with a "selected" array containing the indices of 3-6 best sources in ranked order.'
        },
        {
          role: 'user',
          content: `Note content:\n${noteContent}\n\nSearch results:\n${sourcesText}\n\nSelect 3-6 most credible and relevant sources. Return indices only.`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const result = JSON.parse(response.choices[0].message.content);
    const selectedIndices = result.selected || [];

    return selectedIndices
      .filter(idx => idx < searchResults.length)
      .map(idx => searchResults[idx]);
  } catch (error) {
    console.error('Failed to rerank sources:', error);
    // Fallback: take first 5 results
    return searchResults.slice(0, 5);
  }
}

/**
 * Generate elaboration with inline citations
 */
async function generateElaboration(noteContent, sources) {
  try {
    // Build sources context with citation numbers
    const sourcesContext = sources.map((source, idx) =>
      `[${idx + 1}] ${source.title}\n${source.snippet || ''}\nURL: ${source.link}`
    ).join('\n\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that provides detailed, educational elaborations on notes.

Write a comprehensive 2-3 paragraph elaboration that:
1. Expands on the key concepts in the note
2. Provides additional context and explanations
3. Includes inline citations like [1], [2], [3] referencing the provided sources
4. Uses clear, accessible language
5. Focuses on helping the user understand the topic more deeply

Use Markdown formatting. Include at least 2-3 citations from the provided sources.`
        },
        {
          role: 'user',
          content: `Note:\n${noteContent}\n\nSources:\n${sourcesContext}\n\nProvide an elaboration with inline citations.`
        }
      ],
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Failed to generate elaboration:', error);
    throw new Error('Failed to generate elaboration');
  }
}

/**
 * Main elaboration pipeline
 */
async function elaborateNote(note) {
  const noteContent = note.bodyMd;

  // Step 1: Extract keywords
  console.log('📝 Extracting keywords...');
  const keywords = await extractKeywords(noteContent);
  const searchQuery = keywords.join(' ');
  console.log('🔍 Search query:', searchQuery);

  // Step 2: Search web with Serper
  console.log('🌐 Searching web...');
  const searchResults = await searchWebForElaboration(searchQuery);
  console.log(`✓ Found ${searchResults.length} results`);

  if (searchResults.length === 0) {
    // No results found - provide elaboration without references
    console.log('⚠️  No search results found');
    const elaboration = await generateElaboration(noteContent, []);
    return {
      summary: noteContent.substring(0, 200) + '...',
      elaboratedContent: elaboration,
      references: [],
      searchQuery,
    };
  }

  // Step 3: Re-rank and select best sources
  console.log('⚖️  Re-ranking sources...');
  const selectedSources = await rerankSources(noteContent, searchResults);
  console.log(`✓ Selected ${selectedSources.length} sources`);

  // Step 4: Generate elaboration with citations
  console.log('✍️  Generating elaboration...');
  const elaboration = await generateElaboration(noteContent, selectedSources);

  // Step 5: Format response
  const references = selectedSources.map((source, idx) => ({
    rank: idx + 1,
    title: source.title,
    url: source.link,
    snippet: source.snippet || '',
  }));

  console.log('✅ Elaboration complete');

  return {
    summary: noteContent.substring(0, 200),
    elaboratedContent: elaboration,
    references,
    searchQuery,
  };
}

module.exports = {
  elaborateNote,
  extractKeywords,
  rerankSources,
  generateElaboration,
};
