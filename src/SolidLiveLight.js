import * as THREE from 'three';

// Živé zapečené světlo (nápad Olivera 2026-09-28): rudé světlo na solidu (bakedLight, SolidLink.jsx) svítí jen tam,
// kde jsou právě particly obsahu, které ho "vyzařují" (Xelith Obsah0 = emisní díly). Odfoukne-li je myš nebo ještě
// nedoletěly (emerge při 3D tisku), místo na solidu potemní; vrátí-li se, rozsvítí se.
// Jak: 3D mřížka kolem solidu (buňka `liveCell` m, prostor solidu), vrstvy (z) vedle sebe v 2D atlasu.
//  - klid: 1× na CPU z cílových pozic particlů (jen ty, co mají platné UV na solidu = sedí u něj)
//  - teď: každý snímek na GPU, každý particl = 1 bod do své buňky (aditivně, HalfFloat), ~35 k bodů
//  Shader solidu (SolidLink patchSolidLook) čte obě mřížky trilineárně a světlo násobí poměrem teď/klid.
//  Kde v klidu žádné particly nejsou (vzdálený odraz), zůstává světlo celé.
// Registrují se particle systémy obsahu spárovaného se solidem (GeometryParticleObject, emerge + UV na solidu).

export const liveLight = {
  systems: new Set(),   // { mesh, compute, count, points (lokální cíle nodu), surf (UV data), key }
  on: 0,
  uniforms: {
    tLiveNow: { value: null },
    tLiveRest: { value: null },
    uLiveOn: { value: 0 },
    uLiveMat: { value: new THREE.Matrix4() },   // world -> souřadnice mřížky (v buňkách)
    uLiveRes: { value: new THREE.Vector3(1, 1, 1) },
    uLiveTiles: { value: new THREE.Vector2(1, 1) },
    uLiveMin: { value: 0.6 }                     // pod kolik particlů v klidu (na buňku) se světlo nemění
  }
};
if (import.meta.env.DEV && typeof window !== 'undefined') window.__liveLight = liveLight;

// GLSL pro solid: masku světla podle particlů (0..1), g = souřadnice mřížky
export const LIVE_GLSL = /* glsl */`
  uniform sampler2D tLiveNow, tLiveRest;
  uniform float uLiveOn, uLiveMin;
  uniform mat4 uLiveMat;
  uniform vec3 uLiveRes;
  uniform vec2 uLiveTiles;
  vec2 liveAtlas(vec2 xy, float z) {
    vec2 tile = vec2(mod(z, uLiveTiles.x), floor(z / uLiveTiles.x));
    // uvnitř vrstvy s odstupem půl texelu, ať bilineár nesáhne do sousední vrstvy
    vec2 p = clamp(xy, vec2(0.5), uLiveRes.xy - 0.5) + tile * uLiveRes.xy;
    return p / (uLiveTiles * uLiveRes.xy);
  }
  vec2 liveSample(vec3 g) {
    float fz = clamp(g.z - 0.5, 0.0, uLiveRes.z - 1.0);
    float z0 = floor(fz), z1 = min(z0 + 1.0, uLiveRes.z - 1.0), t = fz - z0;
    vec2 a = vec2(textureLod(tLiveNow, liveAtlas(g.xy, z0), 0.0).r, textureLod(tLiveRest, liveAtlas(g.xy, z0), 0.0).r);
    vec2 b = vec2(textureLod(tLiveNow, liveAtlas(g.xy, z1), 0.0).r, textureLod(tLiveRest, liveAtlas(g.xy, z1), 0.0).r);
    return mix(a, b, t);
  }
  float liveMask(vec3 worldPos) {
    if (uLiveOn < 0.001) return 1.0;
    vec3 g = (uLiveMat * vec4(worldPos, 1.0)).xyz;
    if (any(lessThan(g, vec3(0.0))) || any(greaterThan(g, uLiveRes))) return 1.0;
    vec2 nr = liveSample(g);
    float ratio = clamp(nr.x / max(nr.y, 1e-3), 0.0, 1.0);
    // v klidu tu (skoro) nic není -> světlo nezávislé na particlech
    return mix(1.0, mix(1.0, ratio, smoothstep(uLiveMin * 0.5, uLiveMin * 2.0, nr.y)), uLiveOn);
  }
`;

