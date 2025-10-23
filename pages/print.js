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
  try {
    const p = path.join(process.cwd(), 'data', 'metadata.json');
    metadata = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return { props: { sections, sectionsWithOffsets: filtered, metadata } };
}

export default function PrintView({ sections, sectionsWithOffsets, metadata }) {
  const [bySection, setBySection] = useState({});
  const [dateStr, setDateStr] = useState('');
  const [selectedAct, setSelectedAct] = useState(''); // empty = all
  const [selectedScene, setSelectedScene] = useState(''); // empty = all
  const [onlyWithExplanations, setOnlyWithExplanations] = useState(false);

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
  }, []);

  // Initialize filters from URL (e.g., /print?act=I&scene=V)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const act = params.get('act') || '';
      const scene = params.get('scene') || '';
      const only = params.get('only') === '1';
      setSelectedAct(act);
      setSelectedScene(scene);
      setOnlyWithExplanations(!!only);
    } catch {}
  }, []);

  // Keep URL in sync with filters (for sharing)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (selectedAct) url.searchParams.set('act', selectedAct); else url.searchParams.delete('act');
      if (selectedScene) url.searchParams.set('scene', selectedScene); else url.searchParams.delete('scene');
      if (onlyWithExplanations) url.searchParams.set('only', '1'); else url.searchParams.delete('only');
      window.history.replaceState(null, '', url.toString());
    } catch {}
  }, [selectedAct, selectedScene, onlyWithExplanations]);

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
      if (onlyWithExplanations && !(Array.isArray(bySection[i]) && bySection[i].length > 0)) return false;
      return true;
    });
  }, [sectionsWithOffsets, sectionInfo, selectedAct, selectedScene, onlyWithExplanations, bySection]);

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
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={onlyWithExplanations}
                  onChange={(e) => setOnlyWithExplanations(e.target.checked)}
                />
                Only sections with explanations
              </label>
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
            {Array.isArray(bySection[idx]) && bySection[idx].length > 0 ? (
              <aside className="explanations" aria-label="Explanations">
                <div>
                  {bySection[idx].map((ex, i) => (
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
