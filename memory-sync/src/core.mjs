/** Pure reconciliation functions. No provider writes. */
export const LAYERS = new Set(['soul','user','project','fact','lesson','topic','rules']);
const DANGEROUS = /(?:password\s*[:=]|api[_ -]?key\s*[:=]|client_secret\s*[:=]|refresh_token\s*[:=]|access[_ -]?token\s*[:=]|authorization\s*:\s*bearer|bearer\s+[a-z0-9._-]{10,}|密碼\s*[:：=]|金鑰\s*[:：=]|私鑰\s*[:：=])/i;
export function containsCredential(text) { return DANGEROUS.test(String(text || '')); }
export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_RECORD');
  const id = String(raw.id || '').trim();
  const title = String(raw.title || '').trim();
  const body = String(raw.body || '').trim();
  const project = String(raw.project || '全域').trim();
  const layer = String(raw.layer || 'fact').trim();
  const source = String(raw.source || '').trim();
  const source_url = raw.source_url == null ? null : String(raw.source_url).trim();
  const event_at = raw.event_at == null ? null : String(raw.event_at).trim();
  if (!/^[A-Za-z0-9._-]{3,96}$/.test(id)) throw new Error('INVALID_ID');
  if (!title || title.length > 140 || body.length > 8000 || !body) throw new Error('INVALID_TEXT');
  if (!project || project.length > 100 || !LAYERS.has(layer) || !source || source.length > 300) throw new Error('INVALID_METADATA');
  if (source_url && (!/^https:\/\//i.test(source_url) || source_url.length > 500)) throw new Error('INVALID_SOURCE_URL');
  if (event_at && !/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)?)?$/.test(event_at)) throw new Error('INVALID_EVENT_AT');
  if (containsCredential([title,body,source,source_url].join('\n'))) throw new Error('BLOCKED_CREDENTIAL');
  return {id,title,body,project,layer,source,source_url,event_at};
}
export async function sha256(input) {
  const bytes = new TextEncoder().encode(input);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function fingerprint(row) {
  const fields=['id','title','body','project','layer','source','source_url','event_at'];
  return sha256(JSON.stringify(fields.map(key=>[key,row[key] ?? null])));
}
export function taipei(iso = new Date().toISOString()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
}
/** D1 is authoritative for links; labels/filenames from other systems are not a safe match. */
export function compareRecord(record, provider, link, remote, discoveryComplete=true) {
  if (record.approval !== 'approved' || record.verification !== 'verified')
    return {memory_id:record.id,provider,action:'WAIT_APPROVAL'};
  if (!discoveryComplete) return {memory_id:record.id,provider,action:'UNKNOWN_INCOMPLETE_SCAN'};
  if (!link) return {memory_id:record.id,provider,action:'UNLINKED_REVIEW'};
  if (!remote) return {memory_id:record.id,provider,action:'MISSING_REMOTE_REVIEW'};
  if (remote.id !== link.remote_id) return {memory_id:record.id,provider,action:'CONFLICT_REVIEW'};
  // Until remote contents are validated by an explicit mapping, existence alone is NOT proof of sync.
  return {memory_id:record.id,provider,action:'REMOTE_FOUND_UNVERIFIED',last_fingerprint:link.last_fingerprint || null};
}
export function decideScan(providerName, configOk, result) {
  if (!configOk) return {provider:providerName,status:'not_configured',items:0,complete:false};
  if (result.error) return {provider:providerName,status:'error',message:result.error,items:0,complete:false};
  return {provider:providerName,status:result.complete?'read_ok':'partial_scan',items:result.items.length,complete:result.complete};
}
export function constantTimeEquals(a,b) {
  const x=new TextEncoder().encode(String(a)); const y=new TextEncoder().encode(String(b));
  let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++) diff |= (x[i]??0)^(y[i]??0);
  return diff===0;
}
