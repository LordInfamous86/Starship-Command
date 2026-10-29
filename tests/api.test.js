const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server.js');

async function withApi(run){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'starship-api-'));
  const server=createServer({storePath:path.join(dir,'campaigns.json')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{return await run(base)}
  finally{server.closeIdleConnections?.();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await fs.rm(dir,{recursive:true,force:true});}
}

test('API creates and reloads a persisted campaign',async()=>withApi(async base=>{
  const created=await fetch(`${base}/api/campaigns`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})});
  assert.equal(created.status,201);
  const campaign=await created.json();
  assert.equal(campaign.state.status,'active');
  assert.equal(campaign.revision,0);
  const loaded=await fetch(`${base}/api/campaigns/${campaign.id}`);
  assert.equal(loaded.status,200);
  assert.deepEqual(await loaded.json(),campaign);
}));

test('API applies a command through the engine and increments campaign revision',async()=>withApi(async base=>{
  const created=await fetch(`${base}/api/campaigns`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const campaign=await created.json();
  const response=await fetch(`${base}/api/campaigns/${campaign.id}/commands`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'command',command:'scan',expectedRevision:0})});
  assert.equal(response.status,200);
  const changed=await response.json();
  assert.equal(changed.revision,1);
  assert.equal(changed.state.progress,34);
  assert.equal(changed.state.pendingEvent,'sensor');
  assert.equal(changed.state.power,62);
}));

test('API rejects stale revisions and invalid resource spending',async()=>withApi(async base=>{
  const created=await fetch(`${base}/api/campaigns`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const campaign=await created.json();
  const scan=()=>fetch(`${base}/api/campaigns/${campaign.id}/commands`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'command',command:'scan',expectedRevision:0})});
  assert.equal((await scan()).status,200);
  const stale=await scan();
  assert.equal(stale.status,409);
  const current=await stale.json();
  assert.equal(current.revision,1);
  const invalid=await fetch(`${base}/api/campaigns/${campaign.id}/commands`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'choice',choice:'withdraw',expectedRevision:1})});
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).revision,1);
}));

test('API serves the playable bridge from the same origin',async()=>withApi(async base=>{
  const response=await fetch(base);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/html/);
  assert.match(await response.text(),/Starship Command/);
}));
