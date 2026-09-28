import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getFluid } from './components/particles/ParticleFluid';
import { particleSystems } from './components/particles/utils';
import { portalFx } from './PortalTransition';

// Jádro DNA (ORBIT): skleněná „páteř“ UVNITŘ obou vláken šroubovice – skleněné destičky stočené kolem
// středové linky vlákna + energetická nit s pulzy. Schovaná v particlech; ukáže se jen tam, odkud
// particly odletěly, a zhasne dřív, než se úplně vrátí (Oliver: „musí to stihnout, jinak není vidět, že mizí“).
//
// Středová linka: šroubovice nafitovaná z DNA cílů particlů (vlákna = pás na r ≈ 1,6, příčky přes střed se
// ignorují). Změřeno 2026-09-28: R 1,599, θ = 9,373 + 0,4963·y (atan2(z,x)), druhé vlákno +π, odchylka < 3°.
// Geometrie je v „prostoru šroubovice“ (y, vlákno, úhel) -> pozici počítá vertex shader, fit = jen uniformy.
//
// Odhalení: každý snímek (jen když se voda hýbe / particly se vracejí) se všechny DNA particly vykreslí jako
// body do malé textury REVEAL_BINS × 2 (úseky podél vlákna × vlákno): R += „odletěl“ (smoothstep vzdálenosti
// od domova), G += 1. Páteř v úseku = smoothstep(podíl odletěných). Při návratu podíl klesá -> páteř zhasne
// dřív, než jsou particly doma. Config `dnaCore`, DEV `window.__coreOverride`, `window.__dnaCore` (stav).

export const DNA_CORE_DEFAULTS = {
  enabled: true,
  rest: 0,            // viditelnost v klidu (0 = jen kde particly odletěly)
  intensity: 1.4,
  color: '#b8f2ff',   // energie (nit, pulzy, světlo v hranách skla)
  glass: '#c4d6e0',
  glassOpacity: 1,
  width: 0.22,        // world – šířka destičky (vlákno particlů má poloměr ~0,15–0,2; 0,22 je v klidu ještě schovaná)
  depth: 0.05,
  thick: 0.014,
  spacing: 0.06,      // world Y – rozestup destiček
  spin: 2.2,          // rad / world Y – stočení destiček kolem vlákna
  threadRadius: 0.006,
  glowRadius: 0.035,
  pulseSpeed: 2.2,    // world/s – pulzy tečou dolů
  pulseGap: 5,
  // odhalení podle particlů
  band: 0.4,          // world – particl patří k vláknu, když má domov blíž než tohle od středové linky
  awayMin: 0.06,      // world – odchylka od domova, od které se particl počítá jako „odletěl“ ...
  awayMax: 0.25,      // ... naplno (vyšší = páteř zhasne dřív, než jsou particly doma)
  revealFrom: 0.1,    // podíl odletěných v úseku, od kterého se páteř ukazuje ...
  revealFull: 0.35,   // ... a kdy je vidět naplno
  settle: 4,          // s po posledním pohybu vody, kdy se odhalení ještě počítá (particly se vracejí)
  // obálka rozvíření z rychlosti myši – už jen pro útlum god rays (VolumetricLight)
  stirMin: 0.03,
  stirMax: 0.6,
  attack: 0.35,
  hold: 0.6,
  release: 0.35,
};

const HELIX_DEFAULT = { th0: 9.3727, k: 0.4963, R: 1.599, yMin: -21.5, yMax: 6 };
const REVEAL_BINS = 256;

export const dnaStir = { value: 0, hold: 0 };

