export default async function handler(req, res) {
  // Set CORS headers for all responses (must be set before any response)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    selectionText,
    context, // { act, scene, speaker, onStage }
    contextText, // optional scene excerpt up to selection
    noteText, // optional prewritten note for the current speech
    options, // { model, language, educationLevel, age }
    messages, // optional prior conversation [{role, content}]
    mode, // 'brief' | 'more' | 'followup'
    followup // optional user followup string
  } = req.body || {};

  if (!selectionText || !context) {
    // CORS headers already set at top
    return res.status(400).json({ error: 'Missing selectionText or context' });
  }

  const provider = (options?.provider || 'openai').toLowerCase();
  let model = options?.model;
  // Pick a sensible default per provider and coerce incompatible names
  function pickModel(p, m) {
    if (p === 'openai') {
      if (!m || !/^gpt-/.test(m)) return 'gpt-4o-mini';
      return m;
    }
    if (p === 'anthropic') {
      if (!m || !/^claude/.test(m)) return 'claude-3-sonnet-20240229';
      return m;
    }
    if (p === 'deepseek') {
      if (!m || !/deepseek/.test(m)) return 'deepseek-chat';
      return m;
    }
    if (p === 'gemini') {
      // Prefer the 1.5 pro/flash latest variants
      if (!m || !/^gemini/.test(m)) return 'gemini-1.5-pro-latest';
      return /-latest$/.test(m) ? m : `${m}-latest`;
    }
    return m || 'gpt-4o-mini';
  }
  model = pickModel(provider, model);
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
    'Assume adjacent paragraphs may also be explained: avoid repeating the same scene-level theme or plot point in every note; focus on what is new or specific to these exact lines. If a point was already covered just before, add only the fresh detail and keep it short.',
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
    (contextText && contextText.trim().length ? 'Scene context excerpt (up to these lines; do not quote it):' : null),
    (contextText && contextText.trim().length ? '"""' : null),
    (contextText && contextText.trim().length ? contextText : null),
    (contextText && contextText.trim().length ? '"""' : null),
    (contextText && contextText.trim().length ? '' : null),
    (noteText && noteText.trim().length ? 'Existing note for these lines (the user will see both the note and your response; do not repeat or paraphrase information already in the note):' : null),
    (noteText && noteText.trim().length ? '"""' : null),
    (noteText && noteText.trim().length ? noteText : null),
    (noteText && noteText.trim().length ? '"""' : null),
    (noteText && noteText.trim().length ? '' : null),
    'Context for grounding (do not restate it):',
    ctxLines.join('\n') || 'N/A',
    '',
    (noteText && noteText.trim().length && (mode === 'followup' || mode === 'more') ? 'IMPORTANT: Your response will be appended to the existing note above. Focus on adding new information, insights, or details that are not already covered in the note. Do not repeat or rephrase what is already there.' : null),
    (noteText && noteText.trim().length && mode !== 'followup' && mode !== 'more' ? 'Focus on helping the reader parse the sentence: clarify unfamiliar/archaic words and any inverted or compressed syntax, then give a clear paraphrase.' : null),
    (!noteText || mode === 'brief' ? 'Focus on helping the reader parse the sentence: clarify unfamiliar/archaic words and any inverted or compressed syntax, then give a clear paraphrase.' : null),
    mode === 'brief' ? 'Brief mode: 2-3 sentences; weave clarifications naturally into the paraphrase.' : null,
    mode === 'more' ? (noteText && noteText.trim().length ? 'More mode: add additional detail, context, or insights that build on the existing note without repeating it.' : 'More mode: add a little more detail; if helpful, include very short glosses (word — meaning) before the paraphrase.') : null,
    mode === 'followup' && followup ? `Follow-up question: ${followup}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const history = Array.isArray(messages) ? messages.slice(-10) : [];
  const shouldLogPrompt = true;
  if (shouldLogPrompt) {
    console.log('[prompt]', JSON.stringify({ mode, provider, model }, null, 2));
    console.log('[prompt text]\n' + userPrompt);
  }

  try {
    let content = '';
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'Missing OPENAI_API_KEY. Set it in .env.local' });
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: 'system', content: sys }, ...history, { role: 'user', content: userPrompt }] }),
      });
      if (!resp.ok) return res.status(500).json({ error: 'LLM request failed', detail: await resp.text() });
      const data = await resp.json();
      content = data?.choices?.[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'Missing ANTHROPIC_API_KEY. Set it in .env.local' });
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          temperature: 0.3,
          system: sys,
          messages: [...history, { role: 'user', content: userPrompt }].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!resp.ok) return res.status(500).json({ error: 'LLM request failed', detail: await resp.text() });
      const data = await resp.json();
      content = data?.content?.[0]?.text || '';
    } else if (provider === 'deepseek') {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'Missing DEEPSEEK_API_KEY. Set it in .env.local' });
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: 'system', content: sys }, ...history, { role: 'user', content: userPrompt }] }),
      });
      if (!resp.ok) return res.status(500).json({ error: 'LLM request failed', detail: await resp.text() });
      const data = await resp.json();
      content = data?.choices?.[0]?.message?.content || '';
    } else if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'Missing GEMINI_API_KEY. Set it in .env.local' });
      async function callGemini(mod) {
        const geminiModel = encodeURIComponent(mod);
        return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${sys}\n\n${userPrompt}` }] }] }),
        });
      }
      // Try a small set of common Gemini model aliases in order
      const candidates = Array.from(new Set([
        model,
        /-latest$/.test(model) ? model : `${model}-latest`,
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash-latest',
        'gemini-pro',
        'gemini-pro-latest',
      ]));
      let resp = null;
      let okModel = null;
      for (const mod of candidates) {
        try {
          const r = await callGemini(mod);
          if (r.ok) { resp = r; okModel = mod; break; }
        } catch (e) { /* ignore and continue */ }
      }
      if (!resp || !resp.ok) {
        const detail = resp ? await resp.text() : 'no response';
        return res.status(502).json({
          error: 'Gemini model unavailable',
          detail,
          tried: candidates,
        });
      }
      model = okModel || model;
      {
        const data = await resp.json();
        content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    return res.status(200).json({ content });
  } catch (e) {
    console.error('LLM request error:', e);
    // CORS headers already set at top
    return res.status(502).json({ error: 'LLM request error', detail: String(e) });
  }
}
