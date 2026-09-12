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

// --- MATERIÁLY ---
// 1. Původní refrakce pro pozadí (Válec / Kužel) - ZACHOVAT VŠECHNY EFEKTY VČETNĚ VODOVÉHO NOISU PŘI ROTACI S PŘECHODEM DO ČERNÉ
const VideoRefractionMaterialImpl = shaderMaterial(
  {
    tVideo: null,
    uDistortion: 0.1,
    uOpacity: 1.0,
    uColor: new THREE.Color("#3b82f6"),
    tPositions: null,
    uNoiseAmount: 0.0,
    uTime: 0.0,
    uMaxLight: 0.8,
    uMinDark: 0.05
  },
  `
  uniform sampler2D tPositions;
  attribute vec2 aComputeUV;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;
  varying vec3 vWorldPos;
  varying float vScale;
  
  void main() {
    vUv = uv;
    
    vec4 computedData = texture2D(tPositions, aComputeUV);
    vec3 computedPos = computedData.xyz;
    float computedScale = computedData.w;
    
    vec3 transformed = position * computedScale + computedPos;
    vec4 instancePosition = instanceMatrix * vec4(transformed, 1.0);
    vec4 mvPosition = viewMatrix * modelMatrix * instancePosition;
    
    mat3 m = mat3(instanceMatrix);
    vNormal = normalize(normalMatrix * m * normal);
    
    gl_Position = projectionMatrix * mvPosition;
    vScreenPos = gl_Position;
    vViewPosition = -mvPosition.xyz;
    vWorldPos = instancePosition.xyz;
    vScale = computedScale;
  }
  `,
  `
  uniform sampler2D tVideo;
  uniform float uDistortion;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform float uNoiseAmount;
  uniform float uTime;
  uniform float uMaxLight;
  uniform float uMinDark;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;
  varying vec3 vWorldPos;
  varying float vScale;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
    vec2 distortedUv = screenUv + (vNormal.xy * uDistortion);
    
    // 1. Vodový šum se počítá POUZE při rotaci / přechodu (uNoiseAmount > 0.001)
    // Při klidovém stavu šetří masivní množství GPU cyklů
    float waterNoise = 0.0;
    if (uNoiseAmount > 0.001) {
      waterNoise = snoise(vNormal.xy * 2.5 + vec2(uTime * 1.5, uTime * 0.8));
      distortedUv += waterNoise * (uNoiseAmount * 0.45);
      distortedUv = clamp(distortedUv, 0.0, 1.0);
    }
    
    // 2. Adaptivní zaostření textury podle velikosti koule (vScale)
    // Na velkých koulích posilujeme mikro-ostrost hran a detailů
    float sharpStrength = clamp((vScale - 0.12) * 4.0, 0.0, 1.25);
    
    vec4 texColor;
    if (sharpStrength > 0.05) {
      vec2 texel = vec2(0.00052, 0.00092); // ~1920x1080 texel krok
      vec4 center = texture2D(tVideo, distortedUv);
      vec4 n = texture2D(tVideo, distortedUv + vec2(0.0, texel.y));
      vec4 s = texture2D(tVideo, distortedUv - vec2(0.0, texel.y));
      vec4 e = texture2D(tVideo, distortedUv + vec2(texel.x, 0.0));
      vec4 w = texture2D(tVideo, distortedUv - vec2(texel.x, 0.0));
      vec4 blur = (n + s + e + w) * 0.25;
      texColor = clamp(center + (center - blur) * sharpStrength, 0.0, 1.0);
    } else {
      texColor = texture2D(tVideo, distortedUv);
    }
    
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = clamp(1.0 - max(dot(normal, viewDir), 0.0), 0.0, 1.0);
    fresnel = pow(fresnel, 3.0);
    
    vec3 baseVideoColor = texColor.rgb * uColor;
    vec3 mixedColor = baseVideoColor;
    float fresnelAmount = 0.5;
    
    // 3. Zamíchávání světlé a tmavé složky POUZE při rotaci
    if (uNoiseAmount > 0.001) {
      vec3 p = vWorldPos * 0.25;
      float swirl = snoise(p.xy + vec2(uTime * 0.5 + waterNoise * 0.5, p.z * 0.3));
      float swirlMix = clamp(swirl * 0.5 + 0.5, 0.0, 1.0);
      
      vec3 darkTarget = mix(vec3(0.0), uColor * 0.3, clamp(uMinDark, 0.0, 1.0));
      vec3 lightTarget = uColor * clamp(uMaxLight, 0.0, 3.0);
      vec3 swirledTone = mix(darkTarget, lightTarget, smoothstep(0.2, 0.8, swirlMix));
      
      float mixProgress = clamp(pow(uNoiseAmount, 1.2) * 1.15 + (waterNoise * 0.25 * uNoiseAmount), 0.0, 1.0);
      if (uNoiseAmount >= 0.95) {
        mixProgress = max(mixProgress, (uNoiseAmount - 0.95) / 0.05);
      }
      mixedColor = mix(baseVideoColor, swirledTone, mixProgress);
      fresnelAmount = mix(0.5, 0.35, mixProgress);
    }
    
    vec3 finalColor = mixedColor + (vec3(1.0) * fresnel * fresnelAmount);
    
    gl_FragColor = vec4(finalColor, uOpacity);
  }
  `
);

