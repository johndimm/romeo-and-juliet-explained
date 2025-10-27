#!/usr/bin/env node
/**
 * Score perplexity (0–100) for explanations using the LLM (DeepSeek).
 *
 * Default input: data/explanations.json
 * Writes perplexity back to the same file (or --out file).
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/score-perplexity-deepseek.mjs \
 *     [--in data/explanations.json] [--out data/explanations.json] \
 *     [--force] [--concurrency 2] [--rate 600] [--model deepseek-chat]
 *
 * The score is based on the speech text (not the explanation). The LLM returns
 * a number 0–100 for how difficult this speech is for a typical HS reader.
 */

import fs from 'fs';
import path from 'path';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

function args() {
  const a = process.argv.slice(2);
  const out = { in: 'data/explanations.json', out: null, force: false, concurrency: 2, rate: 600, model: 'deepseek-chat' };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--in' && a[i + 1]) out.in = a[++i];
    else if (k === '--out' && a[i + 1]) out.out = a[++i];
    else if (k === '--force') out.force = true;
    else if (k === '--concurrency' && a[i + 1]) out.concurrency = parseInt(a[++i], 10) || out.concurrency;
    else if (k === '--rate' && a[i + 1]) out.rate = parseInt(a[++i], 10) || out.rate;
    else if (k === '--model' && a[i + 1]) out.model = a[++i];
  }
  if (!out.out) out.out = out.in;
  return out;
}

function loadJSON(p) { return JSON.parse(fs.readFileSync(path.join(process.cwd(), p), 'utf8')); }

function sliceText(sectionsWithOffsets, startOffset, endOffset) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const parts = [];
  for (const sec of sectionsWithOffsets) {
    const b0 = sec.startOffset;
    const b1 = b0 + enc.encode(sec.text || '').length;
    if (b1 <= startOffset) continue;
    if (b0 >= endOffset) break;
    const from = Math.max(0, startOffset - b0);
    const to = Math.min(b1, endOffset) - b0;
    parts.push(dec.decode(enc.encode(sec.text || '').slice(from, to)));
  }
  return parts.join('');
}

function sysPrompt() {
  return [
    'You are rating how difficult a Romeo and Juliet speech is for a typical high-school reader.',
    'Return ONLY a compact JSON object: {"score": <0-100>, "reason": "..."}.',
    'Scoring rubric (0=very easy, 100=very difficult):',
    '- Archaic vocabulary/idioms density',
    '- Inverted or elliptical syntax; compressed metaphors',
    '- Cultural references that need context',
    '- Sentence length/complexity',
    'Aim for calibrated, consistent numbers. Do not include Markdown or prose outside JSON.'
  ].join('\n');
}

function userPrompt({ act, scene, speaker, text }) {
  return [`Act ${act || ''}, Scene ${scene || ''} — Speaker: ${speaker || 'Unknown'}`, 'Speech text:', text, 'Rate difficulty now. JSON only.'].join('\n');
}

async function callDeepseek({ apiKey, model, system, user }) {
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.2, messages: [ { role: 'system', content: system }, { role: 'user', content: user } ] }),
  });
  if (!resp.ok) throw new Error(`DeepSeek error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || '';
}

function parseScore(raw) {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : raw);
    const s = Math.max(0, Math.min(100, parseInt(j.score, 10) || 0));
    const r = (j.reason || '').toString();
    return { score: s, reason: r };
  } catch (e) { return { score: 0, reason: '' }; }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const { in: inPath, out: outPath, force, concurrency, rate, model } = args();
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_api_key;
  if (!apiKey) { console.error('Missing DEEPSEEK_API_KEY'); process.exit(1); }
  const arr = loadJSON(inPath);
  const { sections: sectionsWithOffsets } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  const system = sysPrompt();

  // Prepare tasks only for items that need scoring
  const tasks = arr.map((it, idx) => async () => {
    if (!force && typeof it.perplexity === 'number') return null;
    const text = sliceText(sectionsWithOffsets, it.startOffset || 0, it.endOffset || (it.startOffset || 0) + 1).trim();
    if (!text) return { idx, score: 0, reason: '' };
    const user = userPrompt({ act: it.act, scene: it.scene, speaker: it.speaker, text });
    const raw = await callDeepseek({ apiKey, model, system, user });
    const { score, reason } = parseScore(raw);
    return { idx, score, reason };
  });

  let i = 0; const results = [];
  const workers = Math.max(1, concurrency);
  const runners = Array.from({ length: workers }, () => (async () => {
    while (i < tasks.length) {
      const my = i++;
      try {
        const r = await tasks[my]();
        if (r) { results.push(r); console.log(`[${results.length}/${tasks.length}] idx=${r.idx} score=${r.score}`); }
      } catch (e) {
        console.error('Score failed at', my, e.message || e);
      }
      await sleep(rate);
    }
  })());
  await Promise.all(runners);

  // Apply results
  for (const r of results) {
    if (!r) continue;
    arr[r.idx] = { ...arr[r.idx], perplexity: r.score, perplexityReason: r.reason };
  }
  fs.writeFileSync(path.join(process.cwd(), outPath), JSON.stringify(arr, null, 2));
  console.log(`Scored ${results.length} items -> ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

