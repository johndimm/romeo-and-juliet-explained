import Head from 'next/head';
import Link from 'next/link';
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
  const [bySectionPrecomputed, setBySectionPrecomputed] = useState({});
  const [dateStr, setDateStr] = useState('');
  const [selectedAct, setSelectedAct] = useState(''); // empty = all
  const [selectedScene, setSelectedScene] = useState(''); // empty = all
  // Read note threshold from localStorage (default to 33 = Most, same as main page)
  const [noteThreshold, setNoteThreshold] = useState(() => {
    if (typeof window === 'undefined') return 33;
    try {
      const raw = localStorage.getItem('noteThreshold');
      if (raw !== null && raw !== '') {
        const val = parseInt(raw, 10);
        if (Number.isFinite(val)) {
          return Math.max(0, Math.min(100, val));
        }
      }
    } catch {}
    return 33; // Default to 33 (Most), same as main page
  });

  // Normalize perplexity for filtering (same logic as main page)
  function normalizedPerplexity(it) {
    let p = Number(it?.perplexity ?? it?.confusion ?? 0);
    if (!Number.isFinite(p) || p < 0) p = 0;
    const model = String(it?.perplexityModel || '').toLowerCase();
    // Prefer dataset-normalized score if present
    if (typeof it?.perplexityNorm === 'number') {
      const n = Math.round(Math.max(0, Math.min(100, it.perplexityNorm)));
      return n;
    }
    // If already in 0–100 (from LLM), just clamp
    if (p <= 100 && model !== 'gpt2') return Math.max(0, Math.min(100, p));
    // For true LM PPL (often > 100), map to 0–100 using log10 scale
    const val = Math.log10(Math.max(1, p));
    return Math.max(0, Math.min(100, Math.round(25 * val)));
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
    
    // Filter and group precomputed notes by threshold and section
    try {
      if (!Array.isArray(precomputed) || !precomputed.length) {
        setBySectionPrecomputed({});
        setBySectionForced({});
        return;
      }
      
      // Build speech mapping (same as app)
      const scenes = Array.isArray(metadata?.scenes)?metadata.scenes:[];
      const mapActScene = (off)=>{ for(const sc of scenes){ if(off>=sc.startOffset && off<=sc.endOffset) return {act:sc.act,scene:sc.scene}; } return {act:'Prologue',scene:''}; };
      const speeches = Array.isArray(metadata?.speeches)?metadata.speeches:[];
      const perScene=new Map(); const speechList=[];
      for(const sp of speeches){ const {act,scene}=mapActScene(sp.offset||0); const key=act+'#'+scene; const arr=perScene.get(key)||[]; const speechIndex=arr.length+1; const obj={offset:sp.offset||0, act, scene, speechIndex}; arr.push(obj); perScene.set(key,arr); speechList.push(obj); }
      const noteBySpeechKey=new Map();
      for(const it of precomputed){ const act=it.act||it.Act||''; const scene=(it.scene!=null?String(it.scene):''); const key=act+'#'+scene; const arr=perScene.get(key)||[]; if(!arr.length) continue; const off=Number(it.startOffset||0); let chosen=arr[0]; for(let i=0;i<arr.length;i++){ if(off<=arr[i].offset){ chosen=arr[i]; break; } } const spKey=`${chosen.act}|${chosen.scene}|${chosen.speechIndex}`; if(!noteBySpeechKey.has(spKey)) noteBySpeechKey.set(spKey,it); }
      
      // Get forced notes
      const f = localStorage.getItem('forcedNotes');
      let forced = [];
      if (f) { const arr = JSON.parse(f); if (Array.isArray(arr)) forced = arr.map(String); }
      
      // Group by section
      const enc=new TextEncoder(); const secRanges=sectionsWithOffsets.map(s=>{const start=s.startOffset||0; const end=start+enc.encode(s.text||'').length; return {start,end};});
      const groupedP={};
      const groupedF={};
      
      // Filter precomputed notes by threshold
      const filteredPrecomputed = precomputed.filter((it) => {
        // Always include forced notes
        const act = it.act || it.Act || '';
        const scene = (it.scene != null ? String(it.scene) : '');
        const key = act + '#' + scene;
        const arr = perScene.get(key) || [];
        if (!arr.length) return false;
        const off = Number(it.startOffset || 0);
        let chosen = arr[0];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].offset <= off) chosen = arr[i];
          else break;
        }
        const spKey = `${chosen.act}|${chosen.scene}|${chosen.speechIndex}`;
        if (forced.includes(spKey)) return true; // Always include forced
        
        // Apply threshold filter
        const score = normalizedPerplexity(it);
        if (typeof noteThreshold !== 'number') return true;
        if (noteThreshold <= 0) return true; // Show all if threshold is 0
        return score >= noteThreshold;
      });
      
      // Group filtered precomputed notes by section
      for(const it of filteredPrecomputed){
        const act = it.act || it.Act || '';
        const scene = (it.scene != null ? String(it.scene) : '');
        const key = act + '#' + scene;
        const arr = perScene.get(key) || [];
        if (!arr.length) continue;
        const off = Number(it.startOffset || 0);
        let chosen = arr[0];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].offset <= off) chosen = arr[i];
          else break;
        }
        const spKey = `${chosen.act}|${chosen.scene}|${chosen.speechIndex}`;
        const so = Number(it.startOffset || 0);
        let idx = 0;
        for (let i = 0; i < secRanges.length; i++) {
          const {start, end} = secRanges[i];
          if (so >= start && so < end) { idx = i; break; }
          if (secRanges[i].start <= so) idx = i;
          else break;
        }
        
        if (forced.includes(spKey)) {
          // Forced notes go to bySectionForced
          if (!groupedF[idx]) groupedF[idx] = [];
          groupedF[idx].push({ last: it.content || '', meta: { sectionIndex: idx, byteOffset: so } });
        } else {
          // Regular precomputed notes go to bySectionPrecomputed
          if (!groupedP[idx]) groupedP[idx] = [];
          groupedP[idx].push({ last: it.content || '', meta: { sectionIndex: idx, byteOffset: so } });
        }
      }
      
      setBySectionPrecomputed(groupedP);
      setBySectionForced(groupedF);
    } catch {}
  }, [precomputed, metadata, sectionsWithOffsets, noteThreshold]);

  // Initialize filters from URL or localStorage (e.g., /print?act=I&scene=V)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      let act = params.get('act') || '';
      let scene = params.get('scene') || '';
      if (!act) act = (localStorage.getItem('printAct') || '');
      if (!scene) scene = (localStorage.getItem('printScene') || '');
      // Normalize act: handle PROLOGUE/Prologue, and convert to uppercase for Roman numerals
      act = (act || '').toString().trim();
      if (act.toLowerCase() === 'prologue') {
        act = 'Prologue'; // Keep title case for Prologue
      } else {
        act = act.toUpperCase(); // Uppercase for Roman numerals (I, II, III, etc.)
      }
      scene = (scene || '').toString().trim().toUpperCase();
      setSelectedAct(act);
      setSelectedScene(scene);
    } catch {}
  }, []);

  // Keep URL in sync with filters (for sharing)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (selectedAct) url.searchParams.set('act', selectedAct); else url.searchParams.delete('act');
      if (selectedScene) url.searchParams.set('scene', selectedScene); else url.searchParams.delete('scene');
      window.history.replaceState(null, '', url.toString());
    } catch {}
  }, [selectedAct, selectedScene]);

  // Map each section to its scene/act using metadata scene ranges
  const sectionInfo = useMemo(() => {
    // Initialize all sections with null act/scene - sections without scene info should still be shown when "All" is selected
    const info = sectionsWithOffsets.map(() => ({ act: null, scene: null, title: null }));
    if (!metadata?.scenes || !Array.isArray(metadata.scenes)) return info;
    
    // Find scene ranges for special handling
    const scenes = metadata.scenes;
    
    for (let i = 0; i < sectionsWithOffsets.length; i++) {
      const start = sectionsWithOffsets[i].startOffset;
      
      // First, try to find a scene that contains this section
      const s = scenes.find((x) => start >= x.startOffset && start <= x.endOffset);
      if (s) {
        info[i] = { 
          act: s.act || null, 
          scene: s.scene != null ? String(s.scene) : null, 
          title: s.title || null 
        };
        continue;
      }
      
      // Handle special cases: sections between scenes that belong to an act but have no scene number
      // Example: Act II CHORUS appears between Act I Scene V end (36051) and Act II Scene I start (36718)
      
      // Find the previous and next scenes
      let prevScene = null;
      let nextScene = null;
      for (const sc of scenes) {
        if (sc.endOffset != null && start > sc.endOffset) {
          if (!prevScene || sc.endOffset > prevScene.endOffset) {
            prevScene = sc;
          }
        }
        if (sc.startOffset != null && start < sc.startOffset) {
          if (!nextScene || sc.startOffset < nextScene.startOffset) {
            nextScene = sc;
          }
        }
      }
      
      // If this section is in a gap between scenes of different acts, assign it to the next act with empty scene
      // This handles Act II CHORUS (between Act I Scene V and Act II Scene I)
      if (nextScene && nextScene.act && prevScene && prevScene.endOffset != null && nextScene.startOffset != null) {
        // Check if we're in the gap before the next scene of a different act
        if (prevScene.act !== nextScene.act && start > prevScene.endOffset && start < nextScene.startOffset) {
          info[i] = {
            act: nextScene.act,
            scene: '', // Empty scene for CHORUS or inter-scene content
            title: null
          };
        }
      } else if (nextScene && nextScene.act && nextScene.startOffset != null && start < nextScene.startOffset) {
        // Handle sections before the first scene of an act (if no previous scene found)
        // This shouldn't happen normally, but handle it just in case
        if (start < nextScene.startOffset) {
          info[i] = {
            act: nextScene.act,
            scene: '',
            title: null
          };
        }
      }
    }
    return info;
  }, [sectionsWithOffsets, metadata]);

  // Build act/scene option lists
  const acts = useMemo(() => {
    const set = new Set();
    (metadata?.scenes || []).forEach((s) => { 
      if (s.act) {
        // Normalize act values - keep Prologue as-is, uppercase Roman numerals
        const act = s.act.toLowerCase() === 'prologue' ? 'Prologue' : s.act.toUpperCase();
        set.add(act);
      }
    });
    // Sort acts: Prologue first, then Roman numerals
    const sorted = Array.from(set);
    const prologue = sorted.filter(a => a.toLowerCase() === 'prologue');
    const others = sorted.filter(a => a.toLowerCase() !== 'prologue');
    others.sort((a, b) => romanToInt(a) - romanToInt(b));
    return [...prologue, ...others];
  }, [metadata]);
  const scenesForAct = useMemo(() => {
    if (!selectedAct) return [];
    const set = new Set();
    // Normalize selectedAct for comparison (Prologue can be case-insensitive)
    const selectedActNorm = selectedAct.toLowerCase();
    (metadata?.scenes || []).forEach((s) => { 
      const sActNorm = (s.act || '').toLowerCase();
      if (sActNorm === selectedActNorm && s.scene) {
        set.add(s.scene);
      }
    });
    return Array.from(set).sort((a, b) => romanToInt(a) - romanToInt(b));
  }, [metadata, selectedAct]);

  // Filter sections by act/scene selection
  const filteredIndices = useMemo(() => {
    // When both are empty (All/All), show all sections
    if (!selectedAct && !selectedScene) {
      return sectionsWithOffsets.map((_, i) => i);
    }
    return sectionsWithOffsets.map((_, i) => i).filter((i) => {
      const inf = sectionInfo[i];
      // If act is selected, must match (case-insensitive comparison)
      if (selectedAct) {
        if (!inf.act) return false; // Section must have act info
        // Normalize both for case-insensitive comparison
        const infActNorm = (inf.act || '').toLowerCase();
        const selectedActNorm = selectedAct.toLowerCase();
        if (infActNorm !== selectedActNorm) return false;
      }
      // If scene is selected, must match
      if (selectedScene) {
        // For Prologue, scene is empty string, so if selectedScene is empty, it matches
        if (selectedAct && selectedAct.toLowerCase() === 'prologue') {
          // Prologue has no scene, so if scene filter is empty/All, it's ok
          // But if a specific scene is selected, Prologue sections shouldn't match
          if (selectedScene && selectedScene.trim() !== '') return false;
          return true;
        }
        // For non-Prologue acts, must have matching scene
        // BUT: if scene is empty (like CHORUS), include it when scene filter is "All" (empty)
        if (!inf.scene || inf.scene === '') {
          // Sections with no scene (like CHORUS) should be included when scene filter is "All"
          return selectedScene.trim() === '';
        }
        if (inf.scene.toUpperCase() !== selectedScene) return false;
      } else {
        // When scene filter is "All" (empty), include sections with empty scene (like CHORUS)
        // This is already handled - we're not filtering by scene, so all sections with matching act pass through
      }
      return true;
    });
  }, [sectionsWithOffsets, sectionInfo, selectedAct, selectedScene]);

  const title = 'Romeo and Juliet Explained';

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="container">
        <div className="screenOnly printControls">
          <div className="printControlsHeader">
            <h1 className="printControlsTitle">{title}</h1>
            <div className="printControlsActions">
              <Link href="/" className="printButton printButtonSecondary" title="Back to app">
                ← Back
              </Link>
              <button 
                className="printButton printButtonPrimary"
                onClick={() => {
                  try {
                    if (typeof window !== 'undefined' && window.print) {
                      window.print();
                    } else {
                      alert('Print functionality is not available in this environment.');
                    }
                  } catch (error) {
                    console.error('Print error:', error);
                    alert('Unable to open print dialog. Please use your browser\'s print function (Ctrl+P / Cmd+P).');
                  }
                }}
              >
                🖨️ Print
              </button>
            </div>
          </div>
          <div className="printControlsFilters">
            <div className="printFilterGroup">
              <label className="printFilterLabel">
                Act
                <select 
                  className="printFilterSelect"
                  value={selectedAct} 
                  onChange={(e) => { setSelectedAct(e.target.value); setSelectedScene(''); }}
                >
                  <option value="">All</option>
                  {acts.map((a) => (
                    <option key={`a-${a}`} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label className="printFilterLabel">
                Scene
                <select 
                  className="printFilterSelect"
                  value={selectedScene} 
                  onChange={(e) => setSelectedScene(e.target.value)} 
                  disabled={!selectedAct}
                >
                  <option value="">All</option>
                  {scenesForAct.map((s) => (
                    <option key={`s-${selectedAct}-${s}`} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
        <div className="printHeader">
          <div className="printHeaderTitle">{title}</div>
          <div className="printHeaderDate">{dateStr}</div>
        </div>
        {filteredIndices.map((idx) => {
          const sectionText = sections[idx] || '';
          if (!sectionText && idx >= sections.length) return null;
          return (
            <div className="section" key={idx}>
              <div className="playText">
                <pre>{sectionText}</pre>
              </div>
            {((Array.isArray(bySection[idx]) && bySection[idx].length > 0) || (Array.isArray(bySectionForced[idx]) && bySectionForced[idx].length > 0) || (Array.isArray(bySectionPrecomputed[idx]) && bySectionPrecomputed[idx].length > 0)) ? (
              <aside className="explanations" aria-label="Explanations">
                <div>
                  {[...(bySectionForced[idx]||[]), ...(bySectionPrecomputed[idx]||[]), ...(bySection[idx]||[])].map((ex, i) => (
                      <div key={`p-${i}-${ex?.meta?.byteOffset || i}`} style={{ marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #eee' }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Explanation</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{ex?.last || ''}</div>
                      </div>
                    ))}
                  </div>
                </aside>
              ) : null}
            </div>
          );
        })}
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
