import Head from 'next/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { parseSectionsWithOffsets } from '../lib/parseText';
import { getApiUrl } from '../lib/api';
import fs from 'fs';
import path from 'path';

// Helper function to fetch with better error handling including URL
async function fetchWithErrorHandling(url, options = {}) {
  try {
    // Get the actual resolved URL (for debugging)
    const resolvedUrl = url.startsWith('http') ? url : (typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url);
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      // If not JSON, try to get the text to see what we got
      const text = await res.text();
      const apiBaseUrl = typeof window !== 'undefined' ? (window.__NEXT_PUBLIC_API_URL__ || 'unknown') : 'unknown';
      const errorMsg = `Expected JSON but got ${contentType}. Response: ${text.substring(0, 200)}... Request URL: ${url} | Resolved URL: ${resolvedUrl} | Base URL: ${baseUrl} | NEXT_PUBLIC_API_URL: ${apiBaseUrl}`;
      throw new Error(errorMsg);
    }
    
    if (!res.ok) {
      const apiBaseUrl = typeof window !== 'undefined' ? (window.__NEXT_PUBLIC_API_URL__ || 'unknown') : 'unknown';
      throw new Error(data?.detail || data?.error || `HTTP ${res.status}: ${res.statusText}. Request URL: ${url} | Resolved URL: ${resolvedUrl} | Base URL: ${baseUrl} | NEXT_PUBLIC_API_URL: ${apiBaseUrl}`);
    }
    
    return data;
  } catch (e) {
    // If it's already our custom error with URL info, throw it
    if (e.message && (e.message.includes('URL:') || e.message.includes('Request URL:'))) {
      throw e;
    }
    // Otherwise, add URL info
    const resolvedUrl = url.startsWith('http') ? url : (typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url);
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    const apiBaseUrl = typeof window !== 'undefined' ? (window.__NEXT_PUBLIC_API_URL__ || 'unknown') : 'unknown';
    throw new Error(`${e.message || String(e)}. Request URL: ${url} | Resolved URL: ${resolvedUrl} | Base URL: ${baseUrl} | NEXT_PUBLIC_API_URL: ${apiBaseUrl}`);
  }
}

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
  // Note: precomputed explanations are loaded client-side to reduce initial page size
  // They're served as a static JSON file from /data/explanations.json
  try {
    const p = path.join(process.cwd(), 'data', 'metadata.json');
    metadata = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    // Metadata not built yet; that's okay for UI
  }
  return { props: { sections, sectionsWithOffsets: filtered, metadata, markers } };
}

