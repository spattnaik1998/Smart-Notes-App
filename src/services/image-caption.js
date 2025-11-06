const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a short caption for an uploaded image using OpenAI Vision
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - Generated caption
 */
async function generateImageCaption(imagePath) {
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

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Generate a concise, descriptive caption for this image (1-2 sentences). Focus on the main subject and key details that would be useful in a notes application.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 150,
      temperature: 0.5,
    });

    const caption = response.choices[0].message.content.trim();
    console.log('✓ Generated image caption:', caption);

    return caption;
  } catch (error) {
    console.error('Error generating image caption:', error);

    // Return a default caption on error
    return 'Image uploaded - caption generation failed';
  }
}

module.exports = {
  generateImageCaption,
};
