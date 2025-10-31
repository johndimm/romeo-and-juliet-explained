#!/usr/bin/env node
/*
  Fill gaps in data/explanations.json using data/metadata.json.
  - Keeps all existing explanation entries intact
  - Adds a minimal placeholder entry for every speech missing a note, even when
    the speaker is not in the dramatis personae (e.g., NURSE, SERVANT variants)
  - Writes merged output to data/explanations.filled.json (non-destructive)

  Placeholder schema matches existing objects:
  {
    act, scene, speaker, startOffset, endOffset,
    content: "", provider: "", model: "", perplexity: 50
  }
*/

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const metaPath = path.join(root, 'data', 'metadata.json');
const expPath = path.join(root, 'data', 'explanations.json');
const outPath = path.join(root, 'data', 'explanations.filled.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function findActSceneForOffset(meta, offset) {
  const scenes = Array.isArray(meta.scenes) ? meta.scenes : [];
  for (const sc of scenes) {
    if (typeof sc.startOffset === 'number' && typeof sc.endOffset === 'number') {
      if (offset >= sc.startOffset && offset <= sc.endOffset) {
        return { act: sc.act, scene: sc.scene, sceneStart: sc.startOffset, sceneEnd: sc.endOffset };
      }
    }
  }
  // Fallback for Prologue
  return { act: 'Prologue', scene: '', sceneStart: 0, sceneEnd: Infinity };
}

function buildEndOffset(meta, speeches, idx) {
  const cur = speeches[idx];
  const next = speeches[idx + 1];
  if (next && typeof next.offset === 'number') return next.offset;
  const ctx = findActSceneForOffset(meta, cur.offset);
  return ctx.sceneEnd ?? (cur.offset + 1);
}

function main() {
  const meta = readJson(metaPath);
  const existing = readJson(expPath);

  const byStart = new Map();
  for (const it of existing) {
    if (typeof it?.startOffset === 'number') byStart.set(it.startOffset, true);
  }

  const speeches = Array.isArray(meta.speeches) ? meta.speeches : [];
  const additions = [];

  for (let i = 0; i < speeches.length; i++) {
    const sp = speeches[i];
    const start = sp.offset;
    if (typeof start !== 'number') continue;
    if (byStart.has(start)) continue; // already have an explanation

    const ctx = findActSceneForOffset(meta, start);
    const end = buildEndOffset(meta, speeches, i);

    additions.push({
      act: ctx.act,
      scene: ctx.scene,
      speaker: String(sp.speaker || ''),
      startOffset: start,
      endOffset: end,
      content: '',
      provider: '',
      model: '',
      perplexity: 50
    });
  }

  const merged = existing.concat(additions);
  // Keep stable order: sort by startOffset
  merged.sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));

  writeJson(outPath, merged);
  console.log(`Filled ${additions.length} missing items. Wrote: ${path.relative(root, outPath)}`);
}

main();


