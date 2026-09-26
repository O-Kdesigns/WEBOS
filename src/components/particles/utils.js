import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

// Pomocná funkce pro vygenerování palety
export const getColors = () => [
  new THREE.Color('#7CFC00'),
  new THREE.Color('#4169E1'),
  new THREE.Color('#FFFFE0'),
  new THREE.Color('#888888'),
  new THREE.Color('#228B22'),
];

// --- GPGPU SHADERS ---
const fragmentShaderVel = `
uniform vec3 uMousePos;
uniform vec3 uMouseDir;
uniform vec3 uMouseVel;
uniform float uMouseRadius;
uniform float uMouseForce;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    
    // AGENT NOTE (from User): 
    // ALWAYS USE VELOCITY BRUSH. NEVER USE REPULSIVE FORCE.
    // Standing still must do NOTHING. Only mouse velocity (uMouseVel) pushes particles.
    
    // MYŠ & TEKUTINA
    float t = dot(pos.xyz - uMousePos, uMouseDir);
    if (t > 0.0 && t < 100.0) {
        vec3 closestPt = uMousePos + uMouseDir * t;
        float d = distance(pos.xyz, closestPt);
        
        if (d < uMouseRadius) {
            float f = 1.0 - (d / uMouseRadius);
            f = smoothstep(0.0, 1.0, f);
            
            // Síla slábne s hloubkou, ale dosáhne až na konec válce (100.0)
            float depthFalloff = 1.0 - (t / 100.0);
            
            vec3 push = uMouseVel * f * (uMouseForce * 8.0);
            
            vel.xyz += push * depthFalloff;
        }
    }
    
    // Tření - rychle zpomalí "cáknutí"
    vel.xyz *= 0.90;
    
    gl_FragColor = vel;
}
`;

