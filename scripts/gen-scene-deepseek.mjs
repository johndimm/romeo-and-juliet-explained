#!/usr/bin/env node
/**
 * Generate precomputed explanations for every character speech in a scene.
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/gen-scene-deepseek.mjs --act=I --scene=I [--out=data/explanations_actI_sceneI.json]
 *
 * Notes:
 * - Uses DeepSeek Chat API (model: deepseek-chat)
 * - Reads lib/parseText.js + data/metadata.json to map byte offsets
 * - Writes an array of { act, scene, speaker, startOffset, endOffset, content }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { act: 'I', scene: 'I', out: null, rate: 600, model: 'deepseek-chat', concurrency: 2 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--act' && args[i + 1]) { out.act = args[++i]; continue; }
    if (a === '--scene' && args[i + 1]) { out.scene = args[++i]; continue; }
    if (a === '--out' && args[i + 1]) { out.out = args[++i]; continue; }
    if (a === '--model' && args[i + 1]) { out.model = args[++i]; continue; }
    if (a === '--rate' && args[i + 1]) { out.rate = parseInt(args[++i], 10) || out.rate; continue; }
    if (a === '--concurrency' && args[i + 1]) { out.concurrency = parseInt(args[++i], 10) || out.concurrency; continue; }
  }
  if (!out.out) out.out = path.join(process.cwd(), `data/explanations_act${out.act}_scene${out.scene}.json`);
  return out;
}

function loadMetadata() {
  const p = path.join(process.cwd(), 'data', 'metadata.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function romanEq(a, b) { return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase(); }

function findSceneRange(meta, act, scene) {
  const s = (meta.scenes || []).find((x) => romanEq(x.act, act) && romanEq(x.scene, scene));
  if (!s || s.startOffset == null || s.endOffset == null) throw new Error(`Scene not found in metadata: Act ${act} Scene ${scene}`);
  return { startOffset: s.startOffset, endOffset: s.endOffset };
}

function collectSpeeches(meta, range) {
  const list = (meta.speeches || []).filter((sp) => sp && typeof sp.offset === 'number' && sp.offset >= range.startOffset && sp.offset < range.endOffset);
  // Determine end offset for each speech = next speech/stage event/scene end
  const markers = [];
  for (const sp of meta.speeches || []) { if (typeof sp.offset === 'number') markers.push({ t: 'speech', offset: sp.offset }); }
  for (const ev of meta.stageEvents || []) { if (typeof ev.offset === 'number') markers.push({ t: 'stage', offset: ev.offset }); }
  markers.sort((a, b) => a.offset - b.offset);
  function nextOffset(after) {
    for (const m of markers) { if (m.offset > after) return m.offset; }
    return range.endOffset;
  }
  return list.map((sp) => ({
    speaker: sp.speaker || '',
    startOffset: sp.offset,
    endOffset: Math.min(nextOffset(sp.offset), range.endOffset),
  }));
}

function sliceTextByOffsets(sectionsWithOffsets, start, end) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let parts = [];
  for (const sec of sectionsWithOffsets) {
    const s0 = sec.startOffset;
    const e0 = s0 + enc.encode(sec.text || '').length;
    if (e0 <= start) continue;
    if (s0 >= end) break;
    const from = Math.max(start, s0) - s0;
    const to = Math.min(end, e0) - s0;
    // Convert bytes -> char indices by slicing encoded buffers
    const buf = enc.encode(sec.text || '');
    const sub = buf.slice(from, to);
    parts.push(dec.decode(sub));
  }
  return parts.join('');
}

function buildSystemPrompt() {
  return [
    'You are a helpful literature tutor who explains Romeo and Juliet clearly and accurately.',
    'Audience: high school level; Language: English.',
    'Write the explanation directly: no prefaces like "In this quote". Do not repeat the quote and do not restate Act/Scene/Speaker.',
    'Avoid boilerplate ("pivotal", "foreshadows") unless these lines themselves justify it; be concrete.',
    'Clarify any archaic words/idioms or tricky syntax very briefly, then give a precise paraphrase.',
    'Assume adjacent speeches/paragraphs may also have notes: do not repeat the same scene-level theme/plot point in every note; focus on what is new or specific to these exact lines and keep it short if it continues an already-explained idea.',
  ].join('\n');
}

function buildUserPrompt({ act, scene, speaker, text }) {
  return [
    `Act ${act}, Scene ${scene}. Speaker: ${speaker || 'Unknown'}.`,
    'Explain the following speech concisely (2–3 sentences if straightforward).',
    'Text:',
    text,
  ].join('\n');
}

async function deepseekExplain({ model, apiKey, system, user }) {
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'deepseek-chat', temperature: 0.3, messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ] }),
  });
  if (!resp.ok) throw new Error(`DeepSeek error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return content.trim();
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const { act, scene, out, model, rate, concurrency } = parseArgs();
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_api_key;
  if (!apiKey) {
    console.error('Missing DEEPSEEK_API_KEY. Set it in your environment or .env.local.');
    process.exit(1);
  }
  const { sections: sectionsWithOffsets } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  const metadata = loadMetadata();
  const range = findSceneRange(metadata, act, scene);
  const speeches = collectSpeeches(metadata, range);
  console.log(`Act ${act}, Scene ${scene}: ${speeches.length} speeches found.`);
  console.log(`Output: ${out}`);

  const system = buildSystemPrompt();
  const tasks = speeches.map((sp) => async () => {
    const text = sliceTextByOffsets(sectionsWithOffsets, sp.startOffset, sp.endOffset).trim();
    const user = buildUserPrompt({ act, scene, speaker: sp.speaker, text });
    const content = await deepseekExplain({ model, apiKey, system, user });
    return { act, scene, speaker: sp.speaker, startOffset: sp.startOffset, endOffset: sp.endOffset, content, provider: 'deepseek', model };
  });

  // Concurrency + rate limiter
  const results = [];
  let idx = 0;
  const runners = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
    while (idx < tasks.length) {
      const my = idx++;
      try {
        const item = await tasks[my]();
        results.push(item);
        const done = results.length;
        const total = speeches.length;
        const pct = Math.floor((done / total) * 100);
        console.log(`[${done}/${total}] ${pct}% ${item.speaker || 'Unknown'} @ ${item.startOffset}`);
        // Write a checkpoint every 5 items
        if (done % 5 === 0) {
          const tmp = out.replace(/\.json$/, '.partial.json');
          try { fs.writeFileSync(tmp, JSON.stringify(results.slice().sort((a,b)=>a.startOffset-b.startOffset), null, 2)); } catch {}
        }
      } catch (e) {
        console.error(`Failed speech ${my + 1}/${tasks.length}:`, e.message || e);
      }
      await sleep(rate);
    }
  });
  await Promise.all(runners);

  results.sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} explanations to ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
