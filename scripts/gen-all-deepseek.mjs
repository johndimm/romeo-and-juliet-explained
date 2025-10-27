#!/usr/bin/env node
/**
 * Generate explanations for the entire play (every scene, every speech).
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/gen-all-deepseek.mjs \
 *     [--mode=all|missing] [--concurrency 3] [--rate 600] [--model deepseek-chat]
 *
 * Notes:
 * - Writes one file per scene: data/explanations_act<ACT>_scene<SCENE>.json
 * - Also writes a merged data/explanations.json at the end.
 * - "missing" mode skips speeches that already have non-empty content in a scene file.
 */

import fs from 'fs';
import path from 'path';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

function args() {
  const out = { mode: 'all', concurrency: 2, rate: 600, model: 'deepseek-chat', minlen: 20 };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--mode' && a[i + 1]) out.mode = a[++i];
    else if (k === '--concurrency' && a[i + 1]) out.concurrency = parseInt(a[++i], 10) || out.concurrency;
    else if (k === '--rate' && a[i + 1]) out.rate = parseInt(a[++i], 10) || out.rate;
    else if (k === '--model' && a[i + 1]) out.model = a[++i];
    else if (k === '--minlen' && a[i + 1]) out.minlen = parseInt(a[++i], 10) || out.minlen;
  }
  return out;
}

function loadMetadata() {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'metadata.json'), 'utf8'));
}

function romanToInt(s) {
  const vals = { I:1,V:5,X:10,L:50,C:100,D:500,M:1000 }; let total=0, prev=0;
  s = String(s||'').trim().toUpperCase();
  for (let i = s.length-1; i>=0; i--) { const v=vals[s[i]]||0; total += v<prev ? -v : v; prev=v; }
  return total;
}

function scenesOrdered(meta) {
  const list = (meta.scenes || []).slice();
  list.sort((a,b)=>{
    const ra = romanToInt(a.act), rb = romanToInt(b.act);
    if (ra !== rb) return ra - rb;
    return romanToInt(a.scene) - romanToInt(b.scene);
  });
  return list;
}

function sceneOutPath(act, scene) {
  return path.join(process.cwd(), 'data', `explanations_act${act}_scene${scene}.json`);
}

function loadJson(p, d=[]) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } }

function collectSpeeches(meta, range) {
  const speeches = (meta.speeches || []).filter(sp => sp && typeof sp.offset==='number' && sp.offset>=range.startOffset && sp.offset<range.endOffset);
  // Build marker list to find endings
  const marks=[];
  for (const sp of meta.speeches||[]) if (typeof sp.offset==='number') marks.push({t:'sp',o:sp.offset});
  for (const ev of meta.stageEvents||[]) if (typeof ev.offset==='number') marks.push({t:'st',o:ev.offset});
  marks.sort((a,b)=>a.o-b.o);
  const nextAfter = (o)=>{ for (const m of marks) if (m.o>o) return m.o; return range.endOffset; };
  return speeches.map(sp=>({ speaker: sp.speaker||'', startOffset: sp.offset, endOffset: Math.min(nextAfter(sp.offset), range.endOffset) }));
}

function scanSpeechesFromText(rawText, range) {
  const text = rawText.replace(/\r\n?/g,'\n');
  const lines = text.split('\n');
  const lineByte = new Array(lines.length+1).fill(0);
  for (let i=0;i<lines.length;i++) lineByte[i+1]=lineByte[i]+Buffer.byteLength(lines[i],'utf8')+1;
  const headerRe = /^[A-Z][A-Z \-]+\.$/;
  const out=[]; let last=null;
  for (let i=0;i<lines.length;i++){
    const off=lineByte[i]; if (off<range.startOffset) continue; if (off>=range.endOffset) break;
    const L=lines[i].trim(); if (headerRe.test(L)) { if (last){ last.endOffset=off; out.push(last); } last={speaker:L.replace(/\.$/,'') , startOffset:off}; }
  }
  if (last){ last.endOffset=range.endOffset; out.push(last); }
  return out;
}

function sysPrompt(){
  return [
    'You are a helpful literature tutor who explains Romeo and Juliet clearly and accurately.',
    'Audience: high school; Language: English.',
    'Write the explanation directly; do not repeat the quote or restate Act/Scene/Speaker.',
    'Avoid boilerplate; prefer precise paraphrase and immediate dramatic function (who, to whom, why).',
    'Briefly clarify archaic words or tricky syntax; then give a concise paraphrase.',
    'Assume adjacent speeches may also be explained: do not repeat scene-level themes/plot in every note; focus on what is new to these lines and keep it short if continuing an already-explained idea.',
  ].join('\n');
}

function userPrompt({ act, scene, speaker, text }){
  return [`Act ${act}, Scene ${scene}. Speaker: ${speaker||'Unknown'}.`, 'Explain concisely (about 2–3 sentences if straightforward).','Text:', text].join('\n');
}

