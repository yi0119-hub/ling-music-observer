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


function fakeD1({daily=false}={}){
  const state=new Map(daily?[['push_daily','yes']]:[]);
  const statements=[];
  const db={
    prepare(sql){
      statements.push(sql);
      let args=[];
      const statement={
        bind(...x){args=x;return statement;},
        async first(){
          if(sql.includes('SELECT value FROM ling_v4_settings'))return state.has(args[0])?{value:state.get(args[0])}:null;
          return null;
        },
        async run(){
          if(sql.includes('INSERT OR IGNORE INTO ling_v4_settings')){
            if(!state.has(args[0]))state.set(args[0],args[1]);
            return {meta:{changes:1}};
          }
          if(sql.includes('INSERT INTO ling_v4_dispatch'))return {meta:{changes:1}};
          return {meta:{changes:0}};
        }
      };
      return statement;
    },
    async batch(items){for(const item of items)await item.run();}
  };
  return {db,state,statements};
}

test('concurrent VAPID initialization never mixes key pairs',async()=>{
  const {db,state}=fakeD1();
  const env={DB:db,LING_ACCESS_CODE:ACCESS};
  const responses=await Promise.all([
    handleLingBackground(req('bg_vapid'),env),
    handleLingBackground(req('bg_vapid'),env)
  ]);
  for(const response of responses)assert.equal(response.status,200);
  const keys=await Promise.all(responses.map(x=>x.json()));
  assert.equal(keys[0].publicKey,keys[1].publicKey);
  assert.equal(keys[0].publicKey.length,87);
  assert.equal([...state.keys()].filter(x=>x==='vapid_bundle').length,1);
  assert.equal(state.has('vapid_private'),false);
});

test('daily reminder never inserts into existing chat tables',async()=>{
  const {db,statements}=fakeD1({daily:true});
  await runLingBackground('0 12 * * *',{DB:db,LING_ACCESS_CODE:ACCESS});
  assert.equal(statements.some(sql=>/\bINSERT\s+INTO\s+messages\b/i.test(sql)),false);
  assert.equal(statements.some(sql=>/ling_v4_dispatch/.test(sql)),true);
});


test('oversized background payload is rejected before database access',async()=>{
  const huge='x'.repeat(5000);
  const request=req('bg_config',{}, {extra:huge});
  const response=await handleLingBackground(request,{
    DB:{prepare(){throw Error('Database should not be touched by oversized request');}},
    LING_ACCESS_CODE:ACCESS
  });
  assert.equal(response.status,413);
});
