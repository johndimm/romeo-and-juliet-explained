#!/usr/bin/env node
// Augment data/metadata.json with missing speech entries by scanning romeo-and-juliet.txt
// It finds heading lines like "FIRST SERVANT." and adds a speech offset for the
// first content line following the heading, if not already present.

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const textPath = path.join(root, 'romeo-and-juliet.txt');
const metaPath = path.join(root, 'data', 'metadata.json');
const backupPath = path.join(root, 'data', 'metadata.backup.json');

function loadTextLines() {
  const raw = fs.readFileSync(textPath, 'utf8').replace(/\r\n?/g, '\n');
  return raw.split('\n');
}

function loadMetadata() {
  const raw = fs.readFileSync(metaPath, 'utf8');
  return JSON.parse(raw);
}

function computeByteOffsets(lines) {
  const cum = new Array(lines.length + 1);
  let off = 0;
  cum[0] = 0;
  for (let i = 0; i < lines.length; i++) {
    off += Buffer.byteLength(lines[i], 'utf8') + 1; // +1 for \n
    cum[i + 1] = off;
  }
  return cum; // cum[i] = byte offset at start of line i
}

function isHeading(line) {
  // Match lines like: "FIRST SERVANT." "SECOND SERVANT." "SERVANT." "NURSE." etc.
  // Uppercase words, spaces, apostrophes, hyphens, ending with a period.
  return /^([A-Z][A-Z '\-–’]+)\.$/.test(line.trim());
}

function extractSpeakerFromHeading(line) {
  const m = /^([A-Z][A-Z '\-–’]+)\.$/.exec(line.trim());
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function findNextContentLineIndex(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i++) {
    if (lines[i].trim().length > 0) return i;
  }
  return null;
}

function main() {
  const lines = loadTextLines();
  const offsets = computeByteOffsets(lines);
  const meta = loadMetadata();
  const speeches = Array.isArray(meta.speeches) ? meta.speeches : [];

  const existingOffsets = new Set(speeches.map((s) => s.offset).filter((n) => typeof n === 'number'));

  const additions = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isHeading(lines[i])) continue;
    const speaker = extractSpeakerFromHeading(lines[i]);
    if (!speaker) continue;

    // The speech content typically starts on the next non-blank line after the heading
    const contentLineIndex = findNextContentLineIndex(lines, i + 1);
    if (contentLineIndex == null) continue;
    const startOffset = offsets[contentLineIndex];

    if (existingOffsets.has(startOffset)) continue; // already present

    additions.push({ offset: startOffset, line: contentLineIndex + 1, speaker });
  }

  if (additions.length === 0) {
    // silent success
    return 0;
  }

  // Keep speeches sorted by offset; append and sort
  const nextSpeeches = speeches.concat(additions).sort((a, b) => (a.offset || 0) - (b.offset || 0));
  const updated = { ...meta, speeches: nextSpeeches };

  // Backup once per run if backup doesn't already exist
  try {
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(metaPath, backupPath);
    }
  } catch {}

  fs.writeFileSync(metaPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  return additions.length;
}

const added = main();
// Use stdout; avoid console.* per project logging guidance
process.stdout.write(`Added ${added} missing speech entries to data/metadata.json\n`);


