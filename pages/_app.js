import React from 'react';
import Link from 'next/link';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  const headerRef = React.useRef(null);
  React.useEffect(() => {
    const update = () => {
      if (!headerRef.current) return;
      const h = headerRef.current.getBoundingClientRect().height;
      const gap = 16; // match --header-spacer in CSS so content clears header + spacer
      document.body.style.setProperty('--header-offset', `${h + gap}px`);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return (
    <>
      <header className="appHeader" ref={headerRef}>
        <div className="container appHeaderInner">
          <div className="appTitle" style={{ fontFamily: 'IM Fell English, serif', fontWeight: 700, whiteSpace: 'nowrap' }}>Romeo and Juliet — Explained</div>
          <HeaderSearch />
          <nav style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link href="/print" target="_blank" rel="noopener noreferrer">Print</Link>
            <Link href="/user-guide">User Guide</Link>
            <Link href="/about">About</Link>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('open-settings'));
                }
              }}
              title="Settings"
              aria-label="Open settings"
            >
              Settings
            </a>
          </nav>
        </div>
      </header>
      <Component {...pageProps} />
    </>
  );
}

function HeaderSearch() {
  const [input, setInput] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [index, setIndex] = React.useState(0);
  const [exCount, setExCount] = React.useState(0);
  const [exIndex, setExIndex] = React.useState(0);

  React.useEffect(() => {
    const onState = (e) => {
      const { count = 0, index = 0, submitted = false, exCount = 0, exIndex = 0 } = e.detail || {};
      setCount(count);
      setIndex(index);
      setSubmitted(submitted);
      setExCount(exCount);
      setExIndex(exIndex);
    };
    if (typeof window !== 'undefined') window.addEventListener('search-state', onState);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('search-state', onState); };
  }, []);

  const submit = () => {
    setSubmitted(true);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('search-submit', { detail: { query: input } }));
  };

  return (
    <form className="searchBar headerSearchBar" role="search" onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ marginLeft: 'auto' }}>
      <input type="search" placeholder="Search the play…" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Search text" />
      {count > 1 && (
        <>
          <button type="button" onClick={() => window.dispatchEvent(new Event('search-prev'))} aria-label="Previous result">◀</button>
          <button type="button" onClick={() => window.dispatchEvent(new Event('search-next'))} aria-label="Next result">▶</button>
        </>
      )}
      {count > 0 ? (
        <span className="searchCount" aria-live="polite">{`${index} / ${count}`}</span>
      ) : submitted ? (
        <span className="searchCount" aria-live="polite">No results</span>
      ) : null}
      <button type="button" onClick={() => window.dispatchEvent(new Event('ex-prev'))} disabled={!exCount} title="Previous explanation">◀</button>
      <button type="button" onClick={() => window.dispatchEvent(new Event('ex-next'))} disabled={!exCount} title="Next explanation">▶</button>
      <span className="searchCount" aria-live="polite">{exCount ? `${exIndex} / ${exCount}` : ' '}</span>
    </form>
  );
}