const fragmentShaderPos = `
uniform float uTime;
uniform float uFloatSpeed;
uniform float uFloatAmplitude;
uniform float uReturnSpeed;
uniform float uScatter;
uniform float uTransitionProgress;
uniform sampler2D tBasePosition;
uniform sampler2D tDnaPosition;
// World matrix of the project node group (page offset + inside pivot + node transform).
// The particle mesh renders in world space (inverse group), so project shape targets
// stored in node-local space must be lifted into world space here.
uniform mat4 uFinalMat;
// Camera world Y - the "reserve cube" of surplus particles (dna.w < 0) rides with the camera, out of view.
uniform float uCameraY;
// "Emerge" (obsah k solidu): particly čekají ve spodní vrstvě a do tvaru je vytahuje řez 3D tisku
// jako jiskry pouštěné pozpátku. Vše odvozené od výšky řezu (ne od času) -> odtisk = stejná dráha dopředu.
uniform float uEmerge;        // 0 = vypnuto
uniform float uPrintY;        // world Y řezu (-1e4 = tisk nezačal, 1e4 = hotovo)
uniform float uPrintStart;    // world Y řezu na startu tisku (spodní particly nesmí vyskočit v půlce letu)
uniform vec4 uEmergeFloor;    // x = world Y horní hrany čekací vrstvy, y = tloušťka, z = rozptyl xz, w = výška oblouku (gravitace)
uniform vec4 uEmergeFlight;   // x = předstih (world Y), y = náhodnost předstihu, z = síla víření, w = odpor (drag)

float emergeHash(vec2 p, float k) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + k * 17.137) * 43758.5453); }

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    vec4 base = texture2D(tBasePosition, uv);
    vec4 dna = texture2D(tDnaPosition, uv);
    
    // 1. Aplikace fyzikální rychlosti (momentum od myši)
    pos.xyz += vel.xyz;
    
    // 2. Výpočet cílové pozice s levitací (nastavitelná amplituda a rychlost)
    vec3 projLocal = base.xyz;
    // Per-particle phase derived from the texel (base.w now holds the project scale).
    float offset = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
    projLocal.y += sin(uTime * uFloatSpeed + offset) * uFloatAmplitude;
    vec3 projTarget = (uFinalMat * vec4(projLocal, 1.0)).xyz;
    float projScale = length(uFinalMat[0].xyz);

    float inFlight = 0.0;
    if (uEmerge > 0.5) {
        vec3 P = projTarget;
        float r1 = emergeHash(uv, 1.0), r2 = emergeHash(uv, 2.0), r3 = emergeHash(uv, 3.0), r4 = emergeHash(uv, 4.0);
        // čekací místo ve spodní vrstvě (pod vlastním cílem, trochu rozházené)
        vec3 R = vec3(P.x + (r1 - 0.5) * uEmergeFloor.z, uEmergeFloor.x - r2 * uEmergeFloor.y, P.z + (r3 - 0.5) * uEmergeFloor.z);
        // s: 0 = čeká dole, 1 = na místě. Doletí přesně, když řez projde jeho výškou.
        float lead = max(1e-3, uEmergeFlight.x * (1.0 - uEmergeFlight.y * r4));
        float arriveY = max(P.y, uPrintStart + lead);
        float s = clamp((uPrintY - arriveY + lead) / lead, 0.0, 1.0);
        // tau = čas jiskry (dopředu): 0 = vystřelena z cíle, 1 = dopadla do vrstvy. Pouštíme pozpátku.
        float tau = 1.0 - s;
        // jiskra: výstřel + gravitace, odpor vzduchu (drag) = rychlý start, zpomalování -> pozpátku zrychluje do cíle
        float k = uEmergeFlight.w;
        float fd = (1.0 - exp(-k * tau)) / (1.0 - exp(-k));
        vec3 g = vec3(0.0, -uEmergeFloor.w * (0.6 + r4 * 0.8), 0.0);
        vec3 D = R - P;
        vec3 arc = P + (D - 0.5 * g) * fd + 0.5 * g * tau * tau;
        // víření během letu (na koncích nulové)
        float env = 4.0 * tau * s;
        float ph = r1 * 6.2831853;
        arc += vec3(sin(tau * 9.0 + ph), sin(tau * 7.0 + ph * 1.7) * 0.5, cos(tau * 11.0 + ph * 2.3)) * uEmergeFlight.z * env;
        projTarget = arc;
        inFlight = step(0.0001, s) * step(s, 0.9999);
    }
    // Surplus particles (more project vertices than DNA vertices) are flagged with negative dna.w.
    // Their DNA-state target is relative to the camera height so the cube follows the camera.
    float isReserve = step(dna.w, 0.0);
    vec3 dnaTarget = dna.xyz + vec3(0.0, uCameraY * isReserve, 0.0);
    float dnaScale = abs(dna.w);
    
    // --- ORGANIC MORPH EFFECT ---
    // Smoothstep pro hezký náběh (ease-in-out)
    float tProgress = smoothstep(0.0, 1.0, uTransitionProgress);
    
    // Pozice: z DNA (při t=0) do tvaru projektu (při t=1)
    vec3 targetPos = mix(dnaTarget, projTarget, tProgress);
    
    // --- SCATTER EFFECT (Pro GlobalBackground) ---
    vec3 radial = normalize(base.xyz + vec3(0.001));
    vec3 randomDir = normalize(vec3(
        sin(offset * 132.34) * cos(offset * 342.12),
        cos(offset * 112.54),
        sin(offset * 211.11) * sin(offset * 313.22)
    ));
    vec3 scatterTarget = targetPos + (radial + randomDir) * 300.0; 
    targetPos = mix(targetPos, scatterTarget, uScatter);
    
    // 3. Hladký návrat k cíli
    // Reserve particles snap to the camera-relative cube while in ORBIT (no lag into view while scrolling),
    // and fly smoothly once the INSIDE morph starts.
    float returnSpeed = mix(uReturnSpeed, 1.0, isReserve * (1.0 - step(0.001, tProgress)));
    // jiskra v letu jede přesně po dráze (lag by oblouk rozmazal)
    returnSpeed = mix(returnSpeed, 0.6, inFlight * step(0.999, tProgress));
    pos.xyz += (targetPos - pos.xyz) * returnSpeed;
    
    // Uložíme interpolovanou velikost (scale) do w komponenty (vertex shader ji načte)
    // projektový scale je uložen v base.w
    pos.w = mix(dnaScale, base.w * projScale, tProgress);
    
    gl_FragColor = pos;
}
`;

// --- GPGPU HOOK ---
// Writes per-particle targets into the data textures.
// base = project shape (xyz) + project scale (w); dna = DNA state (xyz) + DNA scale (w, negative = reserve cube).
function writeTargets(size, particlesData, basePos, dnaPos, pos0) {
  const bd = basePos.image.data, dd = dnaPos.image.data, pd = pos0 ? pos0.image.data : null;
  const total = size * size;
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const p = particlesData[i];
    if (!p) continue;
    const dx = p.dnaX !== undefined ? p.dnaX : p.x;
    const dy = p.dnaY !== undefined ? p.dnaY : p.y;
    const dz = p.dnaZ !== undefined ? p.dnaZ : p.z;
    const ds = p.dnaScale !== undefined ? p.dnaScale : p.scale;
    bd[idx] = p.x; bd[idx + 1] = p.y; bd[idx + 2] = p.z; bd[idx + 3] = p.scale;
    dd[idx] = dx; dd[idx + 1] = dy; dd[idx + 2] = dz; dd[idx + 3] = ds;
    if (pd) { pd[idx] = dx; pd[idx + 1] = dy; pd[idx + 2] = dz; pd[idx + 3] = Math.abs(ds); }
  }
  basePos.needsUpdate = true;
  dnaPos.needsUpdate = true;
}

