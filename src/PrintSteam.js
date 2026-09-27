import * as THREE from 'three';

// Fake pára nad tiskovou linkou 3D tisku. Jedna malá textura hustoty (výška `res` řádků), 1 průchod za snímek:
// semi-Lagrangeova advekce hustoty polem = vztlak (rychlost roste s výškou nad linkou, v = sqrt(v0² + 2·a·h) –
// "gravitace nahoru") + víření z šumu (sílí s výškou) + proud myši z 2D vody (ParticleFluid, jen když je vzhůru).
// Zdroj: tenký pás nad linkou A–B, nerovnoměrné obláčky + víc tam, kde maska tisku opravdu žhne.
// R = pára, G = horká pára (z masky) – VolumetricLight ji nasvítí barvou žáru, u linky víc.
// Nic se neřeší (tlak, divergence) -> cena ~ jeden fullscreen pass v malém rozlišení.

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const STEP = `
uniform sampler2D uSrc, uMask, uFluid;
uniform vec2 uA, uB, uFluidTexel;
uniform float uDt, uTime, uAspect, uRise, uLift, uTurb, uFade, uEmit, uHot, uMouse, uFluidOn;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// curl šumu -> víření bez stlačování (pára se neslévá do bodů)
vec2 curl(vec2 p) {
  const float e = 0.05;
  float n1 = vnoise(p + vec2(0.0, e)), n2 = vnoise(p - vec2(0.0, e));
  float n3 = vnoise(p + vec2(e, 0.0)), n4 = vnoise(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

void main() {
  vec2 E = uB - uA;
  float s = (vUv.x - uA.x) / (abs(E.x) > 1e-5 ? E.x : 1e-5);
  float h = vUv.y - mix(uA.y, uB.y, s);           // výška nad linkou (výšky obrazovky)
  float hp = max(h, 0.0);

  // vztlak: zrychluje nahoru, pod linkou jen pomalu
  vec2 vel = vec2(0.0, sqrt(uLift * uLift + 2.0 * uRise * hp));
  // víření sílí s výškou (pára se rozpadá), pole se pomalu posouvá nahoru
  vec2 q = vec2(vUv.x * uAspect, vUv.y) * 13.0 - vec2(uTime * 0.07, uTime * 0.6);
  vel += (curl(q) * 0.6 + curl(q * 2.3 + 17.0) * 0.4) * uTurb * (0.3 + min(hp * 10.0, 2.0)) * 0.07;
  // proud myši (buňky/s -> uv/s)
  if (uFluidOn > 0.5) vel += texture2D(uFluid, vUv).xy * uFluidTexel * uMouse;
  vel.x /= uAspect;

  vec2 back = vUv - vel * uDt;
  vec2 dens = texture2D(uSrc, back).rg;
  // výš = rychleji mizí (kouř se nahoře ztrácí, sloupy se ke konci zmenšují)
  dens *= exp(-(uFade + hp * 7.0) * uDt);
  // okraje textury nerecyklovat
  dens *= step(0.0, back.x) * step(back.x, 1.0) * step(back.y, 1.0);

  // zdroj: tenký pás těsně nad linkou
  if (s > 0.0 && s < 1.0) {
    float band = exp(-pow((h - 0.006) / 0.006, 2.0));
    float edge = smoothstep(0.0, 0.08, s) * smoothstep(0.0, 0.08, 1.0 - s);
    // obláčky podél linky: pomalu se mění, nerovnoměrně
    float puff = vnoise(vec2(s * 55.0, uTime * 1.3)) * vnoise(vec2(s * 17.0 + 3.1, uTime * 0.6));
    puff = smoothstep(0.12, 0.6, puff);
    // kde se opravdu tiskne (maska žhne těsně pod/na lince)
    float ly = vUv.y - h;
    vec3 m = texture2D(uMask, vec2(vUv.x, ly)).rgb + texture2D(uMask, vec2(vUv.x, ly - 0.01)).rgb
           + texture2D(uMask, vec2(vUv.x, ly + 0.008)).rgb;
    float hot = clamp(dot(m, vec3(0.33)) * 1.2, 0.0, 1.0);
    float e = band * edge * uDt * uEmit;
    // kouř z celé linky (rovnoměrně, jen jemně po obláčcích) + víc tam, kde se tiskne
    dens.r += e * (0.55 + 0.45 * puff + hot * 0.5);
    dens.g += e * hot * uHot * puff;
  }
  gl_FragColor = vec4(min(dens, vec2(4.0)), 0.0, 1.0);
}`;

function makeTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
  });
}

export class PrintSteam {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: STEP, depthTest: false, depthWrite: false,
      uniforms: {
        uSrc: { value: null }, uMask: { value: null }, uFluid: { value: null },
        uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uFluidTexel: { value: new THREE.Vector2() },
        uDt: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uRise: { value: 0.25 }, uLift: { value: 0.03 },
        uTurb: { value: 1 }, uFade: { value: 1.2 }, uEmit: { value: 6 }, uHot: { value: 1 }, uMouse: { value: 1 }, uFluidOn: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.rt = null;
    this.live = false;
  }

  resize(gl, w, h) {
    if (this.rt && this.rt[0].width === w && this.rt[0].height === h) return;
    this.rt?.forEach((t) => t.dispose());
    this.rt = [makeTarget(w, h), makeTarget(w, h)];
    this.clear(gl);
  }

  clear(gl) {
    const prev = gl.getRenderTarget(), col = gl.getClearColor(new THREE.Color()), a = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    this.rt.forEach((t) => { gl.setRenderTarget(t); gl.clear(true, false, false); });
    gl.setClearColor(col, a); gl.setRenderTarget(prev);
    this.live = false;
  }

  // p: {a, b, mask, fluid, fluidTexel, dt, time, aspect, res, rise, lift, turb, fade, emit, hot, mouse}
  step(gl, p) {
    const H = Math.max(32, Math.round(p.res));
    this.resize(gl, Math.max(32, Math.round(H * p.aspect)), H);
    const u = this.mat.uniforms;
    u.uSrc.value = this.rt[0].texture; u.uMask.value = p.mask; u.uFluid.value = p.fluid;
    u.uFluidOn.value = p.fluid ? 1 : 0;
    if (p.fluidTexel) u.uFluidTexel.value.copy(p.fluidTexel);
    u.uA.value.copy(p.a); u.uB.value.copy(p.b);
    u.uDt.value = p.dt; u.uTime.value = p.time; u.uAspect.value = p.aspect;
    u.uRise.value = p.rise; u.uLift.value = p.lift; u.uTurb.value = p.turb; u.uFade.value = p.fade;
    u.uEmit.value = p.emit; u.uHot.value = p.hot; u.uMouse.value = p.mouse;
    const prev = gl.getRenderTarget(), ac = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(this.rt[1]);
    gl.render(this.scene, this.cam);
    gl.autoClear = ac;
    gl.setRenderTarget(prev);
    this.rt.reverse();
    this.live = true;
    if (import.meta.env.DEV) window.__steam = this;
    return this.rt[0].texture;
  }

  dispose() {
    this.rt?.forEach((t) => t.dispose());
    this.rt = null;
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}
