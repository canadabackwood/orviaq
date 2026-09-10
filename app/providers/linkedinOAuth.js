const db = require('../store/db');
const { encrypt, decrypt } = require('../security');
const { saveConnection, readConnection, beginPkce, assertState, formPost, jsonFetch, tokenExpiresSoon, redirectFor } = require('./oauth');
const AUTH_URL='https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL='https://www.linkedin.com/oauth/v2/accessToken';
function config(){
 const saved=db.read().settings?.connections?.linkedinConfig||{};
 return {clientId:String(saved.clientId||process.env.LINKEDIN_CLIENT_ID||'').trim(),clientSecret:String(saved.clientSecret?decrypt(saved.clientSecret):process.env.LINKEDIN_CLIENT_SECRET||'').trim(),redirectUri:String(saved.redirectUri||process.env.LINKEDIN_REDIRECT_URI||redirectFor('/api/publishing/linkedin/callback')).trim(),scopes:String(saved.scopes||process.env.LINKEDIN_SCOPES||'openid profile w_member_social').trim().split(/\s+/).filter(Boolean),version:String(saved.version||process.env.LINKEDIN_API_VERSION||'202601').trim()};
}
function status(){const cfg=config();const c=readConnection('linkedin')||{};return{platform:'LinkedIn',configured:Boolean(cfg.clientId),redirectUri:cfg.redirectUri,scopes:cfg.scopes,connected:Boolean(c.accessToken),account:c.account||null,expiresAt:c.expiresAt||null,connectedAt:c.connectedAt||null,lastError:c.lastError||null,apiVersion:cfg.version};}
function authorizeUrl(){const cfg=config();if(!cfg.clientId)throw new Error('LinkedIn is not configured yet. Add the LinkedIn client ID in Settings → Advanced.');const {challenge,state}=beginPkce('linkedin');const params=new URLSearchParams({response_type:'code',client_id:cfg.clientId,redirect_uri:cfg.redirectUri,state,scope:cfg.scopes.join(' '),code_challenge:challenge,code_challenge_method:'S256'});return`${AUTH_URL}?${params}`;}
async function exchangeCode(code,state){const cfg=config();const p=assertState('linkedin',state);const data=await formPost(TOKEN_URL,{grant_type:'authorization_code',code,redirect_uri:cfg.redirectUri,client_id:cfg.clientId,client_secret:cfg.clientSecret,code_verifier:p.verifier});const account=await fetchUser(data.access_token);saveConnection('linkedin',{accessToken:encrypt(data.access_token),refreshToken:data.refresh_token?encrypt(data.refresh_token):null,expiresAt:data.expires_in?Date.now()+Math.max(0,Number(data.expires_in)-60)*1000:null,scope:data.scope||cfg.scopes.join(' '),account,connectedAt:new Date().toISOString(),lastError:null,pending:null});return status();}
async function getAccessToken(){const c=readConnection('linkedin');if(!c?.accessToken)return'';if(!tokenExpiresSoon(c))return decrypt(c.accessToken);if(!c.refreshToken)return decrypt(c.accessToken);const cfg=config();const data=await formPost(TOKEN_URL,{grant_type:'refresh_token',refresh_token:decrypt(c.refreshToken),client_id:cfg.clientId,client_secret:cfg.clientSecret});saveConnection('linkedin',{accessToken:encrypt(data.access_token),refreshToken:data.refresh_token?encrypt(data.refresh_token):c.refreshToken,expiresAt:data.expires_in?Date.now()+Math.max(0,Number(data.expires_in)-60)*1000:c.expiresAt,lastError:null});return data.access_token;}
async function fetchUser(token){const data=await jsonFetch('https://api.linkedin.com/v2/userinfo',{headers:{Authorization:`Bearer ${token}`}});return{id:data.sub,name:data.name||'',givenName:data.given_name||'',familyName:data.family_name||'',picture:data.picture||''};}
async function verifyConnection(){try{const token=await getAccessToken();if(!token)return{ok:false,configured:status().configured,connected:false,reason:'LinkedIn is not connected.'};const account=await fetchUser(token);saveConnection('linkedin',{account,lastVerifiedAt:new Date().toISOString(),lastError:null});return{ok:true,connected:true,account};}catch(e){saveConnection('linkedin',{lastError:e.message});return{ok:false,connected:true,reason:e.message};}}
async function disconnect(){db.updateSettings({connections:{...(db.read().settings?.connections||{}),linkedin:null,linkedinConfig:db.read().settings?.connections?.linkedinConfig||undefined}});return status();}
module.exports={config,status,authorizeUrl,exchangeCode,getAccessToken,verifyConnection,disconnect};

async function publishText({text,title}) {
  const token=await getAccessToken();
  if(!token) return {ok:false,manual:true,platform:'LinkedIn',reason:'LinkedIn is not connected.'};
  const cfg=config();
  const personId=readConnection('linkedin')?.account?.id;
  if(!personId) return {ok:false,manual:true,platform:'LinkedIn',reason:'LinkedIn profile identity is unavailable. Reconnect the account.'};
  const payload={author:`urn:li:person:${personId}`,commentary:String(text||title||''),visibility:'PUBLIC',distribution:{feedDistribution:'MAIN_FEED',targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:'PUBLISHED',isReshareDisabledByAuthor:false};
  const response=await fetch('https://api.linkedin.com/rest/posts',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json','X-Restli-Protocol-Version':'2.0.0','Linkedin-Version':cfg.version},body:JSON.stringify(payload)});
  const id=response.headers.get('x-restli-id');const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.message||data?.serviceErrorCode||`LinkedIn returned ${response.status}`);
  return{ok:true,platform:'LinkedIn',externalId:id||data.id,published:[{id:id||data.id,url:id?`https://www.linkedin.com/feed/update/${id}/`:null}],threadSize:1};
}
module.exports.publishText=publishText;
