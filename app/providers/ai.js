const { getRuntimeSecrets } = require('../config');

async function generateJSON(system, user) {
  const cfg = getRuntimeSecrets();
  const base = String(cfg.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const key = cfg.aiApiKey;
  const model = cfg.aiModel || 'gpt-5.6-luna';
  if (!key) return null;

  const isReasoningModel = /^gpt-5(?:[.-]|$)/i.test(model);
  const payload = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    response_format: { type: 'json_object' }
  };
  if (!isReasoningModel) payload.temperature = 0.2;

  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(payload)
  });

  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
  if (!r.ok) {
    const detail = data?.error?.message || data?.message || raw || `HTTP ${r.status}`;
    throw new Error(`AI request failed: ${r.status} — ${detail}`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned an empty response.');
  try { return typeof content === 'string' ? JSON.parse(content) : content; }
  catch (_) { throw new Error('AI returned invalid JSON.'); }
}

module.exports = { generateJSON };
