/*
 * 玲的背景模組 — 獨立於現有聊天 Worker，預設不主動執行 Spotify。
 * No Spotify metadata forwarded to AI; no playback history saved.
 * Worker D1 binding: DB. Secret: LING_ACCESS_CODE (32+ random characters).
 */
const HOME = 'https://yi0119-hub.github.io/ling-music-observer/';
const enc = new TextEncoder(), dec = new TextDecoder();
const bytes = x => typeof x === 'string' ? enc.encode(x) : x;
const cat = (...parts) => { const a=parts.map(bytes), out=new Uint8Array(a.reduce((n,x)=>n+x.length,0)); let p=0; for(const x of a){out.set(x,p);p+=x.length;} return out; };
const b64 = x => {let s='';for(const n of new Uint8Array(x))s+=String.fromCharCode(n);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const un64 = x => Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-x.length%4)%4)),c=>c.charCodeAt(0));
const dig = async x => new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(x)));
const get = async(db,k) => (await db.prepare('SELECT value FROM ling_v4_settings WHERE key=?').bind(k).first())?.value ?? null;
const set = async(db,k,v) => db.prepare('INSERT INTO ling_v4_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,String(v)).run();
const del = async(db,k) => db.prepare('DELETE FROM ling_v4_settings WHERE key=?').bind(k).run();
const origin = 'https://yi0119-hub.github.io';
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin,'Cache-Control':'no-store','Vary':'Origin'}});}
async function validAccess(supplied,secret){
  if(typeof supplied!=='string'||supplied.length<32||supplied.length>256||typeof secret!=='string'||secret.length<32)return false;
  const a=await dig(supplied), b=await dig(secret);let v=0;for(let i=0;i<a.length;i++)v|=a[i]^b[i];return v===0;
}
async function aes(env){
  const key=await dig('ling-v4-aes-gcm-key-v1\u0000'+env.LING_ACCESS_CODE);
  return crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(env,plain){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  return b64(cat(iv,new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await aes(env),bytes(plain)))));
}
async function unseal(env,text){
  const all=un64(text);if(all.length<29)throw Error('Bad encrypted value');
  return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:all.slice(0,12)},await aes(env),all.slice(12)));
}
async function init(db){
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS ling_v4_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS ling_v4_push (endpoint TEXT PRIMARY KEY,p256dh TEXT NOT NULL,auth TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    db.prepare('CREATE TABLE IF NOT EXISTS ling_v4_dispatch (name TEXT PRIMARY KEY,last_date TEXT NOT NULL)')
  ]);
}
const allowedPushHost = hostname => hostname==='web.push.apple.com'||hostname.endsWith('.push.apple.com')||
  hostname==='fcm.googleapis.com'||hostname==='updates.push.services.mozilla.com';
