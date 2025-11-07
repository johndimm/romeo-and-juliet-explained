import Head from 'next/head';
import { useEffect } from 'react';

export default function TestScroll() {
  useEffect(() => {
    // AGGRESSIVELY force enable scrolling - this page MUST scroll
    if (typeof document !== 'undefined') {
      const html = document.documentElement;
      const body = document.body;
      const next = document.getElementById('__next');
      
      // Add class to html, body, and #__next for CSS targeting
      if (html) {
        html.classList.add('testScroll');
        html.setAttribute('data-test-scroll', 'true');
        // Inline styles as backup
        html.style.cssText += 'height: auto !important; min-height: 100vh !important; overflow: visible !important; overflow-y: visible !important;';
      }
      if (body) {
        body.classList.add('testScroll');
        body.setAttribute('data-test-scroll', 'true');
        // CRITICAL: Override the global overflow: hidden with !important
        body.style.cssText += 'overflow: auto !important; overflow-y: auto !important; overflow-x: hidden !important; height: auto !important; min-height: 100vh !important; position: relative !important; -webkit-overflow-scrolling: touch !important; margin: 0 !important; padding: 0 !important;';
      }
      if (next) {
        next.classList.add('testScroll');
        next.setAttribute('data-test-scroll', 'true');
        next.style.cssText += 'height: auto !important; min-height: 100vh !important; overflow: visible !important; position: relative !important;';
      }
      
      // Also ensure any page/container elements don't block
      const fixLayout = () => {
        const page = document.querySelector('.page');
        const container = document.querySelector('.container');
        const sidebar = document.querySelector('.sidebar');
        if (page) {
          page.style.cssText += 'position: relative !important; height: auto !important; overflow: visible !important; top: 0 !important;';
        }
        if (container) {
          container.style.cssText += 'position: relative !important; height: auto !important; overflow: visible !important; left: 0 !important;';
        }
        if (sidebar) {
          sidebar.style.cssText += 'position: relative !important; height: auto !important; overflow: visible !important;';
        }
      };
      
      // Try multiple times
      fixLayout();
      setTimeout(fixLayout, 50);
      setTimeout(fixLayout, 200);
      setTimeout(fixLayout, 500);
      setTimeout(fixLayout, 1000);
      
      // Force a reflow
      if (body) {
        body.offsetHeight; // trigger reflow
      }
    }
  }, []);

  // Generate lots of text to ensure scrolling
  const paragraphs = Array.from({ length: 100 }, (_, i) => (
    <p key={i} style={{ margin: '20px', padding: '10px', fontSize: '18px' }}>
      This is paragraph {i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
      Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, 
      quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. 
      Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. 
      Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      {i % 10 === 0 && <strong> SCROLL HERE - This is paragraph {i + 1}</strong>}
    </p>
  ));

  return (
    <>
      <Head>
        <title>Scroll Test</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          /* OVERRIDE ALL GLOBAL STYLES - This page MUST scroll */
          html.testScroll,
          html[data-test-scroll="true"],
          body.testScroll,
          body[data-test-scroll="true"] {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 100vh !important;
            overflow: auto !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            -webkit-overflow-scrolling: touch !important;
            position: relative !important;
            max-height: none !important;
          }
          
          #__next.testScroll,
          #__next[data-test-scroll="true"] {
            height: auto !important;
            min-height: 100vh !important;
            overflow: visible !important;
            position: relative !important;
            max-height: none !important;
          }
          
          html.testScroll body,
          html[data-test-scroll="true"] body {
            background: #f0f0f0 !important;
          }
          
          html.testScroll .page,
          html.testScroll .container,
          html.testScroll .sidebar {
            position: relative !important;
            height: auto !important;
            overflow: visible !important;
            top: 0 !important;
            left: 0 !important;
          }
          
          h1 {
            padding: 20px;
            background: #333;
            color: white;
            margin: 0;
            position: sticky;
            top: 0;
            z-index: 100;
          }
        `}</style>
      </Head>
      <h1>Scroll Test Page - If you can see this and scroll, scrolling works!</h1>
      {paragraphs}
      <div style={{ padding: '40px', textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>
        ← SCROLL UP AND DOWN TO TEST →
      </div>
    </>
  );
}

