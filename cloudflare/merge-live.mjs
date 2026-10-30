/*
 * Build-only helper: fetch current Worker with a read-only API token,
 * preserve its source, and prepare (NOT DEPLOY) an additive v5 background build.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {mergeWorkerSource} from './merge-engine.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_AUDIT_TOKEN;
const name=process.env.LING_WORKER_NAME;
if(!/^[a-z][a-z0-9-]{2,62}$/.test(name||''))throw Error('Missing explicit Worker name for read-only audit.');
if(!/^[0-9a-f]{32}$/i.test(account||'')||!token)throw Error('Missing read-only audit credentials.');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name;
async function fetchCF(path){
 const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},redirect:'error'});
 if(!r.ok)throw Error('Cloudflare read returned HTTP '+r.status);
 return r;
}
const response=await fetchCF('/content/v2');
const kind=response.headers.get('content-type')||'';
let source='';
if(kind.includes('multipart/form-data')){
 const form=await response.formData();
 const entries=[...form.entries()].filter(([key,value])=>typeof value!=='string');
 if(entries.length!==1)throw Error('Expected one live Worker module, got '+entries.length);
 source=await entries[0][1].text();
}else if(/javascript|text\/plain|octet-stream/.test(kind)){
 source=await response.text();
}else throw Error('Unexpected live code MIME: '+kind.split(';')[0]);
const originalHash=createHash('sha256').update(source).digest('hex');
const combined=mergeWorkerSource(source);
const dir='cloudflare/.generated';
fs.mkdirSync(dir,{recursive:true});
const current=await (await fetchCF('/settings')).json();
if(current.success===false)throw Error('Cannot read Worker settings');
const bindings=(current.result?.bindings||[]).map(x=>({name:x.name,type:x.type}));
if(!bindings.some(b=>b.name==='DB'&&b.type==='d1'))throw Error('Missing D1 binding DB');
if(!bindings.some(b=>b.name==='LING_ACCESS_CODE'&&b.type==='secret_text'))throw Error('Missing access code Secret');
if(!bindings.some(b=>b.name==='OPENAI_API_KEY'&&b.type==='secret_text'))throw Error('Missing OpenAI Secret');
// Preserve the original module verbatim. Never generate a deployable Wrangler
// configuration from an incomplete binding/settings snapshot.
fs.writeFileSync(dir+'/worker.original.mjs',source,{mode:0o600});
fs.writeFileSync(dir+'/worker.merged.js',combined,{mode:0o600});
fs.writeFileSync(dir+'/audit-summary.json',JSON.stringify({
  previewOnly:true,sourceSha256:originalHash,sourceBytes:Buffer.byteLength(source),
  bindings,requiredAdditionalCrons:['*/10 * * * *','0 12 * * *'],
  deploymentBlocked:'Existing settings, bindings and Cron schedules require separate review.'
},null,2),{mode:0o600});
console.log('PREVIEW ONLY. No Cloudflare changes.');
console.log('Live Worker code SHA-256:',originalHash);
console.log('Live Worker code length:',source.length);
console.log('Existing binding names/types:',JSON.stringify(bindings));
console.log('Merged Worker is ephemeral in the CI runner, not published.');

