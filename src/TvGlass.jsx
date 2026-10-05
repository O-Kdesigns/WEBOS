import { useMemo, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { portalFx } from './PortalTransition';
import { TEX_LOD0 } from './glslTexLod0';

// Skleněná televize (nody z Blenderu s prefixem "TV_", dítě GlassDesk).
// Sklo = vlastní shader:
//  - lom scény za sklem: scéna bez skla se 1x za snímek vykreslí do polovičního FBO a sklo ho čte
//    posunuté podle normály (IOR), s disperzí a matným rozmazáním (poškrábané sklo)
//  - video je "portál" uvnitř skla: paprsek se v Blenderu nastaveném skle lomí a trefí rovinu
//    GlassDesk (uprostřed tloušťky) -> paralaxa, měkké okraje, tónování sklem
//  - vnitřní odraz: když lomený paprsek vyjde bokem místo zadní stěnou, je vidět světlo odražené
//    uvnitř hrany (totální odraz)
// Ladí se v Blenderu přes custom properties objektu (export extras -> userData):
//   tvTint, tvRim, tvRimStrength, tvMilk, tvIor, tvDistort, tvFrost, tvScratch, tvBackground, tvRadius, tvVideo
// Průlet portálem (PortalTransition): aktivní deska nezmizí s ostatními (uKeep), ale u kamery se sklo
// rozpouští po pixelech podle vzdálenosti (uNear) -> kamera projede sklem bez bliknutí.
// Když hraje video: sklo je zamrzlé – na krajích plný led (ledové žilky lámou scénu a rozptylují světlo,
// video tam není), ke středu led plynule ubývá a přibývá video (průhledné, tmavá místa propouštějí scénu).
// Video se kreslí AŽ po tónování skla (sklo ho nebarví); sklo jde do barvy videa (rozmazané video, RT 16×9).
//   tvVidOpacity (0.85 = krytí videa ve středu), tvVidFade (0.6 = šířka přechodu, podíl poloosy obrazu),
//   tvIce (1 = síla ledu), tvIceScale (8 = hustota žilek), tvIceCenter (0.12 = zbytek ledu ve středu),
//   tvVidTint (0.5 = sklo do barvy videa)
//   DEV: window.__tvVidOverride = { opacity, fade, ice, iceScale, iceCenter, tint }

const FBO_SCALE = 0.5;

// Všechny meshe skla TV (i neaktivní desky) – post (VolumetricLight) z nich bere pozici aktivní televize pro světlo TV
export const tvRegistry = new Set();

const vertexShader = `
  varying vec3 vLocal;
  varying vec3 vLN;
  varying vec3 vN;
  varying vec3 vWP;
  varying vec3 vLV;
  void main() {
    vLocal = position;
    vLN = normal;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    // směr ke kameře v lokálním prostoru (model matrix = rotace * uniformní scale)
    vLV = transpose(mat3(modelMatrix)) * (cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = `${TEX_LOD0}
  uniform sampler2D tScene;
  uniform sampler2D tVideo;
  uniform vec2 uRes;
  uniform float uTime, uFade, uHasVideo, uKeep;
  uniform vec2 uNear;
  uniform vec3 uAxN, uAxA, uAxB, uCenter;
  uniform vec2 uHalf;
  uniform float uHalfT, uRadius;
  uniform vec4 uVidU, uVidV;
  uniform vec3 uTint, uRim;
  uniform float uRimStrength, uMilk, uIor, uDistort, uFrost, uScratch, uBgLevel;
  uniform sampler2D tVidBlur;
  uniform float uVidAmb, uVidTint, uVidOpacity, uVidFade, uIce, uIceScale, uIceCenter;
  varying vec3 vLocal;
  varying vec3 vLN;
  varying vec3 vN;
  varying vec3 vWP;
  varying vec3 vLV;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  float sdRR(vec2 q, vec2 h, float r) { vec2 d = abs(q) - h + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }

  // škrábance: protáhlý šum (tenké čáry) ve třech směrech, přerušovaný maskou -> úsečky
  float scratchLayer(vec2 q, float ang, float seed) {
    float s = sin(ang), c = cos(ang);
    vec2 r = mat2(c, -s, s, c) * q;
    float line = noise(r * vec2(1.2, 150.0) + seed);
    float mask = noise(r * vec2(3.0, 6.0) + seed * 3.1);
    return smoothstep(0.86, 0.97, line) * smoothstep(0.5, 0.8, mask);
  }

  // zamrzlé sklo: ledové žilky (ridged šum, 2 oktávy, mírně zkroucené) -> lom podle jejich sklonu
  float iceH(vec2 p) {
    p += vec2(noise(p * 0.6 + 7.0), noise(p * 0.6 + 19.0)) * 1.5;
    float r1 = 1.0 - abs(noise(p) * 2.0 - 1.0);
    float r2 = 1.0 - abs(noise(p * 2.3 + 11.0) * 2.0 - 1.0);
    return r1 * r1 * 0.65 + r2 * r2 * 0.35;
  }
  // xy = směr lomu (~ -1..1), z = výška žilek (0..1)
  vec3 iceAt(vec2 p) {
    float h = iceH(p);
    float e = 0.04;
    vec2 g = vec2(iceH(p + vec2(e, 0.0)) - h, iceH(p + vec2(0.0, e)) - h) / e;
    return vec3(g * 0.18, h);
  }

  vec3 sceneAt(vec2 uv) { return texture2D(tScene, clamp(uv, 0.001, 0.999)).rgb; }

  // rozmazané video (16×9) + ještě měkčí kříž -> barva světla videa u daného místa obrazu
  vec3 vidBlurAt(vec2 uv) {
    vec2 c = clamp(uv, 0.0, 1.0);
    vec2 t = vec2(1.0 / 16.0, 1.0 / 9.0);
    return texture2D(tVidBlur, c).rgb * 0.4
      + (texture2D(tVidBlur, c + vec2(t.x, 0.0)).rgb + texture2D(tVidBlur, c - vec2(t.x, 0.0)).rgb
       + texture2D(tVidBlur, c + vec2(0.0, t.y)).rgb + texture2D(tVidBlur, c - vec2(0.0, t.y)).rgb) * 0.15;
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWP);
    vec3 N = normalize(vN);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 5.0);

    // lokální prostor skla
    vec3 Vl = normalize(vLV);
    vec3 Nl = normalize(vLN);
    vec3 p = vLocal - uCenter;
    vec2 q = vec2(dot(p, uAxA), dot(p, uAxB));
    float depth = dot(p, uAxN);

    // nedokonalost skla: pomalé vlny + šmouhy
    vec2 wob = vec2(noise(q * 2.2 + 3.0), noise(q * 2.2 + 17.0)) - 0.5;
    float smudge = noise(q * 4.0 + 40.0) * 0.6 + noise(q * 11.0) * 0.4;

    // paprsek uvnitř skla
    vec3 dIn = refract(-Vl, Nl, 1.0 / uIor);
    float dn = dot(dIn, uAxN);
    float sdn = dn >= 0.0 ? 1.0 : -1.0;
    float adn = max(abs(dn), 0.05);
    float tBack = (sdn * uHalfT - depth) / (sdn * adn);
    vec3 pb = p + dIn * tBack;
    float sdBack = sdRR(vec2(dot(pb, uAxA), dot(pb, uAxB)), uHalf, uRadius);
    float sdFront = sdRR(q, uHalf, uRadius);

    // video jako portál uvnitř skla (rovina GlassDesk = střed tloušťky)
    float tVid = -depth / (sdn * adn);
    float vidOn = (uHasVideo > 0.5 && tVid > 0.0) ? 1.0 : 0.0;
    vec3 pv = vLocal + dIn * max(tVid, 0.0);
    vec2 vuv = vec2(dot(pv, uVidU.xyz) + uVidU.w, dot(pv, uVidV.xyz) + uVidV.w);
    vuv += wob * 0.004 * uDistort;
    // jak hluboko uvnitř obrazu (0 = hrana obrazu i všechno mimo něj, 1 = od uVidFade dovnitř)
    vec2 vScale = max(vec2(length(uVidU.xyz), length(uVidV.xyz)), vec2(1e-4));
    vec2 vHalf = 0.5 / vScale;
    float sdVid = sdRR((vuv - 0.5) / vScale, vHalf, uRadius * 0.6);
    float vidIn = vidOn * smoothstep(0.0, uVidFade * min(vHalf.x, vHalf.y), -sdVid);
    vidIn = vidIn * vidIn * (3.0 - 2.0 * vidIn);

    // zamrzlé sklo: na krajích plný led (lom scény, video není vidět), ke středu led ubývá a video přibývá
    float iceK = uHasVideo > 0.5 ? uIce : 0.0;
    float iceF = mix(1.0, uIceCenter, vidIn);
    vec3 ice = iceAt(q / max(min(uHalf.x, uHalf.y), 1e-3) * uIceScale);
    vec2 iceOff = ice.xy * iceK * iceF;

    // lom scény za sklem (screen-space), disperze + matné rozmazání
    vec2 suv = gl_FragCoord.xy / uRes;
    vec3 nV = normalize((viewMatrix * vec4(N, 0.0)).xyz);
    float strength = (uIor - 1.0) * uDistort;
    vec2 off = -nV.xy * strength * 0.12 + wob * strength * 0.05 + iceOff * 0.02;
    off *= 1.0 + smoothstep(0.0, 0.04, sdBack) * 1.5; // přes hranu se obraz láme víc
    float frost = uFrost * (0.004 + smudge * 0.004) * (1.0 + iceK * iceF);
    float rnd = hash(floor(q * 900.0)) * 6.2831; // stabilní zrno matného skla (nepoblikává)
    vec3 bg = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float a = rnd + float(i) * 2.39996;
      vec2 o = off + vec2(cos(a), sin(a)) * frost * sqrt((float(i) + 0.5) / 6.0);
      bg.r += sceneAt(suv + o).r;
      bg.g += sceneAt(suv + o * 1.06).g;
      bg.b += sceneAt(suv + o * 1.12).b;
    }
    bg /= 6.0;
    // sklo pohltí a rozptýlí světlo za sebou: HDR jas (DNA, particly) se zkomprimuje,
    // jinak by prosvítal do god rays (dřív je blokovala neprůhledná deska)
    bg = bg * uBgLevel / (1.0 + bg);

    // barva skla: pohlcení + mléčný rozptyl (víc v ledu); s videem jde do barvy videa (rozmazané video)
    float tmax = max(max(uTint.r, uTint.g), max(uTint.b, 0.05));
    vec3 tint = uTint;
    float ambK = vidOn * uVidAmb;
    if (ambK > 0.5) {
      vec3 amb = vidBlurAt(vuv);
      vec3 hue = amb / max(max(max(amb.r, amb.g), amb.b), 0.04);
      tint = mix(uTint, hue * tmax, clamp(uVidTint, 0.0, 1.0));
    }
    vec3 absorb = mix(vec3(1.0), tint / tmax, 0.5);
    vec3 col = bg * absorb;
    // s videem jen slabý závoj (čisté sklo); v ledu rozptyl kopíruje žilky -> zmrzlá textura je vidět i na tmavém pozadí
    float iceRidge = smoothstep(0.35, 0.95, ice.z);
    col += tint * uMilk * (0.6 + smudge * 0.8) * mix(1.0, 0.12 + iceF * (0.15 + 0.55 * iceRidge), iceK);

    // video až po tónování skla (sklo ho nebarví), lomené ledem; průhledné: tmavá místa propouštějí scénu
    float vidM = 0.0;
    if (vidIn > 0.001) {
      vec2 vu = clamp(vuv + iceOff * 0.05, 0.0, 1.0);
      vec3 vid = texture2D(tVideo, vu).rgb;
      if (ambK > 0.5) vid = mix(vid, vidBlurAt(vu), iceF * iceK * 0.6); // přes led rozmazané
      float lum = dot(vid, vec3(0.2126, 0.7152, 0.0722));
      vidM = vidIn * uVidOpacity * mix(0.55, 1.0, smoothstep(0.02, 0.4, lum));
      col = mix(col, vid, vidM);
    }
    // hřbety ledových žilek se lesknou
    col += uRim * smoothstep(0.8, 0.98, ice.z) * iceK * iceF * 0.05;

    // odlesky: falešný softbox shora + škrábance, které se lesknou ve světle
    vec3 R = reflect(-V, N);
    float sheen = smoothstep(0.35, 0.95, R.y);
    float glint = pow(clamp(dot(R, normalize(vec3(0.4, 0.8, 0.45))), 0.0, 1.0), 6.0);
    float sc = scratchLayer(q, 0.35, 1.0) + scratchLayer(q, -0.9, 7.0) * 0.7 + scratchLayer(q, 1.7, 13.0) * 0.5;
    float surf = 1.0 - vidM * 0.5; // odlesky přes video slabší (nezmléčnit obraz)
    col += vec3(0.85, 0.9, 1.0) * sc * uScratch * (0.1 + glint * 0.5 + sheen * 0.15) * surf;
    col += vec3(0.9, 0.95, 1.0) * (sheen * 0.08 + glint * 0.12) * (0.5 + smudge) * surf;

    // hrany: fresnel na zkosení + vnitřní odraz (paprsek vyjde bokem -> totální odraz od hrany)
    float inner = smoothstep(-0.005, 0.03, sdBack);
    float innerLine = exp(-abs(sdBack) * 90.0);
    float frontLine = exp(-abs(sdFront + 0.012) * 140.0);
    // hrana svítí do barvy videa (jas zůstává podle tvRim)
    float rmax = max(max(uRim.r, uRim.g), max(uRim.b, 0.05));
    vec3 rim = ambK > 0.5 ? mix(uRim, (tint / tmax) * rmax, clamp(uVidTint, 0.0, 1.0) * 0.6) : uRim;
    col += rim * uRimStrength * (fres * 1.2 + inner * 0.25 + innerLine * 0.6 + frontLine * 0.25);

    // "měkká near plane": čím blíž kameře, tím průhlednější (střed se otevře první, okraje poslední)
    float nearFade = smoothstep(uNear.x, uNear.y, distance(cameraPosition, vWP));
    float alpha = max(uFade, uKeep) * nearFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const comp = (v, i) => (i === 0 ? v.x : i === 1 ? v.y : v.z);

