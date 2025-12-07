#!/usr/bin/env node

/**
 * Generate iOS app icons from source icon
 * Scales up the design to fill more of the icon space for better visibility on iPhone
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const SOURCE_ICON = join(ROOT_DIR, 'resources', 'icon.png');
const IOS_ICON_DIR = join(ROOT_DIR, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');

// iOS icon sizes (base size × scale)
const IOS_ICON_SIZES = [
  { size: 20, scale: 2, filename: 'Icon-20@2x.png', idiom: 'iphone' },
  { size: 20, scale: 3, filename: 'Icon-20@3x.png', idiom: 'iphone' },
  { size: 29, scale: 1, filename: 'Icon-29@1x.png', idiom: 'iphone' },
  { size: 29, scale: 2, filename: 'Icon-29@2x.png', idiom: 'iphone' },
  { size: 29, scale: 3, filename: 'Icon-29@3x.png', idiom: 'iphone' },
  { size: 40, scale: 2, filename: 'Icon-40@2x.png', idiom: 'iphone' },
  { size: 40, scale: 3, filename: 'Icon-40@3x.png', idiom: 'iphone' },
  { size: 60, scale: 2, filename: 'Icon-60@2x.png', idiom: 'iphone' },
  { size: 60, scale: 3, filename: 'Icon-60@3x.png', idiom: 'iphone' },
  { size: 20, scale: 1, filename: 'Icon-20@1x~ipad.png', idiom: 'ipad' },
  { size: 20, scale: 2, filename: 'Icon-20@2x~ipad.png', idiom: 'ipad' },
  { size: 29, scale: 1, filename: 'Icon-29@1x~ipad.png', idiom: 'ipad' },
  { size: 29, scale: 2, filename: 'Icon-29@2x~ipad.png', idiom: 'ipad' },
  { size: 40, scale: 1, filename: 'Icon-40@1x~ipad.png', idiom: 'ipad' },
  { size: 40, scale: 2, filename: 'Icon-40@2x~ipad.png', idiom: 'ipad' },
  { size: 76, scale: 1, filename: 'Icon-76@1x.png', idiom: 'ipad' },
  { size: 76, scale: 2, filename: 'Icon-76@2x.png', idiom: 'ipad' },
  { size: 83.5, scale: 2, filename: 'Icon-83.5@2x.png', idiom: 'ipad' },
  { size: 1024, scale: 1, filename: 'Icon-1024.png', idiom: 'ios-marketing' },
];

function checkCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function generateIcon(sourcePath, outputPath, size, scale = 1) {
  const finalSize = size * scale;
  
  // Try ImageMagick (convert or magick)
  if (checkCommand('magick')) {
    // Scale up the design to 85% of icon size (instead of current ~60%)
    // This makes the design fill more space and be more visible
    const designSize = Math.floor(finalSize * 0.85);
    execSync(
      `magick "${sourcePath}" -resize ${designSize}x${designSize} -gravity center -background white -extent ${finalSize}x${finalSize} "${outputPath}"`,
      { stdio: 'inherit' }
    );
    return;
  }
  
  if (checkCommand('convert')) {
    const designSize = Math.floor(finalSize * 0.85);
    execSync(
      `convert "${sourcePath}" -resize ${designSize}x${designSize} -gravity center -background white -extent ${finalSize}x${finalSize} "${outputPath}"`,
      { stdio: 'inherit' }
    );
    return;
  }
  
  // Try macOS sips (built-in)
  if (checkCommand('sips')) {
    // sips doesn't support centering with extent, so we'll resize and let iOS handle padding
    // Scale to 85% to make design larger
    const designSize = Math.floor(finalSize * 0.85);
    execSync(
      `sips -z ${designSize} ${designSize} "${sourcePath}" --out "${outputPath}"`,
      { stdio: 'inherit' }
    );
    // Note: sips will create the file, but we may need to add padding manually
    // For now, this will at least scale up the design
    return;
  }
  
  throw new Error('No image conversion tool found. Please install ImageMagick (brew install imagemagick)');
}

console.log('🎨 Generating iOS app icons with larger design...\n');

if (!existsSync(SOURCE_ICON)) {
  console.error(`❌ Source icon not found: ${SOURCE_ICON}`);
  process.exit(1);
}

console.log(`📁 Source icon: ${SOURCE_ICON}`);
console.log(`📁 Output directory: ${IOS_ICON_DIR}\n`);

// Generate all icon sizes
for (const icon of IOS_ICON_SIZES) {
  const outputPath = join(IOS_ICON_DIR, icon.filename);
  const finalSize = icon.size * icon.scale;
  
  console.log(`Generating ${icon.filename} (${finalSize}x${finalSize})...`);
  try {
    generateIcon(SOURCE_ICON, outputPath, icon.size, icon.scale);
    console.log(`✅ Created ${icon.filename}\n`);
  } catch (error) {
    console.error(`❌ Failed to create ${icon.filename}:`, error.message);
    process.exit(1);
  }
}

console.log('✨ All iOS icons generated successfully!');
console.log('\nThe design has been scaled up to 85% of icon size (from ~60%)');
console.log('to fill more space and be more visible on iPhone home screens.\n');
