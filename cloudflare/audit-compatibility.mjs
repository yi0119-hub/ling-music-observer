// Local-only verification of a private audited Worker. Never contacts live services.
import {readFile,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {createOfflinePreview} from './merge-offline.mjs';
import {mergeWorkerSource} from './merge-engine.mjs';

const sourcePath=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Provide a private audited Worker source path');
const source=await readFile(sourcePath,'utf8');
const output=resolve(dirname(fileURLToPath(import.meta.url)),'.generated');
// Reuse only a byte-identical preview; do not replace an earlier audit.
try{assert.equal(await readFile(resolve(output,'worker.original.mjs'),'utf8'),source);}
catch(error){if(error.code!=='ENOENT')throw error;createOfflinePreview(source,output);}
const original=(await import(pathToFileURL(sourcePath))).default;
const candidate=resolve(output,'worker.candidate.mjs');
await writeFile(candidate,mergeWorkerSource(source,{pollMinutes:2,daily:false}));
const merged=(await import(pathToFileURL(process.argv[3]?resolve(process.argv[3]):candidate))).default;
const databases=[];
function env(){
  const sql=new DatabaseSync(':memory:');databases.push(sql);
  const DB={prepare(query){const statement=sql.prepare(query);let args=[];return {
    bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
    async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}
  };},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  return {DB,LING_ACCESS_CODE:'local-audit-only-'.repeat(3),OPENAI_API_KEY:'local-mock-only'};
}
const before=globalThis.fetch;let calls=0;
globalThis.fetch=async url=>{assert.equal(String(url),'https://api.openai.com/v1/responses');calls++;return Response.json({output:[{type:'message',content:[{type:'output_text',text:'local-audit-reply'}]}]});};
const checks=[];
try{
  const oldEnv=env(),newEnv=env();
  for(const [action,extra] of [['history',{}],['remember',{text:'local memory'}],['chat',{message:'local message'}],['history',{}],['export',{}],['export',{after:1}]]){
    const request=()=>new Request('https://audit.invalid/',{method:'POST',headers:{Origin:'https://yi0119-hub.github.io','Content-Type':'application/json','X-Ling-Access-Code':oldEnv.LING_ACCESS_CODE},body:JSON.stringify({action,...extra})});
    const a=await original.fetch(request(),oldEnv,{}),b=await merged.fetch(request(),newEnv,{});
    assert.equal(a.status,b.status);assert.equal(a.status,200);
    const normalize=value=>JSON.stringify(value,(key,v)=>key==='created_at'?'timestamp':v);
    assert.equal(normalize(await a.json()),normalize(await b.json()));checks.push(action);
  }
  const snapshot=()=>JSON.stringify(databases[1].prepare('SELECT role,content FROM messages ORDER BY id').all())+JSON.stringify(databases[1].prepare('SELECT content FROM memories ORDER BY id').all());
  const saved=snapshot();
  const bg=await merged.fetch(new Request('https://audit.invalid/ling-bg',{method:'POST',headers:{Origin:'https://yi0119-hub.github.io','Content-Type':'application/json','X-Ling-Access-Code':newEnv.LING_ACCESS_CODE},body:JSON.stringify({action:'bg_status'})}),newEnv,{});
  assert.equal(bg.status,200);assert.equal(snapshot(),saved);checks.push('background-preserves-chat-memory');
  const pending=[];await merged.scheduled({cron:'*/2 * * * *'},newEnv,{waitUntil(p){pending.push(p);}});assert.equal(pending.length,1);await Promise.all(pending);
  assert.equal(snapshot(),saved);checks.push('disabled-cron-preserves-chat-memory');
  assert.equal(calls,2);
  const report={offlineOnly:true,sourceSha256:createHash('sha256').update(source).digest('hex'),checks,passed:true,productionChanged:false};
  await writeFile(resolve(output,'compatibility-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{globalThis.fetch=before;for(const db of databases)db.close();}