export function useGPGPU(count, particlesData, gl) {
  const [compute, setCompute] = useState(null);
  const pendingDisposeRef = useRef([]);
  const dataRef = useRef(particlesData);
  dataRef.current = particlesData;

  // The GPGPU system is (re)created ONLY when the particle count changes.
  // Switching projects (same nodes, different size/colour settings) must NOT rebuild it:
  // a rebuild costs a frame hitch and resets positions/scales -> visible DNA "blink".
  const hasData = !!(particlesData && particlesData.length);
  // Layout effect (not useEffect): setCompute here re-renders synchronously before the next frame.
  // With useEffect a freshly mounted object (e.g. doomsday -> showreel) rendered one frame without
  // GPGPU positions -> the DNA vanished for a frame (visible as a noise "blink").
  useLayoutEffect(() => {
    if (!count || !hasData) {
      setCompute(null);
      return;
    }
    
    const size = Math.ceil(Math.sqrt(count));
    const gpuCompute = new GPUComputationRenderer(size, size, gl);
    
    const pos0 = gpuCompute.createTexture();
    const vel0 = gpuCompute.createTexture(); // zero velocity
    const basePos = gpuCompute.createTexture();
    const dnaPos = gpuCompute.createTexture();
    writeTargets(size, dataRef.current, basePos, dnaPos, pos0);
    
    const velVar = gpuCompute.addVariable("textureVelocity", fragmentShaderVel, vel0);
    const posVar = gpuCompute.addVariable("texturePosition", fragmentShaderPos, pos0);
    
    gpuCompute.setVariableDependencies(velVar, [velVar, posVar]);
    gpuCompute.setVariableDependencies(posVar, [velVar, posVar]);
    
    velVar.material.uniforms.uMousePos = { value: new THREE.Vector3(9999,9999,9999) };
    velVar.material.uniforms.uMouseDir = { value: new THREE.Vector3(0,0,-1) };
    velVar.material.uniforms.uMouseVel = { value: new THREE.Vector3(0,0,0) };
    velVar.material.uniforms.uMouseRadius = { value: 2.0 };
    velVar.material.uniforms.uMouseForce = { value: 1.0 };
    
    posVar.material.uniforms.uTime = { value: 0 };
    posVar.material.uniforms.uFloatSpeed = { value: 1.0 };
    posVar.material.uniforms.uFloatAmplitude = { value: 0.1 };
    posVar.material.uniforms.uReturnSpeed = { value: 0.05 };
    posVar.material.uniforms.uScatter = { value: 0.0 };
    posVar.material.uniforms.uTransitionProgress = { value: 1.0 }; // Default k 1.0 pro safety
    posVar.material.uniforms.tBasePosition = { value: basePos };
    posVar.material.uniforms.tDnaPosition = { value: dnaPos };
    posVar.material.uniforms.uFinalMat = { value: new THREE.Matrix4() };
    posVar.material.uniforms.uCameraY = { value: 0 };
    posVar.material.uniforms.uEmerge = { value: 0 };
    posVar.material.uniforms.uPrintY = { value: 1e4 };
    posVar.material.uniforms.uPrintStart = { value: -1e4 };
    posVar.material.uniforms.uEmergeFloor = { value: new THREE.Vector4() };
    posVar.material.uniforms.uEmergeFlight = { value: new THREE.Vector4() };
    
    const error = gpuCompute.init();
    if (error !== null) console.error("GPGPU Error:", error);
    
    const computeObj = { gpuCompute, velVar, posVar, size, disposed: false, writtenData: dataRef.current };
    setCompute(computeObj);
    if (import.meta.env.DEV) { (window.__gpgpu = window.__gpgpu || new Set()).add(computeObj); }

    // Disposal is deferred: after a dependency change the old system is still used for a frame or two
    // until React re-renders with the new one. Disposing immediately made three.js silently re-allocate
    // the render targets / data textures on the next compute() -> GPU texture leak + one-frame collapse.
    return () => { pendingDisposeRef.current.push(computeObj); };
  }, [count, hasData, gl]);

  // Same count, new targets (project switch / editor tweak): update the target textures in place.
  // Current particle positions live on in the ping-pong render targets, so particles glide to the
  // new targets instead of being reset.
  useLayoutEffect(() => {
    if (!compute || compute.disposed || !particlesData || compute.writtenData === particlesData) return;
    const u = compute.posVar.material.uniforms;
    writeTargets(compute.size, particlesData, u.tBasePosition.value, u.tDnaPosition.value, null);
    compute.writtenData = particlesData;
  }, [compute, particlesData]);

  // Flush deferred disposals once the new system has taken over (called from useParticleLogic)
  // and on unmount.
  const flushRef = useRef(null);
  flushRef.current = (keep) => {
    const pending = pendingDisposeRef.current;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i] === keep) continue;
      disposeCompute(pending[i]);
      pending.splice(i, 1);
    }
  };
  useEffect(() => () => flushRef.current(null), []);

  return compute ? Object.assign(compute, { flush: flushRef }) : null;
}

