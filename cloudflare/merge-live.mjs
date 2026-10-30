/*
 * Build-only helper: fetch current Worker with a read-only API token,
 * preserve its source, and prepare (NOT DEPLOY) an additive v5 background build.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_AUDIT_TOKEN;
const name='still-sea-162cling-shared-core';
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
const count=(source.match(/export\s+default\s*\{/g)||[]).length;
if(count!==1)throw Error('Unknown live Worker export shape, refusing to merge.');
if(source.includes('handleLingBackground')||source.includes('runLingBackground'))throw Error('Background module already present.');
const patched=source.replace(/export\s+default\s*\{/,'const __lingOriginalWorker = {');
const wrapper=[
  'export default {',
  '  async fetch(request,env,ctx){',
  "    if(request.method==='POST'&&new URL(request.url).pathname==='/'){",
  '      const copy=request.clone();',
  '      const body=await copy.text();',
  '      if(body.length<=4200){',
  '        try{',
  '          const data=JSON.parse(body);',
  "          if(data&&typeof data.action==='string'&&data.action.startsWith('bg_')){",
  '            return handleLingBackground(request,env);',
  '          }',
  '        }catch{}',
  '      }',
  '    }',
  '    return __lingOriginalWorker.fetch(request,env,ctx);',
  '  },',
  '  async scheduled(controller,env,ctx){',
  "    if(['*/10 * * * *','0 12 * * *'].includes(controller.cron))",
  '      ctx.waitUntil(runLingBackground(controller.cron,env));',
  "    if(typeof __lingOriginalWorker.scheduled==='function')",
  '      return __lingOriginalWorker.scheduled(controller,env,ctx);',
  '  }',
  '};'
].join('\n');
const combined=[
  "import {handleLingBackground,runLingBackground} from './ling-background-addon.js';",
  patched,wrapper
].join('\n');
const dir='cloudflare/.generated';
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/worker.merged.js',combined,{mode:0o600});
const current=await (await fetchCF('/settings')).json();
if(current.success===false)throw Error('Cannot read Worker settings');
const bindings=(current.result?.bindings||[]).map(x=>({name:x.name,type:x.type}));
if(!bindings.some(b=>b.name==='DB'&&b.type==='d1'))throw Error('Missing D1 binding DB');
if(!bindings.some(b=>b.name==='LING_ACCESS_CODE'&&b.type==='secret_text'))throw Error('Missing access code Secret');
if(!bindings.some(b=>b.name==='OPENAI_API_KEY'&&b.type==='secret_text'))throw Error('Missing OpenAI Secret');
const config={
  name,main:dir+'/worker.merged.js',compatibility_date:'2026-10-30',keep_vars:true,
  d1_databases:[{binding:'DB',database_name:'ling-memory',database_id:'2b32da5d-ee0d-4fcd-8f48-20ec74bc67ce'}],
  triggers:{crons:['*/10 * * * *','0 12 * * *']}
};
fs.writeFileSync(dir+'/wrangler.preview.json',JSON.stringify(config,null,2),{mode:0o600});
console.log('PREVIEW ONLY. No Cloudflare changes.');
console.log('Live Worker code SHA-256:',originalHash);
console.log('Live Worker code length:',source.length);
console.log('Existing binding names/types:',JSON.stringify(bindings));
console.log('Merged Worker is ephemeral in the CI runner, not published.');
