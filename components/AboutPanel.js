import { useOverlay } from '../contexts/OverlayContext';

export default function AboutPanel() {
  const { openOverlay } = useOverlay();

  return (
    <div className="about-page">
      <div className="about-content">
        <h1 className="about-title">About Romeo and Juliet Explained</h1>

        <div className="about-section">
          <h2>Project Overview</h2>
          <p>
            Romeo and Juliet Explained is an interactive digital tool designed to make Shakespeare&apos;s timeless tragedy more accessible to modern
            readers. By combining the original text with on-demand explanations, this project bridges the gap between Elizabethan English and contemporary
            understanding.
          </p>
        </div>

        <div className="about-section">
          <h2>How It Works</h2>
          <p>Simply select any passage from the play to receive instant, contextual explanations. The system provides:</p>
          <ul className="feature-list">
            <li>
              <strong>Vocabulary clarification</strong> - Definitions of archaic words and phrases
            </li>
            <li>
              <strong>Syntax analysis</strong> - Breakdown of complex sentence structures
            </li>
            <li>
              <strong>Cultural context</strong> - Historical and literary background
            </li>
            <li>
              <strong>Interactive Q&amp;A</strong> - Ask follow-up questions for deeper understanding
            </li>
            <li>
              <strong>Persistent learning</strong> - Save explanations for future reference
            </li>
          </ul>
        </div>

        <div className="about-section">
          <h2>Educational Philosophy</h2>
          <p>
            This tool is built on the principle that Shakespeare&apos;s language, while challenging, becomes accessible when properly contextualized. Rather
            than replacing the original text with modern translations, we preserve the beauty and power of Shakespeare&apos;s verse while providing the
            scaffolding needed for comprehension.
          </p>
        </div>

        <div className="about-section">
          <h2>Technical Features</h2>
          <ul className="feature-list">
            <li>Responsive design for desktop and mobile devices</li>
            <li>Search functionality across the entire play</li>
            <li>Print-friendly layout with saved explanations</li>
            <li>Shareable links to specific passages</li>
            <li>Offline-capable with browser storage</li>
          </ul>
        </div>

        <div className="about-section">
          <h2>About the Developer</h2>
          <p>
            This project was created as a demonstration of how modern web technologies can enhance literary education. The goal is to make classic
            literature more approachable while maintaining respect for the original text.
          </p>
          <div className="developer-links">
            <a
              href="https://github.com/johndimm/romeo-and-juliet-explained"
              target="_blank"
              rel="noopener noreferrer"
              className="link-button github-link"
            >
              <span className="icon">📚</span>
              View on GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/johndimm/"
              target="_blank"
              rel="noopener noreferrer"
              className="link-button linkedin-link"
            >
              <span className="icon">💼</span>
              Connect on LinkedIn
            </a>
          </div>
        </div>

        <div className="about-section">
          <h2>Getting Started</h2>
          <p>
            Ready to explore? Visit the{' '}
            <button
              type="button"
              className="inline-link"
              onClick={() => openOverlay('user-guide')}
            >
              User Guide
            </button>{' '}
            for detailed instructions on how to make the most of this tool, or simply start reading and select any text that interests you.
          </p>
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1em' }}>Desktop Version on Mobile</h3>
            <p style={{ marginBottom: '0.75rem' }}>
              If you're on a mobile device and want to use the desktop version with the three-column layout, you can access it at:
            </p>
            <p style={{ padding: '0.75rem 1rem', backgroundColor: '#f8f6f3', borderRadius: '6px', border: '1px solid #e7d7b8' }}>
              <a
                href="https://romeo-and-juliet-explained.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#3b3228',
                  textDecoration: 'none',
                  fontWeight: '500',
                  wordBreak: 'break-all',
                }}
              >
                https://romeo-and-juliet-explained.vercel.app/
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

