// Záznamník záseků (jen DEV, běží pořád, i bez ?prof=1). Každý snímek si levně zapíše: interval od
// minulého snímku, CPU čas R3F snímku, čas strávený ve WebGL voláních, která blokují hlavní vlákno
// (kompilace shaderů = čekání na link, upload textur/bufferů, readPixels/finish), a události kolem
// (mark() z kódu: přepnutí projektu, GPGPU, video…, kolečko myši). Když snímek trvá výrazně déle než
// obvykle, po chvíli sestaví zprávu: snímky kolem záseku + co se v nich dělo + Long Animation Frames
// (skripty ≥ 50 ms) + GPU čas snímků (když běží ?prof=1) + vzorky JS profileru (když ?jsprof=1).
// Zprávy: debug_logs/hitch_*.log (+ latest_hitch.log), v konzoli window.__hitches.
import { prof } from './GpuProfiler';

const RING = 600;
const HITCH_MIN = 14;      // ms – kratší interval se nikdy nehlásí (165 Hz = 6,06 ms, 60 Hz = 16,7 ms)
const HITCH_FACTOR = 2.2;  // … a musí být aspoň tolikrát delší než medián posledních snímků

const rec = new Array(RING);
let n = 0;
let cur = null;
let prevStart = 0, prevEnd = 0;
let wheel = 0, pointer = 0;
const marks = [];
const loaf = [];
let renderer = null;
let pending = null;
let lastReport = 0;
let jsProfiler = null, jsProfilerInfo = 'vypnuto (?jsprof=1)';
let sessionId = '';
const hitches = [];
const cumSelf = new Map(), cumIncl = new Map(); // součet vzorků JS profileru přes všechny záseky relace
let cumSamples = 0, cumIdle = 0;

const gl = { compileMs: 0, links: 0, uploadMs: 0, uploadBytes: 0, uploads: 0, bufMs: 0, bufBytes: 0, syncMs: 0, big: [] };
function snapGl() {
  const s = { ...gl, big: gl.big };
  gl.compileMs = 0; gl.links = 0; gl.uploadMs = 0; gl.uploadBytes = 0; gl.uploads = 0; gl.bufMs = 0; gl.bufBytes = 0; gl.syncMs = 0; gl.big = [];
  return s;
}

// Značka události (zobrazí se ve zprávě o záseku, pokud nastala poblíž)
export function mark(text) {
  if (!import.meta.env.DEV) return;
  marks.push({ t: performance.now(), text });
  if (marks.length > 400) marks.shift();
}

function bytesOf(name, a) {
  if (name === 'texStorage2D') return (a[3] || 0) * (a[4] || 0) * 4;
  for (let i = a.length - 1; i >= 0; i--) {
    const v = a[i];
    if (v == null || typeof v !== 'object') continue;
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v.byteLength;
    if (v.videoWidth) return v.videoWidth * v.videoHeight * 4;
    if (v.width && v.height) return v.width * v.height * 4;
  }
  // texImage2D(…, width, height, border, format, type, null) = jen alokace
  if (name === 'texImage2D' && a.length >= 9 && typeof a[3] === 'number') return a[3] * a[4] * 4;
  return 0;
}

