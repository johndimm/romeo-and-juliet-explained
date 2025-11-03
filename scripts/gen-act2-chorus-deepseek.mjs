#!/usr/bin/env node
/**
 * Generate explanation(s) for the Act II CHORUS.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/gen-act2-chorus-deepseek.mjs [--model deepseek-chat]
 * Writes:
 *   data/explanations_act2_chorus.json and merges are handled by merge script.
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
    'Since the Act II Chorus summarizes the shift in Romeo\'s affections, keep it concise.',
  ].join('\n');
}

function userPrompt({ text }){
  return [
    'Explain the Act II Chorus (spoken by the Chorus) concisely. Clarify archaic words and give a clear paraphrase in 3–4 sentences.',
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
  const meta = loadMeta();
  // Act II CHORUS starts after "ACT II" marker and before Act II Scene I
  // Find Act II Scene I start
  const act2scene1Start = startOfActScene(meta, 'II', 'I');
  
  // Find the CHORUS speech in metadata (this gives us the correct startOffset)
  const speeches = Array.isArray(meta.speeches) ? meta.speeches : [];
  const act2ChorusSpeech = speeches.find(sp => {
    // Find CHORUS speech that's between Act II start and Act II Scene I
    return sp.speaker === 'CHORUS' && sp.offset >= 30000 && sp.offset < act2scene1Start;
  });
  
  if (!act2ChorusSpeech || !act2ChorusSpeech.offset) {
    console.error('Could not locate Act II CHORUS speech in metadata');
    process.exit(1);
  }
  
  const act2Start = act2ChorusSpeech.offset; // Use the CHORUS speech offset as start
  
  const enc = new TextEncoder(), dec = new TextDecoder();
  const parts=[];
  for (const sec of sectionsWithOffsets){
    const b0=sec.startOffset, b1=b0+enc.encode(sec.text||'').length;
    if (b1<=act2Start) continue; if (b0>=act2scene1Start) break;
    const sub=enc.encode(sec.text||'').slice(Math.max(0,act2Start-b0), Math.min(b1-act2Start, act2scene1Start-b0));
    parts.push(dec.decode(sub));
  }
  const chorusText = parts.join('').trim();
  if (!chorusText){ console.error('No Act II CHORUS text found'); process.exit(1); }

  const system = sysPrompt();
  const user = userPrompt({ text: chorusText });
  console.log('Generating Act II CHORUS…');
  const content = await deepseek({ apiKey, model, system, user });

  const outArr = [{ act:'II', scene:'', speaker:'CHORUS', startOffset: act2Start, endOffset: act2scene1Start, content, provider:'deepseek', model }];
  const outPath = path.join(process.cwd(),'data','explanations_act2_chorus.json');
  fs.mkdirSync(path.dirname(outPath), { recursive:true });
  fs.writeFileSync(outPath, JSON.stringify(outArr, null, 2));
  console.log(`Wrote Act II CHORUS -> ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });


