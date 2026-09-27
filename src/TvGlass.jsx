import { useMemo, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { portalFx } from './PortalTransition';

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

const fragmentShader = `
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

  vec3 sceneAt(vec2 uv) { return texture2D(tScene, clamp(uv, 0.001, 0.999)).rgb; }

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

    // lom scény za sklem (screen-space), disperze + matné rozmazání
    vec2 suv = gl_FragCoord.xy / uRes;
    vec3 nV = normalize((viewMatrix * vec4(N, 0.0)).xyz);
    float strength = (uIor - 1.0) * uDistort;
    vec2 off = -nV.xy * strength * 0.12 + wob * strength * 0.05;
    off *= 1.0 + smoothstep(0.0, 0.04, sdBack) * 1.5; // přes hranu se obraz láme víc
    float frost = uFrost * (0.004 + smudge * 0.004);
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

    vec3 col = bg;

    // video jako portál uvnitř skla (rovina GlassDesk = střed tloušťky)
    float tVid = -depth / (sdn * adn);
    if (uHasVideo > 0.5 && tVid > 0.0) {
      vec3 pv = vLocal + dIn * tVid;
      vec2 vuv = vec2(dot(pv, uVidU.xyz) + uVidU.w, dot(pv, uVidV.xyz) + uVidV.w);
      vuv += wob * 0.004 * uDistort;
      vec2 e = min(vuv, 1.0 - vuv);
      float m = smoothstep(0.0, 0.07, e.x) * smoothstep(0.0, 0.1, e.y);
      vec3 vid = texture2D(tVideo, clamp(vuv, 0.0, 1.0)).rgb;
      col = mix(col, vid, m * 0.92);
    }

    // barva skla: pohlcení + mléčný rozptyl
    float tmax = max(max(uTint.r, uTint.g), max(uTint.b, 0.05));
    vec3 absorb = mix(vec3(1.0), uTint / tmax, 0.5);
    col *= absorb;
    col += uTint * uMilk * (0.6 + smudge * 0.8);

    // odlesky: falešný softbox shora + škrábance, které se lesknou ve světle
    vec3 R = reflect(-V, N);
    float sheen = smoothstep(0.35, 0.95, R.y);
    float glint = pow(clamp(dot(R, normalize(vec3(0.4, 0.8, 0.45))), 0.0, 1.0), 6.0);
    float sc = scratchLayer(q, 0.35, 1.0) + scratchLayer(q, -0.9, 7.0) * 0.7 + scratchLayer(q, 1.7, 13.0) * 0.5;
    col += vec3(0.85, 0.9, 1.0) * sc * uScratch * (0.1 + glint * 0.5 + sheen * 0.15);
    col += vec3(0.9, 0.95, 1.0) * (sheen * 0.08 + glint * 0.12) * (0.5 + smudge);

    // hrany: fresnel na zkosení + vnitřní odraz (paprsek vyjde bokem -> totální odraz od hrany)
    float inner = smoothstep(-0.005, 0.03, sdBack);
    float innerLine = exp(-abs(sdBack) * 90.0);
    float frontLine = exp(-abs(sdFront + 0.012) * 140.0);
    col += uRim * uRimStrength * (fres * 1.2 + inner * 0.25 + innerLine * 0.6 + frontLine * 0.25);

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

// Díly skla + sdílený FBO se scénou bez skla (1 render ve 1/2 rozlišení, jen když je sklo vidět)
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

  const shared = useMemo(() => ({
    meshes: new Set(),
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

  const tmp = useRef({ frustum: new THREE.Frustum(), m: new THREE.Matrix4(), buf: new THREE.Vector2() });

  // priorita 0: proběhne před hlavním renderem (VolumetricLight, priorita 1)
  useFrame((state) => {
    const u = shared.uniforms;
    const f = fade?.get ? fade.get() : 1;
    u.uFade.value = f;
    u.uTime.value = state.clock.elapsedTime;
    u.uNear.value.set(portalFx.nearStart, portalFx.nearEnd);
    // aktivní deska zůstává vidět během průletu (po jeho konci je za kamerou -> skrýt)
    const keep = portalFx.progress < 1 ? 1 : 0;
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
    for (const mesh of shared.meshes) {
      if (mesh.visible && frustum.intersectsObject(mesh)) { anyVisible = true; break; }
    }
    if (!anyVisible) return;

    gl.getDrawingBufferSize(buf);
    u.uRes.value.copy(buf);

    for (const mesh of shared.meshes) { mesh.userData.tvShown = mesh.visible; mesh.visible = false; }
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(fbo);
    gl.render(state.scene, camera);
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
      uBgLevel: { value: ud.tvBackground ?? 0.45 }
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
    return () => { shared.meshes.delete(mesh); tvRegistry.delete(mesh); };
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
