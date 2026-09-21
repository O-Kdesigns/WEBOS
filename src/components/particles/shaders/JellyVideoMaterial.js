import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

export const JellyVideoMaterialImpl = shaderMaterial(
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
