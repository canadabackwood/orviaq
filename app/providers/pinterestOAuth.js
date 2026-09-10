const db=require('../store/db');
const {encrypt,decrypt}=require('../security');
const {saveConnection,readConnection,beginPkce,assertState,formPost,jsonFetch,redirectFor}=require('./oauth');
const AUTH='https://www.pinterest.com/oauth/';
const TOKEN='https://api.pinterest.com/v5/oauth/token';
const API='https://api.pinterest.com/v5';
function config(){const s=db.read().settings?.connections?.pinterestConfig||{};return{clientId:String(s.clientId||process.env.PINTEREST_CLIENT_ID||'').trim(),clientSecret:String(s.clientSecret?decrypt(s.clientSecret):process.env.PINTEREST_CLIENT_SECRET||'').trim(),redirectUri:String(s.redirectUri||process.env.PINTEREST_REDIRECT_URI||redirectFor('/api/publishing/pinterest/callback')).trim(),scopes:String(s.scopes||process.env.PINTEREST_SCOPES||'boards:read boards:write pins:read pins:write user_accounts:read').trim().split(/[ ,]+/).filter(Boolean)}}
function status(){const c=readConnection('pinterest')||{},cfg=config();return{platform:'Pinterest',configured:Boolean(cfg.clientId),redirectUri:cfg.redirectUri,scopes:cfg.scopes,connected:Boolean(c.accessToken),account:c.account||null,expiresAt:c.expiresAt||null,connectedAt:c.connectedAt||null,lastError:c.lastError||null};}
function authorizeUrl(){const cfg=config();if(!cfg.clientId)throw new Error('Pinterest is not configured yet. Add the Pinterest app ID in Settings → Advanced.');const {state}=beginPkce('pinterest');const p=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:'code',scope:cfg.scopes.join(','),state});return`${AUTH}?${p}`;}
async function exchangeCode(code,state){const cfg=config();assertState('pinterest',state);const basic=Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');const data=await formPost(TOKEN,{grant_type:'authorization_code',code,redirect_uri:cfg.redirectUri,continuous_refresh:'true',scope:cfg.scopes.join(',')},{authorization:`Basic ${basic}`});const account=await jsonFetch(`${API}/user_account`,{headers:{Authorization:`Bearer ${data.access_token}`}});saveConnection('pinterest',{accessToken:encrypt(data.access_token),refreshToken:data.refresh_token?encrypt(data.refresh_token):null,expiresAt:data.expires_in?Date.now()+Math.max(0,Number(data.expires_in)-120)*1000:null,scope:data.scope||cfg.scopes.join(','),account,connectedAt:new Date().toISOString(),lastError:null,pending:null});return status();}
async function getAccessToken(){
  const c=readConnection('pinterest');
  if(!c?.accessToken)return'';
  if(!c.expiresAt||Date.now()<Number(c.expiresAt)-120000)return decrypt(c.accessToken);
  if(!c.refreshToken)return decrypt(c.accessToken);
  const cfg=config();
  const basic=Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const data=await formPost(TOKEN,{
    grant_type:'refresh_token',
    refresh_token:decrypt(c.refreshToken),
    scope:cfg.scopes.join(',')
  },{authorization:`Basic ${basic}`});
  saveConnection('pinterest',{
    accessToken:encrypt(data.access_token),
    refreshToken:data.refresh_token?encrypt(data.refresh_token):c.refreshToken,
    expiresAt:data.expires_in?Date.now()+Math.max(0,Number(data.expires_in)-120)*1000:c.expiresAt,
    scope:data.scope||c.scope||cfg.scopes.join(','),
    lastError:null
  });
  return data.access_token;
}
async function verifyConnection(){try{const token=await getAccessToken();if(!token)return{ok:false,configured:status().configured,connected:false,reason:'Pinterest is not connected.'};const account=await jsonFetch(`${API}/user_account`,{headers:{Authorization:`Bearer ${token}`}});saveConnection('pinterest',{account,lastVerifiedAt:new Date().toISOString(),lastError:null});return{ok:true,connected:true,account};}catch(e){saveConnection('pinterest',{lastError:e.message});return{ok:false,connected:true,reason:e.message};}}
async function disconnect(){db.updateSettings({connections:{...(db.read().settings?.connections||{}),pinterest:null,pinterestConfig:db.read().settings?.connections?.pinterestConfig||undefined}});return status();}
async function boards(){const token=await getAccessToken();if(!token) return [];const data=await jsonFetch(`${API}/boards?page_size=100`,{headers:{Authorization:`Bearer ${token}`}});return data.items||[];}
async function publishPin({title,body,mediaUrl,link,boardId}){const token=await getAccessToken();if(!token)return{ok:false,manual:true,platform:'Pinterest',reason:'Pinterest is not connected.'};if(!boardId){const available=await boards();boardId=available[0]?.id||null;}if(!boardId)return{ok:false,manual:true,platform:'Pinterest',reason:'Create at least one Pinterest board before publishing.'};if(!mediaUrl)return{ok:false,manual:true,platform:'Pinterest',reason:'Pinterest requires an image or video URL for a Pin.'};const payload={board_id:boardId,title:String(title||'').slice(0,100),description:String(body||'').slice(0,500),link:link||undefined,media_source:{source_type:'image_url',url:mediaUrl}};const data=await jsonFetch(`${API}/pins`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)});return{ok:true,platform:'Pinterest',externalId:data.id,published:[{id:data.id,url:`https://www.pinterest.com/pin/${data.id}/`}],threadSize:1};}
module.exports={config,status,authorizeUrl,exchangeCode,getAccessToken,verifyConnection,disconnect,boards,publishPin};
