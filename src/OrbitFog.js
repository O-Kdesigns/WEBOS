import * as THREE from 'three';
import { TEX_LOD0 } from './glslTexLod0';

// ORBIT mlha (nahradila mlhu z prachu P13, 2026-10-04). Oliver: paprsky z bodu působily 2D, myš je jen
// vymazávala (paprsek za myší pokračoval), jedna strana prázdná, druhá svítila; zdroj nesmí být na obrazovce.
//
// 1) Mlha je ve světě: 2 válcové vrstvy kolem osy DNA (poloměr r1 / r2 za DNA), hustota = 3D šum v bodě, kde
//    paprsek z kamery protne válec -> při otáčení a scrollu má skutečnou paralaxu (bližší vrstva jede rychleji).
// 2) Světlo je směrové shora (nebe) – žádný bod na obrazovce. Mlha stíní sama sebe (hustá místa zastíní, co je
//    pod nimi, jako mraky) a částečně ji stíní objekty (DNA, TV). Řídký opar (haze) ukáže světlo i v mezerách
//    -> šachty světla tam, kudy prošlo.
// 3) Voda z myši (ParticleFluid) mlhu nesmaže, ale odnese: mapa posunu (odkud se mlha na tento pixel přinesla)
//    se advektuje proudem a pomalu se vrací k nule (`heal`) -> mlha se stočí do vírů a zase se zacelí.
//    Kde voda mlhu odhrnula, projde víc světla -> pod tím místem se rozsvítí šachta (fyzikálně, ne maskou).
//
// Cena: posun (malá textura ~1/8), hustota + světlo ve 1/4 rozlišení. VolumetricLight jen přičte výsledek.

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Posun mlhy proudem: O = (odkud mlha přišla) − uv. O_new(x) = O(x − v·dt) − v·dt, pak útlum k nule.
const WARP = `${TEX_LOD0}
uniform sampler2D uSrc, uFluid;
uniform vec2 uFluidTexel;
uniform float uDt, uFluidOn, uHeal, uFlow, uMax;
varying vec2 vUv;
void main() {
  vec2 v = uFluidOn > 0.5 ? texture2D(uFluid, vUv).xy * uFluidTexel * uFlow : vec2(0.0);
  vec2 o = texture2D(uSrc, vUv - v * uDt).xy - v * uDt;
  o *= exp(-uHeal * uDt);
  float l = length(o);
  if (l > uMax) o *= uMax / l;
  gl_FragColor = vec4(o, 0.0, 1.0);
}`;

