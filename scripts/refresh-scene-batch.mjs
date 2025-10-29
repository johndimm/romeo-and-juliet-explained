#!/usr/bin/env node
/**
 * Orchestrate a batch regeneration for a single scene and replace it in
 * data/explanations.json (merged file). Uses gen-scene-batch-deepseek.mjs.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/refresh-scene-batch.mjs --act I --scene I [--model deepseek-chat]
 */

import fs from 'fs';
import path from 'path';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

function args(){ const out={ act:'I', scene:'I', model:'deepseek-chat' }; const a=process.argv.slice(2); for(let i=0;i<a.length;i++){ const k=a[i]; if(k==='--act'&&a[i+1]) out.act=a[++i]; else if(k==='--scene'&&a[i+1]) out.scene=a[++i]; else if(k==='--model'&&a[i+1]) out.model=a[++i]; } return out; }

function load(metaPath){ return JSON.parse(fs.readFileSync(metaPath,'utf8')); }

function romanEq(a,b){ return String(a||'').trim().toUpperCase()===String(b||'').trim().toUpperCase(); }

function sceneRange(meta, act, scene){ const s=(meta.scenes||[]).find(x=>romanEq(x.act,act)&&romanEq(x.scene,scene)); if(!s) throw new Error(`Scene not found in metadata: ${act} ${scene}`); return { start:s.startOffset, end:s.endOffset }; }

async function runSceneGen({ act, scene, model }){
  const bin = process.execPath; const script = path.join(process.cwd(),'scripts','gen-scene-batch-deepseek.mjs');
  const { spawn } = await import('child_process');
  await new Promise((resolve,reject)=>{ const p=spawn(bin,[script,'--act',act,'--scene',scene,'--model',model],{stdio:'inherit'}); p.on('exit',(c)=> c===0?resolve():reject(new Error(`gen failed (${c})`))); });
  return path.join(process.cwd(),`data/explanations_act${act}_scene${scene}.json`);
}

function replaceInMerged({ mergedPath, newItems, range }){
  let merged=[]; try{ merged=JSON.parse(fs.readFileSync(mergedPath,'utf8')); }catch{ merged=[]; }
  const out = merged.filter(it => !((it.startOffset||0) >= range.start && (it.startOffset||0) < range.end));
  for (const it of newItems) out.push(it);
  out.sort((a,b)=> (a.startOffset||0)-(b.startOffset||0));
  fs.writeFileSync(mergedPath, JSON.stringify(out, null, 2));
  return out.length;
}

async function main(){
  const { act, scene, model } = args();
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_api_key;
  if (!apiKey) { console.error('Missing DEEPSEEK_API_KEY'); process.exit(1); }
  parseSectionsWithOffsets('romeo-and-juliet.txt'); // presence check
  const meta = load(path.join(process.cwd(),'data','metadata.json'));
  const range = sceneRange(meta, act, scene);
  const sceneFile = await runSceneGen({ act, scene, model });
  const arr = load(sceneFile);
  const mergedPath = path.join(process.cwd(),'data','explanations.json');
  const count = replaceInMerged({ mergedPath, newItems: arr, range });
  console.log(`Merged ${arr.length} new items; explanations.json now has ${count} records.`);
}

main().catch((e)=>{ console.error(e); process.exit(1); });

