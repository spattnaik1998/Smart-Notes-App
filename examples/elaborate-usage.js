/**
 * Example usage of the elaborate endpoint
 *
 * Prerequisites:
 * 1. Server must be running: npm start
 * 2. Database must be seeded: npm run db:seed
 * 3. API keys must be set in .env
 *
 * Run: node examples/elaborate-usage.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

async function demonstrateElaboration() {
  try {
    console.log('=== Elaborate Endpoint Demo ===\n');

    // Step 1: Get all notes
    console.log('Step 1: Fetching notes...');
    const notesResponse = await axios.get(`${API_BASE}/notes`);
    const notes = notesResponse.data;

    if (notes.length === 0) {
      console.log('❌ No notes found. Run "npm run db:seed" first.');
      return;
    }

    const note = notes[0];
    console.log(`✓ Found note: "${note.title}"`);
    console.log(`  Content preview: ${note.bodyMd.substring(0, 100)}...\n`);

    // Step 2: Call elaborate endpoint (first time - no cache)
    console.log('Step 2: Calling elaborate endpoint (first time)...');
    const start1 = Date.now();

    const elaborate1 = await axios.post(`${API_BASE}/notes/${note.id}/elaborate`);
    const elapsed1 = Date.now() - start1;

    console.log(`✓ Elaboration generated in ${elapsed1}ms`);
    console.log('\nResponse structure:');
    console.log('  - sections:', elaborate1.data.sections?.length || 0);
    console.log('  - references:', elaborate1.data.references?.length || 0);
    console.log('  - cached:', elaborate1.data.metadata?.cached);
    console.log('  - tokens:', elaborate1.data.metadata?.tokens);
    console.log('  - elapsedMs:', elaborate1.data.metadata?.elapsedMs);

    console.log('\nSections:');
    elaborate1.data.sections?.forEach((section, idx) => {
      console.log(`  ${idx + 1}. ${section.type}:`);
      console.log(`     ${section.content.substring(0, 100)}...`);
    });

    console.log('\nReferences:');
    elaborate1.data.references?.forEach((ref, idx) => {
      console.log(`  [${ref.rank}] ${ref.title}`);
      console.log(`      ${ref.url}`);
    });

    // Step 3: Call elaborate endpoint again (should return cached)
    console.log('\n\nStep 3: Calling elaborate endpoint again (should use cache)...');
    const start2 = Date.now();

    const elaborate2 = await axios.post(`${API_BASE}/notes/${note.id}/elaborate`);
    const elapsed2 = Date.now() - start2;

    console.log(`✓ Response returned in ${elapsed2}ms`);
    console.log('  - cached:', elaborate2.data.metadata?.cached);
    console.log('  - speedup:', `${Math.round((elapsed1 / elapsed2) * 10) / 10}x faster`);

    // Step 4: Force regeneration
    console.log('\n\nStep 4: Forcing regeneration (force=true)...');
    const start3 = Date.now();

    const elaborate3 = await axios.post(`${API_BASE}/notes/${note.id}/elaborate`, {
      force: true,
    });
    const elapsed3 = Date.now() - start3;

    console.log(`✓ Elaboration regenerated in ${elapsed3}ms`);
    console.log('  - cached:', elaborate3.data.metadata?.cached);

    // Step 5: Test empty note handling
    console.log('\n\nStep 5: Testing empty note handling...');

    // Create an empty note
    const chaptersResponse = await axios.get(`${API_BASE}/chapters`);
    const chapter = chaptersResponse.data[0];

    const emptyNote = await axios.post(`${API_BASE}/notes`, {
      chapterId: chapter.id,
      title: 'Empty Test Note',
      bodyMd: '',
    });

    try {
      await axios.post(`${API_BASE}/notes/${emptyNote.data.id}/elaborate`);
      console.log('❌ Should have failed for empty note');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✓ Empty note correctly rejected:', error.response.data.error.message);
      } else {
        throw error;
      }
    }

    // Clean up empty note
    await axios.delete(`${API_BASE}/notes/${emptyNote.data.id}`);

    console.log('\n✅ All tests passed!\n');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Make sure the server is running: npm start');
    }
  }
}

// Run demo
demonstrateElaboration();
