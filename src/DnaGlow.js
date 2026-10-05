import * as THREE from 'three';
import { TEX_LOD0 } from './glslTexLod0';

// ORBIT: světlo DNA particlů do prostoru (2026-10-05, nahradilo mlhu z prachu P13 i OrbitFog).
// Oliver: DNA bez mlhy byla prázdná, paprsky z bodu působily 2D -> efekt spjatý s myší i s DNA particly.
//
// Zdroj světla = samy particly (rozmazaná 1/4 scéna tBlur nad prahem) – žádný bod na obrazovce.
// 1) Aura: velmi široká záře z particlů (1/16 rozlišení, 2× gauss) – rozptyl jejich světla v prostoru kolem DNA,
//    jde za particly, když je voda rozfouká.
// 2) Inkoust světla: kde myš víří vodou (ParticleFluid), particly ze sebe pouštějí svítící „inkoust“ ve své barvě.
//    Inkoust nese proud (advekce + lehká difuze), pomalu stoupá a mizí -> barevné víry za rozvířenými particly.
//    V klidu se nic nepouští (jen aura). Cena: 1/4 rozlišení ping-pong + malá aura.

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// světlo particlů nad prahem (měkké koleno) do malé textury
const EXTRACT = `${TEX_LOD0}
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThr;
varying vec2 vUv;
vec3 ex(vec2 o) { vec3 c = texture2D(uSrc, vUv + o * uTexel).rgb; return max(c - uThr, 0.0); }
void main() { gl_FragColor = vec4((ex(vec2(-1.0, -1.0)) + ex(vec2(1.0, -1.0)) + ex(vec2(-1.0, 1.0)) + ex(vec2(1.0, 1.0))) * 0.25, 1.0); }`;

