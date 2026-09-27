import * as THREE from 'three';

// Vodnatá fyzika particlů s myší (jako Active Theory). Neviditelná mřížka tekutiny přes obrazovku
// (stable fluids: advekce, víření, tlak) – myš do ní vhání proud, proud sám dojíždí, víří a rozráží se
// do stran. Nic se z ní nekreslí: GPGPU particlů (utils.js) si jen přečte proud v místě, kde je particl
// na obrazovce, a přepočte ho na 3D posun podle hloubky -> blízké i vzdálené particly se vizuálně hýbou stejně.
// Posune se jen přední vrstva particlů: každý systém si kreslí malou mapu nejbližší hloubky svých particlů
// (MIN blending), particly hlouběji než `frontShell` za ní proud ignorují.
// Config `particlePhysics.fluid` (vše volitelné, viz FLUID_DEFAULTS). Když se myš nehýbe `idleSleep` s,
// simulace i mapa hloubky se vypnou (klid = nulová cena).

export const FLUID_DEFAULTS = {
  enabled: true,
  resolution: 128,        // výška mřížky tekutiny (šířka podle poměru stran)
  splatRadius: 0.04,      // poloměr stopy myši (podíl výšky obrazovky)
  force: 1.0,             // 1 = proud v centru stopy má rychlost kurzoru
  curl: 18,               // víření
  dissipation: 1.2,       // útlum proudu za s (menší = delší dojezd)
  pressureIterations: 16,
  coupling: 0.3,          // jak rychle se particl přizpůsobí proudu (za snímek)
  friction: 0.92,         // útlum vlastní rychlosti particlu za snímek
  frontShell: 0.12,       // tloušťka přední vrstvy particlů, kterou proud unáší (world)
  frontRes: 128,          // výška mapy nejbližších particlů
  frontPointSize: 4,      // velikost particlu v mapě (buňky) – větší = méně prosvítání zadních
  idleSleep: 5,           // s bez pohybu myši -> simulace se uspí
};

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const HEAD = `uniform vec2 uTexel; varying vec2 vUv;
#define S(t, o) texture2D(t, vUv + (o) * uTexel)
`;

const SPLAT = HEAD + `
uniform sampler2D uVel; uniform vec2 uA; uniform vec2 uB; uniform vec2 uForce; uniform float uRadius; uniform float uAspect;
void main(){
  // stopa = úsečka od minulé pozice kurzoru (bez děr při rychlém tahu)
  vec2 pa = vUv - uA, ba = uB - uA; pa.x *= uAspect; ba.x *= uAspect;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-10), 0.0, 1.0);
  vec2 d = pa - ba * h;
  float w = exp(-dot(d, d) / (uRadius * uRadius));
  vec2 v = texture2D(uVel, vUv).xy;
  gl_FragColor = vec4(v + (uForce - v) * w, 0.0, 1.0); // prst ve vodě: proud má rychlost kurzoru
}`;

const CURL = HEAD + `
uniform sampler2D uVel;
void main(){
  float L = S(uVel, vec2(-1, 0)).y, R = S(uVel, vec2(1, 0)).y, T = S(uVel, vec2(0, 1)).x, B = S(uVel, vec2(0, -1)).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = HEAD + `