const HELIX_GLSL = /* glsl */`
  uniform vec4 uHelix;      // th0, k, R, -
  uniform vec2 uYRange;
  uniform sampler2D tReveal;
  uniform vec4 uRevealP;    // revealFrom, revealFull, rest, texel x
  void helixFrame(float y, float s, out vec3 C, out vec3 T, out vec3 N, out vec3 B) {
    float th = uHelix.x + uHelix.y * y + s * 3.14159265;
    vec2 cs = vec2(cos(th), sin(th));
    C = vec3(uHelix.z * cs.x, y, uHelix.z * cs.y);
    N = vec3(cs.x, 0.0, cs.y);
    T = normalize(vec3(-uHelix.z * uHelix.y * cs.y, 1.0, uHelix.z * uHelix.y * cs.x));
    B = normalize(cross(T, N));
  }
  float revealAt(float y, float s) {
    float x = (y - uYRange.x) / (uYRange.y - uYRange.x);
    float v = s < 0.5 ? 0.25 : 0.75;
    float o = uRevealP.w * 1.5;
    vec4 m = texture2D(tReveal, vec2(x, v)) + 0.5 * (texture2D(tReveal, vec2(x - o, v)) + texture2D(tReveal, vec2(x + o, v)));
    // úseky s málo particly (konce vláken) necitlivé – jeden odtržený particl by tam držel páteř viditelnou
    float f = m.x / max(m.y, 48.0);
    return max(smoothstep(uRevealP.x, uRevealP.y, f), uRevealP.z);
  }
`;

const PULSE_GLSL = /* glsl */`
  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseGap;
  float h11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
  // pulzy tekoucí po vlákně dolů: 2 vrstvy s různou rychlostí + drobné jiskření (elektrický proud)
  float pulses(float y) {
    float p = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float gap = uPulseGap * (1.0 + fk * 0.62);
      float s = (y + uTime * uPulseSpeed * (1.0 + fk * 0.45)) / gap + fk * 0.37;
      float cell = floor(s);
      float f = fract(s) - 0.5 + (h11(cell + fk * 17.0) - 0.5) * 0.5;
      float w = 0.018 + h11(cell * 3.1 + fk) * 0.03;
      p += exp(-f * f / w) * (0.55 + 0.45 * h11(cell * 7.7 + fk)) * step(0.25, h11(cell * 1.9 + fk * 5.0));
    }
    return p;
  }
  float flicker(float y) {
    float t = floor(uTime * 24.0);
    return 0.82 + 0.18 * h11(floor(y * 6.0) + t * 13.0);
  }
`;

// trubka po středové lince vlákna: position = (t podél 0..1, úhel kolem, vlákno)
const tubeVert = HELIX_GLSL + /* glsl */`
  uniform float uRadius;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying float vReveal;
  void main() {
    float y = mix(uYRange.x, uYRange.y, position.x);
    vec3 C, T, N, B;
    helixFrame(y, position.z, C, T, N, B);
    vec3 dir = cos(position.y) * N + sin(position.y) * B;
    vec3 wp = C + dir * uRadius;
    vN = dir;
    vV = normalize(cameraPosition - wp);
    vY = y;
    vReveal = revealAt(y, position.z);
    gl_Position = vReveal < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const tubeFrag = PULSE_GLSL + /* glsl */`
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uCoreness;   // 1 = tenká nit (ostrá), 0 = záře (měkká)
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying float vReveal;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float prof = mix(pow(facing, 3.0) * 0.35, pow(facing, 1.5), uCoreness);
    float e = (0.3 + pulses(vY) * 0.55) * flicker(vY);
    gl_FragColor = vec4(uColor * e * prof * vReveal * uIntensity, 1.0);
  }
