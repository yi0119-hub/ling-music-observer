// Restore only to an in-memory SQLite database. No remote write or service calls.
import {readFile,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
if(!process.argv[2]||!process.argv[3])throw Error('Provide private backup and audited Worker paths');
const raw=await readFile(process.argv[2]);const backup=JSON.parse(raw);
const worker=(await import(pathToFileURL(resolve(process.argv[3])))).default;
const sql=new DatabaseSync(':memory:');
const DB={prepare(query){const s=sql.prepare(query);let args=[];return {bind(...values){args=values;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return {meta:{changes:Number(s.run(...args).changes)}};}};},async batch(items){sql.exec('BEGIN');try{const results=[];for(const s of items)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const key='local-restore-rehearsal-'.repeat(2),env={DB,LING_ACCESS_CODE:key,OPENAI_API_KEY:'unused-local'};
const request=action=>new Request('https://restore.invalid/',{method:'POST',headers:{Origin:'https://yi0119-hub.github.io','Content-Type':'application/json','X-Ling-Access-Code':key},body:JSON.stringify({action})});
const previous=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Network forbidden in backup rehearsal');};
try{
  assert.equal((await worker.fetch(request('history'),env)).status,200);
  const columns={messages:['id','role','content','created_at'],memories:['id','content','created_at'],rate_limits:['name','window_start','hits'],sqlite_sequence:['name','seq']};
  for(const [table,fields] of Object.entries(columns)){
    assert.ok(Array.isArray(backup[table]));sql.exec('DELETE FROM '+table);
    const insert=sql.prepare('INSERT INTO '+table+'('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')');
    for(const row of backup[table])insert.run(...fields.map(f=>row[f]));
    const restored=sql.prepare('SELECT '+fields.join(',')+' FROM '+table).all().map(x=>({...x}));
    const sorted=rows=>rows.map(x=>JSON.stringify(Object.fromEntries(fields.map(f=>[f,x[f]])))).sort();
    assert.deepEqual(sorted(restored),sorted(backup[table]));
  }
  const response=await worker.fetch(request('export'),env);assert.equal(response.status,200);
  const exported=await response.json();assert.equal(exported.messages.length,Math.min(250,backup.messages.length));
  const report={offlineOnly:true,passed:true,backupSha256:createHash('sha256').update(raw).digest('hex'),scope:'application tables; Cloudflare internal _cf_KV excluded',rowCounts:Object.fromEntries(Object.keys(columns).map(k=>[k,backup[k].length])),productionChanged:false};
  await writeFile(resolve(dirname(process.argv[2]),'restore-rehearsal.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{globalThis.fetch=previous;sql.close();}
