#!/usr/bin/env node
/**
 * Generate explanations for a single scene with ONE LLM call.
 * The model receives the full scene text and a list of speeches
 * (speaker + byte offsets). It must return a JSON array with one
 * item per speech: { speaker, startOffset, endOffset, content }.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/gen-scene-batch-deepseek.mjs --act I --scene I \
 *     [--model deepseek-chat] [--out data/explanations_actI_sceneI.json]
 */

import fs from 'fs';
import path from 'path';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

// Load .env.local if it exists
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

function args() {
  const out = { act: 'I', scene: 'I', model: 'deepseek-chat', out: null };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--act' && a[i + 1]) out.act = a[++i];
    else if (k === '--scene' && a[i + 1]) out.scene = a[++i];
    else if (k === '--model' && a[i + 1]) out.model = a[++i];
    else if (k === '--out' && a[i + 1]) out.out = a[++i];
  }
  if (!out.out) {
    // Handle Prologue with special filename
    if (String(out.act || '').trim().toUpperCase() === 'PROLOGUE') {
      out.out = path.join(process.cwd(), 'data/explanations_prologue.json');
    } else {
      out.out = path.join(process.cwd(), `data/explanations_act${out.act}_scene${out.scene}.json`);
    }
  }
  return out;
}

function loadMetadata() {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'metadata.json'), 'utf8'));
}

function romanEq(a, b) { return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase(); }

function findScene(meta, act, scene) {
  // Handle Prologue specially (act="Prologue", scene="")
  const actUpper = String(act || '').trim().toUpperCase();
  if (actUpper === 'PROLOGUE') {
    const s = (meta.scenes || []).find((x) => String(x.act || '').trim().toUpperCase() === 'PROLOGUE');
    if (!s) throw new Error(`Prologue not found in metadata`);
    return s;
  }
  const s = (meta.scenes || []).find((x) => romanEq(x.act, act) && romanEq(x.scene, scene));
  if (!s) throw new Error(`Scene not found: ${act} ${scene}`);
  return s;
}

function speechesInScene(meta, scene) {
  const within = (off) => off >= (scene.startOffset || 0) && off < (scene.endOffset || 0);
  // compute end offsets by looking at the next speech/stage event/scene end
  const stage = Array.isArray(meta.stageEvents) ? meta.stageEvents : [];
  const stops = new Set(stage.filter(ev => within(ev.offset||-1)).map(ev => ev.offset));
  const list = (meta.speeches || []).filter((sp) => within(sp.offset || -1)).map(sp => ({ speaker: sp.speaker, startOffset: sp.offset }));
  // determine end
  const sortedStops = Array.from(stops).sort((a,b)=>a-b);
  const sortedStarts = list.map(x=>x.startOffset).sort((a,b)=>a-b);
  const ends = [];
  for (let i=0;i<sortedStarts.length;i++){
    let e = scene.endOffset;
    const nextStart = sortedStarts[i+1];
    if (typeof nextStart === 'number') e = Math.min(e, nextStart);
    const afterStops = sortedStops.filter(s => s>sortedStarts[i]);
    if (afterStops.length) e = Math.min(e, afterStops[0]);
    ends.push(e);
  }
  return list.map((sp, i) => ({ ...sp, endOffset: ends[i] }));
}

function sliceByBytes(sectionsWithOffsets, startB, endB){
  const enc = new TextEncoder(); const dec = new TextDecoder();
  let out='';
  for (const sec of sectionsWithOffsets){
    const b0 = sec.startOffset || 0; const txt = sec.text || '';
    const b1 = b0 + enc.encode(txt).length;
    if (b1 <= startB) continue; if (b0 >= endB) break;
    const sub = enc.encode(txt).slice(Math.max(0,startB-b0), Math.min(b1-startB, endB-startB));
    out += dec.decode(sub);
  }
  return out;
}

