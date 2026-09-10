const { getRuntimeSecrets } = require('../config');

async function searchWeb(query, limit = 8) {
  const cfg = getRuntimeSecrets();
  const provider = cfg.searchProvider;
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 8));
  if (provider === 'tavily' && cfg.tavilyApiKey) {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: cfg.tavilyApiKey, query: String(query || '').trim(), search_depth: 'advanced', max_results: safeLimit, include_answer: false })
    });
    const raw = await r.text(); let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (!r.ok) throw new Error(`Tavily search failed: ${r.status} — ${data?.detail || data?.message || raw || 'Unknown error'}`);
    return Array.isArray(data.results) ? data.results.map(x => ({ title:x.title || 'Untitled result', url:x.url || '', snippet:x.content || '', source:'web' })) : [];
  }
  return [];
}
module.exports = { searchWeb };