`;

const tileVert = HELIX_GLSL + /* glsl */`
  attribute vec3 aHalf;
  attribute vec3 aInst;   // y, vlákno, stočení
  varying vec3 vP;        // pozice v destičce, -1..1 na každé ose
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying float vReveal;
  void main() {
    vec3 C, T, N, B;
    helixFrame(aInst.x, aInst.y, C, T, N, B);
    float cs = cos(aInst.z), sn = sin(aInst.z);
    vec3 W = cs * N + sn * B;
    vec3 D = -sn * N + cs * B;
    vec3 wp = C + W * position.x + T * position.y + D * position.z;
    vN = normalize(W * normal.x + T * normal.y + D * normal.z);
    vP = position / aHalf;
    vV = normalize(cameraPosition - wp);
    vY = aInst.x;
    vReveal = revealAt(aInst.x, aInst.y);
    gl_Position = vReveal < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

// skleněná destička: tmavé tělo, Fresnel lem, světlé hrany; hrany chytají světlo niti (víc u pulzu)
const tileFrag = PULSE_GLSL + /* glsl */`
  uniform vec3 uColor;
  uniform vec3 uGlass;
  uniform float uIntensity;
  uniform float uOpacity;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying float vReveal;
  void main() {
    vec3 a = abs(vP);
    // druhá největší souřadnice u 1 = hrana (dvě stěny se potkávají)
    float mx = max(a.x, max(a.y, a.z));
    float mn = min(a.x, min(a.y, a.z));
    float mid = a.x + a.y + a.z - mx - mn;
    float edge = smoothstep(0.72, 0.98, mid);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
    float p = pulses(vY);
    float nearAxis = 1.0 - smoothstep(0.0, 1.0, a.x);
    vec3 energy = uColor * (0.12 + p * 0.4) * (0.35 + 0.65 * nearAxis);
    // měkký odlesk shora (jako světlo „nebe“ v ORBITu) -> horní plochy destiček se lesknou
    float top = pow(max(normalize(vN).y, 0.0), 4.0);
    vec3 col = uGlass * (0.1 + fres * 0.6 + edge * 0.7 + top * 0.35) + energy * (0.5 + edge * 1.2 + fres * 0.5);
    float alpha = clamp(0.2 + fres * 0.45 + edge * 0.6 + top * 0.2 + p * 0.12, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col * uIntensity, alpha * vReveal);
  }
`;

// Akumulace odhalení: 1 bod na particl -> úsek vlákna podle DOMOVA (DNA cíle), R += odletěl, G += 1
const accVert = /* glsl */`
  attribute vec2 aUv;
  uniform sampler2D tPos;
  uniform sampler2D tDna;
  uniform vec4 uHelix;
  uniform vec2 uYRange;
  uniform vec4 uAcc;      // band, awayMin, awayMax, v klidu DNA (1/0)
  varying float vW;
  void main() {
    gl_PointSize = 1.0;
    vec4 dna = texture2D(tDna, aUv);
    vec4 p = texture2D(tPos, aUv);
    float th = uHelix.x + uHelix.y * dna.y;
    vec2 c0 = uHelix.z * vec2(cos(th), sin(th));
    float d0 = length(dna.xz - c0), d1 = length(dna.xz + c0);
    float x = (dna.y - uYRange.x) / (uYRange.y - uYRange.x);
    vW = smoothstep(uAcc.y, uAcc.z, length(p.xyz - dna.xyz));
    bool skip = dna.w <= 0.0 || min(d0, d1) > uAcc.x || x < 0.0 || x > 1.0 || uAcc.w < 0.5;
    gl_Position = skip ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(x * 2.0 - 1.0, d0 < d1 ? -0.5 : 0.5, 0.0, 1.0);
  }
`;
const accFrag = /* glsl */`
  varying float vW;
  void main() { gl_FragColor = vec4(vW, 1.0, 0.0, 1.0); }
`;

// Šroubovice z DNA cílů: vlákna = particly na vnějším plášti (r > 0,85 × p90), úhel osy vláken po řezech Y
// (zdvojený úhel spojí obě vlákna), lineární fit úhlu. Řídce (každý 5. particl) – běží jen při změně cílů.
function fitHelix(systems) {
  const pts = [];
  for (const c of systems) {
    const D = c.posVar.material.uniforms.tDnaPosition.value?.image?.data;
    if (!D) continue;
    for (let i = 0; i < D.length; i += 20) if (D[i + 3] > 0) pts.push(D[i], D[i + 1], D[i + 2]);
  }
  const n = pts.length / 3;
  if (n < 500) return null;
  const rs = new Float32Array(n);
  for (let i = 0; i < n; i++) rs[i] = Math.hypot(pts[i * 3], pts[i * 3 + 2]);
  const sorted = Float32Array.from(rs).sort();
  const rCut = sorted[Math.floor(n * 0.9)] * 0.85;
  let yMin = Infinity, yMax = -Infinity, rSum = 0, m = 0;
  for (let i = 0; i < n; i++) if (rs[i] > rCut) { const y = pts[i * 3 + 1]; yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); rSum += rs[i]; m++; }
  const dy = 0.25, nb = Math.max(1, Math.ceil((yMax - yMin) / dy));
  const acc = new Float32Array(nb * 3);
  for (let i = 0; i < n; i++) {
    if (rs[i] <= rCut) continue;
    const b = Math.min(nb - 1, Math.floor((pts[i * 3 + 1] - yMin) / dy));
    const a = 2 * Math.atan2(pts[i * 3 + 2], pts[i * 3]);
    acc[b * 3] += Math.cos(a); acc[b * 3 + 1] += Math.sin(a); acc[b * 3 + 2]++;
  }
  const ys = [], as = [];
  let prev = null;
  for (let b = 0; b < nb; b++) {
    if (acc[b * 3 + 2] < 8) continue;
    let a = Math.atan2(acc[b * 3 + 1], acc[b * 3]) / 2;
    if (prev !== null) { while (a - prev > Math.PI / 2) a -= Math.PI; while (a - prev < -Math.PI / 2) a += Math.PI; }
    prev = a; ys.push(yMin + (b + 0.5) * dy); as.push(a);
  }
  if (ys.length < 8) return null;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length, ma = as.reduce((s, v) => s + v, 0) / as.length;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < ys.length; i++) { sxy += (ys[i] - my) * (as[i] - ma); sxx += (ys[i] - my) ** 2; }
  const k = sxy / sxx;
  return { th0: ma - k * my, k, R: rSum / m, yMin, yMax };
}

