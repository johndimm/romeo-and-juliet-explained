import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

// Clean public directory of build artifacts (but keep static assets if any)
// This is needed before normal Next.js builds to avoid conflicts with _next folder
console.log('Cleaning public/ directory of build artifacts...');

try {
  if (fs.existsSync(publicDir)) {
    const entries = fs.readdirSync(publicDir);
    let cleaned = false;
    
    for (const entry of entries) {
      // Remove _next folder and other build artifacts, but keep static assets
      // Keep: images, fonts, icons, etc. (common static asset extensions)
      const entryPath = path.join(publicDir, entry);
      const stats = fs.statSync(entryPath);
      
      // Remove _next folder (Next.js build output)
      if (entry === '_next') {
        fs.rmSync(entryPath, { recursive: true, force: true });
        console.log('  Removed _next/ folder');
        cleaned = true;
      }
      // Remove HTML files (build output, not static assets)
      else if (stats.isFile() && entry.endsWith('.html')) {
        fs.unlinkSync(entryPath);
        console.log(`  Removed ${entry}`);
        cleaned = true;
      }
    }
    
    if (!cleaned) {
      console.log('  No build artifacts found in public/');
    } else {
      console.log('✓ Cleaned public/ directory');
    }
  } else {
    console.log('  public/ directory does not exist');
  }
} catch (error) {
  console.error('Error cleaning public directory:', error.message);
  process.exit(1);
}