extend({ VideoRefractionMaterialImpl });

// 2. Nový Jelly Video materiál pro projektové částice (video uvnitř koule, zakřivené čočkou a s průchodem světla)
const JellyVideoMaterialImpl = shaderMaterial(
  {
    tVideo: null,
    tPositions: null,
    uColor: new THREE.Color("#6df73b"),
    uDistortion: 0.6,
    uRoughness: 0.2,
    uMetalness: 0.1,
    uTransmission: 0.85,
    uThickness: 1.2,
    uOpacity: 1.0,
    uNoiseAmount: 0.0,
    uTime: 0.0,
    uMaxLight: 0.8,
    uMinDark: 0.05
  },
  `
  uniform sampler2D tPositions;
  attribute vec2 aComputeUV;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;
  varying vec3 vWorldPos;
  varying float vScale;
  
  void main() {
    vUv = uv;
    
    vec4 computedData = texture2D(tPositions, aComputeUV);
    vec3 computedPos = computedData.xyz;
    float computedScale = computedData.w;
    
    vec3 transformed = position * computedScale + computedPos;
    vec4 instancePosition = instanceMatrix * vec4(transformed, 1.0);
    vec4 mvPosition = viewMatrix * modelMatrix * instancePosition;
    
    mat3 m = mat3(instanceMatrix);
    vNormal = normalize(normalMatrix * m * normal);
    
    gl_Position = projectionMatrix * mvPosition;
    vScreenPos = gl_Position;
    vViewPosition = -mvPosition.xyz;
    vWorldPos = instancePosition.xyz;
    vScale = computedScale;
  }
  `,
  `
  uniform sampler2D tVideo;
  uniform vec3 uColor;
  uniform float uDistortion;
  uniform float uRoughness;
  uniform float uMetalness;
  uniform float uTransmission;
  uniform float uThickness;
  uniform float uOpacity;
  uniform float uNoiseAmount;
  uniform float uTime;
  uniform float uMaxLight;
  uniform float uMinDark;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;
  varying vec3 vWorldPos;
  varying float vScale;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float NdotV = max(dot(normal, viewDir), 0.0);
    
    // 1. Sférické mapování celého videa do vnitřku každé kuličky
    vec2 sphereUv = normal.xy;
    float r = length(sphereUv);
    
    // Zakřivení optiky / čočky podle uDistortion
    float curvePower = mix(1.0, 0.65, clamp(uDistortion, 0.0, 2.0));
    float curvedR = (r > 0.0001) ? pow(r, curvePower) : 0.0;
    vec2 lensUv = (r > 0.0001) ? (sphereUv / r) * (curvedR * 0.49) + 0.5 : vec2(0.5);
    
    // Vodový šum POUZE při rotaci / přechodu (uNoiseAmount > 0.001)
    float waterNoise = 0.0;
    if (uNoiseAmount > 0.001) {
      waterNoise = snoise(sphereUv * 2.5 + vec2(uTime * 1.5, uTime * 0.8));
      lensUv += waterNoise * (uNoiseAmount * 0.25);
    }
    lensUv = clamp(lensUv, vec2(0.002), vec2(0.998));
    
    // 2. Adaptivní zaostření textury podle velikosti koule (vScale)
    float sharpStrength = clamp((vScale - 0.12) * 4.0, 0.0, 1.25);
    vec4 videoTex;
    if (sharpStrength > 0.05) {
      vec2 texel = vec2(0.00052, 0.00092);
      vec4 center = texture2D(tVideo, lensUv);
      vec4 n = texture2D(tVideo, lensUv + vec2(0.0, texel.y));
      vec4 s = texture2D(tVideo, lensUv - vec2(0.0, texel.y));
      vec4 e = texture2D(tVideo, lensUv + vec2(texel.x, 0.0));
      vec4 w = texture2D(tVideo, lensUv - vec2(texel.x, 0.0));
      vec4 blur = (n + s + e + w) * 0.25;
      videoTex = clamp(center + (center - blur) * sharpStrength, 0.0, 1.0);
    } else {
      videoTex = texture2D(tVideo, lensUv);
    }
    
    // 3. Absorpce světla a hloubka želé (Beer-Lambertův zákon pro tloušťku a sytost)
    float depth = sqrt(max(0.0, 1.0 - r * r)) * (1.0 + max(uThickness, 0.0) * 0.8);
    vec3 absorption = exp(-(vec3(1.0) - uColor) * depth * max(uThickness * 0.8, 0.15));
    
    // 4. Transmise a vnitřní vyzařování videa skrz želé
    vec3 innerVideoColor = videoTex.rgb * uColor * absorption;
    float trans = clamp(uTransmission, 0.0, 1.0);
    vec3 coreColor = mix(uColor * 0.25 * absorption, innerVideoColor, trans);
    
    float mixProgress = 0.0;
    // 5. Zamíchávání tmavé a světlé složky POUZE při rotaci
    if (uNoiseAmount > 0.001) {
      vec3 p = vWorldPos * 0.25;
      float swirl = snoise(p.xy + vec2(uTime * 0.5 + waterNoise * 0.5, p.z * 0.3));
      float swirlMix = clamp(swirl * 0.5 + 0.5, 0.0, 1.0);
      
      vec3 darkTarget = mix(vec3(0.0), uColor * 0.25, clamp(uMinDark, 0.0, 1.0));
      vec3 lightTarget = uColor * clamp(uMaxLight, 0.0, 3.0);
      vec3 swirledTone = mix(darkTarget, lightTarget, smoothstep(0.2, 0.8, swirlMix));
      
      mixProgress = clamp(pow(uNoiseAmount, 1.2) * 1.15 + (waterNoise * 0.25 * uNoiseAmount), 0.0, 1.0);
      if (uNoiseAmount >= 0.95) {
        mixProgress = max(mixProgress, (uNoiseAmount - 0.95) / 0.05);
      }
      coreColor = mix(coreColor, swirledTone, mixProgress);
    }
    
    // 4. Odlesky a lesklost povrchu (Roughness a Metalness)
    vec3 keyLight = normalize(vec3(0.35, 0.85, 0.55));
    vec3 H1 = normalize(keyLight + viewDir);
    float NdotH1 = max(dot(normal, H1), 0.0);
    float rough = clamp(uRoughness, 0.02, 1.0);
    float shininess = mix(140.0, 6.0, rough);
    float spec1 = pow(NdotH1, shininess);
    
    vec3 fillLight = normalize(vec3(-0.4, -0.3, 0.7));
    vec3 H2 = normalize(fillLight + viewDir);
    float spec2 = pow(max(dot(normal, H2), 0.0), shininess * 0.6) * 0.35;
    
    float metal = clamp(uMetalness, 0.0, 1.0);
    vec3 specTint = mix(vec3(1.0), uColor, metal);
    vec3 totalSpecular = (spec1 + spec2) * specTint * (1.0 - rough * 0.5);
    
    // 5. Mokrý želatinový Fresnel lem a translucentní podsvícení (Subsurface Scattering)
    float fresnel = pow(1.0 - NdotV, mix(3.5, 2.0, rough));
    vec3 rimGlaze = mix(vec3(1.0), uColor, 0.4) * (fresnel * (1.0 - rough * 0.4) * 0.6);
    
    float sss = pow(max(0.0, dot(viewDir, -keyLight + normal * 0.4)), 2.0) * 0.5;
    vec3 sssGlow = sss * uColor * (videoTex.rgb + 0.25) * trans * (1.0 - mixProgress * 0.8);
    
    // 6. Výsledný složený vzhled
    vec3 finalColor = coreColor + (totalSpecular + rimGlaze) * mix(1.0, 0.4, mixProgress) + sssGlow;
    finalColor = mix(finalColor, finalColor * uColor, metal * 0.5);
    
    gl_FragColor = vec4(finalColor, uOpacity);
  }
  `
);

