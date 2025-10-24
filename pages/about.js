import Head from 'next/head';

export default function About() {
  return (
    <div className="container" style={{ paddingTop: '1rem' }}>
      <Head>
        <title>About — Romeo and Juliet Explained</title>
      </Head>
      <h1>About</h1>
      <p>
        This project helps readers understand Shakespeare's Romeo and Juliet with on‑demand
        explanations next to the original text. Select any passage to see a brief, clear gloss
        that clarifies vocabulary and syntax, with options to ask follow‑up questions.
      </p>
    </div>
  );
}