function systemPrompt(){
  return [
    'You are a careful Shakespeare tutor. Given a full scene of Romeo and Juliet and the list of speeches (speaker + byte offsets),',
    'write an explanation for each speech that is precise, non-repetitive across the scene, and helpful to a student reader.',
    'Prioritize: (a) brief glosses for archaic words/idioms where needed; (b) a clear explanation of the meaning that connects the clauses; (c) a brief note of dramatic purpose when relevant.',
    'Also include a difficulty rating per speech as "perplexity" on a 0–100 scale (0 easy – 100 very difficult) for a typical high‑school reader, based on archaic vocabulary, inverted/elliptical syntax, dense metaphor, and needed cultural context.',
    'Do NOT restate act/scene/speaker, do NOT re-quote the lines, and do NOT prefix with labels like "Paraphrase:", "Summary:", or similar. The content should be plain sentences only.',
    'Your output MUST be a strict JSON array ONLY, no extra prose, no Markdown fences, no comments. Each item exactly: {"speaker":"…","startOffset":123,"endOffset":456,"content":"…","perplexity":42}',
    'Use double quotes for all JSON strings. No trailing commas. The array length must equal the number of provided speeches.'
  ].join('\n');
}

function userPrompt({ act, scene, sceneText, speeches }){
  const isPrologue = String(act || '').trim().toUpperCase() === 'PROLOGUE';
  const header = isPrologue ? 'The Prologue' : `Act ${act}, Scene ${scene}`;
  return [
    header,
    '',
    'Scene text (UTF-8; byte offsets refer to this same edition):',
    '"""',
    sceneText,
    '"""',
    '',
    'Speeches with byte ranges (array length N):',
    JSON.stringify(speeches, null, 2),
    '',
    'Return JSON array of length N (one per speech), in order, matching each entry by startOffset/endOffset.'
  ].join('\n');
}

