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
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
