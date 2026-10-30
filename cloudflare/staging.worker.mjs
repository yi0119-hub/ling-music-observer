// Isolated staging entry. Never bind a production database or add production routes.
import {handleLingBackground} from './ling-background-addon.js';
const page=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="manifest" href="/manifest.webmanifest"><title>玲 v5.2 通知測試室</title><style>body{font:17px system-ui;background:#17132b;color:#f6eeff;max-width:620px;margin:40px auto;padding:20px}input,button{font:inherit;padding:12px;margin:8px 0;border-radius:10px}input{box-sizing:border-box;width:100%}button{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#27203f;padding:16px;border-radius:12px}</style><h1>玲 v5.2 通知測試室</h1><p>這是獨立測試環境，沒有正式聊天或記憶。iPhone 請先加入主畫面，再從圖示開啟。</p><label>測試通行碼<input id="key" type="password" autocomplete="off"></label><button id="status">檢查設定</button> <button id="subscribe">登記此裝置通知</button> <button id="test">發送測試通知</button><pre id="message" role="status">請輸入獨立測試通行碼。通行碼只留在本頁記憶體，不會保存到瀏覽器。</pre><script>
const el=id=>document.getElementById(id),show=text=>el('message').textContent=text;
async function call(action,extra={}){const key=el('key').value;if(key.length<32)throw Error('請輸入至少 32 字元的測試通行碼');const r=await fetch('/ling-bg',{method:'POST',headers:{'Content-Type':'application/json','X-Ling-Access-Code':key},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'操作失敗');return data;}
let busy=false;function action(id,work){el(id).onclick=()=>{if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);Promise.resolve().then(()=>work()).catch(e=>show(e.message)).finally(()=>{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);});};}
action('status',async()=>{const s=await call('bg_status');show('測試 D1 連線正常。已登記 '+s.pushSubscriptions+' 個裝置。背景 Spotify：'+(s.songEnabled?'開啟':'關閉'));});
// Request permission directly in the original click, before awaiting any network.
el('subscribe').onclick=async()=>{if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('請使用支援通知的瀏覽器；iPhone 請從主畫面開啟');if(await Notification.requestPermission()!=='granted')throw Error('尚未允許通知');await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;const {publicKey}=await call('bg_vapid');const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-publicKey.length%4)%4)),c=>c.charCodeAt(0));let sub=await reg.pushManager.getSubscription();if(sub){const old=new Uint8Array(sub.options.applicationServerKey||[]);if(old.length!==key.length||!old.every((v,i)=>v===key[i])){await sub.unsubscribe();sub=null;}}sub=sub||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});await call('bg_subscribe',{subscription:sub.toJSON()});show('測試裝置已登記，請按「發送測試通知」並確認手機收到。');}catch(e){show(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}};
action('test',async()=>{await call('bg_test_push');show('推播服務已接受通知，請確認手機實際收到。');});
</script></html>`;
const serviceWorker=`self.addEventListener('push',event=>{let data={};try{data=event.data.json();}catch{}event.waitUntil(self.registration.showNotification(String(data.title||'玲的測試通知').slice(0,100),{body:String(data.body||'').slice(0,350),tag:'ling-staging-test',data:{url:self.registration.scope}}));});self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow(self.registration.scope));});`;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/')return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
    if(url.pathname==='/sw.js')return new Response(serviceWorker,{headers:{...headers,'Content-Type':'application/javascript','Service-Worker-Allowed':'/'}});
    if(url.pathname==='/manifest.webmanifest')return Response.json({name:'玲 v5.2 通知測試室',short_name:'玲測試室',id:'/',start_url:'/',scope:'/',display:'standalone',background_color:'#17132b',theme_color:'#17132b'},{headers});
    if(url.pathname==='/health'){
      let database=false;
      try{database=(await env.DB?.prepare('SELECT 1 AS ok').first())?.ok===1;}catch{}
      const accessConfigured=typeof env.LING_ACCESS_CODE==='string'&&env.LING_ACCESS_CODE.length>=32;
      return Response.json({environment:'staging',database,accessConfigured,spotifyScheduled:false},{status:database&&accessConfigured?200:503,headers});
    }
    if(url.pathname==='/ling-bg'){
      if(request.method!=='POST')return new Response(null,{status:405,headers});
      if(request.headers.get('Origin')!==url.origin)return new Response(null,{status:403,headers});
      // Same-origin staging UI only. Adapt the add-on's fixed production CORS
      // origin internally; never send requests to the production Worker.
      const forwarded=new Request(request);forwarded.headers.set('Origin','https://yi0119-hub.github.io');
      return handleLingBackground(forwarded,env);
    }
    return new Response('Not found',{status:404,headers});
  }
};
