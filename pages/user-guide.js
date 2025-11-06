import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function UserGuide() {
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setSelectedImage(null);
      }
    };
    if (selectedImage) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [selectedImage]);

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
          <h2>Three Levels of Use</h2>
          <p className="guide-intro">
            Whether you're reading Shakespeare for the first time or diving deep into the text, 
            this application adapts to your needs. Choose your level of engagement:
          </p>

          <div className="step">
            <h3>Beginner — Reading the Play</h3>
            <p>
              Scroll through the play from start to finish, or use the Table of Contents to jump 
              around. You'll find notes that explain some of the more difficult speeches. These notes 
              are provided by a Language Model and were generated while building the app, so they're 
              instantly available without any waiting.
            </p>
          </div>

          <div className="step">
            <h3>Intermediate — Control the Notes</h3>
            <p>
              Every speech has a note available. Click on any speech to reveal its note if it's 
              hidden, or hide it if it's visible.
            </p>
            <p>
              The colored circle icon at the top left controls how many notes are automatically visible. 
              Turn them all off for a clean reading experience, show them all for maximum help, or 
              choose anything in between using the slider.
            </p>
          </div>

          <div className="step">
            <h3>Advanced — Ask Questions</h3>
            <p>
              Click on a note to enable four ways to get more information about a passage by prompting 
              the Language Model while you wait:
            </p>
            <ul className="instruction-list">
              <li><strong>Ask follow-up questions:</strong> Use the chat interface to ask anything 
              about the passage. The AI will respond with detailed explanations based on your specific question.</li>
              <li><strong>Click the "More" button:</strong> Get a longer explanation for the whole speech without losing the original note.</li>
              <li><strong>Click on a sentence in the speech:</strong> Click anywhere in a speech to 
              automatically select that sentence and get an explanation focused specifically on that line.</li>
              <li><strong>Click-drag to select more or less than a sentence:</strong> Select precisely 
              what you want explained by clicking and dragging across any portion of text. This gives 
              you complete control over the selection.</li>
            </ul>
          </div>
        </div>

        <div className="guide-section">
          <h2>Getting Started</h2>
          <div className="step">
            <h3>1. Reading the Play</h3>
            <p>
              On desktop, the layout has three columns: the Table of Contents on the far left, 
              the play text in the middle column, and notes and explanations in the right column. 
              You can scroll through the entire play or use the Table of Contents to jump 
              to specific acts and scenes.
            </p>
          </div>
          
          <div className="step" id="notes-explanations">
            <h3>2. Notes and Explanations</h3>
            
            <div className="subsection">
              <h4>Understanding the Difference</h4>
              <p>This application provides two types of content to help you understand the play:</p>
              <ul className="instruction-list">
                <li><strong>Notes (Pre-computed):</strong> These are pre-written explanations that have been generated offline and stored with the play. They appear for specific speeches throughout the play and are immediately available when you click on the text. Notes are pre-selected to cover important passages and common points of confusion.</li>
                <li><strong>Explanations (On-Demand):</strong> These are generated in real-time by selecting any text in the play and requesting an explanation. When you select text, the application calls an AI API to create a custom explanation tailored to your specific selection. These explanations are generated on demand, so you can get help for any passage, not just those with pre-computed notes.</li>
              </ul>
            </div>

            <div className="subsection">
              <h4>How to Use Notes and Explanations</h4>
              <p>Here's how clicking and selecting in the text works:</p>
              <ul className="instruction-list">
                <li><strong>Reveal a note:</strong> If a pre-computed note exists for the current speech but isn't visible, a single click on the text reveals it. Click the text again to hide it, or use the <strong>✕</strong> button to close.</li>
                <li><strong>Select text for an explanation:</strong> Click and drag to select any passage, or click on a note to enable text selection mode, then select a specific part of that speech. When a note is visible, clicking the text automatically selects the entire sentence around your cursor.</li>
                <li><strong>Get explanations:</strong> A new explanation card appears in the right column (on desktop) or below the text (on mobile) as soon as you make a selection, showing "AI is thinking…" until the response is ready. Selected text is highlighted in blue.</li>
                <li><strong>Ask follow-up questions:</strong> Use the "Ask a follow‑up…" field or click <strong>More</strong> to get extended explanations. Each follow‑up appears in the conversation thread, and all threads are saved automatically between visits.</li>
              </ul>
            </div>

            <div className="subsection">
              <h4>Why Both Types Exist</h4>
              <p>
                <strong>Pre-computed notes</strong> provide instant access to carefully curated explanations for key passages, without requiring an API call. 
                <strong>On-demand explanations</strong> give you the flexibility to get help for any text you select, using the latest AI technology. 
                Together, they provide comprehensive coverage: notes for common questions, and explanations for your specific needs.
              </p>
            </div>
          </div>
        </div>

        <div className="guide-section">
          <h2>Understanding Explanations</h2>
          <div className="step" id="what-youll-see">
            <h3>What You'll See</h3>
            <ul className="feature-list">
              <li><strong>Immediate card:</strong> New explanation cards appear right away with a "thinking…" placeholder, then update with the final text.</li>
              <li><strong>Click to locate:</strong> Click any explanation card to highlight its source in the play.</li>
              <li><strong>Close with ✕:</strong> Use the <strong>✕</strong> button in the top‑right of any note or explanation card to close it.</li>
              <li><strong>Contents:</strong> Explanations include vocabulary help, clarification of tricky syntax, and a clear paraphrase focused on your selection.</li>
              <li><strong>Follow-up questions:</strong> The question appears in italics and indented, followed by the answer, matching the format of sentence selections.</li>
            </ul>
          </div>
        </div>

        <div className="guide-section">
          <h2>Navigation and Search</h2>
          <div className="step">
            <h3>Table of Contents</h3>
            <p>
              The Table of Contents in the left sidebar (or drawer on mobile) shows all acts and scenes. 
              The current scene is highlighted, and clicking any scene jumps directly to it.
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
              <li><strong>Auto-save:</strong> All explanations and follow-up threads are automatically saved in your browser and persist between visits</li>
              <li><strong>Navigation:</strong> Use the explanation arrows in the header to step through saved explanations</li>
              <li><strong>Remove:</strong> Close any explanation or note using the <strong>✕</strong> button</li>
            </ul>
          </div>

          <div className="step">
            <h3>Note Density Control</h3>
            <ul className="instruction-list">
              <li><strong>Header control:</strong> Click the circle icon in the header to open the note-density popover. Four presets (None, Some, Most, All) sit beside a continuous slider.</li>
              <li><strong>Immediate updates:</strong> Moving the slider updates the play instantly; the control also remembers your preference between visits.</li>
              <li><strong>Popover behavior:</strong> Click anywhere outside the popover (or press <kbd>Esc</kbd>) to close it.</li>
            </ul>
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div>
                  <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: 500 }}>Note Density Popover</p>
                  <img 
                    src="/user-guide-screenshots/note-density.jpg" 
                    alt="Note density control popover showing presets and slider"
                    onClick={() => setSelectedImage({ src: '/user-guide-screenshots/note-density.jpg', alt: 'Note density control popover showing presets and slider' })}
                    style={{ maxWidth: '100%', width: '100%', height: 'auto', border: '1px solid #e8e6e3', borderRadius: '8px', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: 500 }}>None</p>
                  <img 
                    src="/user-guide-screenshots/none.jpg" 
                    alt="No notes visible"
                    onClick={() => setSelectedImage({ src: '/user-guide-screenshots/none.jpg', alt: 'No notes visible' })}
                    style={{ maxWidth: '100%', width: '100%', height: 'auto', border: '1px solid #e8e6e3', borderRadius: '8px', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: 500 }}>Some</p>
                  <img 
                    src="/user-guide-screenshots/some.jpg" 
                    alt="Some notes visible"
                    onClick={() => setSelectedImage({ src: '/user-guide-screenshots/some.jpg', alt: 'Some notes visible' })}
                    style={{ maxWidth: '100%', width: '100%', height: 'auto', border: '1px solid #e8e6e3', borderRadius: '8px', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: 500 }}>Most</p>
                  <img 
                    src="/user-guide-screenshots/most.jpg" 
                    alt="Most notes visible"
                    onClick={() => setSelectedImage({ src: '/user-guide-screenshots/most.jpg', alt: 'Most notes visible' })}
                    style={{ maxWidth: '100%', width: '100%', height: 'auto', border: '1px solid #e8e6e3', borderRadius: '8px', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: 500 }}>All</p>
                  <img 
                    src="/user-guide-screenshots/all.jpg" 
                    alt="All notes visible"
                    onClick={() => setSelectedImage({ src: '/user-guide-screenshots/all.jpg', alt: 'All notes visible' })}
                    style={{ maxWidth: '100%', width: '100%', height: 'auto', border: '1px solid #e8e6e3', borderRadius: '8px', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
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
            <h3>Printing for Offline Reading</h3>
            <p>
              Printing is an interesting option if you want to reduce your screen time. You can print a scene, 
              an act, or the whole play with all the notes you've revealed during your reading session.
            </p>
            <ul className="instruction-list">
              <li><strong>Access Print View:</strong> Click the Print button (🖨️) in the header to open the print-friendly version</li>
              <li><strong>Filter by Act/Scene:</strong> Use the dropdown menus at the top to select a specific act and scene, or leave them set to "All" to print the entire play</li>
              <li><strong>What Gets Printed:</strong> Only the notes you've revealed (based on your note density setting) will be included in the print. Notes appear after their corresponding speeches in portrait mode, or in the right column in landscape mode</li>
              <li><strong>Portrait vs Landscape:</strong> 
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Portrait mode:</strong> Single column layout with notes appearing below each speech</li>
                  <li><strong>Landscape mode:</strong> Two-column layout with play text on the left and explanations on the right</li>
                </ul>
              </li>
              <li><strong>Save as PDF:</strong> When you click Print, use your browser's "Save as PDF" option to generate a PDF file</li>
              <li><strong>Send to Kindle:</strong> You can email the PDF to your Kindle's email address (found in your Amazon account settings) to read on your e-reader, reducing screen time while still having access to your personalized notes</li>
              <li><strong>Clean Layout:</strong> The print version removes all UI elements (navigation, search, buttons) for a clean reading experience</li>
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
              <p>Use the follow-up feature to ask specific questions about confusing passages or request more detail.</p>
            </div>
            <div className="tip-card">
              <h4>📖 Print for Offline Study</h4>
              <p>Reduce screen time by printing scenes, acts, or the whole play with your revealed notes. Generate a PDF and send it to your Kindle for comfortable e-reader reading.</p>
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
      {selectedImage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
            cursor: 'pointer'
          }}
          onClick={() => setSelectedImage(null)}
        >
          <img 
            src={selectedImage.src}
            alt={selectedImage.alt}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
            }}
            onClick={() => setSelectedImage(null)}
          />
        </div>
      )}
    </div>
  );
}