// Lineární mapa lokální pozice skla -> UV videa (z geometrie GlassDesk, UV otočené o 180° jako na webu)
function fitVideoMap(deskNode, glassNode, axA, axB) {
  const g = deskNode?.geometry;
  if (!g?.attributes.uv) return null;
  const toGlass = new THREE.Matrix4().copy(glassNode.matrixWorld).invert().multiply(deskNode.matrixWorld);
  const pos = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toGlass);
    pts.push([comp(v, axA), comp(v, axB), 1 - uv.getX(i), 1 - uv.getY(i)]);
  }
  const fit = (k) => {
    let best = null;
    [0, 1].forEach(ax => {
      let lo = pts[0], hi = pts[0];
      pts.forEach(pt => { if (pt[ax] < lo[ax]) lo = pt; if (pt[ax] > hi[ax]) hi = pt; });
      const span = hi[ax] - lo[ax];
      if (span < 1e-6) return;
      const slope = (hi[k] - lo[k]) / span;
      if (!best || Math.abs(slope * span) > Math.abs(best.slope * best.span)) best = { ax, slope, span, c: lo[k] - slope * lo[ax] };
    });
    if (!best) return new THREE.Vector4();
    const dir = (best.ax === 0 ? AXES[axA] : AXES[axB]).clone().multiplyScalar(best.slope);
    return new THREE.Vector4(dir.x, dir.y, dir.z, best.c);
  };
  return { u: fit(2), v: fit(3) };
}

