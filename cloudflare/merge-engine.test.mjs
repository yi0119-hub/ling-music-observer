import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mergeWorkerSource} from './merge-engine.mjs';

const original = [
  '// Original chat Worker: leave all existing handlers and bindings intact.',
  'export default {',
  "  marker: 'original',",
  "  queue(){return this.marker;},",
  '  async fetch(request, env) {',
  "    globalThis.__lingMockChatHits = (globalThis.__lingMockChatHits || 0) + 1;",
  "    return new Response('original-chat: ' + new URL(request.url).pathname + ':' + request.method);",
  '  },',
  "  scheduled(controller){globalThis.__lingMockCron = controller.cron;}",
  '};'
].join('\n');

test('refuse unknown or already patched live Worker structure',()=>{
  assert.throws(()=>mergeWorkerSource('invalid'),/source/i);
  assert.throws(()=>mergeWorkerSource(original.replace('export default {','export default class X {')),/entry point/i);
  assert.throws(()=>mergeWorkerSource(original+'\nexport default {}'),/entry point/i);
  assert.throws(()=>mergeWorkerSource(original+' // handleLingBackground'),/already installed/i);
});

test('existing chat remains unchanged, background uses only a separate API path',async t=>{
  const dir=await mkdtemp(join(dirname(fileURLToPath(import.meta.url)),'.merge-test-'));
  t.after(async()=>rm(dir,{recursive:true,force:true}));
  await writeFile(join(dir,'worker.mjs'),mergeWorkerSource(original));
  const worker=(await import(pathToFileURL(join(dir,'worker.mjs')).href)).default;
  assert.equal(worker.queue(),'original');
  globalThis.__lingMockChatHits=0;
  const root='https://example.workers.dev';
  const make=(path,method,headers={})=>new Request(root+path,{method,headers,
    ...(method==='POST'?{body:'{"action":"history"}'}:{})});
  assert.equal(await (await worker.fetch(make('/','POST'),{},{})).text(),'original-chat: /:POST');
  assert.equal(await (await worker.fetch(make('/','GET'),{},{})).text(),'original-chat: /:GET');
  assert.equal(await (await worker.fetch(make('/some-existing-route','GET'),{},{})).text(),'original-chat: /some-existing-route:GET');
  assert.equal(globalThis.__lingMockChatHits,3);

  const pre=make('/ling-bg','OPTIONS', {
    Origin:'https://yi0119-hub.github.io','Access-Control-Request-Method':'POST'
  });
  const response=await worker.fetch(pre,{},{});
  assert.equal(response.status,204);
  assert.equal(response.headers.get('Access-Control-Allow-Headers'),'content-type,x-ling-access-code');
  assert.equal(globalThis.__lingMockChatHits,3);

  const evil=await worker.fetch(make('/ling-bg','OPTIONS',{Origin:'https://unexpected.example','Access-Control-Request-Method':'POST'}),{},{});
  assert.equal(evil.status,403);
  const disallowed=await worker.fetch(make('/ling-bg','GET'),{},{});
  assert.equal(disallowed.status,405);
  assert.equal(globalThis.__lingMockChatHits,3);

  const post=await worker.fetch(make('/ling-bg','POST',{Origin:'https://yi0119-hub.github.io'}),{},{});
  assert.equal(post.status,503); // no DB configured: safe failure, not a chat mutation.
  assert.equal(globalThis.__lingMockChatHits,3);

  await worker.scheduled({cron:'0 5 * * *'},{},{waitUntil(){}});
  assert.equal(globalThis.__lingMockCron,'0 5 * * *');
});

