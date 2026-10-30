// Offline-only: use an existing private audit source, without Cloudflare access.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeWorkerSource} from './merge-engine.mjs';

export function createOfflinePreview(source,outputDirectory){
  if(typeof source!=='string'||Buffer.byteLength(source)>10*1024*1024)throw Error('Invalid or oversized audit source');
  const wrapper=mergeWorkerSource(source);
  for(const code of [source,wrapper]){
    const checked=spawnSync(process.execPath,['--input-type=module','--check'],{input:code,encoding:'utf8',timeout:10000});
    // Do not print syntax diagnostics: they can include private source lines.
    if(checked.error||checked.status!==0)throw Error('Worker module syntax validation failed');
  }
  const files=['worker.original.mjs','worker.merged.js','audit-summary.json'];
  if(files.some(file=>fs.existsSync(resolve(outputDirectory,file))))throw Error('Preview exists; preserve it and use a new directory');
  fs.mkdirSync(outputDirectory,{recursive:true});
  const summary={previewOnly:true,sourceSha256:createHash('sha256').update(source).digest('hex'),sourceBytes:Buffer.byteLength(source),deploymentBlocked:'No live settings or bindings verified. No deploy configuration generated.'};
  for(const [index,content] of [source,wrapper,JSON.stringify(summary,null,2)].entries())
    fs.writeFileSync(resolve(outputDirectory,files[index]),content,{mode:0o600,flag:'wx'});
  return summary;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Usage: node cloudflare/merge-offline.mjs <private-audit-worker.js>');
  const source=fs.readFileSync(process.argv[2],'utf8');
  const summary=createOfflinePreview(source,resolve(dirname(fileURLToPath(import.meta.url)),'.generated'));
  console.log('Offline preview only. No network requests. Source SHA-256:',summary.sourceSha256);
}
