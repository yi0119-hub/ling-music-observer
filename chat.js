/* 玲的共用核心 v3：Spotify 獨立；只送出使用者親自輸入的聊天與記憶文字。 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const endpoint = $('chatEndpoint');
  const passcode = $('chatPasscode');
  const remember = $('chatRemember');
  const SAVED_PASSCODE = 'ling-chat-passcode-v4';
  const SAVED_OPTIN = 'ling-chat-remember-v4';
  const chatLog = $('chatLog');
  const statusNode = $('chatStatus');
  const sendButton = $('chatSend');
  const input = $('chatInput');
  const memoryList = $('memoryList');
  const memoryInput = $('memoryInput');
  let connected = false;
  let pending = false;
  let messages = [];
  let memories = [];
  const status = text => { statusNode.textContent = text; };
  try { endpoint.value = localStorage.getItem('ling-chat-endpoint-v3') || localStorage.getItem('ling-chat-endpoint-v2') || ''; } catch {}
  // Opt-in persistence; passcode never appears in URL or source code.
  try {
    if (localStorage.getItem(SAVED_OPTIN) === 'yes') {
      const saved = localStorage.getItem(SAVED_PASSCODE) || '';
      if (saved.length >= 32) { passcode.value = saved; remember.checked = true; }
    }
  } catch { /* private browsing or storage disabled */ }
  function forgetSavedPasscode() {
    try { localStorage.removeItem(SAVED_PASSCODE); localStorage.removeItem(SAVED_OPTIN); } catch {}
  }
  function persistOnlyAfterVerified() {
    if (!remember.checked) { forgetSavedPasscode(); return; }
    try {
      localStorage.setItem(SAVED_PASSCODE,passcode.value);
      localStorage.setItem(SAVED_OPTIN,'yes');
    } catch { status('已連接，但瀏覽器無法保存登入。下次需要重新輸入。'); }
  }
  remember.addEventListener('change',()=>{
    if (!remember.checked) forgetSavedPasscode();
  });
  endpoint.addEventListener('change', () => {
    try { localStorage.setItem('ling-chat-endpoint-v3',endpoint.value.trim()); } catch {}
  });
  function endpointURL() {
    try {
      const u = new URL(endpoint.value.trim());
      if (u.protocol !== 'https:' || !/^[a-z0-9.-]+\.workers\.dev$/i.test(u.hostname) ||
          u.username || u.password || u.search || u.hash || u.pathname !== '/') return null;
      return u.href;
    } catch { return null; }
  }
  async function call(action, params={}, timeoutMS=55000) {
    const url=endpointURL();
    if (!url) throw new Error('請填入 https://xxx.workers.dev/ 格式的 Worker 網址。');
    if (passcode.value.length<32) throw new Error('請輸入 Cloudflare Secret 設定的 32 字元以上通行碼。');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMS);
    try {
      const response=await fetch(url,{
        method:'POST',
        headers:{'Content-Type':'application/json','X-Ling-Access-Code':passcode.value},
        cache:'no-store', signal:controller.signal,
        body:JSON.stringify({action,...params})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||`HTTP ${response.status}`);
      return result;
    } catch(e) {
      if(e.name==='AbortError') throw new Error('連線逾時，請檢查後端是否部署完成。');
      throw e;
    } finally { clearTimeout(timeout); }
  }
  function bubble(who,text) {
    const line=document.createElement('div');
    line.className='chat-line '+(who==='user'?'chat-line-user':'chat-line-ling');
    const label=document.createElement('span');
    label.className='chat-who';
    label.textContent=who==='user'?'你':'玲';
    const body=document.createElement('p');
    body.textContent=text; // XSS-safe: do not interpret chat content as markup.
    line.append(label,body);
    chatLog.appendChild(line);
  }
  function renderMessages() {
    chatLog.replaceChildren();
    if(messages.length===0) bubble('assistant','嘿，我在。想聊什麼？這次我們的聊天紀錄會保存在共用資料庫喔。');
    else for(const m of messages) bubble(m.role,m.content);
    chatLog.scrollTop=chatLog.scrollHeight;
  }
  function renderMemories() {
    memoryList.replaceChildren();
    if(memories.length===0) {
      const empty=document.createElement('p');
      empty.className='hint';
      empty.textContent='還沒有釘選記憶。輸入你希望玲長期記住的事，再按「記住」。';
      memoryList.appendChild(empty);
      return;
    }
    for(const m of memories){
      const line=document.createElement('div');
      line.className='memory-line';
      const text=document.createElement('span');
      text.textContent=m.content;
      const del=document.createElement('button');
      del.type='button'; del.className='memory-delete'; del.textContent='刪除';
      del.disabled=pending;
      del.addEventListener('click',async()=>{
        if(!confirm('確定刪除這一則記憶嗎？')) return;
        await execute(async()=>{
          const data=await call('forget',{id:m.id});
          memories=data.memories;
          renderMemories();
          status('已從共用記憶庫刪除這則記憶。');
        });
      });
      line.append(text,del);
      memoryList.appendChild(line);
    }
  }
  function controls(){
    $('chatConnect').disabled=pending;
    $('chatSync').disabled=pending||!connected;
    $('chatForgetSession').disabled=pending||!connected;
    $('chatClear').disabled=pending||!connected;
    $('chatExport').disabled=pending||!connected;
    sendButton.disabled=pending||!connected;
    input.disabled=pending||!connected;
    $('memorySave').disabled=pending||!connected;
    memoryInput.disabled=pending||!connected;
    $('chatConnectedLabel').textContent=connected?'已連接共用核心':'未連接共用核心';
  }
  async function execute(fn){
    if(pending) return;
    pending=true; controls();
    try { await fn(); }
    catch(e) { status('發生問題：'+e.message); }
    finally { pending=false; controls(); renderMemories(); }
  }
  async function sync(){
    const r=await call('history',{},15000);
    messages=r.messages||[];
    memories=r.memories||[];
    renderMessages(); renderMemories();
    connected=true;
    status(`已同步：${messages.length} 則近期對話，${memories.length} 則長期記憶。`);
  }
  $('chatConnect').addEventListener('click',()=>execute(async()=>{
    status('正在連接玲的共用核心……');
    await sync();
    try { localStorage.setItem('ling-chat-endpoint-v3',endpoint.value.trim()); } catch {}
    persistOnlyAfterVerified();
  }));
  $('chatSync').addEventListener('click',()=>execute(sync));
  $('chatForgetSession').addEventListener('click',()=>{
    if(pending) return;
    forgetSavedPasscode(); remember.checked=false;
    passcode.value=''; connected=false; messages=[]; memories=[];
    renderMessages(); renderMemories(); controls();
    status('已登出這台裝置的聊天室，雲端對話與記憶仍保留。');
  });
  $('chatForm').addEventListener('submit',e=>{
    e.preventDefault();
    if(!connected) return status('請先連接共用核心。');
    const message=input.value.trim();
    if(!message||message.length>800) return status('請輸入 1～800 字的訊息。');
    execute(async()=>{
      status('玲正在想怎麼回覆……');
      // Optimistic display; only append to server history after AI confirms success.
      bubble('user',message); chatLog.scrollTop=chatLog.scrollHeight;
      try {
        const result=await call('chat',{message});
        input.value='';
        messages.push({role:'user',content:message},{role:'assistant',content:result.reply});
        if(messages.length>60) messages=messages.slice(-60);
        bubble('assistant',result.reply);
        chatLog.scrollTop=chatLog.scrollHeight;
        status('已回覆，對話也已存入共用資料庫。');
      } catch(err){
        renderMessages();
        throw err;
      }
    });
  });
  $('memorySave').addEventListener('click',()=>{
    const text=memoryInput.value.trim();
    if(!text||text.length>400) return status('長期記憶必須為 1～400 字。');
    execute(async()=>{
      const result=await call('remember',{text});
      memories=result.memories; memoryInput.value='';
      renderMemories(); status('這件事已存入共用長期記憶。');
    });
  });
  $('chatClear').addEventListener('click',()=>{
    if(!confirm('確定永久清除共用資料庫的所有對話嗎？這會影響未來連接的其他裝置。釘選記憶不會刪除。')) return;
    execute(async()=>{
      await call('clear',{confirm:'ERASE_CONVERSATION'});
      messages=[]; renderMessages();
      status('雲端對話已清空；釘選的記憶仍然保留。');
    });
  });
  $('chatExport').addEventListener('click',()=>execute(async()=>{
    status('正在準備完整的雲端對話備份……');
    let all=[];
    let after=0;
    let pinned=[];
    for(let page=0;page<100;page++) {
      const data=await call('export',{after},20000);
      if(page===0) pinned=data.memories||[];
      all.push(...(data.messages||[]));
      if(!data.next) break;
      after=data.next;
      if(page===99) throw new Error('備份太大，請到 Cloudflare D1 控制台匯出。');
    }
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),
      messages:all,memories:pinned},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='ling-memory-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('已下載備份（'+all.length+' 則對話及 '+pinned.length+' 則記憶）。');
  }));
  renderMessages(); renderMemories(); controls();
  if (remember.checked && passcode.value.length >= 32 && endpointURL()) {
    status('正在自動恢復玲的共用核心連線……');
    execute(async()=>{
      await sync();
    });
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible' && connected && !pending) execute(sync);
  });
})();
