const db=require('../store/db');
const {encrypt,decrypt}=require('../security');
const {saveConnection,readConnection,beginPkce,assertState,formPost,jsonFetch,redirectFor,tokenExpiresSoon}=require('./oauth');
const AUTH='https://www.tiktok.com/v2/auth/authorize/';
const TOKEN='https://open.tiktokapis.com/v2/oauth/token/';
function config(){const s=db.read().settings?.connections?.tiktokConfig||{};return{clientKey:String(s.clientKey||process.env.TIKTOK_CLIENT_KEY||'').trim(),clientSecret:String(s.clientSecret?decrypt(s.clientSecret):process.env.TIKTOK_CLIENT_SECRET||'').trim(),redirectUri:String(s.redirectUri||process.env.TIKTOK_REDIRECT_URI||redirectFor('/api/publishing/tiktok/callback')).trim(),scopes:String(s.scopes||process.env.TIKTOK_SCOPES||'user.info.basic').trim().split(/[ ,]+/).filter(Boolean)}}
function status(){const c=readConnection('tiktok')||{},cfg=config();return{platform:'TikTok',configured:Boolean(cfg.clientKey),redirectUri:cfg.redirectUri,scopes:cfg.scopes,connected:Boolean(c.accessToken),account:c.account||null,expiresAt:c.expiresAt||null,connectedAt:c.connectedAt||null,lastError:c.lastError||null};}
function authorizeUrl(){const cfg=config();if(!cfg.clientKey)throw new Error('TikTok is not configured yet. Add the TikTok client key in Settings → Advanced.');const {state}=beginPkce('tiktok');const params=new URLSearchParams({client_key:cfg.clientKey,response_type:'code',scope:cfg.scopes.join(','),redirect_uri:cfg.redirectUri,state});return`${AUTH}?${params}`;}
async function exchangeCode(code,state){const cfg=config();const p=assertState('tiktok',state);const data=await formPost(TOKEN,{client_key:cfg.clientKey,client_secret:cfg.clientSecret,code,grant_type:'authorization_code',redirect_uri:cfg.redirectUri});const account=await creatorInfo(data.access_token);saveConnection('tiktok',{accessToken:encrypt(data.access_token),refreshToken:data.refresh_token?encrypt(data.refresh_token):null,expiresAt:data.expires_in?Date.now()+Math.max(0,Number(data.expires_in)-60)*1000:null,scope:data.scope||cfg.scopes.join(','),openId:data.open_id,account,connectedAt:new Date().toISOString(),lastError:null,pending:null});return status();}
async function getAccessToken(){const c=readConnection('tiktok');if(!c?.accessToken)return'';if(!tokenExpiresSoon(c))return decrypt(c.accessToken);if(!c.refreshToken)return decrypt(c.accessToken);const cfg=config();const data=await formPost(TOKEN,{client_key:cfg.clientKey,client_secret:cfg.clientSecret,grant_type:'refresh_token',refresh_token:decrypt(c.refreshToken)});saveConnection('tiktok',{accessToken:encrypt(data.access_token),refreshToken:data.refresh_token?encrypt(data.refresh_token):c.refreshToken,expiresAt:data.expires_in?Date.now()+Math.max(0,Number(data.expires_in)-60)*1000:c.expiresAt,openId:data.open_id||c.openId,lastError:null});return data.access_token;}
async function creatorInfo(token){const data=await jsonFetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username',{headers:{Authorization:`Bearer ${token}`}});return data.data?.user||{};}
async function verifyConnection(){try{const token=await getAccessToken();if(!token)return{ok:false,configured:status().configured,connected:false,reason:'TikTok is not connected.'};const account=await creatorInfo(token);saveConnection('tiktok',{account,lastVerifiedAt:new Date().toISOString(),lastError:null});return{ok:true,connected:true,account};}catch(e){saveConnection('tiktok',{lastError:e.message});return{ok:false,connected:true,reason:e.message};}}
async function disconnect(){db.updateSettings({connections:{...(db.read().settings?.connections||{}),tiktok:null,tiktokConfig:db.read().settings?.connections?.tiktokConfig||undefined}});return status();}
module.exports={config,status,authorizeUrl,exchangeCode,getAccessToken,verifyConnection,disconnect};

async function queryCreatorInfo(token){
  return jsonFetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
  }).then(r=>r.data||r);
}

