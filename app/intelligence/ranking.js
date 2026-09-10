function scoreSignal(signal) {
  const text = `${signal.title || ''} ${signal.text || ''}`.toLowerCase();
  const keywords = ['new', 'launch', 'update', 'breaking', 'trend', 'growth', 'problem', 'controversy', 'how', 'why', 'guide', 'release'];
  const keywordScore = keywords.reduce((n, k) => n + (text.includes(k) ? 4 : 0), 0);
  const metrics = signal.metrics || {};
  const engagement = Math.min(30, ((metrics.like_count || 0) + (metrics.retweet_count || 0) * 2 + (metrics.reply_count || 0) * 1.5) / 100);
  const recency = signal.createdAt ? Math.max(0, 20 - ((Date.now() - new Date(signal.createdAt).getTime()) / 3600000)) : 5;
  return Math.max(0, Math.min(100, Math.round(25 + keywordScore + engagement + recency)));
}
function rankSignals(signals) { return signals.map(s => ({ ...s, score: scoreSignal(s) })).sort((a,b) => b.score - a.score); }
module.exports = { rankSignals, scoreSignal };
