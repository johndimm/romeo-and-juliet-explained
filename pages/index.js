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
  const suppressAutoExplainRef = useRef(false);

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
      // Attach to all sections the item overlaps so long speeches render wherever they appear
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
      const raw = localStorage.getItem('last-pos');
      if (!raw) return;
      const off = parseInt(raw, 10);
      if (!isNaN(off)) {
        let idx = 0;
        for (let i = 0; i < sectionsWithOffsets.length; i++) {
          if (sectionsWithOffsets[i].startOffset <= off) idx = i; else break;
        }
        setTimeout(() => scrollToSection(idx), 50);
      }
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

  // Auto-request a brief explanation when a new selection context is ready
  useEffect(() => {
    if (!selectionContext) return;
    if (suppressAutoExplainRef.current) { suppressAutoExplainRef.current = false; return; }
    const id = `${selectionContext.byteOffset}-${new TextEncoder().encode(selectionContext.text || '').length}`;
    const existing = conversations[id];
    if (!existing || !existing.last) {
      const t = setTimeout(() => { callLLM({ mode: 'brief' }); }, 50);
      return () => clearTimeout(t);
    }
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

  // Header search state sync (after allExplanations/currentExIdx are declared)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('search-state', {
        detail: {
          count: totalMatches,
          index: totalMatches ? currentIdx + 1 : 0,
          submitted: !!query,
          exCount: allExplanations.length,
          exIndex: currentExIdx >= 0 ? currentExIdx + 1 : 0,
        },
      }));
    }
  }, [totalMatches, currentIdx, query, allExplanations, currentExIdx]);

  // Bridge header search and explanation navigation buttons (after declarations)
  useEffect(() => {
    const onSubmit = (e) => setQuery((e.detail?.query || '').trim());
    const onPrev = () => handlePrev();
    const onNext = () => handleNext();
    const onExPrev = () => navigateExplanation('prev');
    const onExNext = () => navigateExplanation('next');
    if (typeof window !== 'undefined') {
      window.addEventListener('search-submit', onSubmit);
      window.addEventListener('search-prev', onPrev);
      window.addEventListener('search-next', onNext);
      window.addEventListener('ex-prev', onExPrev);
      window.addEventListener('ex-next', onExNext);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('search-submit', onSubmit);
        window.removeEventListener('search-prev', onPrev);
        window.removeEventListener('search-next', onNext);
        window.removeEventListener('ex-prev', onExPrev);
        window.removeEventListener('ex-next', onExNext);
      }
    };
  }, [totalMatches, currentIdx, allExplanations, currentExIdx]);

  function navigateExplanation(direction) {
    const n = allExplanations.length;
    if (!n) return;
    let idx = currentExIdx;
    if (idx < 0) idx = 0;
    idx = direction === 'prev' ? (idx - 1 + n) % n : (idx + 1) % n;
    const ex = allExplanations[idx];
    if (!ex || !ex.meta) return;
    const { sectionIndex, start, end, byteOffset, text } = ex.meta;
    setSelection({ sectionIndex, start, end });
    const len = new TextEncoder().encode(text || '').length;
    setHashForSelection(byteOffset, len);
    setTimeout(() => scrollToSection(sectionIndex), 10);
  }

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
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectionText: selectionContext.text,
          context: { act: selectionContext.act, scene: selectionContext.scene, speaker: selectionContext.speaker, onStage: selectionContext.onStage },
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
      // attach metadata so we can render persistent cards per section
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
      setConversations({ ...conversations, [selectionId]: { messages: newMsgs, last: data.content, meta } });
    } catch (e) {
      setConversations({ ...conversations, [selectionId]: { messages: [], last: `Error: ${String(e.message || e)}` } });
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
            .filter(([id, c]) => c && c.meta && c.meta.sectionIndex === idx && c.last && id !== selectionId)
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
          return (
          <Section
            key={idx}
            text={section}
            query={query}
            matchRefs={matchRefs}
            precomputedItems={preBySection.get(idx) || []}
            selectedRange={selection && selection.sectionIndex === idx ? { start: selection.start, end: selection.end } : null}
            onSelectRange={(range) => setSelection(range ? { sectionIndex: idx, ...range } : null)}
            sectionRef={(el) => (sectionElsRef.current[idx] = el)}
            contextInfo={selection && selection.sectionIndex === idx ? selectionContext : null}
            sectionIndex={idx}
            sectionStartOffset={sectionStartOffset}
            suppressNextAutoExplain={() => { suppressAutoExplainRef.current = true; }}
            metadata={metadata}
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

function Section({ text, query, matchRefs, sectionRef, selectedRange, onSelectRange, contextInfo, llm, savedExplanations = [], onCopyLink, selectedId, pendingFocus, onPendingFocusConsumed, precomputedItems = [], sectionIndex = 0, sectionStartOffset = 0, onDeleteSaved, suppressNextAutoExplain, metadata }) {
  const preRef = useRef(null);
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
  const [preFollowAnswer, setPreFollowAnswer] = useState(null);
  const [preFollowLoading, setPreFollowLoading] = useState(false);

  const processSelection = () => {
    const container = preRef.current;
    if (!container) return;
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range) return;
    // Case 1: selection fully within this section
    if (container.contains(range.startContainer) && container.contains(range.endContainer)) {
      const offsets = getOffsetsWithin(container, range);
      if (!offsets) return;
      let { start, end } = offsets;
      if (start != null && end != null && end > start) {
        onSelectRange({ start, end });
      }
      return;
    }
    // Case 2: selection spans multiple sections; anchor to the LAST section
    if (container.contains(range.endContainer)) {
      const r0 = document.createRange();
      r0.selectNodeContents(container);
      const beforeEnd = r0.cloneRange();
      beforeEnd.setEnd(range.endContainer, range.endOffset);
      const end = beforeEnd.toString().length;
      if (end > 0) onSelectRange({ start: 0, end, fullText: sel.toString() });
    }
  };

  // Handle mouse up to detect user selection (click-drag) or single click (expand to sentence)
  const handleMouseUp = (e) => {
    const container = preRef.current;
    if (!container) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Case 1: selection fully within this section
    if (container.contains(range.startContainer) && container.contains(range.endContainer)) {
      const offsets = getOffsetsWithin(container, range);
      if (!offsets) return;
      let { start, end } = offsets;
      // Tap: collapsed selection -> expand to sentence
      if (start === end && !(longPressRef.current || movedRef.current)) {
        const expanded = expandToSentence(text, start);
        if (expanded) ({ start, end } = expanded);
      }
      if (start != null && end != null && end > start) {
        onSelectRange({ start, end });
      }
      return;
    }
    // Case 2: selection spans multiple sections; anchor to the LAST section
    if (container.contains(range.endContainer)) {
      // Compute end offset inside this container; start at 0
      const r0 = document.createRange();
      r0.selectNodeContents(container);
      const beforeEnd = r0.cloneRange();
      beforeEnd.setEnd(range.endContainer, range.endOffset);
      const end = beforeEnd.toString().length;
      if (end > 0) {
        onSelectRange({ start: 0, end, fullText: sel.toString() });
      }
    }
  };

  // Selection handling: react to selectionchange and also finalize on touch/pointer end
  useEffect(() => {
    const onSelChange = () => {
      selPendingRef.current = true;
      // If a touch is active (user still dragging), don't process yet.
      // Fallback only when there is no active touch (e.g., iOS context menu without touchend)
      if (!touchActiveRef.current) {
        clearTimeout(selDebounceRef.current);
        selDebounceRef.current = setTimeout(() => {
          if (selPendingRef.current && !touchActiveRef.current) {
            selPendingRef.current = false;
            processSelection();
          }
        }, 250);
      }
    };
    const onFinalize = () => {
      touchActiveRef.current = false;
      if (!selPendingRef.current) return;
      selPendingRef.current = false;
      // small delay so browser settles selection bounds
      clearTimeout(selDebounceRef.current);
      setTimeout(processSelection, 30);
    };
    const onStart = (e) => {
      // Only consider real touch interactions
      if (e.pointerType && e.pointerType !== 'touch') return;
      touchActiveRef.current = true;
    };
    document.addEventListener('selectionchange', onSelChange);
    document.addEventListener('touchend', onFinalize);
    document.addEventListener('touchcancel', onFinalize);
    document.addEventListener('pointerup', onFinalize);
    document.addEventListener('pointercancel', onFinalize);
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('pointerdown', onStart, { passive: true });
    return () => {
      document.removeEventListener('selectionchange', onSelChange);
      document.removeEventListener('touchend', onFinalize);
      document.removeEventListener('touchcancel', onFinalize);
      document.removeEventListener('pointerup', onFinalize);
      document.removeEventListener('pointercancel', onFinalize);
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('pointerdown', onStart);
      clearTimeout(selDebounceRef.current);
    };
  }, []);

  // In-view observer using invisible anchors per speech start
  useEffect(() => {
    if (!precomputedItems || !precomputedItems.length) return;
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
  }, [precomputedItems, sectionRef]);

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

  const hasAside = !!selectedRange || (savedExplanations && savedExplanations.length > 0) || (precomputedItems && precomputedItems.length > 0);
  return (
    <div className={`section${hasAside ? '' : ' single'}`} ref={sectionRef}>
      <div className="playText" style={{ position: 'relative' }}>
        {/* Invisible anchors at speech starts for IntersectionObserver */}
        {(() => {
          const secChars = (text || '').length || 1;
          return (precomputedItems || []).map((it, i) => {
            const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
            const startC = bytesToCharOffset(text || '', startRelB);
            const topPct = (startC / Math.max(1, secChars)) * 100;
            return <div key={`anch-${i}`} className="speechAnchor" data-idx={i} style={{ position: 'absolute', top: `${topPct}%`, left: 0, width: 1, height: 1, pointerEvents: 'none' }} />;
          });
        })()}
        <pre ref={preRef} onMouseUp={handleMouseUp} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={(e)=>{onTouchEnd(e); handleMouseUp(e);}} onPointerUp={handleMouseUp}>
          {renderWithSelectionAndHighlights(text, query, selectedRange, matchRefs, selectedId)}
        </pre>
      </div>
      {hasAside ? (
        <aside className="explanations" aria-label="Explanations">
          {selectedRange ? (
            <LlmPanel
              passage={text.slice(selectedRange.start, selectedRange.end)}
              contextInfo={contextInfo}
              llm={llm}
              onFocusSource={() => focusSelected(selectedId)}
              onCopyLink={onCopyLink}
            />
          ) : null}
          {precomputedItems && precomputedItems.length ? (
            <div>
              {(() => {
                const it = precomputedItems[Math.min(autoIdx, precomputedItems.length - 1)];
                if (!it) return null;
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
                    setPreFollowAnswer(data?.content || '');
                    setPreFollowInput('');
                  } catch (e) {
                    setPreFollowAnswer(`Error: ${String(e.message || e)}`);
                  } finally {
                    setPreFollowLoading(false);
                  }
                };
                return (
                  <div key={`pc-${autoIdx}-${it.startOffset || autoIdx}`} style={{ marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #eee' }}>
                    <div style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }} onClick={toggleFollow} title="Ask a follow-up about this note">{it.content || ''}</div>
                    <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 4 }}>
                      {it.model ? `Model: ${it.model}` : ''}
                    </div>
                    {showPreFollow && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input type="text" placeholder="Ask a follow‑up…" value={preFollowInput} onChange={(e)=>setPreFollowInput(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter'){ e.preventDefault(); submitFollow(); } }} style={{ flex:1, minWidth:0 }} />
                        <button type="button" disabled={preFollowLoading || !preFollowInput.trim()} onClick={submitFollow}>Ask</button>
                      </div>
                    )}
                    {preFollowLoading && <div style={{ marginTop: '0.5rem', color:'#6b5f53' }}>Thinking…</div>}
                    {preFollowAnswer && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontWeight:600, marginBottom:'0.25rem' }}>Follow‑up</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{preFollowAnswer}</div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : null}
          {savedExplanations.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              {savedExplanations.map((ex, i) => (
                <ExplanationCard
                  key={`ex-${i}-${ex?.meta?.byteOffset || i}`}
                  passage={ex?.meta?.text || ''}
                  content={ex?.last || ''}
                onLocate={() => {
                  if (ex?.meta) {
                    onSelectRange({ start: ex.meta.start, end: ex.meta.end });
                    const len = new TextEncoder().encode(ex.meta.text || '').length;
                    const id = `${ex.meta.byteOffset}-${len}`;
                    setPendingFocus({ sectionIndex, id });
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
          onClick={() => { if (onDeleteCurrent && confirm('Delete this explanation?')) onDeleteCurrent(); }}
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

function ExplanationCard({ passage, content, onLocate, onCopy, onDelete }) {
  return (
    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
      <div style={{ marginTop: '0.25rem' }} onClick={onLocate} title="Click to highlight source in the text">
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Explanation</div>
        <div style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}>{content || '—'}</div>
      </div>
      <div style={{ marginTop: '0.25rem' }}>
        <button type="button" onClick={onLocate}>
          Locate Source
        </button>
        <button type="button" onClick={onCopy} style={{ marginLeft: '0.5rem' }}>
          Copy Link
        </button>
        <button type="button" onClick={onDelete} style={{ marginLeft: '0.5rem' }}>
          Delete
        </button>
      </div>
    </div>
  );
}
