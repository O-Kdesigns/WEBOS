import * as THREE from 'three';

// Kolize particlů se solidy (INSIDE). Particly sedí na povrchu solidu (část i kousek pod ním) a levitace / myš
// je zatlačí dovnitř -> schovají se. Plná kolize by byla drahá, proto: každý particl dostane 1× (Web Worker
// solidCollisionWorker.js, přesně přes BVH) vlastní rovinu povrchu = nejbližší bod solidu + normála, v lokálním
// prostoru svého nodu. GPGPU shader (utils.js) každý snímek jen hlídá, aby střed particlu byl aspoň poloměr
// (+ margin) nad touto rovinou -> 1 texture fetch na particl, žádná 3D mřížka (ta měla chybu > poloměr particlu).
// Config `particleCollision` (vše volitelné): enabled (true), margin (0.3 = +30 % poloměru), band (0.15 = do jaké
// vzdálenosti od povrchu se particly hlídají, jednotky GLB). DEV: window.__collisionOverride.

export const COLLISION_DEFAULTS = { enabled: true, margin: 0.3, band: 0.15 };

let worker = null, nextId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./solidCollisionWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const cb = pending.get(e.data.id); pending.delete(e.data.id); cb?.(e.data.data); };
  }
  return worker;
}

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3();

// solids = nody solidů (useGLTF), nodeMatrix = matrixWorld particle nodu (stejný prostor GLB),
// points = Float32Array xyz cílů particlů v lokálním prostoru nodu. Vrací Promise<Float32Array> (RGBA na particl).
export function computeSurfacePlanes(solids, nodeMatrix, points, band) {
  _inv.copy(nodeMatrix).invert();
  const meshes = [];
  solids.forEach((s) => {
    s.updateWorldMatrix(true, true);
    s.traverse((m) => {
      if (!m.isMesh || !m.geometry?.attributes.position) return;
      _m.multiplyMatrices(_inv, m.matrixWorld);
      const src = m.geometry.attributes.position;
      const pos = new Float32Array(src.count * 3);
      for (let i = 0; i < src.count; i++) _v.fromBufferAttribute(src, i).applyMatrix4(_m).toArray(pos, i * 3);
      const idx = m.geometry.index ? Uint32Array.from(m.geometry.index.array) : Uint32Array.from({ length: src.count }, (_, i) => i);
      meshes.push({ pos, idx });
    });
  });
  // band je v jednotkách GLB, body jsou v lokálním prostoru nodu (scale nodu)
  const localBand = band / Math.max(1e-6, nodeMatrix.getMaxScaleOnAxis());
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    getWorker().postMessage({ id, meshes, points, band: localBand }, [...meshes.flatMap((m) => [m.pos.buffer, m.idx.buffer]), points.buffer]);
  });
}