async function deepseekExplain({ apiKey, model, system, user }){
  const resp = await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`},
    body: JSON.stringify({ model, temperature:0.3, messages:[{role:'system',content:system},{role:'user',content:user}] })
  });
  if (!resp.ok) throw new Error(`DeepSeek error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data?.choices?.[0]?.message?.content||'').trim();
}

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function generateScene({ act, scene, model, apiKey, sectionsWithOffsets, meta, mode, minlen, concurrency, rate }){
  const range = meta.scenes.find(x=>String(x.act)===String(act)&&String(x.scene)===String(scene));
  if (!range) { console.log(`Skip missing scene ${act}-${scene}`); return []; }
  const speechesMeta = collectSpeeches(meta, range);
  const raw = fs.readFileSync(path.join(process.cwd(),'romeo-and-juliet.txt'),'utf8');
  const speechScan = scanSpeechesFromText(raw, range);
  // union
  const seen = new Set(speechesMeta.map(s=>s.startOffset));
  const speeches = speechesMeta.slice();
  for (const s of speechScan) if (!seen.has(s.startOffset)) speeches.push(s);
  speeches.sort((a,b)=>a.startOffset-b.startOffset);

  const outPath = sceneOutPath(act, scene);
  const existing = loadJson(outPath, []);
  const byStart = new Map(); existing.forEach(e=>{ if (e && typeof e.startOffset==='number') byStart.set(e.startOffset, e); });
  const system = sysPrompt();

  const tasks = speeches.map(sp => async () => {
    if (mode === 'missing') {
      const ex = byStart.get(sp.startOffset);
      const len = ex ? (ex.content||'').trim().length : 0;
      if (len >= minlen) return null; // skip existing
    }
    // slice text
    const enc = new TextEncoder(), dec=new TextDecoder();
    const parts=[];
    for (const sec of sectionsWithOffsets){
      const b0=sec.startOffset, b1=b0+enc.encode(sec.text||'').length;
      if (b1<=sp.startOffset) continue; if (b0>=sp.endOffset) break;
      const sub=enc.encode(sec.text||'').slice(Math.max(0,sp.startOffset-b0), Math.min(b1-sp.startOffset, sp.endOffset-b0));
      parts.push(dec.decode(sub));
    }
    const text = parts.join('').trim();
    if (!text) return null;
    const user = userPrompt({ act, scene, speaker: sp.speaker, text });
    const content = await deepseekExplain({ apiKey, model, system, user });
    return { act, scene, speaker: sp.speaker, startOffset: sp.startOffset, endOffset: sp.endOffset, content, provider: 'deepseek', model };
  });

  const results = existing.slice();
  let idx=0; const workers=Math.max(1, concurrency);
  console.log(`Act ${act}, Scene ${scene}: ${speeches.length} speeches`);
  const runners = Array.from({length:workers}, ()=> (async ()=>{
    while (idx<tasks.length){
      const my = idx++;
      try{
        const item = await tasks[my]();
        if (item){ results.push(item); console.log(`  [+] ${item.speaker||'Unknown'} @ ${item.startOffset}`); }
      }catch(e){ console.error(`  [!] Speech ${my+1}:`, e.message||e); }
      await sleep(rate);
    }
  })());
  await Promise.all(runners);
  results.sort((a,b)=> (a.startOffset||0)-(b.startOffset||0));
  fs.mkdirSync(path.dirname(outPath), { recursive:true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`  Wrote ${results.length} -> ${outPath}`);
  return results;
}

function mergeAll(sceneFiles){
  const merged=[]; const seen=new Set();
  function key(it){ return `${it.startOffset||-1}:${it.endOffset||-1}:${(it.speaker||'').toUpperCase()}`; }
  for (const f of sceneFiles){
    const arr = loadJson(f, []);
    for (const it of arr){ const k=key(it); if (!seen.has(k)){ seen.add(k); merged.push(it); } }
  }
  merged.sort((a,b)=> (a.startOffset||0)-(b.startOffset||0));
  const out = path.join(process.cwd(),'data','explanations.json');
  fs.writeFileSync(out, JSON.stringify(merged, null, 2));
  console.log(`Merged ${sceneFiles.length} scenes -> ${out} (total ${merged.length})`);
}

async function main(){
  const { mode, concurrency, rate, model, minlen } = args();
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_api_key;
  if (!apiKey){ console.error('Missing DEEPSEEK_API_KEY'); process.exit(1); }
  const { sections: sectionsWithOffsets } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  const meta = loadMetadata();
  const list = scenesOrdered(meta);
  const written = [];
  for (const s of list){
    const arr = await generateScene({ act:s.act, scene:s.scene, model, apiKey, sectionsWithOffsets, meta, mode, minlen, concurrency, rate });
    written.push(sceneOutPath(s.act, s.scene));
  }
  mergeAll(written);
}

main().catch(e=>{ console.error(e); process.exit(1); });

