import Head from 'next/head';
import Link from 'next/link';

export default function UserGuide() {
  return (
    <div className="user-guide-page">
      <Head>
        <title>User Guide — Romeo and Juliet Explained</title>
        <meta name="description" content="Complete user guide for Romeo and Juliet Explained - learn how to navigate, select text, and use all features of this interactive Shakespeare tool." />
      </Head>
      
      <div className="guide-content">
        <div className="page-header">
          <Link href="/" className="back-button">
            <span className="icon">←</span>
            Back to Play
          </Link>
        </div>
        <h1 className="guide-title">User Guide</h1>
        <p className="guide-intro">
          Welcome to Romeo and Juliet Explained! This comprehensive guide will help you make the most 
          of all the features available in this interactive reading experience.
        </p>

        <div className="guide-section">
          <h2>Getting Started</h2>
          <div className="step">
            <h3>1. Reading the Play</h3>
            <p>
              The play text appears in the main column on the right. You can scroll through 
              the entire play or use the table of contents in the sidebar to jump to specific 
              acts and scenes.
            </p>
          </div>
          
          <div className="step">
            <h3>2. Selecting Text for Explanations</h3>
            <p>
              To get explanations for any part of the text:
            </p>
            <ul className="instruction-list">
              <li><strong>Single word:</strong> Click on any word to select its entire sentence</li>
              <li><strong>Custom range:</strong> Click and drag to select a specific passage</li>
              <li><strong>Multiple sentences:</strong> Hold Shift and click to extend your selection</li>
            </ul>
            <p>
              Once selected, the text will be highlighted in blue, and an explanation will appear 
              in the right column.
            </p>
          </div>
        </div>

        <div className="guide-section">
          <h2>Understanding Explanations</h2>
          <div className="step">
            <h3>What You'll See</h3>
            <p>
              Each explanation provides:
            </p>
            <ul className="feature-list">
              <li><strong>Vocabulary definitions</strong> - Meanings of archaic or difficult words</li>
              <li><strong>Syntax breakdown</strong> - How the sentence structure works</li>
              <li><strong>Cultural context</strong> - Historical background and references</li>
              <li><strong>Literary devices</strong> - Metaphors, allusions, and poetic techniques</li>
              <li><strong>Character insights</strong> - What the passage reveals about the characters</li>
            </ul>
          </div>

          <div className="step">
            <h3>Interactive Features</h3>
            <ul className="instruction-list">
              <li><strong>Click the explanation</strong> to highlight the corresponding text in the play</li>
              <li><strong>Ask follow-up questions</strong> using the chat interface for deeper understanding</li>
              <li><strong>Save explanations</strong> by clicking the save button to return to them later</li>
            </ul>
          </div>
        </div>

        <div className="guide-section">
          <h2>Navigation and Search</h2>
          <div className="step">
            <h3>Table of Contents</h3>
            <p>
              Use the sidebar to quickly navigate between acts and scenes. The current scene 
              is highlighted in the table of contents.
            </p>
          </div>

          <div className="step">
            <h3>Search Functionality</h3>
            <p>
              The search bar in the header allows you to:
            </p>
            <ul className="instruction-list">
              <li>Search for specific words or phrases throughout the entire play</li>
              <li>Use the navigation arrows to step through search results</li>
              <li>See a count of total matches found</li>
              <li>Search is case-insensitive and finds partial matches</li>
            </ul>
          </div>
        </div>

        <div className="guide-section">
          <h2>Advanced Features</h2>
          <div className="step">
            <h3>Saving and Managing Explanations</h3>
            <ul className="instruction-list">
              <li><strong>Auto-save:</strong> Explanations are automatically saved in your browser</li>
              <li><strong>Persistent storage:</strong> Your saved explanations persist between visits</li>
              <li><strong>Navigation:</strong> Use "Prev Ex" and "Next Ex" buttons to cycle through saved explanations</li>
              <li><strong>Sharing:</strong> Use "Copy Link" to share direct links to specific passages</li>
            </ul>
          </div>

          <div className="step">
            <h3>Printing and Export</h3>
            <ul className="instruction-list">
              <li><strong>Print View:</strong> Access a print-friendly version that includes your saved explanations</li>
              <li><strong>Clean layout:</strong> Print version removes UI elements for clean reading</li>
              <li><strong>Saved explanations:</strong> Your saved explanations appear alongside the text in print</li>
            </ul>
          </div>
        </div>

        <div className="guide-section">
          <h2>Mobile Experience</h2>
          <div className="step">
            <h3>Mobile-Optimized Interface</h3>
            <p>
              On mobile devices, the interface adapts for easier reading:
            </p>
            <ul className="instruction-list">
              <li>Table of contents becomes a collapsible drawer</li>
              <li>Explanations appear below the text instead of beside it</li>
              <li>Touch-friendly selection and navigation</li>
              <li>Responsive design works on all screen sizes</li>
            </ul>
          </div>
        </div>

        <div className="guide-section">
          <h2>Tips for Effective Use</h2>
          <div className="tips-grid">
            <div className="tip-card">
              <h4>🎯 Start Small</h4>
              <p>Begin with single words or short phrases to build confidence with the interface.</p>
            </div>
            <div className="tip-card">
              <h4>📚 Read Actively</h4>
              <p>Don't just read passively - select passages that confuse you or interest you.</p>
            </div>
            <div className="tip-card">
              <h4>💾 Save Key Passages</h4>
              <p>Save important quotes and their explanations for easy reference later.</p>
            </div>
            <div className="tip-card">
              <h4>🔍 Use Search</h4>
              <p>Search for recurring themes, character names, or important concepts.</p>
            </div>
            <div className="tip-card">
              <h4>❓ Ask Questions</h4>
              <p>Use the chat feature to ask follow-up questions about confusing passages.</p>
            </div>
            <div className="tip-card">
              <h4>📖 Print for Study</h4>
              <p>Use the print view to create study materials with your saved explanations.</p>
            </div>
          </div>
        </div>

        <div className="guide-section">
          <h2>Need Help?</h2>
          <p>
            If you have questions about using this tool or suggestions for improvement, 
            please visit the <Link href="/about" className="inline-link">About page</Link> 
            to find contact information or explore the source code.
          </p>
        </div>
      </div>
    </div>
  );
}