export default function Home({ sections, sectionsWithOffsets, metadata, markers }) {
  // Force enable scrolling in Capacitor/iOS - apply styles directly with aggressive fixes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // Multiple detection methods
    const ua = window.navigator?.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isCapacitor = !!(window.Capacitor || window.CapacitorWeb ||
      (window.location && window.location.protocol === 'capacitor:') ||
      ua.includes('Capacitor') || ua.includes('ionic'));
    
    // If iOS or Capacitor, force enable scrolling
    if (isIOS || isCapacitor) {
      // Debug log (remove later)
      if (typeof window !== 'undefined' && window.Capacitor) {
        console.log('[Scroll Fix] Capacitor detected, enabling scrolling...');
      }
      if (isIOS) {
        console.log('[Scroll Fix] iOS detected, enabling scrolling...');
      }
      
      const html = document.documentElement;
      const body = document.body;
      const next = document.getElementById('__next');
      
      // Set data attributes for CSS targeting
      if (html) {
        html.classList.add('isCapacitor');
        html.setAttribute('data-capacitor', 'true');
        html.setAttribute('data-ios-scroll', 'true');
        html.style.height = 'auto';
        html.style.overflow = 'visible';
        html.style.overflowY = 'visible';
      }
      if (body) {
        body.setAttribute('data-ios-scroll', 'true');
        body.style.height = 'auto';
        body.style.minHeight = '100vh';
        body.style.overflow = 'auto';
        body.style.overflowY = 'auto';
        body.style.position = 'relative';
        body.style.WebkitOverflowScrolling = 'touch';
        body.style.overflowX = 'hidden';
      }
      if (next) {
        next.setAttribute('data-ios-scroll', 'true');
        next.style.height = 'auto';
        next.style.minHeight = '100vh';
        next.style.overflow = 'visible';
      }
      
      // Fix page and container elements with delays to ensure DOM is ready
      const fixLayout = () => {
        const page = document.querySelector('.page');
        const container = document.querySelector('.container');
        const sidebar = document.querySelector('.sidebar');
        
        if (page) {
          page.style.position = 'relative';
          page.style.height = 'auto';
          page.style.minHeight = '100vh';
          page.style.overflow = 'visible';
          page.style.top = '0';
          page.style.bottom = 'auto';
        }
        if (container) {
          container.style.position = 'relative';
          container.style.height = 'auto';
          container.style.overflow = 'visible';
          container.style.overflowY = 'visible';
          container.style.left = '0';
          container.style.top = 'auto';
          container.style.bottom = 'auto';
        }
        if (sidebar) {
          sidebar.style.position = 'relative';
          sidebar.style.height = 'auto';
          sidebar.style.overflow = 'visible';
        }
      };
      
      // Try multiple times to ensure it applies
      fixLayout();
      setTimeout(fixLayout, 50);
      setTimeout(fixLayout, 200);
      setTimeout(fixLayout, 500);
      
      // Also listen for any layout changes
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => fixLayout());
        if (body) ro.observe(body);
        if (next) ro.observe(next);
      }
    }
  }, []);

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
  // Initialize from localStorage if available, otherwise default to 33 (Most)
  const [noteThreshold, setNoteThreshold] = useState(() => {
    if (typeof window === 'undefined') return 33;
    try {
      const raw = localStorage.getItem('noteThreshold');
      if (raw !== null && raw !== '') {
        const val = parseInt(raw, 10);
        if (Number.isFinite(val)) {
          return clamp(val, 0, 100);
        }
      }
    } catch {}
    return 33;
  });
  const [fontScale, setFontScale] = useState(1);
  const fontScaleRef = useRef(1);
  const [fontScaleHydrated, setFontScaleHydrated] = useState(false);
  const suppressAutoExplainRef = useRef(false);
  const llmCallTimerRef = useRef(null);
  const DEBUG_SCROLL = false;
  const DEBUG_RESTORE = false;
  const DEBUG_SELECTION = false;
  // Persist force-shown notes (by speech key act|scene|speechIndex)
  const [forcedNotes, setForcedNotes] = useState([]);
  // Track which note is in text selection mode (speech key string or null)
  const [noteInSelectMode, setNoteInSelectMode] = useState(null);
  // Track which notes are expanded (Set of speech keys)
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  // Load precomputed explanations client-side to reduce initial page size
  const [precomputed, setPrecomputed] = useState([]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Load precomputed explanations asynchronously
    fetch('/data/explanations.json')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          setPrecomputed(data);
        }
      })
      .catch(() => {
        // Silently fail if explanations.json doesn't exist or can't be loaded
        setPrecomputed([]);
      });
  }, []);
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

    // Check if running in Capacitor - if so, disable font scaling touch handlers to allow scrolling
    // Check for Capacitor object, capacitor:// protocol, or user agent
    const isCapacitor = typeof window !== 'undefined' && 
      (window.Capacitor || window.CapacitorWeb ||
       (window.location && window.location.protocol === 'capacitor:') ||
       (window.navigator && window.navigator.userAgent && 
        (window.navigator.userAgent.includes('Capacitor') || 
         window.navigator.userAgent.includes('ionic'))));

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
      // In Capacitor, allow normal scrolling - don't intercept touch events for font scaling
      if (isCapacitor) return;
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
      // In Capacitor, allow normal scrolling
      if (isCapacitor) return;
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
      // In Capacitor, allow normal scrolling
      if (isCapacitor) return;
      if (e.touches.length < 2) {
        const didCommit = finalizeTouch();
        if (!didCommit) window.__pinchActive = false;
        if (didCommit) e.preventDefault();
        return;
      }
      if (state.active) e.preventDefault();
    };

    const onGestureStart = (e) => {
      // In Capacitor, allow normal scrolling
      if (isCapacitor) return;
      flushPending();
      gestureState.startScale = fontScaleRef.current;
      window.__pinchActive = true;
      e.preventDefault();
    };

    const onGestureChange = (e) => {
      // In Capacitor, allow normal scrolling
      if (isCapacitor) return;
      const scale = typeof e.scale === 'number' && Number.isFinite(e.scale) ? e.scale : 1;
      scheduleScale(gestureState.startScale * scale);
      e.preventDefault();
    };

    const onGestureEnd = (e) => {
      // In Capacitor, allow normal scrolling
      if (isCapacitor) return;
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

    // Only attach font scaling touch handlers if not in Capacitor (to allow scrolling)
    if (!isCapacitor) {
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
    }

    return () => {
      flushPending();
      if (!isCapacitor) {
        const optionsPassiveFalse = { passive: false };
        const targets = [window, document];
        targets.forEach((target) => {
          remove(target, 'touchstart', onTouchStart, optionsPassiveFalse);
          remove(target, 'touchmove', onTouchMove, optionsPassiveFalse);
          remove(target, 'touchend', onTouchEnd, optionsPassiveFalse);
          remove(target, 'touchcancel', onTouchEnd, optionsPassiveFalse);
          remove(target, 'gesturestart', onGestureStart, optionsPassiveFalse);
          remove(target, 'gesturechange', onGestureChange, optionsPassiveFalse);
          remove(target, 'gestureend', onGestureEnd, optionsPassiveFalse);
        });
      }
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

  // After highlights render for a given query, capture count and scroll to first match
  useEffect(() => {
    if (!query || !query.trim()) {
      setTotalMatches(0);
    setCurrentIdx(0);
      matchRefs.current.forEach((el) => el && el.classList.remove('current'));
      return;
    }

    // Wait for all sections to render, then query DOM for highlights
    // This is more reliable than waiting for refs to populate
    let rafId1, rafId2, timeoutId;
    let attempts = 0;
    const maxAttempts = 10;
    
    const checkAndScroll = () => {
      // Query DOM directly for all highlight elements
      const highlights = Array.from(document.querySelectorAll('.highlight'));
      
      // Also check refs array (in case it's populated)
      const refsCount = matchRefs.current.length;
      const domCount = highlights.length;
      const count = Math.max(refsCount, domCount);
      
      if (count > 0) {
        // Sync refs array with DOM if needed
        if (domCount > refsCount) {
          matchRefs.current = highlights;
        }
        
        setTotalMatches(count);
        setCurrentIdx(0);
        
        // Scroll to first match
        rafId2 = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = matchRefs.current[0] || highlights[0];
            if (el) {
              // Ensure refs array is synced
              if (!matchRefs.current[0] && highlights[0]) {
                matchRefs.current = highlights;
              }
              
              // Mark active class
              matchRefs.current.forEach((e) => e && e.classList.remove('current'));
              highlights.forEach((e) => e.classList.remove('current'));
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
            }
          });
        });
      } else if (attempts < maxAttempts) {
        // If no matches found yet, keep trying (sections might still be rendering)
        attempts++;
        timeoutId = setTimeout(() => {
          checkAndScroll();
        }, 50);
      } else {
        // Give up after max attempts
        setTotalMatches(0);
        setCurrentIdx(0);
      }
    };

    rafId1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        checkAndScroll();
      });
    });

    return () => {
      if (rafId1) cancelAnimationFrame(rafId1);
      if (rafId2) cancelAnimationFrame(rafId2);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [query]);

  // Handle scrolling when currentIdx changes (via prev/next buttons)
  useEffect(() => {
    if (totalMatches > 0 && currentIdx >= 0 && currentIdx < totalMatches) {
      // Use requestAnimationFrame to ensure DOM has updated with highlights
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
      const el = matchRefs.current[currentIdx];
          if (el) {
            // Mark active class
            matchRefs.current.forEach((e) => e && e.classList.remove('current'));
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
          }
        });
      });
    } else if (totalMatches === 0) {
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
    // Always use the exact selected text range, never expand to fullText
    const textForLLM = sectionText.slice(selection.start, selection.end);
    setSelectionContext({ ...ctx, text: textForLLM, byteOffset });
  }, [selection, metadata, sectionsWithOffsets, sections]);

  // Auto-request on selection when a new passage is selected
  useEffect(() => {
    if (llmCallTimerRef.current) {
      clearTimeout(llmCallTimerRef.current);
      llmCallTimerRef.current = null;
    }
    if (!selectionContext) return () => {};
    if (!String(selectionContext.text || '').trim()) return () => {};
    if (suppressAutoExplainRef.current) {
      suppressAutoExplainRef.current = false;
      return () => {};
    }
    const len = new TextEncoder().encode(selectionContext.text || '').length;
    const id = `${selectionContext.byteOffset}-${len}`;
    if (conversations && conversations[id] && conversations[id].last) return () => {};
    const pref = (llmOptions?.length === 'medium' ? 'more' : (llmOptions?.length === 'large' ? 'more' : 'brief'));
    llmCallTimerRef.current = setTimeout(() => {
      callLLM({ mode: pref, length: llmOptions?.length || 'brief' });
      llmCallTimerRef.current = null;
    }, 0);
    return () => {
      if (llmCallTimerRef.current) {
        clearTimeout(llmCallTimerRef.current);
        llmCallTimerRef.current = null;
      }
    };
  }, [selectionContext, conversations, llmOptions?.length]);

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

  const deleteExplanationsForSpeech = useCallback((speechKey) => {
    if (!speechKey) return;
    setConversations((curr) => {
      if (!curr) return curr;
      let changed = false;
      const next = {};
      for (const [id, convo] of Object.entries(curr)) {
        if (convo?.meta?.speechKey === speechKey) {
          changed = true;
          continue;
        }
        next[id] = convo;
      }
      return changed ? next : curr;
    });
  }, []);

  async function callLLM({ mode = 'brief', followup, length }) {
    if (!selectionContext) return;
    setLoadingLLM(true);

    const conv = conversations[selectionId] || { messages: [] };
    const thinkingText = 'AI is thinking…';

    const resolveSectionIndex = () => {
      if (selection && typeof selection.sectionIndex === 'number') return selection.sectionIndex;
      const byte = selectionContext?.byteOffset;
      if (!Number.isFinite(byte)) return null;
      for (let i = sectionsWithOffsets.length - 1; i >= 0; i--) {
        const start = sectionsWithOffsets[i]?.startOffset || 0;
        if (byte >= start) return i;
      }
      return sectionsWithOffsets.length ? 0 : null;
    };
    const resolvedSectionIndex = resolveSectionIndex();

    let speechKeyForSelection = null;
    try {
      const byte = selectionContext.byteOffset ?? null;
      if (byte != null && resolvedSectionIndex != null) {
        const list = speechMaps?.speechesBySection?.get(resolvedSectionIndex) || [];
        let chosen = null;
        for (const sp of list) {
          if ((sp.offset || 0) <= byte) chosen = sp; else break;
        }
        if (chosen) {
          speechKeyForSelection = `${chosen.act}|${chosen.scene}|${chosen.speechIndex}`;
        }
      }
    } catch {}

    const selectionRange = (selection && typeof selection.start === 'number' && typeof selection.end === 'number')
      ? selection
      : null;

    const encoder = new TextEncoder();
    const deriveCharRange = () => {
      const defaults = { start: selectionRange?.start ?? null, end: selectionRange?.end ?? null };
      if ((defaults.start != null && defaults.end != null) || resolvedSectionIndex == null) return defaults;
      const sectionText = sections[resolvedSectionIndex] || '';
      const sectionStart = sectionsWithOffsets[resolvedSectionIndex]?.startOffset || 0;
      if (!sectionText) return defaults;
      const startBytes = Math.max(0, (selectionContext.byteOffset || 0) - sectionStart);
      const baseStart = bytesToCharOffset(sectionText, startBytes);
      const lenBytes = encoder.encode(selectionContext.text || '').length;
      const endBytes = startBytes + lenBytes;
      const baseEnd = bytesToCharOffset(sectionText, endBytes);
      return {
        start: defaults.start != null ? defaults.start : baseStart,
        end: defaults.end != null ? defaults.end : baseEnd,
      };
    };
    const { start: derivedStart, end: derivedEnd } = deriveCharRange();

    const meta = {
      sectionIndex: resolvedSectionIndex,
      start: derivedStart,
      end: derivedEnd,
      text: selectionContext.text,
      act: selectionContext.act,
      scene: selectionContext.scene,
      speaker: selectionContext.speaker,
      onStage: selectionContext.onStage,
      byteOffset: selectionContext.byteOffset,
      speechKey: speechKeyForSelection,
    };

    if (!conversations[selectionId] || !conversations[selectionId].last) {
      setConversations({ ...conversations, [selectionId]: { messages: conv.messages, last: thinkingText, meta, moreThreads: conversations[selectionId]?.moreThreads || [], followupThreads: conversations[selectionId]?.followupThreads || [] } });
    }

    try {
      // Build a compact excerpt: previous speech only, to ground who was speaking
      let contextText = '';
      try {
        const byte = selectionContext.byteOffset || 0;
        const enc = new TextEncoder();
        const scn = (Array.isArray(metadata?.scenes) ? metadata.scenes : []).find((s) => byte >= (s.startOffset||0) && byte <= (s.endOffset||0));
        const sceneStart = scn?.startOffset ?? 0;
        const sceneEnd = scn?.endOffset ?? byte;
        const speeches = Array.isArray(metadata?.speeches) ? metadata.speeches : [];
        let prevStart = null; let nextStart = null;
        for (let i = 0; i < speeches.length; i++) {
          const off = speeches[i]?.offset || 0;
          if (off >= sceneStart && off < byte) prevStart = off;
          if (off > byte && off <= sceneEnd) { nextStart = off; break; }
        }
        if (prevStart != null) {
          const endB = Math.min(nextStart != null ? nextStart : sceneEnd, byte);
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
      // If mode is 'more' or 'followup' and there's an existing explanation, use it as noteText
      // This ensures the API knows not to repeat existing content
      if ((mode === 'more' || mode === 'followup') && conversations[selectionId] && conversations[selectionId].last) {
        const existingExplanation = conversations[selectionId].last;
        if (existingExplanation && existingExplanation !== 'AI is thinking…' && String(existingExplanation).trim()) {
          // Prepend existing explanation to noteText if there's already a precomputed note
          noteText = noteText ? `${noteText}\n\n${existingExplanation}` : existingExplanation;
        }
      }

      const url = getApiUrl('/api/explain');
      const data = await fetchWithErrorHandling(url, {
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
      const assistantMsg = { role: 'assistant', content: data.content };
      const reqLen = length || llmOptions.length || 'brief';
      const newMsgs = [
        ...conv.messages,
        { role: 'user', content: buildUserPrompt(selectionContext, mode, followup, reqLen) },
        assistantMsg,
      ].slice(-12);
      
      // For 'more' mode, append to moreThreads instead of replacing last
      if (mode === 'more') {
        const existingMoreThreads = conversations[selectionId]?.moreThreads || [];
        const newMoreThreads = [
          ...existingMoreThreads,
          { q: 'More', a: data.content, model: (llmOptions?.model || ''), provider: (llmOptions?.provider || '') }
        ];
        setConversations({ ...conversations, [selectionId]: { messages: newMsgs, last: conversations[selectionId]?.last || data.content, meta, moreThreads: newMoreThreads, followupThreads: conversations[selectionId]?.followupThreads || [] } });
      } else if (mode === 'followup' && followup) {
        // For followup mode, append to followupThreads
        const existingFollowupThreads = conversations[selectionId]?.followupThreads || [];
        const newFollowupThreads = [
          ...existingFollowupThreads,
          { q: followup, a: data.content, model: (llmOptions?.model || ''), provider: (llmOptions?.provider || '') }
        ];
        setConversations({ ...conversations, [selectionId]: { messages: newMsgs, last: conversations[selectionId]?.last || data.content, meta, moreThreads: conversations[selectionId]?.moreThreads || [], followupThreads: newFollowupThreads } });
      } else {
        setConversations({ ...conversations, [selectionId]: { messages: newMsgs, last: data.content, meta, moreThreads: conversations[selectionId]?.moreThreads || [], followupThreads: conversations[selectionId]?.followupThreads || [] } });
      }
    } catch (e) {
      setConversations({ ...conversations, [selectionId]: { messages: [], last: `Error: ${String(e.message || e)}`, meta, moreThreads: conversations[selectionId]?.moreThreads || [], followupThreads: conversations[selectionId]?.followupThreads || [] } });
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
    const url = getApiUrl(`/api/models?provider=${encodeURIComponent(prov)}`);
    fetchWithErrorHandling(url)
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
        <title>Romeo and Juliet Explained</title>
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
            onSelectRange={(range) => {
              setSelection(range ? { sectionIndex: idx, ...range } : null);
            }}
            sectionRef={(el) => (sectionElsRef.current[idx] = el)}
            contextInfo={selection && selection.sectionIndex === idx ? selectionContext : null}
            sectionIndex={idx}
            sectionStartOffset={sectionStartOffset}
            suppressNextAutoExplain={suppressAutoExplainRef}
            metadata={metadata}
            forcedNotes={forcedNotes}
            onToggleForced={toggleForcedNote}
            noteThreshold={noteThreshold}
            onRequestFocus={(pf) => setPendingFocus(pf)}
            onDeleteSpeech={deleteExplanationsForSpeech}
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
                  // Clear browser selection to prevent re-triggering
                  if (typeof window !== 'undefined' && window.getSelection) {
                    try {
                      const sel = window.getSelection();
                      if (sel) sel.removeAllRanges();
                    } catch {}
                  }
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
            expandedNotes={expandedNotes}
            onToggleNoteExpanded={(speechKey) => {
              setExpandedNotes((prev) => {
                const next = new Set(prev);
                const isExpanding = !next.has(speechKey);
                if (next.has(speechKey)) {
                  next.delete(speechKey);
                  // Disable mobile text selection mode when note is collapsed
                  if (noteInSelectMode === speechKey) {
                    setNoteInSelectMode(null);
                  }
                } else {
                  next.add(speechKey);
                  // Enable mobile text selection mode when note is expanded
                  if (noteInSelectMode !== speechKey) {
                    setNoteInSelectMode(speechKey);
                  }
                }
                return next;
              });
            }}
            onToggleNoteSelectMode={(speechKey) => {
              setNoteInSelectMode((prev) => (prev === speechKey ? null : speechKey));
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

function Section({ text, query, matchRefs, sectionRef, selectedRange, onSelectRange, contextInfo, llm, savedExplanations = [], onCopyLink, selectedId, pendingFocus, onPendingFocusConsumed, precomputedItems = [], precomputedAllItems = [], speeches = [], noteBySpeechKey = new Map(), sectionIndex = 0, sectionStartOffset = 0, onDeleteSaved, onDeleteSpeech, suppressNextAutoExplain, metadata, noteThreshold = 0, forcedNotes = [], onToggleForced, onRequestFocus, noteInSelectMode = null, onToggleNoteSelectMode, expandedNotes = new Set(), onToggleNoteExpanded }) {
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
  const selectionTimeoutRef = useRef(null);
  const lastSelectionStringRef = useRef('');
  const isManualDragSelection = useRef(false); // Track if user manually dragged to select
  const isMouseDown = useRef(false); // Track if mouse button is currently down
  // Mobile selection mode state/refs - now driven by noteInSelectMode
  const [detectedTouchDevice, setDetectedTouchDevice] = useState(false);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    try {
      if (navigator.maxTouchPoints > 0) {
        setDetectedTouchDevice(true);
      }
    } catch {
      // Ignore detection errors and leave as non-touch
    }
  }, []);
  const isTouchDevice = noteInSelectMode || detectedTouchDevice;
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
  const textEncoder = useMemo(() => new TextEncoder(), []);

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
  // Check if forced note is suppressed
  const isForcedSuppressed = forcedKey && suppressedNotes.has(forcedKey);
  const chosenItem = (forcedKey && !isForcedSuppressed ? noteBySpeechKey.get(forcedKey) : (isSuppressed ? null : (currentVisible || (forceShow ? currentForceVisible : null))));
  const chosenItemSpeechKey = chosenItem ? getSpeechKeyForItem(chosenItem) : null;
  const isNoteExpanded = chosenItemSpeechKey && expandedNotes.has(chosenItemSpeechKey);
  // Show the aside only when there is actual content to show
  // Check if there's a chosenItem, savedExplanations, or a valid LLM conversation for selectedRange
  // Also show if there's a selection (even without conversation yet) or if LLM is loading
  const hasLLMContent = selectedRange && (llm?.conversation?.last || llm?.loading);
  const hasSelection = !!selectedRange;
  // Show aside when note is in select mode (even without selection yet) or when there's actual content
  const hasSelectModeActive = !!sectionHasSelectModeNote;
  // Check if chosenItem has actual content (not empty)
  const hasNoteContent = chosenItem && (chosenItem.content || '').trim().length > 0;
  // Check if note is suppressed (hidden) - check both current speech and forced note
  const currentSpeechNoteSuppressed = speechKey && suppressedNotes.has(speechKey);
  const forcedNoteSuppressed = forcedKey && suppressedNotes.has(forcedKey);
  const noteIsSuppressed = currentSpeechNoteSuppressed || (chosenItem && (isSuppressed || isForcedSuppressed));
  // Calculate filtered saved explanations count (for checking if aside should show)
  // Only count explanations that are NOT associated with a suppressed note
  const filteredSavedExplanationsCount = (savedExplanations || []).filter((ex) => {
    if (!ex?.meta) return false;
    const meta = ex.meta;
    // If explanation is associated with a suppressed note, don't count it
    const exSpeechKey = meta.speechKey;
    if (exSpeechKey && suppressedNotes.has(exSpeechKey)) return false;
    if (chosenItem && !noteIsSuppressed) {
      const noteSpeechKey = chosenItemSpeechKey;
      if (noteSpeechKey && exSpeechKey && exSpeechKey === noteSpeechKey) return true;
      if (noteSpeechSpan && meta.byteOffset != null) {
        const exStart = meta.byteOffset;
        const exEnd = exStart + (meta.text ? new TextEncoder().encode(meta.text).length : 0);
        return exStart >= noteSpeechSpan.start && exEnd <= noteSpeechSpan.end;
      }
    }
    return meta.sectionIndex === sectionIndex;
  }).length;
  // Only show aside if there's actual visible content (not suppressed note, or has other content)
  const hasAside = (hasNoteContent && !noteIsSuppressed)
    || filteredSavedExplanationsCount > 0
    || (hasLLMContent && !currentSpeechNoteSuppressed)
    || (hasSelection && !currentSpeechNoteSuppressed)
    || hasSelectModeActive;
  // Indicate clickability in the text area when a suppressed note exists for the current speech
  const canForceReveal = !selectedRange
    && (!savedExplanations || savedExplanations.length === 0)
    && !currentVisible
    && !!currentForceVisible;
  const hasSelectionContext = !!(selectedRange && contextInfo);
  const conversationLast = llm?.conversation?.last;
  const isThinking = hasSelectionContext && llm?.loading && (!conversationLast || conversationLast === 'AI is thinking…');
  const hasConversation = hasSelectionContext && conversationLast && conversationLast !== 'AI is thinking…';
  const currentSelectionId = hasSelectionContext ? (() => {
    const len = textEncoder.encode(contextInfo.text || '').length;
    return `${contextInfo.byteOffset}-${len}`;
  })() : null;
  // Filter saved explanations to only show ones relevant to current note or section
  // If there's a note (chosenItem), show explanations for that note's speech
  // Otherwise, show all explanations for this section
  // Note: speechSpan is computed below, but we need to check it here
  // We'll compute it early for filtering purposes
  const noteSpeechSpan = useMemo(() => {
    if (!chosenItem) return null;
    const byteOffset = chosenItem.startOffset ?? chosenItem.byteOffset ?? null;
    if (byteOffset == null) return null;
    const speechesMeta = Array.isArray(metadata?.speeches) ? metadata.speeches : [];
    if (!speechesMeta.length) return null;
    let idx = -1;
    for (let i = 0; i < speechesMeta.length; i++) {
      const off = speechesMeta[i]?.offset || 0;
      if (off <= byteOffset) idx = i; else break;
    }
    if (idx < 0) return null;
    const start = speechesMeta[idx].offset || 0;
    let end = null;
    for (let j = idx + 1; j < speechesMeta.length; j++) {
      const nextOff = speechesMeta[j]?.offset;
      if (nextOff != null && nextOff > start) { end = nextOff; break; }
    }
    if (end == null) {
      const scene = (metadata?.scenes || []).find((s) => start >= (s.startOffset || 0) && start < (s.endOffset || 0));
      if (scene && scene.endOffset != null) end = scene.endOffset;
    }
    if (end == null || end <= start) {
      const noteEnd = chosenItem?.endOffset;
      end = noteEnd != null && noteEnd > start ? noteEnd : (start + 100);
    }
    return { start, end };
  }, [chosenItem, metadata]);
  const filteredSavedExplanations = (savedExplanations || []).filter((ex) => {
    if (!ex?.meta) return false;
    // Hide explanations associated with suppressed notes
    const exSpeechKey = ex.meta.speechKey;
    if (exSpeechKey && suppressedNotes.has(exSpeechKey)) return false;
    // If there's a note, show explanations that match the note's speech
    // This ensures explanations created when the note is open will show when the note is reopened
    if (chosenItem) {
      let matches = false;
      
      // Get the speech key for the chosenItem (note) - this is more reliable than using currentSpeech
      const noteSpeechKey = getSpeechKeyForItem(chosenItem);
      
      // First try to match by speechKey - most reliable
      if (noteSpeechKey) {
        const exSpeechKey = ex.meta.speechKey;
        if (exSpeechKey && exSpeechKey === noteSpeechKey) {
          matches = true;
        }
      }
      
      // Also try the currentSpeech's speechKey as a fallback (in case getSpeechKeyForItem fails)
      if (!matches && speechKey) {
        const exSpeechKey = ex.meta.speechKey;
        if (exSpeechKey && exSpeechKey === speechKey) {
          matches = true;
        }
      }
      
      // Also check by byte offset range if speech span is available
      if (!matches && noteSpeechSpan) {
        const exByteOffset = ex.meta.byteOffset;
        if (exByteOffset != null && typeof exByteOffset === 'number') {
          const isWithinRange = exByteOffset >= noteSpeechSpan.start && exByteOffset < noteSpeechSpan.end;
          if (isWithinRange) {
            matches = true;
          }
        }
      }
      
      // If we have a note but no matches, exclude this explanation
      if (!matches) {
        return false;
      }
    }
    // Don't show saved explanations that match the currently selected text (they're shown in explanationPanel)
    if (!currentSelectionId) return true;
    // Try multiple ways to match the ID to be more robust
    const len = textEncoder.encode(ex.meta.text || '').length;
    const exId = `${ex.meta.byteOffset}-${len}`;
    // Also check if selectedId matches (passed from parent)
    if (selectedId && selectedId === exId) return false;
    // Check if currentSelectionId matches
    if (exId === currentSelectionId) return false;
    // Also check byteOffset match if text length matches (in case of encoding differences)
    if (ex.meta.byteOffset === contextInfo?.byteOffset && len === textEncoder.encode(contextInfo?.text || '').length) {
      return false;
    }
    return true;
  });
  const selectionByteStart = hasSelectionContext && contextInfo ? (contextInfo.byteOffset ?? null) : null;
  const selectionByteLength = (hasSelectionContext && contextInfo && contextInfo.text) ? textEncoder.encode(contextInfo.text).length : 0;
  const selectionByteEnd = selectionByteStart != null ? selectionByteStart + selectionByteLength : null;
  // Compute speech span for the current selection OR for the note if one is active
  const speechSpan = useMemo(() => {
    let byteOffset = selectionByteStart;
    // If no selection but there's a note, use the note's byte offset
    if (byteOffset == null && chosenItem && (chosenItem.startOffset != null || chosenItem.byteOffset != null)) {
      byteOffset = chosenItem.startOffset ?? chosenItem.byteOffset ?? null;
    }
    if (byteOffset == null) return null;
    const speechesMeta = Array.isArray(metadata?.speeches) ? metadata.speeches : [];
    if (!speechesMeta.length) return null;
    let idx = -1;
    for (let i = 0; i < speechesMeta.length; i++) {
      const off = speechesMeta[i]?.offset || 0;
      if (off <= byteOffset) idx = i; else break;
    }
    if (idx < 0) return null;
    const start = speechesMeta[idx].offset || 0;
    let end = null;
    for (let j = idx + 1; j < speechesMeta.length; j++) {
      const nextOff = speechesMeta[j]?.offset;
      if (nextOff != null && nextOff > start) { end = nextOff; break; }
    }
    if (end == null) {
      const scene = (metadata?.scenes || []).find((s) => start >= (s.startOffset || 0) && start < (s.endOffset || 0));
      if (scene && scene.endOffset != null) end = scene.endOffset;
    }
    if (end == null || end <= start) {
      // If no end found, use selection length or note's end offset
      const noteEnd = chosenItem?.endOffset ?? chosenItem?.byteOffset;
      end = noteEnd != null && noteEnd > start ? noteEnd : (start + (selectionByteLength || 100));
    }
    return { start, end };
  }, [hasSelectionContext, metadata, selectionByteStart, selectionByteLength, chosenItem]);
  const selectionIsWholeSpeech = useMemo(() => {
    if (!speechSpan || selectionByteStart == null || selectionByteEnd == null) return false;
    const tolerance = 4;
    const startDiff = Math.abs(selectionByteStart - speechSpan.start);
    const endDiff = Math.abs(selectionByteEnd - speechSpan.end);
    return startDiff <= tolerance && endDiff <= tolerance;
  }, [speechSpan, selectionByteStart, selectionByteEnd]);
  const selectionPreview = (() => {
    if (!hasSelectionContext || !contextInfo) return null;
    if (selectionIsWholeSpeech) return null;
    const str = (contextInfo.text || '').trim();
    return str ? str : null;
  })();
  const selectionPreviewForChat = (selectionPreview && !hasConversation) ? selectionPreview : null;
  const selectionPreviewForExplanation = (selectionPreview && hasConversation) ? selectionPreview : null;
  const renderSelectionPreview = (preview) => {
    if (!preview) return null;
    return (
      <div
        style={{
          marginBottom: '0.5rem',
          paddingLeft: '1rem',
          borderLeft: '3px solid #e8d8b5',
          fontStyle: 'italic',
          color: '#4a4036',
          whiteSpace: 'pre-wrap',
        }}
      >
        {preview}
      </div>
    );
  };
  const noteModeChatPanel = (() => {
    // Only show noteModeChatPanel when note is expanded and NO text is selected
    // When text is selected, selectionChatPanel will show instead (with instructions)
    // Show whenever note is expanded (instructions, chat, and buttons should be visible)
    if (!(chosenItem && isNoteExpanded && !hasSelectionContext)) return null;
    const it = chosenItem;
    const handleNoteMore = async () => {
      const key = String(it.startOffset || 0);
      // Add placeholder entry immediately to show title and "Thinking..."
      setPreFollowThreads((prev) => {
        const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
        arr.push({ q: 'More detail', a: null, loading: true, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
        return { ...prev, [key]: arr };
      });
      try {
        setPreFollowLoading(true);
        const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
        const endRelB = Math.max(startRelB + 1, (it.endOffset || (it.startOffset || 0) + 1) - sectionStartOffset);
        const startC = bytesToCharOffset(text || '', startRelB);
        const endC = bytesToCharOffset(text || '', endRelB);
        const passage = (text || '').slice(startC, endC);
        const ctx = getContextForOffset(metadata || {}, it.startOffset || 0);
        const existingNote = (it.content || '').trim();
        const q = 'Please expand this into a longer explanation with more detail.';
        const url = getApiUrl('/api/explain');
        // For "More", use the note content as the primary text, not the passage
        // This ensures "More" expands the note, not the speech text
        const data = await fetchWithErrorHandling(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectionText: existingNote || passage, context: { act: ctx.act, scene: ctx.scene, speaker: ctx.speaker, onStage: ctx.onStage }, options: llm?.options, messages: [], mode: 'followup', followup: q, noteText: existingNote })
        });
        const addition = (data?.content || '').trim();
        // Update the placeholder entry with actual response
        setPreFollowThreads((prev) => {
          const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
          const lastIdx = arr.length - 1;
          if (lastIdx >= 0 && arr[lastIdx].loading) {
            arr[lastIdx] = { q: 'More detail', a: addition, loading: false, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') };
          } else {
            arr.push({ q: 'More detail', a: addition, loading: false, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
          }
          return { ...prev, [key]: arr };
        });
      } catch (e) {
        // Update placeholder with error
        setPreFollowThreads((prev) => {
          const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
          const lastIdx = arr.length - 1;
          if (lastIdx >= 0 && arr[lastIdx].loading) {
            arr[lastIdx] = { q: 'More detail', a: `Error: ${String(e.message || e)}`, loading: false, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') };
          } else {
            arr.push({ q: 'More detail', a: `Error: ${String(e.message || e)}`, loading: false, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
          }
          return { ...prev, [key]: arr };
        });
      } finally {
        setPreFollowLoading(false);
      }
    };
    const handleNoteFollowup = async (followupText) => {
      const key = String(it.startOffset || 0);
      // Add placeholder entry immediately to show title and "Thinking..."
      setPreFollowThreads((prev) => {
        const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
        arr.push({ q: followupText, a: null, loading: true, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
        return { ...prev, [key]: arr };
      });
      try {
        setPreFollowLoading(true);
        const startRelB = Math.max(0, (it.startOffset || 0) - sectionStartOffset);
        const endRelB = Math.max(startRelB + 1, (it.endOffset || (it.startOffset || 0) + 1) - sectionStartOffset);
        const startC = bytesToCharOffset(text || '', startRelB);
        const endC = bytesToCharOffset(text || '', endRelB);
        const passage = (text || '').slice(startC, endC);
        const ctx = getContextForOffset(metadata || {}, it.startOffset || 0);
        const url = getApiUrl('/api/explain');
        const existingNote = (it.content || '').trim();
        const data = await fetchWithErrorHandling(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectionText: passage, context: { act: ctx.act, scene: ctx.scene, speaker: ctx.speaker, onStage: ctx.onStage }, options: llm?.options, messages: [], mode: 'followup', followup: followupText, noteText: existingNote })
        });
        const addition = (data?.content || '').trim();
        // Update the placeholder entry with actual response
        setPreFollowThreads((prev) => {
          const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
          const lastIdx = arr.length - 1;
          if (lastIdx >= 0 && arr[lastIdx].loading && arr[lastIdx].q === followupText) {
            arr[lastIdx] = { q: followupText, a: addition, loading: false, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') };
          } else {
            arr.push({ q: followupText, a: addition, loading: false, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
          }
          return { ...prev, [key]: arr };
        });
      } catch (e) {
        // Update placeholder with error
        setPreFollowThreads((prev) => {
          const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
          const lastIdx = arr.length - 1;
          if (lastIdx >= 0 && arr[lastIdx].loading && arr[lastIdx].q === followupText) {
            arr[lastIdx] = { q: followupText, a: `Error: ${String(e.message || e)}`, loading: false, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') };
          } else {
            arr.push({ q: followupText, a: `Error: ${String(e.message || e)}`, loading: false, model: (llm?.options?.model || ''), provider: (llm?.options?.provider || '') });
          }
          return { ...prev, [key]: arr };
        });
      } finally {
        setPreFollowLoading(false);
      }
    };
    const threadKey = chosenItem ? String(chosenItem.startOffset || 0) : '';
    const thread = preFollowThreads[threadKey] || [];
    return (
      <div style={{ marginTop: '0.5rem', paddingTop: '0.25rem', borderTop: '1px solid #eee' }}>
        <TextSelectionChat
          contextInfo={contextInfo}
          llm={{ ...llm, loading: preFollowLoading }}
          onRequestFocus={() => {}}
          noteMode
          onNoteMore={handleNoteMore}
          onNoteFollowup={handleNoteFollowup}
        />
        {/* Display "More" and follow-up responses below the chat UI */}
        {(() => {
          if (!thread.length && !preFollowLoading) return null;
          return (
            <div style={{ marginTop: '0.5rem', display: 'block', width: '100%' }}>
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
                const isMore = m.q === 'More detail' || m.q === 'More';
                return (
                  <div key={`more-${idx}`} style={{ marginBottom: '0.5rem', position: 'relative', paddingRight: '32px' }}>
                    <button
                      type="button"
                      className="closeBtn"
                      onClick={() => {
                        setPreFollowThreads((prev) => {
                          const arr = Array.isArray(prev[threadKey]) ? prev[threadKey].slice() : [];
                          const updated = arr.filter((_, i) => i !== idx);
                          return { ...prev, [threadKey]: updated };
                        });
                      }}
                      aria-label="Delete response"
                      style={{ position: 'absolute', right: 0, top: 0 }}
                    >
                      🗑️
                    </button>
                    {isMore ? (
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>More</div>
                    ) : m.q ? (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Chat Prompt</div>
                        <div
                          style={{
                            marginBottom: '0.5rem',
                            paddingLeft: '1rem',
                            borderLeft: '3px solid #e8d8b5',
                            fontStyle: 'italic',
                            color: '#4a4036',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {m.q}
                        </div>
                      </>
                    ) : null}
                    {m.loading ? (
                      <div style={{ color: '#6b5f53' }}>Thinking…</div>
                    ) : (
                      <>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.a}</div>
                        {attribution ? (
                          <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 2 }}>{attribution}</div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  })();
  const selectionChatPanel = (hasSelectionContext && isNoteExpanded) ? (
    <div style={{ marginTop: chosenItem ? '0.5rem' : '0.25rem', paddingTop: chosenItem ? '0.25rem' : '0', borderTop: chosenItem ? '1px solid #eee' : 'none' }}>
      {/* Show instructions when note is expanded */}
      {chosenItem && isNoteExpanded && (
        <div style={{ fontSize: '0.9em', color: '#6b5f53', fontStyle: 'italic', marginBottom: '0.5rem' }}>
          You can select text in the play to ask about it, or ask a follow-up about this note below.
        </div>
      )}
      <TextSelectionChat
        contextInfo={contextInfo}
        llm={llm}
        onRequestFocus={() => {
          if (selectedRange && contextInfo && onRequestFocus) {
            const len = textEncoder.encode(contextInfo.text || '').length;
            const id = `${contextInfo.byteOffset}-${len}`;
            onRequestFocus({ sectionIndex, id });
          }
        }}
        onLength={llm?.onLength}
      />
      {/* Display selection preview and "More" responses below the chat UI */}
      {(() => {
        const moreThreads = llm?.conversation?.moreThreads || [];
        const followupThreads = llm?.conversation?.followupThreads || [];
        // Show "Thinking..." if loading and we already have an explanation
        // We can't easily distinguish between "More" and follow-up loading, so we'll show a generic indicator
        // that will be replaced by the actual response when it arrives
        const isLoadingFollowup = llm?.loading && conversationLast && conversationLast !== 'AI is thinking…';
        // Also check for preFollowThreads from note mode (when a note is active and text is selected)
        let noteThreads = [];
        if (chosenItem && sectionHasSelectModeNote) {
          const threadKey = String(chosenItem.startOffset || 0);
          noteThreads = preFollowThreads[threadKey] || [];
        }
        // Show "Thinking..." for initial selection loading below chat UI
        const showInitialThinking = isThinking && !conversationLast;
        const showSelectionPreview = selectionPreviewForChat;
        if (!moreThreads.length && !followupThreads.length && !noteThreads.length && !isLoadingFollowup && !preFollowLoading && !showInitialThinking && !showSelectionPreview) return null;
        return (
          <div style={{ marginTop: '0.5rem', display: 'block', width: '100%' }}>
            {/* Show selection preview below chat UI */}
            {showSelectionPreview && renderSelectionPreview(selectionPreviewForChat)}
            {/* Show "Selected Text" title and "Thinking..." for initial selection loading */}
            {showInitialThinking && (
              <div style={{ marginTop: showSelectionPreview ? '0.5rem' : '0', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Selected Text</div>
                <div style={{ color: '#6b5f53' }}>Thinking…</div>
              </div>
            )}
            {moreThreads.map((m, idx) => {
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
                <div key={`more-${idx}`} style={{ marginBottom: '0.5rem', position: 'relative', paddingRight: '32px' }}>
                  <button
                    type="button"
                    className="closeBtn"
                    onClick={() => {
                      if (selectionId && conversations[selectionId]) {
                        const updatedMoreThreads = (conversations[selectionId].moreThreads || []).filter((_, i) => i !== idx);
                        setConversations({
                          ...conversations,
                          [selectionId]: {
                            ...conversations[selectionId],
                            moreThreads: updatedMoreThreads
                          }
                        });
                      }
                    }}
                    aria-label="Delete More response"
                    style={{ position: 'absolute', right: 0, top: 0 }}
                  >
                    🗑️
                  </button>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>More</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.a}</div>
                  {attribution ? (
                    <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 2 }}>{attribution}</div>
                  ) : null}
                </div>
              );
            })}
            {/* Display follow-up threads for text selections */}
            {followupThreads.map((m, idx) => {
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
                <div key={`followup-${idx}`} style={{ marginTop: (moreThreads.length > 0 || idx > 0) ? '0.5rem' : '0', marginBottom: '0.5rem', position: 'relative', paddingRight: '32px' }}>
                  <button
                    type="button"
                    className="closeBtn"
                    onClick={() => {
                      if (selectionId && conversations[selectionId]) {
                        const updatedFollowupThreads = (conversations[selectionId].followupThreads || []).filter((_, i) => i !== idx);
                        setConversations({
                          ...conversations,
                          [selectionId]: {
                            ...conversations[selectionId],
                            followupThreads: updatedFollowupThreads
                          }
                        });
                      }
                    }}
                    aria-label="Delete follow-up response"
                    style={{ position: 'absolute', right: 0, top: 0 }}
                  >
                    🗑️
                  </button>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Chat Prompt</div>
                  <div
                    style={{
                      marginBottom: '0.5rem',
                      paddingLeft: '1rem',
                      borderLeft: '3px solid #e8d8b5',
                      fontStyle: 'italic',
                      color: '#4a4036',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.q}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.a}</div>
                  {attribution ? (
                    <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 2 }}>{attribution}</div>
                  ) : null}
                </div>
              );
            })}
            {/* Show "Thinking..." for follow-up or More requests when loading */}
            {isLoadingFollowup && !moreThreads.length && !followupThreads.length && (
              <div style={{ marginTop: (moreThreads.length > 0 || followupThreads.length > 0) ? '0.5rem' : '0' }}>
                <div style={{ color: '#6b5f53' }}>Thinking…</div>
              </div>
            )}
            {/* Display note threads (from preFollowThreads) when a note is active and text is selected */}
            {noteThreads.map((m, idx) => {
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
              const isMore = m.q === 'More detail' || m.q === 'More';
              const threadKey = chosenItem ? String(chosenItem.startOffset || 0) : '';
              return (
                <div key={`note-thread-${idx}`} style={{ marginTop: (moreThreads.length > 0 || idx > 0) ? '0.5rem' : '0', marginBottom: '0.5rem', position: 'relative', paddingRight: '32px' }}>
                  <button
                    type="button"
                    className="closeBtn"
                    onClick={() => {
                      if (threadKey) {
                        setPreFollowThreads((prev) => {
                          const arr = Array.isArray(prev[threadKey]) ? prev[threadKey].slice() : [];
                          const updated = arr.filter((_, i) => i !== idx);
                          return { ...prev, [threadKey]: updated };
                        });
                      }
                    }}
                    aria-label="Delete response"
                    style={{ position: 'absolute', right: 0, top: 0 }}
                  >
                    🗑️
                  </button>
                  {isMore ? (
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>More</div>
                  ) : m.q ? (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Chat Prompt</div>
                      <div
                        style={{
                          marginBottom: '0.5rem',
                          paddingLeft: '1rem',
                          borderLeft: '3px solid #e8d8b5',
                          fontStyle: 'italic',
                          color: '#4a4036',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {m.q}
                      </div>
                    </>
                  ) : null}
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.a}</div>
                  {attribution ? (
                    <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 2 }}>{attribution}</div>
                  ) : null}
                </div>
              );
            })}
            {preFollowLoading && chosenItem && sectionHasSelectModeNote && (
              <div style={{ marginTop: (moreThreads.length > 0 || noteThreads.length > 0) ? '0.5rem' : '0' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>More</div>
                <div style={{ color: '#6b5f53' }}>Thinking…</div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  ) : null;
  // Explanation panel always appears after chat inputs (which appear after the note)
  // Hide explanations when the note is suppressed (closed) - check if current speech note is suppressed
  const hasSuppressedNote = currentSpeechNoteSuppressed || (chosenItem && (isSuppressed || isForcedSuppressed));
  const explanationPanel = (hasConversation && !hasSuppressedNote && isNoteExpanded) ? (
    <div style={{ marginTop: (noteModeChatPanel || selectionChatPanel) ? '0.5rem' : (chosenItem ? '0.5rem' : '0.25rem'), paddingTop: '0.25rem', paddingRight: '32px', borderTop: '1px solid #eee', position: 'relative' }}>
      <button 
        type="button" 
        className="closeBtn" 
        onClick={() => {
          if (llm?.onDeleteCurrent) {
            llm.onDeleteCurrent();
          }
          onSelectRange?.(null);
          // Clear browser selection to prevent re-triggering
          if (typeof window !== 'undefined' && window.getSelection) {
            try {
              const sel = window.getSelection();
              if (sel) sel.removeAllRanges();
            } catch {}
          }
        }} 
        aria-label="Delete explanation" 
        style={{ position: 'absolute', right: 0, top: 0 }}
      >
        🗑️
      </button>
      {/* Title for selected text explanation */}
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Selected Text</div>
      {renderSelectionPreview(selectionPreviewForExplanation)}
      {isThinking ? (
        <div style={{ color: '#6b5f53' }}>Thinking…</div>
      ) : (
      <div style={{ whiteSpace: 'pre-wrap' }}>{conversationLast}</div>
      )}
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
    </div>
  ) : null;
  const savedExplanationsPanel = (filteredSavedExplanations.length > 0 && !hasSuppressedNote && isNoteExpanded) ? (
    <div style={{ marginTop: (explanationPanel || selectionChatPanel || noteModeChatPanel) ? '0.75rem' : '0.5rem' }}>
      {filteredSavedExplanations.map((ex, i) => {
        const meta = ex?.meta || {};
        const passageText = (() => {
          const direct = (meta.text || '').trim();
          if (direct) return direct;
          const start = Number.isFinite(meta.start) ? meta.start : null;
          const end = Number.isFinite(meta.end) ? meta.end : null;
          if (start != null && end != null && end > start) {
            return (text || '').slice(start, end).trim();
          }
          return '';
        })();
        return (
          <ExplanationCard
            key={`ex-${i}-${meta.byteOffset || i}`}
            passage={passageText}
            content={ex?.last || ''}
            meta={meta}
            options={llm?.options}
            onDelete={() => {
              const len = textEncoder.encode(meta.text || passageText || '').length;
              const id = `${meta.byteOffset}-${len}`;
              onDeleteSaved?.(id);
            }}
            onLocate={() => {
              if (meta.start != null && meta.end != null) {
                onSelectRange({ start: meta.start, end: meta.end });
                const len = textEncoder.encode(meta.text || passageText || '').length;
                const id = `${meta.byteOffset}-${len}`;
                onRequestFocus?.({ sectionIndex, id });
              }
            }}
            onCopy={() => {
              if (meta.byteOffset != null) {
                const len = textEncoder.encode(meta.text || passageText || '').length;
                const url = buildSelectionLink(meta.byteOffset, len);
                navigator.clipboard?.writeText(url);
              }
            }}
          />
        );
      })}
    </div>
  ) : null;

  // Show preFollowThreads for suppressed notes (when note is collapsed but threads exist)
  const suppressedNoteThreadsPanel = (() => {
    // Find suppressed notes that have threads
    if (!suppressedNotes.size) return null;
    const suppressedThreads = [];
    for (const sk of suppressedNotes) {
      // Find the note item for this speech key
      const noteItem = noteBySpeechKey.get(String(sk));
      if (!noteItem) continue;
      const threadKey = String(noteItem.startOffset || 0);
      const threads = preFollowThreads[threadKey] || [];
      if (threads.length > 0) {
        suppressedThreads.push({ threadKey, threads, noteItem });
      }
    }
    if (suppressedThreads.length === 0) return null;
    // Show all suppressed note threads
    return (
      <div style={{ marginTop: (explanationPanel || selectionChatPanel || noteModeChatPanel || savedExplanationsPanel) ? '0.75rem' : '0.5rem' }}>
        {suppressedThreads.map(({ threadKey, threads, noteItem }) =>
          threads.map((m, idx) => {
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
            const isMore = m.q === 'More detail' || m.q === 'More';
            return (
              <div key={`suppressed-${threadKey}-${idx}`} style={{ marginBottom: '0.5rem', position: 'relative', paddingRight: '32px' }}>
                <button
                  type="button"
                  className="closeBtn"
                  onClick={() => {
                    setPreFollowThreads((prev) => {
                      const arr = Array.isArray(prev[threadKey]) ? prev[threadKey].slice() : [];
                      const updated = arr.filter((_, i) => i !== idx);
                      return { ...prev, [threadKey]: updated };
                    });
                  }}
                  aria-label="Delete response"
                  style={{ position: 'absolute', right: 0, top: 0 }}
                >
                  🗑️
                </button>
                {isMore ? (
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>More</div>
                ) : m.q ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Chat Prompt</div>
                    <div
                      style={{
                        marginBottom: '0.5rem',
                        paddingLeft: '1rem',
                        borderLeft: '3px solid #e8d8b5',
                        fontStyle: 'italic',
                        color: '#4a4036',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {m.q}
                    </div>
                  </>
                ) : null}
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.a}</div>
                {attribution ? (
                  <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 2 }}>{attribution}</div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    );
  })();

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
    // If not in select mode and a note exists for this speech, clicking toggles the note visibility
    const noteVisible = !!chosenItem;
    // Get the speech key from the click position
    // Always resolve from click Y using anchors for accuracy
    let keyToToggle = null;
    let hasNote = false;
    try {
      const anchors = sectionRef?.current?.querySelectorAll?.(':scope .speechAnchor') || [];
      if (anchors.length) {
        let best = { idx: 0, d: Infinity };
        const y = e?.clientY || 0;
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
    // Fallback: if anchors didn't work, try speechKey
    if (!hasNote && speechKey && noteBySpeechKey) {
      keyToToggle = speechKey;
      hasNote = !!(noteBySpeechKey.get && noteBySpeechKey.get(keyToToggle));
    }
    if (!mobileSelectMode && hasNote) {
      const sk = keyToToggle;
      if (!sk) return;
      // Check if this note is expanded
      const noteIsExpanded = expandedNotes && expandedNotes.has(sk);
      if (noteIsExpanded) {
        // When note is expanded, clicking the speech allows text selection (fall through to selection logic)
        // Don't return - let the selection handler process the click
      } else {
        // When note is collapsed, clicking the speech toggles visibility
        // Check if this note is currently visible (is it the chosenItem?)
        const noteItem = noteBySpeechKey.get(sk);
        const isCurrentlyVisible = chosenItem && chosenItemSpeechKey === sk;
        if (suppressedNotes.has(sk) || !isCurrentlyVisible) {
          // Note is hidden (either suppressed or not visible due to threshold)
          // Show it by removing suppression and forcing it
        if (suppressedNotes.has(sk)) {
          setSuppressedNotes((prev) => {
            const next = new Set(prev);
            next.delete(sk);
            return next;
          });
        }
          // Force it to be visible
          if (onToggleForced) {
            onToggleForced(sk, sectionIndex);
          }
          // Don't auto-expand - show in collapsed state per spec flow
          // Text selection mode will be enabled when user expands the note (via onToggleNoteExpanded)
        } else {
          // Note is visible but collapsed, hide it by suppressing
          setSuppressedNotes((prev) => {
            const next = new Set(prev);
            next.add(sk);
            return next;
          });
          // Remove from forcedNotes if it was forced
          if (onToggleForced && forcedSet.has(sk)) {
            onToggleForced(sk, sectionIndex);
          }
          // Clear select mode when closing note
          if (onToggleNoteSelectMode && noteInSelectMode === sk) {
            onToggleNoteSelectMode(null);
          }
          // Clear expanded state when closing note (via callback if available)
          if (onToggleNoteExpanded && expandedNotes && expandedNotes.has(sk)) {
            onToggleNoteExpanded(sk); // This will toggle it off if it's on
        }
      }
      // Clear any selection to prevent triggering LLM query
      if (typeof window !== 'undefined' && window.getSelection) {
        try {
          const sel = window.getSelection();
          if (sel) sel.removeAllRanges();
        } catch {}
      }
      // Suppress auto-explain for this toggle click
      if (typeof suppressNextAutoExplain === 'function') suppressNextAutoExplain();
      else if (suppressNextAutoExplain && typeof suppressNextAutoExplain === 'object') suppressNextAutoExplain.current = true;
      return;
      }
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
      // If user dragged, honor the exact selection (no expansion)
    if (end > start) {
        isManualDragSelection.current = true;
      selPendingRef.current = true;
        // Clear any native browser selection to prevent interference
        try {
          if (typeof window !== 'undefined' && window.getSelection) {
            const nativeSel = window.getSelection();
            if (nativeSel) {
              const nativeRange = nativeSel.rangeCount > 0 ? nativeSel.getRangeAt(0) : null;
              if (nativeRange) {
                const nativeOffsets = getOffsetsWithin(container, nativeRange);
                // If native selection differs from what we calculated, clear it
                if (nativeOffsets.start !== start || nativeOffsets.end !== end) {
                  nativeSel.removeAllRanges();
                }
              }
            }
          }
        } catch {}
      onSelectRange?.({ start, end });
        // Reset flag after a delay
        setTimeout(() => { isManualDragSelection.current = false; }, 1000);
      return;
    }
    // Otherwise, expand single-click caret to the surrounding sentence
    const idx = start;
    const sent = expandToSentence(text || '', idx);
    if (sent) {
      selPendingRef.current = true;
      onSelectRange?.({ start: sent.start, end: sent.end });
    }
  };

  // Clean up any pending timers on unmount
  useEffect(() => { return () => { clearTimeout(selDebounceRef.current); }; }, []);

  // Listen for native text selection (including mobile fallback when custom touch handling is inactive)
  useEffect(() => {
    // Track mouse state to prevent expansion during drag
    const handleMouseDown = () => {
      isMouseDown.current = true;
    };
    const handleMouseUp = () => {
      // Small delay to ensure selection is finalized
      setTimeout(() => {
        isMouseDown.current = false;
      }, 100);
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    const handleSelectionChange = () => {
      // Immediately capture the selection range (don't wait for debounce)
      // This ensures we get it before the system menu potentially interferes
      const container = preRef.current;
      if (!container || typeof window === 'undefined' || !window.getSelection) return;
      
      // Don't process selection changes while mouse is down (user is dragging)
      if (isMouseDown.current) {
        return;
      }
      
      const sel = window.getSelection();
      if (mobileSelectMode && touchActiveRef.current) return;
      if (!sel || sel.rangeCount === 0) {
        // Selection cleared - reset tracking
        lastSelectionStringRef.current = '';
        return;
      }
      
      // If we're processing a selection (from mouse or touch), don't override it with native selection
      // This prevents the browser's native selection from overriding a manual drag selection
      if (selPendingRef.current || isManualDragSelection.current) {
        return;
      }
      
      const range = sel.getRangeAt(0);
      // Only process selections within this section's text container
      if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
        lastSelectionStringRef.current = '';
        return;
      }
      
      const { start, end } = getOffsetsWithin(container, range);
      // Only trigger if there's an actual selection (not just a caret)
      if (end <= start) {
        lastSelectionStringRef.current = '';
        return;
      }
      
      // Create a unique string identifier for this selection to avoid duplicate triggers
      const selectionString = `${start}-${end}`;
      if (selectionString === lastSelectionStringRef.current) {
        // Same selection, don't trigger again
        return;
      }
      
      // Clear any pending timeout
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
        selectionTimeoutRef.current = null;
      }
      
      // Wait a moment to ensure selection is stable (especially important on mobile)
      // Then process the selection
      selectionTimeoutRef.current = setTimeout(() => {
        // Don't override a manual drag selection
        if (isManualDragSelection.current) {
          selectionTimeoutRef.current = null;
          return;
        }
        
        // Double-check the selection is still valid
        const currentSel = window.getSelection();
        if (!currentSel || currentSel.rangeCount === 0) return;
        const currentRange = currentSel.getRangeAt(0);
        if (!container.contains(currentRange.startContainer) || !container.contains(currentRange.endContainer)) return;
        
        const { start: checkStart, end: checkEnd } = getOffsetsWithin(container, currentRange);
        if (checkEnd <= checkStart) return;
        const checkString = `${checkStart}-${checkEnd}`;
        
        // Only proceed if this is still the same selection we saw earlier
        if (checkString !== selectionString) return;
        
        // Mark that we're processing this selection
        selPendingRef.current = true;
        lastSelectionStringRef.current = selectionString;
        
        // Call onSelectRange to trigger explanation
        onSelectRange?.({ start, end });
        
        // Reset after a delay to allow the selection to be processed
        setTimeout(() => {
          selPendingRef.current = false;
        }, 500);
        
        selectionTimeoutRef.current = null;
      }, 300); // Wait 300ms for selection to stabilize (system menu appears ~200ms after selection)
    };

    // Also check for selection when user clicks/taps (after menu might be dismissed)
    // This is a fallback in case selectionchange didn't catch it
    const handleClick = (e) => {
      // If we're already processing a selection or user manually dragged, don't override it
      if (selPendingRef.current || isManualDragSelection.current) return;
      
      // Only check if there's actually a selection (not just a click)
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) return;
      
      const range = sel.getRangeAt(0);
      // Only process if clicking within our section
      const container = preRef.current;
      if (!container || !container.contains(e.target) && !container.contains(range.startContainer)) return;
      
      // Small delay to let any selection settle
      setTimeout(() => {
        if (selPendingRef.current) return; // Already processing
        
        if (!container || typeof window === 'undefined' || !window.getSelection) return;
        
        const checkSel = window.getSelection();
        if (!checkSel || checkSel.rangeCount === 0) return;
        
        const checkRange = checkSel.getRangeAt(0);
        if (!container.contains(checkRange.startContainer) || !container.contains(checkRange.endContainer)) return;
        
        const { start, end } = getOffsetsWithin(container, checkRange);
        if (end <= start) return;
        
        const selectionString = `${start}-${end}`;
        if (selectionString === lastSelectionStringRef.current) return; // Already processed
        
        // This is a new selection, process it
        selPendingRef.current = true;
        lastSelectionStringRef.current = selectionString;
        onSelectRange?.({ start, end });
        setTimeout(() => { selPendingRef.current = false; }, 500);
      }, 150);
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('selectionchange', handleSelectionChange);
      // Listen for clicks as a fallback (user might tap to dismiss menu)
      document.addEventListener('click', handleClick, true);
      // Also listen for pointerdown as another fallback
      document.addEventListener('pointerdown', handleClick, true);
    }

    return () => {
      if (typeof document !== 'undefined') {
        if (typeof window !== 'undefined') {
          window.removeEventListener('mousedown', handleMouseDown);
          window.removeEventListener('mouseup', handleMouseUp);
        }
        document.removeEventListener('selectionchange', handleSelectionChange);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('pointerdown', handleClick, true);
      }
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
        selectionTimeoutRef.current = null;
      }
      if (selDebounceRef.current) {
        clearTimeout(selDebounceRef.current);
      }
    };
  }, [mobileSelectMode, onSelectRange, text]);

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
      selPendingRef.current = false;
      lastSelectionStringRef.current = '';
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
        }
      } catch {}
    }
  };
  const onTouchEnd = (e) => {
    // Only prevent default if we're in custom selection mode or if we handled the touch
    if (mobileSelectMode) {
    try { e.preventDefault(); e.stopPropagation(); } catch {}
    }
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

        // Prefer the actual native selection if the browser created one
        if (container && typeof window !== 'undefined') {
          try {
            const nativeSel = window.getSelection?.();
            if (nativeSel && nativeSel.rangeCount > 0) {
              const nativeRange = nativeSel.getRangeAt(0);
              if (container.contains(nativeRange.startContainer) && container.contains(nativeRange.endContainer)) {
                const off = getOffsetsWithin(container, nativeRange);
                if (off.end > off.start) {
                  start = off.start;
                  end = off.end;
                }
              }
            }
          } catch {}
        }

        // Fall back to our manual tracking if the native selection was unavailable/collapsed
        if (start == null || end == null || end <= start) {
        if (Number.isFinite(startChar) && Number.isFinite(endChar) && movedRef.current) {
            // User dragged - use exact selection, no expansion
            start = Math.max(0, Math.min(startChar, endChar));
            end = Math.max(start, Math.max(startChar, endChar));
          } else if (Number.isFinite(startChar) && Number.isFinite(endChar)) {
            // We have both start and end, even if movedRef is false (might be timing issue)
            // If they're different, user dragged, so use exact selection
            if (startChar !== endChar) {
          start = Math.max(0, Math.min(startChar, endChar));
          end = Math.max(start, Math.max(startChar, endChar));
        } else {
              // Single click - expand to sentence
              const idx = startChar;
              const sent = expandToSentence(text || '', idx);
              if (sent) { start = sent.start; end = sent.end; }
            }
          } else {
            // Only one coordinate or neither - single click, expand to sentence
          const idx = Number.isFinite(endChar) ? endChar : (Number.isFinite(startChar) ? startChar : null);
          if (idx != null) {
            const sent = expandToSentence(text || '', idx);
            if (sent) { start = sent.start; end = sent.end; }
            }
          }
        }
        if (start != null && end != null && end > start) {
          // Mark as manual drag selection if user actually dragged (not a single tap)
          if (movedRef.current || (Number.isFinite(startChar) && Number.isFinite(endChar) && startChar !== endChar)) {
            isManualDragSelection.current = true;
            setTimeout(() => { isManualDragSelection.current = false; }, 1000);
          }
          selPendingRef.current = true;
          lastSelectionStringRef.current = `${start}-${end}`;
          onSelectRange?.({ start, end });
          // Don't exit text selection mode - keep it active so user can select again
          // (same behavior as desktop)
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
        // User moved - check if they made a text selection
        // Wait a moment for the native selection to be established
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.getSelection) {
            try {
              const container = preRef.current;
              if (!container) return;
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0 && !selPendingRef.current) {
                const range = sel.getRangeAt(0);
                // Only process selections within this section's text container
                if (container.contains(range.startContainer) && container.contains(range.endContainer)) {
                  const { start, end } = getOffsetsWithin(container, range);
                  // If there's an actual selection (not just a caret), trigger explanation
                  if (end > start) {
                    selPendingRef.current = true;
                    onSelectRange?.({ start, end });
                    setTimeout(() => { selPendingRef.current = false; }, 500);
                  }
                }
              }
            } catch {}
          }
        }, 100);
        skipNextMouseUpRef.current = true;
        touchActiveRef.current = false;
        setTimeout(() => { movedRef.current = false; }, 80);
        return;
      }
    } catch {}
    // Single tap: toggle note visibility (reveal/hide)
    // Always resolve from click Y using anchors for accuracy
    let keyToToggle = null;
    let hasNote = false;
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
    // Fallback: if anchors didn't work, try speechKey
    if (!hasNote && speechKey && noteBySpeechKey) {
      keyToToggle = speechKey;
      hasNote = !!(noteBySpeechKey.get && noteBySpeechKey.get(keyToToggle));
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
            const it = noteBySpeechKey.get(`${sp.act}|${sp.scene}|${sp.speechIndex}`);
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
      const wasForced = forcedSet.has(keyToToggle);
      // Toggle forced state
      if (onToggleForced) onToggleForced(keyToToggle, sectionIndex);
      if (wasForced) {
        setSuppressedNotes((prev) => {
          const next = new Set(prev);
          next.add(keyToToggle);
          return next;
        });
        if (onDeleteSpeech) onDeleteSpeech(keyToToggle);
        if (Array.isArray(filteredSavedExplanations) && filteredSavedExplanations.length) {
          const enc = new TextEncoder();
          for (const ex of filteredSavedExplanations) {
            const meta = ex?.meta;
            if (!meta) continue;
            const exKey = meta.speechKey;
            const matches = exKey ? exKey === keyToToggle : meta.sectionIndex === sectionIndex;
            if (!matches) continue;
            const len = enc.encode(meta.text || '').length;
            onDeleteSaved?.(`${meta.byteOffset}-${len}`);
          }
        }
        llm?.onDeleteCurrent?.();
      } else {
        // Immediately bring the aside into view; no delay
        scrollAsideIntoView();
      }
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

  useEffect(() => {
    if (!selPendingRef.current || !selectedRange) return;
    selPendingRef.current = false;
    requestAnimationFrame(() => {
      const el = preRef.current?.querySelector('.selected');
      if (!el) return;
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 900);
    });
  }, [selectedRange?.start, selectedRange?.end, selectedRange, preRef]);

  // Memoize rendered text to avoid recalculating on unnecessary re-renders
  const renderedText = useMemo(() => {
    return renderWithSelectionAndHighlights(text, query, selectedRange, matchRefs, selectedId);
  }, [text, query, selectedRange?.start, selectedRange?.end, selectedId, matchRefs]);

  // hasAside is recomputed just before render using visibility-aware lists

  // Check if this section has any notes to enable hover effects
  const sectionHasNotes = useMemo(() => {
    if (!noteBySpeechKey || !speeches || speeches.length === 0) return false;
    return speeches.some(sp => {
      const spKey = `${sp.act}|${sp.scene}|${sp.speechIndex}`;
      return noteBySpeechKey.has(spKey);
    });
  }, [noteBySpeechKey, speeches]);

  // Check if the current note in this section is visible/open (not suppressed)
  const sectionNoteIsOpen = useMemo(() => {
    if (!chosenItem || !speeches) return false;
    // Check if there's a visible note (chosenItem exists and is not suppressed)
    if (noteIsSuppressed) return false;
    // Check if the chosen item's speech is in this section
    const noteSpeechKey = chosenItemSpeechKey;
    if (!noteSpeechKey) return false;
    return speeches.some(sp => {
      const spKey = `${sp.act}|${sp.scene}|${sp.speechIndex}`;
      return spKey === noteSpeechKey;
    });
  }, [chosenItem, chosenItemSpeechKey, speeches, noteIsSuppressed]);

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
          data-has-notes={sectionHasNotes ? 'true' : 'false'}
          data-note-open={sectionNoteIsOpen ? 'true' : 'false'}
          className={sectionHasNotes ? 'hasNotes' : ''}
          style={{ 
            cursor: (isTouchDevice && mobileSelectMode) ? 'text' : (sectionHasNotes ? 'pointer' : 'default'),
            // Subtle visual indicator for text selection mode on the text area
            // Only show if this section contains the note that's in select mode
            border: mobileSelectMode ? '1px solid #c9c0b8' : 'none',
            borderRadius: mobileSelectMode ? '2px' : '0',
            // Don't set backgroundColor inline - let CSS hover handle it
            ...(mobileSelectMode ? { backgroundColor: '#faf9f7' } : {}),
            transition: 'all 0.2s ease',
            userSelect: 'text',  // Always allow text selection on mobile
            WebkitUserSelect: 'text',  // Always allow text selection on mobile
            WebkitTouchCallout: 'default',  // Show default callout menu
            WebkitTapHighlightColor: 'rgba(0,0,0,0.1)'  // Subtle tap highlight
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
                // Don't render empty note boxes
                const noteContent = (it.content || '').trim();
                if (!noteContent) return null;
                // Get the speech key for this specific note item
                const itemSpeechKey = getSpeechKeyForItem(it);
                const isExpanded = itemSpeechKey && expandedNotes.has(itemSpeechKey);
                return (
                  <div key={`pc-${autoIdx}-${it.startOffset || autoIdx}`} style={{ paddingRight: '32px', paddingTop: '6px', borderBottom: '1px solid #eee', position: 'relative' }}>
                    <div 
                      className="noteContent" 
                      style={{ 
                        whiteSpace: 'pre-wrap', 
                        cursor: 'pointer', 
                        userSelect: 'text',
                        position: 'relative',
                        paddingRight: '1.5rem'
                      }} 
                      onClick={(e)=>{ 
                        e.stopPropagation(); 
                        e.preventDefault();
                        // Toggle expanded/collapsed state
                        if (itemSpeechKey && onToggleNoteExpanded) {
                          onToggleNoteExpanded(itemSpeechKey);
                        }
                      }} 
                      title={isExpanded ? "Click to collapse note" : "Click to expand note"}>
                      {noteContent}
                      <span 
                        className="noteToggleIndicator"
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          fontSize: '0.75em',
                          color: '#9b8f82',
                          opacity: 0,
                          transition: 'opacity 0.2s ease',
                          pointerEvents: 'none'
                        }}
                        aria-hidden="true"
                      >
                        {isExpanded ? '▼' : '▶'}
                      </span>
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
                  </div>
                );
              })()}
            </div>
          ) : null}
          {/* Chat inputs always appear right after the note */}
          {noteModeChatPanel}
          {selectionChatPanel}
          {/* Explanations appear after chat inputs */}
          {explanationPanel}
          {savedExplanationsPanel}
          {/* Show threads for suppressed notes (when note is collapsed) */}
          {suppressedNoteThreadsPanel}
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
  if (!text || index < 0 || index > text.length) return null;
  const len = text.length;
  let start = index;
  let end = index;

  // Move start left to previous sentence ender (.!?;)
  // But stop if we encounter a speaker name (all caps followed by period)
  // Optimize: search backwards from index only
  let foundStart = false;
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === ';') {
      // Check if this might be a speaker name (all caps followed by period)
      // Look backwards to see if the text before the period is all caps
      let j = i - 1;
      let isAllCaps = true;
      let hasNonWhitespace = false;
      let foundNewline = false;
      // Check if the text before the period is all caps (allow spaces, apostrophes, hyphens)
      while (j >= 0 && j >= i - 50) { // limit search to avoid scanning too far
        const prevCh = text[j];
        if (prevCh === '\n' || prevCh === '\r') {
          foundNewline = true;
          break; // Stop at newline - if all caps before, it's likely a speaker name
        }
        if (prevCh === ' ' || prevCh === '\t' || prevCh === "'" || prevCh === '-') {
          j--;
          continue; // Allow spaces, apostrophes, hyphens in speaker names
        }
        if (prevCh >= 'A' && prevCh <= 'Z') {
          hasNonWhitespace = true;
          j--;
          continue;
        }
        // If we hit a lowercase letter, it's not all caps
        if (prevCh >= 'a' && prevCh <= 'z') {
          isAllCaps = false;
          break; // Not a speaker name
        }
        // Other characters might break the pattern
        if (prevCh !== '.' && prevCh !== '!' && prevCh !== '?' && prevCh !== ';') {
          j--;
        } else {
          break;
        }
      }
      // If we found a newline and all the text before the period was all caps, it's likely a speaker name
      // In that case, start the selection after the period
      if (foundNewline && hasNonWhitespace && isAllCaps) {
        start = i + 1;
        foundStart = true;
        break;
      }
      // Otherwise, this is a normal sentence ender
      start = i + 1;
      foundStart = true;
      break;
    }
  }
  if (!foundStart) start = 0;

  // Skip leading whitespace/newlines (optimize: use a single pass)
  while (start < len && (text[start] === ' ' || text[start] === '\t' || text[start] === '\n' || text[start] === '\r')) {
    start++;
  }

  // Move end right to next sentence ender
  let foundEnd = false;
  for (let i = index; i < len; i++) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === ';') {
      end = i + 1;
      // include immediate closing quotes/brackets
      while (end < len) {
        const nextCh = text[end];
        if (nextCh === '"' || nextCh === "'" || nextCh === ')' || nextCh === ']') {
          end++;
        } else {
          break;
        }
      }
      foundEnd = true;
      break;
    }
  }
  if (!foundEnd) end = len;

  // Trim trailing whitespace
  while (end > start) {
    const ch = text[end - 1];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      end--;
    } else {
      break;
    }
  }

  if (end > start) return { start, end };
  return null;
}

function TextSelectionChat({ contextInfo, llm, onRequestFocus, noteMode = false, onNoteMore, onNoteFollowup, onLength }) {
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
  };
  const requestMore = () => {
    if (noteMode && onNoteMore) {
      onNoteMore();
    } else if (onLength) {
      // Use onLength to get a longer explanation (mode: 'more', length: 'large')
      onLength('large');
    } else {
      // Fallback to followup if onLength is not available
      onFollowup?.('Expand into a longer, more detailed explanation without repeating earlier sentences.');
    }
  };
  // Show input field when there's contextInfo (text selected) OR when in noteMode
  // When just in select mode without selection, show hint
  const hasContext = !!contextInfo;
  const isInSelectMode = !hasContext && !noteMode; // Show hint when in select mode but no text selected yet
  const showInput = hasContext || noteMode; // Show input for text selections OR notes
  // Show selection instructions when noteMode is true but no text is selected yet
  const showSelectionHint = noteMode && !hasContext;
  return (
    <div style={{ marginTop: noteMode ? '0.25rem' : '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {showInput ? (
        <>
            <div style={{ flex: 1, minWidth: 0, position: 'relative', maxWidth: 'calc(100% - 120px)' }}>
          <input 
            type="text" 
            placeholder="Ask a follow‑up…" 
            value={q} 
            onChange={(e)=>setQ(e.target.value)} 
            onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); submitFollowup(); } }} 
                style={{ width: '100%', paddingRight: q ? '24px' : '0' }} 
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  style={{
                    position: 'absolute',
                    right: '4px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    fontSize: '18px',
                    lineHeight: '1',
                    color: '#6b5f53'
                  }}
                  aria-label="Clear"
                >
                  ×
                </button>
              )}
            </div>
            <button type="button" disabled={loading || !q.trim()} onClick={submitFollowup} style={{ flexShrink: 0 }}>Ask</button>
        </>
      ) : isInSelectMode ? (
        <div style={{ flex: 1, fontSize: '0.9em', color: '#6b5f53', fontStyle: 'italic' }}>
          Tap a sentence or drag to select text
        </div>
      ) : (
        <div style={{ flex: 1 }}></div>
      )}
      <button type="button" disabled={loading || (!hasContext && !noteMode)} onClick={requestMore}>More</button>
      </div>
      {/* Show selection hint below input when in noteMode but no text selected */}
      {showSelectionHint && (
        <div style={{ fontSize: '0.9em', color: '#6b5f53', fontStyle: 'italic', marginTop: '0.25rem' }}>
          Tap a sentence or drag to select text
        </div>
      )}
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
  };
  return (
    <div>
      {conversation?.last ? (
        <div style={{ marginTop: '0.5rem' }} onClick={onFocusSource} title="Click to highlight source in the text">
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
      </div>
      {/* Follow-up question */}
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <input
          type="text"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="Ask a follow‑up…"
          onKeyDown={(e)=>{ if (e.key==='Enter') { e.preventDefault(); submitFollowup(); } }}
            style={{ width: '100%', paddingRight: q ? '24px' : '0' }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                fontSize: '18px',
                lineHeight: '1',
                color: '#6b5f53'
              }}
              aria-label="Clear"
            >
              ×
            </button>
          )}
        </div>
        <button type="button" disabled={loading || !q.trim()} onClick={submitFollowup}>Ask</button>
      </div>
      {loading && (
        <div style={{ marginTop: '0.5rem', color: '#6b5f53' }}>Thinking…</div>
      )}
    </div>
  );
}

function ExplanationCard({ passage, content, onLocate, onCopy, onDelete, meta, options, title }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState([]); // [{q,a}]
  // Determine title based on meta or prop
  const explanationTitle = title || (meta?.mode === 'more' ? 'More' : (meta?.mode === 'followup' ? 'Chat Prompt' : 'Selected Text'));
  const ask = async (followupText) => {
    const v = (followupText || q || '').trim();
    if (!v) return;
    try {
      setLoading(true);
      const url = getApiUrl('/api/explain');
      const data = await fetchWithErrorHandling(url, {
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
      setThread((t) => t.concat({ q: v, a: data?.content || '' }));
    } catch (e) {
      setThread((t) => t.concat({ q: v, a: `Error: ${String(e.message || e)}` }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', paddingRight: '32px', borderTop: '1px solid #eee', position: 'relative' }}>
      {onDelete && (
      <button
        type="button"
        className="closeBtn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }} 
          aria-label="Delete explanation" 
          style={{ position: 'absolute', right: 0, top: 0 }}
      >
        🗑️
      </button>
      )}
      {/* Title for explanation */}
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{explanationTitle}</div>
      {(() => {
        const preview = (passage || '').trim();
        if (!preview) return null;
        return (
          <div
            style={{
              marginBottom: '0.5rem',
              paddingLeft: '1rem',
              borderLeft: '3px solid #e8d8b5',
              fontStyle: 'italic',
              color: '#4a4036',
              whiteSpace: 'pre-wrap',
            }}
          >
            {preview}
          </div>
        );
      })()}
      <div style={{ marginTop: '0.25rem' }} onClick={() => { onLocate?.(); setOpen((v)=>!v); }} title="Click to highlight source and toggle follow‑up">
        <div style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}>{content || '—'}</div>
        <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 4 }}>
          {options?.model ? `Model: ${options.model}` : ''}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <input 
              type="text" 
              placeholder="Ask a follow‑up…" 
              value={q} 
              onChange={(e)=>setQ(e.target.value)} 
              onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); ask(); } }} 
              style={{ width: '100%', paddingRight: q ? '24px' : '0' }} 
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                style={{
                  position: 'absolute',
                  right: '4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '18px',
                  lineHeight: '1',
                  color: '#6b5f53'
                }}
                aria-label="Clear"
              >
                ×
              </button>
            )}
          </div>
          <button type="button" disabled={loading || !q.trim()} onClick={()=>ask()}>Ask</button>
          <button type="button" disabled={loading} onClick={()=>ask('Expand into a longer, more detailed explanation without repeating earlier sentences.')}>More</button>
          {loading && <span style={{ color:'#6b5f53' }}>Thinking…</span>}
        </div>
      )}
      {open && thread.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          {thread.map((m, i) => {
            const isMore = m.q === 'More detail' || m.q === 'More' || (m.q && m.q.toLowerCase().includes('expand') && m.q.toLowerCase().includes('more'));
            return (
            <div key={`fu-${i}`} style={{ marginBottom: '0.5rem' }}>
                {isMore ? (
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>More</div>
                ) : m.q ? (
                  <div
                    style={{
                      marginBottom: '0.5rem',
                      paddingLeft: '1rem',
                      borderLeft: '3px solid #e8d8b5',
                      fontStyle: 'italic',
                      color: '#4a4036',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.q}
                  </div>
                ) : null}
              <div style={{ whiteSpace:'pre-wrap' }}>{m.a}</div>
              <div style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#6b5f53', marginTop: 2 }}>{options?.model ? `Model: ${options.model}` : ''}</div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
