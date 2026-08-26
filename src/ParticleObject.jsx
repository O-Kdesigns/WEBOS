import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, shaderMaterial, useVideoTexture } from '@react-three/drei';
import * as THREE from 'three';
import { extend } from '@react-three/fiber';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { a } from '@react-spring/three';

// Pomocná funkce pro vygenerování palety
const getColors = () => [
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
function useGPGPU(count, particlesData, gl) {
  return useMemo(() => {
      if (!count || count === 0 || !particlesData || !particlesData.length) return null;
      
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
      
      return { gpuCompute, velVar, posVar, size };
  }, [count, particlesData, gl]);
}

// --- MATERIÁLY ---
const VideoRefractionMaterialImpl = shaderMaterial(
  {
    tVideo: null,
    uDistortion: 0.1,
    uOpacity: 1.0,
    uColor: new THREE.Color("#ffffff"),
    tPositions: null
  },
  `
  uniform sampler2D tPositions;
  attribute vec2 aComputeUV;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;
  
  void main() {
    vUv = uv;
    
    vec4 computedData = texture2D(tPositions, aComputeUV);
    vec3 computedPos = computedData.xyz;
    float computedScale = computedData.w;
    
    vec3 transformed = position * computedScale + computedPos;
    vec4 instancePosition = instanceMatrix * vec4(transformed, 1.0);
    vec4 mvPosition = viewMatrix * modelMatrix * instancePosition;
    
    mat3 m = mat3(modelMatrix * instanceMatrix);
    vNormal = normalize(normalMatrix * m * normal);
    
    gl_Position = projectionMatrix * mvPosition;
    vScreenPos = gl_Position;
    vViewPosition = -mvPosition.xyz;
  }
  `,
  `
  uniform sampler2D tVideo;
  uniform float uDistortion;
  uniform float uOpacity;
  uniform vec3 uColor;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;

  void main() {
    vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
    vec2 distortedUv = screenUv + (vNormal.xy * uDistortion);
    distortedUv = clamp(distortedUv, 0.0, 1.0);
    
    vec4 texColor = texture2D(tVideo, distortedUv);
    
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = dot(normal, viewDir);
    fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
    fresnel = pow(fresnel, 3.0);
    
    vec3 finalColor = (texColor.rgb * uColor) + (vec3(1.0) * fresnel * 0.5);
    gl_FragColor = vec4(finalColor, uOpacity);
  }
  `
);

extend({ VideoRefractionMaterialImpl });

const AnimatedVideoRefractionMaterial = a('videoRefractionMaterialImpl');

export function ParticleMaterial({ settings, videoTexture, opacity = 1 }) {
  if (settings.colorMode === 'video' && videoTexture) {
    // Pro vlastní shader musíme zajistit, že react-spring správně updatuje uniform
    return (
      <AnimatedVideoRefractionMaterial 
        tVideo={videoTexture} 
        uDistortion={settings.refractionDistortion ?? 0.15}
        uOpacity={opacity}
        uColor={new THREE.Color(settings.baseColor || '#ffffff')}
        transparent={true}
        depthWrite={false}
      />
    );
  }


  const onBeforeCompile = React.useCallback((shader) => {
    shader.uniforms.tPositions = { value: null };
    
    shader.vertexShader = `
      uniform sampler2D tPositions;
      attribute vec2 aComputeUV;
      ${shader.vertexShader}
    `;
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      vec4 computedData = texture2D(tPositions, aComputeUV);
      vec3 computedPos = computedData.xyz;
      float computedScale = computedData.w;
      
      vec3 transformed = position * computedScale;
      transformed += computedPos;
      `
    );
  }, []);

  return (
    <a.meshPhysicalMaterial 
      onBeforeCompile={onBeforeCompile}
      vertexColors={settings.colorMode === 'vertex'}
      color={settings.colorMode === 'single' ? (settings.baseColor || '#3b82f6') : '#ffffff'}
      metalness={settings.metalness ?? 0.1}
      roughness={settings.roughness ?? 0.5}
      transmission={settings.transmission ?? 0.0}
      thickness={settings.thickness ?? 0.0}
      ior={1.5}
      transparent={true}
      depthWrite={false}
      opacity={opacity}
    />
  );
}

// --- LOGIKA ---
function useParticleLogic(meshRef, pointerLightRef, settings, appConfig, posY, compute) {
  const prevMouse = useRef(new THREE.Vector3(9999, 9999, 9999));
  const smoothedMouse = useRef(new THREE.Vector3(9999, 9999, 9999));
  const mouseVelocity = useMemo(() => new THREE.Vector3(), []);

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
    velUniforms.uMouseForce.value = phys.mouseForce ?? 1.0;

    // Rovina pro raycaster musí VŽDY směřovat ke kameře, jinak se při rotaci rozbije interakce
    const planeNormal = new THREE.Vector3();
    state.camera.getWorldDirection(planeNormal);
    planeNormal.negate(); // Normála směřuje proti pohledu kamery
    
    const planePoint = new THREE.Vector3();
    meshRef.current.getWorldPosition(planePoint); 
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);
    const rawTarget = state.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    
    const invMat = new THREE.Matrix4().copy(meshRef.current.matrixWorld).invert();
    
    // Získat SKUTEČNOU světovou pozici kamery, ne její lokální [0,0,0] z rigu!
    const worldCameraPos = new THREE.Vector3();
    state.camera.getWorldPosition(worldCameraPos);
    const localCameraPos = worldCameraPos.applyMatrix4(invMat);

    if (rawTarget) {
      meshRef.current.worldToLocal(rawTarget);

      if (smoothedMouse.current.x === 9999) {
        smoothedMouse.current.copy(rawTarget);
        prevMouse.current.copy(rawTarget);
      } else {
        smoothedMouse.current.lerp(rawTarget, 0.4);
      }

      mouseVelocity.subVectors(smoothedMouse.current, prevMouse.current);
      prevMouse.current.copy(smoothedMouse.current);

      const rayDir = new THREE.Vector3().subVectors(smoothedMouse.current, localCameraPos).normalize();
      
      velUniforms.uMousePos.value.copy(localCameraPos);
      velUniforms.uMouseDir.value.copy(rayDir);
      velUniforms.uMouseVel.value.copy(mouseVelocity);
      
      if (pointerLightRef.current) {
        pointerLightRef.current.position.copy(smoothedMouse.current);
        pointerLightRef.current.position.z += 1.0; 
      }
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

function StandardParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder }) {
  const meshRef = useRef();
  const pointerLightRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
  const { gl } = useThree();

  const count = settings.count ?? 2000;
  const radius = settings.radius ?? 2.0;
  const shape = settings.shape || 'sphere';
  const posX = settings.objectX ?? 0.0;
  const posY = settings.objectY ?? 2.0;
  const posZ = -(settings.objectZ ?? 4.0);

  const particlesData = useMemo(() => {
    const data = [];
    const baseColorObj = new THREE.Color(settings.baseColor || '#3b82f6');

    for (let i = 0; i < count; i++) {
      let x, y, z;

      if (shape === 'cube') {
        x = (Math.random() - 0.5) * radius * 2;
        y = (Math.random() - 0.5) * radius * 2;
        z = (Math.random() - 0.5) * radius * 2;
      } else if (shape === 'cylinder') {
        const u = Math.random();
        const theta = 2 * Math.PI * u;
        const r = radius + (Math.random() - 0.5) * 2; 
        const h = settings.height ?? 40;
        x = r * Math.cos(theta);
        z = r * Math.sin(theta);
        y = (Math.random() - 0.5) * h;
      } else {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radius * Math.pow(Math.random(), 0.7);
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi);
      }

      const baseSize = settings.baseSize ?? 0.1;
      const sizeRandomness = settings.sizeRandomness ?? 0.5;

      const isLarge = Math.random() > 0.95;
      let scale = baseSize * (1.0 + (Math.random() - 0.5) * sizeRandomness);
      if (isLarge) {
        scale += baseSize * (2.0 + Math.random()) * sizeRandomness;
      }
      scale = Math.max(0.001, scale);

      let color = baseColorObj;
      if (settings.colorMode === 'vertex') {
        color = colors[3];
        const colorRoll = Math.random();
        if (colorRoll > 0.85) color = colors[0];
        else if (colorRoll > 0.75) color = colors[1];
        else if (colorRoll > 0.65) color = colors[2];
      }
      
      const speed = Math.random() * 0.5 + 0.1;
      const offset = Math.random() * Math.PI * 2;

      data.push({ x, y, z, scale, color, speed, offset });
    }
    return data;
  }, [count, radius, shape, colors, settings.baseSize, settings.sizeRandomness, settings.colorMode, settings.baseColor]);

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

  useEffect(() => {
    if (!meshRef.current || !compute) return;
    
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, particlesData[i].color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.frustumCulled = false;
    
    meshRef.current.geometry.setAttribute('aComputeUV', new THREE.InstancedBufferAttribute(computeUVs, 2));
  }, [count, particlesData, dummy, compute, computeUVs]);

  useParticleLogic(meshRef, pointerLightRef, settings, appConfig, posY, compute);

  return (
    <group position={[posX, 0, posZ]}>
      <instancedMesh ref={meshRef} args={[null, null, count]} castShadow receiveShadow renderOrder={renderOrder}>
        <sphereGeometry args={[1, 16, 16]} />
        <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} />
      </instancedMesh>
      
      <group ref={pointerLightRef}>
        <pointLight distance={15} intensity={appConfig?.particlePhysics?.laserIntensity ?? 10} color="#60a5fa" />
      </group>
    </group>
  );
}

function CustomParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder }) {
  const { scene } = useGLTF(`/obsah/${settings.customModel}`);
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
  const pointerLightRef = useRef();
  const { gl } = useThree();

  const posX = settings.objectX ?? 0.0;
  const posY = settings.objectY ?? 2.0;
  const posZ = -(settings.objectZ ?? 4.0);
  
  const { vertices, center } = useMemo(() => {
    const pts = [];
    const bbox = new THREE.Box3().setFromObject(scene);
    const c = new THREE.Vector3();
    bbox.getCenter(c);

    scene.traverse((child) => {
      if ((child.isMesh || child.isPoints) && child.geometry) {
        const posAttribute = child.geometry.attributes.position;
        const colorAttribute = child.geometry.attributes.color;
        const localMatrix = child.matrixWorld;
        const v = new THREE.Vector3();
        const col = new THREE.Color();
        
        for (let i = 0; i < posAttribute.count; i++) {
          v.fromBufferAttribute(posAttribute, i);
          v.applyMatrix4(localMatrix);
          
          let pointColor = new THREE.Color('#ffffff');
          if (colorAttribute) {
            col.fromBufferAttribute(colorAttribute, i);
            pointColor = col.clone();
          }
          
          pts.push({ v: v.clone(), c: pointColor });
        }
      }
    });

    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }

    return { vertices: pts, center: c };
  }, [scene]);

  const radiusScale = (settings.radius ?? 2.0) / 2.0;
  const densityPercent = settings.densityPercent ?? 100;
  const count = vertices.length > 0 ? Math.max(1, Math.floor(vertices.length * (densityPercent / 100))) : 0;

  const particlesData = useMemo(() => {
    const data = [];
    const baseColorObj = new THREE.Color(settings.baseColor || '#3b82f6');

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

        x *= radiusScale;
        y *= radiusScale;
        z *= radiusScale;
      }

      const baseSize = settings.baseSize ?? 0.1;
      const sizeRandomness = settings.sizeRandomness ?? 0.5;

      const isLarge = Math.random() > 0.95;
      let scale = baseSize * (1.0 + (Math.random() - 0.5) * sizeRandomness);
      if (isLarge) {
        scale += baseSize * (2.0 + Math.random()) * sizeRandomness;
      }
      scale = Math.max(0.001, scale);
      
      const speed = Math.random() * 0.5 + 0.1;
      const offset = Math.random() * Math.PI * 2;

      data.push({ x, y, z, scale, color, speed, offset });
    }
    return data;
  }, [count, vertices, center, colors, settings.baseSize, settings.sizeRandomness, settings.radius, settings.colorMode, settings.baseColor]);

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

  useEffect(() => {
    if (!meshRef.current || !compute) return;

    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, particlesData[i].color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.frustumCulled = false;
    
    meshRef.current.geometry.setAttribute('aComputeUV', new THREE.InstancedBufferAttribute(computeUVs, 2));
  }, [count, particlesData, dummy, compute, computeUVs]);

  useParticleLogic(meshRef, pointerLightRef, settings, appConfig, posY, compute);

  return (
    <group position={[posX, 0, posZ]}>
      <instancedMesh ref={meshRef} args={[null, null, count]} castShadow receiveShadow renderOrder={renderOrder}>
        <sphereGeometry args={[1, 16, 16]} />
        <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} />
      </instancedMesh>
      
      <group ref={pointerLightRef}>
        <pointLight distance={15} intensity={appConfig?.particlePhysics?.laserIntensity ?? 10} color="#60a5fa" />
      </group>
    </group>
  );
}

function GeometryParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
  const pointerLightRef = useRef();
  const { gl } = useThree();

  const posX = settings.objectX ?? 0.0;
  const posY = settings.objectY ?? 0.0;
  const posZ = settings.objectZ ?? 0.0;
  
  const { vertices, center } = useMemo(() => {
    const pts = [];
    const c = new THREE.Vector3();
    const geom = settings.customGeometry;
    
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

    return { vertices: pts, center: c };
  }, [settings.customGeometry]);

  const radiusScale = settings.radius ?? 1.0;
  const densityPercent = settings.densityPercent ?? 100;
  const count = vertices.length > 0 ? Math.max(1, Math.floor(vertices.length * (densityPercent / 100))) : 0;

  const particlesData = useMemo(() => {
    const data = [];
    const baseColorObj = new THREE.Color(settings.baseColor || '#3b82f6');

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

      const baseSize = settings.baseSize ?? 0.1;
      const sizeRandomness = settings.sizeRandomness ?? 0.5;

      const isLarge = Math.random() > 0.95;
      let scale = baseSize * (1.0 + (Math.random() - 0.5) * sizeRandomness);
      if (isLarge) {
        scale += baseSize * (2.0 + Math.random()) * sizeRandomness;
      }
      scale = Math.max(0.001, scale);
      
      const speed = Math.random() * 0.5 + 0.1;
      const offset = Math.random() * Math.PI * 2;

      data.push({ x, y, z, scale, color, speed, offset });
    }
    return data;
  }, [count, vertices, center, colors, settings.baseSize, settings.sizeRandomness, settings.radius, settings.colorMode, settings.baseColor]);

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

  useEffect(() => {
    if (!meshRef.current || !compute) return;

    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, particlesData[i].color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.frustumCulled = false;
    
    meshRef.current.geometry.setAttribute('aComputeUV', new THREE.InstancedBufferAttribute(computeUVs, 2));
  }, [count, particlesData, dummy, compute, computeUVs]);

  const transform = settings.transform || { position: [posX, 0, posZ] };
  useParticleLogic(meshRef, pointerLightRef, settings, appConfig, 0, compute);

  return (
    <group {...transform}>
      <instancedMesh ref={meshRef} args={[null, null, count]} castShadow receiveShadow renderOrder={renderOrder}>
        <sphereGeometry args={[1, 16, 16]} />
        <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} />
      </instancedMesh>
      
      <group ref={pointerLightRef}>
        <pointLight distance={15} intensity={appConfig?.particlePhysics?.laserIntensity ?? 10} color="#60a5fa" />
      </group>
    </group>
  );
}

export function ParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder = 0 }) {
  if (!settings?.hasParticles) return null;
  
  if (settings.shape === 'custom' && settings.customModel) {
    return <CustomParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} />;
  }

  if (settings.shape === 'geometry' && settings.customGeometry) {
    return <GeometryParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} />;
  }
  
  return <StandardParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} />;
}

