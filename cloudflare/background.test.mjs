import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {hkdfSync} from 'node:crypto';
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
          if(sql.startsWith('INSERT INTO ling_v4_jobs'))return {meta:{changes:1}};
          if(sql.startsWith('INSERT INTO ling_v4_settings(key,value) SELECT')){
            if(state.get('spotify_token')!==args[2]||state.get('spotify_enabled')!=='yes')return {meta:{changes:0}};
            state.set(args[0],args[1]);return {meta:{changes:1}};
          }
          if(sql.startsWith("DELETE FROM ling_v4_settings WHERE key IN ('spotify_enabled','spotify_token')")){
            if(state.get('spotify_token')!==args[0])return {meta:{changes:0}};
            state.delete('spotify_enabled');state.delete('spotify_token');return {meta:{changes:2}};
          }
          if(sql.includes('INSERT OR IGNORE INTO ling_v4_settings')){
            if(!state.has(args[0]))state.set(args[0],args[1]);
            return {meta:{changes:1}};
          }
          if(sql.includes('INSERT INTO ling_v4_dispatch'))return {meta:{changes:1}};
          if(sql.startsWith('INSERT INTO ling_v4_settings'))state.set(args[0],args[1]);
          if(sql==='DELETE FROM ling_v4_settings WHERE key=?')state.delete(args[0]);
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

async function spotifyFixture(t){
  const fixture=fakeD1();
  const env={DB:fixture.db,LING_ACCESS_CODE:ACCESS};
  const response=await handleLingBackground(req('bg_enable_spotify',{}, {
    clientId:'a'.repeat(32),refreshToken:'refresh-original-'.repeat(3)
  }),env);
  assert.equal(response.status,200);
  assert.equal(fixture.state.get('spotify_enabled'),'yes');
  assert.equal(fixture.state.get('spotify_token').includes('refresh-original'),false);
  const previous=globalThis.fetch;
  t.after(()=>{globalThis.fetch=previous;});
  return {...fixture,env};
}

test('Spotify refresh rotation is encrypted and reused; 204 stores no track history',async t=>{
  const {env,state,statements}=await spotifyFixture(t);
  let calls=0;
  globalThis.fetch=async(url,options)=>{
    calls++;
    if(String(url).includes('/api/token')){
      assert.equal(options.body.get('refresh_token'),calls===1?'refresh-original-'.repeat(3):'rotated-refresh-token');
      return Response.json({access_token:'access',refresh_token:'rotated-refresh-token'});
    }
    assert.equal(options.headers.Authorization,'Bearer access');
    return new Response(null,{status:204});
  };
  await runLingBackground('*/10 * * * *',env);
  await runLingBackground('*/10 * * * *',env);
  assert.equal(calls,4);
  assert.equal(state.has('spotify_last'),false);
  assert.equal(state.get('spotify_token').includes('rotated-refresh-token'),false);
  assert.equal(statements.some(s=>/INSERT.*messages/i.test(s)),false);
});

for(const stage of ['token','player'])test(`Spotify ${stage} 429 respects Retry-After longer than one day`,async t=>{
  const {env,state}=await spotifyFixture(t);
  let calls=0;
  globalThis.fetch=async url=>{
    calls++;
    if(stage==='player'&&String(url).includes('/api/token'))return Response.json({access_token:'access'});
    return Response.json({error:{}},{status:429,headers:{'Retry-After':'172800'}});
  };
  const before=Date.now();
  await runLingBackground('*/10 * * * *',env);
  assert.ok(Number(state.get('spotify_backoff_until'))>=before+172800000);
  const first=calls;
  await runLingBackground('*/10 * * * *',env);
  assert.equal(calls,first);
});

test('expired Spotify grant disables polling and removes stored refresh token',async t=>{
  const {env,state}=await spotifyFixture(t);
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({error:'invalid_grant'},{status:400});};
  await runLingBackground('*/10 * * * *',env);
  await runLingBackground('*/10 * * * *',env);
  assert.equal(calls,1);
  assert.equal(state.has('spotify_enabled'),false);
  assert.equal(state.has('spotify_token'),false);
});

