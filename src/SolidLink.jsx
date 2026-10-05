import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { printFx } from './SolidPrint';
import { liveLight, LIVE_GLSL, updateLiveLight } from './SolidLiveLight';
import { prewarm } from './prewarm';

// Světelná vazba solidů a particlů (INSIDE) + vzhled povrchu solidů. Bez skutečných světel:
// - particly -> solid: particly projektu se shluknou do PL_N "sond" (těžiště hustoty, váha = počet bodů).
//   Shader solidu z nich počítá měkké difuzní + lesklé přisvícení. Barva = tint × průměrná barva videa
//   (video, které particly zobrazují, se 1× za snímek zprůměruje do textury 1×1, bez readbacku na CPU).
// - solid -> particly: solid (sondy z jeho vrcholů) přisvítí particly kolem sebe. Barva = solidLight.color
//   + žár 3D tisku (printFx heat), takže tištěná vrstva rozsvítí particly okolo.
// - vzhled solidu: barva/kov/drsnost, utlumení přímých světel scény a odrazů HDRI, tiskové vrstvy v normále, zrno drsnosti, lem.
// - zapečené světlo (bakedLight): solid z GLB s emisní texturou (Xelith: rudé světlo z emisních dílů Obsah0, Cycles bake
//   v ASSETS/newworldorder9ai.blend, tools/bake_xelith.py). Emise se nečte jako záře, ale jako světlo dopadající
//   na kov: difuze × barva, odlesk × specular (+ Fresnel, zrno povrchu), jen malý podíl jako čistá záře.
// Nastavení je per stránka v particlesSettings: solidMaterial, particleLight, solidLight, bakedLight (vše volitelné,
// bez klíčů se nic nemění = původní materiál z GLB). DEV: window.__linkOverride = { solidMaterial, particleLight,
// solidLight } nahradí config živě, window.__linkFx = stav.

export const PL_N = 12; // sondy particlů (světlo na solid)
export const SL_N = 8;  // sondy solidu (světlo na particly)

const vec4s = (n) => Array.from({ length: n }, () => new THREE.Vector4());

export const linkUniforms = {
  // vzhled solidu
  uLookOn: { value: 0 },
  uLookColor: { value: new THREE.Color('#ffffff') },
  uLookMetal: { value: 1 },
  uLookRough: { value: 0.3 },
  uLookEnv: { value: 1 },
  uLookLayers: { value: 0 },
  uLookGrain: { value: 0 },
  uLookRim: { value: 0 },
  uLookDirect: { value: 1 },
  uLookGlow: { value: new THREE.Color(0, 0, 0) },
  // zapečené světlo (emisní textura solidu)
  uBakeAmt: { value: 1 },
  uBakeDiffuse: { value: 1 },
  uBakeSpec: { value: 1 },
  uBakeGlow: { value: 0.1 },
  uBakeSheen: { value: 1 },
  // zvednutí slabých/středních míst zapečeného světla (plně světlá a černá zůstávají), uBakeNorm = síla emise z GLB
  uBakeLift: { value: 0 },
  uBakeNorm: { value: 1 },
  // particly -> solid
  uPLightAmt: { value: 0 },
  uPLightColor: { value: new THREE.Color('#ffffff') },
  uPLightVideo: { value: 0 },
  uPLightAvg: { value: null },
  uPLightRadius: { value: 0.35 },
  uPLightWrap: { value: 0.5 },
  uPLightPos: { value: vec4s(PL_N) },
  // solid -> particly
  uSLightAmt: { value: 0 },
  uSLightColor: { value: new THREE.Color('#000000') },
  uSLightRadius: { value: 0.4 },
  uSLightPos: { value: vec4s(SL_N) },
  // zapečené světlo -> particly obsahu u solidu (jelly: barva z textury v místě nejbližšího bodu solidu)
  tBakeLight: { value: null },
  uBakePart: { value: 0 },
  uBakePTint: { value: 0.8 },
  uBakePGlow: { value: 0.15 }
};

