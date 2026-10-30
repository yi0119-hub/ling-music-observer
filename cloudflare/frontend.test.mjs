import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../background.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(overrides={}){
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,checked:false,addEventListener(type,callback){this[type]=callback;}});
    return elements.get(id);
  };
  element('chatEndpoint').value='https://example.workers.dev/';
  element('chatPasscode').value='c'.repeat(40);
  const context={document:{getElementById:element},window:{},navigator:{},Notification:{requestPermission(){return Promise.resolve('denied');}},
    AbortSignal,URL,Uint8Array,atob,setTimeout,clearTimeout,sessionStorage:{getItem(){return null;}},localStorage:{getItem(){return null;}},fetch:async()=>Response.json({}),...overrides};
  vm.runInNewContext(source,context);
  return {element,context};
}
test('notification permission starts inside click; duplicate taps are blocked; failure unlocks controls',async()=>{
  let asked=0,resolve;
  const permission=new Promise(r=>resolve=r);
  const {element}=fixture({window:{Notification:{}},Notification:{requestPermission(){asked++;return permission;}}});
  element('bgSubscribe').click();
  assert.equal(asked,1);
  assert.equal(element('bgSubscribe').disabled,true);
  element('bgSubscribe').click();assert.equal(asked,1);
  resolve('denied');await settle();
  assert.equal(element('bgSubscribe').disabled,false);
  assert.match(element('bgMessage').textContent,/通知權限未允許/);
});
test('successful subscription keeps actionable confirmation after status refresh',async()=>{
  const key=Uint8Array.from([1,2,3]);
  let registered=0;
  const subscription={options:{applicationServerKey:key},toJSON(){return {endpoint:'https://web.push.apple.com/test'};}};
  const registration={pushManager:{async getSubscription(){return subscription;}}};
  const {element}=fixture({window:{PushManager:{},Notification:{}},Notification:{requestPermission:async()=> 'granted'},
    navigator:{serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}},
    fetch:async(url,options)=>{
      const {action}=JSON.parse(options.body);
      if(action==='bg_vapid')return Response.json({publicKey:'AQID'});
      if(action==='bg_subscribe')registered++;
      return Response.json({pushSubscriptions:1,pollMinutes:10});
    }});
  element('bgSubscribe').click();await settle();await settle();
  assert.equal(registered,1);
  assert.match(element('bgMessage').textContent,/確認手機實際收到/);
  assert.equal(element('bgSubscribe').disabled,false);
});
