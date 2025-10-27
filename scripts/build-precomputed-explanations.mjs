#!/usr/bin/env node
// Rough scaffolding to build data/explanations.json
// Chunks the play into paragraphs/speeches using the existing metadata and
// writes a file with entries: { startOffset, endOffset, character?, content }
// Fill `makeExplanation` to call your LLM provider offline, or keep placeholders.

import fs from 'fs';
import path from 'path';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

function loadMetadata() {
  const p = path.join(process.cwd(), 'data', 'metadata.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function chunkParagraphs(sectionsWithOffsets, metadata) {
  // Minimal chunking: split each section by blank lines as paragraphs;
  // map each paragraph to a byte-offset range in the original text.
  const all = [];
  for (const sec of sectionsWithOffsets) {
    const base = sec.startOffset;
    const text = sec.text || '';
    const parts = text.split(/\n\s*\n+/g);
    let cursor = 0;
    for (const p of parts) {
      const idx = text.indexOf(p, cursor);
      if (idx < 0) continue;
      const before = text.slice(0, idx);
      const enc = new TextEncoder();
      const start = base + enc.encode(before).length;
      const end = start + enc.encode(p).length;
      all.push({ startOffset: start, endOffset: end, text: p });
      cursor = idx + p.length;
    }
  }
  return all;
}

async function makeExplanation(_chunk) {
  // TODO: call your LLM provider and return a string.
  // For now, return a placeholder to demonstrate plumbing.
  return 'Precomputed explanation placeholder for this paragraph.';
}

async function main() {
  const { sections: sectionsWithOffsets } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  let metadata = null;
  try { metadata = loadMetadata(); } catch {}
  const chunks = chunkParagraphs(sectionsWithOffsets, metadata);
  const out = [];
  for (const ch of chunks) {
    const content = await makeExplanation(ch);
    out.push({ startOffset: ch.startOffset, endOffset: ch.endOffset, content });
  }
  const outPath = path.join(process.cwd(), 'data', 'explanations.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} precomputed explanations to ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