function securePushUrl(raw){
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!allowedPushHost(u.hostname)||raw.length>2200)throw Error('Untrusted push endpoint');
  return u;
}
async function getVapidBundle(db,env){
  // One atomic row prevents concurrent first-time registrations from mixing key pairs.
  const existing=await get(db,'vapid_bundle');
  if(existing)return JSON.parse(existing);
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const value=JSON.stringify({
    publicKey:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),
    sealedPrivateKey:await seal(env,JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey)))
  });
  await db.prepare('INSERT OR IGNORE INTO ling_v4_settings(key,value) VALUES(?,?)').bind('vapid_bundle',value).run();
  const stored=await get(db,'vapid_bundle');
  if(!stored)throw Error('VAPID initialization failed');
  return JSON.parse(stored);
}
async function hkdf(key,salt,info,n){
  const k=await crypto.subtle.importKey('raw',key,'HKDF',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},k,n*8));
}
async function payloadFor(sub,data){
  const client=un64(sub.p256dh),auth=un64(sub.auth);
  if(client.length!==65||client[0]!==4||auth.length!==16)throw Error('Bad push keys');
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const ephemeral=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const publicKey=await crypto.subtle.importKey('raw',client,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},pair.privateKey,256));
  const ikm=await hkdf(shared,auth,cat('WebPush: info\u0000',client,ephemeral),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(ikm,salt,bytes('Content-Encoding: aes128gcm\u0000'),16);
  const nonce=await hkdf(ikm,salt,bytes('Content-Encoding: nonce\u0000'),12);
  const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,cat(JSON.stringify(data),new Uint8Array([2]))));
  return cat(salt,new Uint8Array([0,0,16,0,ephemeral.length]),ephemeral,encrypted);
}
async function vapidJwt(priv,pushOrigin){
  const header=b64(bytes(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const body=b64(bytes(JSON.stringify({aud:pushOrigin,exp:Math.floor(Date.now()/1000)+3600,sub:HOME})));
  const k=await crypto.subtle.importKey('jwk',priv,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  return header+'.'+body+'.'+b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},k,bytes(header+'.'+body)));
}
async function sendAll(db,env,data){
  const stored=await get(db,'vapid_bundle');
  if(!stored)return {accepted:0,total:0};
  const bundle=JSON.parse(stored);
  const pub=bundle.publicKey;
  const subs=(await db.prepare('SELECT endpoint,p256dh,auth FROM ling_v4_push LIMIT 12').all()).results||[];
  const privateKey=JSON.parse(await unseal(env,bundle.sealedPrivateKey));
  let accepted=0;
  for(const sub of subs){
    try{
      const endpoint=securePushUrl(sub.endpoint);
      const jwt=await vapidJwt(privateKey,endpoint.origin);
      const body=await payloadFor(sub,data);
      const res=await fetch(endpoint.href,{method:'POST',headers:{
        Authorization:'vapid t='+jwt+', k='+pub,
        'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','TTL':'3600'
      },body,redirect:'error'});
      if(res.ok)accepted++;
      if(res.status===404||res.status===410)await db.prepare('DELETE FROM ling_v4_push WHERE endpoint=?').bind(sub.endpoint).run();
    }catch(error){console.warn('Web Push send failure',String(error).slice(0,70));}
  }
  return {accepted,total:subs.length};
}
function taipei(){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};
}
function retryAt(response){
  const seconds=Number(response.headers.get('Retry-After'));
  return Date.now()+Math.max(600,Number.isFinite(seconds)&&seconds>0?seconds:600)*1000;
}
async function songCheck(db,env){
  if(await get(db,'spotify_enabled')!=='yes')return;
  if(Date.now()<Number(await get(db,'spotify_backoff_until')||0))return;
  const crypt=await get(db,'spotify_token'),clientId=await get(db,'spotify_client');
  if(!crypt||!clientId)return;
  let refresh;try{refresh=await unseal(env,crypt);}catch{console.warn('Spotify token cannot decrypt');return;}
  const auth=await fetch('https://accounts.spotify.com/api/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:clientId})
  });
  if(!auth.ok){
    if([400,401].includes(auth.status)){
      await set(db,'spotify_enabled','no');
      await del(db,'spotify_token');
      await sendAll(db,env,{title:'玲的音樂觀察室',body:'Spotify 背景授權已失效，請重新授權。',tag:'ling-auth'});
    }else if(auth.status===429)await set(db,'spotify_backoff_until',retryAt(auth));
    return;
  }
  const token=await auth.json();
  if(token.refresh_token&&token.refresh_token!==refresh)await set(db,'spotify_token',await seal(env,token.refresh_token));
  if(!token.access_token)return;
  const res=await fetch('https://api.spotify.com/v1/me/player/currently-playing',{headers:{Authorization:'Bearer '+token.access_token}});
  if(res.status===204)return;
  if(res.status===429){
    let reason='';try{reason=(await res.json()).error?.reason||'';}catch{}
    if(reason==='QUOTA_EXCEEDED'){
      await set(db,'spotify_enabled','no');
      await sendAll(db,env,{title:'玲的音樂觀察室',body:'Spotify 配額受限，已暫停背景偵測。',tag:'ling-quota'});
    }else {
      await set(db,'spotify_backoff_until',retryAt(res));
    }
    return;
  }
  if(!res.ok)return;
  const result=await res.json();
  if(!result?.is_playing||result.item?.type!=='track'||!result.item?.id)return;
  const hash=b64(await dig('ling-v4-last-track:'+result.item.id));
  const prev=await get(db,'spotify_last');
  if(prev===hash)return;
  await set(db,'spotify_last',hash);
  if(!prev||await get(db,'push_song')!=='yes')return;
  const last=Number(await get(db,'spotify_last_push')||0),now=Date.now(),hour=taipei().hour;
  if(hour<9||hour>=23||now-last<15*60000)return;
  await set(db,'spotify_last_push',now);
  await sendAll(db,env,{title:'玲的音樂觀察室',body:'播放狀態有變化了，打開觀察室看看吧。',tag:'ling-song'});
}
async function dailyCheck(db,env){
  if(await get(db,'push_daily')!=='yes')return;
  const date=taipei().date;
  const changed=await db.prepare('INSERT INTO ling_v4_dispatch(name,last_date) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET last_date=excluded.last_date WHERE last_date<>excluded.last_date').bind('daily-checkin',date).run();
  if(!changed.meta?.changes)return;
  const msg='老大，今天過得怎麼樣？有空來音樂觀察室聊聊吧。';
  // Do not write into the existing chat schema: this reminder is push-only.
  await sendAll(db,env,{title:'玲來打個招呼',body:msg,tag:'ling-daily'});
}

