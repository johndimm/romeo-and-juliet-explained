import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseSectionsWithOffsets } from '../lib/parseText';
import fs from 'fs';
import path from 'path';

export async function getStaticProps() {
  const { sections: sectionsWithOffsets, markers } = parseSectionsWithOffsets('romeo-and-juliet.txt');
  // Remove the original TOC: filter out sections between 'Contents' and 'THE PROLOGUE'
  const filtered = sectionsWithOffsets.filter((s) => {
    if (markers.contentsStart == null || markers.prologueStart == null) return true;
    const start = s.startOffset;
    return !(start >= markers.contentsStart && start < markers.prologueStart);
  });
  const sections = filtered.map((s) => s.text);
  // Load prebuilt metadata if available (built via npm run build:characters)
  let metadata = null;
  let precomputed = [];
  try {
    const p = path.join(process.cwd(), 'data', 'metadata.json');
    metadata = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    // Metadata not built yet; that's okay for UI
  }
  try {
    const p2 = path.join(process.cwd(), 'data', 'explanations.json');
    precomputed = JSON.parse(fs.readFileSync(p2, 'utf8')) || [];
    if (!Array.isArray(precomputed)) precomputed = [];
  } catch (e) {
    // No precomputed explanations yet; runtime will ignore
  }
  return { props: { sections, sectionsWithOffsets: filtered, metadata, markers, precomputed } };
}

