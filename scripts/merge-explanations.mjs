#!/usr/bin/env node
/**
 * Merge one or more scene JSON files into data/explanations.json
 *
 * - Scans data/explanations_*.json by default
 * - You can also pass files: node scripts/merge-explanations.mjs data/foo.json data/bar.json
 * - Dedupe by (startOffset,endOffset,speaker)
 */

import fs from 'fs';
import path from 'path';

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

function uniqKey(it) {
  const a = it && typeof it.startOffset === 'number' ? it.startOffset : -1;
  const b = it && typeof it.endOffset === 'number' ? it.endOffset : -1;
  const s = (it && it.speaker) ? String(it.speaker).toUpperCase() : '';
  return `${a}:${b}:${s}`;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  const args = process.argv.slice(2);
  let sources = [];
  if (args.length) {
    sources = args;
  } else {
    try {
      const files = fs.readdirSync(dataDir).filter(f => /^explanations_.*\.json$/i.test(f));
      sources = files.map(f => path.join(dataDir, f));
    } catch {}
  }

  if (!sources.length) {
    console.log('No scene files found (data/explanations_*.json). Provide files as args if needed.');
    process.exit(0);
  }

  const basePath = path.join(dataDir, 'explanations.json');
  const base = loadJson(basePath);
  const merged = [...base];
  const seen = new Set(base.map(uniqKey));

  let added = 0;
  for (const src of sources) {
    const arr = loadJson(src);
    for (const it of arr) {
      const k = uniqKey(it);
      if (!seen.has(k)) { seen.add(k); merged.push(it); added++; }
    }
  }

  merged.sort((a,b)=> (a.startOffset||0)-(b.startOffset||0));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(basePath, JSON.stringify(merged, null, 2));
  console.log(`Merged ${sources.length} file(s). Added ${added}. Total ${merged.length}. Wrote ${basePath}`);
}

main().catch(e => { console.error(e); process.exit(1); });

