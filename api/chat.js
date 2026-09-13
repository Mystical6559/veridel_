// /api/chat — a server-side proxy that tries several FREE AI providers in
// order and automatically falls back to the next one if a provider is
// unavailable, rate-limited, or out of quota ("tokens run out").
//
// Why this exists: index.html calls this endpoint expecting an
// Anthropic-shaped response ({ content: [{ type:"text", text:"..." }] }) —
// that contract is kept exactly the same here so NOTHING in index.html
// needs to change. Internally, this file translates the request into each
// provider's own format, tries them in order, and returns the first
// successful reply.
//
// Providers tried, in order (skips any without its API key configured):
//   1. Groq        — GROQ_API_KEY        (console.groq.com, free, no card)
//   2. Gemini       — GEMINI_API_KEY      (aistudio.google.com/apikey, free, no card)
//   3. OpenRouter   — OPENROUTER_API_KEY  (openrouter.ai, free ":free" models, no card)
//   4. Cerebras     — CEREBRAS_API_KEY    (cloud.cerebras.ai, free, no card)
//
// Set as many or as few of these as you like in Vercel -> Project ->
// Settings -> Environment Variables. If NONE are set, this route returns a
// 501 and the front-end quietly falls back to its own rule-based matching
// engine (search still works; AI wording polish + chat won't).
//
// Free-tier notes (check each provider's dashboard/docs if a model 404s —
// free model names/limits shift over time):
//   - Groq: generous free rate limits on Llama models.
//   - Gemini: free tier via Google AI Studio, no billing required.
//   - OpenRouter: only models with a ":free" suffix are free; the catalog
//     of which models are free rotates — see openrouter.ai/models?max_price=0
//   - Cerebras: free developer tier with daily token limits.

function buildOpenAIMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages || []) out.push({ role: m.role, content: m.content });
  return out;
}

// Groq, OpenRouter, and Cerebras all speak the same OpenAI-style
// chat-completions format, so one helper covers all three.
async function callOpenAICompatible({ url, apiKey, model, system, messages, maxTokens, extraHeaders, signal }) {
  const resp = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(extraHeaders || {})
    },
    body: JSON.stringify({
      model,
      messages: buildOpenAIMessages(system, messages),
      max_tokens: maxTokens
    })
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} — ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('empty response');
  return text;
}

// Gemini has its own request/response shape and role names ("model" instead
// of "assistant", no "system" role — system goes in a separate field).
async function callGemini({ apiKey, model, system, messages, maxTokens, signal }) {
  const contents = (messages || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { maxOutputTokens: maxTokens }
    })
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} — ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = parts && parts.map(p => p.text || '').join('');
  if (!text) throw new Error('empty response');
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { system, messages } = req.body || {};
  if (!messages) {
    return res.status(400).json({ error: 'Request body must include "messages".' });
  }
  // Cap server-side regardless of what the client asks for, so a stray or
  // malicious request can't run up an unusually large response.
  const maxTokens = Math.min(Number(req.body && req.body.max_tokens) || 800, 1024);

  const providers = [
    {
      name: 'groq',
      enabled: !!process.env.GROQ_API_KEY,
      call: signal => callOpenAICompatible({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: process.env.GROQ_API_KEY,
        model: 'llama-3.3-70b-versatile',
        system, messages, maxTokens, signal
      })
    },
    {
      name: 'gemini',
      enabled: !!process.env.GEMINI_API_KEY,
      call: signal => callGemini({
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-2.0-flash',
        system, messages, maxTokens, signal
      })
    },
    {
      name: 'openrouter',
      enabled: !!process.env.OPENROUTER_API_KEY,
      call: signal => callOpenAICompatible({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: process.env.OPENROUTER_API_KEY,
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        extraHeaders: { 'X-Title': 'Veridel' },
        system, messages, maxTokens, signal
      })
    },
    {
      name: 'cerebras',
      enabled: !!process.env.CEREBRAS_API_KEY,
      call: signal => callOpenAICompatible({
        url: 'https://api.cerebras.ai/v1/chat/completions',
        apiKey: process.env.CEREBRAS_API_KEY,
        model: 'llama-3.3-70b',
        system, messages, maxTokens, signal
      })
    }
  ];

  const active = providers.filter(p => p.enabled);
  if (!active.length) {
    return res.status(501).json({
      error: 'No AI provider is configured on this deployment. Add at least one of ' +
             'GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY in ' +
             'Vercel Project Settings -> Environment Variables, then redeploy.'
    });
  }

  const errors = [];
  for (const provider of active) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const text = await provider.call(controller.signal);
      clearTimeout(timeoutId);
      return res.status(200).json({ content: [{ type: 'text', text }], provider: provider.name });
    } catch (err) {
      clearTimeout(timeoutId);
      errors.push(`${provider.name}: ${err.message}`);
      // Fall through to the next provider in the chain — this is exactly
      // what handles "this one's out of tokens" automatically.
    }
  }

  return res.status(502).json({
    error: 'All configured AI providers failed or are out of quota right now.',
    details: errors
  });
}
