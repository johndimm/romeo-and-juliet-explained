#!/usr/bin/env node
/**
 * Generate explanations for the entire play with ONE LLM CALL PER SCENE.
 * Writes one file per scene under data/, then merges into data/explanations.json
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... node scripts/gen-all-batch-deepseek.mjs [--model deepseek-chat]
 */

import fs from 'fs';
import path from 'path';
import { parseSectionsWithOffsets } from '../lib/parseText.js';

function args(){
  const out = { model:'deepseek-chat', skip: [], chunk: 16 };
  const a = process.argv.slice(2);
  for (let i=0;i<a.length;i++){
    const k=a[i];
    if (k==='--model' && a[i+1]) out.model=a[++i];
    else if (k==='--skip' && a[i+1]) { const v=a[++i]; v.split(',').forEach(tok=>{ const t=String(tok||'').trim(); if(t) out.skip.push(t); }); }
    else if (k==='--chunk' && a[i+1]) out.chunk = Math.max(4, parseInt(a[++i],10) || out.chunk);
  }
  return out;
}

function loadMetadata(){ return JSON.parse(fs.readFileSync(path.join(process.cwd(),'data','metadata.json'),'utf8')); }

function scenesOrdered(meta){
  const scenes = (meta.scenes||[]).map(s=>({ act:s.act, scene:s.scene, startOffset:s.startOffset, endOffset:s.endOffset }));
  const romanVal = (r)=>{ const v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}; let t=0,p=0; const s=String(r||'').trim().toUpperCase(); for(let i=s.length-1;i>=0;i--){ const x=v[s[i]]||0; if(x<p) t-=x; else t+=x; p=x;} return t; };
  scenes.sort((a,b)=> romanVal(a.act)-romanVal(b.act) || romanVal(String(a.scene||''))-romanVal(String(b.scene||'')) || (a.startOffset||0)-(b.startOffset||0));
  return scenes;
}

async function runScene({ act, scene, model, chunk }){
  const bin = process.execPath; // node
  const script = path.join(process.cwd(),'scripts','gen-scene-batch-deepseek.mjs');
  const { spawn } = await import('child_process');
  await new Promise((resolve, reject)=>{
    const p = spawn(bin, [script, '--act', act, '--scene', scene, '--model', model, '--chunk', String(chunk)], { stdio: 'inherit' });
    p.on('exit', (code)=> code===0?resolve():reject(new Error(`scene ${act} ${scene} failed (${code})`)));
  });
  return path.join(process.cwd(),`data/explanations_act${act}_scene${scene}.json`);
}

function mergeSceneFiles(files){
  const merged=[]; const seen=new Set();
  const key=(it)=>`${it.startOffset||-1}:${it.endOffset||-1}:${(it.speaker||'').toUpperCase()}`;
  for(const f of files){ try{ const arr=JSON.parse(fs.readFileSync(f,'utf8')); for(const it of arr){ const k=key(it); if(!seen.has(k)){ seen.add(k); merged.push(it);} } }catch(e){ console.error('merge read failed:', f, e.message||e); }
  }
  merged.sort((a,b)=> (a.startOffset||0)-(b.startOffset||0));
  fs.writeFileSync(path.join(process.cwd(),'data','explanations.json'), JSON.stringify(merged,null,2));
  console.log(`Merged ${files.length} scenes -> data/explanations.json (total ${merged.length})`);
}

async function main(){
  const { model, skip, chunk } = args();
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_api_key;
  if (!apiKey) { console.error('Missing DEEPSEEK_API_KEY'); process.exit(1); }
  parseSectionsWithOffsets('romeo-and-juliet.txt'); // ensure file present
  const meta = loadMetadata();
  const list = scenesOrdered(meta);
  const skipSet = new Set((skip||[]).map(s=>String(s).trim().toUpperCase().replace(/[|:]/g,':')));
  const files=[];
  for(const s of list){
    const key = `${String(s.act).toUpperCase()}:${String(s.scene).toUpperCase()}`;
    if (skipSet.has(key)) { console.log(`\n=== Act ${s.act}, Scene ${s.scene} — skipped ===`); continue; }
    console.log(`\n=== Act ${s.act}, Scene ${s.scene} ===`);
    const f = await runScene({ act:s.act, scene:s.scene, model, chunk });
    files.push(f);
  }
  mergeSceneFiles(files);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
