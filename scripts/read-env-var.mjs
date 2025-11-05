#!/usr/bin/env node
/**
 * Read a specific environment variable from .env.local or return empty string
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envLocalPath = path.join(__dirname, '..', '.env.local');

let apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

// If not set in environment, try reading from .env.local
if (!apiUrl && fs.existsSync(envLocalPath)) {
  try {
    const content = fs.readFileSync(envLocalPath, 'utf-8');
    const match = content.match(/^NEXT_PUBLIC_API_URL\s*=\s*(.+)$/m);
    if (match) {
      apiUrl = match[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
    }
  } catch (e) {
    // Ignore errors reading .env.local
  }
}

// Output the value (or empty string) so it can be used in shell scripts
process.stdout.write(apiUrl);

