import fs from 'node:fs';
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const js = fs.readFileSync('background.js', 'utf8');
for (const id of ['room-scene','panel-music','panel-chat','panel-settings','recentList','chatRemember','bgFeature','bgSubscribe','bgEnableSpotify','bgDaily']) {
  if (!html.includes(id)) throw new Error('Missing required v5 room/background UI: ' + id);
}
if (!html.includes('background.js') || !html.includes('ui.js')) throw new Error('Missing background or tab script');
if (!css.includes('v5.2 opt-in background options') || !js.includes('bg_test_push')) throw new Error('Missing styles or background handlers');
if (!fs.existsSync('sw.js')) throw new Error('Missing push service worker');
console.log('Passed: v5 room, tabs, chat and opt-in background UI are present.');
console.log('Cloudflare was NOT contacted and production was NOT deployed.');
