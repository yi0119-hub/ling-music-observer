/* Browser-only staging controls. No tokens are printed or persisted. */
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const show=text=>{el('message').textContent=text;};
  const pendingKey='ling-staging-pkce';
  const callback=location.origin+'/';
  // Public OAuth client identifier; this is not a client secret.
  const defaultClientId='e0b736a08bea4bcf9c237177e3820881';
  const buttons=['status','subscribe','test','spotifyConnect','spotifyEnable','spotifyDisable'];
  let busy=false,grant=null;
  function lock(value){busy=value;buttons.forEach(id=>{el(id).disabled=value;});}
  function validateKey(){if(el('key').value.length<32)throw Error('請輸入至少 32 字元的測試通行碼');}
  async function call(action,extra={}){
    validateKey();
    const response=await fetch('/ling-bg',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Ling-Access-Code':el('key').value},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'操作失敗');
    return result;
  }
  const base64=value=>{let s='';for(const byte of new Uint8Array(value))s+=String.fromCharCode(byte);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
  const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
  const random=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
  function action(id,work){el(id).onclick=()=>{
    if(busy)return;lock(true);
    let result;try{result=work();}catch(error){result=Promise.reject(error);}
    Promise.resolve(result).catch(error=>show(error.message)).finally(()=>lock(false));
  };}
  async function status(){
    const data=await call('bg_status');
    el('spotifyState').textContent=data.songEnabled?'背景 Spotify：已啟用':'背景 Spotify：未啟用';
    const checked=data.lastSpotifyCheck?new Date(data.lastSpotifyCheck).toLocaleString('zh-TW'):'尚未查詢';
    const labels={checking:'查詢中',playing:'已取得播放狀態',idle:'目前未播放歌曲',rate_limited:'Spotify 限流，等待後重試',reauthorize:'需要重新授權'};
    el('spotifyCheck').textContent='上次查詢：'+checked+'；結果：'+(labels[data.spotifyResult]||data.spotifyResult||'等待授權或排程');
    show('測試 D1 連線正常，已登記 '+data.pushSubscriptions+' 個裝置。'+(data.songEnabled?'每 10 分鐘查詢，歌曲變化提醒遵守安靜時段與 15 分鐘間隔。':'可在下方連接 Spotify 並啟用背景查詢。'));
    return data;
  }
  action('status',status);
  action('test',async()=>{await call('bg_test_push');show('推播服務已接受通知，請確認手機實際收到。');});
  action('subscribe',async()=>{
    if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('iPhone 請先加入主畫面，再從圖示開啟。');
    if(await Notification.requestPermission()!=='granted')throw Error('尚未允許通知。');
    await navigator.serviceWorker.register('/sw.js');
    const registration=await navigator.serviceWorker.ready;
    const {publicKey}=await call('bg_vapid');const key=decode(publicKey);
    let subscription=await registration.pushManager.getSubscription();
    if(subscription){const old=new Uint8Array(subscription.options.applicationServerKey||[]);if(old.length!==key.length||!old.every((v,i)=>v===key[i])){await subscription.unsubscribe();subscription=null;}}
    subscription=subscription||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await call('bg_subscribe',{subscription:subscription.toJSON()});
    show('此裝置已登記，請按「發送測試通知」確認。');
  });
  action('spotifyConnect',async()=>{
    validateKey();
    if(!el('spotifyConsent').checked)throw Error('請先勾選背景查詢與雲端授權說明。');
    const clientId=el('spotifyClient').value.trim();
    if(!/^[a-zA-Z0-9]{32}$/.test(clientId))throw Error('請填入 Spotify App 的公開 Client ID（32 字元），不要填 Client Secret。');
    const verifier=random()+random(),state=random();
    const challenge=base64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    // Only a short-lived PKCE verifier/state is persisted for iPhone redirect
    // restoration. The access code and Spotify tokens are never stored here.
    const pending={verifier,state,clientId,created:Date.now(),callback};
    localStorage.setItem(pendingKey,JSON.stringify(pending));
    grant=null;
    const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:callback,scope:'user-read-currently-playing',state,code_challenge_method:'S256',code_challenge:challenge});
    location.assign('https://accounts.spotify.com/authorize?'+params);
  });
  action('spotifyEnable',async()=>{
    if(!el('spotifyConsent').checked)throw Error('請先勾選背景查詢與雲端授權說明。');
    if(!grant||Date.now()-grant.created>10*60*1000){grant=null;throw Error('請先按「連接 Spotify」完成授權。');}
    const settings=await call('bg_status');
    if(!settings.pushSubscriptions)throw Error('請先登記裝置通知，再啟用歌曲提醒。');
    await call('bg_enable_spotify',{clientId:grant.clientId,refreshToken:grant.refreshToken});
    grant=null;
    await call('bg_config',{daily:settings.dailyPush,songPush:true});
    await status();
    show('背景 Spotify 已啟用，每 10 分鐘查詢一次。首次查詢建立基準，之後歌曲變化才會提醒；23:00–09:00 不提醒。');
  });
  action('spotifyDisable',async()=>{
    await call('bg_disable_spotify');grant=null;
    await status();show('已關閉背景查詢並刪除雲端 Spotify 授權。');
  });
  async function finishAuthorization(){
    const params=new URLSearchParams(location.search);
    const code=params.get('code'),error=params.get('error');
    // Always remove OAuth credentials from the address before any network work.
    if(!code&&!error){
      try{const pending=JSON.parse(localStorage.getItem(pendingKey)||'null');if(pending&&Date.now()-pending.created>10*60*1000)localStorage.removeItem(pendingKey);}catch{localStorage.removeItem(pendingKey);}
      return;
    }
    history.replaceState(null,'',callback);
    lock(true);
    try{
      let pending;try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{}
      localStorage.removeItem(pendingKey);
      if(error)throw Error('Spotify 授權未完成，請重新連接。');
      const age=Date.now()-pending?.created;
      if(!pending||params.get('state')!==pending.state||!Number.isFinite(age)||age<0||age>10*60*1000||pending.callback!==callback)throw Error('授權驗證失敗或已過期，請重新按「連接 Spotify」。');
      const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callback,client_id:pending.clientId,code_verifier:pending.verifier}),signal:AbortSignal.timeout(20000)});
      const result=await response.json();
      if(!response.ok||typeof result.refresh_token!=='string')throw Error('Spotify 沒有完成背景授權，請重新連接。');
      grant={clientId:pending.clientId,refreshToken:result.refresh_token,created:Date.now()};
      el('spotifyClient').value=pending.clientId;
      show('Spotify 授權成功。請重新輸入測試通行碼、勾選同意，再按「啟用背景查詢」。');
    }catch(error){grant=null;show(error.message);}
    finally{lock(false);}
  }
  el('spotifyCallback').textContent=callback;
  if(!el('spotifyClient').value)el('spotifyClient').value=defaultClientId;
  void finishAuthorization();
})();