uniform sampler2D uVel; uniform sampler2D uCurl; uniform float uCurlStrength; uniform float uDt;
void main(){
  float L = S(uCurl, vec2(-1, 0)).x, R = S(uCurl, vec2(1, 0)).x, T = S(uCurl, vec2(0, 1)).x, B = S(uCurl, vec2(0, -1)).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= uCurlStrength * C; f.y *= -1.0;
  gl_FragColor = vec4(texture2D(uVel, vUv).xy + f * uDt, 0.0, 1.0);
}`;

const DIVERGENCE = HEAD + `
uniform sampler2D uVel;
void main(){
  float L = S(uVel, vec2(-1, 0)).x, R = S(uVel, vec2(1, 0)).x, T = S(uVel, vec2(0, 1)).y, B = S(uVel, vec2(0, -1)).y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const SCALE = HEAD + `
uniform sampler2D uSrc; uniform float uValue;
void main(){ gl_FragColor = texture2D(uSrc, vUv) * uValue; }`;

const PRESSURE = HEAD + `
uniform sampler2D uP; uniform sampler2D uDiv;
void main(){
  float L = S(uP, vec2(-1, 0)).x, R = S(uP, vec2(1, 0)).x, T = S(uP, vec2(0, 1)).x, B = S(uP, vec2(0, -1)).x;
  gl_FragColor = vec4((L + R + T + B - texture2D(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = HEAD + `
uniform sampler2D uP; uniform sampler2D uVel;
void main(){
  float L = S(uP, vec2(-1, 0)).x, R = S(uP, vec2(1, 0)).x, T = S(uP, vec2(0, 1)).x, B = S(uP, vec2(0, -1)).x;
  gl_FragColor = vec4(texture2D(uVel, vUv).xy - 0.5 * vec2(R - L, T - B), 0.0, 1.0);
}`;

const ADVECT = HEAD + `
uniform sampler2D uVel; uniform float uDt; uniform float uDissipation;
void main(){
  vec2 coord = vUv - uDt * texture2D(uVel, vUv).xy * uTexel;
  gl_FragColor = vec4(texture2D(uVel, coord).xy / (1.0 + uDissipation * uDt), 0.0, 1.0);
}`;

function makeTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
  });
}

class Fluid {
  constructor(gl) {
    this.gl = gl;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fs, uniforms: { uTexel: { value: new THREE.Vector2() }, ...u }, depthTest: false, depthWrite: false });
    this.m = {
      splat: mk(SPLAT, { uVel: { value: null }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uForce: { value: new THREE.Vector2() }, uRadius: { value: 0.04 }, uAspect: { value: 1 } }),
      curl: mk(CURL, { uVel: { value: null } }),
      vorticity: mk(VORTICITY, { uVel: { value: null }, uCurl: { value: null }, uCurlStrength: { value: 0 }, uDt: { value: 0 } }),
      divergence: mk(DIVERGENCE, { uVel: { value: null } }),
      scale: mk(SCALE, { uSrc: { value: null }, uValue: { value: 0 } }),
      pressure: mk(PRESSURE, { uP: { value: null }, uDiv: { value: null } }),
      gradient: mk(GRADIENT, { uP: { value: null }, uVel: { value: null } }),
      advect: mk(ADVECT, { uVel: { value: null }, uDt: { value: 0 }, uDissipation: { value: 0 } }),
    };
    this.w = 0; this.h = 0;
    this.prev = new THREE.Vector2(NaN, NaN);
    this.lastMove = -1e9;
    this.active = false;
    this.frameDone = false;
    this.texel = new THREE.Vector2();
    this.velocity = null;
    const reset = () => this.prev.set(NaN, NaN);
    window.addEventListener('blur', reset);
    window.addEventListener('focus', reset);
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.dispose();
    this.w = w; this.h = h;
    this.texel.set(1 / w, 1 / h);
    this.vel = [makeTarget(w, h), makeTarget(w, h)];
    this.p = [makeTarget(w, h), makeTarget(w, h)];
    this.div = makeTarget(w, h);
    this.curlRT = makeTarget(w, h);
    Object.values(this.m).forEach((m) => m.uniforms.uTexel.value.copy(this.texel));
    this.clear();
  }

  clear() {
    const gl = this.gl, prev = gl.getRenderTarget();
    const col = gl.getClearColor(new THREE.Color()), a = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    [...this.vel, ...this.p].forEach((t) => { gl.setRenderTarget(t); gl.clear(true, false, false); });
    gl.setClearColor(col, a);
    gl.setRenderTarget(prev);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.scene, this.cam);
  }

  swapVel() { this.vel.reverse(); }

  // Jednou za snímek (volá ho první particle systém, další snímek už mají hotový).
  update(state, delta, cfg) {
    if (this.frameDone) return;
    this.frameDone = true;
    queueMicrotask(() => { this.frameDone = false; });

    const { width, height } = state.size;
    const H = Math.max(16, Math.round(cfg.resolution));
    this.resize(Math.max(16, Math.round(H * width / height)), H);

    const now = performance.now() / 1000;
    const dt = Math.min(Math.max(delta, 1 / 240), 1 / 30);
    const pu = state.pointer.x * 0.5 + 0.5, pv = state.pointer.y * 0.5 + 0.5;
    const moved = Number.isFinite(this.prev.x) && (pu !== this.prev.x || pv !== this.prev.y);
    if (moved) {
      if (!this.active) { this.clear(); this.active = true; }
      this.lastMove = now;
    }
    if (this.active && now - this.lastMove > cfg.idleSleep) this.active = false;
    if (!this.active) { this.prev.set(pu, pv); this.velocity = null; return; }

    const gl = this.gl, prevTarget = gl.getRenderTarget(), prevAutoClear = gl.autoClear;
    gl.autoClear = false;
    const m = this.m;

    if (moved) {
      const s = m.splat.uniforms;
      s.uVel.value = this.vel[0].texture;
      s.uA.value.copy(this.prev); s.uB.value.set(pu, pv);
      // rychlost kurzoru v buňkách mřížky za sekundu
      s.uForce.value.set((pu - this.prev.x) * this.w / dt, (pv - this.prev.y) * this.h / dt).multiplyScalar(cfg.force);
      s.uRadius.value = cfg.splatRadius;
      s.uAspect.value = width / height;
      this.pass(m.splat, this.vel[1]); this.swapVel();
    }
    this.prev.set(pu, pv);

    m.curl.uniforms.uVel.value = this.vel[0].texture;
    this.pass(m.curl, this.curlRT);

    const v = m.vorticity.uniforms;
    v.uVel.value = this.vel[0].texture; v.uCurl.value = this.curlRT.texture; v.uCurlStrength.value = cfg.curl; v.uDt.value = dt;
    this.pass(m.vorticity, this.vel[1]); this.swapVel();

    m.divergence.uniforms.uVel.value = this.vel[0].texture;
    this.pass(m.divergence, this.div);

    m.scale.uniforms.uSrc.value = this.p[0].texture; m.scale.uniforms.uValue.value = 0.8;
    this.pass(m.scale, this.p[1]); this.p.reverse();

    m.pressure.uniforms.uDiv.value = this.div.texture;
    for (let i = 0; i < cfg.pressureIterations; i++) {
      m.pressure.uniforms.uP.value = this.p[0].texture;
      this.pass(m.pressure, this.p[1]); this.p.reverse();
    }

    m.gradient.uniforms.uP.value = this.p[0].texture; m.gradient.uniforms.uVel.value = this.vel[0].texture;
    this.pass(m.gradient, this.vel[1]); this.swapVel();

    const a = m.advect.uniforms;
    a.uVel.value = this.vel[0].texture; a.uDt.value = dt; a.uDissipation.value = cfg.dissipation;
    this.pass(m.advect, this.vel[1]); this.swapVel();

    gl.autoClear = prevAutoClear;
    gl.setRenderTarget(prevTarget);
    this.velocity = this.vel[0].texture;
  }

  dispose() {
    [...(this.vel || []), ...(this.p || []), this.div, this.curlRT].forEach((t) => t?.dispose());
  }
}

let fluid = null;
export function getFluid(gl) {
  if (!fluid) fluid = new Fluid(gl);
  return fluid;
}

// --- Mapa nejbližších particlů (per systém) ---
// Všechny particly (klidové pozice) jako body do malé mapy obrazovky, MAX blending 1/hloubka -> v každé buňce nejbližší particl
// (1/hloubka: čistí se nulou, žádná obří clear hodnota).
// Klidová pozice particlu (cíl bez levitace / emerge / scatteru) – stejná funkce je ve velocity shaderu (utils.js).
// Přední vrstva se určuje z klidového tvaru: jinak by proud přední particly odsunul, zadní by se staly
// "předními" a voda by objekt postupně vyhlodala.
export const REST_TARGET_GLSL = `
uniform sampler2D tBasePosition; uniform sampler2D tDnaPosition; uniform mat4 uFinalMat;
uniform float uTransitionProgress; uniform float uCameraY;
vec3 restTarget(vec2 ref) {
  vec4 base = texture2D(tBasePosition, ref), dna = texture2D(tDnaPosition, ref);
  vec3 dnaT = dna.xyz + vec3(0.0, uCameraY * step(dna.w, 0.0), 0.0);
  return mix(dnaT, (uFinalMat * vec4(base.xyz, 1.0)).xyz, smoothstep(0.0, 1.0, uTransitionProgress));
}
`;

const FRONT_VERT = REST_TARGET_GLSL + `
uniform mat4 uMVP; uniform float uPointSize; attribute vec2 aRef; varying float vDepth;
void main(){
  vec4 c = uMVP * vec4(restTarget(aRef), 1.0);
  vDepth = c.w;
  gl_Position = c;
  gl_PointSize = uPointSize; // > 1 buňka: zaplní mezery mezi předními particly, ať jimi neprosvítají zadní
}`;
const FRONT_FRAG = `varying float vDepth; void main(){ gl_FragColor = vec4(1.0 / vDepth); }`;

export function createFrontPass(size, targetUniforms) {
  const n = size * size;
  const ref = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { ref[i * 2] = ((i % size) + 0.5) / size; ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aRef', new THREE.BufferAttribute(ref, 2));
  const mat = new THREE.ShaderMaterial({
    vertexShader: FRONT_VERT, fragmentShader: FRONT_FRAG,
    // sdílí uniformy cíle s GPGPU (tBasePosition, tDnaPosition, uFinalMat, uTransitionProgress, uCameraY)
    uniforms: { ...targetUniforms, uMVP: { value: new THREE.Matrix4() }, uPointSize: { value: 4 } },
    depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  const cam = new THREE.OrthographicCamera();
  let rt = null;
  const _c = new THREE.Color();
  return {
    get texture() { return rt?.texture; },
    get target() { return rt; },
    render(gl, mvp, w, h, pointSize) {
      if (!rt || rt.width !== w || rt.height !== h) {
        rt?.dispose();
        rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      }
      mat.uniforms.uMVP.value.copy(mvp);
      mat.uniforms.uPointSize.value = pointSize;
      const prev = gl.getRenderTarget(), col = gl.getClearColor(_c), a = gl.getClearAlpha(), ac = gl.autoClear;
      gl.autoClear = false;
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.render(scene, cam);
      gl.setClearColor(col, a); gl.autoClear = ac;
      gl.setRenderTarget(prev);
    },
    dispose() { geo.dispose(); mat.dispose(); rt?.dispose(); },
  };
}