extend({ JellyVideoMaterialImpl });

export function ParticleMaterial({ settings, videoTexture, opacity = 1, rotationY, pageDistance }) {
  const isCylinder = settings.isCylinder || settings.scatterSpring !== undefined || (settings.shape === 'cylinder' && !settings.customGeometry);
  const matRef = useRef();

  useFrame((state) => {
    if (!matRef.current) return;
    const time = state.clock.getElapsedTime();
    if (matRef.current.uniforms) {
      if (matRef.current.uniforms.uTime) {
        matRef.current.uniforms.uTime.value = time;
      }
      if (matRef.current.uniforms.tVideo && videoTexture) {
        matRef.current.uniforms.tVideo.value = videoTexture;
      }
      if (rotationY && pageDistance) {
        const val = rotationY.get();
        const exactIdx = val / -pageDistance;
        const remainder = Math.abs(exactIdx - Math.round(exactIdx));
        const amt = Math.min(remainder * 2.0, 1.0);
        if (matRef.current.uniforms.uNoiseAmount) {
          matRef.current.uniforms.uNoiseAmount.value = amt;
        }
      }
      if (matRef.current.uniforms.uMaxLight && settings.transitionMaxLight !== undefined) {
        matRef.current.uniforms.uMaxLight.value = settings.transitionMaxLight;
      }
      if (matRef.current.uniforms.uMinDark && settings.transitionMinDark !== undefined) {
        matRef.current.uniforms.uMinDark.value = settings.transitionMinDark;
      }
    }
  });

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

  // Pro válec na pozadí (GlobalBackground / Kužel) - NESAHAT NA KUŽEL, PLNÉ ZACHOVÁNÍ
  if (isCylinder) {
    if (videoTexture) {
      return (
        <videoRefractionMaterialImpl 
          ref={matRef}
          tVideo={videoTexture} 
          uDistortion={settings.refractionDistortion ?? 0.15}
          uOpacity={opacity}
          uColor={new THREE.Color(settings.baseColor || '#3b82f6')}
          uMaxLight={settings.transitionMaxLight ?? 0.8}
          uMinDark={settings.transitionMinDark ?? 0.05}
          transparent={true}
          depthWrite={true}
        />
      );
    } else {
      return (
        <a.meshPhysicalMaterial 
          onBeforeCompile={onBeforeCompile}
          color={settings.baseColor || '#3b82f6'}
          metalness={settings.metalness ?? 0.1}
          roughness={settings.roughness ?? 0.5}
          transparent={true}
          depthWrite={true}
          opacity={opacity}
        />
      );
    }
  }

  // Pro projektové částice v módu video použijeme nový bohatý Jelly materiál s plným zapojením nastavení
  if (settings.colorMode === 'video' && videoTexture) {
    return (
      <jellyVideoMaterialImpl 
        ref={matRef}
        tVideo={videoTexture} 
        uColor={new THREE.Color(settings.baseColor || '#6df73b')}
        uDistortion={settings.refractionDistortion ?? 0.6}
        uRoughness={settings.roughness ?? 0.2}
        uMetalness={settings.metalness ?? 0.1}
        uTransmission={settings.transmission !== undefined ? settings.transmission : 0.85}
        uThickness={settings.thickness !== undefined ? settings.thickness : 1.2}
        uOpacity={opacity}
        uMaxLight={settings.transitionMaxLight ?? 0.8}
        uMinDark={settings.transitionMinDark ?? 0.05}
        transparent={true}
        depthWrite={true}
      />
    );
  }

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
      depthWrite={true}
      opacity={opacity}
    />
  );
}