const SPLAT_VERT = /* glsl */`
  uniform sampler2D tPositions;
  uniform sampler2D tSurfUV;
  uniform mat4 uLiveMat;
  uniform vec3 uLiveRes;
  uniform vec2 uLiveTiles;
  attribute vec2 aComputeUV;
  void main() {
    gl_PointSize = 1.0;
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0); // mimo = zahozeno
    if (texture2D(tSurfUV, aComputeUV).w < 0.5) return;
    vec3 g = (uLiveMat * vec4(texture2D(tPositions, aComputeUV).xyz, 1.0)).xyz;
    if (any(lessThan(g, vec3(0.0))) || any(greaterThanEqual(g, uLiveRes))) return;
    vec3 c = floor(g);
    vec2 tile = vec2(mod(c.z, uLiveTiles.x), floor(c.z / uLiveTiles.x));
    vec2 px = (c.xy + 0.5 + tile * uLiveRes.xy) / (uLiveTiles * uLiveRes.xy);
    gl_Position = vec4(px * 2.0 - 1.0, 0.0, 1.0);
  }
`;
const SPLAT_FRAG = /* glsl */`
  void main() { gl_FragColor = vec4(1.0); }
`;

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _box = new THREE.Box3();

let gpu = null;
function getGpu() {
  if (gpu) return gpu;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tPositions: { value: null }, tSurfUV: { value: null },
      uLiveMat: liveLight.uniforms.uLiveMat, uLiveRes: liveLight.uniforms.uLiveRes, uLiveTiles: liveLight.uniforms.uLiveTiles
    },
    vertexShader: SPLAT_VERT, fragmentShader: SPLAT_FRAG,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true
  });
  gpu = { material, scene: new THREE.Scene(), camera: new THREE.Camera(), points: new Map(), target: null, rest: null, gridKey: '', restKey: '' };
  if (import.meta.env.DEV) liveLight._gpu = gpu;
  return gpu;
}

