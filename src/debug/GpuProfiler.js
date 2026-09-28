// GPU profiler scény (jen DEV): kolik milisekund GPU stojí každý průchod a každý objekt.
// Měří EXT_disjoint_timer_query_webgl2 = čas na grafické kartě, nezávislý na vsyncu, fps zámku
// i na tom, jestli má okno focus (na rozdíl od fps). Zapnutí: ?prof=1 v URL, klávesa F9, nebo
// window.__prof.on(). Vypnuto = renderer se vůbec nepatchuje -> nulová cena.
//
// Jak to funguje: WebGLRenderer.renderBufferDirect (= každý draw call) se obalí a při změně
// "štítku" se ukončí jeden timer query a začne další. Štítek = aktivní scope (prof.scope('fluid'))
// nebo jméno objektu / materiálu + cílový render target. Výsledky chodí z GPU o pár snímků později.
// Každou sekundu vznikne snímek statistik (window.__prof.last) a odešle se do debug_logs/profile_*.log.

const ext = { t: null };
const state = {
  on: false,
  gl: null,        // THREE.WebGLRenderer
  ctx: null,       // WebGL2RenderingContext
  label: null,     // štítek aktivního query
  query: null,
  pending: [],     // { q, label, frame }
  free: [],
  scopes: [],
  frame: 0,
  acc: new Map(),  // label -> { gpu ns, draws, tris, cpu ms }
  accFrames: 0,
  cpuFrame: 0, cpuFrameStart: 0, cpuFrames: [],
  rafTimes: [], lastRaf: 0,
  windowStart: 0,
  targetNames: new WeakMap(),
  last: null,
  frameGpu: new Map(), // id snímku -> ns na GPU (pro záznam záseků, FrameProbe.js)
  listeners: new Set(),
  disjoint: 0,
  mode: 'off',
  sessionId: '',
};

function targetLabel(rt) {
  if (!rt) return 'screen';
  const n = state.targetNames.get(rt) || rt.texture?.name;
  if (n) return n;
  return `RT ${rt.width}x${rt.height}`;
}

function objectLabel(object, material) {
  let o = object, name = '';
  for (let i = 0; o && i < 4; i++, o = o.parent) {
    if (o.name) { name = o.name; break; }
  }
  const m = material?.name || '';
  if (name && m) return `${name} [${m}]`;
  if (name) return name;
  if (m) return m;
  return `${material?.type || '?'} (${object?.type || '?'})`;
}

function switchTo(label) {
  if (label === state.label) return;
  const gl = state.ctx, T = ext.t;
  if (state.query) {
    gl.endQuery(T.TIME_ELAPSED_EXT);
    state.pending.push({ q: state.query, label: state.label, frame: state.frame });
    state.query = null;
  }
  state.label = label;
  if (label == null) return;
  const q = state.free.pop() || gl.createQuery();
  gl.beginQuery(T.TIME_ELAPSED_EXT, q);
  state.query = q;
}

function bucket(label) {
  let b = state.acc.get(label);
  if (!b) { b = { gpu: 0, draws: 0, tris: 0, samples: 0 }; state.acc.set(label, b); }
  return b;
}

function poll() {
  const gl = state.ctx;
  // disjoint = GPU změnila takt / přerušení -> výsledky z tohoto okna zahodit
  if (gl.getParameter(ext.t.GPU_DISJOINT_EXT)) { state.disjoint++; }
  while (state.pending.length) {
    const p = state.pending[0];
    if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
    const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT);
    state.pending.shift();
    state.free.push(p.q);
    const b = bucket(p.label);
    b.gpu += ns;
    b.samples++;
    state.frameGpu.set(p.frame, (state.frameGpu.get(p.frame) || 0) + ns);
    if (state.frameGpu.size > 1200) state.frameGpu.delete(state.frameGpu.keys().next().value);
  }
  // pojistka: GPU nestíhá vracet (neměl by nastat) -> nehromadit query donekonečna
  if (state.pending.length > 4000) {
    state.pending.splice(0, state.pending.length - 2000).forEach((p) => gl.deleteQuery(p.q));
  }
}

function frameBegin() {
  if (!state.on) return;
  const now = performance.now();
  if (state.lastRaf) state.rafTimes.push(now - state.lastRaf);
  state.lastRaf = now;
  state.cpuFrameStart = now;
  state.frame++;
  poll();
  switchTo('(mimo draw: clear, upload, ostatní)');
}

function frameEnd() {
  if (!state.on) return;
  switchTo(null);
  state.cpuFrames.push(performance.now() - state.cpuFrameStart);
  state.accFrames++;
  const now = performance.now();
  if (now - state.windowStart >= 1000) publish(now);
}

