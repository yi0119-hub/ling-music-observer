/* 玲的音樂觀察室 v4 — Spotify PKCE; 30 秒前景更新＋近期播放補查。 */
'use strict';
const $ = (id) => document.getElementById(id);
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const CURRENTLY_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode';
const RECENTLY_PLAYED_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=20';
const DEFAULT_MS = 30000;
const RECENT_MS = 120000; // 近期播放不需要跟目前播放一樣頻繁查詢
const STORAGE_PREFIX = 'lingmusic-v1-';
const K = (name) => STORAGE_PREFIX + name;
const redirectUri = `${location.origin}${location.pathname}`;
let accessToken = null;
let expiresAt = 0;
let timer = null;
let monitoring = true;
let busy = false;
let lastIdentity = null;
let quotaBlocked = false;
let currentRetryAt = 0;
let lastRecentSync = 0;
let recentBusy = false;
let recentScopeBlocked = false;
let recentRetryAt = 0;
const getSaved = (k) => { try { return localStorage.getItem(K(k)); } catch { return null; } };
const setSaved = (k, v) => { try { localStorage.setItem(K(k), v); } catch { /* storage disabled */ } };
const removeSaved = (k) => { try { localStorage.removeItem(K(k)); } catch { /* storage disabled */ } };
const getTemp = (k) => { try { return sessionStorage.getItem(K(k)); } catch { return null; } };
const setTemp = (k, v) => { try { sessionStorage.setItem(K(k), v); } catch { /* storage disabled */ } };
const removeTemp = (k) => { try { sessionStorage.removeItem(K(k)); } catch { /* storage disabled */ } };
const getRefresh = () => getTemp('refresh') || getSaved('refresh');
const timeLabel = () => new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
const status = (message) => { $('statusText').textContent = message; };
const message = (text) => { $('lingMessage').textContent = text; };
function connected(value) {
  $('liveBadge').textContent = value ? '已連接' : '未連線';
  $('liveBadge').classList.toggle('connected', value);
  $('refreshButton').disabled = !value;
  $('toggleButton').disabled = !value;
  $('recentRefreshButton').disabled = !value;
  $('connectButton').textContent = value ? '重新授權 Spotify' : '連接 Spotify';
}
function playView({title, artist, album='', image='', url='', playing=false, identity=''}) {
  $('songTitle').textContent = title;
  $('artistName').textContent = artist;
  $('albumName').textContent = album;
  $('playState').textContent = playing ? '● 播放中' : '暫停播放';
  const okImage = /^https:\/\/([a-z0-9-]+\.)*scdn\.co\//i.test(image);
  $('cover').hidden = !okImage;
  $('emptyCover').hidden = okImage;
  if (okImage) $('cover').src = image;
  else $('cover').removeAttribute('src');
  const okUrl = /^https:\/\/open\.spotify\.com\/(track|episode)\/[a-zA-Z0-9]+(?:\?.*)?$/.test(url);
  $('spotifyLink').hidden = !okUrl;
  if (okUrl) $('spotifyLink').href = url;
  else $('spotifyLink').removeAttribute('href');
  if (identity && identity !== lastIdentity && playing) message(`換歌啦，現在是「${title}」。這首先陪你聽聽。`);
  else if (!playing) message('音樂暫停了。要休息一下也不錯嘛。');
  else message('我看得到你正在播放的曲目，但目前還不能直接聽見聲音喔。');
  lastIdentity = identity;
}
function emptyView(why='目前沒有偵測到正在播放的內容。') {
  playView({title:'現在沒有播放歌曲',artist:why,playing:false});
  $('playState').textContent='無播放內容';
  message('我在這裡，等你開音樂再來看看吧。');
}

