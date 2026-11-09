import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import worker,{token,cleanup} from '../worker/index.mjs';
import {generateProtocol,validateAnswer,summarize} from '../worker/protocol.mjs';
import {database} from './d1-adapter.mjs';
import {SITE} from '../docs/config.js';

function fixture() {
  const env = {DB:database(),ADMIN_TOKEN:token(),PUBLIC_ORIGIN:'https://test.example',CONTACT_EMAIL:'contact@example.org',RETENTION_DAYS:'180',PRIVACY_REVIEWED:'true'};
  async function call(path,{method='GET',body,key,origin=env.PUBLIC_ORIGIN}={}) {
    const headers = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return worker.fetch(new Request(`https://api.example${path}`,{method,headers,body:body === undefined ? undefined : JSON.stringify(body)}),env);
  }
  async function invite() {
    const res = await call('/admin/invitations',{method:'POST',key:env.ADMIN_TOKEN,body:{count:1},origin:null});
    assert.equal(res.status,200,await res.clone().text());
    return (await res.json()).invitations[0];
  }
  async function claim(invitation = null, overrides = {}) {
    invitation ||= await invite();
    const config = await (await call('/config')).json();
    const payload = {code:invitation.code,sessionToken:token(),rightsToken:token(),adult:true,consent:true,consentVersion:config.consentVersion,...overrides};
    const response = await call('/claim',{method:'POST',body:payload});
    return {payload,response,invitation};
  }
  return {env,call,invite,claim};
}
async function assertStatus(response,status) { assert.equal(response.status,status,await response.clone().text()); }
function answerBody(item,value,ms=10) {
  return {index:item.index,nonce:item.nonce,answer:value,events:[...value].map((v,i)=>({type:'digit',value:v,ms:ms+i})),enterMs:ms+value.length+1};
}

