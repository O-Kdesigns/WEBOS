import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';
import { TEX_LOD0 } from '../../../glslTexLod0';

export const VideoRefractionMaterialImpl = shaderMaterial(
  {
    tVideo: null,
    uDistortion: 0.1,
    uOpacity: 1.0,
    uColor: new THREE.Color("#3b82f6"),
    tPositions: null,
    uNoiseAmount: 0.0,
    uTime: 0.0,
    uMaxLight: 0.8,
    uMinDark: 0.05,
    uTransitionProgress: 1.0,
    uDnaColor: new THREE.Color('#3b82f6')
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
    vec4 mvPosition = modelViewMatrix * instancePosition; // = viewMatrix * modelMatrix, bez násobení matic na vrchol
    
    vNormal = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
    
    gl_Position = projectionMatrix * mvPosition;
    vScreenPos = gl_Position;
    vViewPosition = -mvPosition.xyz;
    vWorldPos = instancePosition.xyz;
    vScale = computedScale;
  }
  `,
  `${TEX_LOD0}
  uniform sampler2D tVideo;
  uniform float uDistortion;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform float uNoiseAmount;
  uniform float uTime;
  uniform float uMaxLight;
  uniform float uMinDark;
  uniform float uTransitionProgress;
  uniform vec3 uDnaColor;
  
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
    vec3 uColorMod = mix(uDnaColor, uColor, smoothstep(0.0, 1.0, uTransitionProgress));
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
    
    vec3 baseVideoColor = texColor.rgb * uColorMod;
    vec3 mixedColor = baseVideoColor;
    float fresnelAmount = 0.5;
    
    // 3. Zamíchávání světlé a tmavé složky POUZE při rotaci
    if (uNoiseAmount > 0.001) {
      vec3 p = vWorldPos * 0.25;
      float swirl = snoise(p.xy + vec2(uTime * 0.5 + waterNoise * 0.5, p.z * 0.3));
      float swirlMix = clamp(swirl * 0.5 + 0.5, 0.0, 1.0);
      
      vec3 darkTarget = mix(vec3(0.0), uColorMod * 0.3, clamp(uMinDark, 0.0, 1.0));
      vec3 lightTarget = uColorMod * clamp(uMaxLight, 0.0, 3.0);
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
