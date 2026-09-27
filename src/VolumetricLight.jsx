import { useMemo, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { portalFx } from './PortalTransition';
import { debugMetrics } from './DebugMonitor';
import { TextContrastPass } from './TextContrastPass';
import { getHudTextMask } from './hudTextMask';
import { printFx } from './SolidPrint';
import { tvRegistry } from './TvGlass';
import { getFluid } from './components/particles/ParticleFluid';

const dummyTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
dummyTexture.needsUpdate = true;

const VolumetricLightShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1.0 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000.0 },

    // ORBIT parametry (God Rays ze středu a z televizí)
    uLightScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uExposure: { value: 1.0 },
    uDecay: { value: 0.92 },
    uDensity: { value: 0.9 },
    uWeight: { value: 0.5 },
    uThreshold: { value: 0.4 },
    uSmoothThreshold: { value: 0.15 },
    uDitherStrength: { value: 1.0 },
    uRayLength: { value: 0.45 },
    uLightColor: { value: new THREE.Color('#ffffff') },
    uVisibility: { value: 1.0 },
    uMaxRadius: { value: 0.9 },

    // Přechod mezi ORBIT (0.0) a INSIDE (1.0)
    uInsideTransition: { value: 0.0 },

    // INSIDE parametry (Volumetrické stíny vržené myší + mlha)
    uMouseScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uFogColor: { value: new THREE.Color('#0b0e14') },
    uFogDensity: { value: 0.65 },
    uFogNear: { value: 1.0 },
    uFogFar: { value: 14.0 },
    uFogCurve: { value: 2.2 },
    uShadowStrength: { value: 0.85 },
    uShadowThreshold: { value: 0.35 },
    uSmokeStrength: { value: 0.25 },
    uSmokeSpeed: { value: 0.4 },
    uSmokeScale: { value: 4.5 },
    uVignetteStrength: { value: 0.35 },
    uVignetteRoundness: { value: 1.0 },
    uVignetteInvert: { value: 0.0 },
    uVignetteOrganic: { value: 0.1 },
    uSmokeAngle: { value: 135.0 },
    uEdgeFade: { value: 0.12 },
    uBaseFogBrightness: { value: 0.6 },
    uForegroundFog: { value: 0.35 },
    uMouseLightExposure: { value: 1.2 },
    uMouseLightRadius: { value: 1.3 },
    uEnableMouseFog: { value: 1.0 },
    uEnableDepthFog: { value: 1.0 },
    uEnableForegroundFog: { value: 1.0 },
    uEnableVignette: { value: 1.0 },
    uEnableSmoke: { value: 1.0 },
    uFogMasterIntensity: { value: 1.0 },

    // Volumetrický průhled videa v prostoru skrz objekty
    tVolumetricVideo: { value: dummyTexture },
    uVolumetricGhostEnabled: { value: 1.0 },
    uVolumetricStartDist: { value: 2.16 },
    uVolumetricFadeRange: { value: 0.6 },
    uVolumetricGhostStrength: { value: 0.35 },
    uVolumetricVideoScale: { value: 0.72 },
    uVolumetricVignetteSoft: { value: 0.45 },

    // Center Video God Rays (Paprsky ze středu z videa ohraničené na střed)
    uCenterRaysExposure: { value: 1.2 },
    uCenterRaysRadius: { value: 0.65 },
    uCenterRayLength: { value: 0.45 },
    uCenterRayDensity: { value: 1.0 },

    // Cinematic vrstva (Active Theory look): DOF, bloom, atmosféra, zrno, viněta
    tBlur: { value: dummyTexture },
    uBlurTexel: { value: new THREE.Vector2(0.004, 0.004) },
    uCineEnabled: { value: 1.0 },
    uDofStrength: { value: 1.0 },
    uFocusDist: { value: 8.0 },
    uFocusRange: { value: 2.0 },
    uBloomStrength: { value: 0.8 },
    uBloomThreshold: { value: 0.45 },
    uAtmoColor: { value: new THREE.Color('#2f9a9a') },
    uAtmoPos: { value: new THREE.Vector2(0.1, 1.05) },
    uAtmoSize: { value: 0.9 },
    uAtmoStrength: { value: 0.35 },
    uAtmo2Color: { value: new THREE.Color('#15606b') },
    uAtmo2Pos: { value: new THREE.Vector2(0.0, -0.05) },
    uAtmo2Strength: { value: 0.15 },
    uGrain: { value: 0.05 },
    uCineVignette: { value: 0.45 },

    // 3D tisk solidů: paprsky ze žhavé vrstvy sbíhající se dovnitř k bodu (SolidPrint.jsx)
    tPrintMask: { value: dummyTexture },
    uPrintRays: { value: 0.0 },
    uPrintRayLen: { value: 0.55 },
    uPrintCenter: { value: new THREE.Vector2(0.5, 0.4) },
    uPrintInward: { value: 1.0 },
    uPrintFrame: { value: 1.0 },
    uPrintFrameScale: { value: 1.0 },
    uPrintBevel: { value: 0.3 },
    uPrintLineA: { value: new THREE.Vector2() },
    uPrintLineB: { value: new THREE.Vector2() },
    uPrintLineColor: { value: new THREE.Color(0, 0, 0) },

    // Světlo TV (config tvLight): ORBIT = záře + paprsky kolem aktivní televize, voda z myši do ní vyřezává díry;
    // INSIDE = to samé světlo je vidět jen tam, kde je voda
    tFluid: { value: null },
    uFluidOn: { value: 0.0 },
    uWaterRange: { value: new THREE.Vector2(4.0, 40.0) },
    uTvPos: { value: new THREE.Vector2(0.5, 0.5) },
    uTvSize: { value: 0.5 },
    uTvVis: { value: 0.0 },
    uTvColor: { value: new THREE.Color('#2f9a9a') },
    uTvStrength: { value: 0.0 },
    uTvRays: { value: 0.6 },
    uTvClip: { value: 1.0 },
    uTvInside: { value: 0.0 },
    uTvInsideFloor: { value: 0.35 },
    uTvDebug: { value: 0.0 },
    uTvAxA: { value: new THREE.Vector2(0.1, 0.0) },   // půl šířky TV na obrazovce (aspect prostor)
    uTvAxB: { value: new THREE.Vector2(0.0, 0.1) },   // půl výšky TV na obrazovce
    uTvInv: { value: new THREE.Vector4(10, 0, 0, 10) }, // inverze [A B] -> lokální souřadnice obdélníku TV
    uTvHalo: { value: 0.35 },
    uFluidTexel: { value: new THREE.Vector2(1 / 228, 1 / 128) },
    tDye: { value: null },                              // barvivo Pavlovy vody (vířící kouř) -> INSIDE voda
    uDyeOn: { value: 0.0 },
    uDyeTexel: { value: new THREE.Vector2(1 / 900, 1 / 512) },
    uDyeRange: { value: new THREE.Vector2(0.01, 0.12) },
    uTvRayLen: { value: 3.5 },
    uTvGlow: { value: 0.6 },
    uTvAnchor: { value: 0.0 },                          // stará záře kolem TV (0 = vypnuto)
    uDustFog: { value: 1.0 },                           // ORBIT mlha nasvícená 2D prachem
    uDustRays: { value: 6.0 },
    uDustHaze: { value: 0.25 },
    uDustRayLen: { value: 0.35 },
    uDustDecay: { value: 0.96 },
    uDustCap: { value: 0.15 },
    uDustTint: { value: 0.7 },
    uFogClear: { value: 1.0 },                          // INSIDE: voda rozráží mlhu tam, kde je vidět pozadí
    uFogRim: { value: 0.35 },
    uWaterStreak: { value: 0.25 },
    uCoverRadius: { value: 0.025 },
    uDustLightPos: { value: new THREE.Vector2(0.5, 1.15) } // ORBIT: odkud svítí mlha z prachu (nebe nad obrazovkou)
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uTime;
    uniform float uAspect;
    uniform float uCameraNear;
    uniform float uCameraFar;

    // ORBIT
    uniform vec2 uLightScreenPos;
    uniform float uExposure;
    uniform float uDecay;
    uniform float uDensity;
    uniform float uWeight;
    uniform float uThreshold;
    uniform float uSmoothThreshold;
    uniform float uDitherStrength;
    uniform float uRayLength;
    uniform float uMaxRadius;
    uniform vec3 uLightColor;
    uniform float uVisibility;

    // Transition & INSIDE
    uniform float uInsideTransition;
    uniform vec2 uMouseScreenPos;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uFogCurve;
    uniform float uShadowStrength;
    uniform float uShadowThreshold;
    uniform float uSmokeStrength;
    uniform float uSmokeSpeed;
    uniform float uSmokeScale;
    uniform float uVignetteStrength;
    uniform float uVignetteRoundness;
    uniform float uVignetteInvert;
    uniform float uVignetteOrganic;
    uniform float uSmokeAngle;
    uniform float uEdgeFade;
    uniform float uBaseFogBrightness;
    uniform float uForegroundFog;
    uniform float uMouseLightExposure;
    uniform float uMouseLightRadius;
    uniform float uEnableMouseFog;
    uniform float uEnableDepthFog;
    uniform float uEnableForegroundFog;
    uniform float uEnableVignette;
    uniform float uEnableSmoke;
    uniform float uFogMasterIntensity;

    // Volumetrický průhled videa
    uniform sampler2D tVolumetricVideo;
    uniform float uVolumetricGhostEnabled;
    uniform float uVolumetricStartDist;
    uniform float uVolumetricFadeRange;
    uniform float uVolumetricGhostStrength;
    uniform float uVolumetricVideoScale;
    uniform float uVolumetricVignetteSoft;

    // Paprsky ze středu
    uniform float uCenterRaysExposure;
    uniform float uCenterRaysRadius;
    uniform float uCenterRayLength;
    uniform float uCenterRayDensity;

    uniform sampler2D tBlur;
    uniform vec2 uBlurTexel;
    // rozmazaný buffer je ve 1/4 rozlišení -> 4 posunuté vzorky, jinak je u silného DOF vidět mřížka (kostičky)
    vec3 blurSmooth(vec2 uv) {
      vec2 o = uBlurTexel * 0.75;
      return 0.25 * (texture2D(tBlur, uv + vec2(o.x, o.y)).rgb + texture2D(tBlur, uv + vec2(-o.x, o.y)).rgb
                   + texture2D(tBlur, uv + vec2(o.x, -o.y)).rgb + texture2D(tBlur, uv - o).rgb);
    }
    uniform float uCineEnabled;
    uniform float uDofStrength;
    uniform float uFocusDist;
    uniform float uFocusRange;
    uniform float uBloomStrength;
    uniform float uBloomThreshold;
    uniform vec3 uAtmoColor;
    uniform vec2 uAtmoPos;
    uniform float uAtmoSize;
    uniform float uAtmoStrength;
    uniform vec3 uAtmo2Color;
    uniform vec2 uAtmo2Pos;
    uniform float uAtmo2Strength;
    uniform float uGrain;
    uniform float uCineVignette;
    uniform sampler2D tPrintMask;
    uniform float uPrintRays;
    uniform float uPrintRayLen;
    uniform vec2 uPrintCenter;
    uniform float uPrintInward;
    uniform float uPrintFrame;       // 1 = paprsky se sbíhají k okrajům rámu (zmenšená obrazovka), 0 = k bodu uPrintCenter
    uniform float uPrintFrameScale;  // 1 = rám = okraje obrazovky, 0 = rám se smrskne do středu obrazovky
    uniform float uPrintBevel;       // 0..1 zaoblení rohů rámu + změkčení zlomu mezi hranami
    uniform vec2 uPrintLineA, uPrintLineB;   // tisková linka (uv) – řez přes celou šířku solidů
    uniform vec3 uPrintLineColor;            // barva * síla laserů do prázdna (0 = vypnuto)

    float c2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }

    // Lasery do prázdna: z bodu uPrintCenter na každé místo tiskové linky (analyticky, bez masky).
    // Pixel svítí, když přímka bod->pixel protne linku až ZA pixelem (pixel je mezi bodem a linkou).
    vec3 printLineRays(vec2 uv) {
      vec2 asp = vec2(uAspect, 1.0);
      vec2 P = uPrintCenter * asp, A = uPrintLineA * asp, E = (uPrintLineB - uPrintLineA) * asp;
      vec2 d = uv * asp - P;
      float den = c2(d, E);
      if (abs(den) < 1e-6) return vec3(0.0);
      float t = c2(A - P, E) / den;       // pixel je v t = 1, linka v t
      float sl = c2(A - P, d) / den;      // místo na lince 0..1
      float dist = length(d);
      vec3 col = vec3(0.0);
      if (t >= 1.0 && sl >= 0.0 && sl <= 1.0) {
        float edge = smoothstep(0.0, 0.1, sl) * smoothstep(0.0, 0.1, 1.0 - sl);
        // jednotlivé lasery podél linky (pozvolna běží), ne plochý vějíř
        float k = sl * 70.0 + uTime * 0.5;
        float fk = fract(k), ik = floor(k);
        float r0 = fract(sin(ik * 91.345) * 47453.5453), r1 = fract(sin((ik + 1.0) * 91.345) * 47453.5453);
        float beam = mix(r0, r1, fk * fk * (3.0 - 2.0 * fk));
        beam = 0.25 + 0.75 * beam * beam;
        // k lince sílí, u zdroje zeslábne
        float along = 1.0 / t;
        col = uPrintLineColor * edge * beam * (0.35 + 0.65 * along) * smoothstep(0.0, 0.04, dist);
      }
      // samotná linka tence svítí
      float sp = clamp(dot(uv * asp - A, E) / dot(E, E), 0.0, 1.0);
      float ld = length(uv * asp - (A + E * sp));
      col += uPrintLineColor * exp(-ld * ld / 0.000012) * 1.5;
      return col;
    }

    uniform sampler2D tFluid;
    uniform float uFluidOn;
    uniform vec2 uWaterRange;
    uniform vec2 uTvPos;
    uniform float uTvSize;
    uniform float uTvVis;
    uniform vec3 uTvColor;
    uniform float uTvStrength;
    uniform float uTvRays;
    uniform float uTvClip;
    uniform float uTvInside;
    uniform float uTvInsideFloor;
    uniform vec2 uTvAxA;
    uniform vec2 uTvAxB;
    uniform vec4 uTvInv;
    uniform float uTvHalo;
    uniform vec2 uFluidTexel;
    uniform sampler2D tDye;
    uniform float uDyeOn;
    uniform vec2 uDyeTexel;
    uniform vec2 uDyeRange;
    uniform float uTvRayLen;
    uniform float uTvGlow;
    uniform float uTvAnchor;
    uniform float uDustFog;
    uniform float uDustRays;
    uniform float uDustHaze;
    uniform float uDustRayLen;
    uniform float uDustDecay;
    uniform float uDustCap;
    uniform float uDustTint;
    uniform float uFogClear;
    uniform float uFogRim;
    uniform float uWaterStreak;
    uniform float uCoverRadius;
    uniform vec2 uDustLightPos;
    uniform float uTvDebug; // DEV: 1 = na obrazovce jen maska vody (zelená) + záře TV (červená)

    // vzdálenost od rámu (aspect prostor, střed obrazovky = 0): <0 uvnitř, >0 venku
    float printFrameSd(vec2 p) {
      vec2 b = 0.5 * uPrintFrameScale * vec2(uAspect, 1.0);
      float r = uPrintBevel * min(b.x, b.y);
      vec2 q = abs(p) - b + r;
      // uvnitř měkké maximum -> směr k nejbližší hraně se u úhlopříčky přelije plynule (bevel)
      float k = max(r, 1e-4);
      float h = clamp(0.5 + 0.5 * (q.x - q.y) / k, 0.0, 1.0);
      float smx = mix(q.y, q.x, h) + k * h * (1.0 - h);
      return length(max(q, 0.0)) + min(smx, 0.0) - r;
    }

    // Paprsky 3D tisku: tiskárna svítí z bodu ZA kamerou, paprsek vede z žhavé vrstvy ke kameře.
    // Na obrazovce to je klasický god ray: pixel sbírá žár z masky směrem K úběžníku uPrintCenter,
    // takže světlo teče z vrstvy ven (od středu k okrajům) a mezi vrstvou a středem nic nesvítí.
    vec3 printRays(vec2 uv, float dither) {
      vec2 toC = (uPrintCenter - uv) * vec2(uAspect, 1.0);
      float dist = length(toC);
      if (dist < 0.0001) return vec3(0.0);
      // uPrintInward = 1: paprsek vede z vrstvy DO bodu (pixel sbírá žár směrem OD bodu, paprsky se sbíhají)
      vec2 dir = toC / dist * (1.0 - 2.0 * uPrintInward);
      vec2 streakP = -toC;
      if (uPrintFrame > 0.5) {
        // rám: světlo teče z vrstvy k nejbližšímu místu na rámu, pixel sbírá žár proti proudu
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
        float d = printFrameSd(p);
        const float E = 0.002;
        vec2 g = vec2(printFrameSd(p + vec2(E, 0.0)) - printFrameSd(p - vec2(E, 0.0)),
                      printFrameSd(p + vec2(0.0, E)) - printFrameSd(p - vec2(0.0, E)));
        float gl = length(g);
        if (gl < 1e-6) return vec3(0.0);
        g /= gl;
        dist = abs(d);
        vec2 toward = -sign(d) * g;          // směr proudu světla k rámu
        dir = -toward;
        // pruhy podle místa, kam paprsek na rámu dopadne (u scale 0 = úhel kolem středu)
        streakP = p - g * d - toward * 0.02;
      }
      float stepLen = uPrintRayLen / 40.0;
      vec2 stepUv = dir / vec2(uAspect, 1.0) * stepLen;
      // plný jitter startu (IGN) – jinak z 40 kroků vznikají soustředné pruhy
      float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + dither);
      vec2 s = uv + stepUv * jit;
      vec3 acc = vec3(0.0);
      float w = 1.0;
      for (int i = 0; i < 40; i++) {
        if (uPrintInward < 0.5 && (float(i) + jit) * stepLen > dist) break;   // za úběžník (ke kameře) už paprsek nevede
        s += stepUv;
        acc += texture2D(tPrintMask, s).rgb * w;
        w *= mix(0.955, 0.975, uPrintInward);
      }
      // pruhování podle úhlu (jednotlivé paprsky místo plochého vějíře), pomalu se vlní
      float ang = atan(streakP.y, streakP.x) * 38.0 + uTime * 0.4;
      float fa = fract(ang), ia = floor(ang);
      float h0 = fract(sin(ia * 91.345) * 47453.5453), h1 = fract(sin((ia + 1.0) * 91.345) * 47453.5453);
      float streak = 0.45 + 0.9 * mix(h0, h1, fa * fa * (3.0 - 2.0 * fa));
      // u zdroje (bodu) paprsky zeslábnou, jinak se tam slije přepálená skvrna
      float nearFade = mix(1.0, smoothstep(0.0, 0.04, dist), uPrintInward);
      return acc * (uPrintRays / 40.0) * streak * nearFade;
    }

    varying vec2 vUv;

    const int NUM_SAMPLES = 48;

    // Fast screen-space Interleaved Gradient Noise (IGN by Jorge Jimenez)
    float getDither(vec2 coord) {
      return fract(52.9829189 * fract(dot(coord, vec2(0.06711056, 0.00583715))));
    }

    // Linear depth from perspective projection
    float getLinearDepth(float depth, float near, float far) {
      float z_ndc = 2.0 * depth - 1.0;
      return (2.0 * near * far) / max(0.00001, (far + near - z_ndc * (far - near)));
    }

    // Vysoce plynulý Simplex Noise pro přirozený kouř (bez artefaktů mřížky)
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    // Plynulý kouř unášený proudem vzduchu (žádné vření na místě, čistý posun)
    float fbmSmoke(vec2 p) {
      float n = 0.55 * snoise(p);
      n += 0.30 * snoise(p * 2.05 + vec2(1.7, 3.2));
      n += 0.15 * snoise(p * 4.02 - vec2(2.4, 1.1));
      return clamp(n * 0.5 + 0.5, 0.0, 1.0);
    }

    // Světlo TV. Voda = rychlost proudu z ParticleFluid (buňky/s) přes práh uWaterRange -> maska 0..1.
    // ORBIT: záře kolem televize (paprsky = šum podle úhlu, bez švu), voda v ní dělá díry (clip).
    // INSIDE: stejná barva, ale jen v místech vody (tvar = atmo skvrna, min. uTvInsideFloor po celé obrazovce).
    // ORBIT díry: rychlost proudu (ostré, živé tvary).
    float waterMask() {
      return uFluidOn > 0.5 ? smoothstep(uWaterRange.x, uWaterRange.y, length(texture2D(tFluid, vUv).xy)) : 0.0;
    }
    // INSIDE voda: barvivo Pavlovy simulace (spirály bez děr ve středech vírů), rozmazané po směru proudu
    // (4 vzorky proti proudu) -> vířící pramínky světla, ne ostrá hladina.
    float dyeAt(vec2 uv) { vec3 c = texture2D(tDye, uv).rgb; return smoothstep(uDyeRange.x, uDyeRange.y, max(c.r, max(c.g, c.b))); }
    float insideWater() {
      if (uDyeOn < 0.5 || uFluidOn < 0.5) return 0.0;
      vec2 s = texture2D(tFluid, vUv).xy * uFluidTexel * uWaterStreak;
      float sl = length(s);
      if (sl > 0.06) s *= 0.06 / sl;
      float d = dyeAt(vUv) * 0.4 + dyeAt(vUv - s * 0.33) * 0.27 + dyeAt(vUv - s * 0.66) * 0.2 + dyeAt(vUv - s) * 0.13;
      // (šum natočený podle směru proudu tu byl a ve vírech se lámal do ostrých „květin“ -> pryč)
      return d;
    }
    // Kolik okolí zakrývají particly (0 = volný výhled na pozadí, 1 = hustý shluk): 8 vzorků hloubky na kruhu
    float particleCover() {
      vec2 r = vec2(uCoverRadius / uAspect, uCoverRadius);
      float c = step(texture2D(tDepth, vUv).r, 0.9998);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        c += step(texture2D(tDepth, vUv + vec2(cos(a), sin(a)) * r).r, 0.9998);
      }
      return smoothstep(0.2, 0.65, c / 9.0);
    }
    // ORBIT mlha nasvícená 2D prachem (AtmosphereDust, v hloubce = pozadí): prach rozsvítí mlhu kolem sebe (haze)
    // a táhne z ní paprsky od středu světla – stejným směrem jako god rays P1. Voda do ní dělá díry.
    vec3 dustFog() {
      vec2 toL = uDustLightPos - vUv;
      float dl = length(toL);
      vec2 st = (dl > 1e-4 ? toL / dl : vec2(0.0)) * min(dl, uDustRayLen) / 24.0;
      vec2 uv = vUv + st * getDither(gl_FragCoord.xy);
      vec3 acc = vec3(0.0);
      float dec = 1.0;
      for (int i = 0; i < 24; i++) {
        vec2 cu = clamp(uv, vec2(0.0), vec2(1.0));
        float bg = step(0.9999, texture2D(tDepth, cu).r);
        // jen tečky prachu (nad tmavou barvou pozadí), strop = jasné věci nepřepálí mlhu
        acc += clamp(texture2D(tBlur, cu).rgb - 0.02, 0.0, uDustCap) * bg * dec;
        dec *= uDustDecay;
        uv += st;
      }
      vec3 light = acc * 0.12 * uDustRays + clamp(blurSmooth(vUv) - 0.02, 0.0, uDustCap) * uDustHaze;
      float lum = dot(light, vec3(0.299, 0.587, 0.114));
      return mix(light, uTvColor * lum * 2.0, uDustTint) * uDustFog;
    }
    vec3 tvLight(bool isBg) {
      float w = uTvClip > 0.001 && uInsideTransition < 0.999 ? waterMask() : 0.0;
      vec2 asp = vec2(uAspect, 1.0);
      vec3 L = vec3(0.0);
      float orbitOn = uTvStrength * (1.0 - uInsideTransition);
      if (orbitOn > 0.001 && uDustFog > 0.001) L += dustFog() * orbitOn * (1.0 - uTvClip * w);
      float orbitAmt = uTvVis * orbitOn * uTvAnchor;
      if (orbitAmt > 0.001) {
        vec2 d = (vUv - uTvPos) * asp;
        // svítí celá plocha TV: vzdálenost od obdélníku obrazovky (v perspektivě), ne od středu
        vec2 ab = vec2(dot(uTvInv.xy, d), dot(uTvInv.zw, d));
        vec2 q = max(abs(ab) - 1.0, 0.0);
        float dist = length(q * vec2(length(uTvAxA), length(uTvAxB)));
        float g = 1.0 - smoothstep(0.0, uTvSize, dist);
        g *= g;
        // široká měkká záře bez paprsků (barva prostoru, na ní jsou vidět bokeh particly v pozadí)
        float h = 1.0 - smoothstep(0.0, uTvSize * 2.6, dist);
        h *= h;
        float r = length(d);
        vec2 dir = d / max(r, 1e-4);
        // paprsky: úzké svazky (šum po obvodu), každý jinak dlouhý – nejdelší ~uTvRayLen × velikost záře
        float n = snoise(dir * 2.2 + vec2(uTime * 0.03, -uTime * 0.02)) * 0.6 + snoise(dir * 5.3 - uTime * 0.05) * 0.4;
        float beam = pow(clamp(0.5 + n * 0.75, 0.0, 1.0), 2.2);
        float len = uTvSize * uTvRayLen * (0.35 + 0.65 * (snoise(dir * 3.7 + vec2(-uTime * 0.02, 7.1)) * 0.5 + 0.5));
        float rf = 1.0 - smoothstep(0.0, len, dist);
        float rays = beam * rf * rf * smoothstep(0.0, uTvSize * 0.15, dist) * uTvRays * 2.0;
        L += uTvColor * (g * uTvGlow + h * uTvHalo + rays) * orbitAmt * (1.0 - uTvClip * w) * (isBg ? 1.0 : 0.55);
      }
      return L;
    }

    // Cinematic dokončení: bloom z rozmazaného bufferu, atmosférická záře, viněta, filmové zrno
    vec3 cinematicFinish(vec3 col, bool isBg) {
      if (uCineEnabled < 0.5) return col;
      // clamp: HDR zdroje (světlé solidy, paprsky) mají hodnoty >> 1 -> bez stropu z nich bloom dělal bílé fleky
      vec3 blurCol = min(texture2D(tBlur, vUv).rgb, vec3(1.0));
      float bLum = dot(blurCol, vec3(0.299, 0.587, 0.114));
      col += blurCol * smoothstep(uBloomThreshold, uBloomThreshold + 0.35, bLum) * uBloomStrength;

      vec2 asp = vec2(uAspect, 1.0);
      float a1 = 1.0 - smoothstep(0.0, uAtmoSize, length((vUv - uAtmoPos) * asp));
      float a2 = 1.0 - smoothstep(0.0, uAtmoSize * 1.2, length((vUv - uAtmo2Pos) * asp));
      float objMask = isBg ? 1.0 : 0.55;
      col += (uAtmoColor * a1 * a1 * uAtmoStrength + uAtmo2Color * a2 * a2 * uAtmo2Strength) * objMask;

      vec2 vc = (vUv - 0.5) * asp;
      col *= 1.0 - smoothstep(0.35, 1.1, length(vc)) * uCineVignette;

      float g = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;
      return max(col, vec3(0.0));
    }

    void main() {
      if (uTvDebug > 8.5) { float iw = insideWater(); gl_FragColor = vec4(iw, particleCover() * 0.5, texture2D(tDye, vUv).r * 4.0, 1.0); return; }
      if (uTvDebug > 6.5) { gl_FragColor = vec4(uTvDebug > 7.5 ? texture2D(tBlur, vUv).rgb * 4.0 : dustFog() * 4.0, 1.0); return; }
      if (uTvDebug > 3.5) { vec4 fv = texture2D(tFluid, vUv); float sp = length(fv.xy); gl_FragColor = vec4(step(500.0, sp), smoothstep(0.0, 20.0, sp), step(0.5, fv.w), 1.0); return; }
      if (uTvDebug > 1.5) { vec4 fv = texture2D(tFluid, vUv); gl_FragColor = vec4(abs(fv.xy) / (uTvDebug > 2.5 ? 1e4 : 100.0), fv.z, 1.0); return; }
      if (uTvDebug > 0.5) { gl_FragColor = vec4(length(tvLight(true)), waterMask(), 0.0, 1.0); return; }
      vec4 baseColor = texture2D(tDiffuse, vUv);
      float cineDepth = texture2D(tDepth, vUv).r;
      bool cineBg = cineDepth >= 0.9999;
      // Hloubka ostrosti: mimo ohniskovou rovinu se míchá s rozmazanou kopií scény (bokeh)
      if (uCineEnabled > 0.5 && uDofStrength > 0.001 && !cineBg) {
        float lz = getLinearDepth(cineDepth, uCameraNear, uCameraFar);
        float coc = smoothstep(0.0, max(0.01, uFocusRange), abs(lz - uFocusDist)) * uDofStrength;
        baseColor.rgb = mix(baseColor.rgb, blurSmooth(vUv), clamp(coc, 0.0, 1.0));
      }
      float dither = getDither(gl_FragCoord.xy) * uDitherStrength;

      // ==========================================
      // 1. ORBIT PASS: Classic TV & Center God Rays
      // ==========================================
      vec3 orbitColor = baseColor.rgb;
      if (uInsideTransition < 0.999 && uVisibility > 0.001) {
        vec2 toLight = uLightScreenPos - vUv;
        float distToLight = length(toLight);
        float distFade = smoothstep(uMaxRadius, 0.0, distToLight);

        if (distFade > 0.001) {
          float marchDist = min(distToLight, uRayLength);
          vec2 dir = distToLight > 0.0001 ? toLight / distToLight : vec2(0.0);
          vec2 deltaTexCoord = -dir * (marchDist / float(NUM_SAMPLES)) * uDensity;
          vec2 curUv = vUv - deltaTexCoord * dither;

          float illuminationDecay = 1.0;
          float sampleStepDecay = pow(uDecay, 48.0 / float(NUM_SAMPLES));
          float normWeight = uWeight * (48.0 / float(NUM_SAMPLES));
          vec3 accumRays = vec3(0.0);

          float tMin = max(0.0, uThreshold - uSmoothThreshold);
          float tMax = min(1.0, uThreshold + uSmoothThreshold + 0.0001);

          for (int i = 0; i < NUM_SAMPLES; i++) {
            curUv -= deltaTexCoord;
            vec2 clampedUv = clamp(curUv, vec2(0.0), vec2(1.0));
            vec4 sampleCol = texture2D(tDiffuse, clampedUv);

            float lum = dot(sampleCol.rgb, vec3(0.299, 0.587, 0.114));
            float factor = smoothstep(tMin, tMax, lum);
            vec3 lightExtracted = sampleCol.rgb * factor;

            accumRays += lightExtracted * illuminationDecay * normWeight;
            illuminationDecay *= sampleStepDecay;
          }

          accumRays *= uExposure * uLightColor * uVisibility * distFade;
          orbitColor += accumRays;
        }
      }

      // If purely in ORBIT mode, return early for speed
      if (uInsideTransition <= 0.001) {
        gl_FragColor = vec4(cinematicFinish(orbitColor + tvLight(cineBg), cineBg), baseColor.a);
        return;
      }

      // ==========================================
      // 2. INSIDE PASS: 3 FOGS & MOUSE SHADOWS
      // ==========================================

      // --- FOG 1: Depth-Aware Fog (Hloubková mlha z 3D z-bufferu) ---
      float rawDepth = texture2D(tDepth, vUv).r;
      float linearZ = getLinearDepth(rawDepth, uCameraNear, uCameraFar);
      bool isBackground = rawDepth >= 0.9999;
      // Pozvolný náběh: žádná ostrá diagonála, ale jemný pomalý začátek s nastavitelnou křivkou růstu
      float normZ = clamp((linearZ - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
      float depthFactor = pow(normZ, max(0.01, uFogCurve));
      // Na konci mlhy (linearZ >= uFogFar) nebo na pozadí dosahuje mlha maximální neprůhlednosti škálované master intenzitou
      float maxDepthFog = min(1.0, max(0.0, uFogDensity)) * uEnableDepthFog * uFogMasterIntensity;
      float depthFog = (isBackground || normZ >= 1.0) ? maxDepthFog : clamp(depthFactor * uFogDensity * uFogMasterIntensity, 0.0, maxDepthFog);


      // --- FOG 3: Vinětová mlha displeje (Kulatá, hladká, s volitelným směrem a menší organičností) ---
      // Korekce poměru stran pro dokonalý kruh
      vec2 vignetteOffset = (vUv - 0.5) * vec2(mix(1.0, uAspect, clamp(uVignetteRoundness, 0.0, 1.0)), 1.0);
      float vignetteDist = length(vignetteOffset);

      // Směr viněty: 0 = z okrajů dovnitř, 1 = ze středu ven ("sla jinym smerem")
      float vFromEdge = smoothstep(0.28, 0.88, vignetteDist);
      float vFromCenter = 1.0 - smoothstep(0.12, 0.72, vignetteDist);
      float baseVignette = mix(vFromEdge, vFromCenter, uVignetteInvert);

      // Zhasnutí na samém okraji pro čistý rám (kruhové zhasnutí)
      float circularEdgeFade = 1.0 - smoothstep(0.96 - max(0.01, uEdgeFade * 0.5), 1.02, vignetteDist);
      float smoothVignette = baseVignette * circularEdgeFade * uVignetteStrength;

      // Plynulé zhasnutí mlhy u samých okrajů displeje pro popředovou mlhu
      vec2 distFromBorder = min(vUv, 1.0 - vUv);
      float borderDist = min(distFromBorder.x * uAspect, distFromBorder.y);
      float screenEdgeFade = smoothstep(0.001, max(0.005, uEdgeFade), borderDist);

      // Čistý, plynulý posun kouře unášeného proudem vzduchu (volitelný úhel větru "sla jinym smerem")
      float windRad = radians(uSmokeAngle);
      vec2 windVelocity = vec2(cos(windRad), sin(windRad)) * 0.45;
      vec2 smokeCoord = (vUv - 0.5) * vec2(uAspect, 1.0) * max(0.5, uSmokeScale);
      smokeCoord -= windVelocity * (uTime * uSmokeSpeed * 0.45);
      float smokePattern = fbmSmoke(smokeCoord);

      // Kouř moduluje hustotu i strukturu mlhy (pokud je kouř zapnutý, jinak je mlha rovnoměrně hladká)
      float rawSmokeFactor = mix(1.0, 0.2 + 1.6 * smokePattern, clamp(uSmokeStrength, 0.0, 1.0));
      float smokeDensityFactor = mix(1.0, rawSmokeFactor, uEnableSmoke);

      // Mnohem menší organičnost pro vinětu: viněta je hladká a kulatá bez obřích turbulencí
      float rawVignetteSmoke = mix(1.0, 0.75 + 0.5 * smokePattern, clamp(uSmokeStrength * uVignetteOrganic, 0.0, 1.0));
      float vignetteSmokeMod = mix(1.0, rawVignetteSmoke, uEnableSmoke);
      float finalVignetteFog = smoothVignette * vignetteSmokeMod * uEnableVignette;

      // --- FOG 2: Mouse Volumetric Light & Shadow Rays (Kontinuální radiální linie) ---
      vec2 mouseDelta = (vUv - uMouseScreenPos) * vec2(uAspect, 1.0);
      float distToMouse = length(mouseDelta);
      float mouseRadius = max(0.001, uMouseLightRadius);
      float normMouseDist = clamp(distToMouse / mouseRadius, 0.0, 1.0);

      // Intenzivní jádro světla na myši (z myši vychází nejvyšší)
      float mouseCore = (1.0 - normMouseDist) * (1.0 - normMouseDist) * uMouseLightExposure;

      // Plynulý rozptyl světla z myši do prostoru (hladký inverzní pokles)
      float mouseBroad = (1.0 / (1.0 + distToMouse * distToMouse * 2.2)) * (uMouseLightExposure * 0.45);
      float totalMouseSource = mouseCore + mouseBroad;

      // Pokud je myš přímo na pevném objektu, zdroj světla je pohlcen
      float mouseRawDepth = texture2D(tDepth, uMouseScreenPos).r;
      float isMouseOnObj = step(mouseRawDepth, 0.9998);
      float mouseSelfBlocked = isMouseOnObj * (1.0 - smoothstep(uShadowThreshold * 0.4, uShadowThreshold * 1.4, dot(texture2D(tDiffuse, uMouseScreenPos).rgb, vec3(0.299, 0.587, 0.114))));
      totalMouseSource *= (1.0 - mouseSelfBlocked * 0.96);

      // =========================================================================
      // KONTINUÁLNÍ INTEGRACE RADIÁLNÍCH PAPRSKŮ (Linie, ne tupky / žádné razítkování)
      // =========================================================================
      // Krokování od pixelu směrem ke zdroji světla (myši) s plynulým rozptylem
      vec2 deltaRay = (uMouseScreenPos - vUv) * (1.0 / float(NUM_SAMPLES));
      vec2 rayCoord = vUv;
      float decay = 1.0;
      float stepDecay = 0.94;
      float accumLight = 1.0;
      float totalDecay = 1.0;

      // světlo u myši je vypnuté (config insideFog.enableMouseFog) -> smyčku stínů vůbec nepočítat
      if (uEnableMouseFog > 0.5) { accumLight = 0.0; totalDecay = 0.0;
      for (int j = 0; j < NUM_SAMPLES; j++) {
        rayCoord += deltaRay;
        vec2 clampedCoord = clamp(rayCoord, vec2(0.0), vec2(1.0));

        float sDepth = texture2D(tDepth, clampedCoord).r;
        float isObj = step(sDepth, 0.9998);

        // Osvětlené povrchy propouštějí světlo dál, tmavé objekty vrhají stín
        vec3 sCol = texture2D(tDiffuse, clampedCoord).rgb;
        float sLum = dot(sCol, vec3(0.299, 0.587, 0.114));
        float occluder = isObj * (1.0 - smoothstep(uShadowThreshold * 0.4, uShadowThreshold * 1.4, sLum));

        // Propuštěné světlo podél linie (kontinuální přechod)
        float lightPass = 1.0 - occluder * uShadowStrength;

        accumLight += lightPass * decay;
        totalDecay += decay;
        decay *= stepDecay;
      }
      }

      // Normalizovaná hodnota průchodu světla podél paprsku [0.0 = stín, 1.0 = čistý paprsek]
      float normRayLight = accumLight / max(0.001, totalDecay);

      // Světlo z myši nasvěcuje STEJNÝ kouř (smokeDensityFactor) jako je v depth a vinětě
      float volumetricMouseLight = totalMouseSource * normRayLight * smokeDensityFactor * uEnableMouseFog;

      // =========================================================================
      // VRSTVENÍ PODLE POŽADAVKU:
      // 1. ZÁKLADNÍ SCÉNA
      // 2. SVĚTLO A STÍNY Z MYŠI (projevují se POUZE na světle myši!)
      // 3. HLOUBKOVÁ MLHA (DEPTH FOG) - LEŽÍ PŘES TO
      // 4. VINĚTOVÁ & POPŘEDOVÁ MLHA - LEŽÍ V POPŘEDÍ PŘED VŠÍM
      // =========================================================================

      // 1. 3D Scéna
      vec3 sceneColor = baseColor.rgb;

      // Volumetrický průhled videa v prostoru skrz objekty
      if (uInsideTransition > 0.01 && uVolumetricGhostEnabled > 0.5 && !isBackground) {
        if (linearZ >= uVolumetricStartDist) {
          vec2 parallaxOffset = (uMouseScreenPos - 0.5) * 0.035;
          vec2 vidUv = (vUv - 0.5 - parallaxOffset) / max(0.1, uVolumetricVideoScale) + 0.5;

          if (vidUv.x >= 0.0 && vidUv.x <= 1.0 && vidUv.y >= 0.0 && vidUv.y <= 1.0) {
            vec4 vidTex = texture2D(tVolumetricVideo, vidUv);

            // Viněta videa do ztracena
            vec2 vd = abs(vidUv - 0.5) * 2.0;
            float vSoft = clamp(uVolumetricVignetteSoft, 0.05, 0.9);
            float vx = smoothstep(1.0, 1.0 - vSoft, vd.x);
            float vy = smoothstep(1.0, 1.0 - vSoft, vd.y);
            float vignette = pow(vx * vy, 1.3);

            // Náběh podle hloubky od zadané vzdálenosti
            float depthBlend = smoothstep(uVolumetricStartDist, uVolumetricStartDist + max(0.05, uVolumetricFadeRange), linearZ);

            // Lehké zviditelnění videa přes objekty
            float ghostAlpha = depthBlend * uVolumetricGhostStrength * vignette * uInsideTransition;

            vec3 adjustedVid = max(vec3(0.0), ((vidTex.rgb - 0.5) * 1.05) + 0.5);
            sceneColor = mix(sceneColor, adjustedVid, ghostAlpha);
          }
        }
      }

      // Center Video God Rays (Paprsky ze středu displeje prosvítající přes popředí, ohraničené na střed obrazovky)
      if (uInsideTransition > 0.01 && uVolumetricGhostEnabled > 0.5 && uCenterRaysExposure > 0.001) {
        vec2 centerPos = vec2(0.5, 0.5) + (uMouseScreenPos - 0.5) * 0.035;
        vec2 toCenter = (centerPos - vUv) * vec2(uAspect, 1.0);
        float distToCenter = length(toCenter);
        float centerFade = smoothstep(uCenterRaysRadius, uCenterRaysRadius * 0.35, distToCenter);

        if (centerFade > 0.001) {
          float marchDist = min(length(centerPos - vUv), uCenterRayLength);
          vec2 dir = normalize(centerPos - vUv);
          vec2 deltaTex = dir * (marchDist / 32.0) * uCenterRayDensity;
          vec2 curUv = vUv + deltaTex * dither;

          float decay = 1.0;
          vec3 accumCenterLight = vec3(0.0);

          for (int k = 0; k < 32; k++) {
            curUv += deltaTex;
            vec2 clampedUv = clamp(curUv, vec2(0.0), vec2(1.0));
            vec2 sVidUv = (clampedUv - centerPos) / max(0.1, uVolumetricVideoScale) + 0.5;
            if (sVidUv.x >= 0.0 && sVidUv.x <= 1.0 && sVidUv.y >= 0.0 && sVidUv.y <= 1.0) {
              vec4 sVidCol = texture2D(tVolumetricVideo, sVidUv);
              float sVidLum = dot(sVidCol.rgb, vec3(0.299, 0.587, 0.114));
              vec2 svd = abs(sVidUv - 0.5) * 2.0;
              float svSoft = clamp(uVolumetricVignetteSoft, 0.05, 0.9);
              float sVignette = pow(smoothstep(1.0, 1.0 - svSoft, svd.x) * smoothstep(1.0, 1.0 - svSoft, svd.y), 1.3);

              float sRawDepth = texture2D(tDepth, clampedUv).r;
              float isOcc = step(sRawDepth, 0.9998);
              float sLinZ = getLinearDepth(sRawDepth, uCameraNear, uCameraFar);
              float occStrength = isOcc * (sLinZ < uVolumetricStartDist ? 0.9 : (0.9 * (1.0 - uVolumetricGhostStrength * 0.8)));

              float lightPass = (sVidLum * sVignette) * (1.0 - occStrength);
              accumCenterLight += sVidCol.rgb * lightPass * decay;
            }
            decay *= 0.92;
          }
          vec3 finalCenterRays = accumCenterLight * (uCenterRaysExposure * 0.18) * centerFade * uInsideTransition;
          sceneColor += finalCenterRays;
        }
      }

      // 2. Světlo a stíny z myši (vstupují pouze sem, netmaví zbytek světa ani mlhu)
      sceneColor += uLightColor * (volumetricMouseLight * 0.65);

      // Cílová barva mlhy: plně respektuje zvolenou barvu a jas (při #000000 jde do čistě černé)
      vec3 targetFogColor = uFogColor * uBaseFogBrightness;

      // 3. Hloubková mlha (Depth Fog) - leží PŘES světlo i stíny myši
      float fogAlpha = depthFog;
      if (uEnableSmoke > 0.5) {
        // Kouř moduluje náběh, ale s rostoucí hloubkou se zahušťuje, takže na konci mlhy dosahuje nastavené max opacity
        float smokeMod = mix(smokeDensityFactor, 1.0, normZ);
        fogAlpha = clamp(depthFog * smokeMod, 0.0, maxDepthFog);
        if (normZ >= 1.0 || isBackground) {
          fogAlpha = maxDepthFog;
        }
      }
      // Voda z myši (INSIDE): kde je vidět pozadí, rozrazí mlhu (hloubkovou i popředovou); kde jede přes
      // shluk particlů, víří v ní světlo TV (barva tvLight) – přechod podle toho, kolik okolí particly zakrývají
      float inWater = uTvInside > 0.001 ? insideWater() : 0.0;
      float inCover = inWater > 0.001 ? particleCover() : 0.0;
      // mlha se rozráží všude (i z particlů a solidů -> po odehnání mají svou barvu, dokud se mlha nevrátí)
      float fogCut = clamp(inWater * uFogClear, 0.0, 1.0);
      fogAlpha *= 1.0 - fogCut;
      // Při fogAlpha = 1.0 (na Fog Far a za ním) scéna 100% přechází do barvy mlhy a za ni již není vidět
      sceneColor = mix(sceneColor, targetFogColor, fogAlpha);

      // 4. Popředová a vinětová mlha displeje (Foreground & Vignette) - leží v popředí 24/7
      float foregroundPart = uForegroundFog * smokeDensityFactor * screenEdgeFade * uEnableForegroundFog;
      float frontFog = clamp(foregroundPart + finalVignetteFog, 0.0, 1.0) * (1.0 - fogCut);
      vec3 frontColor = targetFogColor + uLightColor * (mouseCore * smokeDensityFactor * 0.35 * uEnableMouseFog);
      sceneColor = mix(sceneColor, frontColor, frontFog * 0.65);
      sceneColor += frontColor * (frontFog * 0.25);
      if (inWater > 0.001) {
        float a1 = 1.0 - smoothstep(0.0, uAtmoSize, length((vUv - uAtmoPos) * vec2(uAspect, 1.0)));
        float lit = max(a1 * a1, uTvInsideFloor);
        // okraj rozražené mlhy chytá trochu světla (mlha se rozhrnuje, ne mizí)
        float rim = inWater * (1.0 - inWater) * 4.0 * (1.0 - inCover) * uFogRim;
        // (přes particly/solidy tu vířilo tyrkysové světlo; zakrytí se měří z hloubky, takže barvilo každou
        //  geometrii ve víru -> pryč, pod vodou mají particly i solidy čisté vlastní barvy)
        sceneColor += uTvColor * lit * rim * uTvInside;
      }

      vec3 finalInside = sceneColor;

      // ==========================================
      // 3. Plynulé prolnutí mezi ORBIT a INSIDE
      // ==========================================
      float t = smoothstep(0.0, 1.0, uInsideTransition);
      vec3 finalColor = mix(orbitColor, finalInside, t);
      if (uPrintRays > 0.001) {
        // žhavá vrstva prosvítí i přes mlhu INSIDE + paprsky k televizi
        finalColor += texture2D(tPrintMask, vUv).rgb * uPrintRays * 0.25;
        finalColor += printRays(vUv, dither);
        finalColor += printLineRays(vUv);
      }

      gl_FragColor = vec4(cinematicFinish(finalColor + tvLight(cineBg), cineBg), baseColor.a);
    }
  `
};

export function CenterLight({ appConfig }) {
  const vl = appConfig?.volumetricLight || {};
  if (vl.enabled === false) return null;

  const posX = vl.posX ?? 0;
  const posY = vl.posY ?? 0;
  const posZ = vl.posZ ?? 0;
  const radius = vl.lightSize ?? 0.35;
  const intensity = vl.lightIntensity ?? 20;
  const color = vl.color || '#ffffff';
  const hasAura = vl.hasAura ?? true;
  const auraSize = vl.auraSize ?? 2.2;
  const auraOpacity = vl.auraOpacity ?? 0.35;

  return (
    <group position={[posX, posY, posZ]}>
      {/* Kompaktní zářivé jádro uprostřed scény */}
      <mesh renderOrder={1}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/* Jemná záře / aura kolem jádra pro bohatší rozptyl paprsků */}
      {hasAura && (
        <mesh renderOrder={1}>
          <sphereGeometry args={[radius * auraSize, 32, 32]} />
          <meshBasicMaterial 
            color={color} 
            transparent={true} 
            opacity={auraOpacity} 
            toneMapped={false} 
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Bodové světlo pro reálné prosvícení vnitřku částic */}
      <pointLight 
        distance={30} 
        decay={2} 
        intensity={intensity} 
        color={color} 
      />
    </group>
  );
}

// Rozmazání pro cinematic vrstvu (DOF + bloom) ve 1/4 rozlišení.
// uMode 0 = downsample (4 bilineární vzorky = průměr 4x4 pixelů, bez blikání malých particlů), 1 = 9-tap gauss podél uDir.
const CineBlurShader = {
  uniforms: {
    tInput: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uDir: { value: new THREE.Vector2(1, 0) },
    uMode: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tInput;
    uniform vec2 uTexel;
    uniform vec2 uDir;
    uniform float uMode;
    varying vec2 vUv;
    void main() {
      if (uMode < 0.5) {
        vec2 o = uTexel;
        vec3 c = texture2D(tInput, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tInput, vUv + vec2(o.x, -o.y)).rgb
               + texture2D(tInput, vUv + vec2(-o.x, o.y)).rgb + texture2D(tInput, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(c * 0.25, 1.0);
        return;
      }
      vec2 d = uDir * uTexel;
      vec3 c = texture2D(tInput, vUv).rgb * 0.2270270270;
      c += (texture2D(tInput, vUv + d * 1.3846153846).rgb + texture2D(tInput, vUv - d * 1.3846153846).rgb) * 0.3162162162;
      c += (texture2D(tInput, vUv + d * 3.2307692308).rgb + texture2D(tInput, vUv - d * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }
  `
};

export function VolumetricLightPass({ appConfig, viewMode = 'ORBIT', videoTexture = null }) {
  const { gl, scene, camera, size } = useThree();

  // Optimalizace rozlišení: max DPR 1.25 zabrání zahlcení GPU paměti
  const dpr = Math.min(gl.getPixelRatio(), 1.25);
  const width = Math.max(1, Math.floor(size.width * dpr));
  const height = Math.max(1, Math.floor(size.height * dpr));

  const sceneTarget = useMemo(() => {
    const depthTexture = new THREE.DepthTexture(width, height);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.type = THREE.UnsignedIntType;

    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthTexture: depthTexture
    });
    target.texture.colorSpace = gl.outputColorSpace;
    target.texture.generateMipmaps = false;
    return target;
  }, [width, height, gl.outputColorSpace]);

  useEffect(() => {
    return () => {
      sceneTarget.dispose();
      if (sceneTarget.depthTexture) {
        sceneTarget.depthTexture.dispose();
      }
    };
  }, [sceneTarget]);

  // Cinematic blur chain (1/4 rozlišení, ping-pong)
  const blurTargets = useMemo(() => {
    const bw = Math.max(1, Math.floor(width / 4));
    const bh = Math.max(1, Math.floor(height / 4));
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType, depthBuffer: false };
    const a = new THREE.WebGLRenderTarget(bw, bh, opts);
    const b = new THREE.WebGLRenderTarget(bw, bh, opts);
    a.texture.generateMipmaps = false;
    b.texture.generateMipmaps = false;
    return { a, b, bw, bh };
  }, [width, height]);

  useEffect(() => () => { blurTargets.a.dispose(); blurTargets.b.dispose(); }, [blurTargets]);

  const blurPass = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CineBlurShader.uniforms),
      vertexShader: CineBlurShader.vertexShader,
      fragmentShader: CineBlurShader.fragmentShader,
      depthTest: false,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    const bScene = new THREE.Scene();
    bScene.add(mesh);
    return { scene: bScene, material: mat, mesh };
  }, []);

  useEffect(() => () => { blurPass.material.dispose(); blurPass.mesh.geometry.dispose(); }, [blurPass]);

  const { quadScene, quadCamera, material } = useMemo(() => {
    const qScene = new THREE.Scene();
    const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const qGeo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(VolumetricLightShader.uniforms),
      vertexShader: VolumetricLightShader.vertexShader,
      fragmentShader: VolumetricLightShader.fragmentShader,
      depthTest: false,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(qGeo, mat);
    qScene.add(mesh);
    return { quadScene: qScene, quadCamera: qCam, material: mat };
  }, []);

  const materialRef = useRef(material);
  useEffect(() => {
    materialRef.current = material;
    return () => {
      material.dispose();
    };
  }, [material]);

  const textContrastPass = useMemo(() => {
    return new TextContrastPass({
      valueBoost: 1.0,
      whiteShift: 1.0,
      intensity: 1.0,
      enableMask: 1.0
    });
  }, []);

  const testPlateHelper = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#0055ff', depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    const pScene = new THREE.Scene();
    const pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    pScene.add(mesh);
    return { mesh, scene: pScene, camera: pCam, material: mat };
  }, []);

  useEffect(() => {
    return () => {
      textContrastPass.dispose();
      testPlateHelper.material.dispose();
      testPlateHelper.mesh.geometry.dispose();
    };
  }, [textContrastPass, testPlateHelper]);

  const vl = appConfig?.volumetricLight || {};
  const fog = appConfig?.insideFog || {};
  const enabled = vl.enabled ?? true;

  // Hladké animování přechodu mezi ORBIT (0.0) a INSIDE (1.0)
  const transitionRef = useRef(viewMode === 'INSIDE' ? 1.0 : 0.0);
  // Plynule vyhlazená pozice myši
  const smoothMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
  // Předalokované vektory pro nulové alokace v useFrame (Pravidlo #3 GEMINI.md)
  const lightPosRef = useRef(new THREE.Vector3());
  const camWorldPosRef = useRef(new THREE.Vector3());
  const projRef = useRef(new THREE.Vector3());
  const camDirRef = useRef(new THREE.Vector3());
  const toLightRef = useRef(new THREE.Vector3());
  const tvTmp = useRef({ c: new THREE.Vector3(), n: new THREE.Vector3(), e: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3(), vis: 0 });

  useFrame((state, delta) => {
    if (!enabled) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    const mat = materialRef.current;
    if (!mat) return;
    if (import.meta.env.DEV) window.__postMat = mat; // ladění uniform postu z konzole

    const safeDelta = Math.min(Math.max(delta, 0), 0.1);

    // Plynulý přechod mezi módy
    // vzhled INSIDE (mlha, bez DOF/bloomu) naběhne až když kamera projíždí sklem desky (PortalTransition),
    // ne hned po kliknutí -> žádný fade do mlhy před průletem
    const pf = appConfig?.portal || {};
    transitionRef.current = THREE.MathUtils.smoothstep(portalFx.progress, pf.insideFrom ?? 0.6, pf.insideTo ?? 0.85);
    mat.uniforms.uInsideTransition.value = transitionRef.current;

    // Plynulé sledování myši ve screen-space (0.0 až 1.0)
    const targetMouseX = (state.pointer.x + 1.0) * 0.5;
    const targetMouseY = (state.pointer.y + 1.0) * 0.5;
    smoothMouseRef.current.x = THREE.MathUtils.damp(smoothMouseRef.current.x, targetMouseX, 9, safeDelta);
    smoothMouseRef.current.y = THREE.MathUtils.damp(smoothMouseRef.current.y, targetMouseY, 9, safeDelta);
    mat.uniforms.uMouseScreenPos.value.copy(smoothMouseRef.current);

    // Čas a parametry kamery
    mat.uniforms.uTime.value = state.clock.getElapsedTime();
    mat.uniforms.uAspect.value = size.width / Math.max(1, size.height);
    mat.uniforms.uCameraNear.value = camera.near;
    mat.uniforms.uCameraFar.value = camera.far;

    // Dynamická aktualizace parametrů z config.json
    const vl = appConfig?.volumetricLight || {};
    const fog = appConfig?.insideFog || {};

    // Master Fog Intensity přepočtená na násobič 0.0 až 1.0 (slider 0 až 100)
    const masterMult = Math.max(0, (fog.masterFogIntensity ?? 70) / 100.0);

    mat.uniforms.uFogMasterIntensity.value = masterMult;
    mat.uniforms.uFogDensity.value = fog.fogDensity ?? 1.5;
    mat.uniforms.uFogNear.value = fog.fogNear ?? 0.7;
    mat.uniforms.uFogFar.value = fog.fogFar ?? 4.5;
    mat.uniforms.uFogCurve.value = fog.fogCurve ?? 1.2;
    mat.uniforms.uShadowStrength.value = fog.shadowStrength ?? 1.0;
    mat.uniforms.uShadowThreshold.value = fog.shadowThreshold ?? 1.0;
    mat.uniforms.uSmokeStrength.value = fog.smokeStrength ?? 0.8;
    mat.uniforms.uSmokeSpeed.value = fog.smokeSpeed ?? 0.25;
    mat.uniforms.uSmokeScale.value = fog.smokeScale ?? 3.5;
    mat.uniforms.uSmokeAngle.value = (fog.smokeAngle ?? 25.0) * (Math.PI / 180.0);
    mat.uniforms.uVignetteStrength.value = (fog.vignetteStrength ?? 0.6) * masterMult;
    mat.uniforms.uVignetteRoundness.value = fog.vignetteRoundness ?? 1.0;
    mat.uniforms.uVignetteInvert.value = fog.vignetteInvert ? 1.0 : 0.0;
    mat.uniforms.uVignetteOrganic.value = fog.vignetteOrganic ?? 0.15;
    mat.uniforms.uEdgeFade.value = fog.edgeFade ?? 0.35;
    mat.uniforms.uBaseFogBrightness.value = fog.baseFogBrightness ?? 1.0;
    mat.uniforms.uForegroundFog.value = (fog.foregroundFog ?? 0.8) * masterMult;

    mat.uniforms.uMouseLightExposure.value = (fog.mouseLightExposure ?? 1.2) * masterMult;
    mat.uniforms.uMouseLightRadius.value = fog.mouseLightRadius ?? 1.3;
    mat.uniforms.uEnableMouseFog.value = (fog.enableMouseFog ?? true) ? 1.0 : 0.0;
    mat.uniforms.uEnableDepthFog.value = (fog.enableDepthFog ?? true) ? 1.0 : 0.0;
    mat.uniforms.uEnableForegroundFog.value = (fog.enableForegroundFog ?? true) ? 1.0 : 0.0;
    mat.uniforms.uEnableVignette.value = (fog.enableVignette ?? true) ? 1.0 : 0.0;
    mat.uniforms.uEnableSmoke.value = (fog.enableSmoke ?? true) ? 1.0 : 0.0;

    if (fog.fogColor) {
      mat.uniforms.uFogColor.value.set(fog.fogColor);
    }

    // Volumetrický video průhled v prostoru (Volumetric Depth & Ghosting)
    const vDepth = appConfig?.volumetricDepth || {};
    const vVid = appConfig?.volumetricVideo || {};
    mat.uniforms.tVolumetricVideo.value = videoTexture || dummyTexture;
    mat.uniforms.uVolumetricGhostEnabled.value = (vDepth.enabled ?? true) ? 1.0 : 0.0;
    mat.uniforms.uVolumetricStartDist.value = vDepth.startDistance ?? 2.16;
    mat.uniforms.uVolumetricFadeRange.value = vDepth.fadeRange ?? 0.6;
    mat.uniforms.uVolumetricGhostStrength.value = vDepth.ghostStrength ?? 0.35;
    mat.uniforms.uVolumetricVideoScale.value = (vVid.scale ?? 1.0) * (vDepth.videoScale ?? 0.72);
    mat.uniforms.uVolumetricVignetteSoft.value = vVid.vignetteSoftness ?? 0.45;
    mat.uniforms.uCenterRaysExposure.value = 0.0;
    mat.uniforms.uCenterRaysRadius.value = vDepth.raysRadius ?? 0.65;
    mat.uniforms.uCenterRayLength.value = vDepth.rayLength ?? 0.45;
    mat.uniforms.uCenterRayDensity.value = vDepth.rayDensity ?? 1.0;

    // ORBIT parametry (středové God Rays) - bez alokace nových objektů
    lightPosRef.current.set(
      vl.posX ?? 0,
      vl.posY ?? 0,
      vl.posZ ?? 0
    );

    camera.updateMatrixWorld();
    camera.getWorldPosition(camWorldPosRef.current);

    // Screen-space projection
    projRef.current.copy(lightPosRef.current).project(camera);
    const screenX = (projRef.current.x + 1.0) * 0.5;
    const screenY = (projRef.current.y + 1.0) * 0.5;

    // Visibility test
    camera.getWorldDirection(camDirRef.current);
    toLightRef.current.copy(lightPosRef.current).sub(camWorldPosRef.current);
    const dist = toLightRef.current.length();
    let visibility = 1.0;
    if (dist > 0.001) {
      toLightRef.current.normalize();
      const dot = camDirRef.current.dot(toLightRef.current);
      visibility = dot > 0.0 ? Math.min(dot * 2.5, 1.0) : 0.0;
    }

    mat.uniforms.uLightScreenPos.value.set(screenX, screenY);
    mat.uniforms.uVisibility.value = visibility;
    mat.uniforms.uExposure.value = vl.exposure ?? 1.0;
    mat.uniforms.uDecay.value = vl.decay ?? 0.92;
    mat.uniforms.uDensity.value = vl.density ?? 0.9;
    mat.uniforms.uWeight.value = vl.weight ?? 0.5;
    mat.uniforms.uThreshold.value = vl.threshold ?? 0.4;
    mat.uniforms.uSmoothThreshold.value = vl.smoothThreshold ?? 0.15;
    mat.uniforms.uDitherStrength.value = vl.ditherStrength ?? 1.0;
    mat.uniforms.uRayLength.value = vl.rayLength ?? 0.45;
    mat.uniforms.uMaxRadius.value = vl.maxRadius ?? 0.9;
    if (vl.color) {
      mat.uniforms.uLightColor.value.set(vl.color);
    }

    // Světlo TV: aktivní televize (sklo s videem) -> pozice a velikost na obrazovce, viditelnost podle toho,
    // jak přímo se kamera na obrazovku TV dívá (kolmo = plně, z boku/zespodu zhasíná). Voda = proud z ParticleFluid.
    {
      // DEV: window.__tvLightOverride = { strength: 2, ... } přepíše config živě
      const tl = { ...(appConfig?.tvLight || {}), ...(import.meta.env.DEV ? window.__tvLightOverride : null) };
      const u = mat.uniforms, t = tvTmp.current;
      let tvMesh = null;
      for (const m of tvRegistry) {
        if (!m.userData.tvActive) continue;
        if (!tvMesh || (m.userData.tvPart?.video && !tvMesh.userData.tvPart?.video)) tvMesh = m;
      }
      let target = 0;
      if (tl.enabled !== false && tvMesh && tvMesh.userData.tvPart) {
        const part = tvMesh.userData.tvPart;
        tvMesh.updateWorldMatrix(true, false);
        t.c.copy(part.center).applyMatrix4(tvMesh.matrixWorld);
        t.n.copy(part.axN).transformDirection(tvMesh.matrixWorld);
        const radius = Math.max(part.half.x, part.half.y) * tvMesh.matrixWorld.getMaxScaleOnAxis();
        t.e.copy(camWorldPosRef.current).sub(t.c);
        const camDist = t.e.length();
        t.e.divideScalar(Math.max(camDist, 1e-4));
        const facing = Math.abs(t.n.dot(t.e));
        camera.getWorldDirection(camDirRef.current);
        const inFront = -camDirRef.current.dot(t.e);
        t.p.copy(t.c).project(camera);
        // poloměr TV na obrazovce (výška obrazovky = 1) přes FOV
        const fovH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 50) * 0.5);
        const screenR = radius / Math.max(camDist * fovH, 1e-4);
        u.uTvPos.value.set((t.p.x + 1) * 0.5, (t.p.y + 1) * 0.5);
        u.uTvSize.value = Math.max(tl.minSize ?? 0.12, screenR * (tl.size ?? 1));
        // hrany obdélníku TV na obrazovce (aspect prostor: x * aspect, výška obrazovky = 1)
        const asp = size.width / Math.max(1, size.height);
        const edge = (ax, h, out) => {
          (t.q ??= new THREE.Vector3()).copy(part.center).addScaledVector(ax, h).applyMatrix4(tvMesh.matrixWorld).project(camera);
          out.set((t.q.x - t.p.x) * 0.5 * asp, (t.q.y - t.p.y) * 0.5);
        };
        const A = u.uTvAxA.value, B = u.uTvAxB.value;
        edge(part.axA, part.half.x, A);
        edge(part.axB, part.half.y, B);
        // TV z boku = obdélník se zplošťuje -> min. tloušťka kolmo na A, ať inverze nevybuchne
        let det = A.x * B.y - A.y * B.x;
        const minDet = 0.05 * A.length() * Math.max(B.length(), 0.02);
        if (Math.abs(det) < minDet) {
          const la = Math.max(A.length(), 1e-4), s = det < 0 ? -1 : 1;
          B.x += -A.y / la * 0.05 * s; B.y += A.x / la * 0.05 * s;
          det = A.x * B.y - A.y * B.x;
        }
        det = Math.abs(det) < 1e-6 ? 1e-6 : det;
        u.uTvInv.value.set(B.y / det, -B.x / det, -A.y / det, A.x / det);
        const fade = tvMesh.material?.uniforms?.uFade?.value ?? 1;
        // i z boku / shora svítí aspoň facingFloor (záře je barva prostoru), naplno při pohledu v úrovni TV
        target = THREE.MathUtils.lerp(tl.facingFloor ?? 0.55, 1, THREE.MathUtils.smoothstep(facing, tl.facingMin ?? 0.4, tl.facingFull ?? 0.92))
          * THREE.MathUtils.smoothstep(inFront, 0.0, 0.35) * fade
          * (1 - THREE.MathUtils.smoothstep(portalFx.progress, 0.0, 0.4));
      }
      t.vis = THREE.MathUtils.damp(t.vis, target, 6, safeDelta);
      u.uTvVis.value = t.vis;
      u.uTvColor.value.set(tl.color ?? '#2f9a9a');
      u.uTvStrength.value = tl.enabled === false ? 0 : (tl.strength ?? 1);
      u.uTvRays.value = tl.rays ?? 0.45;
      u.uTvHalo.value = tl.halo ?? 0.12;
      u.uTvRayLen.value = tl.rayLength ?? 3.5;
      u.uTvGlow.value = tl.glow ?? 0.6;
      u.uTvAnchor.value = tl.tvAnchor ?? 0;
      u.uDustFog.value = tl.dustFog ?? 1;
      u.uDustRays.value = tl.dustRays ?? 6;
      u.uDustHaze.value = tl.dustHaze ?? 0.25;
      u.uDustRayLen.value = tl.dustRayLength ?? 0.35;
      u.uDustDecay.value = tl.dustDecay ?? 0.96;
      u.uDustCap.value = tl.dustCap ?? 0.15;
      u.uDustTint.value = tl.dustTint ?? 0.7;
      u.uFogClear.value = tl.fogClear ?? 0.9;
      u.uFogRim.value = tl.fogRim ?? 0.35;
      u.uWaterStreak.value = tl.waterStreak ?? 0.25;
      u.uCoverRadius.value = tl.coverRadius ?? 0.025;
      // 'top' = shora jako z nebe (dustLightY nad horní hranou), 'center' = střed obrazovky, 'object' = střed DNA jako P1
      const dlf = tl.dustLightFrom ?? 'top';
      if (dlf === 'object') u.uDustLightPos.value.copy(u.uLightScreenPos.value);
      else u.uDustLightPos.value.set(0.5, dlf === 'center' ? 0.5 : (tl.dustLightY ?? 1.15));
      u.uDyeRange.value.set(tl.dyeMin ?? 0.015, tl.dyeMax ?? 0.25);
      u.uTvClip.value = tl.waterClip ?? 1.0;
      u.uTvInside.value = tl.enabled === false ? 0 : (tl.insideStrength ?? 1);
      u.uTvInsideFloor.value = tl.insideFloor ?? 0.75;
      u.uTvDebug.value = +tl.debug || 0;
      u.uWaterRange.value.set(tl.waterMin ?? 12, tl.waterMax ?? 50);
      const fl = getFluid(gl);
      u.tFluid.value = fl.velocity || dummyTexture;
      u.uFluidOn.value = fl.velocity ? 1 : 0;
      if (fl.vel?.[0]) u.uFluidTexel.value.set(1 / fl.vel[0].width, 1 / fl.vel[0].height);
      // barvivo počítá ParticleFluid, jen když ho někdo kreslí (viewAt) -> INSIDE si o něj řekne
      if (u.uInsideTransition.value > 0.001) fl.viewAt = performance.now() / 1000;
      u.tDye.value = fl.dyeLive && fl.dye ? fl.dye[0].texture : dummyTexture;
      u.uDyeOn.value = fl.dyeLive && fl.dye ? 1 : 0;
      if (fl.dyeTexel) u.uDyeTexel.value.copy(fl.dyeTexel);
      if (import.meta.env.DEV) window.__tvLight = { pos: [u.uTvPos.value.x, u.uTvPos.value.y], size: u.uTvSize.value, vis: t.vis, facing: target, mesh: tvMesh };
    }

    // 0. Maska žhavé vrstvy 3D tisku (jen když se tiskne) – dostane stejnou hloubkovou mlhu jako INSIDE
    const pu = printFx.uniforms;
    pu.uPrintFog.value.set(mat.uniforms.uFogNear.value, mat.uniforms.uFogFar.value, mat.uniforms.uFogCurve.value,
      mat.uniforms.uFogDensity.value * masterMult);
    pu.uPrintFogMax.value = Math.min(1, Math.max(0, mat.uniforms.uFogDensity.value)) * mat.uniforms.uEnableDepthFog.value * masterMult;
    const printMask = printFx.renderMask ? printFx.renderMask(gl, camera) : null;
    mat.uniforms.uPrintRays.value = printMask ? printFx.rays : 0;
    mat.uniforms.tPrintMask.value = printMask || dummyTexture;
    mat.uniforms.uPrintRayLen.value = printFx.rayLength;
    mat.uniforms.uPrintCenter.value.copy(printFx.center);
    mat.uniforms.uPrintInward.value = printFx.inward ? 1 : 0;
    mat.uniforms.uPrintFrame.value = printFx.frame ? 1 : 0;
    mat.uniforms.uPrintFrameScale.value = printFx.frameScale;
    mat.uniforms.uPrintBevel.value = printFx.bevel;
    mat.uniforms.uPrintLineA.value.copy(printFx.lineA);
    mat.uniforms.uPrintLineB.value.copy(printFx.lineB);
    mat.uniforms.uPrintLineColor.value.copy(printFx.lineColor);

    // 1. Vykreslení hlavní scény včetně hloubkového bufferu do render targetu
    gl.setRenderTarget(sceneTarget);
    gl.render(scene, camera);

    // Pokud je aktivní testovací barevná deska pod textem, vykreslíme ji do sceneTarget
    const isTestPlate = Boolean(appConfig?.ui2d?.bottomLeft?.testPlateEnabled || (typeof window !== 'undefined' && window.__webosTestPlateActive));
    if (isTestPlate) {
      const bl = appConfig?.ui2d?.bottomLeft || {};
      testPlateHelper.material.color.set(bl.testPlateColor || '#0055ff');

      const boxW = 340;
      const boxH = 300;
      const posX = bl.posX ?? 36;
      const posY = bl.posY ?? 36;

      const minU = posX / width;
      const minV = posY / height;
      const maxU = (posX + boxW) / width;
      const maxV = (posY + boxH) / height;

      const ndcMinX = minU * 2.0 - 1.0;
      const ndcMaxX = maxU * 2.0 - 1.0;
      const ndcMinY = minV * 2.0 - 1.0;
      const ndcMaxY = maxV * 2.0 - 1.0;

      testPlateHelper.mesh.position.set((ndcMinX + ndcMaxX) * 0.5, (ndcMinY + ndcMaxY) * 0.5, 0);
      testPlateHelper.mesh.scale.set((ndcMaxX - ndcMinX) * 0.5, (ndcMaxY - ndcMinY) * 0.5, 1);

      const prevClear = gl.autoClear;
      gl.autoClear = false;
      gl.render(testPlateHelper.scene, testPlateHelper.camera);
      gl.autoClear = prevClear;
    }

    // Zachycení reálných metrik hlavní 3D scény (draw calls, trojúhelníky, GPU textury)
    debugMetrics.drawCalls = gl.info.render.calls;
    debugMetrics.triangles = gl.info.render.triangles;
    debugMetrics.textures = gl.info.memory.textures;

    // 1b. Cinematic blur chain: downsample -> 2x (H + V gauss) ve 1/4 rozlišení
    // DEV: window.__cineOverride = { ... } přepíše hodnoty živě (ladění bez reloadu)
    const cine = (import.meta.env.DEV && typeof window !== 'undefined' && window.__cineOverride)
      ? { ...(appConfig?.cinematic || {}), ...window.__cineOverride }
      : (appConfig?.cinematic || {});
    const cineOn = cine.enabled ?? true;
    mat.uniforms.uCineEnabled.value = cineOn ? 1.0 : 0.0;
    if (cineOn) {
      const bu = blurPass.material.uniforms;
      const { a, b, bw, bh } = blurTargets;
      bu.tInput.value = sceneTarget.texture;
      bu.uTexel.value.set(1 / width, 1 / height);
      bu.uMode.value = 0;
      gl.setRenderTarget(a);
      gl.render(blurPass.scene, quadCamera);
      bu.uMode.value = 1;
      const radius = cine.blurRadius ?? 1.5;
      // 3 průchody s rostoucím krokem (0.6/1.1/1.6 × radius, stejný celkový rozptyl jako dřív 1× + 2×):
      // velký krok hned ve 2 průchodech dělal v silném DOF (INSIDE popředí/dálka) kostičky
      for (let it = 0; it < 3; it++) {
        const r = radius * (0.6 + 0.5 * it);
        bu.uTexel.value.set(1 / bw, 1 / bh);
        bu.tInput.value = a.texture; bu.uDir.value.set(r, 0);
        gl.setRenderTarget(b); gl.render(blurPass.scene, quadCamera);
        bu.tInput.value = b.texture; bu.uDir.value.set(0, r);
        gl.setRenderTarget(a); gl.render(blurPass.scene, quadCamera);
      }
      mat.uniforms.tBlur.value = a.texture;
      mat.uniforms.uBlurTexel.value.set(1 / bw, 1 / bh);

      // Ohnisko: vodorovná vzdálenost kamery od osy DNA (x=0, z=0) + posun z configu
      const autoFocus = Math.hypot(camWorldPosRef.current.x, camWorldPosRef.current.z);
      // INSIDE: vlastní ohnisko (vzdálenost od kamery Camera_In, solidy jsou ~2 j. daleko) -> ostré solidy,
      // rozmazané popředí i dálka = hloubka jako Active Theory. Bloom by solidy přepálil do bílých fleků -> stažený.
      const inside = transitionRef.current;
      const lerp = (a, b) => a + (b - a) * inside;
      mat.uniforms.uFocusDist.value = lerp(autoFocus + (cine.focusOffset ?? 0), cine.insideFocus ?? 1.9);
      mat.uniforms.uFocusRange.value = lerp(cine.focusRange ?? 2.5, cine.insideFocusRange ?? 1.1);
      mat.uniforms.uDofStrength.value = lerp(cine.dofStrength ?? 0.9, cine.insideDof ?? 0.85);
      mat.uniforms.uBloomStrength.value = (cine.bloomStrength ?? 0.8) * (1 - inside * (1 - (cine.insideBloom ?? 0.0)));
      mat.uniforms.uBloomThreshold.value = cine.bloomThreshold ?? 0.45;
      mat.uniforms.uAtmoColor.value.set(cine.atmoColor ?? '#2f9a9a');
      mat.uniforms.uAtmoPos.value.set(cine.atmoX ?? 0.1, cine.atmoY ?? 1.05);
      mat.uniforms.uAtmoSize.value = cine.atmoSize ?? 0.9;
      mat.uniforms.uAtmoStrength.value = cine.atmoStrength ?? 0.35;
      mat.uniforms.uAtmo2Color.value.set(cine.atmo2Color ?? '#15606b');
      mat.uniforms.uAtmo2Pos.value.set(cine.atmo2X ?? 0.0, cine.atmo2Y ?? -0.05);
      mat.uniforms.uAtmo2Strength.value = cine.atmo2Strength ?? 0.15;
      mat.uniforms.uGrain.value = cine.grain ?? 0.05;
      mat.uniforms.uCineVignette.value = cine.vignette ?? 0.45;
    }

    // 2. Vykreslení fullscreen quadu s postprocessingem na obrazovku
    gl.setRenderTarget(null);
    mat.uniforms.tDiffuse.value = sceneTarget.texture;
    mat.uniforms.tDepth.value = sceneTarget.depthTexture;
    gl.render(quadScene, quadCamera);

    // 3. TextContrastPass - HSV transformace a oříznutí přesně na písmena textu v rohu obrazovky
    if (appConfig?.ui2d?.enabled !== false && appConfig?.ui2d?.bottomLeft?.enabled !== false) {
      const hoveredId = (typeof window !== 'undefined') ? window.__webosHoveredHudId : null;
      const hudMask = getHudTextMask(appConfig, size.width, size.height, hoveredId);
      if (hudMask && hudMask.texture) {
        const bl = appConfig?.ui2d?.bottomLeft || {};
        textContrastPass.material.uniforms.tDiffuse.value = sceneTarget.texture;
        textContrastPass.material.uniforms.tMask.value = hudMask.texture;
        textContrastPass.material.uniforms.uMaskBounds.value.set(
          hudMask.bounds[0],
          hudMask.bounds[1],
          hudMask.bounds[2],
          hudMask.bounds[3]
        );
        textContrastPass.material.uniforms.uEnableMask.value = 1.0;
        textContrastPass.material.uniforms.uValueBoost.value = bl.valueBoost ?? appConfig?.ui2d?.valueBoost ?? 1.0;
        textContrastPass.material.uniforms.uSaturationBoost.value = bl.saturationBoost ?? 1.4;
        textContrastPass.material.uniforms.uBlackThreshold.value = bl.blackThreshold ?? 0.18;
        textContrastPass.material.uniforms.uWhiteShift.value = bl.whiteShift ?? 1.0;
        textContrastPass.material.uniforms.uHueShift.value = bl.hueShift ?? 0.0;
        textContrastPass.material.uniforms.uIntensity.value = bl.contrastIntensity ?? 1.0;

        textContrastPass.render(gl, null);
      }
    }
  }, 1);

  return null;
}

