const fs=require('fs');
const path=require('path');
const DATA_DIR=path.join(process.cwd(),'data');
const DB_FILE=path.join(DATA_DIR,'orvia.json');
const iso=()=>new Date().toISOString();
const emptyDb=()=>({
  opportunities:[],signals:[],runs:[],content:[],distribution:[],analytics:[],learnings:[],revenue:[],notifications:[],mediaAssets:[],
  settings:{
    timezone:'Africa/Lagos',machineActive:true,autonomousMode:true,autoApproveContent:true,autoPublish:true,
    lastAutoCycleAt:null,nextAutoCycleAt:null,lastAutoStatus:'idle',
    profile:{name:'',tagline:'',bio:'',website:'',location:'',languages:['English']},
    strategy:{primaryTopics:[],secondaryTopics:[],avoidTopics:[],formats:['X','YouTube','Instagram','TikTok','LinkedIn','Threads','Pinterest'],contentMix:{news:35,education:30,opinion:20,stories:15}},
    preferences:{defaultDestinations:['X','LinkedIn','Threads'],reviewMode:'autonomous',adaptiveScheduling:true,crossPlatformAdaptation:true,duplicateProtection:true},
    notifications:{enabled:true,publishing:true,failures:true,machine:true,weekly:false,connections:true,quietHours:false,quietStart:'22:00',quietEnd:'07:00'},
    media:{assetBaseUrl:'',defaultImageUrl:'',defaultVideoUrl:''},
    connections:{},runtime:{}
  }
});
function ensure(){if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});if(!fs.existsSync(DB_FILE))fs.writeFileSync(DB_FILE,JSON.stringify(emptyDb(),null,2));}
function read(){ensure();let parsed={};try{parsed=JSON.parse(fs.readFileSync(DB_FILE,'utf8')||'{}')}catch{parsed={}};const base=emptyDb();return{...base,...parsed,settings:{...base.settings,...(parsed.settings||{}),profile:{...base.settings.profile,...(parsed.settings?.profile||{})},strategy:{...base.settings.strategy,...(parsed.settings?.strategy||{})},preferences:{...base.settings.preferences,...(parsed.settings?.preferences||{})},notifications:{...base.settings.notifications,...(parsed.settings?.notifications||{})},connections:{...(parsed.settings?.connections||{})},runtime:{...(parsed.settings?.runtime||{})}}};}
function write(data){ensure();fs.writeFileSync(DB_FILE,JSON.stringify(data,null,2));}
function cap(arr,n){return Array.isArray(arr)?arr.slice(0,n):[];}
function addOpportunity(item){const d=read();d.opportunities.unshift(item);d.opportunities=cap(d.opportunities,200);write(d);return item;}
function addSignals(items){const d=read();d.signals=[...(items||[]),...d.signals];d.signals=cap(d.signals,500);write(d);}
function addRun(run){const d=read();d.runs.unshift(run);d.runs=cap(d.runs,100);write(d);}
function addContent(item){const d=read();d.content.unshift(item);d.content=cap(d.content,200);write(d);return item;}
function updateContent(id,patch){const d=read();const i=d.content.findIndex(x=>x.id===id);if(i<0)return null;d.content[i]={...d.content[i],...patch,updatedAt:iso()};write(d);return d.content[i];}
function addDistribution(item){const d=read();d.distribution.unshift(item);d.distribution=cap(d.distribution,400);write(d);return item;}
function findDistribution(id){return read().distribution.find(x=>x.id===id)||null;}
function updateDistribution(id,patch){const d=read();const i=d.distribution.findIndex(x=>x.id===id);if(i<0)return null;d.distribution[i]={...d.distribution[i],...patch,updatedAt:iso()};write(d);return d.distribution[i];}
function addAnalytics(item){const d=read();d.analytics.unshift(item);d.analytics=cap(d.analytics,1500);write(d);return item;}
function addLearning(item){const d=read();d.learnings.unshift(item);d.learnings=cap(d.learnings,300);write(d);return item;}
function addRevenue(item){const d=read();d.revenue.unshift(item);d.revenue=cap(d.revenue,300);write(d);return item;}
function updateSettings(patch){const d=read();d.settings={...d.settings,...patch};write(d);return d.settings;}
function addNotification(item){const d=read(),incoming={...item},nowIso=iso(),dedupeWindowMs=15*60*1000;const existing=d.notifications.find(x=>!x.read&&x.source===incoming.source&&x.category===incoming.category&&x.entityId===incoming.entityId&&x.title===incoming.title&&Date.now()-new Date(x.createdAt||0).getTime()<dedupeWindowMs);if(existing){Object.assign(existing,{description:incoming.description||existing.description,kind:incoming.kind||existing.kind,action:incoming.action||existing.action,createdAt:nowIso});d.notifications=d.notifications.filter(x=>x.id!==existing.id);d.notifications.unshift(existing);d.notifications=cap(d.notifications,300);write(d);return existing;}const n={id:require('crypto').randomUUID(),createdAt:nowIso,read:false,kind:'info',...incoming};d.notifications.unshift(n);d.notifications=cap(d.notifications,300);write(d);return n;}
function markNotificationRead(id){const d=read();const i=d.notifications.findIndex(x=>x.id===id);if(i<0)return null;d.notifications[i]={...d.notifications[i],read:true,readAt:iso()};write(d);return d.notifications[i];}
function markAllNotificationsRead(){const d=read();const at=iso();d.notifications=d.notifications.map(x=>({...x,read:true,readAt:at}));write(d);return d.notifications;}
function clearNotifications(){const d=read();d.notifications=[];write(d);return []}
function addMediaAsset(item){const d=read();d.mediaAssets.unshift({id:require('crypto').randomUUID(),createdAt:iso(),...item});d.mediaAssets=cap(d.mediaAssets,300);write(d);return d.mediaAssets[0]}
function removeMediaAsset(id){const d=read();d.mediaAssets=d.mediaAssets.filter(x=>x.id!==id);write(d);return d.mediaAssets}
module.exports={read,addOpportunity,addSignals,addRun,addContent,updateContent,addDistribution,findDistribution,updateDistribution,addAnalytics,addLearning,addRevenue,updateSettings,addNotification,markNotificationRead,markAllNotificationsRead,clearNotifications,addMediaAsset,removeMediaAsset};
