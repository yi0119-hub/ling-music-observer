/* 玲 v4 Web Push preferences. No Spotify playback metadata sent to AI. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const msg=$('bgMessage');
  const setMessage=value=>{msg.textContent=value;};
  const btn=($id,callback)=>$($id).addEventListener('click',()=>{
    Promise.resolve(callback()).catch(error=>setMessage('設定未完成：'+error.message));
  });
  function endpoint(){
    const raw=$('chatEndpoint').value.trim();
    const u=new URL(raw);
    if(u.protocol!=='https:' || !/^[a-z0-9.-]+\.workers\.dev$/i.test(u.hostname) ||
      u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('請先填入正確的共用核心 Worker 網址。');
    return u.href;
  }
  async function call(action,options={}){
    const secret=$('chatPasscode').value;
    if(secret.length<32)throw Error('請先輸入玲的共用通行碼，或啟用「記住這台裝置」。');
    const response=await fetch(endpoint()+'ling-bg',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Ling-Access-Code':secret},
      body:JSON.stringify({action,...options})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
    return data;
  }
  function encodeKey(str){return Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4)),c=>c.charCodeAt(0));}
  async function refreshStatus(){
    const s=await call('bg_status');
    $('bgDaily').checked=s.dailyPush;
    $('bgSongPush').checked=s.songPush;
    $('bgSpotifyStatus').textContent=s.songEnabled?'已啟用雲端 Spotify 查詢':'尚未啟用雲端歌曲查詢';
    $('bgPushStatus').textContent=`雲端已登記 ${s.pushSubscriptions} 個裝置；每 ${s.pollMinutes} 分鐘檢查；23:00–09:00 不提醒歌曲變化。`;
    setMessage('已讀取目前設定。');
  }
  async function registerServiceWorker(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))
      throw Error('此瀏覽環境不支援 Web Push。iPhone 請先加入主畫面，從圖示開啟。');
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    return navigator.serviceWorker.ready || registration;
  }
  btn('bgSubscribe',async()=>{
    // Initiate permission immediately inside a click, before awaiting network calls.
    if(!('Notification' in window))throw Error('此瀏覽器不支援通知。');
    const permissionPromise=Notification.requestPermission();
    setMessage('正在取得通知權限……');
    const permission=await permissionPromise;
    if(permission!=='granted')throw Error('通知權限未允許。iPhone 請從主畫面 App 開啟。');
    const registration=await registerServiceWorker();
    const {publicKey}=await call('bg_vapid');
    const current=await registration.pushManager.getSubscription();
    if(current && !sameKey(current.options.applicationServerKey,encodeKey(publicKey))){await current.unsubscribe();}
    const subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:encodeKey(publicKey)});
    await call('bg_subscribe',{subscription:subscription.toJSON()});
    setMessage('這台 iPhone 的推播已啟用。你可以按「測試通知」確認。');
    await refreshStatus();
  });
  function sameKey(a,b){if(!a)return false;const x=new Uint8Array(a);return x.length===b.length&&x.every((v,i)=>v===b[i]);}
  btn('bgTest',async()=>{await call('bg_test_push');setMessage('已送出測試通知，請查看 iPhone 通知。');});
  btn('bgSavePref',async()=>{
    await call('bg_config',{daily:$('bgDaily').checked,songPush:$('bgSongPush').checked});
    setMessage('推播偏好已保存：每日招呼約 20:00，歌曲變化最多每 15 分鐘提醒一次。');
  });
  btn('bgEnableSpotify',async()=>{
    if(!$('bgConsent').checked)throw Error('請先閱讀並勾選背景授權說明。');
    const refreshToken=sessionStorage.getItem('lingmusic-v1-refresh')||localStorage.getItem('lingmusic-v1-refresh');
    const clientId=$('clientId').value.trim()||localStorage.getItem('lingmusic-v1-client-id');
    if(!refreshToken||!clientId)throw Error('請先在下方 Spotify 區塊完成登入（或重新授權）再啟用。');
    await call('bg_enable_spotify',{clientId,refreshToken});
    setMessage('已啟用雲端 Spotify 查詢。授權憑證會加密保存在 D1；不儲存播放歷史。');
    await refreshStatus();
  });
  btn('bgDisableSpotify',async()=>{
    await call('bg_disable_spotify');
    $('bgConsent').checked=false;
    setMessage('已關閉雲端 Spotify 查詢並刪除伺服器保存的 Spotify 更新授權。');
    await refreshStatus();
  });
  btn('bgUnsubscribe',async()=>{
    const registration=await registerServiceWorker();
    const subscription=await registration.pushManager.getSubscription();
    if(subscription){await call('bg_unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();}
    setMessage('已取消此裝置的推播訂閱。');
    await refreshStatus();
  });
  btn('bgStatus',refreshStatus);
})();
