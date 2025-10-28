import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isPrintRoute = router && router.pathname === '/print';
  const headerRef = React.useRef(null);
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);
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
          <div className="appTitle" style={{ fontFamily: 'IM Fell English, serif', fontWeight: 700, whiteSpace: 'nowrap' }}>Romeo and Juliet — Explained</div>
          <HeaderSearch />
          <nav className="headerLinks">
            <a className="lnk-contents"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== 'undefined') window.dispatchEvent(new Event('toggle-toc'));
              }}
              style={{ marginRight: 12 }}
              title="Contents"
              aria-label="Open contents"
            >
              <span className="icon" aria-hidden>📑</span>
              <span className="lbl">Contents</span>
            </a>
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
            <Link href="/user-guide" className="lnk-guide" style={{ marginLeft: 12 }}><span className="icon" aria-hidden>📖</span><span className="lbl">User Guide</span></Link>
            <Link href="/about" className="lnk-about" style={{ marginLeft: 12 }}><span className="icon" aria-hidden>ℹ️</span><span className="lbl">About</span></Link>
            <a
              className="lnk-settings"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== 'undefined') {
                  const isMobile = window.innerWidth <= 820;
                  if (isMobile) setShowMobileMenu((v) => !v);
                  else window.dispatchEvent(new CustomEvent('open-settings'));
                }
              }}
              title="Settings"
              aria-label="Open settings"
              style={{ marginLeft: 12 }}
            >
              <span className="icon" aria-hidden>⚙️</span>
              <span className="lbl">Settings</span>
            </a>
          </nav>
        </div>
      </header>
      )}
      {showMobileMenu && (
        <div className="mobileMenu" role="dialog" aria-label="Menu" onClick={() => setShowMobileMenu(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <button className="menuItem" onClick={() => { setShowMobileMenu(false); if (typeof window !== 'undefined') { const dest = '/#action=toc'; if (location.pathname !== '/') location.assign(dest); else { location.hash = 'action=toc'; } } }}>📑 Contents</button>
            <a className="menuItem" href="#" onClick={() => { setShowMobileMenu(false); try { const act = localStorage.getItem('printAct') || ''; const scene = localStorage.getItem('printScene') || ''; let dest='/print'; const params=[]; if(act) params.push(`act=${encodeURIComponent(act)}`); if(scene) params.push(`scene=${encodeURIComponent(scene)}`); if(params.length) dest += `?${params.join('&')}`; location.assign(dest);} catch { location.assign('/print'); } }}>🖨️ Print</a>
            <Link className="menuItem" href="/user-guide" onClick={() => setShowMobileMenu(false)}>📖 User Guide</Link>
            <Link className="menuItem" href="/about" onClick={() => setShowMobileMenu(false)}>ℹ️ About</Link>
            <button className="menuItem" onClick={() => { setShowMobileMenu(false); if (typeof window !== 'undefined') { const dest = '/#action=settings'; if (location.pathname !== '/') location.assign(dest); else { location.hash = 'action=settings'; } } }}>⚙️ Settings</button>
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
