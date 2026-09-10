const { getRuntimeSecrets } = require('../config');

async function fetchXAccounts(accounts = []) {
  const cfg = getRuntimeSecrets();
  const token = cfg.xBearerToken;
  if (!token || !accounts.length) return [];
  const out = [];
  for (const handle of accounts) {
    const username = handle.replace(/^@/, '');
    const u = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=id,name,username`, { headers: { Authorization: `Bearer ${token}` } });
    if (!u.ok) continue;
    const user = (await u.json()).data;
    if (!user?.id) continue;
    const p = new URL(`https://api.x.com/2/users/${user.id}/tweets`);
    p.searchParams.set('max_results', '10'); p.searchParams.set('tweet.fields', 'created_at,public_metrics,entities');
    const t = await fetch(p, { headers: { Authorization: `Bearer ${token}` } });
    if (!t.ok) continue;
    const tweets = (await t.json()).data || [];
    tweets.forEach(tweet => out.push({ id:`x:${tweet.id}`, title:`@${user.username}: ${tweet.text.slice(0,100)}`, text:tweet.text, url:`https://x.com/${user.username}/status/${tweet.id}`, source:'x', author:user.username, createdAt:tweet.created_at, metrics:tweet.public_metrics }));
  }
  return out;
}

module.exports = { fetchXAccounts };
