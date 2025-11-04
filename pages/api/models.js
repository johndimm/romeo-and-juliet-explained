import { setCorsHeaders, handleCorsPreflight } from '../../lib/cors';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (handleCorsPreflight(req, res)) return;
  
  // Set CORS headers for all responses (must be set before any response)
  setCorsHeaders(res);
  
  const provider = (req.query.provider || 'openai').toLowerCase();

  async function listOpenAI() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return ['gpt-4o-mini', 'gpt-4o'];
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) throw new Error(`OpenAI list models failed: ${r.status}`);
      const data = await r.json();
      const ids = (data?.data || []).map((m) => m.id).filter((id) => /^gpt/i.test(id));
      // ensure some sensible order and fallback
      const set = new Set(['gpt-4o-mini', 'gpt-4o', ...ids]);
      return Array.from(set);
    } catch {
      return ['gpt-4o-mini', 'gpt-4o'];
    }
  }

  async function listAnthropic() {
    // Anthropic does not have a public list endpoint; provide a curated list
    return [
      'claude-3-sonnet-20240229',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  async function listDeepseek() {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return ['deepseek-chat', 'deepseek-reasoner'];
    try {
      const r = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) throw new Error('deepseek list failed');
      const data = await r.json();
      const names = (data?.data || []).map((m) => m.id || m.name).filter(Boolean);
      const set = new Set(['deepseek-chat', 'deepseek-reasoner', ...names]);
      return Array.from(set);
    } catch {
      return ['deepseek-chat', 'deepseek-reasoner'];
    }
  }

  async function listGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!r.ok) throw new Error('gemini list failed');
      const data = await r.json();
      const names = (data?.models || [])
        .map((m) => m.name?.split('/').pop())
        .filter((n) => /^gemini/i.test(n));
      const withLatest = names.map((n) => (/-latest$/.test(n) ? n : `${n}-latest`));
      const set = new Set(['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', ...withLatest]);
      return Array.from(set);
    } catch {
      return ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'];
    }
  }

  try {
    let models;
    if (provider === 'openai') models = await listOpenAI();
    else if (provider === 'anthropic') models = await listAnthropic();
    else if (provider === 'deepseek') models = await listDeepseek();
    else if (provider === 'gemini') models = await listGemini();
    else models = await listOpenAI();
    res.status(200).json({ models });
  } catch (e) {
    // Ensure CORS headers are set even on error
    setCorsHeaders(res);
    res.status(500).json({ error: 'list models failed', detail: String(e) });
  }
}

