/**
 * Example usage of the Serper service module
 *
 * Run this file with: node examples/serper-usage.js
 */

require('dotenv').config();
const { searchWeb } = require('../src/services/serper');

async function exampleUsage() {
  console.log('=== Serper Service Examples ===\n');

  try {
    // Example 1: Basic search with defaults
    console.log('Example 1: Basic search (default 10 results, US)');
    const results1 = await searchWeb('neural networks machine learning');
    console.log(`Found ${results1.length} results`);
    if (results1.length > 0) {
      console.log('First result:', {
        title: results1[0].title,
        url: results1[0].url,
        snippet: results1[0].snippet.substring(0, 100) + '...',
        source: results1[0].source,
        retrieved_at: results1[0].retrieved_at,
      });
    }
    console.log('');

    // Example 2: Custom number of results
    console.log('Example 2: Search with 5 results');
    const results2 = await searchWeb('REST API design', 5);
    console.log(`Found ${results2.length} results`);
    console.log('');

    // Example 3: Different geographic location
    console.log('Example 3: Search with UK location');
    const results3 = await searchWeb('machine learning', 3, 'uk');
    console.log(`Found ${results3.length} results`);
    console.log('');

    // Example 4: Handling empty results
    console.log('Example 4: Search that might return no results');
    const results4 = await searchWeb('asdfghjklqwertyuiopzxcvbnm123456789', 5);
    console.log(`Found ${results4.length} results`);
    if (results4.length === 0) {
      console.log('No results found (this is expected for gibberish queries)');
    }
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 5: Error handling
async function errorHandlingExample() {
  console.log('=== Error Handling Examples ===\n');

  // Empty query
  try {
    console.log('Example 5a: Empty query (should fail)');
    await searchWeb('');
  } catch (error) {
    console.log('✓ Caught error:', error.message);
  }
  console.log('');

  // Invalid num parameter
  try {
    console.log('Example 5b: Invalid num parameter (should fail)');
    await searchWeb('test', 200);
  } catch (error) {
    console.log('✓ Caught error:', error.message);
  }
  console.log('');

  // Missing API key
  const originalKey = process.env.SERPER_API_KEY;
  try {
    console.log('Example 5c: Missing API key (should fail)');
    delete process.env.SERPER_API_KEY;
    await searchWeb('test');
  } catch (error) {
    console.log('✓ Caught error:', error.message);
  } finally {
    process.env.SERPER_API_KEY = originalKey;
  }
  console.log('');
}

// Example 6: Integration with note elaboration
async function elaborationIntegrationExample() {
  console.log('=== Integration with Note Elaboration ===\n');

  const noteContent = `
# Neural Networks

Neural networks are computing systems inspired by biological neural networks.
They consist of layers of interconnected nodes that process information.
  `.trim();

  console.log('Note content:');
  console.log(noteContent);
  console.log('');

  // Extract keywords (simplified version)
  const keywords = ['neural networks', 'deep learning', 'artificial intelligence'];
  const searchQuery = keywords.join(' ');

  console.log('Search query:', searchQuery);
  console.log('');

  try {
    const results = await searchWeb(searchQuery, 6);
    console.log(`Found ${results.length} sources for elaboration`);

    // Display top 3 sources
    console.log('\nTop 3 sources:');
    results.slice(0, 3).forEach((result, idx) => {
      console.log(`\n[${idx + 1}] ${result.title}`);
      console.log(`    URL: ${result.url}`);
      console.log(`    Snippet: ${result.snippet.substring(0, 120)}...`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run all examples
async function main() {
  await exampleUsage();
  await errorHandlingExample();
  await elaborationIntegrationExample();
}

main();