function wrapGl(ctx) {
  if (ctx.__probeWrapped) return;
  ctx.__probeWrapped = true;
  const timed = (name, done) => {
    const orig = ctx[name];
    if (typeof orig !== 'function') return;
    ctx[name] = function () {
      const t = performance.now();
      const r = orig.apply(ctx, arguments);
      done(performance.now() - t, arguments, name);
      return r;
    };
  };
  // Chrome kompiluje shader v GPU procesu asynchronně; hlavní vlákno čeká až na první dotaz na program
  // (three.js se ptá hned kvůli kontrole chyb a lokacím uniforem) -> tady je vidět skutečné čekání.
  ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'getActiveAttrib',
    'getActiveUniform', 'getUniformLocation', 'getAttribLocation', 'getUniformBlockIndex', 'compileShader']
    .forEach((nm) => timed(nm, (dt) => { gl.compileMs += dt; }));
  timed('linkProgram', (dt) => { gl.links++; gl.compileMs += dt; });
  ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'compressedTexImage2D', 'generateMipmap']
    .forEach((nm) => timed(nm, (dt, a, name) => {
      const b = bytesOf(name, a);
      gl.uploadMs += dt; gl.uploadBytes += b; gl.uploads++;
      if (dt > 1) gl.big.push(`${name} ${(b / 1048576).toFixed(1)} MB ${dt.toFixed(1)} ms`);
    }));
  ['bufferData', 'bufferSubData'].forEach((nm) => timed(nm, (dt, a, name) => {
    const b = bytesOf(name, a);
    gl.bufMs += dt; gl.bufBytes += b;
    if (dt > 1) gl.big.push(`${name} ${(b / 1048576).toFixed(1)} MB ${dt.toFixed(1)} ms`);
  }));
  ['readPixels', 'finish', 'clientWaitSync', 'getBufferSubData'].forEach((nm) => timed(nm, (dt, a, name) => {
    gl.syncMs += dt;
    if (dt > 0.5) gl.big.push(`${name} ${dt.toFixed(1)} ms`);
  }));
}

function startJsProfiler() {
  if (typeof window === 'undefined' || !('Profiler' in window)) { jsProfilerInfo = 'Profiler API v prohlížeči chybí'; return; }
  try {
    jsProfiler = new window.Profiler({ sampleInterval: 1, maxBufferSize: 200000 });
    jsProfilerInfo = `běží, vzorek po ${jsProfiler.sampleInterval} ms`;
  } catch (e) {
    jsProfiler = null;
    jsProfilerInfo = `nešel spustit (${e.message}) – chybí hlavička Document-Policy: js-profiling? (restart dev serveru)`;
  }
}

