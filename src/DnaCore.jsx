import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getFluid } from './components/particles/ParticleFluid';
import { portalFx } from './PortalTransition';

// Jádro DNA (ORBIT): skrytá „páteř“ na ose šroubovice – ukáže se, když myš rozvíří particly.
// Skutečný střed DNA tvoří naskládané páry bází (točité schodiště) -> tenké skleněné destičky pootočené
// po šroubovici + energetická nit s pulzy uprostřed. Ve world space (DNA cíle jsou world, kamera jede kolem).
// Viditelnost = obálka „rozvíření“ (dnaStir) z rychlosti tahu myši ve vodě: nádech ~0,35 s, podržení 0,6 s
// a doznění ~0,35 s (particly jsou po tahu zpět v DNA za ~1,4 s). V klidu nic nekreslí (visible = false).
// Config `dnaCore` (vše volitelné), DEV `window.__coreOverride = {...}`, `window.__dnaStir` = stav.

export const DNA_CORE_DEFAULTS = {
  enabled: true,
  yMin: -22.5,        // world Y – rozsah DNA (particly -21,7 … 6,4)
  yMax: 7,
  rest: 0,            // viditelnost v klidu (0 = jen při rozvíření)
  stirMin: 0.03,      // rychlost tahu (výšky obrazovky/s), od které se jádro začne ukazovat
  stirMax: 0.6,       // ... a při které je naplno
  attack: 0.35,       // s – náběh
  hold: 0.6,          // s – podržení po zastavení myši (particly se ještě vracejí)
  release: 0.35,      // s – pak doznění (změřeno: DNA je zpět ~1,4 s po tahu)
  color: '#b8f2ff',   // barva energie (nit, pulzy, světlo v hranách skla)
  glass: '#c4d6e0',   // barva skla destiček
  spacing: 0.12,      // world – rozestup destiček
  width: 0.42,        // world – šířka destičky (napříč osou)
  depth: 0.085,
  thick: 0.028,
  twist: 3,           // násobek otáčení šroubovice DNA (1 = destičky sledují příčky DNA)
  dnaTwist: 0.47,     // rad / world Y – stoupání šroubovice DNA (změřeno z cílů particlů)
  threadRadius: 0.007,
  glowRadius: 0.05,
  pulseSpeed: 2.2,    // world/s – pulzy tečou dolů (ve směru scrollu)
  pulseGap: 5,        // world – průměrná vzdálenost pulzů
  intensity: 1,
  glassOpacity: 1,
};

// sdílený stav pro post (VolumetricLight tlumí god rays při rozvíření)
export const dnaStir = { value: 0, hold: 0 };

const PULSE_GLSL = /* glsl */`
  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseGap;
  float h11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
  // pulzy tekoucí po ose dolů: 2 vrstvy s různou rychlostí + drobné jiskření (elektrický proud)
  float pulses(float y) {
    float p = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float gap = uPulseGap * (1.0 + fk * 0.62);
      float s = (y + uTime * uPulseSpeed * (1.0 + fk * 0.45)) / gap + fk * 0.37;
      float cell = floor(s);
      float f = fract(s) - 0.5 + (h11(cell + fk * 17.0) - 0.5) * 0.5;
      float w = 0.018 + h11(cell * 3.1 + fk) * 0.03;
      p += exp(-f * f / w) * (0.55 + 0.45 * h11(cell * 7.7 + fk)) * step(0.25, h11(cell * 1.9 + fk * 5.0));
    }
    return p;
  }
  float flicker(float y) {
    float t = floor(uTime * 24.0);
    return 0.82 + 0.18 * h11(floor(y * 6.0) + t * 13.0);
  }
`;