function recentStatus(text) { $('recentStatus').textContent = text; }
function renderRecentlyPlayed(items) {
  const list = $('recentList');
  list.replaceChildren();
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'recent-empty';
    li.textContent = 'Spotify 目前沒有提供近期播放紀錄。';
    list.appendChild(li);
    return;
  }
  for (const entry of items) {
    const track = entry?.track;
    if (!track || track.type !== 'track') continue;
    const li = document.createElement('li');
    li.className = 'recent-item';
    const details = document.createElement('div');
    details.className = 'recent-details';
    const name = document.createElement('strong');
    name.textContent = track.name || '未命名歌曲';
    const artist = document.createElement('span');
    artist.textContent = Array.isArray(track.artists)
      ? track.artists.map(a => a?.name).filter(Boolean).join('、') || '未知創作者'
      : '未知創作者';
    const time = document.createElement('time');
    const parsed = Date.parse(entry.played_at || '');
    if (Number.isFinite(parsed)) {
      time.dateTime = new Date(parsed).toISOString();
      time.textContent = new Date(parsed).toLocaleString('zh-TW', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    } else time.textContent = '時間未知';
    details.append(name, artist);
    const url = track.external_urls?.spotify || '';
    if (/^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+(?:\?.*)?$/.test(url)) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.appendChild(details);
      li.append(link,time);
    } else li.append(details,time);
    list.appendChild(li);
  }
  if (!list.children.length) renderRecentlyPlayed([]);
}
async function refreshRecentIfDue(token, force=false) {
  if (recentBusy || document.visibilityState !== 'visible' || !token || quotaBlocked) return;
  if (recentScopeBlocked) {
    recentStatus('最近播放需要新增授權。請按下方「重新授權 Spotify」並同意最近播放權限。');
    return;
  }
  const now = Date.now();
  if (now < recentRetryAt) return;
  if (!force && now-lastRecentSync < RECENT_MS) return;
  recentBusy = true;
  $('recentRefreshButton').disabled = true;
  try {
    const resp = await fetch(RECENTLY_PLAYED_URL, {headers:{Authorization:`Bearer ${token}`}, cache:'no-store'});
    if (resp.status===401) {
      accessToken = null; expiresAt = 0;
      recentStatus('Spotify 授權已失效，請重新授權或等待下次重新取得令牌。');
      return;
    }
    if (resp.status===403) {
      recentScopeBlocked = true;
      recentStatus('無法讀取近期播放（403）。請重新授權 Spotify，並同意「最近播放」權限；也請檢查開發者 App 權限。');
      return;
    }
    if (resp.status===429) {
      let reason = '';
      try { reason = (await resp.json()).error?.reason || ''; } catch { /* 非 JSON */ }
      if (reason==='QUOTA_EXCEEDED') {
        quotaBlocked=true;
        recentStatus('Spotify API 額度已用完，停止自動查詢，避免不斷重試。');
      } else {
        const retrySec = Math.max(60, Number(resp.headers.get('Retry-After') || 120));
        recentRetryAt = Date.now()+retrySec*1000;
        recentStatus(`Spotify 限制查詢頻率，約 ${Math.ceil(retrySec)} 秒後再試。`);
      }
      return;
    }
    if (!resp.ok) {recentStatus(`讀取最近播放失敗（HTTP ${resp.status}）。`); return;}
    const data = await resp.json();
    if (!Array.isArray(data.items)) throw new Error('Spotify 回傳的近期播放格式不正確');
    renderRecentlyPlayed(data.items);
    lastRecentSync=Date.now();
    recentStatus(`${timeLabel()} 已從 Spotify 取得最近 ${data.items.length} 筆播放紀錄。資料僅顯示於目前頁面。`);
  } catch (err) {
    recentStatus(`最近播放讀取失敗：${err.message}`);
  } finally {
    recentBusy=false;
    $('recentRefreshButton').disabled=!getRefresh();
  }
}

