export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { max_tokens, system, messages } = req.body || {};
  if (!messages) {
    return res.status(400).json({ error: 'Request body must include "messages".' });
  }
  const maxTokens = max_tokens || 800;

  const providers = [
    { name: 'anthropic',  key: process.env.ANTHROPIC_API_KEY,  run: callAnthropic },
    { name: 'groq',       key: process.env.GROQ_API_KEY,       run: callGroq },
    { name: 'gemini',     key: process.env.GEMINI_API_KEY,     run: callGemini },
    { name: 'openrouter', key: process.env.OPENROUTER_API_KEY, run: callOpenRouter },
  ].filter(p => p.key);

  if (!providers.length) {
    return res.status(501).json({
      error: 'No AI provider is configured on this deployment. Add one of ' +
             'GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY (all free) or ' +
             'ANTHROPIC_API_KEY in Vercel Project Settings -> Environment ' +
             'Variables, then redeploy. See README.md for where to get each key.'
    });
  }

  const errors = [];
  for (const provider of providers) {
    try {
      const text = await provider.run({ apiKey: provider.key, system, messages, maxTokens });
      if (text && text.trim()) {
        return res.status(200).json({ content: [{ type: 'text', text }], _provider: provider.name });
      }
      errors.push(`${provider.name}: empty response`);
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
    }
  }

  return res.status(502).json({ error: 'All configured AI providers failed.', detail: errors });
}

async function callAnthropic({ apiKey, system, messages, maxTokens }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return (data.content || []).map(b => b.text || '').join('');
}

async function callGroq({ apiKey, system, messages, maxTokens }) {
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system || '' }, ...messages]
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini({ apiKey, system, messages, maxTokens }) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: { maxOutputTokens: maxTokens }
      })
    }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
}

async function callOpenRouter({ apiKey, system, messages, maxTokens }) {
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system || '' }, ...messages]
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.choices?.[0]?.message?.content || '';
}