export async function handleLingBackground(request,env){
  if(request.headers.get('Origin')!==origin)return reply({error:'來源不正確'},403);
  if(!env.DB||!env.LING_ACCESS_CODE)return reply({error:'缺少 D1 或通行碼設定'},503);
  if(!await validAccess(request.headers.get('X-Ling-Access-Code'),env.LING_ACCESS_CODE))return reply({error:'通行碼不正確'},401);
  if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({error:'需要 JSON 格式'},415);
  // Cap the streamed request before decoding: no unbounded request.text() allocation.
  if(Number(request.headers.get('Content-Length')||0)>4200)return reply({error:'請求太長'},413);
  const reader=request.body?.getReader();
  if(!reader)return reply({error:'JSON 無效'},400);
  let total=0;const chunks=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>4200){await reader.cancel();return reply({error:'請求太長'},413);}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const raw=dec.decode(cat(...chunks));
  let input;try{input=JSON.parse(raw);}catch{return reply({error:'JSON 無效'},400);}
  if(!input||typeof input.action!=='string'||!input.action.startsWith('bg_'))return reply({error:'未知操作'},400);
  try{
    await init(env.DB);
    const db=env.DB, action=input.action;
    if(action==='bg_status'){
      const n=(await db.prepare('SELECT count(*) AS n FROM ling_v4_push').first())?.n||0;
      return reply({ok:true,pushSubscriptions:Number(n),songEnabled:await get(db,'spotify_enabled')==='yes',
        songPush:await get(db,'push_song')==='yes',dailyPush:await get(db,'push_daily')==='yes',pollMinutes:10});
    }
    if(action==='bg_vapid')return reply({ok:true,publicKey:(await getVapidBundle(db,env)).publicKey});
    if(action==='bg_subscribe'){
      const {endpoint,keys}=input.subscription||{};
      if(typeof endpoint!=='string'||!keys||typeof keys.p256dh!=='string'||typeof keys.auth!=='string'||keys.p256dh.length>250||keys.auth.length>100)throw Error('推播訂閱格式錯誤');
      securePushUrl(endpoint);
      if(!/^[A-Za-z0-9_-]+$/.test(keys.p256dh)||!/^[A-Za-z0-9_-]+$/.test(keys.auth))throw Error('Bad push keys');
      const publicKey=un64(keys.p256dh),authSecret=un64(keys.auth);
      if(publicKey.length!==65||publicKey[0]!==4||authSecret.length!==16)throw Error('Bad push keys');
      await crypto.subtle.importKey('raw',publicKey,{name:'ECDH',namedCurve:'P-256'},false,[]);
      await db.prepare('INSERT OR REPLACE INTO ling_v4_push(endpoint,p256dh,auth) VALUES(?,?,?)').bind(endpoint,keys.p256dh,keys.auth).run();
      return reply({ok:true});
    }
    if(action==='bg_unsubscribe'){
      if(typeof input.endpoint!=='string')throw Error('缺少訂閱端點');
      await db.prepare('DELETE FROM ling_v4_push WHERE endpoint=?').bind(input.endpoint).run();
      return reply({ok:true});
    }
    if(action==='bg_config'){
      if(typeof input.daily!=='boolean'||typeof input.songPush!=='boolean')throw Error('選項格式錯誤');
      await Promise.all([set(db,'push_daily',input.daily?'yes':'no'),set(db,'push_song',input.songPush?'yes':'no')]);
      return reply({ok:true});
    }
    if(action==='bg_enable_spotify'){
      const {clientId,refreshToken}=input;
      if(typeof clientId!=='string'||!/^[a-zA-Z0-9]{10,80}$/.test(clientId)||typeof refreshToken!=='string'||refreshToken.length<20||refreshToken.length>1000)throw Error('Spotify 授權無效');
      await db.batch([
        db.prepare('INSERT INTO ling_v4_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('spotify_token',await seal(env,refreshToken)),
        db.prepare('INSERT INTO ling_v4_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('spotify_client',clientId),
        db.prepare('INSERT INTO ling_v4_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('spotify_enabled','yes'),
        db.prepare("DELETE FROM ling_v4_settings WHERE key IN ('spotify_last','spotify_last_push','spotify_backoff_until')")
      ]);
      return reply({ok:true});
    }
    if(action==='bg_disable_spotify'){
      await db.prepare("DELETE FROM ling_v4_settings WHERE key IN ('spotify_token','spotify_client','spotify_enabled','spotify_last','spotify_last_push','spotify_backoff_until')").run();
      return reply({ok:true});
    }
    if(action==='bg_test_push'){
      const count=(await db.prepare('SELECT count(*) AS n FROM ling_v4_push').first())?.n||0;
      if(!count)throw Error('尚未訂閱 iPhone 推播');
      const result=await sendAll(db,env,{title:'玲的通知測試',body:'老大，我從雲端送出通知了。',tag:'ling-test'});
      if(!result.accepted)throw Error('推播服務未接受通知');
      return reply({ok:true,accepted:result.accepted});
    }
    return reply({error:'未知背景操作'},400);
  }catch(e){console.warn('Background action error:',String(e).slice(0,90));return reply({error:'背景功能暫時不可用，請檢查設定或 Worker Logs'},503);}
}
export async function runLingBackground(cron,env){
  if(!env.DB||!env.LING_ACCESS_CODE)return;
  await init(env.DB);
  if(cron==='*/10 * * * *')await songCheck(env.DB,env);
  if(cron==='0 12 * * *')await dailyCheck(env.DB,env);
}

