const { getAccessToken: getXAccessToken, status: xOAuthStatus } = require('./xOAuth');
const youtube = require('./googleOAuth');
const linkedin = require('./linkedinOAuth');
const meta = require('./metaOAuth');
const tiktok = require('./tiktokOAuth');
const threads = require('./threadsOAuth');
const pinterest = require('./pinterestOAuth');
const { getRuntimeSecrets } = require('../config');

const X_POST_URL='https://api.x.com/2/tweets';
const X_ME_URL='https://api.x.com/2/users/me?user.fields=id,name,username';
const X_TWEET_URL=id=>`https://api.x.com/2/tweets/${encodeURIComponent(id)}?tweet.fields=created_at,public_metrics,text,author_id`;

async function getXToken(){const oauth=await getXAccessToken().catch(()=>''),cfg=getRuntimeSecrets();return String(oauth||process.env.X_USER_ACCESS_TOKEN||process.env.X_ACCESS_TOKEN||cfg.xBearerToken||'').trim();}
async function checkXConnection(){const token=await getXToken();if(!token)return{ok:false,configured:false,reason:'X publishing account is not connected.'};try{const r=await fetch(X_ME_URL,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json().catch(()=>({}));if(!r.ok||!d?.data?.id)return{ok:false,configured:true,status:r.status,reason:d?.detail||d?.title||d?.errors?.[0]?.message||`X API returned ${r.status}`};return{ok:true,configured:true,status:r.status,account:{id:d.data.id,name:d.data.name||'',username:d.data.username||''}}}catch(e){return{ok:false,configured:true,reason:e.message||'Unable to reach X API.'}}}
function splitForX(text,max=270){const clean=String(text||'').replace(/\r/g,'').trim();if(!clean)return[];if(clean.length<=max)return[clean];const words=clean.split(/\s+/);const out=[];let cur='';for(const word of words){const next=cur?`${cur} ${word}`:word;if(next.length<=max)cur=next;else{if(cur)out.push(cur);cur=word;}}if(cur)out.push(cur);return out;}
function xError(d,status){const raw=[d?.detail,d?.title,d?.reason,d?.errors?.[0]?.message,d?.errors?.[0]?.detail].filter(Boolean).join(' · ');const text=String(raw||'').toLowerCase();const creditDepleted=Boolean(status===402||status===403&&/(credit|credits|billing|payment|spend|pay)/i.test(raw)||/(credit(s)?|billing|payment|spend cap|insufficient.*(fund|credit)|quota.*(exceed|deplet)|deplet(ed|ion)).*/i.test(raw));if(creditDepleted)return{code:'X_CREDIT_DEPLETED',reason:'Your X API credit balance is depleted. Add X API credits to resume publishing.',detail:raw||`X API returned ${status}`};return{code:'X_PUBLISH_FAILED',reason:raw||`X API returned ${status}`};}
async function publishX({title,body}){const token=await getXToken();if(!token)return{ok:false,manual:true,platform:'X',reason:'X is not connected.'};const chunks=splitForX(body||title);if(!chunks.length)return{ok:false,platform:'X',reason:'The X package is empty.'};let replyTo=null;const published=[];for(const chunk of chunks){const payload={text:chunk};if(replyTo)payload.reply={in_reply_to_tweet_id:replyTo};let r;try{r=await fetch(X_POST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)})}catch(e){return{ok:false,platform:'X',reason:`Could not reach X API: ${e.message}`,published,retryable:true}}const d=await r.json().catch(()=>({}));if(!r.ok||!d?.data?.id){const failure=xError(d,r.status);return{ok:false,manual:Boolean(failure.code==='X_CREDIT_DEPLETED'),platform:'X',code:failure.code,reason:failure.reason,detail:failure.detail,published,retryable:false}}replyTo=d.data.id;published.push({id:d.data.id,text:d.data.text||chunk,url:`https://x.com/i/web/status/${d.data.id}`});}return{ok:true,platform:'X',externalId:published[0]?.id||null,published,threadSize:published.length};}
async function fetchXMetrics(externalId){const token=(await getXToken())||process.env.X_BEARER_TOKEN||'';if(!token||!externalId)return null;const r=await fetch(X_TWEET_URL(externalId),{headers:{Authorization:`Bearer ${token}`}});const d=await r.json().catch(()=>({}));if(!r.ok||!d?.data)return null;const m=d.data.public_metrics||{};return{externalId,platform:'X',impressions:Number(m.impression_count||0),engagements:Number((m.like_count||0)+(m.reply_count||0)+(m.retweet_count||0)+(m.quote_count||0)+(m.bookmark_count||0)),clicks:0,conversions:0,source:'x_api',recordedAt:new Date().toISOString()};}