test('100 items: 50 unique pairs, balanced factors, same product multiset',()=> {
  for(let trial=0;trial<60;trial++) {
    const plan=generateProtocol(); assert.equal(plan.length,100);
    for(const block of [plan.slice(0,50),plan.slice(50)]) {
      assert.equal(new Set(block.map(i=>i.pair)).size,50);
      for(let value=1;value<=10;value++) {
        assert.equal(block.filter(i=>i.a===value).length,5);
        assert.equal(block.filter(i=>i.b===value).length,5);
      }
    }
    assert.deepEqual(plan.slice(0,50).map(i=>i.pair).sort(),plan.slice(50).map(i=>i.pair).sort());
  }
});
test('last effective edit and corrections define timing; limits preserve legitimate errors',()=> {
  const item={a:6,b:8};
  assert.equal(validateAnswer(answerBody({index:0,nonce:'x'},'466'),item),null);
  assert.equal(validateAnswer(answerBody({},'1'),item).answer,'1');
  assert.equal(validateAnswer(answerBody({},'10'),{a:1,b:9}).correct,0);
  assert.equal(validateAnswer(answerBody({},'100'),{a:10,b:10}).correct,1);
  const corrected={answer:'48',enterMs:900,events:[{type:'digit',value:'4',ms:100},{type:'digit',value:'6',ms:200},{type:'backspace',ms:400},{type:'digit',value:'8',ms:500}]};
  const measured=validateAnswer(corrected,item); assert.equal(measured.first,100); assert.equal(measured.last,500); assert.equal(measured.corrections,1);
  assert.equal(validateAnswer({...corrected,enterMs:450},item),null);
});
test('paired averages exclude errors and do not substitute Enter timing',()=> {
  const s=summarize([
    {phase:'copy',pair_id:'a',correct:1,last_ms:800,enter_ms:2000},
    {phase:'copy',pair_id:'b',correct:1,last_ms:1000},
    {phase:'tables',pair_id:'a',correct:1,last_ms:1200},
    {phase:'tables',pair_id:'b',correct:0,last_ms:9000}]);
  assert.equal(s.pairs,1); assert.equal(s.differenceSeconds,.4); assert.equal(s.copySeconds,.8);
  assert.equal(summarize([]).differenceSeconds,null);
});
test('setup stays closed until reviewed; contact is optional but validated if supplied',async()=> {
  const f=fixture(); f.env.CONTACT_EMAIL=''; f.env.PRIVACY_REVIEWED='false';
  assert.equal((await (await f.call('/config')).json()).ready,false);
  await assertStatus(await f.call('/admin/invitations',{method:'POST',key:f.env.ADMIN_TOKEN,body:{count:1}}),503);
  f.env.PRIVACY_REVIEWED='true';
  const config=await (await f.call('/config')).json();
  assert.equal(config.ready,true); assert.equal(config.contact,'');
  await f.invite();
  f.env.CONTACT_EMAIL='invalid';
  assert.equal((await (await f.call('/config')).json()).ready,false);
});
test('admin endpoints and private data are denied without credentials',async()=> {
  const f=fixture();
  for(const path of ['/admin/sessions','/admin/export','/result','/rights/data','/item']) await assertStatus(await f.call(path),401);
  await assertStatus(await f.call('/admin/sessions',{key:token()}),401);
});
test('origin restriction and no-store also apply to errors and exports',async()=> {
  const f=fixture();
  const denied=await f.call('/config',{origin:'https://attacker.example'}); assert.equal(denied.status,403);
  assert.equal(denied.headers.get('access-control-allow-origin'),null);
  const allowed=await f.call('/config'); assert.equal(allowed.headers.get('cache-control'),'no-store');
  assert.equal(allowed.headers.get('access-control-allow-origin'),f.env.PUBLIC_ORIGIN);
  const exported=await f.call('/admin/export',{key:f.env.ADMIN_TOKEN,origin:null});
  assert.equal(exported.headers.get('cache-control'),'no-store');
});
test('consent, adult confirmation and matching notice are mandatory',async()=> {
  const f=fixture();
  for(const override of [{consent:false},{adult:false},{consentVersion:'stale'}]) {
    const c=await f.claim(null,override); await assertStatus(c.response,400);
  }
});
test('one invitation, one session; lost claim response is safely retryable',async()=> {
  const f=fixture(), c=await f.claim(); await assertStatus(c.response,200);
  const response=await f.call('/claim',{method:'POST',body:c.payload}); await assertStatus(response,200);
  const repeated=await f.claim(c.invitation); await assertStatus(repeated.response,409);
  assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n,1);
});
test('concurrent claims yield exactly one successful session',async()=> {
  const f=fixture(), invitation=await f.invite();
  const results=await Promise.all([f.claim(invitation),f.claim(invitation)]);
  assert.deepEqual(results.map(c=>c.response.status).sort(),[200,409]);
});
test('stored credentials are hashes; invitation expiry is enforced',async()=> {
  const f=fixture(), c=await f.claim();
  const row=f.env.DB.sqlite.prepare('SELECT * FROM participants').get();
  assert.notEqual(row.token_hash,c.payload.sessionToken); assert.equal(row.token_hash.length,64);
  const unused=await f.invite();
  f.env.DB.sqlite.prepare('UPDATE invitations SET expires_at=0 WHERE id=?').run(unused.id);
  await assertStatus((await f.claim(unused)).response,409);
});
test('same campaign for everyone; only current prompt is exposed',async()=> {
  const f=fixture(), c1=await f.claim(), c2=await f.claim();
  const get=async c=> {
    const key=c.payload.sessionToken;
    await assertStatus(await f.call('/item',{method:'POST',key,body:{}}),409);
    await f.call('/begin',{method:'POST',key,body:{}});
    return (await f.call('/item',{method:'POST',key,body:{}})).json();
  };
  const a=await get(c1), b=await get(c2); assert.equal(a.prompt,b.prompt); assert.equal(a.index,0);
  for(const forbidden of ['a','b','expected','items','correct','pair']) assert.equal(a[forbidden],undefined);
  const again=await (await f.call('/item?index=99',{method:'POST',key:c1.payload.sessionToken,body:{index:99}})).json();
  assert.equal(again.index,0); assert.equal(again.nonce,a.nonce);
});
test('a wrong nonce, skipped index, overwritten answer or extra digit is rejected',async()=> {
  const f=fixture(), c=await f.claim(), key=c.payload.sessionToken;
  await f.call('/begin',{method:'POST',key,body:{}});
  const item=await (await f.call('/item',{method:'POST',key,body:{}})).json();
  const valid=answerBody(item,item.prompt);
  for(const bad of [{...valid,nonce:'bad'},{...valid,index:99}]) await assertStatus(await f.call('/answer',{method:'POST',key,body:bad}),409);
  await assertStatus(await f.call('/answer',{method:'POST',key,body:answerBody(item,'1234')}),400);
  await assertStatus(await f.call('/answer',{method:'POST',key,body:valid}),200);
  await assertStatus(await f.call('/answer',{method:'POST',key,body:valid}),200);
  await assertStatus(await f.call('/answer',{method:'POST',key,body:{...valid,answer:'0'}}),409);
  assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM trials').get().n,1);
});
test('full 50 + pause + 50 workflow, correct pairing, private CSV and no early result',async()=> {
  const f=fixture(), c=await f.claim(), key=c.payload.sessionToken;
  await f.call('/begin',{method:'POST',key,body:{}});
  const plan=JSON.parse(f.env.DB.sqlite.prepare('SELECT items_json FROM protocols').get().items_json);
  for(let i=0;i<100;i++) {
    if(i===50) {
      await assertStatus(await f.call('/item',{method:'POST',key,body:{}}),409);
      await assertStatus(await f.call('/result',{key}),409);
      await assertStatus(await f.call('/begin',{method:'POST',key,body:{}}),200);
    }
    const res=await f.call('/item',{method:'POST',key,body:{}}); await assertStatus(res,200);
    const item=await res.json(); assert.equal(item.index,i);
    const value=String(plan[i].a*plan[i].b);
    const saved=await f.call('/answer',{method:'POST',key,body:answerBody(item,value,i<50?100:500)}); await assertStatus(saved,200);
    const state=await saved.json(); assert.equal(state.state,i===49?'pause':i===99?'completed':'active');
  }
  const result=await (await f.call('/result',{key})).json();
  assert.equal(result.summary.pairs,50); assert.equal(result.summary.differenceSeconds,.4);
  await assertStatus(await f.call('/item',{method:'POST',key,body:{}}),409);
  const data=await (await f.call('/rights/data',{key:c.payload.rightsToken})).json();
  assert.equal(data.trials.length,100); assert.equal(data.trials[0].expected,undefined);
  const csv=await (await f.call('/admin/export',{key:f.env.ADMIN_TOKEN,origin:null})).text();
  assert.equal(csv.trim().split('\r\n').length,101); assert.ok(csv.includes('last_ms'));
  assert.ok(!csv.includes(c.payload.sessionToken)); assert.ok(!csv.includes(c.payload.rightsToken));
  const summaries=await (await f.call('/admin/summaries',{key:f.env.ADMIN_TOKEN,origin:null})).json();
  assert.equal(summaries.includedParticipants,1); assert.equal(summaries.meanDifferenceSeconds,.4);
  assert.equal(summaries.summaries[0].pairs,50);
});
test('interruption is terminal, participant access is isolated and withdrawal cascades',async()=> {
  const f=fixture(), a=await f.claim(), b=await f.claim();
  const key=a.payload.sessionToken;
  await f.call('/begin',{method:'POST',key,body:{}});
  const item=await (await f.call('/item',{method:'POST',key,body:{}})).json();
  await f.call('/answer',{method:'POST',key,body:answerBody(item,item.prompt)});
  await f.call('/interrupt',{method:'POST',key,body:{reason:'hidden'}});
  await assertStatus(await f.call('/begin',{method:'POST',key,body:{}}),409);
  const onlyB=await (await f.call('/rights/data',{key:b.payload.rightsToken})).json(); assert.equal(onlyB.trials.length,0);
  await assertStatus(await f.call('/rights/data',{key}),401);
  await assertStatus(await f.call('/rights/delete',{method:'POST',key:a.payload.rightsToken,body:{confirm:true}}),200);
  assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM trials').get().n,0);
  assert.equal(f.env.DB.sqlite.prepare('SELECT participant_id FROM erasures').get().participant_id,a.invitation.id);
  await assertStatus(await f.call('/result',{key}),401);
  await assertStatus((await f.claim(a.invitation)).response,409);
});
test('retention cleans expired records and prevents access even before daily job',async()=> {
  const f=fixture(), c=await f.claim();
  f.env.DB.sqlite.exec('UPDATE participants SET expires_at=0; UPDATE invitations SET expires_at=0');
  await assertStatus(await f.call('/rights/data',{key:c.payload.rightsToken}),401);
  await cleanup(f.env);
  assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n,0);
  assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM invitations').get().n,0);
});
test('malformed and oversized JSON are rejected, including without Content-Length',async()=> {
  const f=fixture();
  const req=new Request('https://api.example/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(50000)});
  await assertStatus(await worker.fetch(req,f.env),413);
  const invalid=new Request('https://api.example/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:'['});
  await assertStatus(await worker.fetch(invalid,f.env),400);
});
test('public directory contains no database, server module, credentials or protocol',()=> {
  const files=readdirSync(new URL('../docs/',import.meta.url));
  assert.ok(!files.some(f=>/\.(sql|sqlite|csv|mjs)$/.test(f)));
  const config=readFileSync(new URL('../docs/config.js',import.meta.url),'utf8');
  assert.ok(config.includes('apiBase'));
  if (SITE.apiBase) {
    const endpoint=new URL(SITE.apiBase);
    assert.equal(endpoint.protocol,'https:');
    assert.equal(endpoint.username+endpoint.password+endpoint.search+endpoint.hash,'');
    assert.equal(endpoint.pathname,'/');
  }
  const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  assert.ok(!app.includes('generateProtocol')); assert.ok(!app.includes('ADMIN_TOKEN'));
  const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  assert.ok(!/type="checkbox"[^>]*\bchecked/.test(html));
  assert.ok(html.includes('form-action'));
});
