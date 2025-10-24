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
  try {
    const p = path.join(process.cwd(), 'data', 'metadata.json');
    metadata = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    // Metadata not built yet; that's okay for UI
  }
  return { props: { sections, sectionsWithOffsets: filtered, metadata, markers } };
}

export default function Home({ sections, sectionsWithOffsets, metadata, markers }) {
  const [query, setQuery] = useState(''); // executed search
  const [input, setInput] = useState(''); // text in the box
  const [currentIdx, setCurrentIdx] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const matchRefs = useRef([]); // flat list of all match elements
  const [selection, setSelection] = useState(null); // { sectionIndex, start, end }
  const [selectionContext, setSelectionContext] = useState(null); // { act, scene, onStage, speaker, text, byteOffset }
  const [llmOptions, setLlmOptions] = useState({ model: 'gpt-4o-mini', language: 'English', educationLevel: 'High school', age: '16' });
  const [conversations, setConversations] = useState({}); // id -> { messages: [{role, content}], last: string }
  const [loadingLLM, setLoadingLLM] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
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

  // Track active scene for highlighting in TOC based on scroll + metadata scene ranges
  const [activeScene, setActiveScene] = useState(null);
  const sectionElsRef = useRef([]);
  useEffect(() => {
    const onScroll = () => {
      // Find the section closest to top within viewport (above a small threshold)
      const els = sectionElsRef.current.filter(Boolean);
      let best = null;
      let bestTop = -Infinity;
      for (let i = 0; i < els.length; i++) {
        const rect = els[i].getBoundingClientRect();
        if (rect.top <= 80 && rect.top > bestTop) { // 80px threshold under the top
          bestTop = rect.top;
          best = i;
        }
      }
      if (best == null) return;
      const startOffset = sectionsWithOffsets[best]?.startOffset;
      if (startOffset == null || !metadata?.scenes) return;
      // Find scene containing this offset
      let current = null;
      for (const s of metadata.scenes) {
        if (s.startOffset != null && s.endOffset != null) {
          if (startOffset >= s.startOffset && startOffset <= s.endOffset) {
            current = { act: s.act, scene: s.scene };
          }
        }
      }
      const key = current ? `${current.act}-${current.scene}` : null;
      setActiveScene(key);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [metadata, sectionsWithOffsets]);

  const scrollToSection = (index) => {
    const el = sectionElsRef.current[index];
    if (!el) return;
    const bar = document.querySelector('.searchBar');
    const offset = bar ? bar.getBoundingClientRect().height + 8 : 8;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

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

  async function callLLM({ mode = 'brief', followup }) {
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
      const newMsgs = [
        ...conv.messages,
        { role: 'user', content: buildUserPrompt(selectionContext, mode, followup) },
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

  function buildUserPrompt(selCtx, mode, followup) {
    const parts = [
      'Explain the selected Romeo and Juliet line(s) directly — no prefaces like "In this quote", and do not repeat the quote or restate Act/Scene/Speaker.',
      'Help the reader parse the sentence: briefly clarify unfamiliar/archaic words or idioms and any tricky syntax (inversions, ellipses), then give a clear paraphrase.',
      'Avoid boilerplate claims ("pivotal", "foreshadows", "underscores the theme", "sets the stage") unless clearly warranted by these exact lines; be concrete or skip such claims.',
      'Prefer precise paraphrase + immediate purpose in the scene.',
    ];
    if (mode === 'brief') parts.push('Brief: 2–3 sentences.');
    if (mode === 'more') parts.push('More detail: connect to themes/subtext.');
    if (mode === 'followup' && followup) parts.push(`Follow-up: ${followup}`);
    return parts.join('\n');
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
            .map(([, c]) => c);
          return (
          <Section
            key={idx}
            text={section}
            query={query}
            matchRefs={matchRefs}
            selectedRange={selection && selection.sectionIndex === idx ? { start: selection.start, end: selection.end } : null}
            onSelectRange={(range) => setSelection(range ? { sectionIndex: idx, ...range } : null)}
            sectionRef={(el) => (sectionElsRef.current[idx] = el)}
            contextInfo={selection && selection.sectionIndex === idx ? selectionContext : null}
            llm={{
              options: llmOptions,
              setOptions: setLlmOptions,
              loading: loadingLLM,
              conversation: selectionId ? conversations[selectionId] : null,
              onMore: () => callLLM({ mode: 'more' }),
              onFollowup: (q) => callLLM({ mode: 'followup', followup: q }),
              onDeleteCurrent: () => { if (selectionId) deleteExplanationById(selectionId); },
            }}
            selectedId={selection && selection.sectionIndex === idx ? selectionId : null}
            savedExplanations={savedExplanations}
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
                <select value={llmOptions.provider || 'openai'} onChange={(e) => setLlmOptions({ ...llmOptions, provider: e.target.value })} style={{ marginLeft: 6 }}>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="gemini">Gemini</option>
                </select>
              </label>
              <label>Model
                <input type="text" value={llmOptions.model || ''} onChange={(e) => setLlmOptions({ ...llmOptions, model: e.target.value })} style={{ marginLeft: 6 }} />
              </label>
              <label>Language
                <input type="text" value={llmOptions.language || ''} onChange={(e) => setLlmOptions({ ...llmOptions, language: e.target.value })} style={{ marginLeft: 6 }} />
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

function Section({ text, query, matchRefs, sectionRef, selectedRange, onSelectRange, contextInfo, llm, savedExplanations = [], onCopyLink, selectedId }) {
  const preRef = useRef(null);

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
      if (start === end) {
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

  const focusSelected = (targetId) => {
    const container = preRef.current;
    if (!container) return;
    let selEl = null;
    if (targetId) selEl = container.querySelector(`.selected[data-sel-id="${targetId}"]`);
    if (!selEl) selEl = container.querySelector('.selected');
    if (!selEl) return;
    selEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    selEl.classList.add('flash');
    setTimeout(() => selEl.classList.remove('flash'), 1800);
  };

  const hasAside = !!selectedRange || (savedExplanations && savedExplanations.length > 0);
  return (
    <div className={`section${hasAside ? '' : ' single'}`} ref={sectionRef}>
      <div className="playText">
        <pre ref={preRef} onMouseUp={handleMouseUp}>
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
                      setTimeout(() => focusSelected(id), 50);
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
                      // Delete and if it was the current selection, keep selection but without explanation
                      const next = { ...conversations };
                      delete next[id];
                      setConversations(next);
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
  const [followup, setFollowup] = useState('');
  const [showControls, setShowControls] = useState(false);
  const { options, setOptions, loading, conversation, onMore, onFollowup, onDeleteCurrent } = llm || {};
  return (
    <div>
      {conversation?.last ? (
        <div style={{ marginTop: '0.5rem' }} onClick={onFocusSource} title="Click to highlight source in the text">
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Explanation</div>
          <div style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}>{conversation.last}</div>
        </div>
      ) : null}
      {loading && (
        <div style={{ marginTop: '0.5rem', color: '#6b5f53' }}>Thinking…</div>
      )}
      <div style={{ marginTop: '0.5rem' }}>
        <button type="button" onClick={() => setShowControls((v) => !v)}>
          {showControls ? 'Hide Controls' : 'Show Controls'}
        </button>
      </div>
      {showControls && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={onMore} disabled={loading}>
              More
            </button>
            <button type="button" onClick={onFocusSource} title="Highlight source in text">
              Locate Source
            </button>
            <button type="button" onClick={onCopyLink} title="Copy sharable link">
              Copy Link
            </button>
            <button
              type="button"
              onClick={() => {
                if (onDeleteCurrent && confirm('Delete this explanation?')) onDeleteCurrent();
              }}
              title="Delete this explanation"
            >
              Delete
            </button>
            <select
              value={options?.model || ''}
              onChange={(e) => setOptions({ ...options, model: e.target.value })}
              title="Model"
            >
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
            </select>
            <select
              value={options?.language || ''}
              onChange={(e) => setOptions({ ...options, language: e.target.value })}
              title="Language"
            >
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
              <option>Italian</option>
              <option>Portuguese</option>
              <option>Chinese</option>
              <option>Japanese</option>
            </select>
            <select
              value={options?.educationLevel || ''}
              onChange={(e) => setOptions({ ...options, educationLevel: e.target.value })}
              title="Education level"
            >
              <option>Middle school</option>
              <option>High school</option>
              <option>Undergraduate</option>
              <option>Graduate</option>
            </select>
            <input
              type="number"
              min="10"
              max="100"
              value={options?.age || ''}
              onChange={(e) => setOptions({ ...options, age: e.target.value })}
              title="Age"
              style={{ width: 64 }}
            />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (followup.trim()) onFollowup?.(followup.trim());
              setFollowup('');
            }}
            style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}
          >
            <input
              type="text"
              placeholder="Ask a follow-up…"
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" disabled={loading}>Ask</button>
          </form>
        </div>
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
