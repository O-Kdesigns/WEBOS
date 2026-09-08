import { useMemo, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

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
    uCenterRayDensity: { value: 1.0 }
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

    void main() {
      vec4 baseColor = texture2D(tDiffuse, vUv);
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
        gl_FragColor = vec4(orbitColor, baseColor.a);
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
      float accumLight = 0.0;
      float totalDecay = 0.0;

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
      // Při fogAlpha = 1.0 (na Fog Far a za ním) scéna 100% přechází do barvy mlhy a za ni již není vidět
      sceneColor = mix(sceneColor, targetFogColor, fogAlpha);

      // 4. Popředová a vinětová mlha displeje (Foreground & Vignette) - leží v popředí 24/7
      float foregroundPart = uForegroundFog * smokeDensityFactor * screenEdgeFade * uEnableForegroundFog;
      float frontFog = clamp(foregroundPart + finalVignetteFog, 0.0, 1.0);
      vec3 frontColor = targetFogColor + uLightColor * (mouseCore * smokeDensityFactor * 0.35 * uEnableMouseFog);
      sceneColor = mix(sceneColor, frontColor, frontFog * 0.65);
      sceneColor += frontColor * (frontFog * 0.25);

      vec3 finalInside = sceneColor;

      // ==========================================
      // 3. Plynulé prolnutí mezi ORBIT a INSIDE
      // ==========================================
      float t = smoothstep(0.0, 1.0, uInsideTransition);
      vec3 finalColor = mix(orbitColor, finalInside, t);

      gl_FragColor = vec4(finalColor, baseColor.a);
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

  const vl = appConfig?.volumetricLight || {};
  const fog = appConfig?.insideFog || {};
  const enabled = vl.enabled ?? true;

  // Hladké animování přechodu mezi ORBIT (0.0) a INSIDE (1.0)
  const transitionRef = useRef(viewMode === 'INSIDE' ? 1.0 : 0.0);
  // Plynule vyhlazená pozice myši
  const smoothMouseRef = useRef(new THREE.Vector2(0.5, 0.5));

  useFrame((state, delta) => {
    if (!enabled) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    const mat = materialRef.current;
    if (!mat) return;

    const safeDelta = Math.min(Math.max(delta, 0), 0.1);

    // Plynulý přechod mezi módy
    const targetTransition = viewMode === 'INSIDE' ? 1.0 : 0.0;
    transitionRef.current = THREE.MathUtils.damp(transitionRef.current, targetTransition, 5, safeDelta);
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

    // INSIDE parametry z konfigurace (včetně master intenzity mlhy)
    const masterMult = Math.max(0, (fog.masterFogIntensity ?? 100) / 100);
    mat.uniforms.uFogMasterIntensity.value = masterMult;

    if (fog.fogColor) {
      mat.uniforms.uFogColor.value.set(fog.fogColor);
    }
    mat.uniforms.uFogDensity.value = fog.fogDensity ?? 0.65;
    mat.uniforms.uFogNear.value = fog.fogNear ?? 1.0;
    mat.uniforms.uFogFar.value = fog.fogFar ?? 14.0;
    mat.uniforms.uFogCurve.value = fog.fogCurve ?? 2.2;
    mat.uniforms.uShadowStrength.value = fog.shadowStrength ?? 0.85;
    mat.uniforms.uShadowThreshold.value = fog.shadowThreshold ?? 0.35;
    mat.uniforms.uSmokeStrength.value = fog.smokeStrength ?? 0.25;
    mat.uniforms.uSmokeSpeed.value = fog.smokeSpeed ?? 0.4;
    mat.uniforms.uSmokeScale.value = fog.smokeScale ?? 4.5;
    mat.uniforms.uVignetteStrength.value = (fog.vignetteStrength ?? 0.35) * masterMult;
    mat.uniforms.uVignetteRoundness.value = fog.vignetteRoundness ?? 1.0;
    mat.uniforms.uVignetteInvert.value = fog.vignetteInvert ? 1.0 : 0.0;
    mat.uniforms.uVignetteOrganic.value = fog.vignetteOrganic ?? 0.1;
    mat.uniforms.uSmokeAngle.value = fog.smokeAngle ?? 135.0;
    mat.uniforms.uEdgeFade.value = fog.edgeFade ?? 0.12;
    mat.uniforms.uBaseFogBrightness.value = (fog.baseFogBrightness ?? 0.6) * masterMult;
    mat.uniforms.uForegroundFog.value = (fog.foregroundFog ?? 0.35) * masterMult;
    mat.uniforms.uMouseLightExposure.value = (fog.mouseLightExposure ?? 1.2) * masterMult;
    mat.uniforms.uMouseLightRadius.value = fog.mouseLightRadius ?? 1.3;
    mat.uniforms.uEnableMouseFog.value = (fog.enableMouseFog ?? true) ? 1.0 : 0.0;
    mat.uniforms.uEnableDepthFog.value = (fog.enableDepthFog ?? true) ? 1.0 : 0.0;
    mat.uniforms.uEnableForegroundFog.value = (fog.enableForegroundFog ?? true) ? 1.0 : 0.0;
    mat.uniforms.uEnableVignette.value = (fog.enableVignette ?? true) ? 1.0 : 0.0;
    mat.uniforms.uEnableSmoke.value = (fog.enableSmoke ?? true) ? 1.0 : 0.0;

    // Volumetrický průhled videa v prostoru skrz objekty
    const vDepth = appConfig?.volumetricDepth || {};
    const vVid = appConfig?.volumetricVideo || {};
    mat.uniforms.tVolumetricVideo.value = videoTexture || dummyTexture;
    mat.uniforms.uVolumetricGhostEnabled.value = (vDepth.enabled ?? true) ? 1.0 : 0.0;
    mat.uniforms.uVolumetricStartDist.value = vDepth.startDistance ?? 2.16;
    mat.uniforms.uVolumetricFadeRange.value = vDepth.fadeRange ?? 0.6;
    mat.uniforms.uVolumetricGhostStrength.value = vDepth.ghostStrength ?? 0.35;
    mat.uniforms.uVolumetricVideoScale.value = (vVid.scale ?? 1.0) * (vDepth.videoScale ?? 0.72);
    mat.uniforms.uVolumetricVignetteSoft.value = vVid.vignetteSoftness ?? 0.45;
    mat.uniforms.uCenterRaysExposure.value = vDepth.raysExposure ?? 1.2;
    mat.uniforms.uCenterRaysRadius.value = vDepth.raysRadius ?? 0.65;
    mat.uniforms.uCenterRayLength.value = vDepth.rayLength ?? 0.45;
    mat.uniforms.uCenterRayDensity.value = vDepth.rayDensity ?? 1.0;

    // ORBIT parametry (středové God Rays)
    const lightPos = new THREE.Vector3(
      vl.posX ?? 0,
      vl.posY ?? 0,
      vl.posZ ?? 0
    );

    camera.updateMatrixWorld();
    const camWorldPos = new THREE.Vector3();
    camera.getWorldPosition(camWorldPos);

    // Screen-space projection
    const proj = lightPos.clone().project(camera);
    const screenX = (proj.x + 1.0) * 0.5;
    const screenY = (proj.y + 1.0) * 0.5;

    // Visibility test
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const toLight = lightPos.clone().sub(camWorldPos);
    const dist = toLight.length();
    let visibility = 1.0;
    if (dist > 0.001) {
      toLight.normalize();
      const dot = camDir.dot(toLight);
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

    // 1. Vykreslení hlavní scény včetně hloubkového bufferu do render targetu
    gl.setRenderTarget(sceneTarget);
    gl.render(scene, camera);

    // 2. Vykreslení fullscreen quadu s postprocessingem na obrazovku
    gl.setRenderTarget(null);
    mat.uniforms.tDiffuse.value = sceneTarget.texture;
    mat.uniforms.tDepth.value = sceneTarget.depthTexture;
    gl.render(quadScene, quadCamera);
  }, 1);

  return null;
}