export const linkFx = { uniforms: linkUniforms, probesP: 0, probesS: 0 };
if (import.meta.env.DEV && typeof window !== 'undefined') window.__linkFx = linkFx;

// --- GLSL: solid (MeshStandard/Physical přes onBeforeCompile, potřebuje vPrintW + printNoise ze SolidPrint) ---
// křivka zapečeného světla: 1 - (1-x)^(1+lift) na jasu (odstín zůstane). x = hodnota textury 0..1 (světlo / norm).
// Černá zůstane černá (dole jen zesílení 1+lift, šum JPEG nevyskočí), plně světlá beze změny, slabé a střední se zvednou.
export const BAKE_LIFT_GLSL = /* glsl */`
  vec3 bakeLift(vec3 l, float norm, float lift) {
    float p = max(l.r, max(l.g, l.b)) / max(norm, 1e-5);
    if (lift <= 0.0 || p <= 1e-6) return l;
    float q = 1.0 - pow(1.0 - clamp(p, 0.0, 1.0), 1.0 + lift);
    return l * (q / p);
  }
`;

const SOLID_DECL = /* glsl */`
  uniform float uLookOn, uLookMetal, uLookRough, uLookEnv, uLookLayers, uLookGrain, uLookRim, uLookDirect;
  uniform vec3 uLookColor, uLookGlow;
  uniform float uBakeAmt, uBakeDiffuse, uBakeSpec, uBakeGlow, uBakeSheen, uBakeLift, uBakeNorm;
  ${BAKE_LIFT_GLSL}
  uniform float uPLightAmt, uPLightVideo, uPLightRadius, uPLightWrap;
  uniform vec3 uPLightColor;
  uniform sampler2D uPLightAvg;
  uniform vec4 uPLightPos[${PL_N}];
`;