function setMonitoring(next) {
  monitoring = next;
  $('toggleButton').textContent = next ? '暫停自動更新' : '恢復自動更新';
  if (!next) { clearTimeout(timer); status('已暫停自動更新。'); }
  else if (document.visibilityState === 'visible') { quotaBlocked = false; void refreshNow(); }
}
function schedule(ms=DEFAULT_MS) {
  clearTimeout(timer);
  if (monitoring && !quotaBlocked && document.visibilityState === 'visible' && getRefresh()) {
    timer = setTimeout(() => { void refreshNow(); }, ms);
  }
}
function randomString(n=64) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const data = new Uint8Array(n); crypto.getRandomValues(data);
  return Array.from(data,(v) => alphabet[v % alphabet.length]).join('');
}
function toBase64Url(bytes) {
  let binary = ''; for(const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function startAuth() {
  const clientId = $('clientId').value.trim();
  if(!/^[0-9a-zA-Z]+$/.test(clientId)) { status('請先填入有效的 Spotify Client ID（不是 Client Secret）。'); return; }
  setSaved('client-id',clientId);
  const verifier = randomString(64);
  const state = randomString(32);
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const challenge = toBase64Url(digest);
  const pending = {verifier,state,clientId,created:Date.now(),remember:$('remember').checked};
  // Local storage is used for this short-lived one-time handoff because iOS standalone web apps
  // may restore a new browser context after leaving Spotify authorization.
  setSaved('pending-auth',JSON.stringify(pending));
  const params = new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,scope:'user-read-currently-playing user-read-recently-played',state,code_challenge_method:'S256',code_challenge:challenge,show_dialog:'false'});
  location.assign(`${AUTH_URL}?${params}`);
}
async function tokenRequest(data) {
  const response = await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
  let json = {}; try { json = await response.json(); } catch { /* not JSON */ }
  if(!response.ok) throw new Error(`Spotify 授權失敗 (${response.status}): ${json.error_description || json.error || '請重新登入'}`);
  if(!json.access_token) throw new Error('Spotify 沒有回傳授權令牌。');
  accessToken = json.access_token;
  expiresAt = Date.now() + (Number(json.expires_in || 3600) * 1000) - 60000;
  if(json.refresh_token) {
    if($('remember').checked) { setSaved('refresh',json.refresh_token); removeTemp('refresh'); }
    else { setTemp('refresh',json.refresh_token); removeSaved('refresh'); }
  }
  connected(true);
  return json;
}
async function handleCallback() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  if(!code && !error) return false;
  // Remove one-use OAuth credentials from the URL before any other work.
  history.replaceState(null,'',redirectUri);
  const raw = getSaved('pending-auth');
  removeSaved('pending-auth');
  if(error) { status(`Spotify 拒絕授權：${error}`); return true; }
  let pending;
  try { pending=JSON.parse(raw || '{}'); } catch { pending={}; }
  if (!pending.state || params.get('state') !== pending.state || Date.now()-pending.created>10*60*1000) {
    status('授權驗證失敗或已過期，請重新按「連接 Spotify」。'); return true;
  }
  $('clientId').value = pending.clientId;
  $('remember').checked = pending.remember;
  recentScopeBlocked = false;
  recentRetryAt = 0;
  lastRecentSync = 0;
  try {
    await tokenRequest({grant_type:'authorization_code',code,redirect_uri:redirectUri,client_id:pending.clientId,code_verifier:pending.verifier});
    status('Spotify 授權完成！');
    await refreshNow();
  } catch(err) { status(err.message); }
  return true;
}
async function validToken() {
  if(accessToken && Date.now() < expiresAt) return accessToken;
  const refresh = getRefresh();
  const clientId = $('clientId').value.trim();
  if(!refresh || !clientId) return null;
  try {
    await tokenRequest({grant_type:'refresh_token',refresh_token:refresh,client_id:clientId});
    return accessToken;
  } catch(err) {
    if (/invalid_grant|400/.test(err.message)) {
      removeSaved('refresh'); removeTemp('refresh'); accessToken=null;
      connected(false);
      status('授權已過期或撤銷，請重新連接 Spotify。');
    } else { status(err.message); }
    return null;
  }
}
async function refreshNow() {
  if(busy || quotaBlocked || document.visibilityState !== 'visible') return;
  if (Date.now() < currentRetryAt) {
    status(`Spotify 要求暫停查詢；請於約 ${Math.ceil((currentRetryAt-Date.now())/1000)} 秒後重試。`);
    return;
  }
  clearTimeout(timer);
  busy = true;
  $('refreshButton').disabled = true;
  let nextDelay=DEFAULT_MS;
  let canRefreshRecent=true;
  try {
    const token = await validToken();
    if(!token) { if(!getRefresh()) status('請先連接 Spotify。'); return; }
    const resp=await fetch(CURRENTLY_PLAYING_URL,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    if(resp.status===204) { emptyView(); status(`${timeLabel()} 已更新，Spotify 目前沒有活動的播放內容。`); return; }
    if(resp.status===401) { accessToken=null; expiresAt=0; status('存取授權過期，下次會重新取得。'); nextDelay=5000; return; }
    if(resp.status===403) { status('Spotify 拒絕存取 (403)：請檢查 Premium、開發者 App 使用者名單及權限。'); quotaBlocked=true; return; }
    if(resp.status===429) {
      canRefreshRecent=false;
      let reason=''; try { reason=(await resp.json()).error?.reason || ''; } catch { /* ignore */ }
      if(reason==='QUOTA_EXCEEDED') { quotaBlocked=true; status('Spotify 開發額度用完，已停止自動查詢。請稍後手動重試。'); }
      else { nextDelay=Math.max(60000,Number(resp.headers.get('Retry-After') || 120)*1000); currentRetryAt=Date.now()+nextDelay; status(`查詢頻率受限，將在約 ${Math.ceil(nextDelay/1000)} 秒後再試。`); }
      return;
    }
    if(!resp.ok) { status(`讀取播放資料失敗：HTTP ${resp.status}`); return; }
    const data=await resp.json();
    if(!data.item) { emptyView(); status(`${timeLabel()} 已更新，目前沒有可顯示的歌曲。`); return; }
    const item=data.item;
    const title=item.name || '未命名歌曲';
    const artist=(item.artists || item.show?.name && [{name:item.show.name}] || []).map((a)=>a.name).filter(Boolean).join('、') || '未知創作者';
    const album=item.album?.name || item.show?.name || '';
    const image=item.album?.images?.[0]?.url || item.images?.[0]?.url || item.show?.images?.[0]?.url || '';
    playView({title,artist,album,image,url:item.external_urls?.spotify || '',playing:!!data.is_playing,identity:item.id || ''});
    status(`${timeLabel()} 從 Spotify 更新完成。`);
  } catch(err) {
    status(`連線失敗：${err.message}。請檢查網路。`);
  } finally {
    busy=false;
    $('refreshButton').disabled=!getRefresh();
    if(!quotaBlocked) {
      schedule(nextDelay);
      if(canRefreshRecent && accessToken && Date.now() < expiresAt) void refreshRecentIfDue(accessToken);
    }
  }
}
function disconnect() {
  clearTimeout(timer);
  for(const k of ['refresh','pending-auth']) { removeSaved(k); removeTemp(k); }
  removeSaved('client-id');
  accessToken=null; expiresAt=0; lastIdentity=null; quotaBlocked=false;
  currentRetryAt=0; lastRecentSync=0; recentBusy=false; recentScopeBlocked=false; recentRetryAt=0;
  renderRecentlyPlayed([]);
  recentStatus('請連接 Spotify 以查看最近播放。');
  $('clientId').value=''; $('remember').checked=false;
  connected(false); emptyView('已清除這台裝置的授權資料。');
  status('已清除本機授權。若要完全撤銷，請在 Spotify 帳戶的 Apps 頁面取消授權。');
}
async function init() {
  $('redirectUri').textContent=redirectUri;
  $('clientId').value=getSaved('client-id') || '';
  $('remember').checked=!!getSaved('refresh');
  $('connectButton').addEventListener('click',()=>{ void startAuth().catch(e=>status(e.message)); });
  $('disconnectButton').addEventListener('click',disconnect);
  $('refreshButton').addEventListener('click',()=>{ quotaBlocked=false; void refreshNow(); });
  $('recentRefreshButton').addEventListener('click',async()=>{
    if (recentBusy || Date.now()<recentRetryAt) return;
    if (quotaBlocked) { recentStatus('Spotify 配額已用完，請稍後再試。'); return; }
    const token = await validToken();
    if (token) await refreshRecentIfDue(token,true);
    else recentStatus('請先連接 Spotify。');
  });
  $('toggleButton').addEventListener('click',()=>setMonitoring(!monitoring));
  $('copyUri').addEventListener('click',async()=>{
    try { await navigator.clipboard.writeText(redirectUri); $('copyUri').textContent='已複製'; setTimeout(()=>$('copyUri').textContent='複製',1600); }
    catch { status('無法自動複製，請長按上方網址手動複製。'); }
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden') clearTimeout(timer);
    else if(monitoring && getRefresh() && !quotaBlocked) void refreshNow();
  });
  if(await handleCallback()) return;
  if(getRefresh()) { await refreshNow(); }
  else { connected(false); recentStatus('請連接 Spotify 以查看最近播放。'); }
}
void init().catch(err=>status(err.message));