function mergeCfg(appConfig) {
  const ov = import.meta.env.DEV ? window.__coreOverride : null;
  return { ...DNA_CORE_DEFAULTS, ...(appConfig?.dnaCore || {}), ...(ov || {}) };
}

function tubeGeometry(seg, rad) {
  const pos = [], idx = [];
  for (let s = 0; s < 2; s++) {
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= rad; j++) pos.push(i / seg, (j / rad) * Math.PI * 2, s);
    for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
      const a = base + i * (rad + 1) + j, b = a + rad + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function DnaCore({ appConfig }) {
  const { gl } = useThree();
  const groupRef = useRef(null);
  const st = useRef({ lastActive: -1e9, fitKey: '', ids: new WeakMap(), nextId: 1, cleared: true });
  const base = mergeCfg(appConfig);
  const geoKey = [base.width, base.depth, base.thick, base.spacing, base.spin].join(',');

  const shared = useMemo(() => ({
    uTime: { value: 0 }, uPulseSpeed: { value: 2 }, uPulseGap: { value: 3 }, uColor: { value: new THREE.Color() },
    uIntensity: { value: 1 },
    uHelix: { value: new THREE.Vector4(HELIX_DEFAULT.th0, HELIX_DEFAULT.k, HELIX_DEFAULT.R, 0) },
    uYRange: { value: new THREE.Vector2(HELIX_DEFAULT.yMin, HELIX_DEFAULT.yMax) },
    tReveal: { value: null },
    uRevealP: { value: new THREE.Vector4(0.06, 0.3, 0, 1 / REVEAL_BINS) },
  }), []);

  // akumulace odhalení (malý HalfFloat target, aditivně)
  const acc = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(REVEAL_BINS, 2, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
    });
    const mat = new THREE.ShaderMaterial({
      vertexShader: accVert, fragmentShader: accFrag,
      uniforms: { tPos: { value: null }, tDna: { value: null }, uHelix: shared.uHelix, uYRange: shared.uYRange, uAcc: { value: new THREE.Vector4() } },
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false, transparent: true,
    });
    return { rt, mat, scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, [shared]);
  shared.tReveal.value = acc.rt.texture;

  const parts = useMemo(() => {
    const c = base;
    const box = new THREE.BoxGeometry(c.width, c.thick, c.depth);
    const half = new Float32Array(box.attributes.position.count * 3);
    for (let i = 0; i < half.length; i += 3) { half[i] = c.width / 2; half[i + 1] = c.thick / 2; half[i + 2] = c.depth / 2; }
    box.setAttribute('aHalf', new THREE.BufferAttribute(half, 3));
    const tileGeo = new THREE.InstancedBufferGeometry().copy(box);
    box.dispose();
    // destičky v rozsahu 0..1 podél vlákna (y se dopočítá z uYRange -> fit nemění geometrii)
    const perStrand = Math.max(1, Math.round((HELIX_DEFAULT.yMax - HELIX_DEFAULT.yMin) / c.spacing));
    const inst = new Float32Array(perStrand * 2 * 3);
    for (let s = 0; s < 2; s++) for (let i = 0; i < perStrand; i++) {
      const o = (s * perStrand + i) * 3;
      inst[o] = (i + 0.5) / perStrand; inst[o + 1] = s; inst[o + 2] = 0;
    }
    tileGeo.setAttribute('aInstT', new THREE.InstancedBufferAttribute(inst, 3));
    tileGeo.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(inst.length), 3));
    tileGeo.instanceCount = perStrand * 2;
    const tileMat = new THREE.ShaderMaterial({
      vertexShader: tileVert, fragmentShader: tileFrag,
      uniforms: { ...shared, uGlass: { value: new THREE.Color() }, uOpacity: { value: 1 } },
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const tube = tubeGeometry(700, 8);
    const mkTube = (coreness) => new THREE.ShaderMaterial({
      vertexShader: tubeVert, fragmentShader: tubeFrag,
      uniforms: { ...shared, uCoreness: { value: coreness }, uRadius: { value: 0.01 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    return { tileGeo, tileMat, tube, threadMat: mkTube(1), glowMat: mkTube(0), instKey: '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, shared]);

  useEffect(() => () => {
    parts.tileGeo.dispose(); parts.tileMat.dispose(); parts.tube.dispose();
    parts.threadMat.dispose(); parts.glowMat.dispose();
  }, [parts]);
  useEffect(() => () => { acc.rt.dispose(); acc.mat.dispose(); }, [acc]);

  useFrame((state, delta) => {
    const c = mergeCfg(appConfig);
    const s = st.current;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    const now = performance.now() / 1000;
    const fl = getFluid(gl);
    const orbit = 1 - THREE.MathUtils.smoothstep(portalFx.progress, 0, 0.3);

    // obálka rozvíření z rychlosti tahu myši -> útlum god rays (VolumetricLight)
    {
      const sp = fl.velocity ? (fl.speed ?? 0) : 0;
      const target = THREE.MathUtils.smoothstep(sp, c.stirMin, c.stirMax) * orbit;
      if (target >= dnaStir.value) dnaStir.hold = c.hold;
      else dnaStir.hold -= dt;
      if (target >= dnaStir.value || dnaStir.hold <= 0) {
        const tau = target > dnaStir.value ? c.attack : c.release;
        dnaStir.value += (target - dnaStir.value) * (1 - Math.exp(-dt / Math.max(0.02, tau)));
        if (dnaStir.value < 1e-4) dnaStir.value = 0;
      }
    }

    // živé systémy (odložené k dispose už se nepočítají)
    const tickNow = performance.now();
    const live = [];
    for (const sys of particleSystems) if (!sys.disposed && tickNow - (sys.tick || 0) < 250) live.push(sys);

    // fit šroubovice při změně DNA cílů
    let key = '';
    for (const sys of live) {
      const w = sys.writtenData;
      if (w && !s.ids.has(w)) s.ids.set(w, s.nextId++);
      key += sys.size + ':' + (w ? s.ids.get(w) : 0) + ',';
    }
    if (key !== s.fitKey && live.length) {
      s.fitKey = key;
      const f = fitHelix(live);
      if (f) { shared.uHelix.value.set(f.th0, f.k, f.R, 0); shared.uYRange.value.set(f.yMin, f.yMax); }
      s.fit = f;
      if (import.meta.env.DEV) { s.rt = acc.rt; window.__dnaCore = s; }
    }

    if (fl.velocity) s.lastActive = now;
    const anyRest = live.some((sys) => sys.posVar.material.uniforms.uTransitionProgress.value < 0.001);
    const active = c.enabled && orbit > 0.001 && anyRest && (now - s.lastActive < c.settle || c.rest > 0);
    const g = groupRef.current;
    if (g) g.visible = active;
    if (!active) return;

    // 1) akumulace: kolik particlů každého úseku vlákna odletělo
    const prevRT = gl.getRenderTarget(), prevAuto = gl.autoClear;
    const col = gl.getClearColor(s.tmpCol || (s.tmpCol = new THREE.Color())), alpha = gl.getClearAlpha();
    gl.autoClear = false;
    gl.setRenderTarget(acc.rt);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    for (const sys of live) {
      const pu = sys.posVar.material.uniforms;
      if (!sys.spinePoints) {
        const n = sys.size * sys.size, uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uv[i * 2] = ((i % sys.size) + 0.5) / sys.size; uv[i * 2 + 1] = (Math.floor(i / sys.size) + 0.5) / sys.size; }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        geo.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
        const mat = acc.mat.clone();
        mat.uniforms.uHelix = shared.uHelix; mat.uniforms.uYRange = shared.uYRange;
        sys.spinePoints = new THREE.Points(geo, mat);
        sys.spinePoints.frustumCulled = false;
      }
      const u = sys.spinePoints.material.uniforms;
      u.tPos.value = sys.gpuCompute.getCurrentRenderTarget(sys.posVar).texture;
      u.tDna.value = pu.tDnaPosition.value;
      u.uAcc.value.set(c.band, c.awayMin, c.awayMax, pu.uTransitionProgress.value < 0.001 ? 1 : 0);
      acc.scene.add(sys.spinePoints);
      gl.render(acc.scene, acc.cam);
      acc.scene.remove(sys.spinePoints);
    }
    gl.setClearColor(col, alpha);
    gl.setRenderTarget(prevRT);
    gl.autoClear = prevAuto;

    // 2) páteř
    const instKey = shared.uYRange.value.x + ',' + shared.uYRange.value.y + ',' + c.spin;
    if (instKey !== parts.instKey) {
      // y + stočení z aktuálního fitu (jen při změně fitu / stočení)
      parts.instKey = instKey;
      const t = parts.tileGeo.attributes.aInstT.array, a = parts.tileGeo.attributes.aInst;
      const y0 = shared.uYRange.value.x, y1 = shared.uYRange.value.y;
      for (let i = 0; i < t.length; i += 3) {
        const y = y0 + (y1 - y0) * t[i];
        a.array[i] = y; a.array[i + 1] = t[i + 1]; a.array[i + 2] = y * c.spin + t[i + 1] * 1.7;
      }
      a.needsUpdate = true;
    }
    shared.uTime.value = state.clock.elapsedTime;
    shared.uPulseSpeed.value = c.pulseSpeed;
    shared.uPulseGap.value = Math.max(0.2, c.pulseGap);
    shared.uColor.value.set(c.color);
    shared.uIntensity.value = c.intensity * orbit;
    shared.uRevealP.value.set(c.revealFrom, Math.max(c.revealFrom + 0.01, c.revealFull), c.rest, 1 / REVEAL_BINS);
    parts.tileMat.uniforms.uGlass.value.set(c.glass);
    parts.tileMat.uniforms.uOpacity.value = c.glassOpacity;
    parts.threadMat.uniforms.uRadius.value = c.threadRadius;
    parts.glowMat.uniforms.uRadius.value = c.glowRadius;
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={parts.tileGeo} material={parts.tileMat} renderOrder={3} frustumCulled={false} />
      <mesh geometry={parts.tube} material={parts.glowMat} renderOrder={4} frustumCulled={false} />
      <mesh geometry={parts.tube} material={parts.threadMat} renderOrder={4} frustumCulled={false} />
    </group>
  );
}