export const probe = {
  attach(r) {
    if (!import.meta.env.DEV || renderer === r) return;
    renderer = r;
    wrapGl(r.getContext());
    const d = new Date(), p = (x) => String(x).padStart(2, '0');
    sessionId = `hitch_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    window.addEventListener('wheel', () => { wheel++; }, { passive: true, capture: true });
    window.addEventListener('pointermove', () => { pointer++; }, { passive: true, capture: true });
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) { loaf.push(e); if (loaf.length > 80) loaf.shift(); }
      }).observe({ type: 'long-animation-frame', buffered: true });
    } catch { /* starší prohlížeč: bez LoAF */ }
    if (new URLSearchParams(window.location.search).get('jsprof') === '1') startJsProfiler();
    window.__hitches = hitches;
    window.__probe = {
      mark, get frames() { return lastFrames(120); }, get info() { return { jsProfiler: jsProfilerInfo, n }; },
      // souhrn vzorků JS profileru ze všech záseků relace (jeden zásek má při 16 ms/vzorek jen pár vzorků)
      jsTop(k = 25) {
        const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([fn, c]) => `${String(c).padStart(5)}  ${fn}`).join('\n');
        return `vzorků ${cumSamples}, nečinné ${cumIdle}\n--- vlastní čas ---\n${top(cumSelf)}\n--- včetně volaných ---\n${top(cumIncl)}`;
      },
      jsReset() { cumSelf.clear(); cumIncl.clear(); cumSamples = 0; cumIdle = 0; },
    };
  },
  frameBegin() {
    if (!renderer) return;
    const now = performance.now();
    cur = {
      t: now, dt: prevStart ? now - prevStart : 0, gap: prevEnd ? now - prevEnd : 0,
      out: snapGl(), wheel, pointer, pf: prof.frameId,
    };
    wheel = 0; pointer = 0;
  },
  frameEnd() {
    if (!cur) return;
    const now = performance.now();
    cur.cpu = now - cur.t;
    cur.in = snapGl();
    const info = renderer.info;
    cur.programs = info.programs ? info.programs.length : 0;
    cur.tex = info.memory.textures;
    cur.geo = info.memory.geometries;
    rec[n % RING] = cur;
    n++;
    prevStart = cur.t;
    prevEnd = now;
    detect(cur);
    cur = null;
  },
};

function lastFrames(k) {
  const out = [];
  for (let i = Math.max(0, n - k); i < n; i++) out.push(rec[i % RING]);
  return out;
}

function medianDt() {
  const a = [];
  for (let i = Math.max(1, n - 121); i < n - 1; i++) a.push(rec[i % RING].dt);
  if (!a.length) return 6;
  a.sort((x, y) => x - y);
  return a[a.length >> 1];
}

function detect(f) {
  if (f.dt < HITCH_MIN || n < 30) return;
  const med = medianDt();
  if (f.dt < med * HITCH_FACTOR) return;
  if (!pending) {
    pending = { first: n - 1, last: n - 1, med };
    setTimeout(flush, 700);
  } else {
    pending.last = n - 1;
  }
}

const f1 = (v) => (v == null ? '   –' : v.toFixed(1).padStart(5));
const mb = (b) => (b / 1048576).toFixed(1);

// Řádek = jeden interval mezi začátky dvou snímků. Práce v něm = R3F snímek předchozího záznamu
// (jeho JS + WebGL volání) + to, co proběhlo mezi snímky (WebGL volání mimo R3F, např. v React efektech).
function frameLine(f, prev, isHitch) {
  const g = prev ? prof.gpuOfFrame(prev.pf) : null;
  const w = [];
  const sum = (k) => (prev?.in?.[k] || 0) + (f.out?.[k] || 0);
  if (sum('compileMs') > 0.3 || sum('links')) w.push(`shadery ${sum('compileMs').toFixed(1)} ms (${sum('links')} link)`);
  if (sum('uploadMs') > 0.3) w.push(`upload textur ${sum('uploadMs').toFixed(1)} ms ${mb(sum('uploadBytes'))} MB`);
  if (sum('bufMs') > 0.3) w.push(`buffery ${sum('bufMs').toFixed(1)} ms ${mb(sum('bufBytes'))} MB`);
  if (sum('syncMs') > 0.3) w.push(`sync ${sum('syncMs').toFixed(1)} ms`);
  const big = [...(prev?.in?.big || []), ...(f.out?.big || []).map((x) => `mimo snímek: ${x}`)];
  const js = prev ? prev.cpu : null;
  const other = prev ? f.dt - prev.cpu : null;
  return `${isHitch ? '>>' : '  '} ${f1(f.dt)} ms | R3F snímek ${f1(js)} | mimo R3F ${f1(other)} | GPU ${f1(g)} | kolečko ${f.wheel} myš ${f.pointer} | programů ${f.programs} tex ${f.tex} geo ${f.geo}`
    + (w.length ? `\n        ${w.join(' | ')}` : '')
    + (big.length ? `\n        ${big.slice(0, 6).join('; ')}` : '');
}

function fileOf(url) {
  if (!url) return '';
  return String(url).split('/').pop().split('?')[0];
}

async function jsSamples(t0, t1) {
  if (!jsProfiler) return null;
  let trace;
  try { trace = await jsProfiler.stop(); } catch (e) { return `JS profiler: ${e.message}`; }
  startJsProfiler();
  const self = new Map(), incl = new Map(), markers = new Map();
  let total = 0, idle = 0;
  const name = (fr) => `${fr.name || '(anonymní)'} ${fileOf(trace.resources[fr.resourceId])}:${fr.line ?? ''}`;
  for (const s of trace.samples) {
    if (s.timestamp < t0 || s.timestamp > t1) continue;
    total++;
    if (s.marker) markers.set(s.marker, (markers.get(s.marker) || 0) + 1);
    cumSamples++;
    if (s.stackId == null) { idle++; cumIdle++; continue; }
    const seen = new Set();
    let sid = s.stackId, top = true;
    while (sid != null) {
      const st = trace.stacks[sid];
      const key = name(trace.frames[st.frameId]);
      if (top) { self.set(key, (self.get(key) || 0) + 1); cumSelf.set(key, (cumSelf.get(key) || 0) + 1); top = false; }
      if (!seen.has(key)) { incl.set(key, (incl.get(key) || 0) + 1); cumIncl.set(key, (cumIncl.get(key) || 0) + 1); seen.add(key); }
      sid = st.parentId;
    }
  }
  if (!total) return 'JS profiler: žádné vzorky v okně záseku';
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
    .map(([fn, c]) => `      ${String(c).padStart(4)}× ${fn}`).join('\n');
  return `JS profiler (${jsProfiler?.sampleInterval ?? '?'} ms/vzorek): ${total} vzorků, nečinné ${idle}`
    + (markers.size ? ` | ${[...markers.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}` : '')
    + `\n    vlastní čas (kde přesně):\n${top(self, 12)}\n    včetně volaných (kdo to spustil):\n${top(incl, 12)}`;
}

async function flush() {
  const p = pending;
  pending = null;
  if (!p) return;
  const now = performance.now();
  const from = Math.max(0, p.first - 6, n - RING + 1);
  const to = Math.min(n - 1, p.last + 3);
  const fs = [];
  for (let i = from; i <= to; i++) fs.push({ f: rec[i % RING], i });
  const hitchFrames = fs.filter(({ i }) => i >= p.first && i <= p.last && rec[i % RING].dt >= Math.max(HITCH_MIN, p.med * HITCH_FACTOR));
  const t0 = fs[0].f.t - 50;
  const t1 = rec[p.last % RING].t + 20;
  const worst = Math.max(...hitchFrames.map(({ f }) => f.dt));
  const lines = [];
  const clock = new Date(performance.timeOrigin + rec[p.first % RING].t).toLocaleTimeString('cs-CZ', { hour12: false }) + '.' + String(Math.floor((performance.timeOrigin + rec[p.first % RING].t) % 1000)).padStart(3, '0');
  lines.push(`=== ZÁSEK ${clock}  nejhorší ${worst.toFixed(1)} ms (medián ${p.med.toFixed(1)} ms, ${hitchFrames.length} dlouhých snímků)  focus ${document.hasFocus()}  ${window.innerWidth}x${window.innerHeight}`);
  lines.push('  intervaly mezi snímky (>> = zásek): R3F snímek = JS useFrame + render předchozího snímku, mimo R3F = React, události, GC, čekání na GPU/vsync');
  fs.forEach(({ f, i }) => lines.push(frameLine(f, i > 0 ? rec[(i - 1) % RING] : null, hitchFrames.some((h) => h.i === i))));
  const ms = marks.filter((m) => m.t >= t0 - 1500 && m.t <= t1 + 100);
  if (ms.length) {
    lines.push('  události (čas vůči začátku prvního dlouhého snímku):');
    const ref = rec[p.first % RING].t;
    ms.forEach((m) => lines.push(`    ${(m.t - ref).toFixed(0).padStart(6)} ms  ${m.text}`));
  }
  const lf = loaf.filter((e) => e.startTime + e.duration >= t0 - 100 && e.startTime <= t1);
  if (lf.length) {
    lines.push('  Long Animation Frames (≥ 50 ms na hlavním vlákně):');
    lf.forEach((e) => {
      lines.push(`    ${e.duration.toFixed(0)} ms (blokující ${Math.round(e.blockingDuration ?? 0)} ms, styl+layout ${Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0)} ms)`);
      (e.scripts || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 6).forEach((s) => {
        lines.push(`      ${s.duration.toFixed(0).padStart(4)} ms  ${s.invokerType || ''} ${s.invoker || ''} → ${s.sourceFunctionName || '?'} ${fileOf(s.sourceURL)}${s.forcedStyleAndLayoutDuration > 1 ? ` (vynucený layout ${s.forcedStyleAndLayoutDuration.toFixed(0)} ms)` : ''}`);
      });
    });
  }
  const js = await jsSamples(t0, t1 + 10);
  if (js) lines.push('  ' + js);
  else lines.push(`  JS profiler: ${jsProfilerInfo}`);
  const text = lines.join('\n');
  hitches.push(text);
  if (hitches.length > 30) hitches.shift();
  lastReport = now;
  fetch('/api/debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, kind: 'hitch', text: `${text}\n  (klient ${navigator.userAgent.match(/(Chrome|Claude)\/[\d.]+/g)?.join(' ') || navigator.userAgent})\n` }),
  }).catch(() => {});
}
