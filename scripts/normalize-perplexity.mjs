#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function args(){
  const a=process.argv.slice(2); const out={in:'data/explanations.json', out:null};
  for(let i=0;i<a.length;i++){ const k=a[i]; if(k==='--in'&&a[i+1]) out.in=a[++i]; else if(k==='--out'&&a[i+1]) out.out=a[++i]; }
  if(!out.out) out.out=out.in; return out;
}

function loadJSON(p){ return JSON.parse(fs.readFileSync(path.join(process.cwd(),p),'utf8')); }
function saveJSON(p,data){ fs.writeFileSync(path.join(process.cwd(),p), JSON.stringify(data,null,2)); }

function baseScore(it){
  let p = Number(it?.perplexity ?? it?.confusion ?? 0);
  if (!Number.isFinite(p) || p < 0) p = 0;
  const model = String(it?.perplexityModel || '').toLowerCase();
  if (p <= 100 && model !== 'gpt2') return Math.max(0, Math.min(100, p));
  const val = Math.log10(Math.max(1, p));
  return Math.max(0, Math.min(100, Math.round(25 * val)));
}

function meanStd(vals){
  if(!vals.length) return {mean:0,std:1};
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  const v = vals.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1, vals.length-1);
  const std = Math.sqrt(v) || 1;
  return {mean,std};
}

function clamp01(x){ return Math.max(0, Math.min(100, x)); }

function main(){
  const {in:inPath, out:outPath} = args();
  const arr = loadJSON(inPath);
  if(!Array.isArray(arr)){ console.error('Input must be an array'); process.exit(1); }
  const scores = arr.map(baseScore).filter(n=>Number.isFinite(n));
  const {mean,std} = meanStd(scores);
  const mapped = arr.map((it)=>{
    const s = baseScore(it);
    const z = (s - mean) / std;
    const norm = clamp01(Math.round(50 + 15*z));
    return { ...it, perplexityNorm: norm };
  });
  saveJSON(outPath, mapped);
  console.log(`Normalized ${mapped.length} items (mean=${(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(2)}, std=${std.toFixed(2)}) -> ${outPath}`);
}

main();