function disposeCompute(c) {
  if (!c || c.disposed) return;
  c.disposed = true;
  if (import.meta.env.DEV) window.__gpgpu?.delete(c);
  const u = c.posVar.material.uniforms;
  // Data textures that are not owned by GPUComputationRenderer
  u.tBasePosition.value?.dispose();
  u.tDnaPosition.value?.dispose();
  // Disposes render targets, initial value textures, materials and the fullscreen quad
  c.gpuCompute.dispose();
}

// --- LOGIKA ---
export function useParticleLogic(meshRef, settings, appConfig, posY, compute) {
  const prevMouse = useRef(new THREE.Vector3(9999, 9999, 9999));
  const smoothedMouse = useRef(new THREE.Vector3(9999, 9999, 9999));
  const mouseVelocity = useMemo(() => new THREE.Vector3(), []);

  const planeNormal = useRef(new THREE.Vector3());
  const planePoint = useRef(new THREE.Vector3());
  const plane = useRef(new THREE.Plane());
  const rawTarget = useRef(new THREE.Vector3());
  const invMat = useRef(new THREE.Matrix4());
  const worldCameraPos = useRef(new THREE.Vector3());
  const localCameraPos = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());

  useEffect(() => {
    const handleReset = () => {
      prevMouse.current.set(9999, 9999, 9999);
      smoothedMouse.current.set(9999, 9999, 9999);
      mouseVelocity.set(0, 0, 0);
    };
    window.addEventListener('blur', handleReset);
    window.addEventListener('focus', handleReset);
    return () => {
      window.removeEventListener('blur', handleReset);
      window.removeEventListener('focus', handleReset);
    };
  }, [mouseVelocity]);

  useFrame((state) => {
    if (!meshRef.current || !compute || compute.disposed) return;
    const time = state.clock.getElapsedTime();
    
    if (settings.isGlobalLevitating) {
      meshRef.current.rotation.y = time * 0.15;
      meshRef.current.rotation.z = Math.sin(time * 0.05) * 0.1;
      meshRef.current.position.y = posY + Math.sin(time * 0.5) * 0.2;
    } else {
      meshRef.current.rotation.y = 0;
      meshRef.current.rotation.z = 0;
      meshRef.current.position.y = posY;
    }

    const phys = appConfig?.particlePhysics || {};
    const velUniforms = compute.velVar.material.uniforms;
    const posUniforms = compute.posVar.material.uniforms;
    
    posUniforms.uTime.value = time;
    posUniforms.uFloatSpeed.value = phys.floatSpeed ?? 1.0;
    posUniforms.uFloatAmplitude.value = phys.floatAmplitude ?? 0.1;
    // Nové nastavení rychlosti návratu částic
    posUniforms.uReturnSpeed.value = phys.returnSpeed ?? 0.05;
    
    if (settings.transitionProgress != null) {
      posUniforms.uTransitionProgress.value = settings.transitionProgress.get ? settings.transitionProgress.get() : settings.transitionProgress;
    }

    if (settings.scatterSpring) {
      // Umocněním na třetí získáme extrémně pomalý rozjezd (0.1^3 = 0.001) a rychlý konec
      posUniforms.uScatter.value = Math.pow(settings.scatterSpring.get(), 3.0);
    } else {
      posUniforms.uScatter.value = 0.0;
    }

    velUniforms.uMouseRadius.value = phys.mouseRadius ?? 2.0;
    const baseMouseForce = phys.mouseForce ?? 1.0;
    const mouseMult = settings.mouseMultiplier !== undefined ? Number(settings.mouseMultiplier) : 1.0;
    velUniforms.uMouseForce.value = baseMouseForce * mouseMult;

    // Rovina pro raycaster musí VŽDY směřovat ke kameře, jinak se při rotaci rozbije interakce
    state.camera.getWorldDirection(planeNormal.current);
    planeNormal.current.negate(); // Normála směřuje proti pohledu kamery
    
    meshRef.current.getWorldPosition(planePoint.current); 
    plane.current.setFromNormalAndCoplanarPoint(planeNormal.current, planePoint.current);
    const hasIntersection = state.raycaster.ray.intersectPlane(plane.current, rawTarget.current);
    
    invMat.current.copy(meshRef.current.matrixWorld).invert();
    
    // Získat SKUTEČNOU světovou pozici kamery, ne její lokální [0,0,0] z rigu!
    state.camera.getWorldPosition(worldCameraPos.current);
    localCameraPos.current.copy(worldCameraPos.current).applyMatrix4(invMat.current);

    if (hasIntersection) {
      meshRef.current.worldToLocal(rawTarget.current);

      if (smoothedMouse.current.x === 9999) {
        smoothedMouse.current.copy(rawTarget.current);
        prevMouse.current.copy(rawTarget.current);
      } else {
        smoothedMouse.current.lerp(rawTarget.current, 0.4);
      }

      mouseVelocity.subVectors(smoothedMouse.current, prevMouse.current);
      mouseVelocity.clampLength(0, 2.0);
      prevMouse.current.copy(smoothedMouse.current);

      rayDir.current.subVectors(smoothedMouse.current, localCameraPos.current).normalize();
      
      velUniforms.uMousePos.value.copy(localCameraPos.current);
      velUniforms.uMouseDir.value.copy(rayDir.current);
      velUniforms.uMouseVel.value.copy(mouseVelocity);
    } else {
      velUniforms.uMousePos.value.set(9999,9999,9999);
      velUniforms.uMouseVel.value.set(0,0,0);
    }
    
    posUniforms.uCameraY.value = worldCameraPos.current.y;
    compute.gpuCompute.compute();
    
    const tex = compute.gpuCompute.getCurrentRenderTarget(compute.posVar).texture;
    
    if (meshRef.current.material) {
        if (meshRef.current.material.uniforms && meshRef.current.material.uniforms.tPositions) {
            meshRef.current.material.uniforms.tPositions.value = tex;
        } else if (meshRef.current.material.userData && meshRef.current.material.userData.shader) {
            meshRef.current.material.userData.shader.uniforms.tPositions.value = tex;
        } else if (meshRef.current.material.type === 'MeshPhysicalMaterial') {
            if (!meshRef.current.material.onBeforeCompile.__injected) {
               const original = meshRef.current.material.onBeforeCompile;
               meshRef.current.material.onBeforeCompile = (shader, renderer) => {
                   shader.uniforms.tPositions = { value: tex };
                   meshRef.current.material.userData.shader = shader;
                   original(shader, renderer);
               };
               meshRef.current.material.onBeforeCompile.__injected = true;
            }
        }
    }
    // The mesh now samples the current system's texture -> old systems can be freed safely.
    if (compute.flush) compute.flush.current(compute);
  });
}

// --- ADAPTIVNÍ SEGMENTACE GEOMETRIE PODLE POČTU ČÁSTIC ---
export function getAdaptiveSphereSegments(count, settings = {}) {
  if (settings.sphereSegments && Array.isArray(settings.sphereSegments)) {
    return settings.sphereSegments;
  }
  // 1. Do 20 000 částic (např. pozadí ~15k) -> 8x8 (112 trojúhelníků, plná kvalita pro velké/viditelné částice)
  if (!count || count <= 20000) {
    return [8, 8];
  }
  // 2. 20 000 - 60 000 částic -> 6x5 (48 trojúhelníků, 57% úspora)
  if (count <= 60000) {
    return [6, 5];
  }
  // 3. 60 000 - 120 000 částic -> 5x4 (30 trojúhelníků, 73% úspora)
  if (count <= 120000) {
    return [5, 4];
  }
  // 4. Nad 120 000 částic (např. obsah Xelithu 167k a 203k) -> 4x3 (16 trojúhelníků, 86% úspora)
  return [4, 3];
}
