import { useEffect, useState } from 'react';
import { useOverlay } from '../contexts/OverlayContext';

export default function WelcomePanel() {
  const { closeOverlay } = useOverlay();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Check if user has seen the welcome message
    if (typeof window !== 'undefined') {
      const hasSeenWelcome = localStorage.getItem('romeo-juliet-welcome-seen');
      if (!hasSeenWelcome) {
        // Show welcome after a brief delay to ensure page is loaded
        const timer = setTimeout(() => {
          setShowWelcome(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleClose = () => {
    setShowWelcome(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('romeo-juliet-welcome-seen', 'true');
    }
  };

  const handleDontShowAgain = () => {
    setShowWelcome(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('romeo-juliet-welcome-seen', 'true');
    }
  };

  if (!showWelcome) return null;

  return (
    <div className="welcomeBackdrop" onClick={handleClose}>
      <div className="welcomePanel" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="welcomeClose"
          onClick={handleClose}
          aria-label="Close welcome message"
        >
          ✕
        </button>
        <div className="welcomeContent">
          <h2 className="welcomeTitle">Welcome to Romeo and Juliet Explained!</h2>
          <div className="welcomeBody">
            <p>
              This interactive reading experience helps you understand Shakespeare's play with AI-powered explanations.
            </p>
            <p style={{ marginTop: '1rem', fontWeight: '600', color: '#3b3228' }}>
              👆 <strong>Click on any text</strong> to get an AI explanation
            </p>
            <p style={{ marginTop: '0.75rem', fontSize: '0.95em', color: '#6b5f53' }}>
              Simply tap or click on any word, sentence, or passage in the play to receive detailed explanations that help you understand the language, context, and meaning.
            </p>
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f6f3', borderRadius: '8px', border: '1px solid #e7d7b8' }}>
              <p style={{ margin: 0, fontSize: '0.9em', color: '#53483e' }}>
                💡 <strong>Tip:</strong> You can also ask follow-up questions or request more detail about any explanation.
              </p>
            </div>
          </div>
          <div className="welcomeActions">
            <button
              type="button"
              className="welcomeButton welcomeButtonPrimary"
              onClick={handleClose}
            >
              Get Started
            </button>
            <button
              type="button"
              className="welcomeButton welcomeButtonSecondary"
              onClick={handleDontShowAgain}
            >
              Don't show again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