// --- LOGIKA ---
function useParticleLogic(meshRef, settings, appConfig, posY, compute) {
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
    velUniforms.uMouseForce.value = phys.mouseForce ?? 1.0;

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

function StandardParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder }) {
  const meshRef = useRef();
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

      const sizeMult = settings.sizeMultiplier ?? 1.0;
      const baseSize = (settings.baseSize ?? 0.1) * sizeMult;
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
  }, [count, radius, shape, colors, settings.baseSize, settings.sizeRandomness, settings.colorMode, settings.baseColor, settings.sizeMultiplier]);

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

  useParticleLogic(meshRef, settings, appConfig, posY, compute);

  return (
    <group position={[posX, 0, posZ]}>
      <instancedMesh ref={meshRef} args={[null, null, count]} castShadow receiveShadow renderOrder={renderOrder}>
        <sphereGeometry args={[1, 8, 8]} />
        <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} rotationY={rotationY} pageDistance={pageDistance} />
      </instancedMesh>
    </group>
  );
}

function CustomParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance }) {
  const { scene } = useGLTF(`/obsah/${settings.customModel}`);
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
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

      const sizeMult = settings.sizeMultiplier ?? 1.0;
      const baseSize = (settings.baseSize ?? 0.1) * sizeMult;
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
  }, [count, vertices, center, colors, settings.baseSize, settings.sizeRandomness, settings.radius, settings.colorMode, settings.baseColor, settings.sizeMultiplier]);

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

  useParticleLogic(meshRef, settings, appConfig, posY, compute);

  return (
    <group position={[posX, 0, posZ]}>
      <instancedMesh ref={meshRef} args={[null, null, count]} castShadow receiveShadow renderOrder={renderOrder}>
        <sphereGeometry args={[1, 8, 8]} />
        <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} rotationY={rotationY} pageDistance={pageDistance} />
      </instancedMesh>
    </group>
  );
}

function GeometryParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
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

      const sizeMult = settings.sizeMultiplier ?? 1.0;
      const baseSize = (settings.baseSize ?? 0.1) * sizeMult;
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
  }, [count, vertices, center, colors, settings.baseSize, settings.sizeRandomness, settings.radius, settings.colorMode, settings.baseColor, settings.sizeMultiplier]);

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
  useParticleLogic(meshRef, settings, appConfig, 0, compute);

  return (
    <group {...transform}>
      <instancedMesh ref={meshRef} args={[null, null, count]} castShadow receiveShadow renderOrder={renderOrder}>
        <sphereGeometry args={[1, 8, 8]} />
        <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} rotationY={rotationY} pageDistance={pageDistance} />
      </instancedMesh>
    </group>
  );
}

export function ParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder = 0, rotationY, pageDistance }) {
  if (!settings?.hasParticles) return null;
  
  if (settings.shape === 'custom' && settings.customModel) {
    return <CustomParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
  }

  if (settings.shape === 'geometry' && settings.customGeometry) {
    return <GeometryParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
  }
  
  return <StandardParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
}

