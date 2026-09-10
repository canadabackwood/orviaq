const crypto = require('crypto');
const db = require('../store/db');
const { encrypt, decrypt } = require('../security');
const { redirectFor } = require('./oauth');

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const REVOKE_URL = 'https://api.x.com/2/oauth2/revoke';
const ME_URL = 'https://api.x.com/2/users/me?user.fields=id,name,username';
const DEFAULT_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
let refreshPromise = null;

function config() {
  const saved = db.read().settings?.xOAuthConfig || {};
  return {
    clientId: String(saved.clientId || process.env.X_OAUTH_CLIENT_ID || '').trim(),
    clientSecret: String(decrypt(saved.clientSecret || '') || process.env.X_OAUTH_CLIENT_SECRET || '').trim(),
    redirectUri: String(saved.redirectUri || process.env.X_OAUTH_REDIRECT_URI || redirectFor('/api/publishing/x/connect')).trim(),
    scopes: String(saved.scopes || process.env.X_OAUTH_SCOPES || DEFAULT_SCOPES.join(' ')).trim().split(/\s+/).filter(Boolean)
  };
}

function base64url(buffer) { return Buffer.from(buffer).toString('base64url'); }
function makeVerifier() { return base64url(crypto.randomBytes(48)); }
function makeChallenge(verifier) { return base64url(crypto.createHash('sha256').update(verifier).digest()); }
function makeState() { return base64url(crypto.randomBytes(32)); }

function oauthSettings() { return db.read().settings?.xOAuth || null; }

function status() {
  const cfg = config();
  const saved = oauthSettings();
  return {
    configured: Boolean(cfg.clientId),
    redirectUri: cfg.redirectUri,
    scopes: cfg.scopes,
    connected: Boolean(saved?.accessToken),
    account: saved?.account || null,
    expiresAt: saved?.expiresAt || null,
    connectedAt: saved?.connectedAt || null
  };
}

function buildAuthorizeUrl() {
  const cfg = config();
  if (!cfg.clientId) throw new Error('X_OAUTH_CLIENT_ID is not configured.');
  const state = makeState();
  const verifier = makeVerifier();
  const challenge = makeChallenge(verifier);
  db.updateSettings({ xOAuth: { pending: { state, verifier, createdAt: Date.now() } } });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCode(code, state) {
  const cfg = config();
  const pending = oauthSettings()?.pending;
  if (!pending || pending.state !== state) throw new Error('Invalid or expired X OAuth state. Start the connection again.');
  if (Date.now() - Number(pending.createdAt || 0) > 10 * 60 * 1000) throw new Error('X OAuth session expired. Start the connection again.');

  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    code_verifier: pending.verifier
  });
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (cfg.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
    params.delete('client_id');
  }
  const response = await fetch(TOKEN_URL, { method: 'POST', headers, body: params.toString() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    const reason = data?.detail || data?.title || data?.error_description || data?.error || `X token exchange failed (${response.status})`;
    throw new Error(reason);
  }

  const account = await fetchMe(data.access_token);
  db.updateSettings({ xOAuth: {
    accessToken: encrypt(data.access_token),
    refreshToken: data.refresh_token ? encrypt(data.refresh_token) : null,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 7200) - 30) * 1000,
    scope: data.scope || cfg.scopes.join(' '),
    tokenType: data.token_type || 'bearer',
    account,
    connectedAt: new Date().toISOString(),
    pending: null
  }});
  return status();
}

async function fetchMe(accessToken) {
  const response = await fetch(ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.data?.id) {
    const reason = data?.detail || data?.title || data?.errors?.[0]?.message || `X account lookup failed (${response.status})`;
    throw new Error(reason);
  }
  return { id: data.data.id, name: data.data.name || '', username: data.data.username || '' };
}

async function refreshAccessToken() {
  const saved = oauthSettings();
  const cfg = config();
  if (!saved?.refreshToken || !cfg.clientId) return null;
  const refreshToken = decrypt(saved.refreshToken);
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: cfg.clientId });
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (cfg.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
    params.delete('client_id');
  }
  const response = await fetch(TOKEN_URL, { method: 'POST', headers, body: params.toString() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    db.updateSettings({ xOAuth: { ...saved, accessToken: null, refreshToken: null, connected: false, lastError: data?.detail || data?.error_description || `X token refresh failed (${response.status})` } });
    throw new Error(data?.detail || data?.error_description || `X token refresh failed (${response.status})`);
  }
  const next = {
    ...saved,
    accessToken: encrypt(data.access_token),
    refreshToken: data.refresh_token ? encrypt(data.refresh_token) : saved.refreshToken,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 7200) - 30) * 1000,
    lastError: null
  };
  db.updateSettings({ xOAuth: next });
  return data.access_token;
}

async function getAccessToken() {
  const saved = oauthSettings();
  if (!saved?.accessToken) return '';
  if (saved.expiresAt && Date.now() < Number(saved.expiresAt)) return decrypt(saved.accessToken);
  if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function disconnect() {
  const saved = oauthSettings();
  const token = saved?.accessToken ? decrypt(saved.accessToken) : '';
  const cfg = config();
  if (token && cfg.clientId) {
    const params = new URLSearchParams({ token, client_id: cfg.clientId, token_type_hint: 'access_token' });
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (cfg.clientSecret) headers.authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
    await fetch(REVOKE_URL, { method: 'POST', headers, body: params.toString() }).catch(() => {});
  }
  db.updateSettings({ xOAuth: null });
  return status();
}

async function verifyConnection() {
  const token = await getAccessToken();
  if (!token) return { ok: false, configured: Boolean(config().clientId), connected: false, reason: config().clientId ? 'X account is not connected.' : 'X_OAUTH_CLIENT_ID is not configured.' };
  try {
    const account = await fetchMe(token);
    const saved = oauthSettings() || {};
    db.updateSettings({ xOAuth: { ...saved, account, lastVerifiedAt: new Date().toISOString(), lastError: null } });
    return { ok: true, connected: true, account };
  } catch (error) {
    return { ok: false, connected: true, reason: error.message };
  }
}

module.exports = { buildAuthorizeUrl, exchangeCode, getAccessToken, disconnect, verifyConnection, status, config };
