/** Read-only connectors. Never writes external data. */
const NOTION_VERSION='2025-09-03';
const maxPages=5; // avoid silent partial scans
async function safeJson(res) {
  const body=await res.text();
  if (!res.ok) throw new Error(`HTTP_${res.status}`); // do not leak sensitive response bodies
  try { return JSON.parse(body); } catch { throw new Error('INVALID_JSON'); }
}
export function notionConfigured(env) { return Boolean(env.NOTION_TOKEN && env.NOTION_PARENT_PAGE_ID); }
export function googleConfigured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN && env.GOOGLE_DRIVE_FOLDER_ID);
}
export async function readNotion(env, fetcher=fetch) {
  if(!notionConfigured(env)) return {items:[],complete:false,error:'not_configured'};
  const items=[];let cursor=null;
  try {
    for(let page=0;page<maxPages;page++) {
      const url=new URL(`https://api.notion.com/v1/blocks/${encodeURIComponent(env.NOTION_PARENT_PAGE_ID)}/children`);
      url.searchParams.set('page_size','100'); if(cursor)url.searchParams.set('start_cursor',cursor);
      const data=await safeJson(await fetcher(url.toString(),{headers:{Authorization:`Bearer ${env.NOTION_TOKEN}`,'Notion-Version':NOTION_VERSION}}));
      if(!Array.isArray(data.results)) throw new Error('MALFORMED_RESPONSE');
      for(const block of data.results) {
        if(block.type==='child_page') items.push({id:block.id,name:block.child_page?.title||'',kind:'page'});
      }
      if(!data.has_more) return {items,complete:true};
      if(!data.next_cursor)throw new Error('MALFORMED_PAGINATION');
      cursor=data.next_cursor;
    }
    return {items,complete:false,error:'LIMIT_REACHED'};
  } catch(e) {return {items,complete:false,error:String(e.message||'NOTION_ERROR')};}
}
async function googleToken(env,fetcher) {
  const data=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
  const out=await safeJson(await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:data.toString()}));
  if(!out.access_token)throw new Error('OAUTH_NO_TOKEN');
  return out.access_token;
}
export async function readGoogle(env, fetcher=fetch) {
  if(!googleConfigured(env)) return {items:[],complete:false,error:'not_configured'};
  const items=[];let pageToken=null;
  try {
    const accessToken=await googleToken(env,fetcher);
    for(let page=0;page<maxPages;page++) {
      const url=new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q',`'${env.GOOGLE_DRIVE_FOLDER_ID.replaceAll("'", "\\'")}' in parents and trashed = false`);
      url.searchParams.set('fields','nextPageToken,files(id,name,mimeType,modifiedTime),incompleteSearch');
      url.searchParams.set('pageSize','100'); if(pageToken)url.searchParams.set('pageToken',pageToken);
      const data=await safeJson(await fetcher(url.toString(),{headers:{Authorization:`Bearer ${accessToken}`}}));
      if(!Array.isArray(data.files))throw new Error('MALFORMED_RESPONSE');
      for(const f of data.files) items.push({id:f.id,name:f.name||'',kind:f.mimeType||''});
      if(!data.nextPageToken) return {items,complete:!data.incompleteSearch};
      pageToken=data.nextPageToken;
    }
    return {items,complete:false,error:'LIMIT_REACHED'};
  } catch(e) {return {items,complete:false,error:String(e.message||'GOOGLE_ERROR')};}
}