// 3D simplex šum (Stefan Gustavson / Ashima Arts, MIT)
const NOISE3 = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise3(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

// Hustota mlhy (R) a zakrytí objekty (G) ve 1/4 rozlišení
const DENS = `${TEX_LOD0}
uniform sampler2D uWarp, uDepth;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos;
uniform vec2 uDepthTexel;
uniform float uTime, uR1, uR2, uScale, uRise, uDrift, uLo, uHi, uFar, uNear;
varying vec2 vUv;
${NOISE3}
float fbm(vec3 p) {
  float f = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { f += a * snoise3(p); p = p * 2.03 + vec3(1.7, -3.1, 2.3); a *= 0.5; }
  return f;
}
// vrstva mlhy na válci poloměru R kolem osy DNA (x = z = 0): vzdálenější průsečík paprsku (kamera je uvnitř)
float shell(vec3 o, vec3 d, float R, float seed) {
  float a = dot(d.xz, d.xz);
  if (a < 1e-5) return 0.0;
  float b = dot(o.xz, d.xz), c = dot(o.xz, o.xz) - R * R;
  float disc = b * b - a * c;
  if (disc < 0.0) return 0.0;
  vec3 p = o + d * ((-b + sqrt(disc)) / a);
  // šum ve světových souřadnicích (žádný šev); mlha pomalu stoupá a obtéká osu, tvar se mění zkřivením prostoru
  vec3 q = vec3(p.x, p.y - uTime * uRise, p.z) * uScale;
  float ca = cos(uTime * uDrift / R), sa = sin(uTime * uDrift / R);
  q.xz = mat2(ca, -sa, sa, ca) * q.xz;
  q += 0.8 * vec3(snoise3(q * 0.45 + vec3(seed, uTime * 0.02, 0.0)), snoise3(q * 0.45 + vec3(0.0, seed + 5.2, uTime * 0.02)), 0.0);
  float f = fbm(q + seed) * 0.5 + 0.5;
  return smoothstep(uLo, uHi, f);
}
void main() {
  vec2 uv = vUv + texture2D(uWarp, vUv).xy;
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize((uCamWorld * vec4(normalize(vp.xyz / vp.w), 0.0)).xyz);
  float dens = shell(uCamPos, d, uR1, 0.0) * uNear + shell(uCamPos, d, uR2, 11.3) * uFar;
  // zakrytí objekty (cokoli kromě pozadí) – 4 vzorky hloubky přes texel 1/4 rozlišení, bez posunu vodou
  vec2 t = uDepthTexel * 1.5;
  float occ = step(texture2D(uDepth, vUv + vec2(-t.x, -t.y)).r, 0.9998) + step(texture2D(uDepth, vUv + vec2(t.x, -t.y)).r, 0.9998)
            + step(texture2D(uDepth, vUv + vec2(-t.x, t.y)).r, 0.9998) + step(texture2D(uDepth, vUv + vec2(t.x, t.y)).r, 0.9998);
  gl_FragColor = vec4(dens, occ * 0.25, 0.0, 1.0);
}`;

// Světlo: pochod směrem ke světlu (nahoru, mírně šikmo), propustnost T = exp(−Σ hustota) -> nasvícená mlha + opar
const LIGHT = `${TEX_LOD0}
uniform sampler2D uDens;
uniform vec2 uStep;
uniform float uKFog, uKObj, uLen, uHaze, uAmb, uGain;
uniform vec3 uLightCol, uAmbCol;
varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 c = texture2D(uDens, vUv).rg;
  float tau = 0.0;
  vec2 p = vUv + uStep * ign(gl_FragCoord.xy);
  for (int i = 0; i < 20; i++) {
    p += uStep;
    // nad horní hranou a za boky obrazovky nic nevíme -> bez stínu (světlo přichází z nebe nad obrazovkou)
    float inside = step(p.y, 1.0) * step(0.0, p.x) * step(p.x, 1.0);
    vec2 s = texture2D(uDens, clamp(p, 0.0, 1.0)).rg;
    tau += (s.r * uKFog + s.g * uKObj) * inside;
  }
  float T = exp(-tau * uLen / 20.0);
  vec3 col = c.r * (uLightCol * T * uGain + uAmbCol * uAmb) + uLightCol * uHaze * T;
  gl_FragColor = vec4(col, 1.0);
}`;

export const ORBIT_FOG_DEFAULTS = {
  enabled: true,
  strength: 1,
  objects: 0.3,       // kolik mlhy je vidět přes objekty (DNA, TV) – vrstvy jsou za nimi
  radiusNear: 9,      // vrstvy mlhy: poloměr válce kolem osy DNA (kamera je na ~5,9)
  radiusFar: 16,
  near: 0.55,         // hustota bližší / vzdálenější vrstvy
  far: 0.9,
  scale: 0.18,        // velikost obláčků (1 / světové jednotky)
  lo: 0.48,           // práh šumu -> mezery mezi chuchvalci
  hi: 0.86,
  rise: 0.12,         // stoupání (j/s)
  drift: 0.25,        // obtékání osy (j/s)
  lightColor: '#bfe9e4',
  ambientColor: '#0e3b3f',
  gain: 0.8,         // nasvícení mlhy shora
  ambient: 0.22,      // mlha ve stínu
  haze: 0.05,        // řídký opar všude -> šachty světla v mezerách
  lightAngle: 12,     // sklon světla od svislice (°), pomalu se houpe o `sway`
  sway: 6,
  shadowLength: 0.55, // jak daleko nad pixelem se hledá stín (výšky obrazovky)
  selfShadow: 2.2,    // jak moc mlha stíní sama sebe
  objectShadow: 1.2,  // jak moc stíní objekty (DNA, TV)
  flow: 1,            // jak silně voda z myši mlhu unáší
  heal: 0.45,         // jak rychle se mlha vrací na místo (1/s)
  maxShift: 0.35,     // max. posun mlhy vodou (výšky obrazovky)
};

function rt(w, h, nearest) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: nearest ? THREE.NearestFilter : THREE.LinearFilter, magFilter: nearest ? THREE.NearestFilter : THREE.LinearFilter,
  });
  t.texture.generateMipmaps = false;
  return t;
}