const encode=x=>Buffer.from(x).toString('base64url');
test('subscription rejects invalid points, auth lengths and nonstandard endpoint ports before storage',async()=>{
  const {db,statements}=fakeD1();
  const env={DB:db,LING_ACCESS_CODE:ACCESS};
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const keys={p256dh:encode(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:encode(new Uint8Array(16))};
  for(const subscription of [
    {endpoint:'https://web.push.apple.com:444/test',keys},
    {endpoint:'https://web.push.apple.com/test',keys:{...keys,auth:encode(new Uint8Array(17))}},
    {endpoint:'https://web.push.apple.com/test',keys:{...keys,p256dh:encode(new Uint8Array(65).fill(4))}}
  ])assert.equal((await handleLingBackground(req('bg_subscribe',{}, {subscription}),env)).status,503);
  assert.equal(statements.some(s=>s.startsWith('INSERT OR REPLACE INTO ling_v4_push')),false);
  assert.equal((await handleLingBackground(req('bg_subscribe',{}, {subscription:{endpoint:'https://web.push.apple.com/test',keys}}),env)).status,200);
});

test('Web Push decrypts with receiver keys and VAPID signature verifies; gone endpoints are deleted',async t=>{
  const {db,statements}=fakeD1();
  const env={DB:db,LING_ACCESS_CODE:ACCESS};
  const vapid=await (await handleLingBackground(req('bg_vapid'),env)).json();
  const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const client=Buffer.from(await crypto.subtle.exportKey('raw',receiver.publicKey));
  const auth=crypto.getRandomValues(new Uint8Array(16));
  const endpoint='https://web.push.apple.com/test';
  const prepare=db.prepare;
  db.prepare=sql=>{
    if(sql.startsWith('SELECT count'))return {async first(){return {n:1};}};
    if(sql.startsWith('SELECT endpoint'))return {async all(){return {results:[{endpoint,p256dh:encode(client),auth:encode(auth)}]};}};
    return prepare(sql);
  };
  const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
  for(const status of [201,410]){
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,endpoint);
      assert.equal(options.redirect,'error');
      assert.equal(options.headers['Content-Encoding'],'aes128gcm');
      const token=options.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
      assert.equal(token[2],vapid.publicKey);
      const parts=token[1].split('.');
      const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
      assert.equal(claims.aud,'https://web.push.apple.com');
      assert.ok(claims.exp>Date.now()/1000&&claims.exp<Date.now()/1000+86400);
      const signingKey=await crypto.subtle.importKey('raw',Buffer.from(vapid.publicKey,'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
      assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},signingKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts[0]+'.'+parts[1])),true);
      const body=Buffer.from(options.body),salt=body.subarray(0,16);
      assert.equal(body.readUInt32BE(16),4096);
      assert.equal(body[20],65);
      const server=body.subarray(21,86);
      const serverKey=await crypto.subtle.importKey('raw',server,{name:'ECDH',namedCurve:'P-256'},false,[]);
      const shared=await crypto.subtle.deriveBits({name:'ECDH',public:serverKey},receiver.privateKey,256);
      const ikm=hkdfSync('sha256',Buffer.from(shared),auth,Buffer.concat([Buffer.from('WebPush: info\0'),client,server]),32);
      const cek=hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16);
      const nonce=hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12);
      const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']);
      const plain=Buffer.from(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,body.subarray(86)));
      assert.equal(plain.at(-1),2);
      assert.equal(JSON.parse(plain.subarray(0,-1)).tag,'ling-test');
      return new Response(null,{status});
    };
    assert.equal((await handleLingBackground(req('bg_test_push'),env)).status,status===201?200:503);
  }
  assert.ok(statements.includes('DELETE FROM ling_v4_push WHERE endpoint=?'));
});

