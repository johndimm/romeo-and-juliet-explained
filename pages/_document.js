import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* IM Fell English from Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=swap"
          rel="stylesheet"
        />
        { /* Next.js injects the viewport meta automatically; keep it out of _document to avoid warnings. */ }
      </Head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // SIMPLE: Just try to set scroll if we have saved position and elements exist
                // But ensure title is visible on fresh app launches
                try {
                  var savedScroll = localStorage.getItem('last-scroll');
                  var scrollPos = savedScroll ? parseFloat(savedScroll) : 0;
                  var savedContainerType = localStorage.getItem('last-scroll-container');
                  
                  // Check if this is a fresh app launch (no hash, no selection link)
                  var hash = window.location.hash || '';
                  var isFreshLaunch = !hash || hash === '';
                  var isSelectionLink = /^#sel=/.test(hash);
                  
                  // On fresh app launch (no hash, no selection), always start at top to show title
                  // This ensures users see the title when opening the app
                  // Only restore scroll if there's a hash/selection link (user navigating to specific content)
                  if (isFreshLaunch && !isSelectionLink) {
                    // Fresh launch - always show title at top
                    scrollPos = 0;
                  }
                  
                  if (savedScroll && scrollPos > 50 && !isFreshLaunch) {
                    // Only restore scroll if not a fresh launch
                    // Try to set scroll immediately if container exists
                    var scroller = null;
                    if (savedContainerType === 'container') {
                      scroller = document.querySelector('.container');
                    } else if (savedContainerType === 'body') {
                      scroller = document.body;
                    } else if (savedContainerType === 'page') {
                      scroller = document.querySelector('.page');
                    }
                    
                    if (scroller) {
                      scroller.scrollTop = scrollPos;
                    } else if (savedContainerType === 'window' || !savedContainerType) {
                      window.scrollTo(0, scrollPos);
                    }
                  } else {
                    // First load or fresh launch: scroll to top to show title
                    window.scrollTo(0, 0);
                    if (document.body) document.body.scrollTop = 0;
                  }
                } catch(e) {
                  // Ignore errors
                }
              })();
            `,
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