export default function Home({ sections, sectionsWithOffsets, metadata, markers, precomputed }) {
  const [query, setQuery] = useState(''); // executed search
  const [input, setInput] = useState(''); // text in the box
  const [currentIdx, setCurrentIdx] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const matchRefs = useRef([]); // flat list of all match elements
  const [selection, setSelection] = useState(null); // { sectionIndex, start, end }
  const [selectionContext, setSelectionContext] = useState(null); // { act, scene, onStage, speaker, text, byteOffset }
  const [llmOptions, setLlmOptions] = useState({ model: 'gpt-4o-mini', language: 'English', educationLevel: 'High school', age: '16', provider: 'openai', length: 'brief' });
  const [conversations, setConversations] = useState({}); // id -> { messages: [{role, content}], last: string }
  const [loadingLLM, setLoadingLLM] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Minimum perplexity (0–100) to show precomputed notes. For LM raw PPL (>100),
  // we normalize to 0–100 via a log scale.
  const [noteThreshold, setNoteThreshold] = useState(0);
  const suppressAutoExplainRef = useRef(false);
  // Persist force-shown notes (by speech key act|scene|speechIndex)
  const [forcedNotes, setForcedNotes] = useState([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('forcedNotes');
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      const out = [];
      for (const v of arr) {
        const s = String(v || '');
        if (s.includes('|')) { out.push(s); continue; }
        // MIGRATION: old numeric offsets -> map to nearest speech key
        const off = parseInt(s, 10);
        if (Number.isFinite(off) && metadata && Array.isArray(metadata.speeches)) {
          // find speech with last offset <= off
          let speech = null;
          for (const sp of metadata.speeches) { if ((sp.offset||0) <= off) speech = sp; else break; }
          // find its act/scene
          let act = 'Prologue', scene = '';
          if (Array.isArray(metadata.scenes)) {
            for (const sc of metadata.scenes) { if (off >= sc.startOffset && off <= sc.endOffset) { act = sc.act; scene = sc.scene; break; } }
          }
          // compute speechIndex in that scene
          if (speech) {
            let idx = 1;
            if (Array.isArray(metadata.speeches)) {
              for (const sp of metadata.speeches) {
                const inScene = (() => { if (!Array.isArray(metadata.scenes)) return false; for (const sc of metadata.scenes) { if (sp.offset>=sc.startOffset && sp.offset<=sc.endOffset) return (sc.act===act && sc.scene===scene); } return (act==='Prologue'); })();
                if (!inScene) continue;
                if (sp.offset === speech.offset) break;
                idx++;
              }
            }
            out.push(`${act}|${scene}|${idx}`);
          }
        }
      }
      if (out.length) setForcedNotes(out);
    } catch {}
  }, [metadata]);
  useEffect(() => { try { localStorage.setItem('forcedNotes', JSON.stringify(forcedNotes||[])); } catch {} }, [forcedNotes]);
  const toggleForcedNote = (speechKey, sectionIdx) => {
    setForcedNotes((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : [];
      const key = String(speechKey);
      const idx = arr.indexOf(key);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(key);
      return arr;
    });
    try {
      if (typeof window !== 'undefined' && Array.isArray(sectionsWithOffsets)) {
        const off = sectionsWithOffsets?.[sectionIdx]?.startOffset;
        if (typeof off === 'number') localStorage.setItem('last-pos', String(off));
      }
    } catch {}
  };

  // Reset the refs array before rendering highlights so it doesn't accumulate
  matchRefs.current = [];

  // After highlights render for a given query, capture count and reset index
  useEffect(() => {
    setTotalMatches(matchRefs.current.length);
    setCurrentIdx(0);
  }, [query]);

  useEffect(() => {
    if (totalMatches > 0 && matchRefs.current[currentIdx]) {
      // Mark active class
      matchRefs.current.forEach((el) => el && el.classList.remove('current'));
      const el = matchRefs.current[currentIdx];
      el.classList.add('current');
      // Scroll within our active scroller rather than window to avoid header shifts on mobile
      const scroller = getScroller();
      if (scroller) {
        try {
          const targetTop = Math.max(0, getElementTopWithin(el, scroller) - (scroller.clientHeight ? (scroller.clientHeight - el.clientHeight) / 2 : 80));
          if (scroller === window) window.scrollTo({ top: targetTop, behavior: 'smooth' });
          else scroller.scrollTo({ top: targetTop, behavior: 'smooth' });
        } catch (e) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    } else {
      // Ensure no stale 'current' class remains when there are no matches
      matchRefs.current.forEach((el) => el && el.classList.remove('current'));
    }
  }, [currentIdx, totalMatches]);

  const handlePrev = () => {
    if (totalMatches === 0) return;
    setCurrentIdx((i) => (i - 1 + totalMatches) % totalMatches);
  };

  const handleNext = () => {
    if (totalMatches === 0) return;
    setCurrentIdx((i) => (i + 1) % totalMatches);
  };

  const handleSubmitSearch = () => {
    setQuery(input.trim());
  };

  const handleClear = () => {
    setInput('');
    setQuery('');
  };

  // Build TOC from metadata scenes and map each scene to a target section index
  const toc = useMemo(() => {
    if (!metadata?.scenes) return [];
    const scenes = metadata.scenes.filter((s) => s.act && s.scene);
    const mapSceneToSection = (offset) => {
      let idx = 0;
      for (let i = 0; i < sectionsWithOffsets.length; i++) {
        if (sectionsWithOffsets[i].startOffset <= offset) idx = i;
        else break;
      }
      return idx;
    };
    const grouped = new Map();
    for (const s of scenes) {
      const sectionIndex = mapSceneToSection(s.startOffset);
      const item = {
        act: s.act,
        scene: s.scene,
        title: s.title || `SCENE ${s.scene}`,
        startOffset: s.startOffset,
        sectionIndex,
      };
      if (!grouped.has(s.act)) grouped.set(s.act, []);
      grouped.get(s.act).push(item);
    }
    // Sort scenes within acts by start offset
    const result = [];
    for (const [act, items] of grouped.entries()) {
      items.sort((a, b) => a.startOffset - b.startOffset);
      result.push({ act, scenes: items });
    }
    // Sort acts by true Roman numeral value
    const romanToInt = (s) => {
      const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
      let total = 0, prev = 0;
      for (let i = s.length - 1; i >= 0; i--) {
        const v = vals[s[i]] || 0;
        if (v < prev) total -= v; else total += v;
        prev = v;
      }
      return total;
    };
    result.sort((a, b) => romanToInt(a.act) - romanToInt(b.act));
    // Add Prologue before Act I if available
    if (markers?.prologueStart != null) {
      const sectionIndex = ((offset) => {
        let idx = 0;
        for (let i = 0; i < sectionsWithOffsets.length; i++) {
          if (sectionsWithOffsets[i].startOffset <= offset) idx = i; else break;
        }
        return idx;
      })(markers.prologueStart);
      result.unshift({ act: 'Prologue', scenes: [{ act: 'Prologue', scene: '', title: 'THE PROLOGUE', startOffset: markers.prologueStart, sectionIndex }] });
    }
    return result;
  }, [metadata, sectionsWithOffsets, markers]);

  // Build speeches by section and note mapped by speech key (act|scene|speechIndex)
  const speechMaps = useMemo(() => {
    const meta = metadata || {};
    const scenes = Array.isArray(meta.scenes) ? meta.scenes : [];
    const speeches = Array.isArray(meta.speeches) ? meta.speeches : [];
    const byScene = new Map(); // key -> list of speeches
    const speechList = [];
    const mapActScene = (off) => {
      for (const sc of scenes) { if (off >= sc.startOffset && off <= sc.endOffset) return { act: sc.act, scene: sc.scene }; }
      return { act: 'Prologue', scene: '' };
    };
    for (const sp of speeches) {
      const { act, scene } = mapActScene(sp.offset||0);
      const key = `${act}#${scene}`;
      const arr = byScene.get(key) || [];
      const speechIndex = arr.length + 1;
      const obj = { offset: sp.offset||0, speaker: sp.speaker||'', act, scene, speechIndex };
      arr.push(obj); byScene.set(key, arr); speechList.push(obj);
    }
    const noteBySpeechKey = new Map();
    const items = Array.isArray(precomputed)?precomputed:[];
    for (const it of items) {
      const act = it.act || (it.Act) || '';
      const scene = (it.scene != null ? String(it.scene) : '');
      const key = `${act}#${scene}`;
      const arr = byScene.get(key) || [];
      if (!arr.length) continue;
      const off = Number(it.startOffset || 0);
      // Choose the last speech whose start offset is <= the note's start
      let chosen = arr[0];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].offset <= off) chosen = arr[i]; else break;
      }
      const spKey = `${chosen.act}|${chosen.scene}|${chosen.speechIndex}`;
      if (!noteBySpeechKey.has(spKey)) noteBySpeechKey.set(spKey, it);
    }
    // speeches per section
    const enc = new TextEncoder();
    const secRanges = sectionsWithOffsets.map((s)=>{ const start=s.startOffset||0; const end=start+enc.encode(s.text||'').length; return {start,end}; });
    const speechesBySection = new Map(); for (let i=0;i<secRanges.length;i++) speechesBySection.set(i,[]);
    for (const sp of speechList){ for (let i=0;i<secRanges.length;i++){ const {start,end}=secRanges[i]; if (sp.offset>=start && sp.offset<end){ speechesBySection.get(i).push(sp); break; } } }
    return { noteBySpeechKey, speechesBySection };
  }, [metadata, sectionsWithOffsets, precomputed]);

  // Index precomputed explanations by section for quick access
  const preBySection = useMemo(() => {
    if (!Array.isArray(precomputed) || !precomputed.length) return new Map();
    const enc = new TextEncoder();
    // Compute section byte end offsets once
    const secRanges = sectionsWithOffsets.map((s) => {
      const start = s.startOffset || 0;
      const end = start + enc.encode(s.text || '').length;
      return { start, end };
    });
    const map = new Map();
    const overlaps = (a0, a1, b0, b1) => Math.max(a0, b0) < Math.min(a1, b1);
    for (const item of precomputed) {
      const a0 = item?.startOffset ?? null;
      const a1 = item?.endOffset ?? null;
      if (a0 == null) continue;
      // If no endOffset provided, treat as point and attach to nearest section
      if (a1 == null) {
        let idx = 0;
        for (let i = 0; i < secRanges.length; i++) {
          if (secRanges[i].start <= a0) idx = i; else break;
        }
        if (!map.has(idx)) map.set(idx, []);
        map.get(idx).push(item);
        continue;
      }
      // Attach to all sections the item overlaps (robust anchoring)
      for (let i = 0; i < secRanges.length; i++) {
        const { start, end } = secRanges[i];
        if (overlaps(a0, a1, start, end)) {
          if (!map.has(i)) map.set(i, []);
          map.get(i).push(item);
        }
      }
    }
    for (const [k, list] of map.entries()) list.sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));
    return map;
  }, [precomputed, sectionsWithOffsets]);

  // Track active scene for highlighting in TOC based on scroll + metadata scene ranges
  const [activeScene, setActiveScene] = useState(null);
  const sectionElsRef = useRef([]);
  const [pendingFocus, setPendingFocus] = useState(null); // {sectionIndex, id}
  const [showTocButton, setShowTocButton] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const lastPosSaveRef = useRef(0);
  // Helper to choose the active scroll container (desktop: .container, narrow: .page, or window/body)
  function getScroller() {
    if (typeof document === 'undefined') return null;
    const cont = document.querySelector('.container');
    if (cont && cont.scrollHeight > cont.clientHeight + 1) return cont;
    const pg = document.querySelector('.page');
    if (pg && pg.scrollHeight > pg.clientHeight + 1) return pg;
    // Fallback to window/body scrolling
    return typeof window !== 'undefined' ? window : null;
  }

  function getElementTopWithin(el, scroller) {
    const rectEl = el.getBoundingClientRect();
    if (!scroller || scroller === window) return rectEl.top + window.scrollY;
    const rectSc = scroller.getBoundingClientRect();
    return rectEl.top - rectSc.top + scroller.scrollTop;
  }

  useEffect(() => {
    const scroller = getScroller();
    const onScroll = () => {
      const s = getScroller();
      if (!s) return;
      // Toggle the floating TOC button after meaningful scroll
      const scrollTop = s === window ? window.scrollY : s.scrollTop;
      setShowTocButton(scrollTop > 240);
      const els = sectionElsRef.current.filter(Boolean);
      const y = s === window ? window.scrollY : s.scrollTop;
      let bestIndex = 0;
      const threshold = 40;
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        const top = getElementTopWithin(el, s);
        if (top <= y + threshold) bestIndex = i; else break;
      }
      // Persist reading position occasionally
      try {
        const now = Date.now();
        if (now - (lastPosSaveRef.current || 0) > 500) {
          const off = sectionsWithOffsets[bestIndex]?.startOffset;
          if (typeof off === 'number') localStorage.setItem('last-pos', String(off));
          lastPosSaveRef.current = now;
        }
      } catch {}
      const startOffset = sectionsWithOffsets[bestIndex]?.startOffset;
      if (startOffset == null || !metadata?.scenes) return;
      let current = null;
      for (const s of metadata.scenes) {
        if (s.startOffset != null && s.endOffset != null) {
          if (startOffset >= s.startOffset && startOffset <= s.endOffset) {
            current = { act: s.act, scene: s.scene };
            break;
          }
        }
      }
      const key = current ? `${current.act}-${current.scene}` : null;
      setActiveScene(key);
      // Persist current act/scene for Print view to pre-select
      try {
        if (current && current.act) localStorage.setItem('printAct', String(current.act || ''));
        if (current && (current.scene || current.scene === '')) localStorage.setItem('printScene', String(current.scene || ''));
      } catch {}
    };
    if (scroller) scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
    return () => {
      const s = getScroller();
      if (s) s.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [metadata, sectionsWithOffsets]);

  // Restore reading position on load (when there is no deep-link selection)
  useEffect(() => {
    try {
      if (!sectionsWithOffsets || !sectionsWithOffsets.length) return;
      if (typeof window === 'undefined') return;
      if (/^#sel=/.test(window.location.hash || '')) return; // selection link takes precedence
      let off = NaN;
      const raw = localStorage.getItem('last-pos');
      if (raw) off = parseInt(raw, 10);
      // Fallback: if last-pos is missing/invalid, use last forced speech key
      if (isNaN(off)) {
        try {
          const f = localStorage.getItem('forcedNotes');
          if (f && metadata && Array.isArray(metadata.speeches)) {
            const arr = JSON.parse(f);
            if (Array.isArray(arr) && arr.length) {
              const last = String(arr[arr.length - 1] || '');
              const parts = last.split('|');
              if (parts.length === 3) {
                const [act, scene, sIdxStr] = parts; const sIdx = parseInt(sIdxStr, 10);
                // find the sIdx-th speech within that act/scene
                let count = 0; let foundOff = NaN;
                if (Array.isArray(metadata.scenes)) {
                  const sceneRanges = metadata.scenes.filter((sc)=>sc.act===act && String(sc.scene)===String(scene));
                  const inScene = (o)=>{ if(!sceneRanges.length) return (act==='Prologue'); for(const sc of sceneRanges){ if(o>=sc.startOffset && o<=sc.endOffset) return true; } return false; };
                  for (const sp of metadata.speeches) {
                    if (inScene(sp.offset||0)) { count++; if (count === sIdx) { foundOff = sp.offset||NaN; break; } }
                  }
                }
                if (!isNaN(foundOff)) off = foundOff;
              }
            }
          }
        } catch {}
      }
      if (isNaN(off)) return;
      let idx = 0;
      for (let i = 0; i < sectionsWithOffsets.length; i++) {
        if (sectionsWithOffsets[i].startOffset <= off) idx = i; else break;
      }
      setTimeout(() => scrollToSection(idx), 50);
    } catch {}
  }, [sectionsWithOffsets]);

  const scrollToSection = (index) => {
    const el = sectionElsRef.current[index];
    if (!el) return;
    const scroller = getScroller();
    if (!scroller) return;
    const target = getElementTopWithin(el, scroller) - 8;
    if (scroller === window) window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    else scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  };

  const scrollToTocTop = () => {
    const scroller = getScroller();
    if (!scroller) return;
    if (scroller === window) window.scrollTo({ top: 0, behavior: 'smooth' });
    else scroller.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Listen for global header "Contents" command
  useEffect(() => {
    const handler = () => {
      if (typeof window !== 'undefined' && window.innerWidth <= 820) {
        setTocOpen(true);
      } else {
        scrollToTocTop();
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('toggle-toc', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('toggle-toc', handler); };
  }, []);

  // Close on ESC and lock body scroll when open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setTocOpen(false); };
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
    if (typeof document !== 'undefined') {
      if (tocOpen) document.body.style.overflow = 'hidden';
      else document.body.style.overflow = '';
    }
    return () => { if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey); };
  }, [tocOpen]);

  // Compute LLM context for current selection using metadata
  useEffect(() => {
    if (!selection || !metadata || !sectionsWithOffsets || !sections) {
      setSelectionContext(null);
      return;
    }
    const { sectionIndex, start } = selection;
    const sectionText = sections[sectionIndex];
    if (!sectionText) {
      setSelectionContext(null);
      return;
    }
    // Compute byte offset at selection start
    const encoder = new TextEncoder();
    const bytesBefore = encoder.encode(sectionText.slice(0, start)).length;
    const base = sectionsWithOffsets[sectionIndex]?.startOffset || 0;
    const byteOffset = base + bytesBefore;
    const ctx = getContextForOffset(metadata, byteOffset);
    const textForLLM = selection.fullText || sectionText.slice(selection.start, selection.end);
    setSelectionContext({ ...ctx, text: textForLLM, byteOffset });
  }, [selection, metadata, sectionsWithOffsets, sections]);

  // Auto-request on selection when a new passage is selected
  useEffect(() => {
    if (!selectionContext) return;
    // Optionally suppress one auto call when explicitly toggling UI elements
    if (suppressAutoExplainRef.current) { suppressAutoExplainRef.current = false; return; }
    // Avoid duplicate calls if we already have an explanation for this selection
    const len = new TextEncoder().encode(selectionContext.text || '').length;
    const id = `${selectionContext.byteOffset}-${len}`;
    if (conversations && conversations[id] && conversations[id].last) return;
    // Use preferred length from options; default to brief
    const pref = (llmOptions?.length === 'medium' ? 'more' : (llmOptions?.length === 'large' ? 'more' : 'brief'));
    callLLM({ mode: pref, length: llmOptions?.length || 'brief' });
  }, [selectionContext]);

  // Deep-linking: update URL hash when selection changes
  useEffect(() => {
    if (!selectionContext) return;
    const len = new TextEncoder().encode(selectionContext.text || '').length;
    setHashForSelection(selectionContext.byteOffset, len);
  }, [selectionContext]);

  // Initialize selection from URL hash (if present), and respond to hash changes
  useEffect(() => {
    const applyHash = () => {
      if (!metadata || !sectionsWithOffsets || !sections) return;
      // Handle cross-page actions
      if ((location.hash || '').includes('action=settings')) {
        setShowSettings(true);
        const url = new URL(window.location.href); url.hash = ''; window.history.replaceState(null, '', url.toString());
        return;
      }
      if ((location.hash || '').includes('action=toc')) {
        setTocOpen(true);
        const url = new URL(window.location.href); url.hash = ''; window.history.replaceState(null, '', url.toString());
        return;
      }
      const parsed = parseSelectionHash(location.hash);
      if (!parsed) return;
      const { byteOffset, length } = parsed;
      // Map to section index
      let sectionIndex = 0;
      for (let i = 0; i < sectionsWithOffsets.length; i++) {
        if (sectionsWithOffsets[i].startOffset <= byteOffset) sectionIndex = i; else break;
      }
      const section = sections[sectionIndex] || '';
      const base = sectionsWithOffsets[sectionIndex]?.startOffset || 0;
      const startBytes = Math.max(0, byteOffset - base);
      const start = bytesToCharOffset(section, startBytes);
      const end = bytesToCharOffset(section, startBytes + length);
      if (end > start) setSelection({ sectionIndex, start, end });
      // Scroll to section
      const el = sectionElsRef.current[sectionIndex];
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [metadata, sectionsWithOffsets, sections]);

  

  

  // Persist conversations and options in localStorage (guard against double-invoke in StrictMode)
  const [storeHydrated, setStoreHydrated] = useState(false);
  const [optsHydrated, setOptsHydrated] = useState(false);
  useEffect(() => {
    const handler = () => setShowSettings(true);
    if (typeof window !== 'undefined') window.addEventListener('open-settings', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('open-settings', handler); };
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('explanations');
      if (raw) setConversations(JSON.parse(raw));
    } catch {}
    setStoreHydrated(true);
    try {
      const opt = localStorage.getItem('llmOptions');
      if (opt) setLlmOptions(JSON.parse(opt));
      const nt = localStorage.getItem('noteThreshold');
      if (nt != null) {
        const v = parseInt(nt, 10);
        setNoteThreshold(Number.isFinite(v) ? v : 0);
      }
    } catch {}
    setOptsHydrated(true);
  }, []);
  useEffect(() => {
    if (!storeHydrated) return;
    try { localStorage.setItem('explanations', JSON.stringify(conversations)); } catch {}
  }, [storeHydrated, conversations]);
  useEffect(() => {
    if (!optsHydrated) return;
    try { localStorage.setItem('llmOptions', JSON.stringify(llmOptions)); } catch {}
  }, [optsHydrated, llmOptions]);
  useEffect(() => {
    try { localStorage.setItem('noteThreshold', String(noteThreshold || 0)); } catch {}
  }, [noteThreshold]);

  // Normalize perplexity for filtering (supports both 0–100 and raw LM PPL)
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
    // 10 -> 25, 100 -> 50, 1000 -> 75, 10000 -> 100
    const val = Math.log10(Math.max(1, p));
    return Math.max(0, Math.min(100, Math.round(25 * val)));
  }

  const selectionId = useMemo(() => {
    if (!selectionContext) return null;
    // Use byteOffset and length to key the passage
    const len = new TextEncoder().encode(selectionContext.text || '').length;
    return `${selectionContext.byteOffset}-${len}`;
  }, [selectionContext]);

  // All saved explanations across the document, sorted by byte offset
  const allExplanations = useMemo(() => {
    return Object.entries(conversations || {})
      .filter(([, c]) => c && c.meta && c.last)
      .map(([id, c]) => ({ id, meta: c.meta, content: c.last }))
      .sort((a, b) => (a.meta.byteOffset || 0) - (b.meta.byteOffset || 0));
  }, [conversations]);

  const currentExIdx = useMemo(() => {
    if (!selectionId) return -1;
    return allExplanations.findIndex((e) => e.id === selectionId);
  }, [allExplanations, selectionId]);

  // Header search state sync (explanation navigation removed)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('search-state', {
        detail: {
          count: totalMatches,
          index: totalMatches ? currentIdx + 1 : 0,
          submitted: !!query,
        },
      }));
    }
  }, [totalMatches, currentIdx, query]);

  // Bridge header search buttons (explanation navigation removed)
  useEffect(() => {
    const onSubmit = (e) => setQuery((e.detail?.query || '').trim());
    const onPrev = () => handlePrev();
    const onNext = () => handleNext();
    if (typeof window !== 'undefined') {
      window.addEventListener('search-submit', onSubmit);
      window.addEventListener('search-prev', onPrev);
      window.addEventListener('search-next', onNext);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('search-submit', onSubmit);
        window.removeEventListener('search-prev', onPrev);
        window.removeEventListener('search-next', onNext);
      }
    };
  }, [totalMatches, currentIdx]);

  function deleteExplanationById(id) {
    const next = { ...conversations };
    delete next[id];
    setConversations(next);
  }

  async function callLLM({ mode = 'brief', followup, length }) {
    if (!selectionContext) return;
    setLoadingLLM(true);
    try {
      const conv = conversations[selectionId] || { messages: [] };
      // Eager placeholder so a card appears immediately
      const thinkingText = 'AI is thinking…';
      const meta = {
        sectionIndex: selection.sectionIndex,
        start: selection.start,
        end: selection.end,
        text: selectionContext.text,
        act: selectionContext.act,
        scene: selectionContext.scene,
        speaker: selectionContext.speaker,
        onStage: selectionContext.onStage,
        byteOffset: selectionContext.byteOffset,
      };
      if (!conversations[selectionId] || !conversations[selectionId].last) {
        setConversations({ ...conversations, [selectionId]: { messages: conv.messages, last: thinkingText, meta } });
      }

      // Build a compact excerpt: previous speech only, to ground who was speaking
      let contextText = '';
      try {
        const byte = selectionContext.byteOffset || 0;
        const enc = new TextEncoder();
        // Find current scene range
        const scn = (Array.isArray(metadata?.scenes) ? metadata.scenes : []).find((s) => byte >= (s.startOffset||0) && byte <= (s.endOffset||0));
        const sceneStart = scn?.startOffset ?? 0;
        const sceneEnd = scn?.endOffset ?? byte;
        // Find speeches in scene and identify the one immediately before the selection
        const speeches = Array.isArray(metadata?.speeches) ? metadata.speeches : [];
        let prevStart = null; let nextStart = null;
        for (let i = 0; i < speeches.length; i++) {
          const off = speeches[i]?.offset || 0;
          if (off >= sceneStart && off < byte) prevStart = off;
          if (off > byte && off <= sceneEnd) { nextStart = off; break; }
        }
        if (prevStart != null) {
          const endB = Math.min(nextStart != null ? nextStart : sceneEnd, byte);
          // Stitch previous speech text only
          let out = '';
          for (let i = 0; i < sectionsWithOffsets.length; i++) {
            const sec = sectionsWithOffsets[i];
            const secStart = sec.startOffset || 0;
            const secText = sections[i] || '';
            const secEnd = secStart + enc.encode(secText).length;
            if (secEnd <= prevStart) continue; if (secStart >= endB) break;
            const a = Math.max(prevStart, secStart);
            const b = Math.min(endB, secEnd);
            if (b > a) {
              const startC = bytesToCharOffset(secText, a - secStart);
              const endC = bytesToCharOffset(secText, b - secStart);
              out += secText.slice(startC, endC);
            }
          }
          contextText = out;
        }
      } catch {}
      // Derive current speech's prewritten note (if any) for stronger context
      let noteText = '';
      try {
        const act = selectionContext.act;
        const scene = selectionContext.scene;
        const byte = selectionContext.byteOffset || 0;
        const scenes = Array.isArray(metadata?.scenes) ? metadata.scenes : [];
        const targetScene = scenes.find((s) => s.act === act && String(s.scene) === String(scene));
        if (targetScene && Array.isArray(metadata?.speeches)) {
          let count = 0;
          for (const sp of metadata.speeches) {
            const off = sp?.offset || 0;
            if (off >= (targetScene.startOffset||0) && off <= byte) count++;
          }
          if (count > 0 && speechMaps && speechMaps.noteBySpeechKey) {
            const spKey = `${act}|${scene}|${count}`;
            const it = speechMaps.noteBySpeechKey.get(spKey);
            if (it && it.content) noteText = String(it.content);
          }
        }
      } catch {}

      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectionText: selectionContext.text,
          context: { act: selectionContext.act, scene: selectionContext.scene, speaker: selectionContext.speaker, onStage: selectionContext.onStage },
          contextText,
          noteText,
          options: llmOptions,
          messages: conv.messages,
          mode,
          followup,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'LLM error');
      const assistantMsg = { role: 'assistant', content: data.content };
      const reqLen = length || llmOptions.length || 'brief';
      const newMsgs = [
        ...conv.messages,
        { role: 'user', content: buildUserPrompt(selectionContext, mode, followup, reqLen) },
        assistantMsg,
      ].slice(-12);
      setConversations({ ...conversations, [selectionId]: { messages: newMsgs, last: data.content, meta } });
    } catch (e) {
      const meta = {
        sectionIndex: selection.sectionIndex,
        start: selection.start,
        end: selection.end,
        text: selectionContext.text,
        act: selectionContext.act,
        scene: selectionContext.scene,
        speaker: selectionContext.speaker,
        onStage: selectionContext.onStage,
        byteOffset: selectionContext.byteOffset,
      };
      setConversations({ ...conversations, [selectionId]: { messages: [], last: `Error: ${String(e.message || e)}`, meta } });
    } finally {
      setLoadingLLM(false);
    }
  }

  function buildUserPrompt(selCtx, mode, followup, respLen) {
    const parts = [
      'Explain the selected Romeo and Juliet line(s) directly — no prefaces like "In this quote", and do not repeat the quote or restate Act/Scene/Speaker.',
      'Help the reader parse the sentence: briefly clarify unfamiliar/archaic words or idioms and any tricky syntax (inversions, ellipses), then give a clear paraphrase.',
      'Avoid boilerplate claims ("pivotal", "foreshadows", "underscores the theme", "sets the stage") unless clearly warranted by these exact lines; be concrete or skip such claims.',
      'Prefer precise paraphrase + immediate purpose in the scene.',
      'Assume adjacent paragraphs may also have explanations: do not repeat the same theme or scene-level plot point that a neighboring note would already cover; focus on what is new or specific to these exact lines.',
      'If these lines merely continue an idea already explained in the previous passage, add only the fresh detail and keep it short.',
    ];
    const len = (respLen || '').toLowerCase();
    if (mode === 'brief' || len === 'brief') parts.push('Length: brief (2–3 sentences).');
    if (len === 'medium') parts.push('Length: medium (concise paragraph).');
    if (mode === 'more' || len === 'large') parts.push('Length: large (detailed but focused).');
    if (mode === 'followup' && followup) parts.push(`Follow-up: ${followup}`);
    return parts.join('\n');
  }

  // Provider/model helpers for Settings
  // Dynamic model listing per provider (fetched from /api/models)
  const [providerModels, setProviderModels] = useState([]);
  const providerRef = useRef(llmOptions.provider || 'openai');
  useEffect(() => {
    const prov = (llmOptions.provider || 'openai').toLowerCase();
    providerRef.current = prov;
    fetch(`/api/models?provider=${encodeURIComponent(prov)}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.models) && data.models.length ? data.models : [];
        if (providerRef.current === prov) setProviderModels(list);
      })
      .catch(() => setProviderModels([]));
  }, [llmOptions.provider]);
  function defaultModelForProvider(p) {
    if (providerModels && providerModels.length) return providerModels[0];
    // static fallback
    const prov = (p || 'openai').toLowerCase();
    if (prov === 'anthropic') return 'claude-3-5-sonnet-20240620';
    if (prov === 'deepseek') return 'deepseek-chat';
    if (prov === 'gemini') return 'gemini-1.5-pro-latest';
    return 'gpt-4o-mini';
  }

  return (
    <>
      <Head>
        <title>Romeo and Juliet — Explained</title>
        <meta name="description" content="Romeo and Juliet text with space for explanations." />
      </Head>
      <div className={`page`}>
        <nav className="sidebar">
          <div className="toc">
            <h2>Contents</h2>
            {toc.map((group) => (
              <div key={`act-${group.act}`}>
                {group.act === 'Prologue' ? (
                  <ul>
                    {(() => {
                      const sc = group.scenes[0];
                      const key = `${sc.act}-${sc.scene}`;
                      const isActive = activeScene === key;
                      return (
                        <li key={`scene-${key}`} className={isActive ? 'active' : ''}>
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              scrollToSection(sc.sectionIndex);
                            }}
                            title="Prologue"
                          >
                            Prologue
                          </a>
                        </li>
                      );
                    })()}
                  </ul>
                ) : (
                  <ul>
                    <li style={{ fontWeight: 600, color: '#53483e', fontFamily: 'IM Fell English, serif' }}>{`Act ${group.act}`}</li>
                    {group.scenes.map((sc) => {
                      const key = `${sc.act}-${sc.scene}`;
                      const isActive = activeScene === key;
                      return (
                        <li key={`scene-${key}`} className={isActive ? 'active' : ''}>
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              scrollToSection(sc.sectionIndex);
                            }}
                            title={`Act ${sc.act}, Scene ${sc.scene}`}
                          >
                            {sc.title}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </nav>
        <main className="container">
        {sections.map((section, idx) => {
          const savedExplanations = Object.entries(conversations || {})
            .filter(([id, c]) => c && c.meta && c.meta.sectionIndex === idx && c.last)
            .map(([, c]) => c)
            .sort((a, b) => {
              const sa = (a.meta?.start ?? 0);
              const sb = (b.meta?.start ?? 0);
              if (sa !== sb) return sa - sb;
              const ba = (a.meta?.byteOffset ?? 0);
              const bb = (b.meta?.byteOffset ?? 0);
              return ba - bb;
            });
          const sectionStartOffset = sectionsWithOffsets[idx]?.startOffset || 0;
          const speechesInSec = (speechMaps.speechesBySection.get(idx) || []);
          const itemsAllSec = speechesInSec
            .map((sp) => speechMaps.noteBySpeechKey.get(`${sp.act}|${sp.scene}|${sp.speechIndex}`))
            .filter(Boolean);
          const itemsFilteredSec = itemsAllSec.filter((it) => { const score = normalizedPerplexity(it); return !noteThreshold || score >= noteThreshold; });
          return (
          <Section
            key={idx}
            text={section}
            query={query}
            matchRefs={matchRefs}
            precomputedItems={itemsFilteredSec}
            precomputedAllItems={itemsAllSec}
            speeches={(speechMaps.speechesBySection.get(idx) || [])}
            noteBySpeechKey={speechMaps.noteBySpeechKey}
            selectedRange={selection && selection.sectionIndex === idx ? { start: selection.start, end: selection.end } : null}
            onSelectRange={(range) => setSelection(range ? { sectionIndex: idx, ...range } : null)}
            sectionRef={(el) => (sectionElsRef.current[idx] = el)}
            contextInfo={selection && selection.sectionIndex === idx ? selectionContext : null}
            sectionIndex={idx}
            sectionStartOffset={sectionStartOffset}
            suppressNextAutoExplain={() => { suppressAutoExplainRef.current = true; }}
            metadata={metadata}
            forcedNotes={forcedNotes}
            onToggleForced={toggleForcedNote}
            noteThreshold={noteThreshold}
            setNoteThreshold={setNoteThreshold}
            onRequestFocus={(pf) => setPendingFocus(pf)}
            llm={{
              options: llmOptions,
              setOptions: setLlmOptions,
              loading: loadingLLM,
              conversation: selectionId ? conversations[selectionId] : null,
              onLength: (len) => callLLM({ mode: len === 'brief' ? 'brief' : 'more', length: len }),
              onFollowup: (text) => callLLM({ mode: 'followup', followup: text }),
              onDeleteCurrent: () => {
                if (selectionId) {
                  deleteExplanationById(selectionId);
                  // also clear the current selection to remove the panel immediately
                  setSelection(null);
                }
              },
            }}
            selectedId={selection && selection.sectionIndex === idx ? selectionId : null}
            pendingFocus={pendingFocus && pendingFocus.sectionIndex === idx ? pendingFocus : null}
            onPendingFocusConsumed={() => setPendingFocus(null)}
            savedExplanations={savedExplanations}
            onDeleteSaved={(id) => {
              const next = { ...(conversations || {}) };
              delete next[id];
              setConversations(next);
            }}
            onCopyLink={() => {
              const curr = selectionContext;
              if (!curr) return;
              const len = new TextEncoder().encode(curr.text || '').length;
              const url = buildSelectionLink(curr.byteOffset, len);
              navigator.clipboard?.writeText(url);
            }}
          />
          );
        })}
        </main>
        {/* Desktop: floating back-to-top button; hidden on mobile via CSS */}
        <button
          type="button"
          className={`backToToc ${showTocButton ? 'show' : ''}`}
          onClick={scrollToTocTop}
          title="Back to contents"
          aria-label="Back to contents"
        >
          ↑
        </button>

        {/* Mobile: slim edge handle for opening the drawer */}
        {!tocOpen && (
          <button
            type="button"
            className="tocHandle"
            onClick={() => setTocOpen(true)}
            title="Open contents"
            aria-label="Open contents"
          >
            <span>CONTENTS</span>
          </button>
        )}

        {/* Slide-in TOC Drawer (mobile only) */}
        <div className={`tocDrawer ${tocOpen ? 'open' : ''}`} aria-hidden={!tocOpen}>
          {tocOpen ? <div className="overlay" onClick={() => setTocOpen(false)} /> : null}
          <aside className="panel" role="dialog" aria-label="Contents">
            <button type="button" className="tocCloseHandle" onClick={() => setTocOpen(false)} aria-label="Close contents"><span>CLOSE</span></button>
            <div className="drawerHeader">
              <span>Contents</span>
              <button type="button" className="closeBtn" onClick={() => setTocOpen(false)} aria-label="Close contents">✕</button>
            </div>
            <div className="toc">
              {toc.map((group) => (
                <div key={`d-act-${group.act}`}>
                  {group.act === 'Prologue' ? (
                    <ul>
                      {(() => {
                        const sc = group.scenes[0];
                        const key = `${sc.act}-${sc.scene}`;
                        const isActive = activeScene === key;
                        return (
                          <li key={`d-scene-${key}`} className={isActive ? 'active' : ''}>
                            <a href="#" onClick={(e) => { e.preventDefault(); setTocOpen(false); scrollToSection(sc.sectionIndex); }} title="Prologue">Prologue</a>
                          </li>
                        );
                      })()}
                    </ul>
                  ) : (
                    <ul>
                      <li style={{ fontWeight: 600, color: '#53483e', fontFamily: 'IM Fell English, serif' }}>{`Act ${group.act}`}</li>
                      {group.scenes.map((sc) => {
                        const key = `${sc.act}-${sc.scene}`;
                        const isActive = activeScene === key;
                        return (
                          <li key={`d-scene-${key}`} className={isActive ? 'active' : ''}>
                            <a href="#" onClick={(e) => { e.preventDefault(); setTocOpen(false); scrollToSection(sc.sectionIndex); }} title={`Act ${sc.act}, Scene ${sc.scene}`}>
                              {sc.title}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} onClick={() => setShowSettings(false)}>
          <div
            style={{ background: '#fff', maxWidth: 560, margin: '10vh auto', padding: '1rem', borderRadius: 8, border: '1px solid #ddd' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Settings</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label>Provider
                <select
                  value={(llmOptions.provider || 'openai')}
                  onChange={(e) => {
                    const prov = e.target.value;
                    const model = defaultModelForProvider(prov);
                    setLlmOptions({ ...llmOptions, provider: prov, model });
                  }}
                  style={{ marginLeft: 6 }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="gemini">Gemini</option>
                </select>
              </label>
              <label>Model
                <select
                  value={(providerModels.includes(llmOptions.model) ? llmOptions.model : defaultModelForProvider(llmOptions.provider))}
                  onChange={(e) => setLlmOptions({ ...llmOptions, model: e.target.value })}
                  style={{ marginLeft: 6 }}
                >
                  {(providerModels.length ? providerModels : [defaultModelForProvider(llmOptions.provider)]).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>Language
                <input type="text" value={llmOptions.language || ''} onChange={(e) => setLlmOptions({ ...llmOptions, language: e.target.value })} style={{ marginLeft: 6 }} />
              </label>
              <label>Default length
                <select
                  value={(llmOptions.length || 'brief')}
                  onChange={(e) => setLlmOptions({ ...llmOptions, length: e.target.value })}
                  style={{ marginLeft: 6 }}
                >
                  <option value="brief">Brief</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </label>
              <label>Education
                <select value={llmOptions.educationLevel || 'High school'} onChange={(e) => setLlmOptions({ ...llmOptions, educationLevel: e.target.value })} style={{ marginLeft: 6 }}>
                  <option>Middle school</option>
                  <option>High school</option>
                  <option>Undergraduate</option>
                  <option>Graduate</option>
                </select>
              </label>
              <label>Age
                <input type="number" min="10" max="100" value={llmOptions.age || ''} onChange={(e) => setLlmOptions({ ...llmOptions, age: e.target.value })} style={{ marginLeft: 6, width: 72 }} />
              </label>
              {/* Notes density slider */}
              <div style={{ width: '100%', marginTop: 8 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Notes density (min perplexity): <b>{noteThreshold}</b></label>
                <input type="range" min="0" max="100" value={noteThreshold} onChange={(e)=>setNoteThreshold(parseInt(e.target.value,10)||0)} style={{ width: '100%' }} />
                <div style={{ display:'flex', gap:8, marginTop:6 }}>
                  <button type="button" onClick={()=>setNoteThreshold(0)}>All</button>
                  <button type="button" onClick={()=>setNoteThreshold(50)}>50</button>
                  <button type="button" onClick={()=>setNoteThreshold(70)}>70</button>
                  <button type="button" onClick={()=>setNoteThreshold(85)}>85</button>
                </div>
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
              <button type="button" onClick={() => setShowSettings(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ text, query, matchRefs, sectionRef, selectedRange, onSelectRange, contextInfo, llm, savedExplanations = [], onCopyLink, selectedId, pendingFocus, onPendingFocusConsumed, precomputedItems = [], precomputedAllItems = [], speeches = [], noteBySpeechKey = new Map(), sectionIndex = 0, sectionStartOffset = 0, onDeleteSaved, suppressNextAutoExplain, metadata, noteThreshold = 0, setNoteThreshold, forcedNotes = [], onToggleForced, onRequestFocus }) {
  const preRef = useRef(null);
  const asideRef = useRef(null);
  const selPendingRef = useRef(false);
  const longPressRef = useRef(false);
  const movedRef = useRef(false);
  const pressTimerRef = useRef(null);
  const startXYRef = useRef({ x: 0, y: 0 });
  const selDebounceRef = useRef(null);
  const touchActiveRef = useRef(false);
  const [autoIdx, setAutoIdx] = useState(0);
  const [showPreFollow, setShowPreFollow] = useState(false);
  const [preFollowInput, setPreFollowInput] = useState('');
  const [preFollowLoading, setPreFollowLoading] = useState(false);
  // Mini chat history per speech (keyed by startOffset)
  const [preFollowThreads, setPreFollowThreads] = useState({}); // key -> [{ q, a }]
  const [forceShow, setForceShow] = useState(false);
  // When a note is expanded via "More", we replace the displayed text to avoid repetition
  const [preNoteOverrides, setPreNoteOverrides] = useState({}); // key (startOffset) -> replaced content

  // No local perplexity normalizer needed now that placeholder is removed

  function isStageOrTitle(it) {
    try {
      const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
      const endRelB = Math.max(startRelB + 1, (it.endOffset || (it.startOffset || 0) + 1) - sectionStartOffset);
      const startC = bytesToCharOffset(text || '', startRelB);
      const endC = bytesToCharOffset(text || '', endRelB);
      const snippet = (text || '').slice(startC, endC).trim();
      if (!snippet) return false;
      // Titles: all caps words (allow spaces and punctuation)
      const hasLetters = /[A-Z]/.test(snippet);
      const hasLower = /[a-z]/.test(snippet);
      if (hasLetters && !hasLower) return true;
      // Stage directions common patterns
      if (/^(Enter|Re-enter|Exit|Exeunt)\b/i.test(snippet)) return true;
      return false;
    } catch { return false; }
  }
  // Determine if the extracted snippet is stage/title; build visibility-aware lists
  // Also, to avoid duplicate notes across adjacent sections, only consider items
  // whose startOffset falls within this section's byte range.
  // Use speech anchors instead of item offsets
  const visiblePreItems = (precomputedItems || []).filter((it) => !isStageOrTitle(it));
  const visibleAllItems = (precomputedAllItems || []).filter((it) => !isStageOrTitle(it));
  function pickVisibleItem(list, startIdx) {
    if (!list || !list.length) return null;
    const n = list.length;
    const s = Math.max(0, Math.min(startIdx || 0, n - 1));
    for (let i = s; i < n; i++) if (list[i]) return list[i];
    for (let i = s - 1; i >= 0; i--) if (list[i]) return list[i];
    return null;
  }
  const currentVisible = pickVisibleItem(visiblePreItems, autoIdx);
  const currentForceVisible = pickVisibleItem(visibleAllItems, autoIdx);
  const forcedSet = new Set((Array.isArray(forcedNotes)?forcedNotes:[]).map(String));
  const currentSpeech = (speeches && speeches.length) ? speeches[Math.min(autoIdx, speeches.length - 1)] : null;
  const speechKey = currentSpeech ? `${currentSpeech.act}|${currentSpeech.scene}|${currentSpeech.speechIndex}` : null;
  // If any forced speech exists in this section, prefer it immediately (even before IO sets autoIdx)
  const sectionForcedSpeech = (speeches || []).find((sp) => forcedSet.has(`${sp.act}|${sp.scene}|${sp.speechIndex}`));
  const forcedKey = sectionForcedSpeech ? `${sectionForcedSpeech.act}|${sectionForcedSpeech.scene}|${sectionForcedSpeech.speechIndex}` : null;
  const chosenItem = (forcedKey ? noteBySpeechKey.get(forcedKey) : (currentVisible || (forceShow ? currentForceVisible : null)));
  // Show the aside only when there is something to show
  const hasAside = !!selectedRange
    || (savedExplanations && savedExplanations.length > 0)
    || (!!chosenItem);
  // Indicate clickability in the text area when a suppressed note exists for the current speech
  const canForceReveal = !selectedRange
    && (!savedExplanations || savedExplanations.length === 0)
    && !currentVisible
    && !!currentForceVisible;

  // Keep forceShow in sync with persisted preference for current speech
  useEffect(() => {
    const it = currentVisible || currentForceVisible;
    const key = it && typeof it.startOffset === 'number' ? it.startOffset : null;
    if (key == null) { setForceShow(false); return; }
    const isForced = Array.isArray(forcedNotes) && forcedNotes.indexOf(key) >= 0;
    setForceShow(isForced);
  }, [autoIdx, currentVisible, currentForceVisible, forcedNotes]);

  const revealNoteForCurrentSpeech = () => {
    const sk = speechKey;
    if (!sk) return;
    if (onToggleForced) onToggleForced(sk, sectionIndex);
  };

  // Handle selection or reveal note on mouse up
  const handleTextMouseUp = (e) => {
    try { console.log('mouseUp:text', { sectionIndex }); } catch {}
    // If the note is not visible yet and a note exists for this speech, a click brings it up
    const noteVisible = !!chosenItem;
    const hasRevealableNote = !!(speechKey && noteBySpeechKey && noteBySpeechKey.get && noteBySpeechKey.get(speechKey));
    if (!noteVisible && hasRevealableNote) {
      suppressNextAutoExplain?.(); // do not auto-explain on reveal-only click
      revealNoteForCurrentSpeech();
      return;
    }
    // If the note is visible, a click selects the sentence; click-drag selects a custom range
    const container = preRef.current;
    if (!container || typeof window === 'undefined' || !window.getSelection) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Only process selections within this section's text container
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return;
    const { start, end } = getOffsetsWithin(container, range);
    // If user dragged, honor the exact selection
    if (end > start) {
      onSelectRange?.({ start, end });
      return;
    }
    // Otherwise, expand single-click caret to the surrounding sentence
    const idx = start;
    const sent = expandToSentence(text || '', idx);
    if (sent) onSelectRange?.({ start: sent.start, end: sent.end });
  };

  // Clean up any pending timers on unmount
  useEffect(() => { return () => { clearTimeout(selDebounceRef.current); }; }, []);

  // In-view observer using invisible anchors per speech start
  useEffect(() => {
    const list = (precomputedAllItems && precomputedAllItems.length ? precomputedAllItems : (precomputedItems && precomputedItems.length ? precomputedItems : []))
    if (!list || !list.length) return;
    const anchors = sectionRef?.current?.querySelectorAll?.(':scope .speechAnchor') || [];
    if (!anchors.length) return;
    function getScroller() {
      const cont = document.querySelector('.container');
      if (cont && cont.scrollHeight > cont.clientHeight + 1) return cont;
      const pg = document.querySelector('.page');
      if (pg && pg.scrollHeight > pg.clientHeight + 1) return pg;
      return null;
    }
    const root = getScroller();
    const io = new IntersectionObserver((entries) => {
      // Pick the top-most/intersecting anchor (closest to top-quarter)
      let best = null;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const idx = parseInt(e.target.getAttribute('data-idx') || '0', 10) || 0;
        const r = e.boundingClientRect;
        const score = Math.abs(r.top - (root ? root.getBoundingClientRect().top + (root.clientHeight * 0.25) : 0));
        if (!best || score < best.score) best = { idx, score };
      }
      if (best) setAutoIdx(best.idx);
    }, { root: root || undefined, threshold: [0, 0.01, 0.1] });
    anchors.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [precomputedAllItems, precomputedItems, sectionRef]);

  // Long-press detection to distinguish tap vs. drag-selection
  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    startXYRef.current = { x: t ? t.clientX : 0, y: t ? t.clientY : 0 };
    movedRef.current = false;
    longPressRef.current = false;
    touchActiveRef.current = true;
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => { longPressRef.current = true; }, 350);
  };
  const onTouchMove = (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = Math.abs((t.clientX || 0) - startXYRef.current.x);
    const dy = Math.abs((t.clientY || 0) - startXYRef.current.y);
    if (dx + dy > 8) {
      movedRef.current = true;
      longPressRef.current = true; // treat as drag-selection
      clearTimeout(pressTimerRef.current);
    }
  };
  const onTouchEnd = () => {
    clearTimeout(pressTimerRef.current);
    touchActiveRef.current = false;
    // handleMouseUp will run and decide tap vs. long-press based on flags
    setTimeout(() => { longPressRef.current = false; movedRef.current = false; }, 80);
  };

  const focusSelected = (targetId) => {
    const container = preRef.current;
    if (!container) return;
    let selEl = null;
    if (targetId) selEl = container.querySelector(`.selected[data-sel-id="${targetId}"]`);
    if (!selEl) return; // don't focus wrong element
    if (!selEl) return;
    selEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    selEl.classList.add('flash');
    setTimeout(() => selEl.classList.remove('flash'), 1800);
  };

  // After selectionId updates to match pending focus, perform the focus then consume flag
  useEffect(() => {
    if (pendingFocus && selectedId && pendingFocus.id === selectedId) {
      focusSelected(selectedId);
      onPendingFocusConsumed?.();
    }
  }, [pendingFocus, selectedId]);

  // hasAside is recomputed just before render using visibility-aware lists

  // No overlay/measurement effects when suppressed; panel appears only when content is shown
  return (
    <div className={`section${hasAside ? '' : ' single'}`} ref={sectionRef}>
      <div className="playText" style={{ position: 'relative' }}>
        {/* Invisible anchors at speech starts for IntersectionObserver */}
        {(() => {
          const secChars = (text || '').length || 1;
    const list = (precomputedAllItems && precomputedAllItems.length ? precomputedAllItems : (precomputedItems && precomputedItems.length ? precomputedItems : []))
          return list.map((it, i) => {
            const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
            const startC = bytesToCharOffset(text || '', startRelB);
            const topPct = (startC / Math.max(1, secChars)) * 100;
            return <div key={`anch-${i}`} className="speechAnchor" data-idx={i} style={{ position: 'absolute', top: `${topPct}%`, left: 0, width: 1, height: 1, pointerEvents: 'none' }} />;
          });
        })()}
        <pre ref={preRef} onMouseUp={handleTextMouseUp} style={{ cursor: 'pointer' }}>
          {renderWithSelectionAndHighlights(text, query, selectedRange, matchRefs, selectedId)}
        </pre>
      </div>
      {hasAside ? (
        <aside
          className="explanations"
          aria-label="Explanations"
          ref={asideRef}
          // No click-to-close; use the X button in the panel header
        >
          {/* Aside is only rendered when it has content to show */}
          {/* New explanations appear as separate cards below; no inline panel */}
          {chosenItem ? (
            <div>
              {(() => {
                const it = chosenItem;
                if (!it) return null; // safety
                const handleCloseNote = (e) => {
                  e.stopPropagation();
                  if (forcedKey && onToggleForced) onToggleForced(forcedKey, sectionIndex);
                  else if (forceShow) setForceShow(false);
                };
                const toggleFollow = () => setShowPreFollow((v)=>!v);
                const submitFollow = async () => {
                  const q = (preFollowInput || '').trim();
                  if (!q) return;
                  try {
                    setPreFollowLoading(true);
                    const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
                    const endRelB = Math.max(startRelB + 1, (it.endOffset || (it.startOffset || 0) + 1) - sectionStartOffset);
                    const startC = bytesToCharOffset(text || '', startRelB);
                    const endC = bytesToCharOffset(text || '', endRelB);
                    const passage = (text || '').slice(startC, endC);
                    const ctx = getContextForOffset(metadata || {}, it.startOffset || 0);
                    const res = await fetch('/api/explain', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ selectionText: passage, context: { act: ctx.act, scene: ctx.scene, speaker: ctx.speaker, onStage: ctx.onStage }, options: llm?.options, messages: [], mode: 'followup', followup: q })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.detail || data?.error || 'LLM error');
                    const a = data?.content || '';
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q, a });
                      return { ...prev, [key]: arr };
                    });
                    setPreFollowInput('');
                  } catch (e) {
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q, a: `Error: ${String(e.message || e)}` });
                      return { ...prev, [key]: arr };
                    });
                  } finally {
                    setPreFollowLoading(false);
                  }
                };
                const requestLonger = async () => {
                  const q = 'Please expand this into a longer explanation with more detail.';
                  try {
                    setPreFollowLoading(true);
                    const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
                    const endRelB = Math.max(startRelB + 1, (it.endOffset || (it.startOffset || 0) + 1) - sectionStartOffset);
                    const startC = bytesToCharOffset(text || '', startRelB);
                    const endC = bytesToCharOffset(text || '', endRelB);
                    const passage = (text || '').slice(startC, endC);
                    const ctx = getContextForOffset(metadata || {}, it.startOffset || 0);
                    const res = await fetch('/api/explain', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ selectionText: passage, context: { act: ctx.act, scene: ctx.scene, speaker: ctx.speaker, onStage: ctx.onStage }, options: llm?.options, messages: [], mode: 'followup', followup: q })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.detail || data?.error || 'LLM error');
                    const a = data?.content || '';
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q: 'More detail', a });
                      return { ...prev, [key]: arr };
                    });
                  } catch (e) {
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q: 'More detail', a: `Error: ${String(e.message || e)}` });
                      return { ...prev, [key]: arr };
                    });
                  } finally {
                    setPreFollowLoading(false);
                  }
                };
                return (
                  <div key={`pc-${autoIdx}-${it.startOffset || autoIdx}`} style={{ marginBottom: '0.75rem', paddingBottom: '0.5rem', paddingRight: '32px', paddingTop: '6px', borderBottom: '1px solid #eee', position: 'relative' }}>
                    <button type="button" className="closeBtn" onClick={handleCloseNote} aria-label="Close note" style={{ position: 'absolute', right: 0, top: 0 }}>✕</button>
                    {(() => { const key = String(it.startOffset || 0); const display = (preNoteOverrides[key] != null ? preNoteOverrides[key] : (it.content || '')); return (
                      <div className="noteContent" style={{ whiteSpace: 'pre-wrap', cursor: 'pointer', userSelect: 'text' }} onClick={(e)=>{ e.stopPropagation(); suppressNextAutoExplain?.(); toggleFollow(); }} title="Ask a follow-up about this note">{display}</div>
                    ); })()}
                    <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 4 }}>
                      {it.model ? `Model: ${it.model}` : ''}
                    </div>
                    {showPreFollow && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input type="text" placeholder="Ask a follow‑up…" value={preFollowInput} onChange={(e)=>{ e.stopPropagation(); setPreFollowInput(e.target.value); }} onKeyDown={(e)=>{ if (e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); submitFollow(); } }} style={{ flex:1, minWidth:0 }} />
                        <button type="button" disabled={preFollowLoading || !preFollowInput.trim()} onClick={(e)=>{ e.stopPropagation(); submitFollow(); }}>Ask</button>
                        <button type="button" disabled={preFollowLoading} onClick={(e)=>{ e.stopPropagation(); (async()=>{
                          const q = 'Expand into a longer, more detailed explanation without repeating earlier sentences.';
                          try {
                            setPreFollowLoading(true);
                            const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
                            const endRelB = Math.max(startRelB + 1, (it.endOffset || (it.startOffset || 0) + 1) - sectionStartOffset);
                            const startC = bytesToCharOffset(text || '', startRelB);
                            const endC = bytesToCharOffset(text || '', endRelB);
                            const passage = (text || '').slice(startC, endC);
                            const ctx = getContextForOffset(metadata || {}, it.startOffset || 0);
                            const res = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectionText: passage, context: { act: ctx.act, scene: ctx.scene, speaker: ctx.speaker, onStage: ctx.onStage }, options: llm?.options, messages: [], mode: 'followup', followup: q }) });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.detail || data?.error || 'LLM error');
                            const a = data?.content || '';
                            const key = String(it.startOffset || 0);
                            setPreNoteOverrides((prev)=>({ ...prev, [key]: a }));
                          } catch (e) {
                            const key = String(it.startOffset || 0);
                            setPreFollowThreads((prev) => { const arr = Array.isArray(prev[key]) ? prev[key].slice() : []; arr.push({ q: 'More', a: `Error: ${String(e.message || e)}` }); return { ...prev, [key]: arr }; });
                          } finally { setPreFollowLoading(false); }
                        })(); }} title="Get a longer response">More</button>
                      </div>
                    )}
                    {preFollowLoading && <div style={{ marginTop: '0.5rem', color:'#6b5f53' }}>Thinking…</div>}
                    {(() => {
                      const thread = preFollowThreads[String(it.startOffset || 0)] || [];
                      if (!thread.length) return null;
                      return (
                        <div style={{ marginTop: '0.5rem' }}>
                          {thread.map((m, idx) => (
                            <div key={`fu-${idx}`} style={{ marginBottom: '0.5rem' }}>
                              <div style={{ whiteSpace:'pre-wrap' }}>{m.a}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          ) : null}
          {/* Placeholder removed; clicking the empty aside reveals the suppressed note */}
          {savedExplanations.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              {savedExplanations.map((ex, i) => (
                <ExplanationCard
                  key={`ex-${i}-${ex?.meta?.byteOffset || i}`}
                  passage={ex?.meta?.text || ''}
                  content={ex?.last || ''}
                  meta={ex?.meta}
                  options={llm?.options}
                onLocate={() => {
                  if (ex?.meta) {
                    onSelectRange({ start: ex.meta.start, end: ex.meta.end });
                    const len = new TextEncoder().encode(ex.meta.text || '').length;
                    const id = `${ex.meta.byteOffset}-${len}`;
                    onRequestFocus?.({ sectionIndex, id });
                  }
                }}
                  onCopy={() => {
                    if (ex?.meta) {
                      const len = new TextEncoder().encode(ex.meta.text || '').length;
                      const url = buildSelectionLink(ex.meta.byteOffset, len);
                      navigator.clipboard?.writeText(url);
                      setHashForSelection(ex.meta.byteOffset, len);
                    }
                  }}
                  onDelete={() => {
                    if (ex?.meta) {
                      const len = new TextEncoder().encode(ex.meta.text || '').length;
                      const id = `${ex.meta.byteOffset}-${len}`;
                      onDeleteSaved?.(id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </aside>
      ) : null}
    </div>
  );
}

function SearchBar({ input, onInputChange, onSubmit, onClear, onPrev, onNext, count, index, onOpenPrintView, exCount = 0, exIndex = 0, onPrevEx, onNextEx, submitted }) {
  return (
    <form
      className="searchBar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        type="search"
        placeholder="Search the play…"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        aria-label="Search text"
      />
      {count > 1 && (
        <>
          <button type="button" onClick={onPrev} aria-label="Previous result">◀</button>
          <button type="button" onClick={onNext} aria-label="Next result">▶</button>
        </>
      )}
      {count > 0 ? (
        <span className="searchCount" aria-live="polite">{`${index} / ${count}`}</span>
      ) : submitted ? (
        <span className="searchCount" aria-live="polite">No results</span>
      ) : null}
      <button type="button" onClick={onPrevEx} disabled={!exCount} title="Previous explanation">◀</button>
      <button type="button" onClick={onNextEx} disabled={!exCount} title="Next explanation">▶</button>
      <span className="searchCount" aria-live="polite">
        {exCount ? `${exIndex} / ${exCount}` : '0 explanations'}
      </span>
      <button type="button" onClick={onOpenPrintView} aria-label="Open print view">
        Print
      </button>
    </form>
  );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlighted(text, query, matchRefs) {
  if (!query || !query.trim()) return text;
  const q = query.trim();
  try {
    const regex = new RegExp(escapeRegExp(q), 'gi');
    const nodes = [];
    let lastIndex = 0;
    let match;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
      const { index } = match;
      if (index > lastIndex) {
        nodes.push(text.slice(lastIndex, index));
      }
      const matchText = match[0];
      nodes.push(
        <span
          key={`m-${key++}`}
          className="highlight"
          ref={(el) => {
            if (el) matchRefs.current.push(el);
          }}
        >
          {matchText}
        </span>
      );
      lastIndex = index + matchText.length;
    }
    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }
    return nodes;
  } catch (e) {
    // Fallback to raw text if regex fails for any reason
    return text;
  }
}

// Client-side context lookup using prebuilt metadata
function getContextForOffset(meta, byteOffset) {
  if (!meta) return { act: null, scene: null, onStage: [], speaker: null };
  // Find scene
  let act = null;
  let scene = null;
  for (const s of meta.scenes || []) {
    if (s.startOffset != null && s.endOffset != null && byteOffset >= s.startOffset && byteOffset <= s.endOffset) {
      act = s.act;
      scene = s.scene;
      break;
    }
  }
  // Last stage event before offset
  let onStage = [];
  for (let i = (meta.stageEvents?.length || 0) - 1; i >= 0; i--) {
    const ev = meta.stageEvents[i];
    if (ev.offset <= byteOffset) {
      onStage = ev.onStage || [];
      break;
    }
  }
  // Last speech before offset
  let speaker = null;
  for (let i = (meta.speeches?.length || 0) - 1; i >= 0; i--) {
    const sp = meta.speeches[i];
    if (sp.offset <= byteOffset) {
      speaker = sp.speaker;
      break;
    }
  }
  return { act, scene, onStage, speaker };
}

function bytesToCharOffset(text, targetBytes) {
  const enc = new TextEncoder();
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    // encode one char
    const b = enc.encode(text[i]).length;
    if (bytes + b > targetBytes) return i;
    bytes += b;
  }
  return text.length;
}

function parseSelectionHash(hash) {
  // format: #sel=<byteOffset>-<length>
  const m = /^#sel=(\d+)-(\d+)$/.exec(hash || '');
  if (!m) return null;
  return { byteOffset: parseInt(m[1], 10), length: parseInt(m[2], 10) };
}

function setHashForSelection(byteOffset, length) {
  const url = new URL(window.location.href);
  url.hash = `sel=${byteOffset}-${length}`;
  window.history.replaceState(null, '', url.toString());
}

function buildSelectionLink(byteOffset, length) {
  const url = new URL(window.location.href);
  url.hash = `sel=${byteOffset}-${length}`;
  return url.toString();
}

function renderWithSelectionAndHighlights(text, query, selectedRange, matchRefs, selId) {
  if (!selectedRange) return renderHighlighted(text, query, matchRefs);
  const start = Math.max(0, Math.min(selectedRange.start, selectedRange.end));
  const end = Math.max(start, Math.max(selectedRange.start, selectedRange.end));
  const before = text.slice(0, start);
  const middle = text.slice(start, end);
  const after = text.slice(end);
  return [
    ...[].concat(renderHighlighted(before, query, matchRefs)),
    <span key="sel" className="selected" data-sel-id={selId || ''}>{renderHighlighted(middle, query, matchRefs)}</span>,
    ...[].concat(renderHighlighted(after, query, matchRefs)),
  ];
}

function getOffsetsWithin(container, range) {
  const r0 = document.createRange();
  r0.selectNodeContents(container);
  const before = r0.cloneRange();
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const beforeEnd = r0.cloneRange();
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  const end = beforeEnd.toString().length;
  return { start, end };
}

function expandToSentence(text, index) {
  if (!text) return null;
  const len = text.length;
  let start = index;
  let end = index;
  // Move start left to previous sentence ender (.!?), then step to first non-space/newline
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      start = i + 1;
      break;
    }
    start = 0;
  }
  // Skip leading whitespace/newlines
  while (start < len && /\s/.test(text[start])) start++;
  // Move end right to next sentence ender (.!?), include trailing quotes/brackets if adjacent
  for (let i = index; i < len; i++) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      end = i + 1;
      // include immediate closing quotes/brackets
      while (end < len && /["'\)\]]/.test(text[end])) end++;
      break;
    }
    end = len;
  }
  // Trim trailing whitespace/newlines
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end > start) return { start, end };
  return null;
}

function LlmPanel({ passage, contextInfo, llm, onFocusSource, onCopyLink }) {
  const { options, loading, conversation, onDeleteCurrent, onLength, onFollowup } = llm || {};
  const [q, setQ] = useState('');
  const submitFollowup = () => {
    const v = (q || '').trim();
    if (!v) return;
    onFollowup?.(v);
    setQ('');
  };
  return (
    <div>
      {conversation?.last ? (
        <div style={{ marginTop: '0.5rem' }} onClick={onFocusSource} title="Click to highlight source in the text">
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Explanation</div>
          <div style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}>{conversation.last}</div>
        </div>
      ) : null}
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#6b5f53' }}>Length:</span>
        <button type="button" disabled={loading} onClick={() => onLength?.('brief')}>Brief</button>
        <button type="button" disabled={loading} onClick={() => onLength?.('medium')}>Medium</button>
        <button type="button" disabled={loading} onClick={() => onLength?.('large')}>Large</button>
        <button type="button" onClick={onFocusSource} title="Highlight source in text">Locate Source</button>
        <span style={{ marginLeft: 'auto', color: '#6b5f53' }}>Provider/Model: {(options?.provider || 'openai')}/{options?.model || ''}</span>
        <button
          type="button"
          onClick={() => { if (onDeleteCurrent) onDeleteCurrent(); }}
          title="Delete this explanation"
        >
          Delete
        </button>
      </div>
      {/* Follow-up question */}
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="text"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="Ask a follow‑up…"
          onKeyDown={(e)=>{ if (e.key==='Enter') { e.preventDefault(); submitFollowup(); } }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" disabled={loading || !q.trim()} onClick={submitFollowup}>Ask</button>
      </div>
      {loading && (
        <div style={{ marginTop: '0.5rem', color: '#6b5f53' }}>Thinking…</div>
      )}
    </div>
  );
}

function ExplanationCard({ passage, content, onLocate, onCopy, onDelete, meta, options }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState([]); // [{q,a}]
  const ask = async (followupText) => {
    const v = (followupText || q || '').trim();
    if (!v) return;
    try {
      setLoading(true);
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectionText: meta?.text || passage || '',
          context: { act: meta?.act, scene: meta?.scene, speaker: meta?.speaker, onStage: meta?.onStage },
          options: options || {},
          messages: [],
          mode: 'followup',
          followup: v,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'LLM error');
      setThread((t) => t.concat({ q: v, a: data?.content || '' }));
      setQ('');
    } catch (e) {
      setThread((t) => t.concat({ q: v, a: `Error: ${String(e.message || e)}` }));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', paddingRight: '32px', borderTop: '1px solid #eee', position: 'relative' }}>
      <button type="button" className="closeBtn" onClick={onDelete} aria-label="Close explanation" style={{ position: 'absolute', right: 0, top: 0 }}>✕</button>
      <div style={{ marginTop: '0.25rem' }} onClick={() => { onLocate?.(); setOpen((v)=>!v); }} title="Click to highlight source and toggle follow‑up">
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Explanation</div>
        <div style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}>{content || '—'}</div>
        <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 4 }}>
          {options?.model ? `Model: ${options.model}` : ''}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Ask a follow‑up…" value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); ask(); } }} style={{ flex:1, minWidth:0 }} />
          <button type="button" disabled={loading || !q.trim()} onClick={()=>ask()}>Ask</button>
          <button type="button" disabled={loading} onClick={()=>ask('Expand into a longer, more detailed explanation without repeating earlier sentences.')}>More</button>
          {loading && <span style={{ color:'#6b5f53' }}>Thinking…</span>}
        </div>
      )}
      {open && thread.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          {thread.map((m, i) => (
            <div key={`fu-${i}`} style={{ marginBottom: '0.5rem' }}>
              <div style={{ whiteSpace:'pre-wrap' }}>{m.a}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
