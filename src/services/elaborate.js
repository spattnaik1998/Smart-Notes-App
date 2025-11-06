/**
 * Elaboration service - orchestrates the complete elaboration pipeline
 * Uses centralized OpenAI and Serper service modules
 */

const { searchWeb } = require('./serper');
const {
  buildQueries,
  rerankResults: rerankResultsOpenAI,
  elaborateNote: elaborateNoteOpenAI,
} = require('./openai');

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
 * Re-rank and select best 3-6 sources using OpenAI service
 */
async function rerankSources(noteContent, searchResults) {
  if (searchResults.length === 0) return [];

  try {
    // Use centralized OpenAI service (P2 - rerankResults)
    const reranked = await rerankResultsOpenAI(noteContent, searchResults, 6);

    // Convert indices back to sources
    return reranked.rankedIndices
      .filter(idx => idx < searchResults.length)
      .map(idx => searchResults[idx]);
  } catch (error) {
    console.error('Failed to rerank sources:', error.message);
    // Fallback: take first 5 results
    return searchResults.slice(0, 5);
  }
}

/**
 * Main elaboration pipeline
 * Orchestrates: buildQueries -> searchWeb -> rerankResults -> elaborateNote
 */
async function elaborateNote(note) {
  const noteContent = note.bodyMd;

  // Step 1: Build search queries using OpenAI (P1)
  console.log('📝 Building search queries...');
  const { queries, keywords } = await buildQueries(noteContent, 1);
  const searchQuery = queries[0] || keywords.join(' ');
  console.log('🔍 Search query:', searchQuery);

  // Step 2: Search web with Serper
  console.log('🌐 Searching web...');
  const searchResults = await searchWebForElaboration(searchQuery);
  console.log(`✓ Found ${searchResults.length} results`);

  if (searchResults.length === 0) {
    // No results found - provide elaboration without references
    console.log('⚠️  No search results found');

    // Use centralized OpenAI service (P3 - elaborateNote)
    const elaboration = await elaborateNoteOpenAI(noteContent, []);

    return {
      summary: noteContent.substring(0, 200) + '...',
      elaboratedContent: elaboration,
      references: [],
      searchQuery,
    };
  }

  // Step 3: Re-rank and select best sources using OpenAI (P2)
  console.log('⚖️  Re-ranking sources...');
  const selectedSources = await rerankSources(noteContent, searchResults);
  console.log(`✓ Selected ${selectedSources.length} sources`);

  // Convert to format expected by OpenAI elaborateNote
  const sourcesForElaboration = selectedSources.map(source => ({
    title: source.title,
    url: source.link,
    snippet: source.snippet || '',
  }));

  // Step 4: Generate elaboration with citations using OpenAI (P3)
  console.log('✍️  Generating elaboration...');
  const elaboration = await elaborateNoteOpenAI(noteContent, sourcesForElaboration);

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
  rerankSources,
};
