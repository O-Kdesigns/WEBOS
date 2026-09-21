import { useState, useEffect, useRef, useMemo } from 'react';
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
uniform sampler2D tBasePosition;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    vec4 base = texture2D(tBasePosition, uv);
    
    // 1. Aplikace fyzikální rychlosti (momentum od myši)
    pos.xyz += vel.xyz;
    
    // 2. Výpočet cílové pozice s levitací (nastavitelná amplituda a rychlost)
    vec3 targetPos = base.xyz; 
    float offset = base.w;
    targetPos.y += sin(uTime * uFloatSpeed + offset) * uFloatAmplitude;
    
    // --- SCATTER EFFECT ---
    // Roztrháme částice do stran
    vec3 radial = normalize(base.xyz + vec3(0.001));
    vec3 randomDir = normalize(vec3(
        sin(offset * 132.34) * cos(offset * 342.12),
        cos(offset * 112.54),
        sin(offset * 211.11) * sin(offset * 313.22)
    ));
    // Vytvoříme chaos pozici hodně daleko od středu
    vec3 scatterTarget = targetPos + (radial + randomDir) * 300.0; 
    
    targetPos = mix(targetPos, scatterTarget, uScatter);
    
    // 3. Hladký návrat s nastavitelnou rychlostí
    pos.xyz += (targetPos - pos.xyz) * uReturnSpeed;
    
    gl_FragColor = pos;
}
`;

// --- GPGPU HOOK ---
export function useGPGPU(count, particlesData, gl) {
  const [compute, setCompute] = useState(null);

  useEffect(() => {
    if (!count || count === 0 || !particlesData || !particlesData.length) {
      setCompute(null);
      return;
    }
    
    const size = Math.ceil(Math.sqrt(count));
    const gpuCompute = new GPUComputationRenderer(size, size, gl);
    
    const pos0 = gpuCompute.createTexture();
    const vel0 = gpuCompute.createTexture();
    const basePos = gpuCompute.createTexture();
    
    let i = 0;
    for(let y = 0; y < size; y++) {
        for(let x = 0; x < size; x++) {
            const idx = i * 4;
            const p = particlesData[i];
            if (p) {
                // Výchozí pozice pro rendering
                pos0.image.data[idx] = p.x;
                pos0.image.data[idx+1] = p.y;
                pos0.image.data[idx+2] = p.z;
                pos0.image.data[idx+3] = p.scale; 
                
                // Paměť pro původní stav a levitaci
                basePos.image.data[idx] = p.x;
                basePos.image.data[idx+1] = p.y;
                basePos.image.data[idx+2] = p.z;
                basePos.image.data[idx+3] = p.offset;
            }
            i++;
        }
    }
    
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
    posVar.material.uniforms.tBasePosition = { value: basePos };
    
    const error = gpuCompute.init();
    if (error !== null) console.error("GPGPU Error:", error);
    
    setCompute({ gpuCompute, velVar, posVar, size });

    return () => {
      // Úplný úklid alokovaných textur a render targetů v GPU paměti
      if (pos0?.dispose) pos0.dispose();
      if (vel0?.dispose) vel0.dispose();
      if (basePos?.dispose) basePos.dispose();

      if (gpuCompute.variables) {
        gpuCompute.variables.forEach(v => {
          if (v.renderTargets) {
            v.renderTargets.forEach(rt => {
              if (rt?.texture?.dispose) rt.texture.dispose();
              if (rt?.dispose) rt.dispose();
            });
          }
          if (v.material?.dispose) v.material.dispose();
        });
      }
      if (gpuCompute.dispose) gpuCompute.dispose();
    };
  }, [count, particlesData, gl]);

  return compute;
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
    if (!meshRef.current || !compute) return;
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