async function publishVideo({title,description,mediaUrl,isAigc=false,privacyLevel}){
  const token=await getAccessToken();
  if(!token)return{ok:false,manual:true,platform:'TikTok',reason:'TikTok is not connected.'};
  if(!mediaUrl)return{ok:false,manual:true,platform:'TikTok',reason:'TikTok direct publishing requires a public video asset URL.'};
  const creator=await queryCreatorInfo(token);
  const options=Array.isArray(creator?.privacy_level_options)?creator.privacy_level_options:[];
  const privacy=privacyLevel&&options.includes(privacyLevel)?privacyLevel:(options.includes('PUBLIC_TO_EVERYONE')?'PUBLIC_TO_EVERYONE':options[0]||'SELF_ONLY');
  const create=await jsonFetch('https://open.tiktokapis.com/v2/post/publish/video/init/',{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json; charset=UTF-8'},
    body:JSON.stringify({
      post_info:{
        title:String(title||description||'').slice(0,2200),
        privacy_level:privacy,
        is_aigc:Boolean(isAigc)
      },
      source_info:{source:'PULL_FROM_URL',video_url:String(mediaUrl)}
    })
  });
  const publishId=create.data?.publish_id||create.publish_id;
  if(!publishId)throw new Error('TikTok did not return a publish ID.');
  return{ok:true,platform:'TikTok',externalId:publishId,published:[{id:publishId,url:null}],threadSize:1,status:'processing'};
}

async function publishPhoto({title,description,mediaUrls,isAigc=false,privacyLevel}){
  const token=await getAccessToken();
  if(!token)return{ok:false,manual:true,platform:'TikTok',reason:'TikTok is not connected.'};
  const urls=(Array.isArray(mediaUrls)?mediaUrls:[mediaUrls]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,35);
  if(!urls.length)return{ok:false,manual:true,platform:'TikTok',reason:'TikTok photo publishing requires at least one public image URL.'};
  const creator=await queryCreatorInfo(token);
  const options=Array.isArray(creator?.privacy_level_options)?creator.privacy_level_options:[];
  const privacy=privacyLevel&&options.includes(privacyLevel)?privacyLevel:(options.includes('PUBLIC_TO_EVERYONE')?'PUBLIC_TO_EVERYONE':options[0]||'SELF_ONLY');
  const create=await jsonFetch('https://open.tiktokapis.com/v2/post/publish/content/init/',{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      post_info:{
        title:String(title||description||'').slice(0,2200),
        description:String(description||'').slice(0,2200),
        privacy_level:privacy,
        is_aigc:Boolean(isAigc)
      },
      source_info:{source:'PULL_FROM_URL',photo_cover_index:0,photo_images:urls},
      post_mode:'DIRECT_POST',
      media_type:'PHOTO'
    })
  });
  const publishId=create.data?.publish_id||create.publish_id;
  if(!publishId)throw new Error('TikTok did not return a photo publish ID.');
  return{ok:true,platform:'TikTok',externalId:publishId,published:[{id:publishId,url:null}],threadSize:1,status:'processing'};
}

async function publishMedia({title,description,mediaUrl,mediaType,isAigc=false,privacyLevel}){
  if(String(mediaType||'').toUpperCase()==='PHOTO'||String(mediaType||'').toUpperCase()==='IMAGE'){
    return publishPhoto({title,description,mediaUrls:Array.isArray(mediaUrl)?mediaUrl:[mediaUrl],isAigc,privacyLevel});
  }
  return publishVideo({title,description,mediaUrl,isAigc,privacyLevel});
}

module.exports.publishVideo=publishVideo;
module.exports.publishPhoto=publishPhoto;
module.exports.publishMedia=publishMedia;
