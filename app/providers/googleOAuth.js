const db = require('../store/db');
const { encrypt, decrypt } = require('../security');
const { saveConnection, readConnection, beginPkce, assertState, clearPending, formPost, jsonFetch, tokenExpiresSoon, redirectFor } = require('./oauth');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YT_API = 'https://www.googleapis.com/youtube/v3';

function config() {
  const saved = db.read().settings?.connections?.youtubeConfig || {};
  return {
    clientId: String(saved.clientId || process.env.YOUTUBE_CLIENT_ID || '').trim(),
    clientSecret: String(saved.clientSecret ? decrypt(saved.clientSecret) : process.env.YOUTUBE_CLIENT_SECRET || '').trim(),
    redirectUri: String(saved.redirectUri || process.env.YOUTUBE_REDIRECT_URI || redirectFor('/api/publishing/youtube/callback')).trim(),
    scopes: String(saved.scopes || process.env.YOUTUBE_SCOPES || 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly').trim().split(/\s+/).filter(Boolean)
  };
}

function status() {
  const cfg = config();
  const conn = readConnection('youtube') || {};
  return { platform:'YouTube', configured:Boolean(cfg.clientId), redirectUri:cfg.redirectUri, scopes:cfg.scopes, connected:Boolean(conn.accessToken), account:conn.account||null, expiresAt:conn.expiresAt||null, connectedAt:conn.connectedAt||null, lastError:conn.lastError||null };
}

function authorizeUrl() {
  const cfg = config();
  if (!cfg.clientId) throw new Error('YouTube is not configured yet. Add the Google OAuth client ID in Settings → Advanced.');
  const { challenge, state } = beginPkce('youtube');
  const params = new URLSearchParams({ client_id:cfg.clientId, redirect_uri:cfg.redirectUri, response_type:'code', scope:cfg.scopes.join(' '), access_type:'offline', prompt:'consent', state, code_challenge:challenge, code_challenge_method:'S256' });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code, state) {
  const cfg = config();
  const pending = assertState('youtube', state);
  const data = await formPost(TOKEN_URL, { code, client_id:cfg.clientId, client_secret:cfg.clientSecret, redirect_uri:cfg.redirectUri, grant_type:'authorization_code', code_verifier:pending.verifier });
  const account = await fetchChannel(data.access_token);
  saveConnection('youtube', {
    accessToken:encrypt(data.access_token), refreshToken:data.refresh_token?encrypt(data.refresh_token):null,
    expiresAt:data.expires_in?Date.now() + Math.max(0,Number(data.expires_in)-60)*1000:null,
    scope:data.scope||cfg.scopes.join(' '), tokenType:data.token_type||'Bearer', account,
    connectedAt:new Date().toISOString(), lastError:null, pending:null
  });
  return status();
}

async function getAccessToken() {
  const conn = readConnection('youtube');
  if (!conn?.accessToken) return '';
  if (!tokenExpiresSoon(conn)) return decrypt(conn.accessToken);
  if (!conn.refreshToken) return decrypt(conn.accessToken);
  const refreshToken = decrypt(conn.refreshToken);
  const cfg = config();
  const data = await formPost(TOKEN_URL, { refresh_token:refreshToken, client_id:cfg.clientId, client_secret:cfg.clientSecret, grant_type:'refresh_token' });
  saveConnection('youtube',{accessToken:encrypt(data.access_token),expiresAt:data.expires_in?Date.now()+Math.max(0,Number(data.expires_in)-60)*1000:conn.expiresAt, lastError:null});
  return data.access_token;
}

async function fetchChannel(token) {
  const data = await jsonFetch(`${YT_API}/channels?part=snippet,statistics&mine=true`, { headers:{Authorization:`Bearer ${token}`} });
  const item = data?.items?.[0];
  if (!item) throw new Error('No YouTube channel was returned for this Google account.');
  return { id:item.id, name:item.snippet?.title||'', handle:item.snippet?.customUrl||'', subscribers:Number(item.statistics?.subscriberCount||0) };
}

async function verifyConnection() {
  try {
    const token = await getAccessToken();
    if (!token) return {ok:false,connected:false,configured:status().configured,reason:'YouTube is not connected.'};
    const account = await fetchChannel(token);
    saveConnection('youtube',{account,lastVerifiedAt:new Date().toISOString(),lastError:null});
    return {ok:true,connected:true,account};
  } catch (error) { saveConnection('youtube',{lastError:error.message}); return {ok:false,connected:true,reason:error.message}; }
}

async function disconnect() { db.updateSettings({ connections:{ ...(db.read().settings?.connections||{}), youtube:null, youtubeConfig:db.read().settings?.connections?.youtubeConfig||undefined } }); return status(); }

module.exports = { config, status, authorizeUrl, exchangeCode, getAccessToken, verifyConnection, disconnect, fetchChannel };

async function publishVideo({title,description,mediaUrl,privacyStatus='public'}) {
  const token=await getAccessToken();
  if(!token) return {ok:false,manual:true,platform:'YouTube',reason:'YouTube is not connected.'};
  if(!mediaUrl) return {ok:false,manual:true,platform:'YouTube',reason:'YouTube publishing requires a video asset URL.'};
  const mediaResponse=await fetch(mediaUrl);
  if(!mediaResponse.ok) throw new Error(`Could not fetch the video asset (${mediaResponse.status}).`);
  const contentType=mediaResponse.headers.get('content-type')||'video/mp4';
  if(!contentType.startsWith('video/')) throw new Error('The YouTube media asset must be a video URL.');
  const bytes=Buffer.from(await mediaResponse.arrayBuffer());
  const size=bytes.length;
  const metadata={snippet:{title:String(title||'Orvia video').slice(0,100),description:String(description||'')},status:{privacyStatus}};
  const init=await fetch(`${'https://www.googleapis.com/upload/youtube/v3/videos'}?uploadType=resumable&part=snippet,status`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Upload-Content-Type':contentType,'X-Upload-Content-Length':String(size)},body:JSON.stringify(metadata)});
  const initData=await init.json().catch(()=>({}));
  if(!init.ok){throw new Error(initData?.error?.message||`YouTube upload initialization failed (${init.status}).`)}
  const location=init.headers.get('location');
  if(!location) throw new Error('YouTube did not return an upload URL.');
  const upload=await fetch(location,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':contentType,'Content-Length':String(size)},body:bytes});
  const uploadData=await upload.json().catch(()=>({}));
  if(!upload.ok||!uploadData?.id)throw new Error(uploadData?.error?.message||`YouTube upload failed (${upload.status}).`);
  return {ok:true,platform:'YouTube',externalId:uploadData.id,published:[{id:uploadData.id,url:`https://www.youtube.com/watch?v=${uploadData.id}`}],threadSize:1};
}
module.exports.publishVideo=publishVideo;
