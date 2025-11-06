/**
 * Example usage of the OpenAI service module
 *
 * Run this file with: node examples/openai-usage.js
 */

require('dotenv').config();
const {
  summarizeNote,
  buildQueries,
  rerankResults,
  elaborateNote,
  formatReferences,
  captionImage,
  redactPII,
} = require('../src/services/openai');

// Sample note content
const sampleNote = `
# Neural Networks

Neural networks are computing systems inspired by biological neural networks in animal brains.

## Key Components:
- Input Layer: Receives the initial data
- Hidden Layers: Process the data through weighted connections
- Output Layer: Produces the final prediction

## Training:
Neural networks learn through backpropagation, adjusting weights based on errors.
Deep learning uses multiple hidden layers to learn hierarchical representations.
`.trim();

// Sample search results
const sampleSearchResults = [
  {
    title: 'Neural Networks Explained - MIT',
    url: 'https://mit.edu/neural-networks',
    snippet: 'Comprehensive introduction to neural networks and deep learning',
  },
  {
    title: 'Wikipedia: Artificial Neural Network',
    url: 'https://en.wikipedia.org/wiki/Artificial_neural_network',
    snippet: 'General information about neural networks',
  },
  {
    title: 'Deep Learning Fundamentals - Stanford',
    url: 'https://stanford.edu/deep-learning',
    snippet: 'Core concepts in deep learning and neural network architectures',
  },
  {
    title: 'Blog Post about AI',
    url: 'https://random-blog.com/ai-stuff',
    snippet: 'Some thoughts on AI',
  },
];

async function main() {
  console.log('=== OpenAI Service Examples ===\n');

  // ============================================================================
  // Example 1: PII Redaction (P6)
  // ============================================================================
  console.log('Example 1: PII Redaction\n');

  const textWithPII = 'Contact me at john.doe@example.com or call 555-123-4567. My SSN is 123-45-6789.';
  console.log('Original:', textWithPII);
  console.log('Redacted:', redactPII(textWithPII));
  console.log('');

  try {
    // ============================================================================
    // Example 2: Summarize Note (P0)
    // ============================================================================
    console.log('Example 2: Summarize Note (P0 - JSON mode)\n');

    const summary = await summarizeNote(sampleNote, 150);
    console.log('Summary:', summary.summary);
    console.log('Key Points:');
    summary.keyPoints.forEach((point, idx) => {
      console.log(`  ${idx + 1}. ${point}`);
    });
    console.log('');

    // ============================================================================
    // Example 3: Build Search Queries (P1)
    // ============================================================================
    console.log('Example 3: Build Search Queries (P1 - JSON mode)\n');

    const queries = await buildQueries(sampleNote, 3);
    console.log('Search Queries:');
    queries.queries.forEach((query, idx) => {
      console.log(`  ${idx + 1}. ${query}`);
    });
    console.log('\nKeywords:', queries.keywords.join(', '));
    console.log('');

    // ============================================================================
    // Example 4: Re-rank Search Results (P2)
    // ============================================================================
    console.log('Example 4: Re-rank Search Results (P2 - JSON mode)\n');

    const reranked = await rerankResults(sampleNote, sampleSearchResults, 3);
    console.log('Ranked Indices (top 3):', reranked.rankedIndices);
    console.log('Reasoning:', reranked.reasoning);
    console.log('\nTop 3 Sources:');
    reranked.rankedIndices.forEach((idx, rank) => {
      const result = sampleSearchResults[idx];
      console.log(`  ${rank + 1}. [${idx}] ${result.title}`);
      console.log(`     ${result.url}`);
    });
    console.log('');

    // ============================================================================
    // Example 5: Elaborate Note (P3)
    // ============================================================================
    console.log('Example 5: Elaborate Note (P3 - Markdown)\n');

    // Get top sources from reranking
    const topSources = reranked.rankedIndices.map(idx => sampleSearchResults[idx]);

    const elaboration = await elaborateNote(sampleNote, topSources);
    console.log('Elaboration (with citations):\n');
    console.log(elaboration);
    console.log('');

    // ============================================================================
    // Example 6: Format References (P4)
    // ============================================================================
    console.log('Example 6: Format References (P4 - Plain text)\n');

    const references = topSources.map((source, idx) => ({
      rank: idx + 1,
      title: source.title,
      url: source.url,
      snippet: source.snippet,
    }));

    console.log('Numbered Style:');
    console.log(formatReferences(references, 'numbered'));
    console.log('\n---\n');

    console.log('APA Style:');
    console.log(formatReferences(references, 'apa'));
    console.log('\n---\n');

    console.log('MLA Style:');
    console.log(formatReferences(references, 'mla'));
    console.log('');

    // ============================================================================
    // Example 7: Caption Image (P5)
    // ============================================================================
    console.log('Example 7: Caption Image (P5 - JSON mode with Vision)\n');

    // Note: This requires an actual image file
    // Uncomment and provide a valid image path to test
    /*
    const imageCaption = await captionImage('./path/to/image.jpg', 'Machine learning diagram');
    console.log('Caption:', imageCaption.caption);
    console.log('Description:', imageCaption.description);
    console.log('Tags:', imageCaption.tags.join(', '));
    console.log('');
    */
    console.log('(Skipped - requires actual image file)');
    console.log('Usage: captionImage("/path/to/image.jpg", "optional context")');
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// Integration Example: Complete Elaboration Pipeline
// ============================================================================
async function integrationExample() {
  console.log('\n=== Complete Elaboration Pipeline ===\n');

  try {
    const noteContent = 'Machine learning is a subset of AI that enables systems to learn from data.';

    // Step 1: Summarize
    console.log('Step 1: Summarizing...');
    const summary = await summarizeNote(noteContent, 100);
    console.log('✓ Summary:', summary.summary);

    // Step 2: Build queries
    console.log('\nStep 2: Building search queries...');
    const queries = await buildQueries(noteContent, 2);
    console.log('✓ Queries:', queries.queries);

    // Step 3: Re-rank (using sample results)
    console.log('\nStep 3: Re-ranking results...');
    const ranked = await rerankResults(noteContent, sampleSearchResults.slice(0, 3), 2);
    console.log('✓ Top indices:', ranked.rankedIndices);

    // Step 4: Elaborate
    console.log('\nStep 4: Generating elaboration...');
    const topSources = ranked.rankedIndices.map(idx => sampleSearchResults[idx]);
    const elaboration = await elaborateNote(noteContent, topSources);
    console.log('✓ Elaboration generated (first 200 chars):');
    console.log(elaboration.substring(0, 200) + '...');

    // Step 5: Format references
    console.log('\nStep 5: Formatting references...');
    const refs = topSources.map((s, i) => ({ rank: i + 1, ...s }));
    const formatted = formatReferences(refs, 'numbered');
    console.log('✓ References formatted');

    console.log('\n✅ Complete pipeline executed successfully!');
  } catch (error) {
    console.error('Pipeline error:', error.message);
  }
}

// Run examples
async function runAll() {
  await main();
  await integrationExample();
}

runAll();
