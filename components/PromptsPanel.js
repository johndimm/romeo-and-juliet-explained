export default function PromptsPanel() {
  // Example for selected text explanation
  const exampleSelectedText = `O, she doth teach the torches to burn bright!
It seems she hangs upon the cheek of night
As a rich jewel in an Ethiope's ear;`;

  const examplePriorNote = `He asks who the lady is that the knight is holding hands with.`;

  const exampleCurrentNote = `He exclaims that her beauty outshines the torches, comparing her to a jewel in an Ethiopian's ear and a dove among crows. He vows to touch her hand after the dance and renounces his past loves, declaring this his first sight of true beauty. This speech marks his instant infatuation with Juliet.`;

  const selectedTextSystemPrompt = `<role>
You are a helpful literature tutor who explains Romeo and Juliet clearly and accurately.
</role>

<audience>
Audience: Undergraduate level, approx. age 20.
Language: English.
</audience>

<goal>
Write the explanation directly. Do not start with filler like "In this quote", "In this passage", or meta commentary.
</goal>

<constraint>
Do not repeat the quoted text and do not restate Act/Scene/Speaker unless explicitly asked.
</constraint>

<requirement>
Avoid boilerplate claims such as "this pivotal moment", "it foreshadows", "it underscores the theme", or "it sets the stage" unless the specific lines clearly justify it. Only mention themes or foreshadowing when directly supported by the passage, and be concrete.
</requirement>

<requirement>
Prefer precise paraphrase + immediate dramatic function (who says it, to whom, why) over vague generalities.
</requirement>

<requirement>
Help the reader parse the sentence: briefly clarify unfamiliar or archaic words/idioms (e.g., anon, wherefore, hie, shrift) and any tricky syntax (inversions, ellipses).
</requirement>

<requirement>
Provide a plain-English paraphrase that preserves the meaning and shows how the clauses connect.
</requirement>

<requirement>
If there are no unfamiliar terms or unusual syntax, keep the focus on a concise paraphrase.
</requirement>

<requirement>
If the lines are simple stage business, humor, or exposition with no larger significance, say so plainly.
</requirement>

<constraint>
Assume adjacent paragraphs may also be explained: avoid repeating the same scene-level theme or plot point in every note; focus on what is new or specific to these exact lines. If a point was already covered just before, add only the fresh detail and keep it short.
</constraint>

<requirement>
When asked for a brief explanation, keep it to 2-3 sentences max.
</requirement>

<requirement>
When asked for more, expand with relevant context, metaphors, and themes, but stay concise and focused on the selected passage.
</requirement>`;

  const selectedTextUserPrompt = `<task>
Explain the following line(s) from Romeo and Juliet.
</task>

<quote>
Quote (for your reference only; do not repeat it):
"""
${exampleSelectedText}
"""
</quote>

<existing_notes>
Existing notes (the user will see both the notes and your response; do not repeat or paraphrase information already in the notes):
"""
Note for prior speech:
${examplePriorNote}

Note for current speech:
${exampleCurrentNote}
"""
</existing_notes>

<context>
Context for grounding (do not restate it):
Act: I
Scene: V
Speaker: ROMEO
Characters on stage: Romeo, Juliet, Capulet, Tybalt, others
</context>

<instruction>
Focus on helping the reader parse the sentence: clarify unfamiliar/archaic words and any inverted or compressed syntax, then give a clear paraphrase.
</instruction>`;

  const selectedTextExampleResponse = `Romeo compares Juliet's beauty to a torch that outshines other lights. "Ethiope" refers to an Ethiopian person, used here to contrast the darkness of night with the brightness of Juliet's beauty. The metaphor suggests that Juliet's radiance is so striking that it makes the night itself appear beautiful, like a precious jewel that stands out against dark skin. Romeo is expressing his immediate, overwhelming attraction to Juliet at the Capulet ball.`;

  // Character map example
  const characterMapExample = `Act,Scene,Line,ByteOffset,DirectionLine,ROMEO,JULIET,CAPULET,TYBALT
I,V,1139,29828," Enter Capulet, &c. with the Guests and Gentlewomen to the Maskers.",0,0,1,0
I,V,1150,30120, Enter Romeo.,1,0,1,0
I,V,1155,30250, Enter Tybalt.,1,0,1,1
I,V,1200,31500, [_Exeunt._],0,0,0,0`;

  // Example from Act I, Scene I - first few speeches
  const exampleSceneText = `SAMPSON.
Gregory, on my word, we'll not carry coals.

GREGORY.
No, for then we should be colliers.

SAMPSON.
I mean, an we be in choler, we'll draw.

GREGORY.
Ay, while you live, draw your neck out of collar.`;

  const exampleSpeeches = [
    { speaker: 'SAMPSON', startOffset: 2823, endOffset: 2879 },
    { speaker: 'GREGORY', startOffset: 2879, endOffset: 2925 },
    { speaker: 'SAMPSON', startOffset: 2925, endOffset: 2977 },
    { speaker: 'GREGORY', startOffset: 2977, endOffset: 3043 }
  ];

  const precomputedSystemPrompt = `<role>
You are a careful Shakespeare tutor. Given a full scene of Romeo and Juliet and the list of speeches (speaker + byte offsets),
write an explanation for each speech that is precise, non-repetitive across the scene, and helpful to a student reader.
</role>

<priority>
Prioritize: (a) brief glosses for archaic words/idioms where needed; (b) a clear explanation of the meaning that connects the clauses; (c) a brief note of dramatic purpose when relevant.
</priority>

<requirement>
Also include a difficulty rating per speech as "perplexity" on a 0–100 scale (0 easy – 100 very difficult) for a typical high‑school reader, based on archaic vocabulary, inverted/elliptical syntax, dense metaphor, and needed cultural context.
</requirement>

<constraint>
Do NOT restate act/scene/speaker, do NOT re-quote the lines, and do NOT prefix with labels like "Paraphrase:", "Summary:", or similar. The content should be plain sentences only.
</constraint>

<output_format>
Your output MUST be a strict JSON array ONLY, no extra prose, no Markdown fences, no comments. Each item must have exactly these fields:

[
  {
    "speaker": "SAMPSON",
    "startOffset": 2823,
    "endOffset": 2879,
    "content": "Sampson declares they will not endure insults, using the idiom 'carry coals' to mean tolerate humiliation.",
    "perplexity": 65
  },
  {
    "speaker": "GREGORY",
    "startOffset": 2879,
    "endOffset": 2925,
    "content": "Gregory puns that if they carried coals they would be colliers (coal-carriers), a dirty and lowly job.",
    "perplexity": 70
  }
]

Use double quotes for all JSON strings. No trailing commas. The array length must equal the number of provided speeches. Format with indentation and multiple lines as shown above.
</output_format>`;

  const precomputedUserPrompt = `<scene>
Act I, Scene I
</scene>

<scene_text>
Scene text (UTF-8; byte offsets refer to this same edition):
[Note: The full scene text would be much longer; this example shows only the first few speeches]
"""
${exampleSceneText}
"""
</scene_text>

<speeches>
Speeches with byte ranges (array length N):
${JSON.stringify(exampleSpeeches, null, 2)}
</speeches>

<task>
Return JSON array of length N (one per speech), in order, matching each entry by startOffset/endOffset.
</task>`;

  const precomputedExampleResponse = `[
  {
    "speaker": "SAMPSON",
    "startOffset": 2823,
    "endOffset": 2879,
    "content": "Sampson declares they will not endure insults, using the idiom 'carry coals' to mean tolerate humiliation.",
    "perplexity": 65
  },
  {
    "speaker": "GREGORY",
    "startOffset": 2879,
    "endOffset": 2925,
    "content": "Gregory puns that if they carried coals they would be colliers (coal-carriers), a dirty and lowly job.",
    "perplexity": 70
  },
  {
    "speaker": "SAMPSON",
    "startOffset": 2925,
    "endOffset": 2977,
    "content": "Sampson says if they become angry (in choler), they will draw their swords.",
    "perplexity": 60
  },
  {
    "speaker": "GREGORY",
    "startOffset": 2977,
    "endOffset": 3043,
    "content": "Gregory puns on 'draw' as pulling one's neck out of a hangman's collar, mocking Sampson's bravery.",
    "perplexity": 75
  }
]`;

  // Helper function to render prompts with XML tags highlighted
  const renderStructuredPrompt = (prompt) => {
    // Parse XML-style tags and render them with highlighting
    const parts = [];
    let currentPos = 0;
    const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let match;
    let lastIndex = 0;
    
    while ((match = tagRegex.exec(prompt)) !== null) {
      // Add text before the tag
      if (match.index > lastIndex) {
        const beforeText = prompt.substring(lastIndex, match.index);
        if (beforeText.trim()) {
          parts.push({ type: 'text', content: beforeText });
        }
      }
      
      // Add the tagged content
      const tagName = match[1];
      const tagContent = match[2];
      parts.push({ type: 'tag', tagName, content: tagContent });
      
      lastIndex = tagRegex.lastIndex;
    }
    
    // Add remaining text after last tag
    if (lastIndex < prompt.length) {
      const afterText = prompt.substring(lastIndex);
      if (afterText.trim()) {
        parts.push({ type: 'text', content: afterText });
      }
    }
    
    // If no tags found, just render as text
    if (parts.length === 0) {
      parts.push({ type: 'text', content: prompt });
    }
    
    return (
      <div className="prompt-structured">
        {parts.map((part, idx) => {
          if (part.type === 'tag') {
            const tagLabel = part.tagName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return (
              <div key={idx} className="prompt-xml-tag">
                <span className="prompt-xml-tag-name">&lt;{part.tagName}&gt;</span>
                <div className="prompt-xml-tag-content">
                  {part.content.split('\n').map((line, lineIdx) => (
                    <div key={lineIdx}>{line || '\u00A0'}</div>
                  ))}
                </div>
                <span className="prompt-xml-tag-name">&lt;/{part.tagName}&gt;</span>
              </div>
            );
          } else {
            return (
              <div key={idx} className="prompt-text-block">
                {part.content.split('\n').map((line, lineIdx) => (
                  <div key={lineIdx}>{line || '\u00A0'}</div>
                ))}
              </div>
            );
          }
        })}
      </div>
    );
  };

  return (
    <div className="prompts-page">
      <div className="prompts-content">
        <h1 className="prompts-title">Prompts</h1>
        <p className="prompts-intro">
          This page shows the actual prompts used for generating explanations in the app, with real examples.
        </p>

        <div className="prompts-section">
          <h2>Selected Text Explanations</h2>
          <p>
            When a user selects text in the play, we send the selected passage along with context about the act, scene, speaker, 
            and characters on stage. The system prompt includes the user's preferences (education level, age, language).
          </p>
          
          <div className="prompt-block">
            <h3>System Prompt</h3>
            <div className="prompt-code">{renderStructuredPrompt(selectedTextSystemPrompt)}</div>
          </div>

          <div className="prompt-block">
            <h3>User Prompt (Example)</h3>
            <div className="prompt-code">{renderStructuredPrompt(selectedTextUserPrompt)}</div>
          </div>

          <div className="prompt-block">
            <h3>Example Response</h3>
            <pre className="prompt-code">{selectedTextExampleResponse}</pre>
          </div>
        </div>

        <div className="prompts-section">
          <h2>Character Map</h2>
          <p>
            The character map is a CSV file that tracks which characters are on stage at each point in the play. 
            It's built by parsing stage directions (Enter, Exit, Exeunt) and tracking character movements throughout the play. 
            This information is used to provide context when generating explanations, so the model knows who is speaking to whom.
          </p>
          <p>
            The character map is stored in <code>data/character_map.csv</code> and is used by the app to determine 
            which characters are present at any given byte offset in the text.
          </p>
          
          <div className="prompt-block">
            <h3>Example Character Map (CSV)</h3>
            <pre className="prompt-code">{characterMapExample}</pre>
            <p className="prompt-note">
              Each row represents a stage direction event. Columns show which characters are on stage (1) or off stage (0) 
              after that event. The "DirectionLine" column shows the original stage direction text.
            </p>
          </div>
        </div>

        <div className="prompts-section">
          <h2>Pre-computed Notes</h2>
          <p>
            For pre-computed notes, we pass the <strong>entire scene text</strong> along with a list of all speeches in that scene. 
            The model returns a JSON array with one explanation per speech. This approach ensures the model understands the full context 
            of what's happening in the scene, preventing errors that could occur if speeches were processed individually without context.
          </p>
          <p>
            <strong>Important:</strong> There is a pre-computed note for <strong>every speech</strong> in the play. However, depending on 
            the note density setting (controlled by the slider in the header), not all notes are visible. Notes with <strong>lower perplexity</strong> 
            (easier passages) are hidden when the density is set lower, so users see notes only for the more challenging passages. 
            This allows readers to focus on the parts they need help with most.
          </p>
          
          <div className="prompt-block">
            <h3>System Prompt</h3>
            <div className="prompt-code">{renderStructuredPrompt(precomputedSystemPrompt)}</div>
          </div>

          <div className="prompt-block">
            <h3>User Prompt (Example: Act I, Scene I)</h3>
            <div className="prompt-code">{renderStructuredPrompt(precomputedUserPrompt)}</div>
          </div>

          <div className="prompt-block">
            <h3>Example Response (JSON Array)</h3>
            <pre className="prompt-code">{precomputedExampleResponse}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
