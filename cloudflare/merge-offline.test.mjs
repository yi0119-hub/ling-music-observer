import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createOfflinePreview} from './merge-offline.mjs';
const source="// Private audit fixture: no credentials or remote calls. Preserve this source verbatim.\nexport default {async fetch(){return new Response('chat');}};\n";
async function directory(t){
  const dir=await mkdtemp(join(dirname(fileURLToPath(import.meta.url)),'.offline-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));return dir;
}
test('offline preview preserves original bytes and never creates deploy configuration',async t=>{
  const dir=await directory(t),summary=createOfflinePreview(source,dir);
  assert.equal(summary.previewOnly,true);
  assert.equal(await readFile(join(dir,'worker.original.mjs'),'utf8'),source);
  assert.deepEqual((await readdir(dir)).sort(),['audit-summary.json','worker.merged.js','worker.original.mjs']);
});
test('offline preview refuses to overwrite existing audit output',async t=>{
  const dir=await directory(t);createOfflinePreview(source,dir);
  assert.throws(()=>createOfflinePreview(source+'// changed',dir),/Preview exists/);
  assert.equal(await readFile(join(dir,'worker.original.mjs'),'utf8'),source);
});
test('invalid original syntax fails before writing any preview files',async t=>{
  const dir=await directory(t);
  assert.throws(()=>createOfflinePreview(source+'\nconst broken = ;',dir),/syntax/);
  assert.deepEqual(await readdir(dir),[]);
});