// Volá SolidPrint.patchMaterial v onBeforeCompile (po vlastních úpravách tisku).
// baked = materiál má emisní texturu se zapečeným světlem (jiný program, customProgramCacheKey v SolidPrint).
export function patchSolidLook(shader, baked = false) {
  Object.assign(shader.uniforms, linkUniforms);
  if (baked) Object.assign(shader.uniforms, liveLight.uniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + SOLID_DECL + (baked ? LIVE_GLSL : ''))
    .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, uLookColor, uLookOn);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      // zrno povrchu: drsnost se jemně mění (matný tiskový materiál místo zrcadla)
      float lookGrain = printNoise(vPrintW * 60.0) * 0.6 + printNoise(vPrintW * 190.0) * 0.4;
      roughnessFactor = mix(roughnessFactor, clamp(uLookRough + (lookGrain - 0.5) * uLookGrain, 0.04, 1.0), uLookOn);`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, uLookMetal, uLookOn);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      // tiskové vrstvy: vodorovné rýhy ve world Y (stejná hustota jako žhavé vrstvy tisku), v dálce zmizí (AA)
      if (uLookOn > 0.5 && uLookLayers > 0.0) {
        float lk = uPrintLayers;
        float laa = clamp(1.0 - fwidth(vPrintW.y * lk) * 0.6, 0.0, 1.0);
        vec3 lg = (viewMatrix * vec4(0.0, cos(vPrintW.y * lk) * uLookLayers * laa, 0.0, 0.0)).xyz;
        normal = normalize(normal - (lg - dot(lg, normal) * normal));
      }`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${baked ? `// zapečené světlo: emise (textura × síla z GLB) = světlo dopadající na povrch, jako záře jen malý podíl
      // živé: světlo jen tam, kde jsou právě particly, které ho vyzařují (SolidLiveLight.js)
      vec3 bakedLight = bakeLift(totalEmissiveRadiance, uBakeNorm, uBakeLift) * uBakeAmt * liveMask(vPrintW);
      totalEmissiveRadiance = bakedLight * uBakeGlow;` : ''}
      totalEmissiveRadiance += uLookGlow;`)
    .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
      // odrazy HDRI (preset city) na solidu utlumit – jinak se leskne světlem, které ve scéně není
      #if defined( RE_IndirectSpecular )
        radiance *= mix(1.0, uLookEnv, uLookOn);
      #endif
      iblIrradiance *= mix(1.0, uLookEnv, uLookOn);`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      // přímá světla scény (kamerový spot 25 bez útlumu) přepálí jakékoli albedo do bílé -> na solidu utlumit
      reflectedLight.directDiffuse *= mix(1.0, uLookDirect, uLookOn);
      reflectedLight.directSpecular *= mix(1.0, uLookDirect, uLookOn);
      if (uPLightAmt > 0.001) {
        vec3 plN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        vec3 plV = normalize(cameraPosition - vPrintW);
        float plR2 = uPLightRadius * uPLightRadius;
        float plSum = 0.0;
        for (int i = 0; i < ${PL_N}; i++) {
          vec4 pp = uPLightPos[i];
          vec3 pl = pp.xyz - vPrintW;
          float d2 = dot(pl, pl);
          float wrap = max(0.0, (dot(plN, pl * inversesqrt(max(d2, 1e-6))) + uPLightWrap) / (1.0 + uPLightWrap));
          plSum += pp.w * wrap / (1.0 + d2 / plR2);
        }
        vec3 plAvg = texture2D(uPLightAvg, vec2(0.5)).rgb;
        // průměr videa normalizovaný na jas (barva z videa, síla z nastavení)
        vec3 plVid = plAvg / max(0.08, max(plAvg.r, max(plAvg.g, plAvg.b)));
        vec3 plCol = uPLightColor * mix(vec3(1.0), plVid, uPLightVideo) * plSum * uPLightAmt;
        float plF = pow(1.0 - clamp(dot(plN, plV), 0.0, 1.0), 3.0);
        reflectedLight.indirectDiffuse += plCol * material.diffuseColor;
        // kov nemá difuzi -> světlo particlů se musí ukázat v odlesku (a na hranách jako lem)
        reflectedLight.indirectSpecular += plCol * (material.specularColor * (1.0 - material.roughness * 0.6) * 0.5 + plF * uLookRim);
      }`)
    // až za AO: zapečené světlo už stínění obsahuje (AO z GLB tlumí jen odrazy okolí a přímá světla scény)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>
      ${baked ? `{
        float bkNV = clamp(dot(normal, geometryViewDir), 0.0, 1.0);
        reflectedLight.indirectDiffuse += bakedLight * material.diffuseColor * uBakeDiffuse;
        // kov nemá difuzi -> rudé světlo hlavně v odlesku: hladší = silnější, pod úhlem se blíží bílé (Fresnel),
        // zrno povrchu ho rozbije, aby nebyl plochý jako nálepka
        vec3 bkSpec = mix(material.specularColor, vec3(1.0), pow(1.0 - bkNV, 4.0) * uBakeSheen) * (1.0 - material.roughness * 0.5);
        reflectedLight.indirectSpecular += bakedLight * bkSpec * (0.55 + 0.9 * lookGrain) * uBakeSpec;
      }` : ''}`);
}

// --- GLSL: particly (jelly video / physical), přisvícení od solidu ---
export const PARTICLE_DECL = /* glsl */`
  uniform float uSLightAmt, uSLightRadius;
  uniform vec3 uSLightColor;
  uniform vec4 uSLightPos[${SL_N}];
  vec3 solidLightAt(vec3 wp, vec3 wn) {
    if (uSLightAmt <= 0.001) return vec3(0.0);
    float r2 = uSLightRadius * uSLightRadius;
    float s = 0.0;
    for (int i = 0; i < ${SL_N}; i++) {
      vec4 sp = uSLightPos[i];
      vec3 l = sp.xyz - wp;
      float d2 = dot(l, l);
      float wrap = 0.35 + 0.65 * max(0.0, dot(wn, l * inversesqrt(max(d2, 1e-6))));
      s += sp.w * wrap / (1.0 + d2 / r2);
    }
    return uSLightColor * s * uSLightAmt;
  }
`;

// Particle materiál: sdílené uniformy (hodnota pro všechny instance, driver jen přepisuje čísla).
export function attachParticleLink(uniforms) {
  uniforms.uSLightAmt = linkUniforms.uSLightAmt;
  uniforms.uSLightColor = linkUniforms.uSLightColor;
  uniforms.uSLightRadius = linkUniforms.uSLightRadius;
  uniforms.uSLightPos = linkUniforms.uSLightPos;
  uniforms.tBakeLight = linkUniforms.tBakeLight;
  uniforms.uBakePart = linkUniforms.uBakePart;
  uniforms.uBakePTint = linkUniforms.uBakePTint;
  uniforms.uBakePGlow = linkUniforms.uBakePGlow;
  uniforms.uBakeLift = linkUniforms.uBakeLift;
}

// Shluknutí bodů do n sond: mřížka 4×4×3 přes bounding box, neprázdné buňky -> těžiště + počet, top n.
function buildProbes(points, n) {
  if (!points.length) return [];
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3()).max(new THREE.Vector3(1e-4, 1e-4, 1e-4));
  const G = [4, 4, 3];
  const cells = new Map();
  for (const p of points) {
    const ix = Math.min(G[0] - 1, Math.floor((p.x - box.min.x) / size.x * G[0]));
    const iy = Math.min(G[1] - 1, Math.floor((p.y - box.min.y) / size.y * G[1]));
    const iz = Math.min(G[2] - 1, Math.floor((p.z - box.min.z) / size.z * G[2]));
    const k = ix + iy * 8 + iz * 64;
    let c = cells.get(k);
    if (!c) { c = { s: new THREE.Vector3(), n: 0 }; cells.set(k, c); }
    c.s.add(p); c.n++;
  }
  const list = [...cells.values()].sort((a, b) => b.n - a.n).slice(0, n);
  const maxN = list[0].n;
  return list.map((c) => new THREE.Vector4(c.s.x / c.n, c.s.y / c.n, c.s.z / c.n, c.n / maxN));
}

// vrcholy nodu v prostoru rodiče obsahu (= GLB world, stejně jako particly i solidy v ProjectContent)
function collectPoints(node, stride) {
  const out = [];
  const v = new THREE.Vector3();
  node.updateWorldMatrix(true, true);
  node.traverse((o) => {
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / stride));
    for (let i = 0; i < pos.count; i += step) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
  });
  return out;
}

const AVG_FRAG = /* glsl */`
  uniform sampler2D tVideo;
  void main() {
    vec3 s = vec3(0.0);
    for (int y = 0; y < 6; y++) for (int x = 0; x < 6; x++) s += texture2D(tVideo, (vec2(float(x), float(y)) + 0.5) / 6.0).rgb;
    gl_FragColor = vec4(s / 36.0, 1.0);
  }
`;

const DEFAULT_PL = { enabled: false, color: '#ffffff', useVideoColor: true, intensity: 1.5, radius: 0.35, wrap: 0.5 };
// bez klíče bakedLight platí výchozí (solid se zapečeným světlem ho má vždy, jinak by emise svítila plochou září)
const DEFAULT_BL = { enabled: true, intensity: 1, diffuse: 1, specular: 1.2, glow: 0.08, sheen: 1, particleTint: 0.9, particleGlow: 0.012, live: 1, liveCell: 0.04, lift: 0 };
const _findBaked = (m) => { if (!linkFx.bakedMesh && m.material?.emissiveMap) linkFx.bakedMesh = m; };
const DEFAULT_SL = { enabled: false, color: '#ff7a3a', intensity: 0.5, radius: 0.4, printHeat: 1.0, selfGlow: 0 };

// Renderuje se v ProjectContent jako sourozenec solidů a particlů (stejný rodič = stejný prostor).
export function SolidLinkDriver({ nodes, settings, videoTexture, transitionProgress, isSolidNode }) {
  const { gl } = useThree();
  const groupRef = useRef();
  const selected = settings?.selectedNodes;

  // sondy v prostoru obsahu (počítá se jen při změně nodů, ne za běhu)
  const probes = useMemo(() => {
    const pPts = [], sPts = [];
    (selected || []).forEach((name) => {
      const node = nodes?.[name];
      if (!node) return;
      if (isSolidNode(name)) sPts.push(...collectPoints(node, 6000));
      else pPts.push(...collectPoints(node, 6000));
    });
    return { p: buildProbes(pPts, PL_N), s: buildProbes(sPts, SL_N) };
  }, [nodes, selected, isSolidNode]);

  const avg = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    const material = new THREE.ShaderMaterial({
      uniforms: { tVideo: { value: null } },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: AVG_FRAG,
      depthTest: false, depthWrite: false
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    return { target, material, geo, scene, camera: new THREE.Camera() };
  }, []);
  useEffect(() => () => { avg.target.dispose(); avg.material.dispose(); avg.geo.dispose(); }, [avg]);
  // předkompilovat hned (na pozadí, prewarm.js), jinak se shader skládá až v prvním snímku tisku
  useEffect(() => prewarm(gl, avg.scene, avg.camera), [gl, avg]);

  useEffect(() => {
    linkFx.probesP = probes.p.length; linkFx.probesS = probes.s.length;
    return () => {
      // stránka zmizela -> nic nesvítí, materiál zpět na GLB
      const u = linkUniforms;
      u.uLookOn.value = 0; u.uPLightAmt.value = 0; u.uSLightAmt.value = 0; u.uLookGlow.value.setRGB(0, 0, 0);
    };
  }, [probes]);

  useFrame(() => {
    const u = linkUniforms;
    const g = groupRef.current;
    if (!g) return;
    const cfgSrc = (import.meta.env.DEV && window.__linkOverride) || settings || {};
    const sm = cfgSrc.solidMaterial;
    const pl = cfgSrc.particleLight;
    const sl = cfgSrc.solidLight;
    const bl = { ...DEFAULT_BL, ...(cfgSrc.bakedLight || {}) };
    const tp = transitionProgress?.get ? transitionProgress.get() : (transitionProgress ?? 0);
    const inside = THREE.MathUtils.smoothstep(tp, 0.6, 1.0);
    const printP = printFx.progress;
    const solidsShown = printP > 0 && printFx.meshes.size > 0;

    // vzhled solidu
    const lookOn = !!(sm && sm.enabled !== false);
    u.uLookOn.value = lookOn ? 1 : 0;
    if (lookOn) {
      u.uLookColor.value.set(sm.color ?? '#8c8780');
      u.uLookMetal.value = sm.metalness ?? 0.5;
      u.uLookRough.value = sm.roughness ?? 0.5;
      u.uLookEnv.value = sm.reflections ?? 0.2;
      u.uLookLayers.value = sm.layerLines ?? 0.3;
      u.uLookGrain.value = sm.grain ?? 0.25;
      u.uLookRim.value = sm.rim ?? 0.6;
      u.uLookDirect.value = sm.directLight ?? 0.35;
    }

    // zapečené světlo
    u.uBakeAmt.value = bl.enabled ? bl.intensity : 0;
    u.uBakeDiffuse.value = bl.diffuse;
    u.uBakeSpec.value = bl.specular;
    u.uBakeGlow.value = bl.glow;
    u.uBakeSheen.value = bl.sheen;
    // particly u solidu: stejná textura a síla jako solid (emise z GLB × intensity), naběhne s průletem
    // (ne až se začátkem tisku – particly by do té doby byly tmavé barvou videa a pak skočily do rudé)
    linkFx.bakedMesh = null;
    printFx.meshes.forEach(_findBaked);
    const bm = linkFx.bakedMesh;
    u.tBakeLight.value = bm ? bm.material.emissiveMap : null;
    u.uBakePart.value = bm && bl.enabled ? bm.material.emissiveIntensity * bl.intensity * inside : 0;
    u.uBakePTint.value = bl.particleTint;
    u.uBakePGlow.value = bl.particleGlow;
    u.uBakeLift.value = bl.lift;
    if (bm) u.uBakeNorm.value = bm.material.emissiveIntensity;
    updateLiveLight(gl, bm && bl.enabled && solidsShown ? bm : null, bl.live * inside, bl.liveCell);

    g.updateWorldMatrix(true, false);
    const mw = g.matrixWorld;

    // particly -> solid
    const plOn = !!(pl && pl.enabled) && solidsShown && probes.p.length > 0;
    u.uPLightAmt.value = plOn ? (pl.intensity ?? DEFAULT_PL.intensity) * inside : 0;
    if (plOn) {
      u.uPLightColor.value.set(pl.color ?? DEFAULT_PL.color);
      u.uPLightRadius.value = pl.radius ?? DEFAULT_PL.radius;
      u.uPLightWrap.value = pl.wrap ?? DEFAULT_PL.wrap;
      const useVid = (pl.useVideoColor ?? DEFAULT_PL.useVideoColor) && !!videoTexture;
      u.uPLightVideo.value = useVid ? 1 : 0;
      if (useVid) {
        avg.material.uniforms.tVideo.value = videoTexture;
        const prev = gl.getRenderTarget();
        gl.setRenderTarget(avg.target);
        gl.render(avg.scene, avg.camera);
        gl.setRenderTarget(prev);
        u.uPLightAvg.value = avg.target.texture;
      }
      for (let i = 0; i < PL_N; i++) {
        const dst = u.uPLightPos.value[i];
        const src = probes.p[i];
        if (!src) { dst.w = 0; continue; }
        dst.set(src.x, src.y, src.z, 1).applyMatrix4(mw);
        dst.w = src.w;
      }
    }

    // solid -> particly (+ vlastní záře solidu); žár tisku přidá barvu a sílu
    const slOn = !!(sl && sl.enabled) && solidsShown && probes.s.length > 0;
    const heat = printFx.uniforms.uPrintHeat.value * (sl?.printHeat ?? DEFAULT_SL.printHeat);
    const slBase = slOn ? (sl.intensity ?? DEFAULT_SL.intensity) : 0;
    u.uSLightAmt.value = slOn ? inside : 0;
    u.uLookGlow.value.setRGB(0, 0, 0);
    if (slOn) {
      u.uSLightRadius.value = sl.radius ?? DEFAULT_SL.radius;
      // žár svítí jen ze sond u tištěné vrstvy (výška řezu uPrintY), zbytek solidu základní silou
      const printY = printFx.uniforms.uPrintY.value;
      const reach = Math.max(0.08, printFx.uniforms.uPrintBand.value * 3);
      let baseSum = 0, heatSum = 0;
      for (let i = 0; i < SL_N; i++) {
        const dst = u.uSLightPos.value[i];
        const src = probes.s[i];
        if (!src) { dst.w = 0; continue; }
        dst.set(src.x, src.y, src.z, 1).applyMatrix4(mw);
        const hb = heat * Math.exp(-Math.abs(dst.y - printY) / reach);
        dst.w = src.w * (slBase + hb);
        baseSum += src.w * slBase; heatSum += src.w * hb;
      }
      // barva = mix nastavené barvy a žáru podle poměru sil
      u.uSLightColor.value.set(sl.color ?? DEFAULT_SL.color).lerp(printFx.uniforms.uPrintGlow.value, heatSum / Math.max(1e-4, baseSum + heatSum));
      const glow = (sl.selfGlow ?? DEFAULT_SL.selfGlow) * inside;
      if (glow > 0) u.uLookGlow.value.set(sl.color ?? DEFAULT_SL.color).multiplyScalar(glow);
    }
  });

  return <group ref={groupRef} />;
}
