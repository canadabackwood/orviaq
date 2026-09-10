const crypto = require('crypto');
const db = require('../store/db');
const { encrypt, decrypt } = require('../security');

function secret(value) {
  if (!value) return '';
  try { return decrypt(value) || ''; } catch (_) { return ''; }
}

function cfgValue(saved, envName, fallback = '') {
  return String(saved || process.env[envName] || fallback).trim();
}

function makeState() { return crypto.randomBytes(32).toString('base64url'); }
function makeVerifier() { return crypto.randomBytes(48).toString('base64url'); }
function makeChallenge(verifier) { return crypto.createHash('sha256').update(verifier).digest('base64url'); }

function saveConnection(platform, patch) {
  const settings = db.read().settings || {};
  const existing = settings.connections?.[platform] || {};
  const next = { ...existing, ...patch };
  db.updateSettings({ connections: { ...(settings.connections || {}), [platform]: next } });
  return next;
}

function readConnection(platform) { return db.read().settings?.connections?.[platform] || null; }

function connected(platform) { return Boolean(readConnection(platform)?.accessToken); }

function accessToken(platform) {
  const conn = readConnection(platform);
  return conn?.accessToken ? decrypt(conn.accessToken) : '';
}

function tokenExpiresSoon(conn, marginMs = 120000) {
  return conn?.expiresAt && Number(conn.expiresAt) <= Date.now() + marginMs;
}

function beginPkce(platform, payload = {}) {
  const state = makeState();
  const verifier = makeVerifier();
  const challenge = makeChallenge(verifier);
  saveConnection(platform, { pending: { state, verifier, createdAt: Date.now(), ...payload } });
  return { state, verifier, challenge };
}

function assertState(platform, state, maxAgeMs = 10 * 60 * 1000) {
  const pending = readConnection(platform)?.pending;
  if (!pending || pending.state !== state) throw new Error(`Invalid or expired ${platform} connection session. Start again.`);
  if (Date.now() - Number(pending.createdAt || 0) > maxAgeMs) throw new Error(`${platform} connection session expired. Start again.`);
  return pending;
}

function clearPending(platform) {
  const conn = readConnection(platform);
  if (conn) saveConnection(platform, { pending: null });
}

async function formPost(url, params, headers = {}) {
  const body = new URLSearchParams(params).toString();
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error_description || data?.error?.message || data?.message || data?.detail || `OAuth request failed (${response.status})`;
    throw new Error(reason);
  }
  return data;
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.message || data?.message || data?.detail || data?.error_description || `API request failed (${response.status})`;
    throw new Error(reason);
  }
  return data;
}

function storeTokens(platform, data, account, meta = {}) {
  const expiresIn = Number(data.expires_in || 0);
  return saveConnection(platform, {
    accessToken: encrypt(data.access_token),
    refreshToken: data.refresh_token ? encrypt(data.refresh_token) : (readConnection(platform)?.refreshToken || null),
    expiresAt: expiresIn ? Date.now() + Math.max(0, expiresIn - 60) * 1000 : null,
    tokenType: data.token_type || 'Bearer',
    scope: data.scope || meta.scope || '',
    account: account || null,
    connectedAt: new Date().toISOString(),
    lastError: null,
    pending: null
  });
}

async function refreshOAuth(platform, tokenUrl, clientId, clientSecret, extra = {}) {
  const conn = readConnection(platform);
  if (!conn?.refreshToken) return '';
  const refreshToken = secret(conn.refreshToken);
  const params = { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, ...extra };
  const headers = {};
  if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  const data = await formPost(tokenUrl, params, headers);
  saveConnection(platform, {
    accessToken: encrypt(data.access_token),
    refreshToken: data.refresh_token ? encrypt(data.refresh_token) : conn.refreshToken,
    expiresAt: data.expires_in ? Date.now() + Math.max(0, Number(data.expires_in) - 60) * 1000 : conn.expiresAt,
    lastError: null
  });
  return data.access_token;
}

function publicBaseUrl() {
  const configured = String(process.env.ORVIA_PUBLIC_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function redirectFor(pathname) {
  const path = String(pathname || '').startsWith('/') ? pathname : `/${pathname}`;
  return `${publicBaseUrl()}${path}`;
}

module.exports = {
  secret, cfgValue, makeState, makeVerifier, makeChallenge, publicBaseUrl, redirectFor,
  saveConnection, readConnection, connected, accessToken, tokenExpiresSoon,
  beginPkce, assertState, clearPending, formPost, jsonFetch, storeTokens, refreshOAuth
};
