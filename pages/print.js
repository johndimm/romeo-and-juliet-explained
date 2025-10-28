import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { parseSectionsWithOffsets } from '../lib/parseText';
import fs from 'fs';
import path from 'path';

export async function getStaticProps() {
  const { sections: sectionsWithOffsets, markers } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  const filtered = sectionsWithOffsets.filter((s) => {
    if (!markers.contentsStart || !markers.prologueStart) return true;
    const start = s.startOffset;
    return !(start >= markers.contentsStart && start < markers.prologueStart);
  });
  const sections = filtered.map((s) => s.text);
  let metadata = null;
  let precomputed = [];
  try {
    const p = path.join(process.cwd(), 'data', 'metadata.json');
    metadata = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  try {
    const p2 = path.join(process.cwd(), 'data', 'explanations.json');
    precomputed = JSON.parse(fs.readFileSync(p2, 'utf8')) || [];
    if (!Array.isArray(precomputed)) precomputed = [];
  } catch {}
  return { props: { sections, sectionsWithOffsets: filtered, metadata, precomputed } };
}

export default function PrintView({ sections, sectionsWithOffsets, metadata, precomputed }) {
  const [bySection, setBySection] = useState({});
  const [bySectionForced, setBySectionForced] = useState({});
  const [dateStr, setDateStr] = useState('');
  const [selectedAct, setSelectedAct] = useState(''); // empty = all
  const [selectedScene, setSelectedScene] = useState(''); // empty = all

  useEffect(() => {
    const d = new Date();
    setDateStr(d.toLocaleString());
    try {
      const raw = localStorage.getItem('explanations');
      if (!raw) return;
      const data = JSON.parse(raw);
      const entries = Object.values(data || {}).filter((c) => c && c.meta && c.last);
      const grouped = {};
      for (const e of entries) {
        const idx = e.meta.sectionIndex;
        if (!grouped[idx]) grouped[idx] = [];
        grouped[idx].push(e);
      }
      // Sort groups by byte offset in section for stable printing
      Object.keys(grouped).forEach((k) => {
        grouped[k].sort((a, b) => (a.meta.start || 0) - (b.meta.start || 0));
      });
      setBySection(grouped);
    } catch {}
    // Also include currently visible precomputed notes (forced speech keys)
    try {
      const f = localStorage.getItem('forcedNotes');
      let forced = [];
      if (f) { const arr = JSON.parse(f); if (Array.isArray(arr)) forced = arr.map(String); }
      if (forced.length && Array.isArray(precomputed) && precomputed.length) {
        // Build speech mapping (same as app)
        const scenes = Array.isArray(metadata?.scenes)?metadata.scenes:[];
        const mapActScene = (off)=>{ for(const sc of scenes){ if(off>=sc.startOffset && off<=sc.endOffset) return {act:sc.act,scene:sc.scene}; } return {act:'Prologue',scene:''}; };
        const speeches = Array.isArray(metadata?.speeches)?metadata.speeches:[];
        const perScene=new Map(); const speechList=[];
        for(const sp of speeches){ const {act,scene}=mapActScene(sp.offset||0); const key=act+'#'+scene; const arr=perScene.get(key)||[]; const speechIndex=arr.length+1; const obj={offset:sp.offset||0, act, scene, speechIndex}; arr.push(obj); perScene.set(key,arr); speechList.push(obj); }
        const noteBySpeechKey=new Map();
        for(const it of precomputed){ const act=it.act||it.Act||''; const scene=(it.scene!=null?String(it.scene):''); const key=act+'#'+scene; const arr=perScene.get(key)||[]; if(!arr.length) continue; const off=Number(it.startOffset||0); let chosen=arr[0]; for(let i=0;i<arr.length;i++){ if(off<=arr[i].offset){ chosen=arr[i]; break; } } const spKey=`${chosen.act}|${chosen.scene}|${chosen.speechIndex}`; if(!noteBySpeechKey.has(spKey)) noteBySpeechKey.set(spKey,it); }
        // Group forced notes by section
        const enc=new TextEncoder(); const secRanges=sectionsWithOffsets.map(s=>{const start=s.startOffset||0; const end=start+enc.encode(s.text||'').length; return {start,end};});
        const groupedF={};
        for(const sk of forced){ const it=noteBySpeechKey.get(String(sk)); if(!it) continue; const so=Number(it.startOffset||0); let idx=0; for(let i=0;i<secRanges.length;i++){ const {start,end}=secRanges[i]; if(so>=start && so<end){ idx=i; break; } if(secRanges[i].start<=so) idx=i; else break; } if(!groupedF[idx]) groupedF[idx]=[]; groupedF[idx].push({ last: it.content||'', meta:{ sectionIndex: idx, byteOffset: so } }); }
        setBySectionForced(groupedF);
      }
    } catch {}
  }, []);

  // Initialize filters from URL or localStorage (e.g., /print?act=I&scene=V)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      let act = params.get('act') || '';
      let scene = params.get('scene') || '';
      if (!act) act = (localStorage.getItem('printAct') || '');
      if (!scene) scene = (localStorage.getItem('printScene') || '');
      act = (act || '').toString().trim().toUpperCase();
      scene = (scene || '').toString().trim().toUpperCase();
      setSelectedAct(act);
      setSelectedScene(scene);
    } catch {}
  }, []);

  // Keep URL in sync with filters (for sharing)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (selectedAct) url.searchParams.set('act', selectedAct); else url.searchParams.delete('act');
      if (selectedScene) url.searchParams.set('scene', selectedScene); else url.searchParams.delete('scene');
      window.history.replaceState(null, '', url.toString());
    } catch {}
  }, [selectedAct, selectedScene]);

  // Map each section to its scene/act using metadata scene ranges
  const sectionInfo = useMemo(() => {
    const info = sectionsWithOffsets.map(() => ({ act: null, scene: null, title: null }));
    if (!metadata?.scenes) return info;
    for (let i = 0; i < sectionsWithOffsets.length; i++) {
      const start = sectionsWithOffsets[i].startOffset;
      const s = (metadata.scenes || []).find((x) => start >= x.startOffset && start <= x.endOffset);
      if (s) info[i] = { act: s.act || null, scene: s.scene || null, title: s.title || null };
    }
    return info;
  }, [sectionsWithOffsets, metadata]);

  // Build act/scene option lists
  const acts = useMemo(() => {
    const set = new Set();
    (metadata?.scenes || []).forEach((s) => { if (s.act) set.add(s.act); });
    return Array.from(set).sort((a, b) => romanToInt(a) - romanToInt(b));
  }, [metadata]);
  const scenesForAct = useMemo(() => {
    if (!selectedAct) return [];
    const set = new Set();
    (metadata?.scenes || []).forEach((s) => { if (s.act === selectedAct && s.scene) set.add(s.scene); });
    return Array.from(set).sort((a, b) => romanToInt(a) - romanToInt(b));
  }, [metadata, selectedAct]);

  // Filter sections by act/scene selection
  const filteredIndices = useMemo(() => {
    return sectionsWithOffsets.map((_, i) => i).filter((i) => {
      const inf = sectionInfo[i];
      if (selectedAct && inf.act !== selectedAct) return false;
      if (selectedScene && inf.scene !== selectedScene) return false;
      return true;
    });
  }, [sectionsWithOffsets, sectionInfo, selectedAct, selectedScene, bySection]);

  const title = 'Romeo and Juliet — Explanations';

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="container">
        <div className="screenOnly" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{title}</div>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label>
                Act:
                <select value={selectedAct} onChange={(e) => { setSelectedAct(e.target.value); setSelectedScene(''); }} style={{ marginLeft: 6 }}>
                  <option value="">All</option>
                  {acts.map((a) => (
                    <option key={`a-${a}`} value={a}> {a} </option>
                  ))}
                </select>
              </label>
              <label>
                Scene:
                <select value={selectedScene} onChange={(e) => setSelectedScene(e.target.value)} style={{ marginLeft: 6 }} disabled={!selectedAct}>
                  <option value="">All</option>
                  {scenesForAct.map((s) => (
                    <option key={`s-${selectedAct}-${s}`} value={s}> {s} </option>
                  ))}
                </select>
              </label>
              {/* Removed: only-with-explanations checkbox */}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href="/" title="Back to app">Back</a>
            <button onClick={() => window.print()}>Print</button>
          </div>
        </div>
        <div className="printHeader">
          <div className="printHeaderTitle">{title}</div>
          <div className="printHeaderDate">{dateStr}</div>
        </div>
        {filteredIndices.map((idx) => (
          <div className="section" key={idx}>
            <div className="playText">
              <pre>{sections[idx]}</pre>
            </div>
            {((Array.isArray(bySection[idx]) && bySection[idx].length > 0) || (Array.isArray(bySectionForced[idx]) && bySectionForced[idx].length > 0)) ? (
              <aside className="explanations" aria-label="Explanations">
                <div>
                  {[...(bySectionForced[idx]||[]), ...(bySection[idx]||[])].map((ex, i) => (
                    <div key={`p-${i}-${ex?.meta?.byteOffset || i}`} style={{ marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #eee' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Explanation</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{ex?.last || ''}</div>
                    </div>
                  ))}
                </div>
              </aside>
            ) : null}
          </div>
        ))}
        <div className="printFooter">
          <span className="pageNumber" />
        </div>
      </div>
    </>
  );
}

function romanToInt(s) {
  const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0, prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = vals[s[i]] || 0;
    if (v < prev) total -= v; else total += v;
    prev = v;
  }
  return total;
}
