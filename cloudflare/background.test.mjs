import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleLingBackground,runLingBackground} from './ling-background-addon.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const ORIGIN='https://yi0119-hub.github.io';
const ACCESS='c'.repeat(40);
const url='https://example.workers.dev/';
function req(action,headers={},body={}){
  return new Request(url,{method:'POST',headers:{
    Origin:ORIGIN,
    'X-Ling-Access-Code':ACCESS,
    'Content-Type':'application/json',
    ...headers
  },body:JSON.stringify({action,...body})});
}
test('blocks unexpected origin before touching database',async()=>{
  const response=await handleLingBackground(req('bg_status',{Origin:'https://evil.example'}),{});
  assert.equal(response.status,403);
});
test('missing D1 safely fails',async()=>{
  const response=await handleLingBackground(req('bg_status'),{LING_ACCESS_CODE:ACCESS});
  assert.equal(response.status,503);
});
test('requires correct long passcode before reading data',async()=>{
  const response=await handleLingBackground(req('bg_status',{'X-Ling-Access-Code':'z'.repeat(40)}),{
    DB:{prepare(){throw Error('Database should not be touched');}},
    LING_ACCESS_CODE:ACCESS
  });
  assert.equal(response.status,401);
});
test('blocks malformed JSON and avoids unrelated chat actions',async()=>{
  const r=await handleLingBackground(new Request(url,{method:'POST',headers:{
    Origin:ORIGIN,'X-Ling-Access-Code':ACCESS,'Content-Type':'application/json'
  },body:'{oops'}),{
    DB:{prepare(){throw Error('Database should not be touched');}},LING_ACCESS_CODE:ACCESS
  });
  assert.equal(r.status,400);
});
test('Cron does not access D1 when required secret missing',async()=>{
  await runLingBackground('*/10 * * * *',{DB:{prepare(){throw Error('Database should not be touched');}}});
});
