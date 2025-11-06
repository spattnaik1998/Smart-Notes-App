/**
 * Image caption service - now uses the centralized OpenAI service module
 */

const { captionImage } = require('./openai');

/**
 * Generate a short caption for an uploaded image using OpenAI Vision
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - Generated caption (simple string)
 */
async function generateImageCaption(imagePath) {
  try {
    // Use the centralized OpenAI service (P5 - captionImage)
    const result = await captionImage(imagePath, 'Note image');

    console.log('✓ Generated image caption:', result.caption);

    // Return just the caption (backward compatible with existing code)
    return result.caption;
  } catch (error) {
    console.error('Error generating image caption:', error.message);

    // Return a default caption on error
    return 'Image uploaded - caption generation failed';
  }
}

module.exports = {
  generateImageCaption,
};
