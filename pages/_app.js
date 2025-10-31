import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isPrintRoute = router && router.pathname === '/print';
  const isPlayPage = router && router.pathname === '/';
  const headerRef = React.useRef(null);
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  
  // Detect mobile screen size (matching CSS breakpoint at 820px)
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 820);
    };
    checkMobile();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);
  // Add a class on <html> when on the print route so CSS can adjust layout/scrolling
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (!html) return;
    if (isPrintRoute) html.classList.add('isPrintRoute'); else html.classList.remove('isPrintRoute');
    return () => { html.classList.remove('isPrintRoute'); };
  }, [isPrintRoute]);
  // Measure header height on mobile and expose as CSS var for page padding
  React.useEffect(() => {
    const setVar = () => {
      if (!headerRef.current) return;
      const h = headerRef.current.offsetHeight || 0;
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--mobile-header-h', `${h}px`);
      }
    };
    setVar();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', setVar);
      // Recalculate after fonts load and after small UI changes
      const t = setTimeout(setVar, 50);
      // Observe header size changes (buttons/counters appear)
      let ro = null;
      if (typeof ResizeObserver !== 'undefined' && headerRef.current) {
        ro = new ResizeObserver(() => setVar());
        ro.observe(headerRef.current);
      }
      return () => { window.removeEventListener('resize', setVar); clearTimeout(t); if (ro) ro.disconnect(); };
    }
  }, []);

  return (
    <>
      {!isPrintRoute && (
      <header className="appHeader">
        <div className="appHeaderInner" ref={headerRef}>
          <Link href="/" className="appTitle" style={{ fontFamily: 'IM Fell English, serif', fontWeight: 700, whiteSpace: 'nowrap', color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>Romeo and Juliet — Explained</Link>
          <div className="headerRight">
            <nav className="headerLinks">
              {isPlayPage && (
                <a
                  href="#"
                  className="lnk-print"
                  onClick={(e) => {
                    e.preventDefault();
                    try {
                      const act = localStorage.getItem('printAct') || '';
                      const scene = localStorage.getItem('printScene') || '';
                      let dest = '/print';
                      const params = [];
                      if (act) params.push(`act=${encodeURIComponent(act)}`);
                      if (scene) params.push(`scene=${encodeURIComponent(scene)}`);
                      if (params.length) dest += `?${params.join('&')}`;
                      if (location.pathname !== dest) location.assign(dest); else location.href = dest;
                    } catch {
                      location.assign('/print');
                    }
                  }}
                >
                  <span className="icon" aria-hidden>🖨️</span><span className="lbl">Print</span>
                </a>
              )}
              <Link href="/user-guide" className="lnk-guide"><span className="icon" aria-hidden>📖</span><span className="lbl">User Guide</span></Link>
              <Link href="/about" className="lnk-about"><span className="icon" aria-hidden>ℹ️</span><span className="lbl">About</span></Link>
              {isMobile ? (
                <a 
                  href="#" 
                  className="lnk-settings" 
                  onClick={(e) => {
                    e.preventDefault();
                    setShowMobileMenu(!showMobileMenu);
                  }}
                >
                  <span className="icon" aria-hidden>⚙️</span><span className="lbl">Settings</span>
                </a>
              ) : (
                <Link href="/settings" className="lnk-settings"><span className="icon" aria-hidden>⚙️</span><span className="lbl">Settings</span></Link>
              )}
            </nav>
            {isPlayPage && <HeaderNotesDensity />}
            {isPlayPage && <HeaderSearch />}
          </div>
        </div>
      </header>
      )}
      {showMobileMenu && (
        <div className="mobileMenu" role="dialog" aria-label="Menu" onClick={() => setShowMobileMenu(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            {isPlayPage && (
              <a className="menuItem" href="#" onClick={() => { setShowMobileMenu(false); try { const act = localStorage.getItem('printAct') || ''; const scene = localStorage.getItem('printScene') || ''; let dest='/print'; const params=[]; if(act) params.push(`act=${encodeURIComponent(act)}`); if(scene) params.push(`scene=${encodeURIComponent(scene)}`); if(params.length) dest += `?${params.join('&')}`; location.assign(dest);} catch { location.assign('/print'); } }}>🖨️ Print</a>
            )}
            <Link className="menuItem" href="/user-guide" onClick={() => setShowMobileMenu(false)}>📖 User Guide</Link>
            <Link className="menuItem" href="/about" onClick={() => setShowMobileMenu(false)}>ℹ️ About</Link>
            <Link className="menuItem" href="/settings" onClick={() => setShowMobileMenu(false)}>⚙️ Settings</Link>
          </div>
        </div>
      )}
      <Component {...pageProps} />
    </>
  );
}

function HeaderSearch() {
  const [input, setInput] = React.useState('');
  const [ph, setPh] = React.useState('Search the play…');
  const [submitted, setSubmitted] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const onState = (e) => {
      const { count = 0, index = 0, submitted = false } = e.detail || {};
      setCount(count);
      setIndex(index);
      setSubmitted(submitted);
    };
    if (typeof window !== 'undefined') window.addEventListener('search-state', onState);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('search-state', onState); };
  }, []);

  // Shorter placeholder on very narrow screens
  React.useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth || 0;
      setPh(w <= 420 ? 'Search…' : 'Search the play…');
    };
    update();
    if (typeof window !== 'undefined') window.addEventListener('resize', update);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('resize', update); };
  }, []);

  const submit = () => {
    setSubmitted(true);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('search-submit', { detail: { query: input } }));
  };

  const onInputChange = (e) => {
    const v = e.target.value;
    setInput(v);
    // If user clears the box (via keyboard or the native clear "x"),
    // immediately clear search highlights by submitting an empty query.
    if (v === '') {
      setSubmitted(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('search-submit', { detail: { query: '' } }));
      }
    }
  };

  return (
    <form className="searchBar headerSearchBar" role="search" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input type="search" placeholder={ph} value={input} onChange={onInputChange} aria-label="Search text" />
      <button type="button" onClick={() => window.dispatchEvent(new Event('search-prev'))} aria-label="Previous result" disabled={!count} title="Previous" style={{ marginLeft: 6 }}>◀</button>
      <button type="button" onClick={() => window.dispatchEvent(new Event('search-next'))} aria-label="Next result" disabled={!count} title="Next" style={{ marginLeft: 4 }}>▶</button>
      {count > 0 ? (
        <span className="searchCount" aria-live="polite">{`${index} / ${count}`}</span>
      ) : submitted ? (
        <span className="searchCount" aria-live="polite">No results</span>
      ) : null}
      {/* Explanation navigation removed */}
    </form>
  );
}

