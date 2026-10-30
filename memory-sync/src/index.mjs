import {normalizeRecord,fingerprint,taipei,constantTimeEquals,compareRecord,decideScan} from './core.mjs';
import {notionConfigured,googleConfigured,readNotion,readGoogle} from './providers.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const failure=(code,status)=>json({ok:false,error:code},status);
function authorized(req,env){return Boolean(env.ADMIN_TOKEN && constantTimeEquals(req.headers.get('X-Admin-Token')||'',env.ADMIN_TOKEN));}
async function readInput(req){
  if(!req.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new Error('JSON_REQUIRED');
  const t=await req.text();if(t.length>16000)throw new Error('TOO_LARGE');
  return JSON.parse(t);
}

async function runCheck(env,triggerType) {
  const runId=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO sync_runs(run_id,trigger_type) VALUES (?,?)').bind(runId,triggerType).run();
  try {
    const [google,notion]=await Promise.all([readGoogle(env),readNotion(env)]);
    const scans=[decideScan('google_drive',googleConfigured(env),google),decideScan('notion',notionConfigured(env),notion)];
    const remoteSets={google_drive:new Set(google.items.map(x=>x.id)),notion:new Set(notion.items.map(x=>x.id))};
    const list=await env.DB.prepare('SELECT id,title,approval,verification FROM memories ORDER BY id LIMIT 501').all();
    const rowOverflow=list.results.length>500;
    const rows=list.results.slice(0,500);
    const links=await env.DB.prepare('SELECT provider,memory_id,remote_id,last_fingerprint FROM sync_links LIMIT 1001').all();
    const linkOverflow=links.results.length>1000;
    const byKey=new Map(links.results.map(l=>[`${l.provider}:${l.memory_id}`,l]));
    const actions=[];
    for(const row of rows)for(const s of scans){
      const l=byKey.get(`${s.provider}:${row.id}`);
      const remote=l && remoteSets[s.provider].has(l.remote_id)?{id:l.remote_id}:null;
      actions.push(compareRecord(row,s.provider,l,remote,s.complete&&!rowOverflow&&!linkOverflow));
    }
    const counts={};for(const a of actions) counts[a.action]=(counts[a.action]||0)+1;
    const complete=scans.every(s=>s.complete)&&!rowOverflow&&!linkOverflow;
    const summary={ok:complete,run_id:runId,mode:'READ_ONLY',trigger:triggerType,checked_at:taipei(),timezone:'Asia/Taipei',scans,records_scanned:rows.length,limits_reached:rowOverflow||linkOverflow,counts,actions,writes_performed:0};
    await env.DB.prepare('UPDATE sync_runs SET state=?,summary_json=?,completed_at=CURRENT_TIMESTAMP WHERE run_id=?').bind(complete?'complete':'partial',JSON.stringify(summary),runId).run();
    return summary;
  }catch(e){
    await env.DB.prepare('UPDATE sync_runs SET state=?,summary_json=?,completed_at=CURRENT_TIMESTAMP WHERE run_id=?').bind('failed',JSON.stringify({error:'RUN_FAILED'}),runId).run();
    return {ok:false,run_id:runId,error:'RUN_FAILED',mode:'READ_ONLY',writes_performed:0};
  }
}

export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(url.pathname==='/health'&&req.method==='GET')return json({ok:true,service:'ling-memory-sync',version:'0.4.0',mode:'READ_ONLY',time:taipei()});
    if(!url.pathname.startsWith('/api/'))return failure('NOT_FOUND',404);
    if(!authorized(req,env))return failure('UNAUTHORIZED',401);
    if(!env.DB)return failure('D1_NOT_BOUND',503);
    try{
      if(url.pathname==='/api/records'&&req.method==='POST'){
        const row=normalizeRecord(await readInput(req));
        const sig=await fingerprint(row);
        const old=await env.DB.prepare('SELECT id,fingerprint FROM memories WHERE id=?').bind(row.id).first();
        if(old){if(old.fingerprint===sig)return json({ok:true,action:'NO_CHANGE',id:row.id});return failure('CONFLICT_REVIEW',409);}
        await env.DB.prepare('INSERT INTO memories(id,title,body,project,layer,source,source_url,event_at,fingerprint) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(row.id,row.title,row.body,row.project,row.layer,row.source,row.source_url,row.event_at,sig).run();
        return json({ok:true,action:'CREATED_PENDING_REVIEW',id:row.id},201);
      }
      if(url.pathname==='/api/records'&&req.method==='GET'){
        const q=(url.searchParams.get('q')||'').slice(0,100);
        const records=q?await env.DB.prepare('SELECT id,title,project,layer,source,event_at,approval,verification,created_at FROM memories WHERE title LIKE ? OR project LIKE ? ORDER BY created_at DESC LIMIT 100').bind(`%${q}%`,`%${q}%`).all():await env.DB.prepare('SELECT id,title,project,layer,source,event_at,approval,verification,created_at FROM memories ORDER BY created_at DESC LIMIT 100').all();
        return json({ok:true,records:records.results});
      }
      if(url.pathname==='/api/sync/check'&&req.method==='POST')return json(await runCheck(env,'manual'));
      if(url.pathname==='/api/sync/latest'&&req.method==='GET'){
        const a=await env.DB.prepare('SELECT run_id,trigger_type,state,started_at,completed_at,summary_json FROM sync_runs ORDER BY started_at DESC LIMIT 1').first();
        return json({ok:true,run:a?{...a,summary:a.summary_json?JSON.parse(a.summary_json):null,summary_json:undefined}:null});
      }
      return failure('NOT_FOUND',404);
    }catch(e){
      if(['INVALID_RECORD','INVALID_ID','INVALID_TEXT','INVALID_METADATA','INVALID_SOURCE_URL','INVALID_EVENT_AT','BLOCKED_CREDENTIAL','JSON_REQUIRED','TOO_LARGE'].includes(e.message))return failure(e.message,400);
      if(e instanceof SyntaxError)return failure('INVALID_JSON',400);
      return failure('SERVER_ERROR',500);
    }
  },
  async scheduled(controller,env){
    if(!env.DB)throw new Error('D1_NOT_BOUND');
    const result=await runCheck(env,controller.cron==='0 15 * * *'?'daily':controller.cron==='0 11 * * SUN'?'weekly':'ad_hoc');
    if(!result.run_id)throw new Error('SYNC_RUN_FAILED');
    // No remote writes regardless of cron and no auto-import of ChatGPT memories.
  }
};