const threadVert = /* glsl */`
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vY = wp.y;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// nit + měkká záře kolem ní (válec, střed průřezu nejjasnější)
const threadFrag = PULSE_GLSL + /* glsl */`
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uCoreness;   // 1 = tenká nit (ostrá), 0 = záře (měkká)
  uniform float uYMin;
  uniform float uYMax;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float prof = mix(pow(facing, 3.0) * 0.35, pow(facing, 1.5), uCoreness);
    float p = pulses(vY);
    float e = (0.3 + p * 0.55) * flicker(vY);
    float ends = smoothstep(uYMin, uYMin + 1.5, vY) * (1.0 - smoothstep(uYMax - 1.5, uYMax, vY));
    gl_FragColor = vec4(uColor * e * prof * uReveal * ends, 1.0);
  }
`;

const tileVert = /* glsl */`
  attribute vec3 aHalf;
  varying vec3 vP;     // pozice v destičce, -1..1 na každé ose
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vP = position / aHalf;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vY = wp.y;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// skleněná destička: tmavé tělo, Fresnel lem, světlé hrany; hrany chytají světlo niti (víc u pulzu)
const tileFrag = PULSE_GLSL + /* glsl */`
  uniform vec3 uColor;
  uniform vec3 uGlass;
  uniform float uReveal;
  uniform float uOpacity;
  uniform float uYMin;
  uniform float uYMax;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec3 a = abs(vP);
    // druhá největší souřadnice u 1 = hrana (dvě stěny se potkávají)
    float mx = max(a.x, max(a.y, a.z));
    float mn = min(a.x, min(a.y, a.z));
    float mid = a.x + a.y + a.z - mx - mn;
    float edge = smoothstep(0.72, 0.98, mid);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
    float p = pulses(vY);
    // světlo niti: blíž ose jasnější (střed destičky), pulz ho rozsvítí
    float nearAxis = 1.0 - smoothstep(0.0, 1.0, a.x);
    vec3 energy = uColor * (0.12 + p * 0.4) * (0.35 + 0.65 * nearAxis);
    // měkký odlesk shora (jako světlo „nebe“ v ORBITu) -> horní plochy destiček se lesknou
    float top = pow(max(normalize(vN).y, 0.0), 4.0);
    vec3 col = uGlass * (0.1 + fres * 0.6 + edge * 0.7 + top * 0.35) + energy * (0.5 + edge * 1.2 + fres * 0.5);
    float alpha = clamp(0.2 + fres * 0.45 + edge * 0.6 + top * 0.2 + p * 0.12, 0.0, 1.0) * uOpacity;
    float ends = smoothstep(uYMin, uYMin + 1.5, vY) * (1.0 - smoothstep(uYMax - 1.5, uYMax, vY));
    gl_FragColor = vec4(col, alpha * uReveal * ends);
  }
`;

function mergeCfg(appConfig) {
  const ov = import.meta.env.DEV ? window.__coreOverride : null;
  return { ...DNA_CORE_DEFAULTS, ...(appConfig?.dnaCore || {}), ...(ov || {}) };
}

