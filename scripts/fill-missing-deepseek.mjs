#!/usr/bin/env node
/**
 * Fill missing speech explanations for a scene using DeepSeek.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/fill-missing-deepseek.mjs --act=I --scene=I \
 *     --in=data/explanations_actI_sceneI.json [--out=data/explanations_actI_sceneI.json]
 * Options:
 *   --model deepseek-chat        Model to use (default: deepseek-chat)
 *   --concurrency 2              Number of concurrent requests
 *   --rate 600                   Delay (ms) between tasks per worker
 */

import fs from 'fs';
import path from 'path';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

function args() {
  const out = { act: 'I', scene: 'I', in: null, out: null, model: 'deepseek-chat', concurrency: 2, rate: 600, minlen: 20, report: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--act') out.act = a[++i];
    else if (k === '--scene') out.scene = a[++i];
    else if (k === '--in') out.in = a[++i];
    else if (k === '--out') out.out = a[++i];
    else if (k === '--model') out.model = a[++i];
    else if (k === '--concurrency') out.concurrency = parseInt(a[++i], 10) || out.concurrency;
    else if (k === '--rate') out.rate = parseInt(a[++i], 10) || out.rate;
    else if (k === '--minlen') out.minlen = parseInt(a[++i], 10) || 0;
    else if (k === '--report') out.report = true;
  }
  if (!out.in) out.in = path.join(process.cwd(), `data/explanations_act${out.act}_scene${out.scene}.json`);
  if (!out.out) out.out = out.in;
  return out;
}

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function loadMeta() {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'metadata.json'), 'utf8'));
}

function romanEq(a, b) { return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase(); }

function sceneRange(meta, act, scene) {
  const s = (meta.scenes || []).find(x => romanEq(x.act, act) && romanEq(x.scene, scene));
  if (!s || s.startOffset == null || s.endOffset == null) throw new Error(`Scene not found: Act ${act} Scene ${scene}`);
  return { start: s.startOffset, end: s.endOffset };
}

function collectSpeeches(meta, range) {
  const speeches = (meta.speeches || []).filter(sp => sp && typeof sp.offset === 'number' && sp.offset >= range.start && sp.offset < range.end);
  const marks = [];
  for (const sp of meta.speeches || []) if (typeof sp.offset === 'number') marks.push({ t: 'speech', o: sp.offset });
  for (const ev of meta.stageEvents || []) if (typeof ev.offset === 'number') marks.push({ t: 'stage', o: ev.offset });
  marks.sort((a, b) => a.o - b.o);
  const nextAfter = (o) => { for (const m of marks) if (m.o > o) return m.o; return range.end; };
  return speeches.map(sp => ({ speaker: sp.speaker || '', startOffset: sp.offset, endOffset: Math.min(nextAfter(sp.offset), range.end) }));
}

function sliceByOffsets(sectionsWithOffsets, start, end) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const parts = [];
  for (const sec of sectionsWithOffsets) {
    const b0 = sec.startOffset;
    const b1 = b0 + enc.encode(sec.text || '').length;
    if (b1 <= start) continue;
    if (b0 >= end) break;
    const from = Math.max(start, b0) - b0;
    const to = Math.min(end, b1) - b0;
    const sub = enc.encode(sec.text || '').slice(from, to);
    parts.push(dec.decode(sub));
  }
  return parts.join('');
}

// Fallback: scan raw text for SPEAKER. headers within the scene and build speech ranges.
function scanSpeechesFromText(rawText, range) {
  const text = rawText.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  // Build running byte offsets per line start
  const lineByte = new Array(lines.length + 1).fill(0);
  for (let i = 0; i < lines.length; i++) lineByte[i + 1] = lineByte[i] + Buffer.byteLength(lines[i], 'utf8') + 1;
  const items = [];
  let last = null;
  const headerRe = /^[A-Z][A-Z \-]+\.$/;
  for (let i = 0; i < lines.length; i++) {
    const off = lineByte[i];
    if (off < range.start) continue;
    if (off >= range.end) break;
    const L = lines[i].trim();
    if (headerRe.test(L)) {
      // close previous
      if (last) {
        last.endOffset = off; items.push(last); last = null;
      }
      last = { speaker: L.replace(/\.$/, ''), startOffset: off };
    }
  }
  if (last) { last.endOffset = range.end; items.push(last); }
  return items;
}

