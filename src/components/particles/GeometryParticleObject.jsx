import React, { useRef, useMemo, useLayoutEffect, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getColors, useGPGPU, useParticleLogic, getAdaptiveSphereSegments } from './utils';
import { ParticleMaterial } from './ParticleMaterial';
import { printFx } from '../../SolidPrint';
import { computeSurfacePlanes, COLLISION_DEFAULTS } from './SolidCollision';
import { liveLight } from '../../SolidLiveLight';
import { mark } from '../../debug/FrameProbe';

// Emerge (obsah k solidu): výchozí hodnoty, config `particleEmerge` je přepíše (DEV: window.__emergeOverride).
const EMERGE_DEFAULTS = {
  floorGap: 0.12,    // o kolik pod spodkem obsahu začíná čekací vrstva (world)
  floorDepth: 0.3,   // tloušťka čekací vrstvy
  spread: 0.35,      // rozházení čekacích míst do stran
  arc: 1.4,          // výška oblouku jiskry (gravitace)
  lead: 0.3,         // předstih vyletění před řezem (world Y) = délka letu
  leadRandom: 0.6,   // náhodnost předstihu 0..1
  swirl: 0.06,       // víření během letu
  drag: 3.0          // odpor jiskry (víc = prudší dolet do cíle)
};
const _corner = new THREE.Vector3();
const _delta = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _ident = new THREE.Matrix4();

// Deterministic per-particle random in [0,1). Using Math.random() re-rolled DNA sizes/positions every
// time particlesData was recomputed (project switch) -> the DNA visibly "shimmered". Seeded = identical DNA.
const rand = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Cache mezi připojeními: při přepnutí projektu se particle systémy odpojí a při návratu znovu připojí –
// vrcholy nodu i data particlů jsou pro stejný node + nastavení pořád stejná, tak se nepočítají znovu
// (dřív 5–20 ms JS na systém při každém přepnutí, Xelith má 4 systémy).
const vertexCache = new WeakMap();   // geometry -> { vertices, center }
const dataCache = new Map();         // klíč nastavení -> particlesData
const DATA_CACHE_MAX = 24;
const RESERVE_SETTLE = 4; // s klidu DNA, než se přestanou kreslit particly v rezervní kostce (návrat trvá ~1–2 s)

