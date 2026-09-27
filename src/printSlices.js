import * as THREE from 'three';

// Řezy solidů pro tiskovou linku: při startu tisku se každý solid jednou rozřeže na NB vodorovných vrstev (world Y)
// a pro každou vrstvu se uloží 4 krajní body řezu (min/max x, min/max z). Za snímek se vezme vrstva ve výšce
// uPrintY, krajní body se promítnou na obrazovku a linka vede od nejlevějšího k nejpravějšímu bodu, který se
// právě tiskne. Kde v dané výšce žádný solid není, linka není (hasLine = false).
// Body se ukládají ve world prostoru při stavbě + inverze tehdejší matice -> náklon obsahu myší se dopočítá.

const EMPTY = { list: [], NB: 0, yMin: 0, yMax: 1 };

export function buildSlices(meshes, yMin, yMax, NB = 160) {
  const h = (yMax - yMin) / NB;
  if (!(h > 0)) return EMPTY;
  const out = { list: [], NB, yMin, yMax };
  const v = new THREE.Vector3();
  meshes.forEach((mesh) => {
    const g = mesh.geometry, pos = g?.attributes?.position;
    if (!pos) return;
    mesh.updateWorldMatrix(true, false);
    const n = pos.count, W = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z;
    }
    // ext: pro každou vrstvu 4 body (minX, maxX, minZ, maxZ) × xyz
    const ext = new Float32Array(NB * 12), has = new Uint8Array(NB);
    const add = (b, x, y, z) => {
      const o = b * 12;
      if (!has[b]) {
        has[b] = 1;
        for (let k = 0; k < 4; k++) { ext[o + k * 3] = x; ext[o + k * 3 + 1] = y; ext[o + k * 3 + 2] = z; }
        return;
      }
      if (x < ext[o]) { ext[o] = x; ext[o + 1] = y; ext[o + 2] = z; }
      if (x > ext[o + 3]) { ext[o + 3] = x; ext[o + 4] = y; ext[o + 5] = z; }
      if (z < ext[o + 8]) { ext[o + 6] = x; ext[o + 7] = y; ext[o + 8] = z; }
      if (z > ext[o + 11]) { ext[o + 9] = x; ext[o + 10] = y; ext[o + 11] = z; }
    };
    const edge = (b, i, j, yc) => {
      const yi = W[i * 3 + 1], yj = W[j * 3 + 1];
      if ((yi - yc) * (yj - yc) > 0) return;
      if (yi === yj) { add(b, W[i * 3], yc, W[i * 3 + 2]); add(b, W[j * 3], yc, W[j * 3 + 2]); return; }
      const t = (yc - yi) / (yj - yi);
      add(b, W[i * 3] + (W[j * 3] - W[i * 3]) * t, yc, W[i * 3 + 2] + (W[j * 3 + 2] - W[i * 3 + 2]) * t);
    };
    const idx = g.index ? g.index.array : null;
    const tris = idx ? idx.length / 3 : n / 3;
    for (let t = 0; t < tris; t++) {
      const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const ya = W[a * 3 + 1], yb = W[b * 3 + 1], yc = W[c * 3 + 1];
      const lo = Math.min(ya, yb, yc), hi = Math.max(ya, yb, yc);
      const b0 = Math.max(0, Math.floor((lo - yMin) / h)), b1 = Math.min(NB - 1, Math.floor((hi - yMin) / h));
      for (let bin = b0; bin <= b1; bin++) {
        // řez ve středu vrstvy (malý trojúhelník celý uvnitř vrstvy -> jeho nejbližší výška)
        const y = Math.min(hi, Math.max(lo, yMin + (bin + 0.5) * h));
        edge(bin, a, b, y); edge(bin, b, c, y); edge(bin, c, a, y);
      }
    }
    out.list.push({ mesh, ext, has, inv: mesh.matrixWorld.clone().invert(), m: new THREE.Matrix4() });
  });
  return out;
}

const tmp = new THREE.Vector3();

// Linka ve výšce y (world): outA = nejlevější, outB = nejpravější bod řezu na obrazovce (uv). false = v té výšce nic není.
export function sliceLine(sl, y, camera, outA, outB) {
  if (!sl.list.length) return false;
  const f = (y - sl.yMin) / (sl.yMax - sl.yMin) * sl.NB;
  const bi = Math.floor(f);
  if (bi < 0 || bi >= sl.NB) return false;
  // plynule mezi sousedními vrstvami (bez skoků po vrstvách)
  const fr = f - bi - 0.5, bn = fr < 0 ? bi - 1 : bi + 1, w = Math.abs(fr);
  let minX = Infinity, maxX = -Infinity;
  for (let e = 0; e < sl.list.length; e++) {
    const it = sl.list[e];
    if (!it.has[bi]) continue;
    const useN = bn >= 0 && bn < sl.NB && it.has[bn];
    it.m.multiplyMatrices(it.mesh.matrixWorld, it.inv);
    const o = bi * 12, on = bn * 12;
    for (let k = 0; k < 12; k += 3) {
      const x = it.ext[o + k], z = it.ext[o + k + 2];
      tmp.set(useN ? x + (it.ext[on + k] - x) * w : x, y, useN ? z + (it.ext[on + k + 2] - z) * w : z);
      tmp.applyMatrix4(it.m).project(camera);
      if (tmp.z > 1) continue; // za kamerou
      if (tmp.x < minX) { minX = tmp.x; outA.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5); }
      if (tmp.x > maxX) { maxX = tmp.x; outB.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5); }
    }
  }
  return minX < Infinity;
}