// Mřížka podle bboxu solidu (lokální prostor meshe, buňka `cell` ve world metrech)
function setupGrid(mesh, cell) {
  const g = getGpu();
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const s = mesh.matrixWorld.getMaxScaleOnAxis();
  const cl = cell / Math.max(1e-6, s);                 // buňka v lokálních jednotkách
  _box.copy(geo.boundingBox).expandByScalar(cl * 1.5);
  const size = _box.getSize(_v);
  const res = new THREE.Vector3(Math.ceil(size.x / cl), Math.ceil(size.y / cl), Math.ceil(size.z / cl)).min(new THREE.Vector3(128, 128, 128));
  const tilesX = Math.ceil(Math.sqrt(res.z * res.y / res.x));
  const tilesY = Math.ceil(res.z / tilesX);
  const key = [geo.uuid, cell].join('|');
  if (g.gridKey !== key) {
    g.gridKey = key;
    g.restKey = '';
    g.target?.dispose();
    g.target = new THREE.WebGLRenderTarget(res.x * tilesX, res.y * tilesY, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    g.target.texture.generateMipmaps = false;
    g.res = res; g.tiles = new THREE.Vector2(tilesX, tilesY); g.min = _box.min.clone(); g.cl = cl;
  }
  liveLight.uniforms.uLiveRes.value.copy(g.res);
  liveLight.uniforms.uLiveTiles.value.copy(g.tiles);
  // world -> mřížka: (inv(meshWorld) · p − min) / buňka
  const mat = liveLight.uniforms.uLiveMat.value;
  mat.copy(mesh.matrixWorld).invert();
  _m.makeTranslation(-g.min.x, -g.min.y, -g.min.z);
  mat.premultiply(_m);
  _m.makeScale(1 / g.cl, 1 / g.cl, 1 / g.cl);
  mat.premultiply(_m);
  return g;
}

// Klidová mřížka na CPU z cílů particlů (lokální prostor nodu -> world přes uFinalMat -> mřížka)
function buildRest(g) {
  const w = g.target.width, h = g.target.height;
  const counts = new Float32Array(w * h);
  const res = g.res, tiles = g.tiles, mat = liveLight.uniforms.uLiveMat.value;
  liveLight.systems.forEach((sys) => {
    const fm = sys.compute.posVar.material.uniforms.uFinalMat?.value;
    if (!fm) return;
    _m.multiplyMatrices(mat, fm);
    for (let i = 0; i < sys.count; i++) {
      if (sys.surf[i * 4 + 3] < 0.5) continue;
      _v.fromArray(sys.points, i * 3).applyMatrix4(_m);
      if (_v.x < 0 || _v.y < 0 || _v.z < 0 || _v.x >= res.x || _v.y >= res.y || _v.z >= res.z) continue;
      const cz = Math.floor(_v.z);
      const x = (cz % tiles.x) * res.x + Math.floor(_v.x);
      const y = Math.floor(cz / tiles.x) * res.y + Math.floor(_v.y);
      counts[y * w + x] += 1;
    }
  });
  const half = new Uint16Array(w * h * 4);
  for (let i = 0; i < w * h; i++) half[i * 4] = THREE.DataUtils.toHalfFloat(counts[i]);
  g.rest?.dispose();
  g.rest = new THREE.DataTexture(half, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  g.rest.minFilter = g.rest.magFilter = THREE.LinearFilter;
  g.rest.needsUpdate = true;
}

function pointsFor(sys) {
  const g = getGpu();
  let p = g.points.get(sys);
  if (!p || p.userData.key !== sys.key) {
    if (p) { g.scene.remove(p); p.geometry.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sys.count * 3), 3));
    geo.setAttribute('aComputeUV', new THREE.BufferAttribute(sys.computeUVs, 2));
    p = new THREE.Points(geo, g.material.clone());
    p.material.uniforms.uLiveMat = liveLight.uniforms.uLiveMat;
    p.material.uniforms.uLiveRes = liveLight.uniforms.uLiveRes;
    p.material.uniforms.uLiveTiles = liveLight.uniforms.uLiveTiles;
    p.frustumCulled = false;
    p.userData.key = sys.key;
    g.points.set(sys, p);
    g.scene.add(p);
  }
  return p;
}

// Za snímek (SolidLinkDriver): mesh = solid se zapečeným světlem (null = vypnout)
export function updateLiveLight(renderer, mesh, amount, cell) {
  const u = liveLight.uniforms;
  if (!mesh || amount <= 0.001 || liveLight.systems.size === 0) { u.uLiveOn.value = 0; return; }
  const g = setupGrid(mesh, cell);
  const restKey = g.gridKey + '|' + [...liveLight.systems].map((s) => s.key).join(',');
  if (g.restKey !== restKey) { g.restKey = restKey; buildRest(g); }
  // staré systémy pryč
  g.points.forEach((p, sys) => { if (!liveLight.systems.has(sys)) { g.scene.remove(p); p.geometry.dispose(); p.material.dispose(); g.points.delete(sys); } });
  liveLight.systems.forEach((sys) => {
    const p = pointsFor(sys);
    p.material.uniforms.tPositions.value = sys.mesh.material?.uniforms?.tPositions?.value ?? null;
    p.material.uniforms.tSurfUV.value = sys.surfTex;
  });
  const prev = renderer.getRenderTarget();
  const clear = renderer.getClearAlpha();
  renderer.getClearColor(_clearCol);
  renderer.setRenderTarget(g.target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, false, false);
  renderer.render(g.scene, g.camera);
  renderer.setClearColor(_clearCol, clear);
  renderer.setRenderTarget(prev);
  u.tLiveNow.value = g.target.texture;
  u.tLiveRest.value = g.rest;
  u.uLiveOn.value = amount;
}
const _clearCol = new THREE.Color();