function analysePart(key, node, deskNode) {
  node.updateWorldMatrix(true, false);
  deskNode?.updateWorldMatrix(true, false);
  const geometry = node.geometry;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = [size.x, size.y, size.z];
  const thin = s.indexOf(Math.min(...s));
  const [axA, axB] = [0, 1, 2].filter(i => i !== thin);
  const ud = node.userData || {};
  const video = (ud.tvVideo ?? key === 'TV_Glass') && deskNode ? fitVideoMap(deskNode, node, axA, axB) : null;
  return {
    name: key,
    geometry,
    position: node.getWorldPosition(new THREE.Vector3()),
    quaternion: node.getWorldQuaternion(new THREE.Quaternion()),
    scale: node.getWorldScale(new THREE.Vector3()),
    userData: ud,
    axN: AXES[thin], axA: AXES[axA], axB: AXES[axB],
    center,
    half: new THREE.Vector2(s[axA] / 2, s[axB] / 2),
    halfT: s[thin] / 2,
    video
  };
}

// Když scénu kreslí VolumetricLightPass do vlastního render targetu (normální stav), sklo si scénu za sebou
// NEkreslí znovu: v okamžiku, kdy hlavní render dojde ke sklu (onBeforeRender prvního dílu), je v targetu
// už všechno, co je za sklem (neprůhledné + průhledné seřazené dřív), a jen se to zkopíruje (blit do 1/2
// rozlišení, ~µs). Dřív se kvůli tomu celá scéna včetně ~3 M trojúhelníků particlů kreslila 2× (≈1,2 ms GPU).
// Počítadlo nastavuje VolumetricLightPass (mount/unmount); 0 = starý samostatný render do FBO.
export const tvGlassFx = { inline: 0 };
if (import.meta.env.DEV && typeof window !== 'undefined') window.__tvGlassFx = tvGlassFx; // A/B: inline = 0 -> starý render

