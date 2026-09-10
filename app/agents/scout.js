const { searchWeb } = require('../providers/search');
const { fetchXAccounts } = require('../providers/x');
const { rankSignals } = require('../intelligence/ranking');

async function scout(config = {}) {
  const signals = [];
  const queries = Array.isArray(config.queries) ? config.queries : [];
  const accounts = Array.isArray(config.xAccounts) ? config.xAccounts : [];

  for (const q of queries) {
    if (!q) continue;
    const results = await searchWeb(q, 6);
    const safeResults = Array.isArray(results) ? results : [];
    signals.push(...safeResults.map((r, i) => ({
      id: `web:${Buffer.from(r.url || r.title || `result-${i}`).toString('base64').slice(0, 32)}:${i}`,
      title: r.title || 'Untitled signal',
      text: r.snippet || '',
      url: r.url || '',
      source: r.source || 'web',
      createdAt: new Date().toISOString()
    })));
  }

  const xSignals = await fetchXAccounts(accounts);
  if (Array.isArray(xSignals)) signals.push(...xSignals);
  return rankSignals(signals);
}

module.exports = { scout };
