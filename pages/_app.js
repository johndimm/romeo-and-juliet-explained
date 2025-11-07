import React from 'react';
import Link from 'next/link';
import Head from 'next/head';
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

  // Detect if running in Capacitor (iOS/Android app) and add class for CSS adjustments
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const html = document.documentElement;
    if (!html) return;
    // Check if Capacitor is available (indicates native app)
    // Check for Capacitor object, CapacitorWeb, or user agent indicators
    // Also check for capacitor:// protocol in URL
    const isCapacitor = !!(window.Capacitor || window.CapacitorWeb || 
      (typeof window !== 'undefined' && window.location && window.location.protocol === 'capacitor:') ||
      (window.navigator && window.navigator.userAgent && 
       (window.navigator.userAgent.includes('Capacitor') || 
        window.navigator.userAgent.includes('ionic') ||
        (window.navigator.userAgent.includes('iPhone') || window.navigator.userAgent.includes('iPad')))));
    
    if (isCapacitor) {
      html.classList.add('isCapacitor');
      // Also set a data attribute for CSS targeting
      html.setAttribute('data-capacitor', 'true');
    } else {
      html.classList.remove('isCapacitor');
      html.removeAttribute('data-capacitor');
    }
    return () => { 
      html.classList.remove('isCapacitor');
      html.removeAttribute('data-capacitor');
    };
  }, []);
  // Measure header height on mobile and expose as CSS var for page padding
  React.useEffect(() => {
    let rafId = null;
    let pendingUpdate = false;
    
    const setVar = () => {
      // Throttle using requestAnimationFrame to avoid forced reflows
      if (pendingUpdate) return;
      pendingUpdate = true;
      rafId = requestAnimationFrame(() => {
        pendingUpdate = false;
        if (!headerRef.current) return;
        // Batch read: get offsetHeight once
        const h = headerRef.current.offsetHeight || 0;
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--mobile-header-h', `${h}px`);
        }
      });
    };
    
    // Initial measurement
    requestAnimationFrame(() => {
      if (headerRef.current) {
        const h = headerRef.current.offsetHeight || 0;
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--mobile-header-h', `${h}px`);
        }
      }
    });
    
    if (typeof window !== 'undefined') {
      // Throttle resize handler
      let resizeTimeout = null;
      const handleResize = () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(setVar, 100);
      };
      window.addEventListener('resize', handleResize, { passive: true });
      
      // Observe header size changes (buttons/counters appear) - ResizeObserver already throttles
      let ro = null;
      if (typeof ResizeObserver !== 'undefined' && headerRef.current) {
        ro = new ResizeObserver(() => setVar());
        ro.observe(headerRef.current);
      }
      
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        if (resizeTimeout) clearTimeout(resizeTimeout);
        window.removeEventListener('resize', handleResize);
        if (ro) ro.disconnect();
      };
    }
  }, []);

  return (
    <>
      <Head>
        {/* Ensure viewport supports safe area for iOS notch */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      {!isPrintRoute && (
      <header className="appHeader">
        <div className="appHeaderInner" ref={headerRef}>
          <Link href="/" className="appTitle" style={{ fontFamily: 'IM Fell English, serif', fontWeight: 700, whiteSpace: 'nowrap', color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>Romeo and Juliet Explained</Link>
          <div className="headerRight">
            <nav className="headerLinks">
              {isPlayPage && (
                <>
                  <Link href="/test-scroll" className="lnk-test-scroll"><span className="icon" aria-hidden>📜</span><span className="lbl">Test Scroll</span></Link>
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
                </>
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
                  <span className="icon" aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b3228" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v1.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-1.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </span><span className="lbl">Settings</span>
                </a>
              ) : (
                <Link href="/settings" className="lnk-settings">
                  <span className="icon" aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b3228" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v1.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-1.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </span><span className="lbl">Settings</span>
                </Link>
              )}
            </nav>
            {isPlayPage && <HeaderNotesDensity />}
            {isPlayPage && isMobile && (
              <a
                href="#"
                className="lnk-toc"
                onClick={(e) => {
                  e.preventDefault();
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('toggle-toc'));
                  }
                }}
              >
                <span className="icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b3228" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                    <line x1="9" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="15" x2="21" y2="15"></line>
                  </svg>
                </span><span className="lbl">Contents</span>
              </a>
            )}
            {isPlayPage && <HeaderSearch />}
          </div>
        </div>
      </header>
      )}
      {showMobileMenu && (
        <div className="mobileMenu" role="dialog" aria-label="Menu" onClick={() => setShowMobileMenu(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <Link className="menuItem" href="/test-scroll" onClick={() => setShowMobileMenu(false)}>📜 Test Scroll</Link>
            {isPlayPage && (
              <a className="menuItem" href="#" onClick={() => { setShowMobileMenu(false); try { const act = localStorage.getItem('printAct') || ''; const scene = localStorage.getItem('printScene') || ''; let dest='/print'; const params=[]; if(act) params.push(`act=${encodeURIComponent(act)}`); if(scene) params.push(`scene=${encodeURIComponent(scene)}`); if(params.length) dest += `?${params.join('&')}`; location.assign(dest);} catch { location.assign('/print'); } }}>🖨️ Print</a>
            )}
            <Link className="menuItem" href="/user-guide" onClick={() => setShowMobileMenu(false)}>📖 User Guide</Link>
            <Link className="menuItem" href="/about" onClick={() => setShowMobileMenu(false)}>ℹ️ About</Link>
            <Link className="menuItem" href="/settings" onClick={() => setShowMobileMenu(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b3228" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }}>
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v1.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-1.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Settings
            </Link>
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
  { key: 'none', label: 'None', value: 0 },
  { key: 'some', label: 'Some', value: 33 },
  { key: 'most', label: 'Most', value: 66 },
  { key: 'all', label: 'All', value: 100 },
];

const clampDensity = (value) => Math.min(100, Math.max(0, value));
const densityToThreshold = (density) => Math.min(100, Math.max(0, 100 - density));
const thresholdToDensity = (threshold) => Math.min(100, Math.max(0, 100 - threshold));

const densityKeyFromValue = (value = 66) => {
  const target = clampDensity(value);
  let closest = densityOptions[0];
  for (const opt of densityOptions) {
    if (Math.abs(opt.value - target) < Math.abs(closest.value - target)) {
      closest = opt;
    }
  }
  return closest.key;
};

const polarToCartesian = (cx, cy, r, angleDeg) => {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad)
  }
};

const DensityIcon = ({ density, size = 26 }) => {
  const clamped = clampDensity(density);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;
  const angle = (clamped / 100) * 360;

  let wedge = null;
  if (clamped >= 100) {
    wedge = <circle cx={cx} cy={cy} r={radius} fill="#c08a5c" />;
  } else if (clamped > 0) {
    const startAngle = -90;
    const endAngle = startAngle + angle;
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const pathData = [
      `M ${cx} ${cy}`,
      `L ${end.x} ${end.y}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${start.x} ${start.y}`,
      'Z'
    ].join(' ');
    wedge = <path d={pathData} fill="#c08a5c" />;
  }

  return (
    <svg className="densityIcon" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={cx} cy={cy} r={radius} fill="#fdf6eb" stroke="#6b5f53" strokeWidth="2" />
      {wedge}
    </svg>
  );
};

function HeaderNotesDensity() {
  const initialDensity = React.useMemo(() => thresholdToDensity(33), []);
  const [density, setDensity] = React.useState(initialDensity);
  const [sliderDensity, setSliderDensity] = React.useState(initialDensity);
  const [open, setOpen] = React.useState(false);
  const controlRef = React.useRef(null);
  const lastEmittedRef = React.useRef(null);
  const isDraggingRef = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('noteThreshold');
      if (raw !== null && raw !== '') {
        const val = parseInt(raw, 10);
        if (Number.isFinite(val)) {
          const next = thresholdToDensity(val);
          setDensity(next);
          setSliderDensity(next);
          lastEmittedRef.current = next;
        }
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const handler = (e) => {
      const detail = e?.detail || {};
      if (isDraggingRef.current) return;
      let next = null;
      if (typeof detail.density === 'number' && Number.isFinite(detail.density)) {
        next = clampDensity(detail.density);
      } else if (typeof detail.threshold === 'number' && Number.isFinite(detail.threshold)) {
        next = thresholdToDensity(detail.threshold);
      } else if (typeof detail.value === 'number' && Number.isFinite(detail.value)) {
        next = thresholdToDensity(detail.value);
      }
      if (next == null) return;
      lastEmittedRef.current = next;
      setDensity(next);
      setSliderDensity(next);
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

  React.useEffect(() => {
    if (open) {
      setSliderDensity(density);
    }
  }, [open, density]);

  const emitDensity = React.useCallback((value) => {
    const clamped = clampDensity(value);
    if (lastEmittedRef.current === clamped) return clamped;
    lastEmittedRef.current = clamped;
    const threshold = densityToThreshold(clamped);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('noteThreshold', String(threshold)); } catch {}
      window.dispatchEvent(new CustomEvent('note-threshold-set', { detail: { threshold, density: clamped } }));
    }
    return clamped;
  }, []);

  const previewDensity = React.useCallback((value) => {
    const clamped = clampDensity(value);
    setSliderDensity((prev) => (prev === clamped ? prev : clamped));
    emitDensity(clamped);
    if (!isDraggingRef.current) {
      setDensity((prev) => (prev === clamped ? prev : clamped));
    }
  }, [emitDensity]);

  const commitDensity = React.useCallback((value, { close = false } = {}) => {
    const clamped = clampDensity(value);
    setSliderDensity(clamped);
    setDensity((prev) => (prev === clamped ? prev : clamped));
    emitDensity(clamped);
    if (close) setOpen(false);
  }, [emitDensity]);

  const beginDrag = React.useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const endDrag = React.useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    commitDensity(sliderDensity);
  }, [commitDensity, sliderDensity]);

  const currentKey = densityKeyFromValue(density);
  const currentOption = densityOptions.find((opt) => opt.key === currentKey) || densityOptions[2];

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
        <DensityIcon density={density} />
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
                  aria-pressed={isActive}
                  onClick={() => {
                    isDraggingRef.current = false;
                    commitDensity(opt.value, { close: true });
                  }}
                >
                  <DensityIcon density={opt.value} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <div className="headerNotesSlider">
            <label htmlFor="header-note-density">Note density</label>
            <input
              id="header-note-density"
              type="range"
              min="0"
              max="100"
              value={sliderDensity}
              onPointerDown={beginDrag}
              onPointerUp={endDrag}
              onMouseDown={beginDrag}
              onMouseUp={endDrag}
              onTouchStart={beginDrag}
              onTouchEnd={endDrag}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isFinite(val)) previewDensity(val);
              }}
              onKeyUp={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                  endDrag();
                }
              }}
            />
            <div className="headerNotesSliderValue">{Math.round(sliderDensity)}%</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
