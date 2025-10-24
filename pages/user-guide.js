import Head from 'next/head';

export default function UserGuide() {
  return (
    <div className="container" style={{ paddingTop: '1rem' }}>
      <Head>
        <title>User Guide — Romeo and Juliet Explained</title>
      </Head>
      <h1>User Guide</h1>
      <p>Basics:</p>
      <ul>
        <li>Click a word to select its sentence. Drag to select a custom range.</li>
        <li>The explanation appears in the right column. Click it to locate the source.</li>
        <li>Use the sidebar to jump between scenes. Search highlights matches and lets you step through them.</li>
        <li>Use Print or Print View to print the play with your saved explanations.</li>
      </ul>
      <p>Tips:</p>
      <ul>
        <li>Explanations persist between visits (stored in your browser).</li>
        <li>Copy Link on an explanation to share a direct link to that passage.</li>
        <li>Prev Ex / Next Ex cycles through your saved explanations.</li>
      </ul>
    </div>
  );
}

