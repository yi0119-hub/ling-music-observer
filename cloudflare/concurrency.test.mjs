import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleLingBackground,runLingBackground} from './ling-background-addon.js';

const ACCESS='test-only-'.repeat(5);
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');
  t.after(()=>sqlite.close());
  const db={prepare(sql){
    const stmt=sqlite.prepare(sql);let args=[];
    return {bind(...values){args=values;return this;},
      async first(){return stmt.get(...args)||null;},
      async all(){return {results:stmt.all(...args)};},
      async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};}};
  },async batch(statements){
    sqlite.exec('BEGIN');
    try{const results=[];for(const stmt of statements)results.push(await stmt.run());sqlite.exec('COMMIT');return results;}
    catch(e){sqlite.exec('ROLLBACK');throw e;}
  }};
  const env={DB:db,LING_ACCESS_CODE:ACCESS};
  const call=async(action,body={})=>{
    const response=await handleLingBackground(new Request('https://example.workers.dev/ling-bg',{
      method:'POST',headers:{Origin:'https://yi0119-hub.github.io','Content-Type':'application/json','X-Ling-Access-Code':ACCESS},body:JSON.stringify({action,...body})
    }),env);assert.equal(response.status,200);return response;
  };
  const enable=()=>call('bg_enable_spotify',{clientId:'a'.repeat(32),refreshToken:'test-refresh-'.repeat(4)});
  const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
  return {sqlite,env,call,enable};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

for(const stage of ['refresh','player'])test(`disable while ${stage} response is pending never recreates Spotify data`,async t=>{
  const {sqlite,env,call,enable}=fixture(t);await enable();
  const entered=deferred(),resume=deferred();let calls=0;
  globalThis.fetch=async url=>{
    calls++;
    if(stage==='player'&&String(url).includes('/api/token'))return Response.json({access_token:'test'});
    entered.resolve();await resume.promise;
    return stage==='refresh'?Response.json({access_token:'test',refresh_token:'new-rotated-token'}):Response.json({is_playing:true,item:{type:'track',id:'track-test'}});
  };
  const running=runLingBackground('*/10 * * * *',env);
  await entered.promise;await call('bg_disable_spotify');resume.resolve();await running;
  assert.deepEqual(sqlite.prepare("SELECT key FROM ling_v4_settings WHERE key LIKE 'spotify_%'").all(),[]);
  assert.equal(calls,stage==='refresh'?1:2);
});

test('overlapping Cron executions share one lease; errors release it for next execution',async t=>{
  const {sqlite,env,enable}=fixture(t);await enable();
  const entered=deferred(),resume=deferred();let calls=0;
  globalThis.fetch=async()=>{calls++;entered.resolve();await resume.promise;throw Error('simulated network outage');};
  const first=runLingBackground('*/10 * * * *',env);
  const rejected=assert.rejects(first,/network outage/);
  await entered.promise;
  await runLingBackground('*/10 * * * *',env);
  assert.equal(calls,1);resume.resolve();await rejected;
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM ling_v4_jobs').get().n,0);
  globalThis.fetch=async url=>{calls++;return String(url).includes('/api/token')?Response.json({access_token:'test'}):new Response(null,{status:204});};
  await runLingBackground('*/10 * * * *',env);assert.ok(calls>1);
});

test('old invalid-grant response cannot remove a new authorization',async t=>{
  const {sqlite,env,enable}=fixture(t);await enable();
  const entered=deferred(),resume=deferred();
  globalThis.fetch=async()=>{entered.resolve();await resume.promise;return Response.json({error:'invalid_grant'},{status:400});};
  const running=runLingBackground('*/10 * * * *',env);await entered.promise;
  await enable();const newToken=sqlite.prepare("SELECT value FROM ling_v4_settings WHERE key='spotify_token'").get().value;
  resume.resolve();await running;
  assert.equal(sqlite.prepare("SELECT value FROM ling_v4_settings WHERE key='spotify_token'").get().value,newToken);
  assert.equal(sqlite.prepare("SELECT value FROM ling_v4_settings WHERE key='spotify_enabled'").get().value,'yes');
});

test('invalid grant deletes enabled flag and token using real SQLite',async t=>{
  const {sqlite,env,enable}=fixture(t);await enable();
  globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400});
  await runLingBackground('*/10 * * * *',env);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM ling_v4_settings WHERE key IN ('spotify_token','spotify_enabled')").get().n,0);
});

test('expired lease recovers, and unrelated chat and memory rows remain untouched',async t=>{
  const {sqlite,env,enable}=fixture(t);await enable();
  sqlite.exec("CREATE TABLE messages(id INTEGER PRIMARY KEY,body TEXT); INSERT INTO messages(body) VALUES('chat-kept'); CREATE TABLE memories(id INTEGER PRIMARY KEY,body TEXT); INSERT INTO memories(body) VALUES('memory-kept'); INSERT INTO ling_v4_jobs VALUES('spotify','dead-owner',0)");
  globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400});
  await runLingBackground('*/10 * * * *',env);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM ling_v4_jobs').get().n,0);
  assert.equal(sqlite.prepare('SELECT body FROM messages').get().body,'chat-kept');
  assert.equal(sqlite.prepare('SELECT body FROM memories').get().body,'memory-kept');
});
