import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker from './staging.worker.mjs';
const root='https://ling-v52-staging-20261030.example.workers.dev';
test('page CSP explicitly allows its own service worker without external worker sources',async()=>{
  const response=await worker.fetch(new Request(root),{});
  const directives=Object.fromEntries(response.headers.get('Content-Security-Policy').split(';').map(s=>{const [name,...values]=s.trim().split(/\s+/);return [name,values];}));
  assert.deepEqual(directives['worker-src'],["'self'"]);
  const sw=await worker.fetch(new Request(root+'/sw.js'),{});
  assert.equal(sw.status,200);
  assert.equal(sw.headers.get('Content-Type'),'application/javascript');
});
test('staging health distinguishes missing setup and never touches chat data',async()=>{
  assert.equal((await worker.fetch(new Request(root+'/health'),{})).status,503);
  const response=await worker.fetch(new Request(root+'/health'),{LING_ACCESS_CODE:'x'.repeat(40),DB:{prepare(sql){assert.equal(sql,'SELECT 1 AS ok');return {async first(){return {ok:1};}};}}});
  assert.equal(response.status,200);assert.equal((await response.json()).spotifyScheduled,false);
});
test('staging blocks cross-origin API requests before accessing database',async()=>{
  const response=await worker.fetch(new Request(root+'/ling-bg',{method:'POST',headers:{Origin:'https://yi0119-hub.github.io'},body:'{}'}),{});
  assert.equal(response.status,403);
  assert.equal((await worker.fetch(new Request(root+'/unknown'),{})).status,404);
});
test('staging page and single-file bundle have valid script syntax',async()=>{
  const html=await (await worker.fetch(new Request(root),{})).text();
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const bundle=await readFile(new URL('./.generated/staging.worker.mjs',import.meta.url),'utf8');
  assert.equal(bundle.includes("import {handleLingBackground}"),false);
  assert.equal(typeof (await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'))).default.fetch,'function');
});
