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
                try {
                  // Hard-disable Sentry if any injected snippet is present (content scripts/extensions)
                  window.SENTRY_SDK_INIT = false;
                  window.__SENTRY__ = window.__SENTRY__ || {};
                  window.__SENTRY__.globalEventProcessors = [];
                  window.__SENTRY__.hub = null;

                  var ua = navigator.userAgent || '';
                  var isIOS = /iP(hone|od|ad)/.test(ua);
                  if (window.history && 'scrollRestoration' in window.history) {
                    // Let the app decide later; default to manual to stop browser restore
                    window.history.scrollRestoration = 'manual';
                  }
                  // Do nothing else here—avoid any automatic scroll adjustments on load.
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
