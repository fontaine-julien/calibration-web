import test from 'node:test';
import assert from 'node:assert/strict';
import {requestApi} from '../tools/network.mjs';

test('DNS failure explains URL correction without exposing the secret',async()=> {
  const secret='private-test-credential';
  const fail=async()=>{throw new TypeError('fetch failed',{cause:{code:'ENOTFOUND'}});};
  await assert.rejects(requestApi('https://bad.example','/admin/invitations',{key:secret},fail),error=>
    error.message.includes('DNS') && error.message.includes('docs/config.js') && !error.message.includes(secret));
});
test('authentication error remains distinct from a connection failure',async()=> {
  const fail=async()=>new Response(JSON.stringify({error:'Accès refusé.'}),{status:401});
  await assert.rejects(requestApi('https://api.example','/admin/sessions',{},fail),{message:'Accès refusé.'});
});
test('non-JSON gateway failure shows its HTTP status',async()=> {
  const fail=async()=>new Response('<html>Bad gateway</html>',{status:502});
  await assert.rejects(requestApi('https://api.example','/config',{},fail),/HTTP 502/);
});
test('public connectivity check sends no authorization header',async()=> {
  const inspect=async(url,options)=> {
    assert.equal(url,'https://api.example/config');
    assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.method,'GET');
    return new Response(JSON.stringify({ready:true}));
  };
  assert.equal((await (await requestApi('https://api.example','/config',{},inspect)).json()).ready,true);
});
