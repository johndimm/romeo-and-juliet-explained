export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    selectionText,
    context, // { act, scene, speaker, onStage }
    options, // { model, language, educationLevel, age }
    messages, // optional prior conversation [{role, content}]
    mode, // 'brief' | 'more' | 'followup'
    followup // optional user followup string
  } = req.body || {};

  if (!selectionText || !context) {
    return res.status(400).json({ error: 'Missing selectionText or context' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }

  const model = options?.model || 'gpt-4o-mini';
  const language = options?.language || 'English';
  const edu = options?.educationLevel || 'High school';
  const age = options?.age || '16';

  const sys = [
    'You are a helpful literature tutor who explains Romeo and Juliet clearly and accurately.',
    `Audience: ${edu} level, approx. age ${age}.`,
    `Language: ${language}.`,
    'Write the explanation directly. Do not start with filler like "In this quote", "In this passage", or meta commentary.',
    'Do not repeat the quoted text and do not restate Act/Scene/Speaker unless explicitly asked.',
    'Avoid boilerplate claims such as "this pivotal moment", "it foreshadows", "it underscores the theme", or "it sets the stage" unless the specific lines clearly justify it. Only mention themes or foreshadowing when directly supported by the passage, and be concrete.',
    'Prefer precise paraphrase + immediate dramatic function (who says it, to whom, why) over vague generalities.',
    'Help the reader parse the sentence: briefly clarify unfamiliar or archaic words/idioms (e.g., anon, wherefore, hie, shrift) and any tricky syntax (inversions, ellipses).',
    'Provide a plain-English paraphrase that preserves the meaning and shows how the clauses connect.',
    'If there are no unfamiliar terms or unusual syntax, keep the focus on a concise paraphrase.',
    'If the lines are simple stage business, humor, or exposition with no larger significance, say so plainly.',
    'When asked for a brief explanation, keep it to 2-3 sentences max.',
    'When asked for more, expand with relevant context, metaphors, and themes, but stay concise and focused on the selected passage.',
  ].join('\n');

  const ctxLines = [];
  if (context.act) ctxLines.push(`Act: ${context.act}`);
  if (context.scene) ctxLines.push(`Scene: ${context.scene}`);
  if (context.speaker) ctxLines.push(`Speaker: ${context.speaker}`);
  if (Array.isArray(context.onStage)) ctxLines.push(`Characters on stage: ${context.onStage.join(', ')}`);

  const userPrompt = [
    'Explain the following line(s) from Romeo and Juliet.',
    '',
    'Quote (for your reference only; do not repeat it):',
    '"""',
    selectionText,
    '"""',
    '',
    'Context for grounding (do not restate it):',
    ctxLines.join('\n') || 'N/A',
    '',
    'Focus on helping the reader parse the sentence: clarify unfamiliar/archaic words and any inverted or compressed syntax, then give a clear paraphrase.',
    mode === 'brief' ? 'Brief mode: 2-3 sentences; weave clarifications naturally into the paraphrase.' : null,
    mode === 'more' ? 'More mode: add a little more detail; if helpful, include very short glosses (word — meaning) before the paraphrase.' : null,
    mode === 'followup' && followup ? `Follow-up question: ${followup}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const history = Array.isArray(messages) ? messages.slice(-10) : [];

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: sys },
          ...history,
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(500).json({ error: 'LLM request failed', detail: text });
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content });
  } catch (e) {
    return res.status(500).json({ error: 'LLM request error', detail: String(e) });
  }
}
