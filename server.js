const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Engine = require('./engine.js');

const ROOT = __dirname;
const DEFAULT_STORE = path.join(ROOT, 'data', 'campaigns.json');
const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/sim.js': ['sim.js', 'text/javascript; charset=utf-8'],
  '/audio.js': ['audio.js', 'text/javascript; charset=utf-8'],
  '/engine.js': ['engine.js', 'text/javascript; charset=utf-8'],
  '/crew-portraits.png': ['crew-portraits.png', 'image/png']
};

function sendJson(res, status, value) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let raw='';
  for await (const chunk of req) {
    raw+=chunk;
    if(raw.length>1_000_000)throw Object.assign(new Error('Request body is too large.'),{status:413});
  }
  try{return raw?JSON.parse(raw):{}}catch{return Object.assign(new Error('Request body must be valid JSON.'),{status:400});}
}

function isCampaignState(state) {
  return state&&typeof state==='object'&&Number.isFinite(state.turn)&&Array.isArray(state.crew)&&state.systems&&Number.isFinite(state.power)&&Number.isFinite(state.hull)&&Number.isFinite(state.progress)&&['active','success','failure'].includes(state.status);
}

function createServer({storePath=DEFAULT_STORE}={}) {
  let campaigns;
  let queue=Promise.resolve();
  async function getCampaigns(){
    if(campaigns)return campaigns;
    try{campaigns=JSON.parse(await fs.readFile(storePath,'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;campaigns={};}
    return campaigns;
  }
  function serialized(task){
    const result=queue.then(task);
    queue=result.catch(()=>{});
    return result;
  }
  async function saveCampaigns(){
    await fs.mkdir(path.dirname(storePath),{recursive:true});
    const temp=`${storePath}.${process.pid}.tmp`;
    await fs.writeFile(temp,JSON.stringify(campaigns,null,2),'utf8');
    await fs.rename(temp,storePath);
  }
  async function serveAsset(pathname,res){
    const asset=assets[pathname];if(!asset)return false;
    try{const contents=await fs.readFile(path.join(ROOT,asset[0]));res.writeHead(200,{'content-type':asset[1],'cache-control':'no-cache'});res.end(contents);}
    catch{sendJson(res,404,{error:'Asset not found.'});}
    return true;
  }
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&url.pathname==='/api/health')return sendJson(res,200,{ok:true,storage:'local-json'});
      if(req.method==='POST'&&url.pathname==='/api/campaigns'){
        const body=await readBody(req),state=body.state||Engine.createInitialState();
        if(!isCampaignState(state))return sendJson(res,400,{error:'Campaign state is invalid.'});
        return serialized(async()=>{
          await getCampaigns();const id=randomUUID(),campaign={id,state,revision:0,updatedAt:new Date().toISOString()};campaigns[id]=campaign;await saveCampaigns();return sendJson(res,201,campaign);
        });
      }
      const match=url.pathname.match(/^\/api\/campaigns\/([0-9a-f-]+)(?:\/(commands))?$/i);
      if(match&&req.method==='GET'&&!match[2]){
        const data=await getCampaigns(),campaign=data[match[1]];
        return campaign?sendJson(res,200,campaign):sendJson(res,404,{error:'Campaign not found.'});
      }
      if(match&&req.method==='POST'&&match[2]){
        const body=await readBody(req);
        return serialized(async()=>{
          await getCampaigns();const campaign=campaigns[match[1]];
          if(!campaign)return sendJson(res,404,{error:'Campaign not found.'});
          if(Number.isInteger(body.expectedRevision)&&body.expectedRevision!==campaign.revision)return sendJson(res,409,{error:'Campaign revision is out of date.',...campaign});
          let next;
          if(body.type==='command')next=Engine.command(campaign.state,body.command);
          else if(body.type==='choice')next=Engine.resolveChoice(campaign.state,body.choice,body.narrative);
          else if(body.type==='assignCrew')next=Engine.assignCrew(campaign.state,body.crewId,body.assignment);
          else if(body.type==='reset')next=Engine.createInitialState();
          else if(body.type==='restart')next=Engine.restartMission(campaign.state);
          else if(body.type==='nextMission')next=Engine.createNextState(campaign.state,body.missionId);
          else if(body.type==='purchaseUpgrade')next=Engine.purchaseUpgrade(campaign.state,body.upgradeId);
          else return sendJson(res,400,{error:'Unknown campaign operation.'});
          if(next===campaign.state)return sendJson(res,400,{error:'Command is invalid or unavailable.',...campaign});
          campaign.state=next;campaign.revision++;campaign.updatedAt=new Date().toISOString();await saveCampaigns();return sendJson(res,200,campaign);
        });
      }
      if(req.method==='GET'&&await serveAsset(url.pathname,res))return;
      sendJson(res,404,{error:'Route not found.'});
    }catch(error){sendJson(res,error.status||500,{error:error.status?error.message:'Server error.'});}
  });
  return server;
}

if(require.main===module){
  const port=Number(process.env.PORT)||3000;
  createServer().listen(port,'127.0.0.1',()=>console.log(`Starship Command API ready at http://127.0.0.1:${port}`));
}

module.exports={createServer};
