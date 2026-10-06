// Cloudflare Worker: videa z R2 (bucket brand-media, klíče "video/<soubor>") + ochrana proti cizím webům.
// Vše ostatní obslouží statické soubory (run_worker_first v wrangler.jsonc posílá sem jen /video/*).
// Stejný soubor je ve WEBINFO i WEBOS (cf/worker.js) – měň oba.

const PREFIXES = ['/video/', '/obsah/video/']; // WEBINFO: /video/…, WEBOS: /obsah/video/…

// Kdo smí videa načítat: stránka na stejném hostu + ALLOWED_HOSTS (čárkami) + localhost. Bez Referer/Origin = povoleno (přímý odkaz, přehrávače).
function allowed(request, env, host) {
  const src = request.headers.get('origin') || request.headers.get('referer');
  if (!src) return true;
  let h;
  try { h = new URL(src).hostname; } catch { return false; }
  const extra = (env.ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
  return h === host || h === 'localhost' || extra.some(e => h === e || h.endsWith('.' + e));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = PREFIXES.find(p => url.pathname.startsWith(p));
    if (!prefix) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    if (!allowed(request, env, url.hostname)) return new Response('Forbidden', { status: 403 });

    const key = 'video/' + decodeURIComponent(url.pathname.slice(prefix.length));
    const obj = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
    if (!obj) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'public, max-age=86400');
    if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers }); // onlyIf (If-None-Match) splnilo
    let status = 200;
    if (obj.range) {
      const start = obj.range.offset ?? obj.size - obj.range.suffix;
      const len = obj.range.length ?? obj.range.suffix ?? obj.size - start;
      headers.set('content-range', `bytes ${start}-${start + len - 1}/${obj.size}`);
      headers.set('content-length', String(len));
      status = 206;
    } else headers.set('content-length', String(obj.size));
    return new Response(request.method === 'HEAD' ? null : obj.body, { status, headers });
  },
};