function publish(now) {
  const frames = Math.max(1, state.accFrames);
  const rows = [];
  let total = 0;
  state.acc.forEach((b, label) => {
    const gpu = b.gpu / 1e6 / frames;
    total += gpu;
    rows.push({ label, gpu, draws: b.draws / frames, tris: b.tris / frames });
  });
  rows.sort((a, b) => b.gpu - a.gpu);
  const sorted = [...state.rafTimes].sort((a, b) => a - b);
  const avgRaf = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
  const cpu = state.cpuFrames.reduce((a, b) => a + b, 0) / Math.max(1, state.cpuFrames.length);
  state.last = {
    time: new Date().toLocaleTimeString(),
    fps: avgRaf > 0 ? 1000 / avgRaf : 0,
    frameMs: avgRaf,
    frameP99: sorted[Math.floor(sorted.length * 0.99)] || 0,
    gpuMs: total,
    cpuMs: cpu,
    frames,
    disjoint: state.disjoint,
    size: state.gl ? `${state.gl.domElement.width}x${state.gl.domElement.height}` : '',
    focus: typeof document !== 'undefined' ? document.hasFocus() : null,
    rows,
  };
  state.acc.clear();
  state.accFrames = 0;
  state.rafTimes = [];
  state.cpuFrames = [];
  state.disjoint = 0;
  state.windowStart = now;
  state.listeners.forEach((fn) => fn(state.last));
  sendToDisk(state.last);
}

let lastSend = 0;
function sendToDisk(snap) {
  if (!import.meta.env.DEV) return;
  const now = performance.now();
  if (now - lastSend < 2000) return;
  lastSend = now;
  fetch('/api/debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId, kind: 'profile', userAgent: navigator.userAgent, profile: snap }),
  }).catch(() => {});
}

let orig = null;
function patch(renderer) {
  if (orig) return;
  orig = { rbd: renderer.renderBufferDirect, render: renderer.render, clear: renderer.clear };
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const scope = state.scopes.length ? state.scopes[state.scopes.length - 1] : null;
    const label = scope ? `${scope} › ${objectLabel(object, material)}` : `${objectLabel(object, material)} @ ${targetLabel(renderer.getRenderTarget())}`;
    switchTo(label);
    const b = bucket(label);
    b.draws++;
    const idx = geometry.index ? geometry.index.count : (geometry.attributes.position?.count || 0);
    const inst = object.isInstancedMesh ? object.count : (geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1);
    if (object.isMesh) b.tris += (idx / 3) * (Number.isFinite(inst) ? inst : 1);
    return orig.rbd.apply(this, arguments);
  };
  renderer.clear = function () {
    const scope = state.scopes.length ? state.scopes[state.scopes.length - 1] : null;
    switchTo(`clear @ ${scope || targetLabel(renderer.getRenderTarget())}`);
    return orig.clear.apply(this, arguments);
  };
}

function unpatch() {
  if (!orig || !state.gl) return;
  state.gl.renderBufferDirect = orig.rbd;
  state.gl.clear = orig.clear;
  orig = null;
}

export const prof = {
  get on() { return state.on; },
  get mode() { return state.mode; },
  get last() { return state.last; },
  get frameId() { return state.on ? state.frame : -1; },
  // GPU ms daného snímku (null = profiler neběžel nebo výsledek ještě nedorazil)
  gpuOfFrame(id) { const ns = state.frameGpu.get(id); return ns == null ? null : ns / 1e6; },
  // Pojmenování render targetu pro tabulku (volitelné, jinak "RT WxH")
  nameTarget(rt, name) { if (rt) state.targetNames.set(rt, name); return rt; },
  // Scope = všechny draw cally uvnitř dostanou prefix (např. 'fluid'). Vždy párovat s end().
  scope(name) { if (state.on) state.scopes.push(name); },
  end() { if (state.on) state.scopes.pop(); },
  subscribe(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); },
  attach(renderer) {
    state.gl = renderer;
    state.ctx = renderer.getContext();
  },
  enable() {
    if (state.on || !state.gl) return state.mode;
    ext.t = ext.t || state.ctx.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext.t) { state.mode = 'bez EXT_disjoint_timer_query_webgl2 (prohlížeč ho neposkytuje)'; return state.mode; }
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    state.sessionId = `profile_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    patch(state.gl);
    state.on = true;
    state.mode = 'gpu-timer';
    state.windowStart = performance.now();
    state.lastRaf = 0;
    return state.mode;
  },
  disable() {
    if (!state.on) return;
    switchTo(null);
    state.on = false;
    state.scopes.length = 0;
    unpatch();
    state.mode = 'off';
    state.listeners.forEach((fn) => fn(state.last));
  },
  toggle() { return state.on ? this.disable() : this.enable(); },
  frameBegin, frameEnd,
  // Textová tabulka (pro konzoli / log)
  table(snap = state.last) {
    if (!snap) return '(zatím nic – profiler musí běžet aspoň 1 s)';
    const lines = [
      `${snap.time}  fps ${snap.fps.toFixed(1)} (snímek ${snap.frameMs.toFixed(2)} ms, p99 ${snap.frameP99.toFixed(2)} ms)  GPU ${snap.gpuMs.toFixed(2)} ms  CPU(JS render) ${snap.cpuMs.toFixed(2)} ms  canvas ${snap.size}  focus ${snap.focus}  disjoint ${snap.disjoint}`,
    ];
    snap.rows.forEach((r) => lines.push(`${r.gpu.toFixed(3).padStart(7)} ms  ${String(Math.round(r.draws)).padStart(3)}×  ${(r.tris / 1e3).toFixed(0).padStart(6)}k tri  ${r.label}`));
    return lines.join('\n');
  },
};

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__prof = {
    on: () => prof.enable(), off: () => prof.disable(), toggle: () => prof.toggle(),
    get last() { return prof.last; }, table: () => prof.table(), get mode() { return prof.mode; },
  };
}
