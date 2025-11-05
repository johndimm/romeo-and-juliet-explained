#!/usr/bin/env node
/**
 * Fix the Chinese note in Act III Scene I for Mercutio's "Couple it with something" line
 * Regenerate it in English using the API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local for API key
try {
  const envLocal = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envLocal)) {
    const content = fs.readFileSync(envLocal, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
} catch {}

const explPath = path.join(process.cwd(), 'data', 'explanations_actIII_sceneI.json');
const explanations = JSON.parse(fs.readFileSync(explPath, 'utf8'));

// Find the Chinese note (startOffset: 69024)
const chineseNoteIndex = explanations.findIndex(e => 
  e.startOffset === 69024 && 
  e.content && 
  /[\u4e00-\u9fff]/.test(e.content)
);

if (chineseNoteIndex === -1) {
  console.log('Chinese note not found. It may have already been fixed.');
  process.exit(0);
}

console.log('Found Chinese note at index', chineseNoteIndex);
console.log('Current content:', explanations[chineseNoteIndex].content);

// The text to explain
const selectionText = "And but one word with one of us? Couple it with something; make it a word and a blow.";

// Call the API to regenerate in English
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const explainUrl = `${apiUrl}/api/explain`;

console.log('Calling API to regenerate explanation in English...');

const response = await fetch(explainUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    selectionText: selectionText,
    context: {
      act: 'III',
      scene: 'I',
      speaker: 'MERCUTIO',
      onStage: []
    },
    options: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      language: 'English',
      educationLevel: 'High school',
      age: '16',
      length: 'brief'
    },
    messages: [],
    mode: 'brief'
  })
});

if (!response.ok) {
  const errorText = await response.text();
  console.error(`API error ${response.status}:`, errorText);
  process.exit(1);
}

const data = await response.json();
const newContent = data.content || '';

if (!newContent) {
  console.error('No content returned from API');
  process.exit(1);
}

console.log('New English content:', newContent);

// Update the explanation
explanations[chineseNoteIndex].content = newContent;
explanations[chineseNoteIndex].provider = 'deepseek';
explanations[chineseNoteIndex].model = 'deepseek-chat';

// Save the updated file
fs.writeFileSync(explPath, JSON.stringify(explanations, null, 2) + '\n', 'utf8');

console.log('✅ Updated explanation in', explPath);
console.log('Note: You may also need to update data/explanations.json if it includes this entry');

