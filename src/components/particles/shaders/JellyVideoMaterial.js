import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';
import { TEX_LOD0 } from '../../../glslTexLod0';
import { PARTICLE_DECL, BAKE_LIFT_GLSL } from '../../../SolidLink';
import { ESC_VERTEX } from './escapeGlsl';
import { DNA_RAINBOW_GLSL, DNA_PALETTE_MAX } from './dnaRainbow';

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
    uMinDark: 0.05,
    uTransitionProgress: 1.0,
    uDnaPalette: new Array(DNA_PALETTE_MAX).fill(0).map(() => new THREE.Color("#3b82f6")),
    uDnaCount: 2,
    uTint: 0.35,
    uWobble: 0.5,
    uVideoGain: 1.4,
    uGlowKnee: 3.0,
    uGlowRoll: 0.5,
    // odtržené particly (utils.js ESCAPE_DEFAULTS, plní useParticleLogic)
    tVelocities: null,
    uEscColor: new THREE.Color("#ffb347"),
    uEscTint: 0.0,
    uEscFlash: 0.0,
    uEscFlashTime: 0.6,
    uEscGlow: 0.0,
    uEscPop: 0.0,
    uEscLife: 25.0,
    // barva ze zapečeného světla solidu (UV nejbližšího bodu solidu na particl, GeometryParticleObject + SolidLink)
    tSurfUV: null,
    uBakeOn: 0.0
  },
  `
  uniform sampler2D tPositions;
  uniform float uTransitionProgress;
  uniform float uTime;
  uniform float uWobble;
  attribute vec2 aComputeUV;
  uniform sampler2D tVelocities;
  uniform float uEscFlashTime;
  uniform float uEscPop;
  uniform float uEscLife;
  uniform sampler2D tSurfUV;
  uniform sampler2D tBakeLight;
  uniform float uBakeOn, uBakePart, uBakeLift;
  ${BAKE_LIFT_GLSL}
  varying vec3 vBake;
  varying float vEsc;
  varying float vEscFlash;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;
  varying vec3 vWorldPos;
  varying float vScale;
  varying vec3 vRand;
  
  void main() {
    vUv = uv;
    
    vec4 computedData = texture2D(tPositions, aComputeUV);
    vec3 computedPos = computedData.xyz;
    float computedScale = computedData.w;
    ${ESC_VERTEX}

    // zapečené světlo solidu v místě, kde particl na solidu sedí (mip 2 = průměr okolí ~1 cm, ne jeden texel)
    vec4 surfUV = texture2D(tSurfUV, aComputeUV);
    // particly obsahu = svítící díly -> všechny svítí naplno; z textury se bere jen odstín. Kde je solid pod particlem
    // tmavý (černý kov), odstín z širšího okolí (mip 6 ≈ 30 texelů), jinak rudá emisních dílů.
    // (bez textury UV je surfUV nula -> w 0 -> rudá emisních dílů)
    float bkOn = uBakeOn;
    vBake = vec3(0.0);
    if (bkOn > 0.0 && surfUV.w < 0.5) {
      vBake = vec3(1.0, 0.03, 0.01) * (bkOn * uBakePart);
    } else if (bkOn > 0.0) {
      vec3 bkT = bakeLift(textureLod(tBakeLight, surfUV.xy, 2.0).rgb, 1.0, uBakeLift);
      vec3 bkW = textureLod(tBakeLight, surfUV.xy, 6.0).rgb;
      float bkP = max(bkT.r, max(bkT.g, bkT.b)), bkPW = max(bkW.r, max(bkW.g, bkW.b));
      vec3 bkHue = bkP > 0.03 ? bkT / bkP : (bkPW > 1e-4 ? bkW / bkPW : vec3(1.0, 0.03, 0.01));
      vBake = bkHue * (bkOn * uBakePart);
    }

    // náhoda na particl (stabilní, z UV v compute textuře)
    vRand = fract(sin(vec3(dot(aComputeUV, vec2(127.1, 311.7)), dot(aComputeUV, vec2(269.5, 183.3)), dot(aComputeUV, vec2(419.2, 371.9)))) * 43758.5453);

    // želé: kulička se pomalu přelévá (tvar dýchá), každá v jiné fázi
    float ph = vRand.x * 6.2832;
    float t = uTime * (1.6 + vRand.y);
    float w = sin(position.x * 2.6 + t + ph) * sin(position.y * 2.3 - t * 0.83 + ph * 1.7) + 0.6 * sin(position.z * 3.1 + t * 1.2 - ph);
    vec3 p = position * (1.0 + uWobble * 0.14 * w * smoothstep(0.0, 1.0, uTransitionProgress));

    // minimální vzdálenost od kamery: kulička těsně u objektivu se zmenší do ztracena (jinak zakryje půl obrazu)
    // modelViewMatrix = viewMatrix * modelMatrix spočítaná jednou na CPU; závorky = jen matice × vektor
    // (dřív 2× násobení matic 4×4 na každý vrchol, ~2,6 M vrcholů za snímek)
    vec4 centerView = modelViewMatrix * (instanceMatrix * vec4(computedPos, 1.0));
    float nearFade = smoothstep(0.12, 0.4, -centerView.z);

    vec3 transformed = p * computedScale * nearFade + computedPos;
    vec4 instancePosition = instanceMatrix * vec4(transformed, 1.0);
    vec4 mvPosition = modelViewMatrix * instancePosition;
    
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
  varying vec3 vRand;
  uniform float uTint;
  uniform float uVideoGain;
  uniform float uGlowKnee;
  uniform float uGlowRoll;
  uniform vec3 uEscColor;
  uniform float uEscTint;
  uniform float uEscFlash;
  uniform float uEscGlow;
  varying float vEsc;
  varying float vEscFlash;
  varying vec3 vBake;
  uniform float uBakePTint, uBakePGlow;

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

  uniform float uTransitionProgress;
  ${DNA_RAINBOW_GLSL}
  ${PARTICLE_DECL}

  void main() {
    // stojatá duha v ORBITu: world-space pole (na kameře nezávislé), pomalu tažené v čase,
    // namíchané z uDnaPalette (2D prach + barvy portfolií, viz ParticleMaterial.jsx)
    float dnaField = fract(0.5 + uTime * 0.00225
      + vWorldPos.y * 0.058
      + snoise(vWorldPos.xz * 0.08 + vec2(uTime * 0.00555, -uTime * 0.00405)) * 0.3
      + snoise(vWorldPos.xy * 0.058 + vec2(-uTime * 0.0033, uTime * 0.0048) + 11.3) * 0.25);
    vec3 uColorMod = mix(dnaPaletteBlend(dnaField), uColor, smoothstep(0.0, 1.0, uTransitionProgress));
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float NdotV = max(dot(normal, viewDir), 0.0);
    
    // 1. Kulička = čočka: v každé je CELÉ video, převrácené (jako skleněná kulička) a zakřivené k okraji
    vec2 sphereUv = normal.xy;
    float r = min(length(sphereUv), 1.0);
    float curvePower = mix(1.0, 0.55, clamp(uDistortion * 0.5, 0.0, 1.0));
    vec2 dir = r > 0.0001 ? sphereUv / r : vec2(0.0);
    vec2 lensUv = 0.5 - dir * pow(r, curvePower) * 0.49;
    // lehce navázat na polohu na obrazovce (sousední kuličky ukazují podobný výřez = vypadá to jako lom pozadí)
    // + drobný náhodný posun a zoom na kuličku -> každá má trochu jiný jas/odstín
    vec2 screenUv = vScreenPos.xy / max(vScreenPos.w, 1e-4) * 0.5 + 0.5;
    lensUv = mix(lensUv, screenUv, 0.2) + (vRand.xy - 0.5) * 0.12;
    
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
    // "okolí" = průměr 4 vzdálených vzorků videa – čím svítí prostředí na okraji kuličky
    vec2 ec = vec2(0.5) + (screenUv - 0.5) * 0.5;
    vec3 envCol = (texture2D(tVideo, ec + vec2(0.22, 0.2)).rgb + texture2D(tVideo, ec + vec2(-0.22, 0.2)).rgb
                 + texture2D(tVideo, ec + vec2(0.22, -0.2)).rgb + texture2D(tVideo, ec + vec2(-0.22, -0.2)).rgb) * 0.25;
    
    // 3. Želé tělo: tónování barvou jen z části (uTint), ať video ukáže svoje barvy.
    //    Absorpce (Beer-Lambert) roste k okraji – delší cesta světla = sytější a tmavší lem
    vec3 tint = mix(vec3(1.0), uColorMod, clamp(uTint, 0.0, 1.0));
    float path = mix(0.35, 1.25, 1.0 - NdotV) * max(uThickness, 0.0);
    vec3 absorption = exp(-(vec3(1.0) - uColorMod) * path * (0.3 + uTint));
    // náhodný jas na kuličku (jako v hloubce různě nasvícené kapky)
    float bead = mix(0.55, 1.25, vRand.z * vRand.z);
    
    // 4. Transmise a vnitřní vyzařování videa skrz želé
    vec3 innerVideoColor = videoTex.rgb * tint * absorption * uVideoGain * bead;
    float trans = clamp(uTransmission, 0.0, 1.0);
    vec3 coreColor = mix(uColorMod * 0.12 * absorption, innerVideoColor, trans);
    // tmavý lem uvnitř obrysu (lom na okraji koule vede světlo jinam)
    coreColor *= mix(1.0, 0.3, smoothstep(0.6, 0.98, r));
    
    float mixProgress = 0.0;
    // 5. Zamíchávání tmavé a světlé složky POUZE při rotaci
    if (uNoiseAmount > 0.001) {
      vec3 p = vWorldPos * 0.25;
      float swirl = snoise(p.xy + vec2(uTime * 0.5 + waterNoise * 0.5, p.z * 0.3));
      float swirlMix = clamp(swirl * 0.5 + 0.5, 0.0, 1.0);
      
      vec3 darkTarget = mix(vec3(0.0), uColorMod * 0.25, clamp(uMinDark, 0.0, 1.0));
      vec3 lightTarget = uColorMod * clamp(uMaxLight, 0.0, 3.0);
      vec3 swirledTone = mix(darkTarget, lightTarget, smoothstep(0.2, 0.8, swirlMix));
      
      mixProgress = clamp(pow(uNoiseAmount, 1.2) * 1.15 + (waterNoise * 0.25 * uNoiseAmount), 0.0, 1.0);
      if (uNoiseAmount >= 0.95) {
        mixProgress = max(mixProgress, (uNoiseAmount - 0.95) / 0.05);
      }
      coreColor = mix(coreColor, swirledTone, mixProgress);
    }
    
    // 6. Odlesky: ostrý mokrý bod + měkký druhý (Roughness a Metalness)
    vec3 keyLight = normalize(vec3(0.35, 0.85, 0.55));
    vec3 H1 = normalize(keyLight + viewDir);
    float NdotH1 = max(dot(normal, H1), 0.0);
    float rough = clamp(uRoughness, 0.02, 1.0);
    float shininess = mix(220.0, 8.0, rough);
    float spec1 = pow(NdotH1, shininess) * 1.6 + pow(NdotH1, shininess * 0.12) * 0.12;
    
    vec3 fillLight = normalize(vec3(-0.4, -0.3, 0.7));
    vec3 H2 = normalize(fillLight + viewDir);
    float spec2 = pow(max(dot(normal, H2), 0.0), shininess * 0.6) * 0.3;
    
    float metal = clamp(uMetalness, 0.0, 1.0);
    vec3 specTint = mix(vec3(1.0), uColorMod, metal);
    vec3 totalSpecular = (spec1 + spec2) * specTint * (1.0 - rough * 0.5);
    
    // 7. Želé: kaustika = čočka soustředí světlo na opačnou stranu, než je odlesk (svítivý půlměsíc uvnitř)
    float caustic = pow(max(dot(-dir, keyLight.xy / max(length(keyLight.xy), 1e-4)), 0.0), 2.0) * smoothstep(0.35, 0.8, r) * (1.0 - smoothstep(0.85, 1.0, r));
    vec3 causticGlow = caustic * (videoTex.rgb * 1.6 + envCol) * tint * trans * 0.9;

    // 8. Mokrý Fresnel lem = odraz okolí (rozmazané video), ne bílá
    float fresnel = pow(1.0 - NdotV, mix(4.0, 2.2, rough));
    vec3 rimGlaze = mix(envCol * 1.4 + 0.03, vec3(0.8), 0.2) * fresnel * (1.0 - rough * 0.4) * 0.3;
    
    float sss = pow(max(0.0, dot(viewDir, -keyLight + normal * 0.4)), 2.0) * 0.35;
    vec3 sssGlow = sss * tint * (videoTex.rgb + 0.1) * trans * (1.0 - mixProgress * 0.8);
    
    // 9. Výsledný složený vzhled
    // práh záře: světlo z videa pod prahem beze změny, nad ním se měkce stlačí (max +uGlowRoll)
    // -> kuličky, co už pěkně svítí, se při jasnějším videu nepřepálí. uGlowKnee >= 3 = vypnuto
    vec3 vidLight = coreColor + causticGlow * mix(1.0, 0.4, mixProgress) + sssGlow;
    float vPeak = max(max(vidLight.r, vidLight.g), vidLight.b);
    if (uGlowKnee < 2.99 && vPeak > uGlowKnee) {
      float over = vPeak - uGlowKnee;
      vidLight *= (uGlowKnee + over / (1.0 + over / max(uGlowRoll, 0.01))) / vPeak;
    }
    vec3 finalColor = vidLight + (totalSpecular + rimGlaze) * mix(1.0, 0.4, mixProgress);
    finalColor = mix(finalColor, finalColor * uColorMod, metal * 0.5);
    
    // přisvícení od solidu (a žáru 3D tisku), SolidLink.jsx – mimo INSIDE je uSLightAmt 0
    finalColor += solidLightAt(vWorldPos, normalize((vec4(normal, 0.0) * viewMatrix).xyz)) * (0.35 + videoTex.rgb * 0.65);

    // particl u osvětleného místa solidu převezme jeho barvu (stínování kuličky zůstane) a sám jí trochu září
    float bkPeak = max(vBake.r, max(vBake.g, vBake.b));
    if (bkPeak > 1e-4) {
      float bkLum = dot(finalColor, vec3(0.299, 0.587, 0.114));
      vec3 bkHue = vBake / bkPeak;
      finalColor = mix(finalColor, bkLum * bkHue * 1.8, clamp(bkPeak, 0.0, 1.0) * uBakePTint) + vBake * uBakePGlow;
    }

    // odtržený: převezme barvu a slabě září, v bodě zlomu HDR záblesk (bloom)
    // přebarvení drží stínování kuličky (jas původní barvy × nová barva), ať nesvítí plošně
    float escLum = dot(finalColor, vec3(0.299, 0.587, 0.114));
    finalColor = mix(finalColor, escLum * uEscColor * 1.6, vEsc * uEscTint)
               + uEscColor * (vEscFlash * uEscFlash + vEsc * uEscGlow);

    gl_FragColor = vec4(finalColor, uOpacity);
  }
  `
);

extend({ JellyVideoMaterialImpl });
