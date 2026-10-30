import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateRelease} from './prepare-release.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
  const source='local-reviewed-source',backup='local-backup';
  const config={name:'local-worker',main:'cloudflare/.generated/worker.candidate.mjs',compatibility_date:'2026-10-29',keep_vars:true,d1_databases:[{binding:'DB',database_id:'local-db-id',database_name:'local-db'}],kv_namespaces:[{binding:'KEEP',id:'local-kv'}],triggers:{crons:['*/2 * * * *','0 5 * * *']}};
  const review={productionApproved:true,bundleInputsSha256:hash(source),configSha256:hash(JSON.stringify(config)),backupSha256:hash(backup),originalVersion:'local-old',d1Bookmark:'local-bookmark',settingsPreserved:true,compatibilityPassed:true,restoreRehearsalPassed:true,songNotificationVerified:true,reviewedAt:new Date().toISOString()};
  return {config,review,source,backup,expected:{name:'local-worker',databaseId:'local-db-id',databaseName:'local-db'}};
}
test('release gate retains additional bindings and existing schedules verbatim',()=>{
  const f=fixture();assert.equal(validateRelease(f.config,f.review,f.source,f.backup,f.expected),f.config);
  assert.equal(f.config.kv_namespaces[0].binding,'KEEP');assert.ok(f.config.triggers.crons.includes('0 5 * * *'));
});
test('release gate rejects stale evidence, changed backups or settings and missing real notification proof',()=>{
  for(const alter of [f=>{f.backup+='changed';},f=>{f.source+='changed';},f=>{f.config.d1_databases[0].database_id='wrong';},f=>{f.config.kv_namespaces=[];},f=>{f.review.productionApproved=false;},f=>{f.review.songNotificationVerified=false;},f=>{f.review.reviewedAt='2000-01-01T00:00:00Z';}]){
    const f=fixture();alter(f);assert.throws(()=>validateRelease(f.config,f.review,f.source,f.backup,f.expected));
  }
});
