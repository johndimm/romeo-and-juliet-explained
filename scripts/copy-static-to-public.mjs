import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'out');
const publicDir = path.join(rootDir, 'public');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Check if out directory exists
if (!fs.existsSync(outDir)) {
  console.error('Error: out/ directory does not exist. Run "npm run build:static" or "npm run build:android" first.');
  process.exit(1);
}

// Copy all files from out to public
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  
  if (stats.isDirectory()) {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // Copy all files and subdirectories
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyRecursive(srcPath, destPath);
    }
  } else {
    // Copy file
    fs.copyFileSync(src, dest);
  }
}

console.log('Copying static build from out/ to public/...');
try {
  // Remove existing files in public (but keep it as a directory)
  if (fs.existsSync(publicDir)) {
    const entries = fs.readdirSync(publicDir);
    for (const entry of entries) {
      const entryPath = path.join(publicDir, entry);
      const stats = fs.statSync(entryPath);
      if (stats.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(entryPath);
      }
    }
  }
  
  // Copy all files from out to public
  copyRecursive(outDir, publicDir);
  console.log('✓ Successfully copied static build to public/');
  console.log('  You can now run: npx cap sync android');
} catch (error) {
  console.error('Error copying files:', error.message);
  process.exit(1);
}
