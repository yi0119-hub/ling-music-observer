import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const addon=fs.readFileSync(join(root,'ling-background-addon.js'),'utf8').replaceAll('export async function ','async function ');
const entry=fs.readFileSync(join(root,'staging.worker.mjs'),'utf8')
  .replace("import {handleLingBackground,runLingBackground} from './ling-background-addon.js';",'')
  .replace("import {STAGING_UI_SOURCE} from './.generated/staging-ui-source.mjs';",'');
const script=fs.readFileSync(join(root,'staging-ui.js'),'utf8');
const source=addon+'\nconst STAGING_UI_SOURCE='+JSON.stringify(script)+';\n'+entry;
const dir=join(root,'.generated');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(join(dir,'staging.worker.mjs'),source,{mode:0o600});
fs.writeFileSync(join(dir,'staging-ui-source.mjs'),'export const STAGING_UI_SOURCE='+JSON.stringify(script)+';\n');
console.log('Staging bundle SHA-256:',createHash('sha256').update(source).digest('hex'));
