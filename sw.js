/* Service worker: notifications only. No Spotify API, no request caching. */
self.addEventListener('push', event => {
  let data={title:'玲的音樂觀察室',body:'你有一則新提醒。',url:'./'};
  try {if(event.data) data={...data,...event.data.json()};}catch{}
  const safeTitle=String(data.title||'玲的音樂觀察室').slice(0,100);
  const safeBody=String(data.body||'').slice(0,350);
  const url=new URL('./',self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(safeTitle,{
    body:safeBody,tag:String(data.tag||'ling-notice').slice(0,80),
    icon:'./icon-192.png',badge:'./icon-192.png',data:{url}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url=new URL('./',self.registration.scope).href;
  event.waitUntil((async()=>{
    const tabs=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const tab of tabs){if(tab.url.startsWith(url)){await tab.focus();return;}}
    await clients.openWindow(url);
  })());
});
