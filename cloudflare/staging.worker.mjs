// Isolated staging entry. Never bind a production database or add production routes.
import {handleLingBackground,runLingBackground} from './ling-background-addon.js';
import {STAGING_UI_SOURCE} from './.generated/staging-ui-source.mjs';
const page=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="manifest" href="/manifest.webmanifest"><title>玲 v5.2 通知測試室</title><style>body{font:17px system-ui;background:#17132b;color:#f6eeff;max-width:620px;margin:40px auto;padding:20px}input,button{font:inherit;padding:12px;margin:8px 0;border-radius:10px}input:not([type=checkbox]){box-sizing:border-box;width:100%}button{cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#27203f;padding:16px;border-radius:12px}section{border-top:1px solid #534765;margin-top:24px;padding-top:12px}small,code{overflow-wrap:anywhere}label{display:block;margin:12px 0}</style><h1>玲 v5.2 通知測試室</h1><p>獨立測試環境，正式聊天與記憶不受影響。iPhone 請從主畫面圖示開啟。</p><label>測試通行碼<input id="key" type="password" autocomplete="off"></label><button id="status">檢查設定</button> <button id="subscribe">登記此裝置通知</button> <button id="test">發送測試通知</button><pre id="message" role="status">請輸入獨立測試通行碼。通行碼不會保存到瀏覽器。</pre><section><h2>Spotify 背景查詢</h2><p id="spotifyState">背景 Spotify：請按「檢查設定」讀取</p><p id="spotifyCheck">首次查詢建立基準，之後換歌才提醒。</p><label>Spotify 公開 Client ID<input id="spotifyClient" autocomplete="off" placeholder="32 字元的 Client ID，不是 Client Secret"></label><details><summary>首次連接設定</summary><p>在原 Spotify App 的設定新增以下 Redirect URI，保留原本的網址：</p><code id="spotifyCallback"></code></details><label><input id="spotifyConsent" type="checkbox"> 我同意每 10 分鐘由 Cloudflare 查詢播放狀態，將更新授權加密存入獨立測試 D1。只保留當前歌曲指紋，不建立播放歷史、不交給 AI；可隨時關閉並刪除雲端授權。</label><button id="spotifyConnect">連接 Spotify</button> <button id="spotifyEnable">啟用背景查詢</button> <button id="spotifyDisable">關閉並刪除授權</button><p><small>完成 Spotify 授權回來後，請再輸入測試通行碼並啟用。歌曲提醒最多每 15 分鐘一次；23:00–09:00 安靜時段不提醒。</small></p></section><script src="/staging-ui.js" defer></script></html>`;
const serviceWorker=`self.addEventListener('push',event=>{let data={};try{data=event.data.json();}catch{}event.waitUntil(self.registration.showNotification(String(data.title||'玲的測試通知').slice(0,100),{body:String(data.body||'').slice(0,350),tag:'ling-staging-test',data:{url:self.registration.scope}}));});self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow(self.registration.scope));});`;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/')return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'unsafe-inline'; connect-src 'self' https://accounts.spotify.com; frame-ancestors 'none'; base-uri 'none'"}});
    if(url.pathname==='/staging-ui.js')return new Response(STAGING_UI_SOURCE,{headers:{...headers,'Content-Type':'application/javascript; charset=utf-8'}});
    if(url.pathname==='/sw.js')return new Response(serviceWorker,{headers:{...headers,'Content-Type':'application/javascript','Service-Worker-Allowed':'/'}});
    if(url.pathname==='/manifest.webmanifest')return Response.json({name:'玲 v5.2 通知測試室',short_name:'玲測試室',id:'/',start_url:'/',scope:'/',display:'standalone',background_color:'#17132b',theme_color:'#17132b'},{headers});
    if(url.pathname==='/health'){
      let database=false;
      try{database=(await env.DB?.prepare('SELECT 1 AS ok').first())?.ok===1;}catch{}
      const accessConfigured=typeof env.LING_ACCESS_CODE==='string'&&env.LING_ACCESS_CODE.length>=32;
      return Response.json({environment:'staging',database,accessConfigured,spotifyScheduleSupported:true},{status:database&&accessConfigured?200:503,headers});
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
  },
  async scheduled(controller,env,ctx){
    if(controller.cron==='*/10 * * * *')ctx.waitUntil(runLingBackground(controller.cron,env));
  }
};
