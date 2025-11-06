/**
 * Example usage of the image upload endpoint
 *
 * Prerequisites:
 * 1. Server must be running: npm start
 * 2. Database must be seeded: npm run db:seed
 * 3. API keys must be set in .env
 * 4. Have a test image ready
 *
 * Run: node examples/image-upload-usage.js /path/to/image.jpg
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000/api';

async function demonstrateImageUpload() {
  try {
    console.log('=== Image Upload Endpoint Demo ===\n');

    // Get image path from command line or use a placeholder
    const imagePath = process.argv[2];

    if (!imagePath) {
      console.error('❌ Please provide an image path as an argument');
      console.log('Usage: node examples/image-upload-usage.js /path/to/image.jpg');
      process.exit(1);
    }

    if (!fs.existsSync(imagePath)) {
      console.error(`❌ Image file not found: ${imagePath}`);
      process.exit(1);
    }

    const fileStats = fs.statSync(imagePath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    console.log(`Image: ${path.basename(imagePath)}`);
    console.log(`Size: ${fileSizeMB}MB`);
    console.log('');

    // Step 1: Get chapters
    console.log('Step 1: Fetching chapters...');
    const chaptersResponse = await axios.get(`${API_BASE}/chapters`);
    const chapters = chaptersResponse.data;

    if (chapters.length === 0) {
      console.log('❌ No chapters found. Run "npm run db:seed" first.');
      return;
    }

    const chapter = chapters[0];
    console.log(`✓ Using chapter: "${chapter.title}"\n`);

    // Step 2: Upload image
    console.log('Step 2: Uploading image...');
    const start = Date.now();

    const formData = new FormData();
    formData.append('chapterId', chapter.id);
    formData.append('file', fs.createReadStream(imagePath));

    const uploadResponse = await axios.post(`${API_BASE}/notes/image`, formData, {
      headers: formData.getHeaders(),
    });

    const elapsed = Date.now() - start;

    console.log(`✓ Image uploaded in ${elapsed}ms\n`);

    console.log('Response:');
    console.log('  note_id:', uploadResponse.data.note_id);
    console.log('  image_url:', uploadResponse.data.image_url);
    console.log('  image_caption:', uploadResponse.data.image_caption);
    console.log('  tags:', uploadResponse.data.tags?.join(', ') || 'none');
    console.log('  description:', uploadResponse.data.description?.substring(0, 100) + '...');
    console.log('\nMetadata:');
    console.log('  chapterTitle:', uploadResponse.data.metadata?.chapterTitle);
    console.log('  fileSize:', uploadResponse.data.metadata?.fileSize, 'bytes');
    console.log('  mimeType:', uploadResponse.data.metadata?.mimeType);
    console.log('  elapsedMs:', uploadResponse.data.metadata?.elapsedMs);

    // Step 3: Verify note was created
    console.log('\n\nStep 3: Verifying note was created...');
    const noteId = uploadResponse.data.note_id;

    const noteResponse = await axios.get(`${API_BASE}/notes/${noteId}`);
    console.log('✓ Note retrieved successfully');
    console.log('  kind:', noteResponse.data.kind);
    console.log('  title:', noteResponse.data.title);

    // Step 4: Test invalid file scenarios
    console.log('\n\nStep 4: Testing error handling...');

    // Test 4a: Missing chapterId
    console.log('\n4a. Testing upload without chapterId...');
    try {
      const formData2 = new FormData();
      formData2.append('file', fs.createReadStream(imagePath));

      await axios.post(`${API_BASE}/notes/image`, formData2, {
        headers: formData2.getHeaders(),
      });

      console.log('❌ Should have failed without chapterId');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✓ Correctly rejected:', error.response.data.error.message);
      } else {
        throw error;
      }
    }

    // Test 4b: Invalid chapter
    console.log('\n4b. Testing upload with invalid chapterId...');
    try {
      const formData3 = new FormData();
      formData3.append('chapterId', 'non-existent-chapter-id');
      formData3.append('file', fs.createReadStream(imagePath));

      await axios.post(`${API_BASE}/notes/image`, formData3, {
        headers: formData3.getHeaders(),
      });

      console.log('❌ Should have failed with invalid chapter');
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✓ Correctly rejected:', error.response.data.error.message);
      } else {
        throw error;
      }
    }

    // Test 4c: Missing file
    console.log('\n4c. Testing upload without file...');
    try {
      await axios.post(`${API_BASE}/notes/image`, {
        chapterId: chapter.id,
      });

      console.log('❌ Should have failed without file');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✓ Correctly rejected:', error.response.data.error.message);
      } else {
        throw error;
      }
    }

    console.log('\n✅ All tests passed!\n');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Make sure the server is running: npm start');
    }
  }
}

// Run demo
demonstrateImageUpload();
