#!/usr/bin/env node
// Generate LLM notes (DeepSeek) for speeches that lack precomputed notes
// Non-destructive: writes merged output to data/explanations.generated.missing.json

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const metaPath = path.join(root, 'data', 'metadata.json');
const expPath = path.join(root, 'data', 'explanations.json');
const textPath = path.join(root, 'romeo-and-juliet.txt');
const outPath = path.join(root, 'data', 'explanations.generated.missing.json');

const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY || process.env.DEEPSEEK;
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const LIMIT = parseInt(process.env.GEN_MISSING_LIMIT || '0', 10) || Infinity; // set to a number to cap

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJson(p, v){ fs.writeFileSync(p, JSON.stringify(v, null, 2)+'\n','utf8'); }

function findSceneForOffset(meta, offset){
  for (const sc of (meta.scenes||[])){
    if (typeof sc.startOffset==='number' && typeof sc.endOffset==='number'){
      if (offset>=sc.startOffset && offset<=sc.endOffset){
        return sc; // {act, scene, startOffset, endOffset}
      }
    }
  }
  return { act: 'Prologue', scene: '', startOffset: 0, endOffset: Number.MAX_SAFE_INTEGER };
}

function charIndexFromByteSlice(str, startB, endB){
  const enc = new TextEncoder();
  const bytes = enc.encode(str);
  const slice = bytes.subarray(0, endB);
  const sliceStart = bytes.subarray(0, startB);
  const dec = new TextDecoder();
  return { start: dec.decode(sliceStart).length, end: dec.decode(slice).length };
}

async function callDeepSeek({ selectionText, context }){
  if (!API_KEY) throw new Error('Missing DEEPSEEK_API_KEY');
  const prompt = [
    'You are writing concise line-by-line notes for Romeo and Juliet.',
    'Explain the selected speech in plain, modern English (1–2 sentences), avoiding spoilers beyond the current context.',
    'Also estimate a difficulty score as an integer perplexity from 0 to 100 where 0=trivial (show notes to everyone) and 100=very difficult (hide to most).',
    'Return ONLY compact JSON with keys note and perplexity, no extra text.',
    `Context: Act ${context.act}${context.scene?`, Scene ${context.scene}`:''}; Speaker: ${context.speaker || 'Unknown'}.`,
    'Text:', selectionText,
    'Example output: {"note":"Paraphrase...","perplexity":35}'
  ].join('\n');

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [ { role: 'user', content: prompt } ],
      temperature: 0.4,
      max_tokens: 200
    })
  });
  if (!res.ok) throw new Error(`DeepSeek error ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim?.() || '';
  // Try to parse JSON; if the model returned prose, fallback
  try {
    const obj = JSON.parse(content);
    const note = String(obj.note || '').trim();
    let perplexity = parseInt(obj.perplexity, 10);
    if (!Number.isFinite(perplexity)) perplexity = 50;
    perplexity = Math.max(0, Math.min(100, perplexity));
    return { note, perplexity };
  } catch {
    return { note: content, perplexity: 50 };
  }
}

async function main(){
  const meta = readJson(metaPath);
  const existing = readJson(expPath);
  const fullText = fs.readFileSync(textPath,'utf8');

  const haveByStart = new Map(existing.map(it=>[it.startOffset, true]));
  const speeches = Array.isArray(meta.speeches)? meta.speeches : [];

  const toGen = [];
  for (let i=0;i<speeches.length;i++){
    const sp = speeches[i];
    const start = sp.offset;
    if (typeof start !== 'number') continue;
    if (haveByStart.has(start)) continue;
    const sc = findSceneForOffset(meta, start);
    const next = speeches[i+1];
    const end = (next && typeof next.offset==='number') ? next.offset : (sc.endOffset ?? (start+1));

    // Extract passage (best-effort) using byte offsets
    const enc = new TextEncoder();
    const bytes = enc.encode(fullText);
    const slice = bytes.subarray(start, end);
    const dec = new TextDecoder();
    const passage = dec.decode(slice).trim();

    toGen.push({ act: sc.act, scene: sc.scene, speaker: sp.speaker, startOffset: start, endOffset: end, passage });
  }

  console.log(`Missing speeches: ${toGen.length}`);
  const out = existing.slice();
  let count = 0;

  for (const item of toGen){
    if (count >= LIMIT) break;
    try{
      const preview = (item.passage || '').replace(/\s+/g,' ').slice(0,140);
      console.log(`\n→ Generating note for offset ${item.startOffset} | ${item.act}${item.scene?'.'+item.scene:''} | Speaker: ${item.speaker}\n   Text: "${preview}${preview.length===140?'…':''}"`);
      const { note, perplexity } = await callDeepSeek({ selectionText: item.passage, context: { act: item.act, scene: item.scene, speaker: item.speaker } });
      console.log(`   ✓ Received note (${note.length} chars), perplexity=${perplexity}`);
      out.push({
        act: item.act,
        scene: item.scene,
        speaker: String(item.speaker||''),
        startOffset: item.startOffset,
        endOffset: item.endOffset,
        content: note,
        provider: 'deepseek',
        model: MODEL,
        perplexity
      });
      count++;
      // Gentle pacing
      await new Promise(r=>setTimeout(r, 250));
    } catch (e){
      console.error('   ✗ Failed to generate note at', item.startOffset, e.message || e);
    }
  }

  out.sort((a,b)=> (a.startOffset||0)-(b.startOffset||0));
  writeJson(outPath, out);
  console.log(`Generated ${count} notes. Wrote ${path.relative(root,outPath)}.`);
}

main().catch(e=>{ console.error(e); process.exit(1); });