export function GeometryParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance, transitionProgress, dnaGeometry, dnaMatrix, nodeMatrix, currentIndex }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
  const { gl } = useThree();

  const posX = settings.objectX ?? 0.0;
  const posY = settings.objectY ?? 0.0;
  const posZ = settings.objectZ ?? 0.0;
  
  const { vertices, center } = useMemo(() => {
    const geom = settings.customGeometry;
    if (geom && vertexCache.has(geom)) return vertexCache.get(geom);
    const tMark = performance.now();
    const pts = [];
    const c = new THREE.Vector3();
    
    if (geom) {
      geom.computeBoundingBox();
      geom.boundingBox.getCenter(c);

      const posAttribute = geom.attributes.position;
      const colorAttribute = geom.attributes.color;
      const v = new THREE.Vector3();
      const col = new THREE.Color();
      
      for (let i = 0; i < posAttribute.count; i++) {
        v.fromBufferAttribute(posAttribute, i);
        
        let pointColor = new THREE.Color('#ffffff');
        if (colorAttribute) {
          col.fromBufferAttribute(colorAttribute, i);
          pointColor = col.clone();
        }
        
        pts.push({ v: v.clone(), c: pointColor });
      }

      for (let i = pts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pts[i], pts[j]] = [pts[j], pts[i]];
      }
    }

    mark(`particly: vrcholy nodu ${pts.length} načteny, JS ${(performance.now() - tMark).toFixed(1)} ms`);
    const res = { vertices: pts, center: c };
    if (geom) vertexCache.set(geom, res);
    return res;
  }, [settings.customGeometry]);

  const radiusScale = settings.radius ?? 1.0;
  const densityPercent = settings.densityPercent ?? 100;
  const count = vertices.length > 0 ? Math.max(1, Math.floor(vertices.length * (densityPercent / 100))) : 0;
  const [segW, segH] = useMemo(() => getAdaptiveSphereSegments(count, settings), [count, settings]);

  const dnaBaseScaleCfg = appConfig?.dnaSettings?.baseSize ?? 0.08;
  // Editor ORBIT "Náhodnost velikosti": jen zvětšování (0 = beze změny), většina trochu, pár kuliček až 3×
  const dnaSizeRandCfg = appConfig?.dnaSettings?.sizeRandomness ?? 0;
  const particlesData = useMemo(() => {
    const cacheKey = [settings.customGeometry?.uuid, count, settings.baseSize, settings.sizeRandomness, settings.radius,
      settings.colorMode, settings.baseColor, settings.sizeMultiplier, dnaGeometry?.uuid,
      dnaMatrix ? dnaMatrix.elements.join(',') : '-', dnaBaseScaleCfg, dnaSizeRandCfg].join('|');
    if (dataCache.has(cacheKey)) return dataCache.get(cacheKey);
    const tMark = performance.now();
    const data = [];
    const baseColorObj = new THREE.Color(settings.baseColor || '#3b82f6');

      // Extract DNA vertices if provided
      let dnaVertices = [];
      if (dnaGeometry) {
        const dnaPosAttr = dnaGeometry.attributes.position;
        for (let i = 0; i < dnaPosAttr.count; i++) { 
          dnaVertices.push(new THREE.Vector3().fromBufferAttribute(dnaPosAttr, i));
        }
      }

      const dnaBaseScale = dnaBaseScaleCfg;

      for (let i = 0; i < count; i++) {
        let x = 0, y = 0, z = 0;
        let color = baseColorObj;
        
        if (vertices.length > 0) {
          const vIndex = i % vertices.length; 
          const vertexObj = vertices[vIndex];
          
          x = vertexObj.v.x;
          y = vertexObj.v.y;
          z = vertexObj.v.z;

          if (settings.colorMode === 'vertex') {
            color = vertexObj.c;
          }
        }

        const sizeMult = settings.sizeMultiplier ?? 1.0;
        const baseSize = (settings.baseSize ?? 0.1) * sizeMult;
        const sizeRandomness = settings.sizeRandomness ?? 0.5;

        const isLarge = rand(i, 1) > 0.95;
        let scale = baseSize * (1.0 + (rand(i, 2) - 0.5) * sizeRandomness);
        if (isLarge) {
          scale += baseSize * (2.0 + rand(i, 3)) * sizeRandomness;
        }
        scale = Math.max(0.001, scale);
        
        const speed = rand(i, 4) * 0.5 + 0.1;
        const offset = rand(i, 5) * Math.PI * 2;

        // --- DNA Morphing Setup ---
        
          let dnaX = 0, dnaY = 0, dnaZ = 0;
          let dScale = dnaBaseScale * (1.0 + (rand(i, 6) - 0.5) * 0.5);
          const gr = rand(i, 10);
          dScale *= 1.0 + dnaSizeRandCfg * gr * gr * gr * 2.0;
          
          if (dnaVertices.length > 0) {
              if (i < dnaVertices.length) {
                  const dV = dnaVertices[i].clone();
                  if (dnaMatrix) {
                      dV.applyMatrix4(dnaMatrix);
                  }
                  dnaX = dV.x;
                  dnaY = dV.y;
                  dnaZ = dV.z;
              } else {
                  // Reserve cube: surplus particles wait above/below the camera (Y is camera-relative,
                  // the GPGPU shader adds the camera world Y). Negative scale flags them as reserve.
                  const isAbove = (i % 2 === 0);
                  dnaX = (rand(i, 7) - 0.5) * 4;
                  dnaY = isAbove ? (12 + rand(i, 8) * 4) : -(12 + rand(i, 8) * 4);
                  dnaZ = (rand(i, 9) - 0.5) * 4;
                  dScale = -Math.max(0.001, dScale);
              }
          } else {
              dnaX = x; dnaY = y; dnaZ = z;
              dScale = scale;
          }


        data.push({ x, y, z, scale, color, speed, offset, dnaX, dnaY, dnaZ, dnaScale: dScale });
      }
      mark(`particly: data ${count} spočítána, JS ${(performance.now() - tMark).toFixed(1)} ms`);
      if (settings.customGeometry) {
        dataCache.set(cacheKey, data);
        if (dataCache.size > DATA_CACHE_MAX) dataCache.delete(dataCache.keys().next().value);
      }
      return data;
    }, [count, vertices, center, colors, settings.baseSize, settings.sizeRandomness, settings.radius, settings.colorMode, settings.baseColor, settings.sizeMultiplier, settings.customGeometry, dnaGeometry, dnaMatrix, dnaBaseScaleCfg, dnaSizeRandCfg]);

  const compute = useGPGPU(count, particlesData, gl);

  const computeUVs = useMemo(() => {
     if (!compute) return new Float32Array(0);
     const size = compute.size;
     const uvs = new Float32Array(count * 2);
     let i = 0;
     for(let y = 0; y < size; y++) {
         for(let x = 0; x < size; x++) {
             if (i < count) {
                 uvs[i * 2] = (x + 0.5) / size;
                 uvs[i * 2 + 1] = (y + 0.5) / size;
             }
             i++;
         }
     }
     return uvs;
  }, [count, compute]);

  // Layout effect: the compute UV attribute must exist before the next rendered frame,
  // otherwise all instances sample texel 0 for one frame (visible collapse/flash).
  useLayoutEffect(() => {
    if (!meshRef.current || !compute) return;

    // instanceMatrix zůstává jednotková (InstancedMesh ji tak inicializuje) – pozice jdou z GPGPU textury
    for (let i = 0; i < count; i++) meshRef.current.setColorAt(i, particlesData[i].color);
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.frustumCulled = false;
    
    meshRef.current.geometry.setAttribute('aComputeUV', new THREE.InstancedBufferAttribute(computeUVs, 2));
  }, [count, particlesData, dummy, compute, computeUVs, segW, segH]);

  // Kolize se solidy stránky: vlastní rovina povrchu na particl (worker, do té doby bez kolizí).
  // Textura se přepočítá jen při změně tvaru / solidů / počtu particlů (klíč), ne při každém přepnutí projektu.
  const collisionCfg = useMemo(() => ({ ...COLLISION_DEFAULTS, ...(appConfig?.particleCollision || {}), ...((import.meta.env.DEV && window.__collisionOverride) || {}) }), [appConfig?.particleCollision]);
  // surfTex = UV nejbližšího bodu solidu na particl (barva ze zapečeného světla, jen obsah spárovaný se solidem)
  const surfRef = useRef({ key: null, tex: null, surfTex: null, live: null });
  useEffect(() => {
    const solids = settings.collisionSolids || [];
    if (!compute || !collisionCfg.enabled || !solids.length || !nodeMatrix) {
      surfRef.current.tex?.dispose();
      surfRef.current.surfTex?.dispose();
      if (surfRef.current.live) liveLight.systems.delete(surfRef.current.live);
      surfRef.current = { key: null, tex: null, surfTex: null, live: null };
      return;
    }
    const key = [settings.customGeometry?.uuid, count, compute.size, collisionCfg.band, ...solids.map((n) => n.uuid)].join('|');
    if (surfRef.current.key === key) return;
    surfRef.current.key = key;
    const points = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { points[i * 3] = particlesData[i].x; points[i * 3 + 1] = particlesData[i].y; points[i * 3 + 2] = particlesData[i].z; }
    const t0 = performance.now();
    const restPoints = points.slice(); // points se do workeru přesouvají (transfer)
    computeSurfacePlanes(solids, nodeMatrix, points, collisionCfg.band).then(({ planes, surf }) => {
      if (surfRef.current.key !== key) return;
      const size = compute.size;
      const toTex = (src) => {
        const data = new Float32Array(size * size * 4);
        data.set(src.subarray(0, Math.min(src.length, data.length)));
        const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
        t.needsUpdate = true;
        return t;
      };
      surfRef.current.tex?.dispose();
      surfRef.current.surfTex?.dispose();
      surfRef.current.tex = toTex(planes);
      let hasUV = false;
      for (let i = 3; i < surf.length; i += 4) if (surf[i] > 0.5) { hasUV = true; break; }
      surfRef.current.surfTex = hasUV ? toTex(surf) : null;
      // živé zapečené světlo (SolidLiveLight.js): obsah spárovaný se solidem se hlásí jako zdroj světla
      if (surfRef.current.live) liveLight.systems.delete(surfRef.current.live);
      surfRef.current.live = null;
      if (hasUV && settings.emerge && meshRef.current) {
        surfRef.current.live = { mesh: meshRef.current, compute, count, points: restPoints, surf, surfTex: surfRef.current.surfTex, computeUVs, key };
        liveLight.systems.add(surfRef.current.live);
      }
      if (import.meta.env.DEV) {
        let near = 0;
        for (let i = 0; i < count; i++) if (planes[i * 4] || planes[i * 4 + 1] || planes[i * 4 + 2]) near++;
        console.log(`[SolidCollision] ${near}/${count} particlů u solidu, ${Math.round(performance.now() - t0)} ms`);
        mark(`kolize se solidy hotové (${count} particlů, worker ${Math.round(performance.now() - t0)} ms)`);
      }
    });
  }, [compute, count, particlesData, settings.collisionSolids, settings.customGeometry, settings.emerge, nodeMatrix, collisionCfg, computeUVs]);
  useEffect(() => () => {
    surfRef.current.tex?.dispose(); surfRef.current.surfTex?.dispose();
    if (surfRef.current.live) liveLight.systems.delete(surfRef.current.live);
    surfRef.current = { key: null, tex: null, surfTex: null, live: null };
  }, []);

  const worldGroupRef = useRef();
  const prevMatRef = useRef({ m: new THREE.Matrix4(), compute: null });
  const inverseGroupRef = useRef();

  // Rezervní kostka: particly s indexem >= počet vrcholů DNA v ORBITu čekají mimo obrazovku (±12–16 j. od kamery).
  // Když je DNA v klidu (přechod 0, žádný scatter) déle než RESERVE_SETTLE s, nekreslí se (instance jsou na konci
  // rozsahu, stačí zkrátit mesh.count) – GPGPU je dál počítá, takže při odchodu do INSIDE vyletí odkud mají.
  // Obsah0 Xelithu: 18 k z 34,5 k particlů = ~0,9 M trojúhelníků za snímek navíc úplně zbytečně.
  const dnaCount = dnaGeometry ? dnaGeometry.attributes.position.count : count;
  const orbitSinceRef = useRef(-1);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (mesh && compute && !compute.disposed && dnaCount < count) {
      const pu = compute.posVar.material.uniforms;
      const calm = pu.uTransitionProgress.value < 1e-4 && pu.uScatter.value < 1e-4;
      const now = state.clock.elapsedTime;
      if (!calm) orbitSinceRef.current = -1;
      else if (orbitSinceRef.current < 0) orbitSinceRef.current = now;
      const cut = calm && now - orbitSinceRef.current > RESERVE_SETTLE && !(import.meta.env.DEV && window.__reserveDraw);
      mesh.count = cut ? dnaCount : count;
    }
    if (worldGroupRef.current && inverseGroupRef.current && compute) {
      // matrixWorld is only refreshed during render (after useFrame). On a project switch the parent
      // pivot jumps (yStep + rotation) at commit -> a stale matrix shifted the whole DNA + reserve cube
      // for one frame (cube flashed at top/bottom). Refresh it now so the inverse matches this frame.
      worldGroupRef.current.updateWorldMatrix(true, false);
      const mat = worldGroupRef.current.matrixWorld;
      const pu = compute.posVar.material.uniforms;
      if (pu.uFinalMat) {
        // delta = F_nyní * F_minule^-1 (particly se s ní unášejí). Skok (přepnutí projektu, nový compute) = žádné unášení.
        if (pu.uDeltaMat && pu.uDeltaAngle) {
          const prev = prevMatRef.current;
          _delta.copy(mat).multiply(_inv.copy(prev.m).invert());
          const e = _delta.elements;
          const jump = prev.compute !== compute || Math.hypot(e[12], e[13], e[14]) > 2 || e[0] + e[5] + e[10] < 1.0; // > 2 world j. nebo > 90° za snímek
          pu.uDeltaMat.value.copy(jump ? _ident : _delta);
          pu.uDeltaAngle.value = jump ? 0 : Math.acos(Math.min(1, Math.max(-1, (e[0] + e[5] + e[10] - 1) / 2)));
          prev.m.copy(mat); prev.compute = compute;
        }
        pu.uFinalMat.value.copy(mat);
      }
      inverseGroupRef.current.matrix.copy(mat).invert();
      inverseGroupRef.current.matrixAutoUpdate = false;
    }
    // kolize se solidy: rovina povrchu je v lokálním prostoru nodu -> shader potřebuje world -> lokální
    if (compute && !compute.disposed && compute.posVar.material.uniforms.tSurfPlane && worldGroupRef.current) {
      const u = compute.posVar.material.uniforms;
      const tex = surfRef.current.tex;
      u.uSurfOn.value = nodeMatrix && tex && compute.size * compute.size * 4 === tex.image.data.length ? 1 : 0;
      u.tSurfPlane.value = tex;
      u.uFinalInv.value.copy(worldGroupRef.current.matrixWorld).invert();
      u.uSurfMargin.value = collisionCfg.margin;
      u.uSurfMaxPen.value = collisionCfg.band / Math.max(1e-6, nodeMatrix?.getMaxScaleOnAxis() ?? 1);
      u.uPrintY.value = printFx.uniforms.uPrintY.value;
    }
    // svítící particly v barvě zapečeného světla: obsah spárovaný se solidem (emerge = "X0" k "X1") + nody
    // ze seznamu bakedLight.glowNodes (Xelith: pozadí – louže a shluky kolem robotů, ve videu taky svítily).
    // Particl s místem na solidu bere odstín z textury, ostatní rudou emisních dílů.
    const mu = mesh?.material?.uniforms;
    if (mu && mu.tSurfUV) {
      const glow = settings.emerge || (settings.bakedLight?.glowNodes || []).includes(settings.nodeName);
      const st = surfRef.current.surfTex;
      mu.tSurfUV.value = glow && st && compute && st.image.width === compute.size ? st : null;
      mu.uBakeOn.value = glow ? 1 : 0;
    }
    if (compute && !compute.disposed && compute.posVar.material.uniforms.uEmerge) {
      const u = compute.posVar.material.uniforms;
      const emerge = !!settings.emerge;
      u.uEmerge.value = emerge ? 1 : 0;
      if (emerge && worldGroupRef.current) {
        const cfg = { ...EMERGE_DEFAULTS, ...(appConfig?.particleEmerge || {}), ...((import.meta.env.DEV && window.__emergeOverride) || {}) };
        // spodek obsahu ve world Y (8 rohů bboxu přes world matici uzlu, bez alokací)
        const bb = settings.customGeometry.boundingBox;
        const mat = worldGroupRef.current.matrixWorld;
        let minY = Infinity;
        for (let i = 0; i < 8; i++) {
          _corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(mat);
          if (_corner.y < minY) minY = _corner.y;
        }
        const py = printFx.uniforms.uPrintY.value;
        // start tisku = nejnižší poloha řezu od chvíle, kdy tisk běží (-1e4 = nezačal)
        if (py < -1e3 || py > 1e3) u.uPrintStart.value = -1e4; // nezačal / tisk vypnutý (vše na místě)
        else if (u.uPrintStart.value < -1e3 || py < u.uPrintStart.value) u.uPrintStart.value = py;
        u.uPrintY.value = py;
        u.uEmergeFloor.value.set(minY - cfg.floorGap, cfg.floorDepth, cfg.spread, cfg.arc);
        u.uEmergeFlight.value.set(cfg.lead, cfg.leadRandom, cfg.swirl, Math.max(0.01, cfg.drag));
      }
    }
  });

  const transform = settings.transform || { position: [posX, 0, posZ] };
  // dnaOnly = page without its own particle shape: particles stay in the DNA in both modes.
  const logicSettings = useMemo(() => ({ ...settings, transitionProgress: settings.dnaOnly ? 0 : transitionProgress }), [settings, transitionProgress]);
  useParticleLogic(meshRef, logicSettings, appConfig, 0, compute);

  return (
    <group ref={worldGroupRef} {...transform}>
      <group ref={inverseGroupRef}>
        <instancedMesh ref={meshRef} args={[null, null, count]} renderOrder={renderOrder}>
          <sphereGeometry key={`${segW}-${segH}`} args={[1, segW, segH]} />
          <ParticleMaterial settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} rotationY={rotationY} pageDistance={pageDistance} transitionProgress={transitionProgress} />
        </instancedMesh>
      </group>
    </group>
  );
}
