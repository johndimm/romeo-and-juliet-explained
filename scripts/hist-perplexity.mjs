#!/usr/bin/env node
/**
 * Print a histogram of perplexity scores from data/explanations.json.
 * Supports both LLM 0–100 scores and raw LM perplexity (e.g., GPT‑2) and
 * normalizes raw PPL to 0–100 using the same mapping as the app.
 *
 * Usage:
 *   node scripts/hist-perplexity.mjs [--in data/explanations.json] [--bins 10] [--no-normalize]
 */

import fs from 'fs';
import path from 'path';

function args() {
  const a = process.argv.slice(2);
  const out = { in: 'data/explanations.json', bins: 10, normalize: true };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--in' && a[i + 1]) out.in = a[++i];
    else if (k === '--bins' && a[i + 1]) out.bins = parseInt(a[++i], 10) || out.bins;
    else if (k === '--no-normalize') out.normalize = false;
  }
  return out;
}

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), p), 'utf8'));
}

// Same normalization used in the app
function normalizedPerplexity(it) {
  let p = Number(it?.perplexity ?? it?.confusion ?? 0);
  if (!Number.isFinite(p) || p < 0) p = 0;
  const model = String(it?.perplexityModel || '').toLowerCase();
  if (p <= 100 && model !== 'gpt2') return Math.max(0, Math.min(100, p));
  const val = Math.log10(Math.max(1, p));
  return Math.max(0, Math.min(100, Math.round(25 * val)));
}

function histogram(values, bins, min=0, max=100) {
  const counts = new Array(bins).fill(0);
  const width = (max - min) / bins;
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx < 0) idx = 0; if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }
  return { counts, width };
}

function bar(n, maxN, maxWidth=40) {
  if (maxN === 0) return '';
  const w = Math.round((n / maxN) * maxWidth);
  return '█'.repeat(w);
}

function main() {
  const { in: inPath, bins, normalize } = args();
  const arr = loadJSON(inPath);
  if (!Array.isArray(arr)) { console.error('Input must be a JSON array.'); process.exit(1); }
  const valsRaw = [];
  for (const it of arr) {
    let v = Number(it?.perplexity ?? it?.confusion);
    if (!Number.isFinite(v)) continue;
    valsRaw.push({ v, it });
  }
  const vals = valsRaw.map(({ v, it }) => normalize ? normalizedPerplexity(it) : v);
  const total = arr.length;
  const scored = vals.length;
  const above50 = vals.filter(v => v >= 50).length;
  const above70 = vals.filter(v => v >= 70).length;
  const above85 = vals.filter(v => v >= 85).length;
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;

  const { counts, width } = histogram(vals, bins, 0, 100);
  const maxCount = counts.length ? Math.max(...counts) : 0;

  console.log(`File: ${inPath}`);
  console.log(`Items total: ${total}, with perplexity: ${scored}`);
  console.log(`Normalized: ${normalize}`);
  console.log(`Range: ${min}..${max}`);
  console.log(`>=50: ${above50}, >=70: ${above70}, >=85: ${above85}`);
  console.log('Histogram (0..100):');
  for (let i = 0; i < counts.length; i++) {
    const lo = Math.round(i * width);
    const hi = Math.round((i + 1) * width);
    const c = counts[i];
    console.log(`${String(lo).padStart(3)}–${String(hi).padEnd(3)} | ${String(c).padStart(4)} ${bar(c, maxCount)}`);
  }
}

main();