const BLUR = `${TEX_LOD0}
uniform sampler2D uSrc; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uSrc, vUv).rgb * 0.2270270270;
  c += (texture2D(uSrc, vUv + uDir * 1.3846153846).rgb + texture2D(uSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(uSrc, vUv + uDir * 3.2307692308).rgb + texture2D(uSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

// inkoust: advekce proudem, difuze (4 vzorky kolem), stoupání, útlum; přítok = světlo particlů × rychlost vody
const INK = `${TEX_LOD0}
uniform sampler2D uInk, uSrc, uFluid;
uniform vec2 uTexel, uFluidTexel;
uniform float uDt, uFluidOn, uFlow, uFade, uEmit, uThr, uRise, uSpread, uWMin, uWMax;
varying vec2 vUv;
void main() {
  vec2 f = uFluidOn > 0.5 ? texture2D(uFluid, vUv).xy : vec2(0.0);
  vec2 v = f * uFluidTexel * uFlow + vec2(0.0, uRise);
  vec2 c = vUv - v * uDt;
  vec2 d = uTexel * uSpread;
  vec3 ink = (texture2D(uInk, c + vec2(d.x, 0.0)).rgb + texture2D(uInk, c - vec2(d.x, 0.0)).rgb
            + texture2D(uInk, c + vec2(0.0, d.y)).rgb + texture2D(uInk, c - vec2(0.0, d.y)).rgb) * 0.25;
  ink *= exp(-uFade * uDt);
  float w = smoothstep(uWMin, uWMax, length(f));
  ink += max(texture2D(uSrc, vUv).rgb - uThr, 0.0) * w * uEmit * uDt;
  gl_FragColor = vec4(min(ink, vec3(8.0)), 1.0);
}`;

export const DNA_GLOW_DEFAULTS = {
  enabled: true,
  threshold: 0.03,   // jas particlů (tBlur, lineárně), od kterého svítí do prostoru
  aura: 4,           // síla široké záře kolem DNA (× nasvícení září nahoře, topLow/topReach)
  auraRadius: 2.6,   // šíře záře (krok gauss v texelech 1/16) – rozlitá, ne přilepená k DNA
  tint: 0.35,        // 0 = barvy particlů, 1 = barva tvLight.color
  ink: 1.4,          // síla inkoustu světla
  emit: 8,           // kolik inkoustu particly pustí za s ve vodě
  fade: 0.6,         // útlum inkoustu (1/s)
  flow: 1,           // jak silně inkoust nese proud
  rise: 0.012,       // stoupání inkoustu (výšky obrazovky/s)
  spread: 0.12,      // difuze inkoustu (texely 1/4 za snímek)
  waterMin: 8,       // rychlost vody (buňky/s), od které particly pouštějí inkoust
  waterMax: 40,
  objects: 0.5,      // kolik záře je vidět přes objekty
  topLow: 0.3,       // aura dole, daleko od záře nahoře (1 = všude stejně)
  topReach: 1.5,     // vzdálenost od světla nad DNA, kde aura klesne na topLow
};

function rt(w, h) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  t.texture.generateMipmaps = false;
  return t;
}

export class DnaGlow {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.m = {
      extract: mk(EXTRACT, { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 0.05 } }),
      blur: mk(BLUR, { uSrc: { value: null }, uDir: { value: new THREE.Vector2() } }),
      ink: mk(INK, {
        uInk: { value: null }, uSrc: { value: null }, uFluid: { value: null }, uTexel: { value: new THREE.Vector2() }, uFluidTexel: { value: new THREE.Vector2() },
        uDt: { value: 0 }, uFluidOn: { value: 0 }, uFlow: { value: 1 }, uFade: { value: 0.9 }, uEmit: { value: 6 }, uThr: { value: 0.05 },
        uRise: { value: 0.012 }, uSpread: { value: 0.6 }, uWMin: { value: 8 }, uWMax: { value: 40 },
      }),
    };
    this.w = 0; this.h = 0;
    this.inkIdle = Infinity; // s od posledního pouštění inkoustu (po dohasnutí se průchod přeskakuje)
  }

  resize(gl, w, h) {
    if (w === this.w && h === this.h) return;
    this.dispose(true);
    this.w = w; this.h = h;
    const aw = Math.max(8, Math.round(w / 4)), ah = Math.max(8, Math.round(h / 4));
    this.aura = [rt(aw, ah), rt(aw, ah)];
    this.ink = [rt(w, h), rt(w, h)];
    const prev = gl.getRenderTarget(), col = gl.getClearColor(new THREE.Color()), a = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    [...this.aura, ...this.ink].forEach((t) => { gl.setRenderTarget(t); gl.clear(true, false, false); });
    gl.setClearColor(col, a); gl.setRenderTarget(prev);
    this.inkIdle = Infinity;
  }

  pass(gl, mat, target) {
    this.quad.material = mat;
    gl.setRenderTarget(target);
    gl.render(this.scene, this.cam);
  }

  // src = tBlur (1/4 scény, w × h); vrátí { aura, ink } textury (ink null, když nic nesvítí)
  step(gl, { src, w, h, fluid, fluidTexel, dt, cfg }) {
    this.resize(gl, w, h);
    const c = { ...DNA_GLOW_DEFAULTS, ...cfg };
    const prev = gl.getRenderTarget(), ac = gl.autoClear;
    gl.autoClear = false;

    // aura: extrakce do 1/16 + 2× (H + V) gauss
    const eu = this.m.extract.uniforms;
    eu.uSrc.value = src; eu.uTexel.value.set(1 / w, 1 / h); eu.uThr.value = c.threshold;
    this.pass(gl, this.m.extract, this.aura[0]);
    const bu = this.m.blur.uniforms, aw = this.aura[0].width, ah = this.aura[0].height;
    for (let i = 0; i < 2; i++) {
      const r = c.auraRadius * (1 + i);
      bu.uSrc.value = this.aura[0].texture; bu.uDir.value.set(r / aw, 0);
      this.pass(gl, this.m.blur, this.aura[1]);
      bu.uSrc.value = this.aura[1].texture; bu.uDir.value.set(0, r / ah);
      this.pass(gl, this.m.blur, this.aura[0]);
    }

    // inkoust: jen když voda běží, nebo ještě dohasíná (po ~6/fade s je pryč -> přeskočit)
    this.inkIdle = fluid ? 0 : this.inkIdle + dt;
    let ink = null;
    if (this.inkIdle < 6 / Math.max(0.05, c.fade)) {
      const iu = this.m.ink.uniforms;
      iu.uInk.value = this.ink[0].texture; iu.uSrc.value = src; iu.uFluid.value = fluid; iu.uFluidOn.value = fluid ? 1 : 0;
      iu.uTexel.value.set(1 / w, 1 / h);
      if (fluidTexel) iu.uFluidTexel.value.copy(fluidTexel);
      iu.uDt.value = dt; iu.uFlow.value = c.flow; iu.uFade.value = c.fade; iu.uEmit.value = c.emit; iu.uThr.value = c.threshold;
      iu.uRise.value = c.rise; iu.uSpread.value = c.spread; iu.uWMin.value = c.waterMin; iu.uWMax.value = c.waterMax;
      this.pass(gl, this.m.ink, this.ink[1]); this.ink.reverse();
      ink = this.ink[0].texture;
    } else if (this.inkIdle !== Infinity) {
      // dohasnuto: vyčistit, ať po probuzení vody nevyskočí starý inkoust
      const col = gl.getClearColor(new THREE.Color()), a = gl.getClearAlpha();
      gl.setClearColor(0x000000, 0);
      this.ink.forEach((t) => { gl.setRenderTarget(t); gl.clear(true, false, false); });
      gl.setClearColor(col, a);
      this.inkIdle = Infinity;
    }

    gl.autoClear = ac;
    gl.setRenderTarget(prev);
    return { aura: this.aura[0].texture, ink };
  }

  dispose(keepMaterials) {
    [...(this.aura || []), ...(this.ink || [])].forEach((t) => t?.dispose());
    this.aura = this.ink = null;
    this.w = this.h = 0;
    if (!keepMaterials) { Object.values(this.m).forEach((m) => m.dispose()); this.quad.geometry.dispose(); }
  }
}
