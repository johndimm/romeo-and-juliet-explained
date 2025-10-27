#!/usr/bin/env node
/**
 * Compute a rough "perplexity" (confusion score 0–100) for each explanation item
 * in a file (default: data/explanations.json) and write it back with "perplexity".
 *
 * Heuristic only: based on archaic term hits, average sentence length, and type/token ratio.
 *
 * Usage:
 *   node scripts/compute-perplexity.mjs [--in data/explanations.json] [--out data/explanations.json]
 */

import fs from 'fs';
import path from 'path';

function args(){
  const a=process.argv.slice(2); const out={in:'data/explanations.json', out:null};
  for (let i=0;i<a.length;i++){ const k=a[i]; if (k==='--in'&&a[i+1]) out.in=a[++i]; else if (k==='--out'&&a[i+1]) out.out=a[++i]; }
  if (!out.out) out.out=out.in; return out;
}

const archaic = new Set(['wherefore','anon','hie','thou','thee','thy','thine','ye','nay','ere','o\'er','o’er','hath','dost','art','oft','whence','whither','methinks','aught','naught','misadventur’d','misadventurd','canker’d','cankered','partisans']);

function tokenize(s){ return (s.toLowerCase().match(/[a-z\u00C0-\u017F']+/g) || []); }
function sentences(s){ return s.split(/[.!?]+\s+/g).filter(Boolean); }

function score(text){
  const toks = tokenize(text);
  const sents = sentences(text);
  if (!toks.length) return 0;
  const unique = new Set(toks).size;
  const ttr = unique / toks.length; // higher = more varied vocab
  const avgSent = sents.length ? toks.length / sents.length : toks.length; // longer sentences => harder
  const archaicHits = toks.filter(w=>archaic.has(w)).length;
  // Normalize to 0..100 roughly
  const ttrScore = (1 - Math.min(1, Math.max(0, (ttr - 0.2) / 0.6))) * 40; // lower variety => higher perplexity
  const sentScore = Math.min(1, avgSent / 25) * 40; // long sentences up to 40 pts
  const archScore = Math.min(10, archaicHits) * 2; // up to 20 pts
  return Math.round(Math.max(0, Math.min(100, ttrScore + sentScore + archScore)));
}

function run(){
  const {in:inPath, out:outPath} = args();
  const p = path.join(process.cwd(), inPath);
  const data = JSON.parse(fs.readFileSync(p,'utf8'));
  const out = (Array.isArray(data)?data:[]).map((it)=>{
    const txt = (it && it.content)||'';
    const px = score(txt);
    return { ...it, perplexity: px };
  });
  fs.writeFileSync(path.join(process.cwd(), outPath), JSON.stringify(out,null,2));
  console.log(`Scored ${out.length} items -> ${outPath}`);
}

run();