// Rozmazané video pro záři/barvu skla: 16×9, každý texel = průměr 6×6 vzorků z videa (1 malý pass na video a snímek)
const BLUR_W = 16, BLUR_H = 9;
const BLUR_FRAG = `${TEX_LOD0}
  uniform sampler2D tVideo;
  varying vec2 vUv;
  void main() {
    vec2 px = vec2(1.0 / ${BLUR_W}.0, 1.0 / ${BLUR_H}.0) * 1.6; // přesah do sousedů -> měkčí
    vec3 s = vec3(0.0);
    for (int i = 0; i < 6; i++) for (int j = 0; j < 6; j++)
      s += texture2D(tVideo, clamp(vUv + ((vec2(float(i), float(j)) + 0.5) / 6.0 - 0.5) * px, 0.0, 1.0)).rgb;
    gl_FragColor = vec4(s / 36.0, 1.0);
  }
`;
const VID_DEFAULTS = { opacity: 0.85, fade: 0.6, ice: 1, iceScale: 8, iceCenter: 0.12, tint: 0.5 };

function createVideoBlur() {
  const material = new THREE.ShaderMaterial({
    uniforms: { tVideo: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BLUR_FRAG,
    depthTest: false, depthWrite: false
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();
  const cache = new Map(); // video textura -> { rt, frame }
  return {
    cache,
    get(gl, tex, frame) {
      let e = cache.get(tex);
      if (!e) {
        const rt = new THREE.WebGLRenderTarget(BLUR_W, BLUR_H, {
          type: THREE.HalfFloatType, depthBuffer: false,
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
        });
        rt.texture.generateMipmaps = false;
        e = { rt, frame: -1 };
        cache.set(tex, e);
      }
      if (e.frame !== frame) {
        e.frame = frame;
        material.uniforms.tVideo.value = tex;
        const prev = gl.getRenderTarget();
        gl.setRenderTarget(e.rt);
        gl.render(scene, camera);
        gl.setRenderTarget(prev);
      }
      return e.rt.texture;
    },
    // video, které se dlouho nekreslilo (jiná stránka), uvolnit
    prune(frame) {
      for (const [tex, e] of cache) if (frame - e.frame > 600) { e.rt.dispose(); cache.delete(tex); }
    },
    dispose() {
      for (const e of cache.values()) e.rt.dispose();
      cache.clear(); material.dispose(); geo.dispose();
    }
  };
}

// Díly skla + sdílená textura se scénou bez skla (1/2 rozlišení, jen když je sklo vidět)
export function useTvGlass(nodes, deskNode, fade) {
  const gl = useThree(s => s.gl);
  const size = useThree(s => s.size);
  const dpr = useThree(s => s.viewport.dpr);

  const parts = useMemo(() => Object.keys(nodes)
    .filter(k => k.startsWith('TV_') && nodes[k].geometry)
    .map(k => analysePart(k, nodes[k], deskNode)), [nodes, deskNode]);

  const fbo = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true
  }), []);
  useEffect(() => () => fbo.dispose(), [fbo]);
  const vidBlur = useMemo(() => createVideoBlur(), []);
  useEffect(() => () => vidBlur.dispose(), [vidBlur]);

  const shared = useMemo(() => ({
    meshes: new Set(),
    copyPending: false,
    // voláno z onBeforeRender skleněného dílu uprostřed hlavního renderu (viz tvGlassFx)
    copyScene(renderer) {
      if (!this.copyPending) return;
      this.copyPending = false;
      const src = renderer.getRenderTarget();
      if (!src || src.samples > 0) return;
      const w = Math.max(1, Math.floor(src.width * FBO_SCALE));
      const h = Math.max(1, Math.floor(src.height * FBO_SCALE));
      if (fbo.width !== w || fbo.height !== h) fbo.setSize(w, h);
      renderer.initRenderTarget(fbo);
      const props = renderer.properties;
      const srcFb = props.get(src).__webglFramebuffer;
      const dstFb = props.get(fbo).__webglFramebuffer;
      if (!srcFb || !dstFb) return;
      const g = renderer.getContext();
      g.bindFramebuffer(g.READ_FRAMEBUFFER, srcFb);
      g.bindFramebuffer(g.DRAW_FRAMEBUFFER, dstFb);
      g.blitFramebuffer(0, 0, src.width, src.height, 0, 0, w, h, g.COLOR_BUFFER_BIT, g.LINEAR);
      g.bindFramebuffer(g.FRAMEBUFFER, srcFb); // = to, co má three.js v cache (READ i DRAW)
      // sklo se kreslí do tohoto targetu -> gl_FragCoord / uRes musí být v jeho rozlišení
      this.uniforms.uRes.value.set(src.width, src.height);
    },
    uniforms: {
      tScene: { value: fbo.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uFade: { value: 1 },
      uNear: { value: new THREE.Vector2(0.25, 1.1) }
    }
  }), [fbo]);

  useEffect(() => {
    const w = Math.max(1, Math.floor(size.width * dpr * FBO_SCALE));
    const h = Math.max(1, Math.floor(size.height * dpr * FBO_SCALE));
    fbo.setSize(w, h);
  }, [fbo, size.width, size.height, dpr]);

  const tmp = useRef({ frustum: new THREE.Frustum(), m: new THREE.Matrix4(), buf: new THREE.Vector2(), frame: 0 });

  // priorita 0: proběhne před hlavním renderem (VolumetricLight, priorita 1)
  useFrame((state) => {
    const u = shared.uniforms;
    const f = fade?.get ? fade.get() : 1;
    u.uFade.value = f;
    u.uTime.value = state.clock.elapsedTime;
    u.uNear.value.set(portalFx.nearStart, portalFx.nearEnd);
    // aktivní deska zůstává vidět během průletu (po jeho konci je za kamerou -> skrýt)
    const keep = portalFx.progress < 1 ? 1 : 0;
    shared.copyPending = false;
    let anyShown = false;
    for (const mesh of shared.meshes) {
      const k = mesh.userData.tvActive ? keep : 0;
      mesh.material.uniforms.uKeep.value = k;
      mesh.visible = f > 0.001 || k > 0;
      if (mesh.visible) anyShown = true;
    }
    if (!anyShown) return;

    const { frustum, m, buf } = tmp.current;
    const camera = state.camera;
    camera.updateMatrixWorld();
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(m);
    let anyVisible = false;
    const frame = ++tmp.current.frame;
    const vo = (import.meta.env.DEV && window.__tvVidOverride) || null;
    for (const mesh of shared.meshes) {
      if (!mesh.visible || !frustum.intersectsObject(mesh)) continue;
      anyVisible = true;
      // sklo s videem: rozmazané video (barva + záře skla), sdílené pro desky se stejným videem
      const mu = mesh.material.uniforms;
      const tex = mu.uHasVideo.value > 0.5 ? mu.tVideo.value : null;
      mu.uVidAmb.value = tex ? 1 : 0;
      if (tex) mu.tVidBlur.value = vidBlur.get(gl, tex, frame);
      if (vo) {
        if (vo.opacity != null) mu.uVidOpacity.value = vo.opacity;
        if (vo.fade != null) mu.uVidFade.value = vo.fade;
        if (vo.ice != null) mu.uIce.value = vo.ice;
        if (vo.iceScale != null) mu.uIceScale.value = vo.iceScale;
        if (vo.iceCenter != null) mu.uIceCenter.value = vo.iceCenter;
        if (vo.tint != null) mu.uVidTint.value = vo.tint;
      }
    }
    if ((frame & 255) === 0) vidBlur.prune(frame);
    if (!anyVisible) return;

    if (tvGlassFx.inline > 0) { shared.copyPending = true; return; }

    gl.getDrawingBufferSize(buf);
    u.uRes.value.copy(buf);

    for (const mesh of shared.meshes) { mesh.userData.tvShown = mesh.visible; mesh.visible = false; }
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(fbo);
    try {
      gl.render(state.scene, camera);
    } catch (err) {
      // Vite HMR artifact, ne runtime bug: reprodukuje se jen těsně po hot-reloadu (WebGL program
      // ještě odkazuje na starý layout uniformů, než ho three.js přerekompiluje) - viz commit message.
      // Nezpůsobuje viditelnou chybu (jen ten snímek lomu skla se nepřekreslí), proto jen 1x zaloguj.
      if (import.meta.env.DEV && !window.__tvGlassHmrWarned) {
        window.__tvGlassHmrWarned = true;
        console.warn('[TvGlass] render() selhal (pravděpodobně HMR artefakt, ne bug) - další výskyty se už nelogují:', err);
      }
    }
    gl.setRenderTarget(prevTarget);
    for (const mesh of shared.meshes) mesh.visible = mesh.userData.tvShown;
  });

  return useMemo(() => ({ parts, shared, hasVideo: parts.some(p => p.video) }), [parts, shared]);
}

function makeMaterial(part, shared) {
  const ud = part.userData;
  const v = part.video;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared.uniforms,
      tVideo: { value: null },
      uHasVideo: { value: 0 },
      uKeep: { value: 0 },
      uAxN: { value: part.axN }, uAxA: { value: part.axA }, uAxB: { value: part.axB },
      uCenter: { value: part.center },
      uHalf: { value: part.half },
      uHalfT: { value: part.halfT },
      uRadius: { value: ud.tvRadius ?? 0.08 },
      uVidU: { value: v ? v.u : new THREE.Vector4() },
      uVidV: { value: v ? v.v : new THREE.Vector4() },
      uTint: { value: new THREE.Color(ud.tvTint ?? '#8c93e0') },
      uRim: { value: new THREE.Color(ud.tvRim ?? '#d6ecff') },
      uRimStrength: { value: ud.tvRimStrength ?? 1.0 },
      uMilk: { value: ud.tvMilk ?? 0.15 },
      uIor: { value: ud.tvIor ?? 1.6 },
      uDistort: { value: ud.tvDistort ?? 1.0 },
      uFrost: { value: ud.tvFrost ?? 1.0 },
      uScratch: { value: ud.tvScratch ?? 1.0 },
      uBgLevel: { value: ud.tvBackground ?? 0.45 },
      tVidBlur: { value: null },
      uVidAmb: { value: 0 },
      uVidTint: { value: ud.tvVidTint ?? VID_DEFAULTS.tint },
      uVidOpacity: { value: ud.tvVidOpacity ?? VID_DEFAULTS.opacity },
      uVidFade: { value: ud.tvVidFade ?? VID_DEFAULTS.fade },
      uIce: { value: ud.tvIce ?? VID_DEFAULTS.ice },
      uIceScale: { value: ud.tvIceScale ?? VID_DEFAULTS.iceScale },
      uIceCenter: { value: ud.tvIceCenter ?? VID_DEFAULTS.iceCenter }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    toneMapped: false
  });
}

function TvGlassMesh({ part, shared, videoTexture, active }) {
  const ref = useRef();
  const material = useMemo(() => makeMaterial(part, shared), [part, shared]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.uniforms.tVideo.value = videoTexture || null;
    material.uniforms.uHasVideo.value = videoTexture && part.video ? 1 : 0;
  }, [material, videoTexture, part]);

  useEffect(() => {
    const mesh = ref.current;
    mesh.userData.tvActive = !!active;
    mesh.userData.tvPart = part;
    shared.meshes.add(mesh);
    tvRegistry.add(mesh);
    mesh.onBeforeRender = (renderer) => shared.copyScene(renderer);
    return () => { shared.meshes.delete(mesh); tvRegistry.delete(mesh); mesh.onBeforeRender = () => {}; };
  }, [shared, active, part]);

  return (
    <mesh
      ref={ref}
      geometry={part.geometry}
      material={material}
      position={part.position}
      quaternion={part.quaternion}
      scale={part.scale}
      renderOrder={3}
    />
  );
}

export function TvGlass({ tv, videoTexture, active = false }) {
  return tv.parts.map(p => (
    <TvGlassMesh key={p.name} part={p} shared={tv.shared} videoTexture={videoTexture} active={active} />
  ));
}
