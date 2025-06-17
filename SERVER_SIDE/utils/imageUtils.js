import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

/**
 * Resize and optimize uploaded images
 * @param {string} inputPath - Path to the original image
 * @param {string} outputPath - Path where optimized image will be saved
 * @param {Object} options - Resize options
 */
export const optimizeImage = async (inputPath, outputPath, options = {}) => {
  const {
    width = 800,
    height = 600,
    quality = 80,
    format = 'jpeg'
  } = options;

  try {
    await sharp(inputPath)
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality })
      .toFile(outputPath);

    // Delete original file if optimization was successful
    if (fs.existsSync(inputPath) && inputPath !== outputPath) {
      fs.unlinkSync(inputPath);
    }

    return outputPath;
  } catch (error) {
    console.error('Image optimization failed:', error);
    throw error;
  }
};

/**
 * Generate multiple image sizes (thumbnail, medium, large)
 * @param {string} inputPath - Path to the original image
 * @param {string} baseOutputPath - Base path for output files
 */
export const generateImageSizes = async (inputPath, baseOutputPath) => {
  const sizes = {
    thumbnail: { width: 150, height: 150 },
    medium: { width: 400, height: 300 },
    large: { width: 800, height: 600 }
  };

  const results = {};

  for (const [sizeName, dimensions] of Object.entries(sizes)) {
    const outputPath = `${baseOutputPath}_${sizeName}.jpg`;
    await optimizeImage(inputPath, outputPath, {
      ...dimensions,
      quality: sizeName === 'thumbnail' ? 70 : 80
    });
    results[sizeName] = outputPath;
  }

  return results;
};

/**
 * Validate image file
 * @param {Object} file - Multer file object
 */
export const validateImage = (file) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
  }

  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 5MB.');
  }

  return true;
};