async function callDeepseek({ apiKey, model, system, user }){
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'deepseek-chat', temperature: 0.2, messages: [ { role: 'system', content: system }, { role: 'user', content: user } ] })
  });
  if (!resp.ok) throw new Error(`DeepSeek error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

function extractJsonArray(text){
  // 1) If fenced code block, prefer it
  const fence = text.match(/```(?:json|\w+)?\n([\s\S]*?)```/i);
  if (fence) {
    const body = fence[1].trim();
    const arr = tryParseArray(body);
    if (arr) return arr;
  }
  // 2) Scan for top-level JSON array using bracket depth (ignoring strings)
  const sub = findTopLevelArray(text);
  if (sub) {
    const arr = tryParseArray(sub);
    if (arr) return arr;
  }
  // 3) Try to find an items array in an object
  const objFence = text.match(/\{[\s\S]*\}/);
  if (objFence) {
    const body = objFence[0];
    try { const o = JSON.parse(body); if (Array.isArray(o?.items)) return o.items; } catch {}
  }
  throw new Error('Failed to parse JSON array from model output');
}

function findTopLevelArray(text){
  let i=0, depth=0, inStr=false, esc=false, start=-1;
  while (i<text.length){
    const ch = text[i];
    if (inStr){
      if (esc) esc=false; else if (ch==='\\') esc=true; else if (ch==='"') inStr=false;
    } else {
      if (ch==='"') inStr=true;
      else if (ch==='['){ if (depth===0) start=i; depth++; }
      else if (ch===']'){ if (depth>0){ depth--; if (depth===0 && start>=0) return text.slice(start,i+1); } }
    }
    i++;
  }
  return null;
}

function tryParseArray(s){
  // Normalize some common issues: dangling commas, JSON with single quotes (rare)
  let t = s.trim();
  // If starts with ```json or similar accidentally included, strip
  t = t.replace(/^```\w*\n|```$/g, '').trim();
  try { const j = JSON.parse(t); if (Array.isArray(j)) return j; } catch {}
  // Try to coerce single quotes to double quotes if no double quotes exist
  if (t.indexOf('"')<0 && t.indexOf("'")>=0){
    try { const j = JSON.parse(t.replace(/'/g,'"')); if (Array.isArray(j)) return j; } catch {}
  }
  // Remove trailing commas in arrays/objects
  try {
    const fixed = t.replace(/,\s*([\]\}])/g, '$1');
    const j = JSON.parse(fixed); if (Array.isArray(j)) return j;
  } catch {}
  return null;
}

async function main(){
  const { act, scene, model, out, chunk } = args();
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_api_key;
  if (!apiKey) { console.error('Missing DEEPSEEK_API_KEY'); process.exit(1); }
  const { sections: sectionsWithOffsets } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  const meta = loadMetadata();
  const sc = findScene(meta, act, scene);
  const speechRanges = speechesInScene(meta, sc);
  const system = systemPrompt();

  // Run in chunks to avoid output truncation
  async function runChunk(startIdx, endIdx){
    const sub = speechRanges.slice(startIdx, endIdx);
    const subStart = sub[0].startOffset;
    const subEnd = sub[sub.length - 1].endOffset;
    const subText = sliceByBytes(sectionsWithOffsets, subStart, subEnd);
    const user = userPrompt({ act, scene, sceneText: subText, speeches: sub });
    const raw = await callDeepseek({ apiKey, model, system, user });
    try { fs.mkdirSync(path.join(process.cwd(),'logs'), { recursive: true }); fs.writeFileSync(path.join(process.cwd(),'logs',`scene_${act}_${scene}_raw_${startIdx}-${endIdx-1}.txt`), raw); } catch {}
    let parsed;
    try { parsed = extractJsonArray(raw); }
    catch (err) { console.error(`\n[Chunk ${startIdx}-${endIdx-1}] JSON parse failed.`); console.error("\n----- MODEL OUTPUT (UNPARSED) -----\n" + raw + "\n----- END OUTPUT -----\n"); throw err; }
    return parsed;
  }

  const batchSize = Number.isFinite(chunk) ? chunk : 16;
  let arr = [];
  for (let i = 0; i < speechRanges.length; i += batchSize) {
    const end = Math.min(speechRanges.length, i + batchSize);
    const piece = await runChunk(i, end);
    arr = arr.concat(piece);
  }
  // Normalize fields & attach act/scene/model/provider
  // For Prologue, use act='Prologue' and scene=''
  const isPrologue = String(act || '').trim().toUpperCase() === 'PROLOGUE';
  const finalAct = isPrologue ? 'Prologue' : act;
  const finalScene = isPrologue ? '' : scene;
  const clamp = (n)=>{ const v = parseInt(n,10); return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0; };
  arr = arr.map((x) => ({
    act: finalAct, scene: finalScene,
    speaker: String(x.speaker || '').trim(),
    startOffset: Number(x.startOffset || x.start || 0),
    endOffset: Number(x.endOffset || x.end || 0),
    content: String(x.content || x.explanation || '').trim(),
    provider: 'deepseek', model,
    perplexity: clamp(x.perplexity)
  })).filter((x) => x.content && Number.isFinite(x.startOffset) && Number.isFinite(x.endOffset));
  // Sort and write
  arr.sort((a,b)=> (a.startOffset||0) - (b.startOffset||0));
  // Score perplexity (0–100) per speech using DeepSeek (fallback only if missing)
  async function scorePerplexity(it){
    const sys = [
      'You are rating how difficult a Romeo and Juliet speech is for a typical high-school reader.',
      'Return ONLY JSON: {"score": <0-100>}.',
      'Consider archaic vocabulary, inverted/elliptical syntax, density of metaphor, and needed cultural context.'
    ].join('\n');
    const speechText = sliceByBytes(sectionsWithOffsets, it.startOffset||0, it.endOffset||((it.startOffset||0)+1)).trim();
    if (!speechText) return 0;
    const isPrologue = String(act || '').trim().toUpperCase() === 'PROLOGUE';
    const header = isPrologue ? 'The Prologue' : `Act ${act}, Scene ${scene}`;
    const usr = [`${header} — Speaker: ${it.speaker||'Unknown'}`, 'Speech text:', speechText, 'Rate difficulty now. JSON only.'].join('\n');
    const out = await callDeepseek({ apiKey, model, system: sys, user: usr });
    try { const m = out.match(/\{[\s\S]*\}/); const j = JSON.parse(m?m[0]:out); const s=parseInt(j.score,10); return Number.isFinite(s)?Math.max(0,Math.min(100,s)):0; } catch { return 0; }
  }
  for (let i=0;i<arr.length;i++){
    if (typeof arr[i].perplexity === 'number' && Number.isFinite(arr[i].perplexity) && arr[i].perplexity>0) continue;
    try { arr[i].perplexity = await scorePerplexity(arr[i]); } catch { arr[i].perplexity = 0; }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(arr, null, 2));
  console.log(`Wrote ${arr.length} -> ${out}`);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
