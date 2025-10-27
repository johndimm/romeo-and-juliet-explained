#!/usr/bin/env node
/**
 * Generate explanation(s) for the Prologue (CHORUS).
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/gen-prologue-deepseek.mjs [--model deepseek-chat]
 * Writes:
 *   data/explanations_prologue.json and merges are handled by merge script.
 */

import fs from 'fs';
import path from 'path';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

function args() {
  const a = process.argv.slice(2);
  const out = { model: 'deepseek-chat' };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--model' && a[i+1]) out.model = a[++i];
  }
  return out;
}

function loadMeta() {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'metadata.json'), 'utf8'));
}

function romanToInt(s) { const v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}; let t=0,p=0; s=String(s||'').trim().toUpperCase(); for(let i=s.length-1;i>=0;i--){const x=v[s[i]]||0;t+=x<p?-x:x;p=x;} return t; }

function startOfActScene(meta, act, scene){
  const s = (meta.scenes||[]).find(x=>String(x.act)===String(act)&&String(x.scene)===String(scene));
  if (!s) throw new Error('Cannot find Act '+act+' Scene '+scene);
  return s.startOffset;
}

function sysPrompt(){
  return [
    'You are a helpful literature tutor who explains Romeo and Juliet clearly and accurately.',
    'Audience: high school; Language: English.',
    'Write the explanation directly; do not repeat the quote or restate Act/Scene/Speaker.',
    'Avoid boilerplate; prefer precise paraphrase and immediate dramatic function.',
    'Briefly clarify archaic words or tricky syntax; then give a concise paraphrase.',
    'Since the Prologue summarizes the play, keep it concise and avoid generic theme repetition in later notes.',
  ].join('\n');
}

function userPrompt({ text }){
  return [
    'Explain the Prologue (spoken by the Chorus) concisely. Clarify archaic words and give a clear paraphrase in 3–4 sentences.',
    'Text:',
    text,
  ].join('\n');
}

async function deepseek({ apiKey, model, system, user }){
  const resp = await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`},
    body: JSON.stringify({ model, temperature:0.3, messages:[{role:'system',content:system},{role:'user',content:user}] })
  });
  if (!resp.ok) throw new Error(`DeepSeek error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data?.choices?.[0]?.message?.content||'').trim();
}

async function main(){
  const { model } = args();
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_api_key;
  if (!apiKey) { console.error('Missing DEEPSEEK_API_KEY'); process.exit(1); }

  const { sections: sectionsWithOffsets, markers } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  if (!markers?.prologueStart) { console.error('Could not locate Prologue start'); process.exit(1); }
  const meta = loadMeta();
  // End of prologue = start of Act I Scene I
  const proStart = markers.prologueStart;
  const act1scene1Start = startOfActScene(meta, 'I', 'I');
  const enc = new TextEncoder(), dec = new TextDecoder();
  const parts=[];
  for (const sec of sectionsWithOffsets){
    const b0=sec.startOffset, b1=b0+enc.encode(sec.text||'').length;
    if (b1<=proStart) continue; if (b0>=act1scene1Start) break;
    const sub=enc.encode(sec.text||'').slice(Math.max(0,proStart-b0), Math.min(b1-proStart, act1scene1Start-b0));
    parts.push(dec.decode(sub));
  }
  const text = parts.join('').trim();
  if (!text){ console.error('No Prologue text found'); process.exit(1); }

  const system = sysPrompt();
  const user = userPrompt({ text });
  console.log('Generating Prologue (CHORUS)…');
  const content = await deepseek({ apiKey, model, system, user });

  const outArr = [{ act:'Prologue', scene:'', speaker:'CHORUS', startOffset: proStart, endOffset: act1scene1Start, content, provider:'deepseek', model }];
  const outPath = path.join(process.cwd(),'data','explanations_prologue.json');
  fs.mkdirSync(path.dirname(outPath), { recursive:true });
  fs.writeFileSync(outPath, JSON.stringify(outArr, null, 2));
  console.log(`Wrote Prologue -> ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });

