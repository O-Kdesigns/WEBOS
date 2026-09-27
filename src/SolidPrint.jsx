import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { portalFx } from './PortalTransition';
import { patchSolidLook } from './SolidLink';

// 3D tisk solidů při vstupu do projektu (INSIDE).
// Až particly doletí do tvaru projektu, solidy "vyrostou" odspodu nahoru: vše nad řezem (uPrintY, world Y)
// se zahodí, vrstva u řezu žhne (láva -> oranžová -> tmavě rudá) a přes otevřený řez je vidět žhavé jádro.
// Žhavá vrstva se navíc kreslí do malé masky (s hloubkovou mlhou INSIDE), ze které VolumetricLight dělá
// paprsky jako god rays v ORBITu: tiskárna svítí z místa ZA kamerou, paprsky vedou z tištěné vrstvy ke kameře,
// na obrazovce tedy utíkají od vrstvy ven od úběžníku (printFx.center, výchozí střed obrazu).
// Sdílené uniformy = jedna hodnota pro všechny solidy, useFrame jen přepisuje čísla (žádné alokace).

const shared = {
  uPrintY: { value: -1e4 },
  uPrintBand: { value: 0.1 },
  uPrintNoise: { value: 0.05 },
  uPrintHeat: { value: 0 },
  uPrintTime: { value: 0 },
  uPrintIntensity: { value: 3 },
  uPrintLayers: { value: 260 },
  uPrintCool: { value: new THREE.Color('#7a1204') },
  uPrintGlow: { value: new THREE.Color('#ff5a12') },
  uPrintHot: { value: new THREE.Color('#fff0c8') },
  // hloubková mlha INSIDE (near, far, curve, density) + max – plní VolumetricLight, maska ji musí respektovat,
  // jinak žhne i vrstva objektů schovaných v mlze (plave v prázdnu)
  uPrintFog: { value: new THREE.Vector4(0.7, 4.5, 1.2, 1.05) },
  uPrintFogMax: { value: 0.7 }
};

export const printFx = {
  uniforms: shared,
  meshes: new Set(),
  progress: 0,          // 0 = nic nevytištěno, 1 = hotovo
  rays: 0,              // síla paprsků pro VolumetricLight (0 = vypnuto, maska se nekreslí)
  rayLength: 0.9,
  center: new THREE.Vector2(0.5, 0.33),
  inward: true,         // true = paprsky se sbíhají z vrstvy do bodu center (kamera), false = utíkají od něj ven
  frame: true,          // true = paprsky se sbíhají k okrajům rámu (obrazovka zmenšená frameScale), přebíjí center
  frameScale: 1,        // 1 = rám = okraje obrazovky, 0 = smrskne se do středu obrazovky
  bevel: 0.3,           // zaoblení rohů rámu
  renderMask: null      // (gl, camera) => texture | null, nastaví SolidPrintDriver
};
if (import.meta.env.DEV && typeof window !== 'undefined') window.__printFx = printFx;

const GLSL_COMMON = /* glsl */`
  uniform float uPrintY, uPrintBand, uPrintNoise, uPrintHeat, uPrintTime, uPrintIntensity, uPrintLayers;
  uniform vec3 uPrintCool, uPrintGlow, uPrintHot;
  varying vec3 vPrintW;
  float printHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float printNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(printHash(i), printHash(i + vec3(1,0,0)), f.x), mix(printHash(i + vec3(0,1,0)), printHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(printHash(i + vec3(0,0,1)), printHash(i + vec3(1,0,1)), f.x), mix(printHash(i + vec3(0,1,1)), printHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // vzdálenost pod řezem (<= 0 = vytištěno), řez je lehce roztřepený šumem jako hořící hrana
  float printDist() {
    float n = printNoise(vPrintW * 14.0 + vec3(0.0, uPrintTime * 0.6, 0.0)) * 0.65 + printNoise(vPrintW * 41.0) * 0.35;
    return vPrintW.y - uPrintY + (n - 0.5) * uPrintNoise;
  }
  vec3 printRamp(float h) {
    vec3 c = mix(uPrintCool, uPrintGlow, smoothstep(0.0, 0.55, h));
    return mix(c, uPrintHot, smoothstep(0.6, 1.0, h));
  }
  // žár u řezu: 1 na hraně, exponenciálně chladne směrem dolů, jiskří a má tiskové vrstvy
  float printHeatAt(float pd, float bandMul) {
    float h = uPrintHeat * exp(pd / (uPrintBand * bandMul));
    float flicker = 0.75 + 0.5 * printNoise(vPrintW * 36.0 + vec3(uPrintTime * 3.0));
    float layers = 0.72 + 0.28 * sin(vPrintW.y * uPrintLayers);
    return h * flicker * layers;
  }
`;

function patchMaterial(src) {
  const mat = src.clone();
  const keepBack = src.side === THREE.DoubleSide;
  mat.side = THREE.DoubleSide;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPrintW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPrintW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float printPd = printDist();
        if (printPd > 0.0) discard;
        float printInner = gl_FrontFacing ? 0.0 : printHeatAt(printPd, 2.5);
        ${keepBack ? '' : 'if (!gl_FrontFacing && printInner < 0.03) discard;'}`)
      .replace('#include <opaque_fragment>', `
        if (gl_FrontFacing) {
          float printH = printHeatAt(printPd, 1.0);
          outgoingLight = mix(outgoingLight, outgoingLight * 0.25, clamp(printH, 0.0, 1.0) * 0.8)
                        + printRamp(clamp(printH, 0.0, 1.0)) * printH * uPrintIntensity;
        } else if (printInner > 0.0) {
          // vnitřek přes otevřený řez = žhavé jádro
          outgoingLight = printRamp(clamp(printInner, 0.0, 1.0)) * printInner * uPrintIntensity * 0.8;
        }
        #include <opaque_fragment>`);
    // vzhled povrchu + světelná vazba s particly (SolidLink.jsx)
    patchSolidLook(shader);
  };
  mat.customProgramCacheKey = () => 'solidprint' + (keepBack ? 'D' : 'F');
  return mat;
}

// Klon solidu dostane vlastní materiály s tiskovým shaderem a zaregistruje se do printFx.
export function usePrintableSolid(root) {
  useEffect(() => {
    if (!root) return;
    const owned = [];
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) {
        o.material = o.material.map((m) => { const p = patchMaterial(m); owned.push(p); return p; });
      } else if (o.material) {
        o.material = patchMaterial(o.material);
        owned.push(o.material);
      }
      o.visible = printFx.progress > 0;
      printFx.meshes.add(o);
      meshes.push(o);
    });
    return () => {
      meshes.forEach((m) => printFx.meshes.delete(m));
      owned.forEach((m) => m.dispose());
    };
  }, [root]);
}

const MASK_VERT = /* glsl */`
  varying vec3 vPrintW;
  varying float vViewZ;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPrintW = wp.xyz;
    vec4 vp = viewMatrix * wp;
    vViewZ = -vp.z;
    gl_Position = projectionMatrix * vp;
  }
`;
const MASK_FRAG = /* glsl */`
  ${GLSL_COMMON}
  uniform vec4 uPrintFog;
  uniform float uPrintFogMax;
  varying float vViewZ;
  void main() {
    float pd = printDist();
    if (pd > 0.0) discard;
    float h = printHeatAt(pd, gl_FrontFacing ? 1.0 : 2.0);
    // stejná hloubková mlha jako v INSIDE pasu -> žár vzdálených (v mlze neviditelných) částí nesvítí
    float nz = clamp((vViewZ - uPrintFog.x) / max(0.001, uPrintFog.y - uPrintFog.x), 0.0, 1.0);
    float fogA = nz >= 1.0 ? uPrintFogMax : clamp(pow(nz, uPrintFog.z) * uPrintFog.w, 0.0, uPrintFogMax);
    float vis = 1.0 - fogA;
    // jen horká vrstva; zbytek zapíše černou (a hloubku), aby zakryl žár za sebou
    gl_FragColor = vec4(printRamp(clamp(h, 0.0, 1.0)) * h * uPrintIntensity * vis, 1.0);
  }
`;

const ease = (t) => { const s = t * t * (3 - 2 * t); return t * 0.4 + s * 0.6; };

// leaving = uživatel odchází z projektu: nejdřív se odtiskne, pak onUnprinted() (App přepne na ORBIT)
export function SolidPrintDriver({ viewMode, transitionProgress, appConfig, leaving = false, onUnprinted }) {
  const { size, gl } = useThree();
  const baseCfg = appConfig?.solidPrint || {};
  const enabled = baseCfg.enabled ?? true;

  const gpu = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: MASK_VERT,
      fragmentShader: MASK_FRAG,
      side: THREE.DoubleSide
    });
    const scene = new THREE.Scene();
    return { material, scene, proxies: new Map() };
  }, []);

  const dpr = Math.min(gl.getPixelRatio(), 1.25);
  const target = useMemo(() => {
    const t = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(size.width * dpr / 4)),
      Math.max(1, Math.floor(size.height * dpr / 4)),
      { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true }
    );
    t.texture.generateMipmaps = false;
    return t;
  }, [size.width, size.height, dpr]);

  useEffect(() => () => target.dispose(), [target]);
  useEffect(() => () => { gpu.material.dispose(); gpu.scene.clear(); gpu.proxies.clear(); }, [gpu]);

  const st = useRef({ wait: 0, yMin: 0, yMax: 1, box: new THREE.Box3(), clear: new THREE.Color() });

  // proxy meshe v masce sdílí geometrii se solidem (nevlastní ji -> nedisposovat)
  const sync = useMemo(() => {
    const seen = new Set();
    const addProxy = (mesh) => {
      seen.add(mesh);
      let p = gpu.proxies.get(mesh);
      if (!p) {
        p = new THREE.Mesh(mesh.geometry, gpu.material);
        p.matrixAutoUpdate = false;
        p.frustumCulled = false;
        gpu.proxies.set(mesh, p);
        gpu.scene.add(p);
      }
      // proxy visí přímo ve scéně s identitou -> render si matrixWorld přepočítá z matrix,
      // proto se kopíruje do matrix (samotný matrixWorld by se přepsal na identitu)
      p.matrix.copy(mesh.matrixWorld);
      p.matrixWorld.copy(mesh.matrixWorld);
    };
    const dropStale = (p, mesh) => {
      if (!seen.has(mesh)) { gpu.scene.remove(p); gpu.proxies.delete(mesh); }
    };
    return () => { seen.clear(); printFx.meshes.forEach(addProxy); gpu.proxies.forEach(dropStale); };
  }, [gpu]);

  useEffect(() => {
    const s = st.current;
    printFx.maskTarget = target;
    if (import.meta.env.DEV) printFx._gpu = gpu;
    printFx.renderMask = (renderer, camera) => {
      if (printFx.rays <= 0.001 || printFx.meshes.size === 0) return null;
      sync();
      renderer.getClearColor(s.clear);
      const alpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 1);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(gpu.scene, camera);
      renderer.setClearColor(s.clear, alpha);
      return target.texture;
    };
    return () => { printFx.renderMask = null; printFx.maskTarget = null; };
  }, [gpu, target, sync]);

  // předvázané callbacky pro forEach (žádné closures v useFrame)
  const fx = useMemo(() => {
    const s = st.current;
    return {
      expand: (m) => s.box.expandByObject(m),
      show: (m) => { if (!m.visible) m.visible = true; },
      hide: (m) => { if (m.visible) m.visible = false; }
    };
  }, []);

  useFrame((state, delta) => {
    const s = st.current;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    const u = shared;
    u.uPrintTime.value = state.clock.getElapsedTime();

    if (!enabled) {
      printFx.progress = 1; printFx.rays = 0;
      u.uPrintY.value = 1e4; u.uPrintHeat.value = 0;
      printFx.meshes.forEach(fx.show);
      if (leaving) onUnprinted?.();
      return;
    }

    // DEV: window.__printOverride = {...} nahradí config solidPrint (živé ladění bez reloadu)
    const cfg = (import.meta.env.DEV && window.__printOverride) || baseCfg;
    const duration = Math.max(0.1, cfg.duration ?? 4.5);
    const tp = transitionProgress?.get ? transitionProgress.get() : 0;
    const prev = printFx.progress;
    if (viewMode === 'INSIDE' && !leaving) {
      // tisk začne, až kamera doletí portálem a particly se ustálí ve tvaru projektu
      if (portalFx.progress >= 1 && tp > (cfg.settle ?? 0.97)) s.wait += dt; else s.wait = 0;
      if (s.wait > (cfg.delay ?? 0.25)) printFx.progress = Math.min(1, prev + dt / duration);
    } else {
      s.wait = 0;
      // bez solidů není co odtiskovat -> hned
      printFx.progress = printFx.meshes.size === 0 ? 0 : Math.max(0, prev - dt * (cfg.exitSpeed ?? 4) / duration);
    }
    // DEV: window.__printHold = 0..1 zmrazí tisk na dané fázi (ladění vzhledu)
    if (import.meta.env.DEV && typeof window.__printHold === 'number') printFx.progress = window.__printHold;
    const p = printFx.progress;

    // výška tiskové "podložky" se zmrazí při startu tisku (náklon myší ji pak nerozhoupe)
    if (prev === 0 && p > 0 && printFx.meshes.size) {
      s.box.makeEmpty();
      printFx.meshes.forEach(fx.expand);
      s.yMin = s.box.min.y; s.yMax = s.box.max.y;
    }

    const band = cfg.band ?? Math.max(0.02, (s.yMax - s.yMin) * 0.07);
    u.uPrintBand.value = band;
    u.uPrintNoise.value = cfg.edgeNoise ?? band * 0.6;
    u.uPrintIntensity.value = cfg.intensity ?? 3;
    u.uPrintLayers.value = (cfg.layers ?? 90) * Math.PI * 2 / Math.max(0.01, s.yMax - s.yMin);
    if (cfg.coolColor) u.uPrintCool.value.set(cfg.coolColor);
    if (cfg.glowColor) u.uPrintGlow.value.set(cfg.glowColor);
    if (cfg.hotColor) u.uPrintHot.value.set(cfg.hotColor);

    // řez jede od spodku až nad vršek (+3 pásma), aby na konci žár plynule vychladl
    u.uPrintY.value = p <= 0 ? -1e4 : THREE.MathUtils.lerp(s.yMin - band * 0.5, s.yMax + band * 4, ease(p));
    const heat = THREE.MathUtils.smoothstep(p, 0, 0.04) * (1 - THREE.MathUtils.smoothstep(p, 0.85, 1));
    u.uPrintHeat.value = heat;

    printFx.rays = heat * (cfg.raysStrength ?? 10.0);
    printFx.rayLength = cfg.rayLength ?? 0.9;
    // paprsky vedou z tištěné vrstvy do bodu center (výchozí dole uprostřed, 1/3 výšky od spodku = "z kamery");
    // raysInward:false = staré god rays, tiskárna ZA kamerou, paprsky utíkají od center ven
    printFx.inward = cfg.raysInward ?? true;
    printFx.center.set(cfg.raysCenterX ?? 0.5, cfg.raysCenterY ?? 0.33);
    // raysFrame (výchozí): paprsky se sbíhají k okrajům obrazovky zmenšené na raysFrameScale, rohy zaoblené raysBevel
    printFx.frame = (cfg.raysFrame ?? true) && printFx.inward;
    printFx.frameScale = cfg.raysFrameScale ?? 1;
    printFx.bevel = cfg.raysBevel ?? 0.3;

    printFx.meshes.forEach(p > 0 ? fx.show : fx.hide);
    if (leaving && p <= 0) onUnprinted?.();
  });

  return null;
}