export class OrbitFog {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.m = {
      warp: mk(WARP, { uSrc: { value: null }, uFluid: { value: null }, uFluidTexel: { value: new THREE.Vector2() }, uDt: { value: 0 }, uFluidOn: { value: 0 }, uHeal: { value: 0.45 }, uFlow: { value: 1 }, uMax: { value: 0.35 } }),
      dens: mk(DENS, {
        uWarp: { value: null }, uDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() }, uDepthTexel: { value: new THREE.Vector2() }, uTime: { value: 0 }, uR1: { value: 9 }, uR2: { value: 16 },
        uScale: { value: 0.22 }, uRise: { value: 0.12 }, uDrift: { value: 0.25 }, uLo: { value: 0.42 }, uHi: { value: 0.78 }, uFar: { value: 0.9 }, uNear: { value: 0.55 },
      }),
      light: mk(LIGHT, {
        uDens: { value: null }, uStep: { value: new THREE.Vector2() }, uKFog: { value: 2.2 }, uKObj: { value: 1.2 }, uLen: { value: 0.55 },
        uHaze: { value: 0.035 }, uAmb: { value: 0.35 }, uGain: { value: 0.55 }, uLightCol: { value: new THREE.Color() }, uAmbCol: { value: new THREE.Color() },
      }),
    };
    this.warpRT = null;
    this.densRT = null;
    this.lightRT = null;
    this.w = 0; this.h = 0;
  }

  resize(gl, w, h) {
    if (w === this.w && h === this.h) return;
    this.dispose(true);
    this.w = w; this.h = h;
    const wh = Math.max(16, Math.round(h / 2)), ww = Math.max(16, Math.round(w / 2));
    this.warpRT = [rt(ww, wh), rt(ww, wh)];
    this.densRT = rt(w, h);
    this.lightRT = rt(w, h);
    const prev = gl.getRenderTarget(), col = gl.getClearColor(new THREE.Color()), a = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    this.warpRT.forEach((t) => { gl.setRenderTarget(t); gl.clear(true, false, false); });
    gl.setClearColor(col, a); gl.setRenderTarget(prev);
  }

  pass(gl, mat, target) {
    this.quad.material = mat;
    gl.setRenderTarget(target);
    gl.render(this.scene, this.cam);
  }

  // w, h = rozlišení mlhy (1/4 postu); vrátí texturu nasvícené mlhy (RGB, lineární)
  step(gl, { w, h, camera, depth, fluid, fluidTexel, dt, time, aspect, cfg }) {
    this.resize(gl, w, h);
    const prev = gl.getRenderTarget(), ac = gl.autoClear;
    gl.autoClear = false;
    const c = { ...ORBIT_FOG_DEFAULTS, ...cfg };

    const wu = this.m.warp.uniforms;
    wu.uSrc.value = this.warpRT[0].texture;
    wu.uFluid.value = fluid;
    wu.uFluidOn.value = fluid ? 1 : 0;
    if (fluidTexel) wu.uFluidTexel.value.copy(fluidTexel);
    wu.uDt.value = dt; wu.uHeal.value = c.heal; wu.uFlow.value = c.flow; wu.uMax.value = c.maxShift;
    this.pass(gl, this.m.warp, this.warpRT[1]); this.warpRT.reverse();

    const du = this.m.dens.uniforms;
    du.uWarp.value = this.warpRT[0].texture;
    du.uDepth.value = depth;
    du.uDepthTexel.value.set(1 / w, 1 / h);
    du.uInvProj.value.copy(camera.projectionMatrixInverse);
    du.uCamWorld.value.copy(camera.matrixWorld);
    du.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    du.uTime.value = time;
    du.uR1.value = c.radiusNear; du.uR2.value = c.radiusFar; du.uNear.value = c.near; du.uFar.value = c.far;
    du.uScale.value = c.scale; du.uRise.value = c.rise; du.uDrift.value = c.drift; du.uLo.value = c.lo; du.uHi.value = c.hi;
    this.pass(gl, this.m.dens, this.densRT);

    const lu = this.m.light.uniforms;
    lu.uDens.value = this.densRT.texture;
    const ang = THREE.MathUtils.degToRad(c.lightAngle + c.sway * Math.sin(time * 0.07));
    // směr ke světlu v uv (x podle poměru stran), krok = shadowLength / 20
    lu.uStep.value.set(Math.sin(ang) / Math.max(0.2, aspect), Math.cos(ang)).multiplyScalar(c.shadowLength / 20);
    lu.uLen.value = c.shadowLength; lu.uKFog.value = c.selfShadow; lu.uKObj.value = c.objectShadow;
    lu.uHaze.value = c.haze; lu.uAmb.value = c.ambient; lu.uGain.value = c.gain;
    lu.uLightCol.value.set(c.lightColor); lu.uAmbCol.value.set(c.ambientColor);
    this.pass(gl, this.m.light, this.lightRT);

    gl.autoClear = ac;
    gl.setRenderTarget(prev);
    return this.lightRT.texture;
  }

  dispose(keepMaterials) {
    [...(this.warpRT || []), this.densRT, this.lightRT].forEach((t) => t?.dispose());
    this.warpRT = this.densRT = this.lightRT = null;
    this.w = this.h = 0;
    if (!keepMaterials) { Object.values(this.m).forEach((m) => m.dispose()); this.quad.geometry.dispose(); }
  }
}
