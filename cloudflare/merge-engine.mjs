/*
 * Pure, offline, fail-closed source merger. It never reads tokens or connects
 * to Cloudflare. A dedicated /ling-bg route preserves every existing root
 * chat request unchanged.
 */
export function mergeWorkerSource(source) {
  if (typeof source !== 'string' || source.length < 100) throw Error('No valid Worker source');
  if (source.includes('handleLingBackground') || source.includes('runLingBackground'))
    throw Error('Background code appears already installed');
  if ((source.match(/export\s+default\s*\{/g) || []).length !== 1)
    throw Error('Unknown Worker entry point: review by hand before integration');
  const original = source.replace(/export\s+default\s*\{/, 'const __lingOriginalWorker = {');
  const bgWrapper = [
    'export default {',
    '  ...__lingOriginalWorker,',
    '  async fetch(request, env, ctx) {',
    '    const path = new URL(request.url).pathname;',
    "    if (path === '/ling-bg') {",
    "      if (request.method === 'OPTIONS') {",
    "        if (request.headers.get('Origin') !== 'https://yi0119-hub.github.io')",
    "          return new Response(null, {status:403});",
    "        if (request.headers.get('Access-Control-Request-Method') !== 'POST')",
    "          return new Response(null, {status:405});",
    "        return new Response(null, {status:204,headers:{",
    "          'Access-Control-Allow-Origin':'https://yi0119-hub.github.io',",
    "          'Access-Control-Allow-Methods':'POST, OPTIONS',",
    "          'Access-Control-Allow-Headers':'content-type,x-ling-access-code',",
    "          'Access-Control-Max-Age':'600','Vary':'Origin'",
    "        }});",
    '      }',
    "      if (request.method !== 'POST') return new Response(null, {status:405});",
    '      return handleLingBackground(request, env);',
    '    }',
    '    return __lingOriginalWorker.fetch(request, env, ctx);',
    '  },',
    '  async scheduled(controller, env, ctx) {',
    "    if (['*/10 * * * *', '0 12 * * *'].includes(controller.cron))",
    '      ctx.waitUntil(runLingBackground(controller.cron, env));',
    "    if (typeof __lingOriginalWorker.scheduled === 'function')",
    '      return __lingOriginalWorker.scheduled(controller, env, ctx);',
    '  }',
    '};'
  ].join('\n');
  return [
    "import {handleLingBackground, runLingBackground} from '../ling-background-addon.js';",
    original, bgWrapper
  ].join('\n\n');
}

