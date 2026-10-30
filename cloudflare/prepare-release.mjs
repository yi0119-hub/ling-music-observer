import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Never reconstruct a live configuration from its DB binding alone.
export function validateRelease(config,review,source,backup,expected){
  const hash=value=>createHash('sha256').update(value).digest('hex');
  if(!config||!review||review.productionApproved!==true)throw Error('Production approval missing');
  if(config.name!==expected.name||!expected.name)throw Error('Worker name mismatch');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date||''))throw Error('Reviewed compatibility date missing');
  if(config.keep_vars!==true)throw Error('Existing variables must be retained');
  if(!expected.databaseId||!expected.databaseName||!config.d1_databases?.some(x=>x.binding==='DB'&&x.database_id===expected.databaseId&&x.database_name===expected.databaseName))throw Error('D1 binding mismatch');
  if(review.bundleInputsSha256!==hash(source)||review.configSha256!==hash(JSON.stringify(config))||review.backupSha256!==hash(backup))throw Error('Review hashes mismatch');
  if(!review.originalVersion||!review.d1Bookmark||review.settingsPreserved!==true||review.compatibilityPassed!==true||review.restoreRehearsalPassed!==true||review.songNotificationVerified!==true)throw Error('Release evidence incomplete');
  const age=Date.now()-Date.parse(review.reviewedAt);
  if(!Number.isFinite(age)||age<0||age>24*60*60*1000)throw Error('Release review expired');
  if(!config.triggers?.crons?.includes('*/2 * * * *'))throw Error('Approved two-minute schedule missing');
  if(config.main!=='cloudflare/.generated/worker.candidate.mjs')throw Error('Reviewed candidate path required');
  return config;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dir='cloudflare/.generated';
  const review=JSON.parse(fs.readFileSync(dir+'/release-review.json','utf8'));
  const config=JSON.parse(fs.readFileSync(dir+'/wrangler.reviewed.json','utf8'));
  const inputs=Buffer.concat([fs.readFileSync(config.main),Buffer.from([0]),fs.readFileSync(dir+'/worker.original.mjs'),Buffer.from([0]),fs.readFileSync('cloudflare/ling-background-addon.js')]);
  validateRelease(config,review,inputs,fs.readFileSync(dir+'/production-chat-backup.json'),{name:process.env.LING_WORKER_NAME,databaseName:process.env.LING_D1_DATABASE_NAME,databaseId:process.env.LING_D1_DATABASE_ID});
  fs.writeFileSync('wrangler.generated.json',JSON.stringify(config,null,2),{flag:'wx'});
  console.log('Reviewed configuration copied without discarding existing settings. No remote deployment.');
}