async function publishYouTube(item){const body=item.body||item.title||'';const mediaUrl=item.mediaUrl||item.package?.mediaUrl;return youtube.publishVideo({title:item.title,description:body,mediaUrl,privacyStatus:item.privacyStatus||'public'}).catch(e=>({ok:false,manual:true,platform:'YouTube',reason:e.message}));}
async function publishLinkedIn(item){return linkedin.publishText({text:item.body||item.title,title:item.title}).catch(e=>({ok:false,manual:true,platform:'LinkedIn',reason:e.message}));}
async function publishInstagram(item){return meta.publishInstagram({caption:item.body||item.title,mediaUrl:item.mediaUrl||item.package?.mediaUrl,mediaType:item.mediaType||'IMAGE'}).catch(e=>({ok:false,manual:true,platform:'Instagram',reason:e.message}));}
async function publishFacebook(item){return meta.publishFacebookPage({message:item.body||item.title,link:item.link||item.package?.link,pageId:item.pageId}).catch(e=>({ok:false,manual:true,platform:'Facebook Pages',reason:e.message}));}
async function publishTikTok(item){
  return tiktok.publishMedia({
    title:item.title,
    description:item.body||'',
    mediaUrl:item.mediaUrl||item.package?.mediaUrl,
    mediaType:item.mediaType,
    isAigc:Boolean(item.isAigc||item.package?.isAigc)
  }).catch(e=>({ok:false,manual:true,platform:'TikTok',reason:e.message}));
}
async function publishThreads(item){return threads.publishText(item.body||item.title).catch(e=>({ok:false,manual:true,platform:'Threads',reason:e.message}));}
async function publishPinterest(item){return pinterest.publishPin({title:item.title,body:item.body,mediaUrl:item.mediaUrl||item.package?.mediaUrl,link:item.link||item.package?.link,boardId:item.boardId}).catch(e=>({ok:false,manual:true,platform:'Pinterest',reason:e.message}));}

function platformConfig(){
 const xs=xOAuthStatus(), ys=youtube.status(), ls=linkedin.status(), ms=meta.status(), ts=tiktok.status(), th=threads.status(), ps=pinterest.status();
 return {
  X:{configured:Boolean(xs.connected||process.env.X_USER_ACCESS_TOKEN||process.env.X_ACCESS_TOKEN),oauthConnected:Boolean(xs.connected),oauthAccount:xs.account||null,capabilities:['publish','thread','metrics']},
  YouTube:{configured:Boolean(ys.connected),oauthConnected:Boolean(ys.connected),account:ys.account||null,capabilities:['publish_video','schedule','metrics']},
  Instagram:{configured:Boolean(ms.connected&&ms.instagram?.id),oauthConnected:Boolean(ms.connected&&ms.instagram?.id),account:ms.instagram||null,capabilities:['publish_image','publish_video','publish_reel','metrics'],reason:ms.connected&&!ms.instagram?'No Instagram Professional account linked.':''},
  TikTok:{configured:Boolean(ts.connected),oauthConnected:Boolean(ts.connected),account:ts.account||null,capabilities:['publish_video','publish_photo']},
  LinkedIn:{configured:Boolean(ls.connected),oauthConnected:Boolean(ls.connected),account:ls.account||null,capabilities:['publish_text']},
  'Facebook Pages':{configured:Boolean(ms.connected&&Array.isArray(ms.pages)&&ms.pages.length),oauthConnected:Boolean(ms.connected&&Array.isArray(ms.pages)&&ms.pages.length),account:ms.pages||[],capabilities:['publish_text','publish_link']},
  Threads:{configured:Boolean(th.connected),oauthConnected:Boolean(th.connected),account:th.account||null,capabilities:['publish_text']},
  Pinterest:{configured:Boolean(ps.connected),oauthConnected:Boolean(ps.connected),account:ps.account||null,capabilities:['publish_pin'],requiresMedia:true},
  Email:{configured:false,capabilities:['send_digest'],manual:true}
 };
}
async function publishDistribution(item){const platform=String(item.platform||'').toLowerCase();if(platform==='x')return publishX(item);if(platform==='youtube')return publishYouTube(item);if(platform==='instagram')return publishInstagram(item);if(platform==='tiktok')return publishTikTok(item);if(platform==='linkedin')return publishLinkedIn(item);if(platform==='facebook pages'||platform==='facebook')return publishFacebook(item);if(platform==='threads')return publishThreads(item);if(platform==='pinterest')return publishPinterest(item);return{ok:false,manual:true,platform:item.platform,reason:`${item.platform} publisher is not connected yet.`};}
module.exports={publishDistribution,fetchXMetrics,platformConfig,splitForX,checkXConnection};
