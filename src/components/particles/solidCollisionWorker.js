// Web Worker pro kolize particlů se solidy (SolidCollision.js).
// Každému particlu najde nejbližší bod povrchu solidu (BVH, přesně) a vrátí jeho "vlastní" rovinu povrchu:
// xyz = normála ven, w = dot(normála, bod povrchu). Vše v lokálním prostoru particle nodu.
// Particl dál než `band` od povrchu dostane nulu = bez kolize.
// Navíc (když má solid UV) UV nejbližšího bodu: u, v, vzdálenost, 1 = platné – particl si z něj bere barvu
// zapečeného světla solidu (SolidLink bakedLight, jelly shader).
import { BufferGeometry, BufferAttribute, Vector2, Vector3, Triangle } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Otevřené plochy (např. "magma" víčko) nemají vnitřek -> do kolizí nepatří.
function isClosed(pos, idx) {
  const ids = new Map();
  const vid = new Int32Array(pos.length / 3);
  for (let i = 0; i < vid.length; i++) {
    const k = Math.round(pos[i * 3] * 1e4) + ',' + Math.round(pos[i * 3 + 1] * 1e4) + ',' + Math.round(pos[i * 3 + 2] * 1e4);
    let v = ids.get(k);
    if (v === undefined) { v = ids.size; ids.set(k, v); }
    vid[i] = v;
  }
  const edges = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = vid[idx[i + j]], b = vid[idx[i + (j + 1) % 3]];
      const k = a < b ? a * 4194304 + b : b * 4194304 + a;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let open = 0;
  edges.forEach((n) => { if (n === 1) open++; });
  return open <= edges.size * 0.001;
}

self.onmessage = (e) => {
  const { id, meshes, points, band } = e.data;
  const count = points.length / 3;
  const out = new Float32Array(count * 4);
  const surf = new Float32Array(count * 4);
  const keep = meshes.filter((m) => isClosed(m.pos, m.idx));
  if (!keep.length) { self.postMessage({ id, data: out, surf }, [out.buffer, surf.buffer]); return; }

  // sloučit uzavřené meshe do jedné geometrie
  let vCount = 0, iCount = 0;
  keep.forEach((m) => { vCount += m.pos.length; iCount += m.idx.length; });
  const pos = new Float32Array(vCount), idx = new Uint32Array(iCount);
  // UV: meshe bez UV dostanou -1 (particl u nich nemá platné UV)
  const uvs = new Float32Array(vCount / 3 * 2).fill(-1);
  let vo = 0, io = 0;
  keep.forEach((m) => {
    if (m.uv) uvs.set(m.uv, vo / 3 * 2);
    pos.set(m.pos, vo);
    for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i] + vo / 3;
    vo += m.pos.length; io += m.idx.length;
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  const bvh = new MeshBVH(geo);

  const p = new Vector3(), d = new Vector3(), n = new Vector3(), tri = new Triangle(), bary = new Vector3();
  const uvA = new Vector2(), uvB = new Vector2(), uvC = new Vector2();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  for (let i = 0; i < count; i++) {
    p.fromArray(points, i * 3);
    const r = bvh.closestPointToPoint(p, hit, 0, band);
    if (!r) continue;
    const f = r.faceIndex * 3;
    tri.setFromAttributeAndIndices(geo.attributes.position, idx[f], idx[f + 1], idx[f + 2]);
    tri.getNormal(n);
    // směr od povrchu k particlu (u hran = rovina přes hranu), na povrchu normála plochy
    d.subVectors(p, r.point);
    if (r.distance > 1e-5) { d.multiplyScalar((d.dot(n) < 0 ? -1 : 1) / r.distance); n.copy(d); }
    out[i * 4] = n.x; out[i * 4 + 1] = n.y; out[i * 4 + 2] = n.z;
    out[i * 4 + 3] = n.dot(r.point);
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    if (uvs[a * 2] >= 0) {
      tri.getBarycoord(r.point, bary);
      uvA.fromArray(uvs, a * 2); uvB.fromArray(uvs, b * 2); uvC.fromArray(uvs, c * 2);
      surf[i * 4] = uvA.x * bary.x + uvB.x * bary.y + uvC.x * bary.z;
      surf[i * 4 + 1] = uvA.y * bary.x + uvB.y * bary.y + uvC.y * bary.z;
      surf[i * 4 + 2] = r.distance;
      surf[i * 4 + 3] = 1;
    }
  }
  self.postMessage({ id, data: out, surf }, [out.buffer, surf.buffer]);
};