const densityOptions = [
  { key: 'none', label: 'None', value: 100 },
  { key: 'some', label: 'Some', value: 70 },
  { key: 'many', label: 'Many', value: 30 },
  { key: 'all', label: 'All', value: 0 },
];

const densityKeyFromValue = (v = 50) => {
  if (v >= 100) return 'none';
  if (v >= 70) return 'some';
  if (v >= 30) return 'many';
  return 'all';
};

function HeaderNotesDensity() {
  const [threshold, setThreshold] = React.useState(50);
  const [open, setOpen] = React.useState(false);
  const controlRef = React.useRef(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('noteThreshold');
      if (raw !== null && raw !== '') {
        const val = parseInt(raw, 10);
        if (Number.isFinite(val)) setThreshold(Math.min(100, Math.max(0, val)));
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const handler = (e) => {
      const val = e?.detail?.value;
      if (typeof val === 'number' && Number.isFinite(val)) {
        setThreshold(Math.min(100, Math.max(0, val)));
      }
    };
    window.addEventListener('note-threshold-updated', handler);
    return () => window.removeEventListener('note-threshold-updated', handler);
  }, []);

  React.useEffect(() => {
    if (!open) return () => {};
    const onClick = (e) => {
      if (!controlRef.current) return;
      if (controlRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', onClick);
      document.addEventListener('touchstart', onClick);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onClick);
        document.removeEventListener('touchstart', onClick);
        document.removeEventListener('keydown', onKey);
      };
    }
    return () => {};
  }, [open]);

  const applyValue = React.useCallback((value, { close = false } = {}) => {
    const clamped = Math.min(100, Math.max(0, value));
    setThreshold(clamped);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('noteThreshold', String(clamped)); } catch {}
      window.dispatchEvent(new CustomEvent('note-threshold-set', { detail: { value: clamped } }));
    }
    if (close) setOpen(false);
  }, []);

  const currentKey = densityKeyFromValue(threshold);
  const currentOption = densityOptions.find((opt) => opt.key === currentKey) || densityOptions[1];

  return (
    <div className="headerNotesDensity" ref={controlRef}>
      <button
        type="button"
        className="headerNotesButton"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        title="Adjust note density"
      >
        <span className="headerNotesIcon" data-level={currentKey} aria-hidden />
        <span className="sr-only">Note density ({currentOption.label})</span>
      </button>
      {open ? (
        <div className="headerNotesPopover" role="dialog" aria-label="Note density selector">
          <div className="headerNotesOptions">
            {densityOptions.map((opt) => {
              const isActive = opt.key === currentKey;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`headerNotesOption${isActive ? ' active' : ''}`}
                  onClick={() => applyValue(opt.value, { close: true })}
                >
                  <span className="headerNotesIcon" data-level={opt.key} aria-hidden />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <div className="headerNotesSlider">
            <label htmlFor="header-note-threshold">Minimum perplexity</label>
            <input
              id="header-note-threshold"
              type="range"
              min="0"
              max="100"
              value={threshold}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isFinite(val)) applyValue(val, { close: false });
              }}
            />
            <div className="headerNotesSliderValue">{threshold}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