export function DnaCore({ appConfig }) {
  const { gl } = useThree();
  const groupRef = useRef(null);
  const tilesRef = useRef(null);
  const base = mergeCfg(appConfig);
  const geoKey = [base.yMin, base.yMax, base.spacing, base.width, base.depth, base.thick, base.twist, base.dnaTwist, base.threadRadius, base.glowRadius].join(',');

  const shared = useMemo(() => ({
    uTime: { value: 0 }, uPulseSpeed: { value: 2 }, uPulseGap: { value: 3 }, uReveal: { value: 0 },
    uColor: { value: new THREE.Color() }, uYMin: { value: -20 }, uYMax: { value: 6 },
  }), []);

  const parts = useMemo(() => {
    const c = base;
    const H = c.yMax - c.yMin;
    const mid = (c.yMax + c.yMin) * 0.5;
    const threadGeo = new THREE.CylinderGeometry(c.threadRadius, c.threadRadius, H, 8, 1, true);
    const glowGeo = new THREE.CylinderGeometry(c.glowRadius, c.glowRadius, H, 16, 1, true);
    [threadGeo, glowGeo].forEach((g) => g.translate(0, mid, 0));
    const mkThread = (coreness) => new THREE.ShaderMaterial({
      vertexShader: threadVert, fragmentShader: threadFrag,
      uniforms: { ...shared, uCoreness: { value: coreness } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });

    const n = Math.max(1, Math.floor(H / c.spacing));
    const tileGeo = new THREE.BoxGeometry(c.width, c.thick, c.depth);
    const half = new Float32Array(tileGeo.attributes.position.count * 3);
    for (let i = 0; i < half.length; i += 3) { half[i] = c.width / 2; half[i + 1] = c.thick / 2; half[i + 2] = c.depth / 2; }
    tileGeo.setAttribute('aHalf', new THREE.BufferAttribute(half, 3));
    const tileMat = new THREE.ShaderMaterial({
      vertexShader: tileVert, fragmentShader: tileFrag,
      uniforms: { ...shared, uGlass: { value: new THREE.Color() }, uOpacity: { value: 1 } },
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const y = c.yMin + (i + 0.5) * c.spacing;
      // three: rotace o +θ kolem Y posune bod z osy X k -Z -> úhel atan2(z,x) = -θ; DNA roste +dnaTwist/j.
      q.setFromAxisAngle(up, -y * c.dnaTwist * c.twist);
      p.set(0, y, 0);
      tiles.setMatrixAt(i, m.compose(p, q, s));
    }
    tiles.instanceMatrix.needsUpdate = true;
    tiles.frustumCulled = false;

    return { threadGeo, glowGeo, threadMat: mkThread(1), glowMat: mkThread(0), tiles, tileGeo, tileMat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, shared]);

  useEffect(() => () => {
    parts.threadGeo.dispose(); parts.glowGeo.dispose(); parts.tileGeo.dispose();
    parts.threadMat.dispose(); parts.glowMat.dispose(); parts.tileMat.dispose();
    parts.tiles.dispose();
  }, [parts]);

  useFrame((state, delta) => {
    const c = mergeCfg(appConfig);
    const dt = Math.min(Math.max(delta, 0), 0.1);
    // obálka rozvíření z rychlosti tahu myši ve vodě (jen ORBIT – při průletu portálem zhasne)
    const fl = getFluid(gl);
    const sp = fl.velocity ? (fl.speed ?? 0) : 0;
    const orbit = 1 - THREE.MathUtils.smoothstep(portalFx.progress, 0, 0.3);
    const target = THREE.MathUtils.smoothstep(sp, c.stirMin, c.stirMax) * orbit;
    if (target >= dnaStir.value) dnaStir.hold = c.hold;
    else dnaStir.hold -= dt;
    if (target >= dnaStir.value || dnaStir.hold <= 0) {
      const tau = target > dnaStir.value ? c.attack : c.release;
      dnaStir.value += (target - dnaStir.value) * (1 - Math.exp(-dt / Math.max(0.02, tau)));
      if (dnaStir.value < 1e-4) dnaStir.value = 0;
    }
    if (import.meta.env.DEV) window.__dnaStir = dnaStir;

    const reveal = c.enabled ? Math.max(c.rest * orbit, dnaStir.value) * c.intensity : 0;
    const g = groupRef.current;
    if (!g) return;
    g.visible = reveal > 0.002;
    if (!g.visible) return;
    shared.uTime.value = state.clock.elapsedTime;
    shared.uReveal.value = reveal;
    shared.uPulseSpeed.value = c.pulseSpeed;
    shared.uPulseGap.value = Math.max(0.2, c.pulseGap);
    shared.uColor.value.set(c.color);
    shared.uYMin.value = c.yMin;
    shared.uYMax.value = c.yMax;
    parts.tileMat.uniforms.uGlass.value.set(c.glass);
    parts.tileMat.uniforms.uOpacity.value = c.glassOpacity;
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={parts.tiles} renderOrder={3} />
      <mesh geometry={parts.glowGeo} material={parts.glowMat} renderOrder={4} frustumCulled={false} />
      <mesh geometry={parts.threadGeo} material={parts.threadMat} renderOrder={4} frustumCulled={false} />
    </group>
  );
}