function sysPrompt() {
  return [
    'You are a helpful literature tutor who explains Romeo and Juliet clearly and accurately.',
    'Audience: high school level; Language: English.',
    'Write the explanation directly; do not repeat the quote or restate Act/Scene/Speaker.',
    'Avoid boilerplate; prefer precise paraphrase and immediate dramatic function.',
    'Briefly clarify archaic words or tricky syntax; then give a concise paraphrase.',
    'Assume adjacent speeches may also be explained: do not repeat scene-level themes/plot; focus on what is new in these exact lines and keep it short when continuing an already-explained idea.',
  ].join('\n');
}

function userPrompt({ act, scene, speaker, text }) {
  return [`Act ${act}, Scene ${scene}. Speaker: ${speaker || 'Unknown'}.`,
    'Explain concisely (about 2–3 sentences if straightforward).',
    'Text:', text].join('\n');
}

async function deepseek({ apiKey, model, system, user }) {
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.3, messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ] }),
  });
  if (!resp.ok) throw new Error(`DeepSeek error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const { act, scene, in: inPath, out: outPath, model, concurrency, rate, minlen, report } = args();
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_api_key;
  if (!apiKey) { console.error('Missing DEEPSEEK_API_KEY'); process.exit(1); }

  const existing = loadJSON(inPath, []);
  const byStart = new Map();
  for (const e of existing || []) {
    if (e && typeof e.startOffset === 'number') byStart.set(e.startOffset, e);
  }
  const { sections: sectionsWithOffsets } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  const meta = loadMeta();
  const range = sceneRange(meta, act, scene);
  let speeches = collectSpeeches(meta, range);
  // Union with fallback headers from raw text (captures cases missed by metadata)
  const raw = fs.readFileSync('romeo-and-juliet.txt', 'utf8');
  const extra = scanSpeechesFromText(raw, range);
  const seen = new Set(speeches.map(s=>s.startOffset));
  for (const e of extra) if (!seen.has(e.startOffset)) speeches.push(e);
  speeches.sort((a,b)=>a.startOffset-b.startOffset);
  const missing = speeches.filter(sp => {
    const ex = byStart.get(sp.startOffset);
    if (!ex) return true;
    const len = (ex.content || '').trim().length;
    return (len < minlen);
  });
  console.log(`Act ${act}, Scene ${scene}: ${speeches.length} speeches; ${missing.length} missing (threshold ${minlen}).`);
  console.log(`Input: ${inPath}`);
  console.log(`Output: ${outPath}`);

  if (report) {
    for (const sp of speeches) {
      const ex = byStart.get(sp.startOffset);
      const len = ex ? (ex.content || '').trim().length : 0;
      console.log(`${ex ? '✔' : '✖'} ${sp.speaker || 'Unknown'} @ ${sp.startOffset} len=${len}`);
    }
  }

  const system = sysPrompt();
  const tasks = missing.map(sp => async () => {
    const text = sliceByOffsets(sectionsWithOffsets, sp.startOffset, sp.endOffset).trim();
    const user = userPrompt({ act, scene, speaker: sp.speaker, text });
    const content = await deepseek({ apiKey, model, system, user });
    return { act, scene, speaker: sp.speaker, startOffset: sp.startOffset, endOffset: sp.endOffset, content, provider: 'deepseek', model };
  });

  const results = existing.slice();
  let idx = 0; const workers = Math.max(1, concurrency);
  const runners = Array.from({ length: workers }, () => (async () => {
    while (idx < tasks.length) {
      const my = idx++;
      try {
        const item = await tasks[my]();
        results.push(item);
        console.log(`[+${results.length - existing.length}/${missing.length}] ${item.speaker || 'Unknown'} @ ${item.startOffset}`);
      } catch (e) {
        console.error('Failed:', e.message || e);
      }
      await sleep(rate);
    }
  })());
  await Promise.all(runners);

  results.sort((a,b)=> (a.startOffset||0)-(b.startOffset||0));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} total items to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
