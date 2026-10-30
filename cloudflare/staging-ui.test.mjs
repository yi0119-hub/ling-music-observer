import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./staging-ui.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const CLIENT='a'.repeat(32),KEY='test-only-'.repeat(5);
function fixture({pending=null,search='',fetch=async()=>Response.json({})}={}){
  const elements=new Map(),store=new Map();
  if(pending)store.set('ling-staging-pkce',JSON.stringify(pending));
  const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',checked:false,disabled:false});return elements.get(id);};
  el('key').value=KEY;el('spotifyClient').value=CLIENT;
  const events=[];const location={origin:'https://staging.example',search,assign(url){events.push({type:'navigate',url});}};
  const context={document:{getElementById:el},location,history:{replaceState(){events.push({type:'clean-url'});}},window:{},navigator:{},
    crypto,TextEncoder,Uint8Array,URLSearchParams,AbortSignal,Date,JSON,btoa,atob,
    localStorage:{getItem(key){return store.get(key)||null;},setItem(key,value){store.set(key,value);},removeItem(key){store.delete(key);}},
    fetch:async(...args)=>{events.push({type:'fetch',url:args[0]});return fetch(...args);}};
  vm.runInNewContext(source,context);
  return {el,store,events,context};
}
test('Spotify connection requires explicit consent and uses minimal PKCE scope without saving access code',async()=>{
  const {el,events,store}=fixture();
  el('spotifyConnect').onclick();await settle();assert.equal(events.length,0);
  assert.match(el('message').textContent,/勾選/);
  el('spotifyConsent').checked=true;
  el('spotifyConnect').onclick();await settle();await settle();
  const url=new URL(events.find(e=>e.type==='navigate').url);
  assert.equal(url.origin,'https://accounts.spotify.com');
  assert.equal(url.searchParams.get('scope'),'user-read-currently-playing');
  assert.equal(url.searchParams.get('redirect_uri'),'https://staging.example/');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const pending=JSON.parse(store.get('ling-staging-pkce'));
  assert.equal(pending.state,url.searchParams.get('state'));
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pending.verifier));
  assert.equal(url.searchParams.get('code_challenge'),Buffer.from(hash).toString('base64url'));
  assert.equal(JSON.stringify([...store]).includes(KEY),false);
});
for(const kind of ['wrong-state','expired','wrong-origin'])test(`OAuth callback rejects ${kind} before token exchange`,async()=>{
  const pending={state:'expected',created:Date.now(),callback:'https://staging.example/',clientId:CLIENT,verifier:'test-verifier'};
  if(kind==='expired')pending.created-=11*60*1000;
  if(kind==='wrong-origin')pending.callback='https://evil.example/';
  const {events,el,store}=fixture({pending,search:'?code=test-code&state='+(kind==='wrong-state'?'wrong':'expected')});
  await settle();assert.equal(events[0].type,'clean-url');
  assert.equal(events.some(e=>e.type==='fetch'),false);
  assert.equal(store.has('ling-staging-pkce'),false);
  assert.match(el('message').textContent,/驗證失敗/);
});
test('OAuth tokens remain in memory until a separate consented enable click and preserve daily preferences',async()=>{
  const pending={state:'expected',created:Date.now(),callback:'https://staging.example/',clientId:CLIENT,verifier:'test-verifier'};
  const actions=[];
  const {events,el,store}=fixture({pending,search:'?code=test-code&state=expected',fetch:async(url,options)=>{
    if(url==='https://accounts.spotify.com/api/token'){
      assert.equal(options.body.get('code_verifier'),'test-verifier');
      return Response.json({refresh_token:'test-only-refresh-token',access_token:'test-only-access'});
    }
    const body=JSON.parse(options.body);actions.push(body);
    if(body.action==='bg_status')return Response.json({pushSubscriptions:1,dailyPush:true,songEnabled:true});
    return Response.json({ok:true});
  }});
  await settle();await settle();
  assert.equal(events[0].type,'clean-url');
  assert.equal(actions.length,0);
  assert.equal(store.size,0);
  assert.equal(el('message').textContent.includes('test-only-refresh-token'),false);
  el('spotifyEnable').onclick();await settle();assert.equal(actions.length,0);
  el('spotifyConsent').checked=true;
  el('spotifyEnable').onclick();await settle();await settle();
  assert.equal(actions.find(x=>x.action==='bg_enable_spotify').refreshToken,'test-only-refresh-token');
  assert.deepEqual(actions.find(x=>x.action==='bg_config'),{action:'bg_config',daily:true,songPush:true});
  assert.equal(store.size,0);
});
test('enable refuses authorization reuse after the pending grant was uploaded',async()=>{
  const {el,events}=fixture();el('spotifyConsent').checked=true;
  el('spotifyEnable').onclick();await settle();
  assert.equal(events.some(e=>e.type==='fetch'),false);
  assert.match(el('message').textContent,/連接 Spotify/);
});
test('expired PKCE data is cleared on ordinary page load without a callback',async()=>{
  const {store}=fixture({pending:{created:Date.now()-11*60*1000}});
  await settle();assert.equal(store.size,0);
});
