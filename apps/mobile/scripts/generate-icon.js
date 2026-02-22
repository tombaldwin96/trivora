#!/usr/bin/env node
/**
 * Generates a 1024x1024 square app icon from assets/Logo.png.
 * Run: node scripts/generate-icon.js
 * Required for expo-doctor (icon must be square).
 */
const path = require('path');
const sharp = require('sharp');

const SIZE = 1024;
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'assets', 'Logo.png');
const out = path.join(root, 'assets', 'icon.png');

sharp(src)
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .toFile(out)
  .then(() => console.log('Generated', out))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
