import React from 'react';
import Link from 'next/link';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {

  return (
    <>
      <header className="appHeader">
        <div className="appHeaderInner">
          <div className="appTitle" style={{ fontFamily: 'IM Fell English, serif', fontWeight: 700, whiteSpace: 'nowrap' }}>Romeo and Juliet — Explained</div>
          <HeaderSearch />
          <nav className="headerLinks">
            <Link href="/print" target="_blank" rel="noopener noreferrer">Print</Link>
            <Link href="/user-guide" style={{ marginLeft: 12 }}>User Guide</Link>
            <Link href="/about" style={{ marginLeft: 12 }}>About</Link>
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
              style={{ marginLeft: 12 }}
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
      <input type="search" placeholder="Search the play…" value={input} onChange={onInputChange} aria-label="Search text" />
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
      <span className="exTag" aria-hidden title="Explanation navigation" style={{ marginLeft: 10, marginRight: 4, color: '#6b5f53' }}>Ex</span>
      <button type="button" onClick={() => window.dispatchEvent(new Event('ex-prev'))} disabled={!exCount} title="Previous explanation">◀</button>
      <button type="button" onClick={() => window.dispatchEvent(new Event('ex-next'))} disabled={!exCount} title="Next explanation">▶</button>
      <span className="exCount" aria-live="polite">{exCount ? `${exIndex} / ${exCount}` : ''}</span>
    </form>
  );
}
