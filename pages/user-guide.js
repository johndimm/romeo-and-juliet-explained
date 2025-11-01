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
          
          <div className="step" id="notes-explanations">
            <h3>2. Notes and Explanations</h3>
            <p>Here’s how clicking in the text works:</p>
            <ul className="instruction-list">
              <li><strong>Reveal a note:</strong> If a prewritten note exists for the current speech but isn’t visible, a single click on the text reveals it. Use the <strong>✕</strong> in the note’s top‑right to close it. Clicking the text again does not close the note.</li>
              <li><strong>Select a sentence:</strong> When a note is visible, clicking the text selects the entire sentence around your cursor.</li>
              <li><strong>Select a custom range:</strong> Click‑drag to select any passage (longer or shorter than a sentence).</li>
              <li><strong>Immediate feedback:</strong> A new explanation card appears on the right as soon as you select, showing “AI is thinking…” until the response is ready.</li>
              <li><strong>Ask for more:</strong> Click <strong>More</strong> (or use the “Ask a follow‑up…” field) to get an extended explanation without losing the original note. Each follow‑up appears in the mini chat under the note, along with the provider/model used, and the entire thread is saved automatically.</li>
            </ul>
            <p>Selected text is highlighted in blue. Follow‑up responses and “More” expansions persist between visits, so you can build a running commentary for any speech.</p>
          </div>
        </div>

        <div className="guide-section">
          <h2>Understanding Explanations</h2>
          <div className="step" id="what-youll-see">
            <h3>What You'll See</h3>
            <ul className="feature-list">
              <li><strong>Immediate card:</strong> New explanation cards appear right away with a “thinking…” placeholder, then update with the final text.</li>
              <li><strong>Click to locate:</strong> Click any explanation card to highlight its source in the play.</li>
              <li><strong>Close with ✕:</strong> Both notes and explanation cards use the <strong>✕</strong> in the top‑right to close.</li>
              <li><strong>Contents:</strong> short vocabulary help, any tricky syntax, and a clear paraphrase focused on your selection.</li>
            </ul>
          </div>

          <div className="step" id="demo-video">
            <h3>Video Demonstration</h3>
            <p>A short video walkthrough of notes and selections will be embedded here.</p>
          </div>

          <div className="step">
            <h3>Interactive Features</h3>
            <ul className="instruction-list">
              <li><strong>Click the explanation</strong> to highlight the corresponding text in the play</li>
              <li><strong>Ask follow-up questions</strong> using the chat interface for deeper understanding</li>
              <li><strong>More button</strong> adds a richer AI response beneath the note instead of replacing the original text</li>
              <li><strong>Saved threads</strong> (notes plus follow-ups) automatically persist between sessions</li>
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
              <li><strong>Navigation:</strong> Use the explanation arrows in the header to step through saved explanations</li>
              <li><strong>Remove:</strong> Close an explanation with the <strong>✕</strong> in its corner</li>
            </ul>
          </div>

          <div className="step">
            <h3>Note Density Control</h3>
            <ul className="instruction-list">
              <li><strong>Header control:</strong> Click the circle icon in the header to open the note-density popover. Four presets (None, Some, Most, All) sit beside a continuous slider.</li>
              <li><strong>Immediate updates:</strong> Moving the slider updates the play instantly; the control also remembers your preference between visits.</li>
              <li><strong>Popover behavior:</strong> Click anywhere outside the popover (or press <kbd>Esc</kbd>) to close it.</li>
            </ul>
          </div>

          <div className="step">
            <h3>Font Size & Pinch Gestures</h3>
            <ul className="instruction-list">
              <li><strong>Settings slider:</strong> Adjust the global font scale from Settings → Font Size.</li>
              <li><strong>Pinch to zoom:</strong> On touch devices, pinch anywhere on the page to resize the text. On desktop, use <kbd>Ctrl</kbd>+scroll (or <kbd>Cmd</kbd>+scroll on macOS).</li>
              <li><strong>Saved preference:</strong> The font scale syncs across tabs and persists after reload.</li>
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
