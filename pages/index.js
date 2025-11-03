import Head from 'next/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseSectionsWithOffsets } from '../lib/parseText';
import fs from 'fs';
import path from 'path';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const densityToThreshold = (density) => clamp(100 - density, 0, 100);
const thresholdToDensity = (threshold) => clamp(100 - threshold, 0, 100);
const clampFontScale = (value) => clamp(value, 0.7, 1.6);
const applyFontScaleToDocument = (value) => {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--font-scale', value.toFixed(3));
  }
};
const PROVIDER_NAME_MAP = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};
const formatProviderName = (provider) => {
  if (!provider) return '';
  const lower = provider.toLowerCase();
  if (PROVIDER_NAME_MAP[lower]) return PROVIDER_NAME_MAP[lower];
  return provider.charAt(0).toUpperCase() + provider.slice(1);
};

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
  // Note visibility threshold (0–100). Lower thresholds surface more notes.
  const [noteThreshold, setNoteThreshold] = useState(50);
  const [fontScale, setFontScale] = useState(1);
  const fontScaleRef = useRef(1);
  const [fontScaleHydrated, setFontScaleHydrated] = useState(false);
  const suppressAutoExplainRef = useRef(false);
  const DEBUG_SCROLL = false;
  const DEBUG_RESTORE = false;
  const DEBUG_SELECTION = false;
  // Persist force-shown notes (by speech key act|scene|speechIndex)
  const [forcedNotes, setForcedNotes] = useState([]);
  // Track which note is in text selection mode (speech key string or null)
  const [noteInSelectMode, setNoteInSelectMode] = useState(null);
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

  const applyLiveFontScale = useCallback((value, { commit = false } = {}) => {
    const next = clampFontScale(value);
    applyFontScaleToDocument(next);
    fontScaleRef.current = next;
    if (commit) {
      setFontScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
    }
    return next;
  }, [setFontScale]);

  useEffect(() => {
    let initial = 1;
    if (typeof window === 'undefined') {
      applyLiveFontScale(initial, { commit: true });
      setFontScaleHydrated(true);
      return () => {};
    }
    try {
      const rawScale = window.localStorage.getItem('fontScale');
      if (rawScale !== null && rawScale !== '') {
        const val = parseFloat(rawScale);
        if (Number.isFinite(val)) initial = clampFontScale(val);
      }
    } catch {}
    applyLiveFontScale(initial, { commit: true });
    setFontScaleHydrated(true);
    return () => {};
  }, [applyLiveFontScale]);

  useEffect(() => {
    applyLiveFontScale(fontScale);
    if (!fontScaleHydrated) return;
    try { localStorage.setItem('fontScale', String(fontScale)); } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('font-scale-updated', { detail: { value: fontScale } }));
    }
  }, [applyLiveFontScale, fontScale, fontScaleHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const handler = (e) => {
      const raw = e?.detail?.value;
      const val = typeof raw === 'number' ? raw : parseFloat(raw);
      if (!Number.isFinite(val)) return;
      applyLiveFontScale(val, { commit: true });
    };
    window.addEventListener('font-scale-set', handler);
    return () => window.removeEventListener('font-scale-set', handler);
  }, [applyLiveFontScale]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

    const state = { active: false, startDist: 0, startScale: 1 };
    const gestureState = { startScale: 1 };
    let pendingScale = null;
    let rafId = null;

    const distance = (touches) => {
      if (!touches || touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const flushPending = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (pendingScale != null) {
        applyLiveFontScale(pendingScale);
        pendingScale = null;
      }
    };

    const scheduleScale = (value) => {
      pendingScale = value;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pendingScale != null) {
          applyLiveFontScale(pendingScale);
          pendingScale = null;
        }
      });
    };

    const onTouchStart = (e) => {
      if (e.touches.length >= 2) {
        flushPending();
        state.active = true;
        state.startDist = distance(e.touches);
        state.startScale = fontScaleRef.current;
        window.__pinchActive = true;
        e.preventDefault();
      } else {
        state.active = false;
      }
    };

    const onTouchMove = (e) => {
      if (!state.active || e.touches.length !== 2) return;
      const dist = distance(e.touches);
      if (state.startDist <= 0 || dist <= 0) return;
      const ratio = dist / state.startDist;
      scheduleScale(state.startScale * ratio);
      e.preventDefault();
    };

    const finalizeTouch = () => {
      if (!state.active) return false;
      flushPending();
      applyLiveFontScale(fontScaleRef.current, { commit: true });
      state.active = false;
      window.__pinchActive = false;
      return true;
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) {
        const didCommit = finalizeTouch();
        if (!didCommit) window.__pinchActive = false;
        if (didCommit) e.preventDefault();
        return;
      }
      if (state.active) e.preventDefault();
    };

    const onGestureStart = (e) => {
      flushPending();
      gestureState.startScale = fontScaleRef.current;
      window.__pinchActive = true;
      e.preventDefault();
    };

    const onGestureChange = (e) => {
      const scale = typeof e.scale === 'number' && Number.isFinite(e.scale) ? e.scale : 1;
      scheduleScale(gestureState.startScale * scale);
      e.preventDefault();
    };

    const onGestureEnd = (e) => {
      flushPending();
      applyLiveFontScale(fontScaleRef.current, { commit: true });
      window.__pinchActive = false;
      e.preventDefault();
    };

    const add = (target, type, handler, opts) => {
      if (target?.addEventListener) target.addEventListener(type, handler, opts);
    };
    const remove = (target, type, handler, opts) => {
      if (target?.removeEventListener) target.removeEventListener(type, handler, opts);
    };

    const optionsPassiveFalse = { passive: false };
    const targets = [window, document];

    targets.forEach((target) => {
      add(target, 'touchstart', onTouchStart, optionsPassiveFalse);
      add(target, 'touchmove', onTouchMove, optionsPassiveFalse);
      add(target, 'touchend', onTouchEnd, optionsPassiveFalse);
      add(target, 'touchcancel', onTouchEnd, optionsPassiveFalse);
      add(target, 'gesturestart', onGestureStart, optionsPassiveFalse);
      add(target, 'gesturechange', onGestureChange, optionsPassiveFalse);
      add(target, 'gestureend', onGestureEnd, optionsPassiveFalse);
    });

    return () => {
      flushPending();
      targets.forEach((target) => {
        remove(target, 'touchstart', onTouchStart, optionsPassiveFalse);
        remove(target, 'touchmove', onTouchMove, optionsPassiveFalse);
        remove(target, 'touchend', onTouchEnd, optionsPassiveFalse);
        remove(target, 'touchcancel', onTouchEnd, optionsPassiveFalse);
        remove(target, 'gesturestart', onGestureStart, optionsPassiveFalse);
        remove(target, 'gesturechange', onGestureChange, optionsPassiveFalse);
        remove(target, 'gestureend', onGestureEnd, optionsPassiveFalse);
      });
      window.__pinchActive = false;
    };
  }, [applyLiveFontScale]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

    let wheelCommitTimer = null;
    let pendingScale = null;
    let rafId = null;

    const flushPending = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (pendingScale != null) {
        applyLiveFontScale(pendingScale);
        pendingScale = null;
      }
    };

    const scheduleScale = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pendingScale != null) {
          applyLiveFontScale(pendingScale);
          pendingScale = null;
        }
      });
    };

    const scheduleCommit = () => {
      if (wheelCommitTimer) clearTimeout(wheelCommitTimer);
      wheelCommitTimer = setTimeout(() => {
        flushPending();
        applyLiveFontScale(fontScaleRef.current, { commit: true });
        wheelCommitTimer = null;
      }, 120);
    };

    const onWheel = (e) => {
      if (window.__pinchActive) return;
      if (!e.ctrlKey) return;
      e.preventDefault();
      const scaleFactor = Math.exp(-e.deltaY / 500);
      const base = pendingScale != null ? pendingScale : fontScaleRef.current;
      pendingScale = clampFontScale(base * scaleFactor);
      scheduleScale();
      scheduleCommit();
    };

    const wheelTargets = [window, document];
    wheelTargets.forEach((target) => {
      if (target?.addEventListener) target.addEventListener('wheel', onWheel, { passive: false });
    });

    return () => {
      flushPending();
      if (wheelCommitTimer) {
        clearTimeout(wheelCommitTimer);
        wheelCommitTimer = null;
      }
      wheelTargets.forEach((target) => {
        if (target?.removeEventListener) target.removeEventListener('wheel', onWheel, { passive: false });
      });
    };
  }, [applyLiveFontScale]);
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
      // Handle Act II CHORUS which appears before Act II Scene I
      const act2Scene1 = scenes.find(s => s.act === 'II' && s.scene === 'I');
      if (act2Scene1 && off >= 30000 && off < act2Scene1.startOffset) {
        return { act: 'II', scene: '' };
      }
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
  const restoreCompletedRef = useRef(false); // Track if restore has completed to prevent multiple restores
  // Check immediately if we have a saved position to restore (before scroll handler can overwrite it)
  const initialRestoreAttempt = useMemo(() => {
    if (typeof window === 'undefined') return { attempted: false };
    try {
      const rawScroll = localStorage.getItem('last-scroll');
      const savedScroll = rawScroll ? parseFloat(rawScroll) : NaN;
      const hasValidPosition = !Number.isNaN(savedScroll) && savedScroll > 50;
      return { attempted: hasValidPosition };
    } catch {
      return { attempted: false };
    }
  }, []);
  const restoreAttemptedRef = useRef(initialRestoreAttempt.attempted);
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
    let rafId = null;
    let pendingUpdate = false;
    
    const onScroll = () => {
      // Throttle scroll handler using requestAnimationFrame to batch reads
      if (!pendingUpdate) {
        pendingUpdate = true;
        rafId = requestAnimationFrame(() => {
          pendingUpdate = false;
          const s = getScroller();
          if (!s) return;
          
          // Batch all DOM reads first to avoid forced reflows
          const scrollTop = s === window ? window.scrollY : s.scrollTop;
          const els = sectionElsRef.current.filter(Boolean);
          const y = scrollTop;
          let bestIndex = 0;
          const threshold = 40;
          
          // Batch getBoundingClientRect calls
          for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if (!el) continue;
            const top = getElementTopWithin(el, s);
            if (top <= y + threshold) bestIndex = i; else break;
          }
          
          // Update state (these are batched by React)
          setShowTocButton(scrollTop > 240);
          
          // Always update active scene for TOC tracking (don't skip this during restore)
          const startOffset = sectionsWithOffsets[bestIndex]?.startOffset;
          if (startOffset != null && metadata?.scenes) {
            let current = null;
            for (const scene of metadata.scenes) {
              if (scene.startOffset != null && scene.endOffset != null) {
                if (startOffset >= scene.startOffset && startOffset <= scene.endOffset) {
                  current = { act: scene.act, scene: scene.scene };
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
          }
          
          // Persist reading position occasionally (but not during initial restore)
          try {
            // Don't save if restore is in progress (prevents overwriting saved position on reload)
            if (restoreAttemptedRef.current) {
              const timeSinceLoad = Date.now() - (typeof performance !== 'undefined' && performance.timing ? performance.timing.navigationStart : 0);
              if (timeSinceLoad < 3000) {
                return;
              }
              restoreAttemptedRef.current = false;
            }
            
            const now = Date.now();
            if (now - (lastPosSaveRef.current || 0) > 500) {
              // Batch reads: get scroll values together
              const scrollHeight = s === window ? document.documentElement.scrollHeight : s.scrollHeight;
              // Don't save position if we're at the top - this is likely from page load, not intentional scrolling
              // Only save if we've actually scrolled away from the top
              if (scrollTop > 100) {
                let containerType = 'window';
                if (s !== window) {
                  if (s.classList && s.classList.contains('container')) {
                    containerType = 'container';
                  } else if (s.classList && s.classList.contains('page')) {
                    containerType = 'page';
                  } else {
                    const isContainer = document.querySelector('.container') === s;
                    const isPage = document.querySelector('.page') === s;
                    containerType = isContainer ? 'container' : (isPage ? 'page' : 'unknown');
                  }
                }
                localStorage.setItem('last-scroll', String(scrollTop));
                localStorage.setItem('last-scrollHeight', String(scrollHeight));
                localStorage.setItem('last-scroll-container', containerType);
              }
              lastPosSaveRef.current = now;
            }
          } catch {}
        });
      }
    };
    if (scroller) {
      scroller.addEventListener('scroll', onScroll, { passive: true });
      // Initial call also batched via RAF
      requestAnimationFrame(() => onScroll());
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      const s = getScroller();
      if (s) s.removeEventListener('scroll', onScroll);
    };
  }, [metadata, sectionsWithOffsets]);

  // Restore reading position on load (when there is no deep-link selection)
  useEffect(() => {
    try {
      // Prevent multiple restores if already completed
      if (restoreCompletedRef.current) {
        if (DEBUG_RESTORE) console.log('[restore] Already completed, skipping');
        return;
      }
      if (!sectionsWithOffsets || !sectionsWithOffsets.length) {
        if (DEBUG_RESTORE) console.log('[restore] No sections available');
        return;
      }
      if (typeof window === 'undefined') {
        if (DEBUG_RESTORE) console.log('[restore] Window undefined');
        return;
      }
      if (/^#sel=/.test(window.location.hash || '')) {
        if (DEBUG_RESTORE) console.log('[restore] Selection link in hash, skipping restore');
        return; // selection link takes precedence
      }
      let savedScroll = NaN;
      let savedScrollHeight = NaN;
      let savedContainerType = null;
      const rawScroll = localStorage.getItem('last-scroll');
      if (rawScroll) savedScroll = parseFloat(rawScroll);
      const rawScrollHeight = localStorage.getItem('last-scrollHeight');
      if (rawScrollHeight) savedScrollHeight = parseFloat(rawScrollHeight);
      const rawContainerType = localStorage.getItem('last-scroll-container');
      if (rawContainerType) savedContainerType = rawContainerType;
      if (DEBUG_RESTORE) console.log('[restore] Loaded from localStorage:', { scrollTop: savedScroll, scrollHeight: savedScrollHeight, containerType: savedContainerType });
      
      // Check if we have a valid scroll position to restore
      // Only ignore positions at 0 or very close to 0 (likely from initial page load, not intentional scrolling)
      // Allow restoring positions > 50px (including near-top positions like Prologue)
      const hasValidScroll = !isNaN(savedScroll) && savedScroll > 50;
      
      if (!hasValidScroll) {
        if (DEBUG_RESTORE) console.log('[restore] No valid scroll position to restore (savedScroll:', savedScroll, '), starting at top');
        // Only clear positions that are exactly 0 or very close (likely from page load, not intentional scrolling)
        try {
          if (!isNaN(savedScroll) && savedScroll <= 50) {
            localStorage.removeItem('last-scroll');
            localStorage.removeItem('last-scrollHeight');
            localStorage.removeItem('last-scroll-container');
            if (DEBUG_RESTORE) console.log('[restore] Cleared very small saved position (likely from page load)');
          }
        } catch {}
        restoreAttemptedRef.current = false; // No restore needed, allow saving
        return;
      }
      
      // Flag should already be set from initialization, but ensure it's set here too
      restoreAttemptedRef.current = true; // Prevent saving while restoring
      
      if (DEBUG_RESTORE) console.log('[restore] Will restore scroll position:', savedScroll);
      
      let attempts = 0;
      const maxAttempts = 20; // Try for up to 2 seconds
      const savedScrollValue = savedScroll; // Capture for closure
      const savedScrollHeightValue = savedScrollHeight; // Capture for closure
      const savedContainerTypeValue = savedContainerType; // Capture for closure
      
      // Wait for DOM to be ready, then restore position
      // Defer to avoid forced reflows during initial render
      const restorePosition = () => {
        attempts++;
        let scroller = getScroller();
        
        // Check if scroller exists (no DOM reads yet)
        if (!scroller) {
          if (attempts < maxAttempts) {
            // Use setTimeout instead of RAF to avoid blocking render
            setTimeout(restorePosition, 50);
          } else if (DEBUG_RESTORE) {
            console.log('[restore] Failed: no scroller after', attempts, 'attempts');
          }
          return;
        }
        
        // Check if sections are rendered (cheap check, no layout reads)
        const hasSections = sectionElsRef.current && sectionElsRef.current.length > 0 && sectionElsRef.current[0];
        if (!hasSections) {
          if (attempts < maxAttempts) {
            setTimeout(restorePosition, 50);
          } else if (DEBUG_RESTORE) {
            console.log('[restore] Failed: sections not rendered after', attempts, 'attempts');
          }
          return;
        }
        
        // Now that we know DOM is ready, batch ALL layout reads in one RAF to avoid forced reflows
        // Use double RAF to ensure browser has finished all layout calculations
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Batch all layout reads together to avoid forced reflows
            const scrollHeight = scroller === window ? document.documentElement.scrollHeight : scroller.scrollHeight;
            const clientHeight = scroller === window ? document.documentElement.clientHeight : scroller.clientHeight;
            
            // Check if scroller has scrollable content (scrollHeight > clientHeight)
            if (scrollHeight <= clientHeight) {
              if (attempts < maxAttempts) {
                setTimeout(restorePosition, 50);
              } else if (DEBUG_RESTORE) {
                console.log('[restore] Failed: scroller not ready (scrollHeight:', scrollHeight, 'clientHeight:', clientHeight, ')');
              }
              return;
            }
            
            // Check the container type matches what we saved (after we have layout values)
            let currentContainerType = 'window';
            if (scroller !== window) {
              if (scroller.classList && scroller.classList.contains('container')) {
                currentContainerType = 'container';
              } else if (scroller.classList && scroller.classList.contains('page')) {
                currentContainerType = 'page';
              } else {
                const isContainer = document.querySelector('.container') === scroller;
                const isPage = document.querySelector('.page') === scroller;
                currentContainerType = isContainer ? 'container' : (isPage ? 'page' : 'unknown');
              }
            }
            const containerMismatch = savedContainerTypeValue && savedContainerTypeValue !== currentContainerType;
            
            // On mobile, .page is the scroll container; on desktop it might be .container or window
            const isMobile = typeof window !== 'undefined' && window.innerWidth <= 820;
            const wasMobile = savedContainerTypeValue === 'page';
            
            if (DEBUG_RESTORE) {
              console.log('[restore] Container check:', {
                current: currentContainerType,
                saved: savedContainerTypeValue,
                mismatch: containerMismatch,
                isMobile,
                wasMobile,
                element: scroller === window ? 'window' : scroller.className,
              });
            }
            
            if (DEBUG_RESTORE) {
              console.log('[restore] Attempting restore at attempt', attempts, {
                scroller: currentContainerType,
                scrollHeight: scrollHeight,
                clientHeight: clientHeight,
                savedScroll: savedScrollValue,
                savedHeight: savedScrollHeightValue,
                containerMismatch,
              });
            }
            
            // Calculate target scroll position - adjust for layout changes if scrollHeight changed
            let targetScroll = savedScrollValue;
            const currentScrollHeight = scrollHeight;
            
            // On mobile, .page container has different scroll context (starts after header)
            // Be more careful with proportional adjustment on mobile
            // (isMobile already defined above in this function scope)
            
            // Only adjust proportionally if:
            // 1. We have both old and new scrollHeight values
            // 2. The change is significant (> 10% difference) to avoid tiny adjustments that make things worse
            // 3. AND the saved scroll position is far enough from top (> 1000px) that proportional adjustment makes sense
            // 4. AND we're NOT on mobile with a container mismatch (too unreliable)
            const shouldAdjust = !isNaN(savedScrollHeightValue) && savedScrollHeightValue > 0 && currentScrollHeight > 0;
            const heightDiff = Math.abs(currentScrollHeight - savedScrollHeightValue);
            const heightDiffPercent = savedScrollHeightValue > 0 ? (heightDiff / savedScrollHeightValue) * 100 : 0;
            const significantChange = heightDiffPercent > 10; // More than 10% change
            const isFarFromTop = savedScrollValue > 1000; // Only do proportional adjustment for positions far from top
            const skipMobileAdjust = isMobile && containerMismatch; // Skip adjustment on mobile if container changed
            
            if (shouldAdjust && !skipMobileAdjust && ((significantChange && isFarFromTop) || (containerMismatch && isFarFromTop && !isMobile))) {
              const ratio = savedScrollValue / savedScrollHeightValue;
              targetScroll = currentScrollHeight * ratio;
              if (DEBUG_RESTORE) {
                console.log('[restore] Layout changed - adjusting scroll:', {
                  oldScroll: savedScrollValue,
                  oldHeight: savedScrollHeightValue,
                  newHeight: currentScrollHeight,
                  heightDiff,
                  heightDiffPercent: heightDiffPercent.toFixed(1) + '%',
                  adjustedScroll: targetScroll,
                  ratio: ratio.toFixed(4),
                  reason: containerMismatch ? 'container mismatch' : 'significant height change',
                });
              }
            } else if (skipMobileAdjust) {
              if (DEBUG_RESTORE) console.log('[restore] Mobile + container mismatch - using saved position directly (adjustment skipped)');
            } else if (shouldAdjust && (!significantChange || !isFarFromTop)) {
              if (DEBUG_RESTORE) console.log('[restore] Using saved position directly (small change:', heightDiffPercent.toFixed(1), '% or near top:', savedScrollValue, 'px)');
            } else if (containerMismatch && !shouldAdjust) {
              if (DEBUG_RESTORE) console.log('[restore] Container type mismatch but no saved height - using saved position directly');
            } else if (DEBUG_RESTORE) {
              console.log('[restore] Using saved position directly (no adjustment needed)');
            }
            
            // Apply scroll position immediately
            if (scroller === window) {
              window.scrollTo({ top: targetScroll, behavior: 'auto' });
              if (DEBUG_RESTORE) console.log('[restore] Set window.scrollY to', targetScroll, '(original:', savedScrollValue, ')');
            } else {
              scroller.scrollTop = targetScroll;
              if (DEBUG_RESTORE) console.log('[restore] Set scroller.scrollTop to', targetScroll, '(original:', savedScrollValue, ', isMobile:', isMobile, ')');
            }
            
            // Reduced wait time for faster restore - layout should be mostly stable by now
            const waitTime = isMobile ? 200 : 150;
            
            // After initial scroll, wait for layout to settle, then verify (single check, no multiple adjustments)
            setTimeout(() => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  const actualScroll = scroller === window ? window.scrollY : scroller.scrollTop;
                  const diff = Math.abs(actualScroll - targetScroll);
                  if (DEBUG_RESTORE) console.log('[restore] Verify scroll:', { expected: targetScroll, actual: actualScroll, diff, isMobile });
                  
                  // For mobile, be very conservative - only adjust if extremely off and it's a significant position
                  // The "scrolls down a few lines" issue suggests the initial restore is slightly off
                  const threshold = isMobile ? 300 : 100; // Much higher threshold on mobile
                  
                  if (diff > threshold && savedScrollValue > 1000) {
                    // Only refine if way off and position is far enough from top that adjustment makes sense
                    if (DEBUG_RESTORE) console.log('[restore] Large offset detected (', diff, 'px), attempting single refinement');
                    
                    // Use the saved position directly (avoid recalculation which can cause more issues)
                    const refinedTarget = savedScrollValue;
                    
                    // Apply refined position once
                    if (scroller === window) {
                      window.scrollTo({ top: refinedTarget, behavior: 'auto' });
                    } else {
                      scroller.scrollTop = refinedTarget;
                    }
                    
                    if (DEBUG_RESTORE) console.log('[restore] Applied refinement to saved position:', refinedTarget);
                    
                    // Mark complete quickly after refinement
                    restoreCompletedRef.current = true;
                    setTimeout(() => {
                      restoreAttemptedRef.current = false;
                      if (DEBUG_RESTORE) console.log('[restore] Restore complete, saving enabled');
                    }, 50);
                  } else {
                    if (DEBUG_RESTORE) console.log('[restore] Position acceptable (diff:', diff, 'px, threshold:', threshold, ')');
                    
                    // Mark restore as completed and enable saving immediately
                    restoreCompletedRef.current = true;
                    restoreAttemptedRef.current = false;
                    if (DEBUG_RESTORE) console.log('[restore] Restore complete, saving enabled');
                  }
                });
              });
            }, waitTime);
          });
        });
      };
      
      // Wait for initial render to complete before attempting restore
      // Defer significantly to avoid blocking initial render and causing forced reflows
      // Skip restore during React StrictMode double-render to avoid violations
      let skippedFirstRender = false;
      const scheduleRestore = () => {
        if (!skippedFirstRender) {
          skippedFirstRender = true;
          // Skip first attempt to avoid React StrictMode double-render issues
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                restorePosition();
              }, 150);
            });
          });
        }
      };
      // Wait longer to let React finish all initial renders
      setTimeout(() => {
        scheduleRestore();
      }, 500);
    } catch {}
  }, [sectionsWithOffsets, metadata]);

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
    if (!String(selectionContext.text || '').trim()) return;
    // Optionally suppress one auto call when explicitly toggling UI elements
    if (suppressAutoExplainRef.current) {
      suppressAutoExplainRef.current = false;
      return;
    }
    // Avoid duplicate calls if we already have an explanation for this selection
    const len = new TextEncoder().encode(selectionContext.text || '').length;
    const id = `${selectionContext.byteOffset}-${len}`;
    if (conversations && conversations[id] && conversations[id].last) return;
    // Use preferred length from options; default to brief
    const pref = (llmOptions?.length === 'medium' ? 'more' : (llmOptions?.length === 'large' ? 'more' : 'brief'));
    callLLM({ mode: pref, length: llmOptions?.length || 'brief' });
  }, [selectionContext]);

  // Deep-linking disabled: do not update URL on selection (prevents auto-explanations on reload)

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
      if (nt != null && nt !== '') {
        const v = parseInt(nt, 10);
        if (Number.isFinite(v) && v >= 0 && v <= 100) {
          setNoteThreshold(v);
        }
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
    if (!optsHydrated) return; // Don't save until we've loaded from localStorage
    if (typeof noteThreshold === 'number') {
      try { localStorage.setItem('noteThreshold', String(noteThreshold)); } catch {}
    }
  }, [optsHydrated, noteThreshold]);
  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const handler = (e) => {
      const detail = e?.detail || {};
      let candidate = null;
      if (typeof detail.threshold === 'number') candidate = detail.threshold;
      else if (typeof detail.value === 'number') candidate = detail.value;
      else if (typeof detail.density === 'number') candidate = densityToThreshold(detail.density);
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        setNoteThreshold((prev) => {
          const next = clamp(candidate, 0, 100);
          return prev === next ? prev : next;
        });
      }
    };
    window.addEventListener('note-threshold-set', handler);
    return () => window.removeEventListener('note-threshold-set', handler);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('note-threshold-updated', { detail: { threshold: noteThreshold, density: thresholdToDensity(noteThreshold) } }));
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
          // Show all notes when threshold is 0; otherwise include notes with score >= threshold
          const itemsFilteredSec = itemsAllSec.filter((it) => {
            const score = normalizedPerplexity(it);
            if (typeof noteThreshold !== 'number') return true;
            if (noteThreshold <= 0) return true;
            return score >= noteThreshold;
          });
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
            noteInSelectMode={noteInSelectMode}
            onToggleNoteSelectMode={(speechKey) => {
              setNoteInSelectMode(prev => prev === speechKey ? null : speechKey);
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

        {/* TOC Popup (mobile only, triggered from header button) */}
        {tocOpen && (
          <div className="tocPopupOverlay" onClick={() => setTocOpen(false)}>
            <div className="tocPopupPanel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Contents">
              <div className="tocPopupHeader">
                <span style={{ fontWeight: 600, fontSize: '1.1em' }}>Contents</span>
                <button type="button" className="closeBtn" onClick={() => setTocOpen(false)} aria-label="Close contents">✕</button>
              </div>
              <div className="toc" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {toc.map((group) => (
                  <div key={`p-act-${group.act}`}>
                    {group.act === 'Prologue' ? (
                      <ul>
                        {(() => {
                          const sc = group.scenes[0];
                          const key = `${sc.act}-${sc.scene}`;
                          const isActive = activeScene === key;
                          return (
                            <li key={`p-scene-${key}`} className={isActive ? 'active' : ''}>
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
                            <li key={`p-scene-${key}`} className={isActive ? 'active' : ''}>
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
            </div>
          </div>
        )}
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
            </div>
            <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => {
                  try {
                    const ok = typeof window === 'undefined' ? true : window.confirm('Remove all saved explanations? This cannot be undone.');
                    if (!ok) return;
                  } catch {}
                  setConversations({});
                  try { localStorage.setItem('explanations', JSON.stringify({})); } catch {}
                  // Also hide all notes: clear forced list and set density to None
                  try { setForcedNotes?.([]); } catch {}
                  try { localStorage.setItem('forcedNotes', JSON.stringify([])); } catch {}
                  try {
                    setNoteThreshold(100);
                    localStorage.setItem('noteThreshold', String(100));
                  } catch {}
                }}
                style={{ marginRight: 8 }}
                title="Remove all saved explanations"
              >
                Remove All Explanations
              </button>
              <button type="button" onClick={() => setShowSettings(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ text, query, matchRefs, sectionRef, selectedRange, onSelectRange, contextInfo, llm, savedExplanations = [], onCopyLink, selectedId, pendingFocus, onPendingFocusConsumed, precomputedItems = [], precomputedAllItems = [], speeches = [], noteBySpeechKey = new Map(), sectionIndex = 0, sectionStartOffset = 0, onDeleteSaved, suppressNextAutoExplain, metadata, noteThreshold = 0, forcedNotes = [], onToggleForced, onRequestFocus, noteInSelectMode = null, onToggleNoteSelectMode }) {
  const preRef = useRef(null);
  const asideRef = useRef(null);
  const selPendingRef = useRef(false);
  const longPressRef = useRef(false);
  const movedRef = useRef(false);
  const pressTimerRef = useRef(null);
  const revealTimerRef = useRef(null);
  const revealedDuringPressRef = useRef(false);
  const startXYRef = useRef({ x: 0, y: 0 });
  const selDebounceRef = useRef(null);
  const touchActiveRef = useRef(false);
  const scrollerStartRef = useRef(0);
  // Mobile selection mode state/refs - now driven by noteInSelectMode
  const isTouchDevice = noteInSelectMode ? true : (() => {
    try { return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0; } catch { return false; }
  })();
  // Only enable mobile select mode if this section contains the note that's in select mode
  const sectionHasSelectModeNote = noteInSelectMode && speeches.some(sp => {
    const spKey = `${sp.act}|${sp.scene}|${sp.speechIndex}`;
    return spKey === noteInSelectMode;
  });
  const mobileSelectMode = !!sectionHasSelectModeNote;
  const mobileStartCharRef = useRef(null);
  const mobileStartPointRef = useRef({ x: 0, y: 0 });
  const [autoIdx, setAutoIdx] = useState(0);
  const [showPreFollow, setShowPreFollow] = useState(false);
  const [preFollowInput, setPreFollowInput] = useState('');
  const [preFollowLoading, setPreFollowLoading] = useState(false);
  const skipNextMouseUpRef = useRef(false);
  // Mini chat history per speech (keyed by startOffset)
  const [preFollowThreads, setPreFollowThreads] = useState({}); // key -> [{ q, a, model, provider }]
  const [forceShow, setForceShow] = useState(false);
  // Track suppressed notes (by speech key) that should be hidden even if they meet threshold
  const [suppressedNotes, setSuppressedNotes] = useState(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawThreads = window.localStorage.getItem('noteThreads');
      if (rawThreads) {
        const parsed = JSON.parse(rawThreads);
        if (parsed && typeof parsed === 'object') setPreFollowThreads(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('noteThreads', JSON.stringify(preFollowThreads)); } catch {}
  }, [preFollowThreads]);


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
  // Helper to get speech key for an item (items are notes themselves)
  const getSpeechKeyForItem = (item) => {
    if (!item || !speeches || !speeches.length) return null;
    // Items are the notes themselves, so find which speech key maps to this exact item
    for (const sp of speeches) {
      const spKey = `${sp.act}|${sp.scene}|${sp.speechIndex}`;
      const note = noteBySpeechKey.get(spKey);
      // Check if this note matches the item (compare by startOffset as identifier)
      if (note && note.startOffset === (item.startOffset || 0)) {
        return spKey;
      }
    }
    return null;
  };
  // Filter out suppressed notes from the visible lists
  const visiblePreItemsFiltered = visiblePreItems.filter((it) => {
    const sk = getSpeechKeyForItem(it);
    return !sk || !suppressedNotes.has(sk);
  });
  const visibleAllItemsFiltered = visibleAllItems.filter((it) => {
    const sk = getSpeechKeyForItem(it);
    return !sk || !suppressedNotes.has(sk);
  });
  function pickVisibleItem(list, startIdx) {
    if (!list || !list.length) return null;
    const n = list.length;
    const s = Math.max(0, Math.min(startIdx || 0, n - 1));
    for (let i = s; i < n; i++) if (list[i]) return list[i];
    for (let i = s - 1; i >= 0; i--) if (list[i]) return list[i];
    return null;
  }
  const currentVisible = pickVisibleItem(visiblePreItemsFiltered, autoIdx);
  const currentForceVisible = pickVisibleItem(visibleAllItemsFiltered, autoIdx);
  const forcedSet = new Set((Array.isArray(forcedNotes)?forcedNotes:[]).map(String));
  const currentSpeech = (speeches && speeches.length) ? speeches[Math.min(autoIdx, speeches.length - 1)] : null;
  const speechKey = currentSpeech ? `${currentSpeech.act}|${currentSpeech.scene}|${currentSpeech.speechIndex}` : null;
  // If any forced speech exists in this section, prefer it immediately (even before IO sets autoIdx)
  const sectionForcedSpeech = (speeches || []).find((sp) => forcedSet.has(`${sp.act}|${sp.scene}|${sp.speechIndex}`));
  const forcedKey = sectionForcedSpeech ? `${sectionForcedSpeech.act}|${sectionForcedSpeech.scene}|${sectionForcedSpeech.speechIndex}` : null;
  // Check if current note is suppressed (hidden even if it meets threshold)
  const isSuppressed = speechKey && suppressedNotes.has(speechKey);
  const chosenItem = (forcedKey ? noteBySpeechKey.get(forcedKey) : (isSuppressed ? null : (currentVisible || (forceShow ? currentForceVisible : null))));
  // Show the aside only when there is actual content to show
  // Check if there's a chosenItem, savedExplanations, or a valid LLM conversation for selectedRange
  // Also show if there's a selection (even without conversation yet) or if LLM is loading
  const hasLLMContent = selectedRange && (llm?.conversation?.last || llm?.loading);
  const hasSelection = !!selectedRange;
  // Show aside when note is in select mode (even without selection yet) or when there's actual content
  const hasSelectModeActive = !!sectionHasSelectModeNote;
  const hasAside = !!chosenItem
    || (savedExplanations && savedExplanations.length > 0)
    || hasLLMContent
    || hasSelection
    || hasSelectModeActive;
  // Indicate clickability in the text area when a suppressed note exists for the current speech
  const canForceReveal = !selectedRange
    && (!savedExplanations || savedExplanations.length === 0)
    && !currentVisible
    && !!currentForceVisible;

  // Keep forceShow in sync with persisted preference for current speech
  useEffect(() => {
    const it = currentVisible || currentForceVisible;
    const sk = it ? getSpeechKeyForItem(it) : null;
    if (!sk) { setForceShow(false); return; }
    const isForced = Array.isArray(forcedNotes) && forcedNotes.map(String).includes(String(sk));
    setForceShow(isForced);
  }, [autoIdx, currentVisible, currentForceVisible, forcedNotes]);

  const revealNoteForCurrentSpeech = () => {
    const sk = speechKey;
    if (!sk) return;
    // If note is suppressed, remove from suppressed list first
    if (suppressedNotes.has(sk)) {
      setSuppressedNotes((prev) => {
        const next = new Set(prev);
        next.delete(sk);
        return next;
      });
    }
    // Then toggle forced state if handler exists
    if (onToggleForced) onToggleForced(sk, sectionIndex);
  };

  const scrollAsideIntoView = () => {
    try {
      const el = asideRef?.current;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      try { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); } catch {}
    } catch {}
  };

  // Handle selection or reveal note on mouse up
  const handleTextMouseUp = (e) => {
    try { if (DEBUG_SELECTION) console.log('mouseUp:text', { sectionIndex }); } catch {}
    // On touch devices, ignore mouseup completely (handled by touch handlers)
    try {
      const isTouch = (() => {
        if (typeof window === 'undefined') return false;
        if (typeof navigator === 'undefined') return false;
        // Treat as desktop-only when there is exactly 0 touch capability and no touchstart handler present
        if (navigator.maxTouchPoints === 0) return false;
        // If there is at least one touch point, treat as touch-enabled and let touch handlers handle selection
        return navigator.maxTouchPoints > 0;
      })();
      if (isTouch) return;
    } catch {}
    if (skipNextMouseUpRef.current) { skipNextMouseUpRef.current = false; return; }
    // If the note is not visible yet and a note exists for this speech, a click brings it up
    const noteVisible = !!chosenItem;
    const hasRevealableNote = !!(speechKey && noteBySpeechKey && noteBySpeechKey.get && noteBySpeechKey.get(speechKey));
    if (!noteVisible && hasRevealableNote) {
      // Reveal-only click: just show the note; do not trigger selection or LLM query
      revealNoteForCurrentSpeech();
      // Clear any selection to prevent triggering LLM query
      if (typeof window !== 'undefined' && window.getSelection) {
        try {
          const sel = window.getSelection();
          if (sel) sel.removeAllRanges();
        } catch {}
      }
      // Suppress auto-explain for this reveal click
      if (suppressNextAutoExplain) suppressNextAutoExplain.current = true;
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

  // Simplified mobile interaction: single tap toggles the note for current speech
  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    const tx = t ? t.clientX : 0;
    const ty = t ? t.clientY : 0;
    // Always record starting point
    startXYRef.current = { x: tx, y: ty };
    movedRef.current = false;
    touchActiveRef.current = true;
    mobileStartPointRef.current = { x: tx, y: ty };
    // If mobile selection mode is active, capture starting caret and prevent scroll
    if (mobileSelectMode) {
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try {
        const container = preRef.current;
        const caretFromPoint = (cx2, cy2) => {
          if (document.caretRangeFromPoint) return document.caretRangeFromPoint(cx2, cy2);
          const pos = document.caretPositionFromPoint?.(cx2, cy2);
          if (pos) { const r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); r.collapse(true); return r; }
          return null;
        };
        const r = caretFromPoint(tx, ty);
        if (container && r) {
          const r0 = document.createRange(); r0.selectNodeContents(container);
          const before = r0.cloneRange(); before.setEnd(r.startContainer, r.startOffset);
          mobileStartCharRef.current = before.toString().length;
        } else {
          mobileStartCharRef.current = null;
        }
      } catch { mobileStartCharRef.current = null; }
      return;
    }
    try {
      const s = (function(){
        const cont = document.querySelector('.container');
        if (cont && cont.scrollHeight > cont.clientHeight + 1) return cont;
        const pg = document.querySelector('.page');
        if (pg && pg.scrollHeight > pg.clientHeight + 1) return pg;
        return window;
      })();
      scrollerStartRef.current = (s === window) ? window.scrollY : s.scrollTop;
    } catch { scrollerStartRef.current = 0; }
  };
  const onTouchMove = (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = Math.abs((t.clientX || 0) - startXYRef.current.x);
    const dy = Math.abs((t.clientY || 0) - startXYRef.current.y);
    if (dx + dy > 6) movedRef.current = true;
    if (mobileSelectMode) {
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      // Update selection in real-time during drag for visual feedback
      try {
        const container = preRef.current;
        const cx = t.clientX || mobileStartPointRef.current.x || 0;
        const cy = t.clientY || mobileStartPointRef.current.y || 0;
        const caretFromPoint = (cx2, cy2) => {
          if (document.caretRangeFromPoint) return document.caretRangeFromPoint(cx2, cy2);
          const pos = document.caretPositionFromPoint?.(cx2, cy2);
          if (pos) { const r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); r.collapse(true); return r; }
          return null;
        };
        let endChar = null;
        const r = caretFromPoint(cx, cy);
        if (container && r) {
          const r0 = document.createRange(); r0.selectNodeContents(container);
          const before = r0.cloneRange(); before.setEnd(r.startContainer, r.startOffset);
          endChar = before.toString().length;
        }
        const startChar = mobileStartCharRef.current;
        if (Number.isFinite(startChar) && Number.isFinite(endChar) && movedRef.current) {
          const start = Math.max(0, Math.min(startChar, endChar));
          const end = Math.max(start, Math.max(startChar, endChar));
          if (end > start) {
            onSelectRange?.({ start, end });
          }
        }
      } catch {}
    }
  };
  const onTouchEnd = (e) => {
    // Prevent synthetic click delays and bubbling to desktop handlers
    try { e.preventDefault(); e.stopPropagation(); } catch {}
    // Handle selection mode on mobile: tap selects sentence, drag selects range
    if (mobileSelectMode) {
      try {
        const container = preRef.current;
        const touch = e.changedTouches && e.changedTouches[0];
        const cx = touch?.clientX || mobileStartPointRef.current.x || 0;
        const cy = touch?.clientY || mobileStartPointRef.current.y || 0;
        const caretFromPoint = (cx2, cy2) => {
          if (document.caretRangeFromPoint) return document.caretRangeFromPoint(cx2, cy2);
          const pos = document.caretPositionFromPoint?.(cx2, cy2);
          if (pos) { const r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); r.collapse(true); return r; }
          return null;
        };
        let endChar = null;
        const r = caretFromPoint(cx, cy);
        if (container && r) {
          const r0 = document.createRange(); r0.selectNodeContents(container);
          const before = r0.cloneRange(); before.setEnd(r.startContainer, r.startOffset);
          endChar = before.toString().length;
        }
        const startChar = mobileStartCharRef.current;
        let start = null, end = null;
        if (Number.isFinite(startChar) && Number.isFinite(endChar) && movedRef.current) {
          start = Math.max(0, Math.min(startChar, endChar));
          end = Math.max(start, Math.max(startChar, endChar));
        } else {
          const idx = Number.isFinite(endChar) ? endChar : (Number.isFinite(startChar) ? startChar : null);
          if (idx != null) {
            const sent = expandToSentence(text || '', idx);
            if (sent) { start = sent.start; end = sent.end; }
          }
        }
        if (start != null && end != null && end > start) {
          onSelectRange?.({ start, end });
          // Exit text selection mode when selection is made
          if (onToggleNoteSelectMode && noteInSelectMode) {
            onToggleNoteSelectMode(noteInSelectMode);
          }
          scrollAsideIntoView();
        }
      } catch {}
      skipNextMouseUpRef.current = true;
      touchActiveRef.current = false;
      setTimeout(() => { movedRef.current = false; }, 80);
      return;
    }
    // If the user scrolled, do nothing and swallow the synthetic mouseup
    try {
      const s = (function(){
        const cont = document.querySelector('.container');
        if (cont && cont.scrollHeight > cont.clientHeight + 1) return cont;
        const pg = document.querySelector('.page');
        if (pg && pg.scrollHeight > pg.clientHeight + 1) return pg;
        return window;
      })();
      const now = (s === window) ? window.scrollY : s.scrollTop;
      // Treat small rubber-band or inertia movement as a tap; only swallow for larger moves
      if (Math.abs(now - (scrollerStartRef.current || 0)) > 30 || movedRef.current) {
        skipNextMouseUpRef.current = true;
        touchActiveRef.current = false;
        setTimeout(() => { movedRef.current = false; }, 80);
        return;
      }
    } catch {}
    // Single tap: toggle note visibility (reveal/hide)
    let keyToToggle = speechKey;
    let hasNote = !!(keyToToggle && noteBySpeechKey && noteBySpeechKey.get && noteBySpeechKey.get(keyToToggle));
    // Fallback 1: if current autoIdx didn't resolve, pick the nearest speech by tap Y using hidden anchors
    if (!hasNote) {
      try {
        const anchors = sectionRef?.current?.querySelectorAll?.(':scope .speechAnchor') || [];
        if (anchors.length) {
          let best = { idx: 0, d: Infinity };
          const y = (e.changedTouches && e.changedTouches[0]?.clientY) || startXYRef.current?.y || 0;
          anchors.forEach((el) => {
            const r = el.getBoundingClientRect();
            const d = Math.abs((r.top || 0) - y);
            const i = parseInt(el.getAttribute('data-idx') || '0', 10) || 0;
            if (d < best.d) best = { idx: i, d };
          });
          const sp = (speeches || [])[Math.min(best.idx, Math.max(0, (speeches || []).length - 1))];
          if (sp) {
            keyToToggle = `${sp.act}|${sp.scene}|${sp.speechIndex}`;
            hasNote = !!(noteBySpeechKey && noteBySpeechKey.get && noteBySpeechKey.get(keyToToggle));
          }
        }
      } catch {}
    }
    // Fallback 2: use caret position under the finger to map to the exact speech
    if (!hasNote) {
      try {
        const container = preRef.current;
        const touch = e.changedTouches && e.changedTouches[0];
        const cx = touch?.clientX || 0;
        const cy = touch?.clientY || 0;
        const caretFromPoint = (cx2, cy2) => {
          if (document.caretRangeFromPoint) return document.caretRangeFromPoint(cx2, cy2);
          const pos = document.caretPositionFromPoint?.(cx2, cy2);
          if (pos) { const r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); r.collapse(true); return r; }
          return null;
        };
        const r = caretFromPoint(cx, cy);
        if (container && r) {
          const r0 = document.createRange(); r0.selectNodeContents(container);
          const before = r0.cloneRange(); before.setEnd(r.startContainer, r.startOffset);
          const idxChar = before.toString().length;
          // Convert character index to byte offset within full doc
          const startRelB = new TextEncoder().encode((text || '').slice(0, idxChar)).length;
          const absOffset = (sectionStartOffset || 0) + startRelB;
          // Find speech containing this absolute offset
          let speech = null;
          for (const sp of (speeches || [])) {
            const it = speechMaps?.noteBySpeechKey?.get?.(`${sp.act}|${sp.scene}|${sp.speechIndex}`);
            if (!it) continue;
            if ((absOffset >= (it.startOffset || 0)) && (absOffset <= (it.endOffset || (it.startOffset || 0)))) { speech = sp; break; }
          }
          if (speech) {
            keyToToggle = `${speech.act}|${speech.scene}|${speech.speechIndex}`;
            hasNote = !!(noteBySpeechKey && noteBySpeechKey.get && noteBySpeechKey.get(keyToToggle));
          }
        }
      } catch {}
    }
    if (hasNote && keyToToggle) {
      // If note is suppressed, remove from suppressed list first
      if (suppressedNotes.has(keyToToggle)) {
        setSuppressedNotes((prev) => {
          const next = new Set(prev);
          next.delete(keyToToggle);
          return next;
        });
      }
      // Optimistic local toggle for instant UI response
      setForceShow((prev) => !prev);
      if (onToggleForced) onToggleForced(keyToToggle, sectionIndex);
      // Immediately bring the aside into view; no delay
      scrollAsideIntoView();
    }
    // Swallow the synthetic mouseup to avoid desktop selection logic
    skipNextMouseUpRef.current = true;
    touchActiveRef.current = false;
    setTimeout(() => { movedRef.current = false; }, 80);
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

  // Memoize rendered text to avoid recalculating on unnecessary re-renders
  const renderedText = useMemo(() => {
    return renderWithSelectionAndHighlights(text, query, selectedRange, matchRefs, selectedId);
  }, [text, query, selectedRange?.start, selectedRange?.end, selectedId, matchRefs]);

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
        <pre
          ref={preRef}
          onMouseUp={handleTextMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ 
            cursor: (isTouchDevice && mobileSelectMode) ? 'text' : 'pointer',
            // Subtle visual indicator for text selection mode on the text area
            // Only show if this section contains the note that's in select mode
            border: mobileSelectMode ? '1px solid #c9c0b8' : 'none',
            borderRadius: mobileSelectMode ? '2px' : '0',
            backgroundColor: mobileSelectMode ? '#faf9f7' : 'transparent',
            transition: 'all 0.2s ease'
          }}
        >
          {renderedText}
        </pre>
      </div>
      {hasAside ? (
        <aside
          className="explanations"
          aria-label="Explanations"
          ref={asideRef}
          onClick={(e) => {
            // If clicking on empty aside area and note is hidden but available, reveal it
            // Check if click is directly on the aside element or on empty space (not on a child element with content)
            const clickedEmptySpace = !chosenItem && canForceReveal && (
              e.target === asideRef.current || 
              (e.target === asideRef.current?.firstChild && !asideRef.current.firstChild?.textContent?.trim())
            );
            if (clickedEmptySpace) {
              e.stopPropagation();
              revealNoteForCurrentSpeech();
              scrollAsideIntoView();
              return;
            }
            // Also check if clicking on the aside itself when it's empty (no saved explanations, no chosen item)
            if (!chosenItem && !savedExplanations?.length && canForceReveal && asideRef.current?.contains(e.target)) {
              const hasVisibleContent = Array.from(asideRef.current?.children || []).some(
                child => child.textContent?.trim() && !child.classList?.contains('placeholder')
              );
              if (!hasVisibleContent) {
                e.stopPropagation();
                revealNoteForCurrentSpeech();
                scrollAsideIntoView();
                return;
              }
            }
          }}
          style={{ cursor: canForceReveal && !chosenItem ? 'pointer' : 'default' }}
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
                  // First, try to remove from forced list using forcedKey (most reliable)
                  if (forcedKey && onToggleForced) {
                    onToggleForced(forcedKey, sectionIndex);
                    return;
                  }
                  // If forcedKey isn't set but speechKey exists, check if it's in forced list
                  if (speechKey && onToggleForced) {
                    const isForced = Array.isArray(forcedNotes) && forcedNotes.indexOf(speechKey) >= 0;
                    if (isForced) {
                      onToggleForced(speechKey, sectionIndex);
                      return;
                    }
                  }
                  // If not in forced list but note is showing due to threshold, suppress it
                  // by adding it to suppressedNotes state (local to this component)
                  if (speechKey && chosenItem && !forcedKey) {
                    setSuppressedNotes((prev) => {
                      const next = new Set(prev);
                      next.add(speechKey);
                      return next;
                    });
                    // Also hide locally visible notes
                    setForceShow(false);
                    return;
                  }
                  // Fallback: hide locally visible notes
                  if (forceShow) {
                    setForceShow(false);
                  }
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
                      arr.push({ q, a, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
                      return { ...prev, [key]: arr };
                    });
                    setPreFollowInput('');
                  } catch (e) {
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q, a: `Error: ${String(e.message || e)}`, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
                      return { ...prev, [key]: arr };
                    });
                  } finally {
                    setPreFollowLoading(false);
                  }
                };
                const requestLonger = async () => {
                  const key = String(it.startOffset || 0);
                  const existing = (it.content || '').trim();
                  const q = existing
                    ? `Provide additional insight that builds on the existing explanation below without repeating or paraphrasing it. Focus on new details, clarifying tricky references, or subtle dramatic function.
Existing explanation:
"""${existing}"""`
                    : 'Please expand this into a longer explanation with more detail while avoiding repetition.';
                  try {
                    setPreFollowLoading(true);
                    const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
                    const endRelB = Math.max(startRelB + 1, (it.endOffset || (it.startOffset || 0) + 1) - sectionStartOffset);
                    const startC = bytesToCharOffset(text || '', startRelB);
                    const endC = bytesToCharOffset(text || '', endRelB);
                    const passage = (text || '').slice(startC, endC);
                    const ctx = getContextForOffset(metadata || {}, it.startOffset || 0);
                    const res = await fetch('/api/explain', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ selectionText: passage, context: { act: ctx.act, scene: ctx.scene, speaker: ctx.speaker, onStage: ctx.onStage }, options: llm?.options, messages: [], mode: 'followup', followup: q })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.detail || data?.error || 'LLM error');
                    const addition = (data?.content || '').trim();
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q: 'More detail', a: addition, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
                      return { ...prev, [key]: arr };
                    });
                  } catch (e) {
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q: 'More detail', a: `Error: ${String(e.message || e)}`, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
                      return { ...prev, [key]: arr };
                    });
                  } finally {
                    setPreFollowLoading(false);
                  }
                };
                // Get the speech key for this specific note item
                const itemSpeechKey = getSpeechKeyForItem(it);
                return (
                  <div key={`pc-${autoIdx}-${it.startOffset || autoIdx}`} style={{ paddingRight: '32px', paddingTop: '6px', borderBottom: '1px solid #eee', position: 'relative' }}>
                    <button type="button" className="closeBtn" onClick={handleCloseNote} aria-label="Close note" style={{ position: 'absolute', right: 0, top: 0 }}>✕</button>
                    <div 
                      className="noteContent" 
                      style={{ 
                        whiteSpace: 'pre-wrap', 
                        cursor: 'pointer', 
                        userSelect: 'text'
                      }} 
                      onClick={(e)=>{ 
                        e.stopPropagation(); 
                        e.preventDefault();
                        // Toggle text selection mode for this note
                        if (onToggleNoteSelectMode && itemSpeechKey) {
                          onToggleNoteSelectMode(itemSpeechKey);
                          // Don't clear selection - let user select text which will show chat UI
                        } else {
                          toggleFollow(); 
                        }
                      }} 
                      title={(noteInSelectMode === itemSpeechKey) ? "Click to exit text selection mode" : "Click to enable text selection mode"}>
                      {it.content || ''}
                    </div>
                    <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 4 }}>
                      {(() => {
                        if (it.provider || it.model) {
                          const provider = it.provider || '';
                          const model = it.model || '';
                          const providerName = formatProviderName(provider);
                          if (provider && model) {
                            if (model.toLowerCase().includes(provider.toLowerCase())) {
                              return providerName || model;
                            }
                            return providerName ? `${model} (via ${providerName})` : model;
                          }
                          if (model) return `Model: ${model}`;
                          if (providerName) return providerName;
                        }

                        if (llm?.options?.model) return `Model: ${llm.options.model}`;
                        return '';
                      })()}
                    </div>
                    {showPreFollow && (
                      <>
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="text" placeholder="Ask a follow‑up…" value={preFollowInput} onChange={(e)=>{ e.stopPropagation(); setPreFollowInput(e.target.value); }} onKeyDown={(e)=>{ if (e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); submitFollow(); } }} style={{ flex:1, minWidth:0 }} />
                          <button type="button" disabled={preFollowLoading || !preFollowInput.trim()} onClick={(e)=>{ e.stopPropagation(); submitFollow(); }}>Ask</button>
                          <button
                            type="button"
                            disabled={preFollowLoading}
                            onClick={(e) => { e.stopPropagation(); requestLonger(); }}
                            title="Get a longer response"
                          >
                            More
                          </button>
                        </div>
                      </>
                    )}
                    {preFollowLoading && <div style={{ marginTop: '0.5rem', color:'#6b5f53' }}>Thinking…</div>}
                    {(() => {
                      const thread = preFollowThreads[String(it.startOffset || 0)] || [];
                      if (!thread.length) return null;
                      return (
                        <div style={{ marginTop: '0.5rem' }}>
                          {thread.map((m, idx) => {
                            const providerName = formatProviderName(m?.provider || '');
                            let attribution = '';
                            if (m?.model && providerName) attribution = `${m.model} (via ${providerName})`;
                            else if (m?.model) attribution = `Model: ${m.model}`;
                            else if (providerName) attribution = providerName;
                            if (!attribution && (llm?.options?.model || llm?.options?.provider)) {
                              const fallbackProvider = formatProviderName(llm?.options?.provider || '');
                              const fallbackModel = llm?.options?.model || '';
                              if (fallbackModel && fallbackProvider && fallbackModel.toLowerCase().includes((llm?.options?.provider || '').toLowerCase())) attribution = fallbackModel;
                              else if (fallbackModel && fallbackProvider) attribution = `${fallbackModel} (via ${fallbackProvider})`;
                              else if (fallbackModel) attribution = `Model: ${fallbackModel}`;
                              else if (fallbackProvider) attribution = fallbackProvider;
                            }
                            return (
                              <div key={`fu-${idx}`} style={{ marginBottom: '0.5rem' }}>
                                <div style={{ whiteSpace:'pre-wrap' }}>{m.a}</div>
                                {attribution ? (
                                  <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 2 }}>{attribution}</div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          ) : null}
          {/* Simple chat UI for text selection mode (search box + More button) - show when note is clicked to enter select mode or when text is selected - appears below note */}
          {/* Show chat UI when note is in select mode (even without text selection yet) OR when text is selected but no explanation exists yet */}
          {/* Don't show here if there's already an explanation (it will be shown in the explanation block below) */}
          {((sectionHasSelectModeNote && !(selectedRange && contextInfo && llm?.conversation?.last)) || (selectedRange && contextInfo && !llm?.conversation?.last)) ? (
            <div style={{ marginTop: chosenItem ? '0.5rem' : '0.25rem', paddingTop: chosenItem ? '0.25rem' : '0', borderTop: chosenItem ? '1px solid #eee' : 'none' }}>
              {llm?.loading && (
                <div style={{ marginBottom: '0.5rem', color: '#6b5f53' }}>Thinking…</div>
              )}
              <TextSelectionChat 
                contextInfo={contextInfo}
                llm={llm}
                onRequestFocus={() => {
                  if (selectedRange && contextInfo && onRequestFocus) {
                    const len = new TextEncoder().encode(contextInfo.text || '').length;
                    const id = `${contextInfo.byteOffset}-${len}`;
                    onRequestFocus({ sectionIndex, id });
                  }
                }}
              />
            </div>
          ) : null}
          {/* Always show chat UI below notes (when not in select mode and no explanation exists), so users can ask follow-ups */}
          {chosenItem && !sectionHasSelectModeNote && !(selectedRange && contextInfo && llm?.conversation?.last) ? (
            <div style={{ marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid #eee' }}>
              {(() => {
                const it = chosenItem;
                if (!it) return null;
                const handleNoteMore = async () => {
                  try {
                    setPreFollowLoading(true);
                    const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
                    const endRelB = Math.max(startRelB + 1, (it.endOffset || (it.startOffset || 0) + 1) - sectionStartOffset);
                    const startC = bytesToCharOffset(text || '', startRelB);
                    const endC = bytesToCharOffset(text || '', endRelB);
                    const passage = (text || '').slice(startC, endC);
                    const ctx = getContextForOffset(metadata || {}, it.startOffset || 0);
                    const existing = (it.content || '').trim();
                    const q = existing
                      ? `Provide additional insight that builds on the existing explanation below without repeating or paraphrasing it. Focus on new details, clarifying tricky references, or subtle dramatic function.
Existing explanation:
"""${existing}"""`
                      : 'Please expand this into a longer explanation with more detail while avoiding repetition.';
                    const res = await fetch('/api/explain', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ selectionText: passage, context: { act: ctx.act, scene: ctx.scene, speaker: ctx.speaker, onStage: ctx.onStage }, options: llm?.options, messages: [], mode: 'followup', followup: q })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.detail || data?.error || 'LLM error');
                    const addition = (data?.content || '').trim();
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q: 'More detail', a: addition, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
                      return { ...prev, [key]: arr };
                    });
                  } catch (e) {
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q: 'More detail', a: `Error: ${String(e.message || e)}`, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
                      return { ...prev, [key]: arr };
                    });
                  } finally {
                    setPreFollowLoading(false);
                  }
                };
                const handleNoteFollowup = async (followupText) => {
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
                      body: JSON.stringify({ selectionText: passage, context: { act: ctx.act, scene: ctx.scene, speaker: ctx.speaker, onStage: ctx.onStage }, options: llm?.options, messages: [], mode: 'followup', followup: followupText })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.detail || data?.error || 'LLM error');
                    const a = data?.content || '';
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q: followupText, a, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
                      return { ...prev, [key]: arr };
                    });
                  } catch (e) {
                    const key = String(it.startOffset || 0);
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
                      arr.push({ q: followupText, a: `Error: ${String(e.message || e)}`, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
                      return { ...prev, [key]: arr };
                    });
                  } finally {
                    setPreFollowLoading(false);
                  }
                };
                return (
                  <TextSelectionChat 
                    contextInfo={null}
                    llm={{ ...llm, loading: preFollowLoading }}
                    onRequestFocus={() => {}}
                    noteMode={true}
                    onNoteMore={handleNoteMore}
                    onNoteFollowup={handleNoteFollowup}
                  />
                );
              })()}
            </div>
          ) : null}
          {/* Show explanation content when available */}
          {selectedRange && contextInfo && llm?.conversation?.last && (
            <div style={{ marginTop: chosenItem ? '0.5rem' : '0.25rem', paddingTop: chosenItem ? '0.25rem' : '0', paddingRight: '32px', borderTop: chosenItem ? '1px solid #eee' : 'none', position: 'relative' }}>
              <button 
                type="button" 
                className="closeBtn" 
                onClick={() => {
                  if (llm?.onDeleteCurrent) {
                    llm.onDeleteCurrent();
                  }
                }}
                aria-label="Close explanation" 
                style={{ position: 'absolute', right: 0, top: 0 }}
              >
                ✕
              </button>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Explanation</div>
              {/* Only show explanation content if it's not the placeholder "AI is thinking…" text */}
              {llm.conversation.last === 'AI is thinking…' ? (
                <div style={{ color: '#6b5f53' }}>Thinking…</div>
              ) : (
                <>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{llm.conversation.last}</div>
                  {(() => {
                    const providerName = formatProviderName(llm?.options?.provider || '');
                    let attribution = '';
                    if (llm?.options?.model && providerName) attribution = `${llm.options.model} (via ${providerName})`;
                    else if (llm?.options?.model) attribution = `Model: ${llm.options.model}`;
                    else if (providerName) attribution = providerName;
                    return attribution ? (
                      <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 4 }}>
                        {attribution}
                      </div>
                    ) : null;
                  })()}
                </>
              )}
              <TextSelectionChat 
                contextInfo={contextInfo}
                llm={llm}
                onRequestFocus={() => {
                  if (selectedRange && contextInfo && onRequestFocus) {
                    const len = new TextEncoder().encode(contextInfo.text || '').length;
                    const id = `${contextInfo.byteOffset}-${len}`;
                    onRequestFocus({ sectionIndex, id });
                  }
                }}
              />
            </div>
          )}
          {/* Placeholder removed; clicking the empty aside reveals the suppressed note */}
          {/* Filter out current selection's explanation from savedExplanations if it's already shown inline */}
          {(() => {
            const currentSelectionId = selectedRange && contextInfo ? (() => {
              const len = new TextEncoder().encode(contextInfo.text || '').length;
              return `${contextInfo.byteOffset}-${len}`;
            })() : null;
            const filteredSaved = savedExplanations.filter(ex => {
              if (!currentSelectionId || !ex?.meta) return true;
              const len = new TextEncoder().encode(ex.meta.text || '').length;
              const exId = `${ex.meta.byteOffset}-${len}`;
              return exId !== currentSelectionId;
            });
            return filteredSaved.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                {filteredSaved.map((ex, i) => (
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
            );
          })()}
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

function TextSelectionChat({ contextInfo, llm, onRequestFocus, noteMode = false, onNoteMore, onNoteFollowup }) {
  const { loading, onFollowup, conversation } = llm || {};
  const [q, setQ] = useState('');
  const submitFollowup = () => {
    const v = (q || '').trim();
    if (!v) return;
    if (noteMode && onNoteFollowup) {
      onNoteFollowup(v);
    } else {
      onFollowup?.(v);
    }
    setQ('');
  };
  const requestMore = () => {
    if (noteMode && onNoteMore) {
      onNoteMore();
    } else {
      onFollowup?.('Expand into a longer, more detailed explanation without repeating earlier sentences.');
    }
  };
  // Don't show "Thinking…" in chat UI if explanation is still loading (it's shown in explanation area)
  const showThinking = loading && conversation?.last && conversation.last !== 'AI is thinking…';
  // Show input field when there's contextInfo (text selected) OR when in noteMode
  // When just in select mode without selection, show hint
  const hasContext = !!contextInfo;
  const isInSelectMode = !hasContext && !noteMode; // Show hint only when in select mode but no text selected yet
  const showInput = hasContext || noteMode; // Show input for text selections OR notes
  return (
    <div style={{ marginTop: noteMode ? '0.25rem' : '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {showInput ? (
        <>
          <input 
            type="text" 
            placeholder="Ask a follow‑up…" 
            value={q} 
            onChange={(e)=>setQ(e.target.value)} 
            onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); submitFollowup(); } }} 
            style={{ flex:1, minWidth:0 }} 
          />
          <button type="button" disabled={loading || !q.trim()} onClick={submitFollowup}>Ask</button>
        </>
      ) : isInSelectMode ? (
        <div style={{ flex: 1, fontSize: '0.9em', color: '#6b5f53', fontStyle: 'italic' }}>
          Tap a sentence or drag to select text
        </div>
      ) : (
        <div style={{ flex: 1 }}></div>
      )}
      <button type="button" disabled={loading || (!hasContext && !noteMode)} onClick={requestMore}>More</button>
      {showThinking && <span style={{ color:'#6b5f53' }}>Thinking…</span>}
    </div>
  );
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
              <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 2 }}>{options?.model ? `Model: ${options.model}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
