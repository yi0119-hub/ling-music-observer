import fs from 'node:fs';
const fail = message => { console.error(message); process.exit(1); };
// Deliberately missing until the live Cloudflare Worker has been backed up and reviewed.
const main = 'cloudflare/worker.reviewed.js';
if (!fs.existsSync(main)) fail('BLOCKED: worker.reviewed.js missing. Backup and reconcile live Worker before release.');
const name = (process.env.LING_WORKER_NAME || '').trim();
const d1name = (process.env.LING_D1_DATABASE_NAME || '').trim();
const d1id = (process.env.LING_D1_DATABASE_ID || '').trim();
if (!/^[a-z][a-z0-9-]{2,62}$/.test(name)) fail('Invalid/missing LING_WORKER_NAME; must match the LIVE Worker.');
if (!/^[a-zA-Z0-9_-]{1,128}$/.test(d1name)) fail('Invalid/missing LING_D1_DATABASE_NAME.');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d1id)) fail('Invalid/missing LING_D1_DATABASE_ID.');
const code = fs.readFileSync(main, 'utf8');
if (!code.includes('async scheduled(') || !code.includes('export default')) fail('Reviewed Worker lacks expected scheduled/fetch handler.');
const config = {
  name,
  main,
  compatibility_date: '2026-10-30',
  keep_vars: true,
  d1_databases: [{binding:'DB',database_name:d1name,database_id:d1id}],
  triggers: { crons: ['*/10 * * * *', '0 12 * * *'] },
  secrets: { required: ['OPENAI_API_KEY', 'LING_ACCESS_CODE'] }
};
fs.writeFileSync('wrangler.generated.json', JSON.stringify(config, null, 2));
console.log('Prepared guarded deployment for exact existing Worker + D1 + two UTC cron triggers.');
