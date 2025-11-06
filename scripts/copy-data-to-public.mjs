import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const publicDataDir = path.join(rootDir, 'public', 'data');
const explanationsFile = path.join(dataDir, 'explanations.json');
const publicExplanationsFile = path.join(publicDataDir, 'explanations.json');

// Create public/data directory if it doesn't exist
if (!fs.existsSync(publicDataDir)) {
  fs.mkdirSync(publicDataDir, { recursive: true });
}

// Copy explanations.json to public/data/ if it exists
if (fs.existsSync(explanationsFile)) {
  fs.copyFileSync(explanationsFile, publicExplanationsFile);
  console.log('✓ Copied explanations.json to public/data/');
} else {
  console.warn('⚠ explanations.json not found in data/, skipping copy');
}

