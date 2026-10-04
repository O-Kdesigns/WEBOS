import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { a } from '@react-spring/three';

import './shaders/VideoRefractionMaterial';
import './shaders/JellyVideoMaterial';
import { attachParticleLink } from '../../SolidLink';
import { ESC_VERTEX } from './shaders/escapeGlsl';
import { DNA_RAINBOW_GLSL, buildDnaPalette } from './shaders/dnaRainbow';
import pagesConfig from '../../settings.json';

const NO_DEFINES = {};
const IMPOSTOR_DEFINES = { IMPOSTOR: '' };
const IMPOSTOR_DEPTH_DEFINES = { IMPOSTOR: '', IMPOSTOR_DEPTH: '' };

const isCylinderSettings = (settings) =>
  settings.isCylinder || settings.scatterSpring !== undefined || (settings.shape === 'cylinder' && !settings.customGeometry);

// Režim impostoru pro částice: jen želé materiál (video + textura) a jen když je zapnutý v configu
// (particleImpostor {enabled, depth}). DEV: window.__impostorOverride = {enabled, depth} (platí při dalším renderu).
export function impostorMode(settings, appConfig, videoTexture) {
  if (settings.colorMode !== 'video' || !videoTexture || isCylinderSettings(settings)) return 0;
  const cfg = { ...(appConfig?.particleImpostor || {}), ...((import.meta.env.DEV && window.__impostorOverride) || {}) };
  if (!cfg.enabled) return 0;
  return cfg.depth === false ? 1 : 2;
}

// impostor: 0 = koule (geometrie), 1 = čtverec + koule dopočítaná paprskem, 2 = navíc skutečná hloubka (prolínání)
// – jen želé materiál; geometrii (čtverec) dodává GeometryParticleObject, viz impostorMode()
export function ParticleMaterial({ settings, appConfig, videoTexture, opacity = 1, rotationY, pageDistance, transitionProgress, impostor = 0 }) {
  const isCylinder = isCylinderSettings(settings);
  const matRef = useRef();
  // Barva particlů v ORBITu (DNA stav): stojatá duha namíchaná z 2D prachu (config.atmosphereDust)
  // + barev všech portfolií (settings.json) - viz shaders/dnaRainbow.js. Automaticky se změní,
  // když se změní paleta prachu nebo přibude/uprav projekt, beze zmínky konkrétní stránky tady.
  const dustColors = appConfig?.atmosphereDust?.colors;
  const dnaPalette = useMemo(
    () => buildDnaPalette(THREE, appConfig, pagesConfig?.pages),
    [dustColors]
  );
  // jelly: sdílené uniformy přisvícení od solidu (SolidLink.jsx) musí existovat už při první kompilaci,
  // three si seznam uniform programu cachuje -> připojit hned při vzniku materiálu, ne až v useFrame
  const jellyRef = React.useCallback((m) => {
    matRef.current = m;
    if (m?.uniforms) {
      attachParticleLink(m.uniforms);
      if (m.uniforms.uDnaPalette) m.uniforms.uDnaPalette.value = dnaPalette.colors;
      if (m.uniforms.uDnaCount) m.uniforms.uDnaCount.value = dnaPalette.count;
    }
  }, [dnaPalette]);

  useFrame((state) => {
    if (!matRef.current) return;
    const time = state.clock.getElapsedTime();
    if (matRef.current.uniforms) {
      if (matRef.current.uniforms.uTime) {
        matRef.current.uniforms.uTime.value = time;
      }
      if (matRef.current.uniforms.uOpacity && opacity !== undefined) {
        matRef.current.uniforms.uOpacity.value = opacity.get ? opacity.get() : opacity;
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
      if (matRef.current.uniforms.uTransitionProgress && transitionProgress != null) {
        matRef.current.uniforms.uTransitionProgress.value = transitionProgress.get ? transitionProgress.get() : transitionProgress;
      }
    }
  });

  const onBeforeCompile = React.useCallback((shader) => {
    shader.uniforms.tPositions = { value: null };
    shader.uniforms.uTransitionProgress = { value: 1.0 };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uDnaPalette = { value: dnaPalette.colors };
    shader.uniforms.uDnaCount = { value: dnaPalette.count };
    // odtržené particly (utils.js ESCAPE_DEFAULTS, plní useParticleLogic)
    Object.assign(shader.uniforms, {
      tVelocities: { value: null }, uEscColor: { value: new THREE.Color('#ffb347') }, uEscTint: { value: 0 },
      uEscFlash: { value: 0 }, uEscFlashTime: { value: 0.6 }, uEscGlow: { value: 0 }, uEscPop: { value: 0 }, uEscLife: { value: 25 },
    });

    shader.vertexShader = `
      uniform sampler2D tPositions;
      attribute vec2 aComputeUV;
      uniform sampler2D tVelocities;
      uniform float uEscFlashTime;
      uniform float uEscPop;
      uniform float uEscLife;
      varying float vEsc;
      varying float vEscFlash;
      varying vec3 vWorldPos;
      ${shader.vertexShader}
    `;
    shader.fragmentShader = `
      uniform vec3 uEscColor;
      uniform float uEscTint;
      uniform float uEscFlash;
      uniform float uEscGlow;
      uniform float uTransitionProgress;
      uniform float uTime;
      varying float vEsc;
      varying float vEscFlash;
      varying vec3 vWorldPos;
      float dnaHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float dnaValueNoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        float a = dnaHash(i), b = dnaHash(i + vec2(1.0, 0.0)), c = dnaHash(i + vec2(0.0, 1.0)), d = dnaHash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      ${DNA_RAINBOW_GLSL}
      ${shader.fragmentShader}
    `.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      // stojatá duha v ORBITu (world-space, na kameře nezávislá, pomalu se proměňující) - viz JellyVideoMaterial.js
      float dnaField = fract(0.5 + uTime * 0.00225 + vWorldPos.y * 0.058
        + (dnaValueNoise(vWorldPos.xz * 0.08 + vec2(uTime * 0.00555, -uTime * 0.00405)) - 0.5) * 0.6
        + (dnaValueNoise(vWorldPos.xy * 0.058 + vec2(-uTime * 0.0033, uTime * 0.0048) + 11.3) - 0.5) * 0.5);
      diffuseColor.rgb = mix(dnaPaletteBlend(dnaField), diffuseColor.rgb, smoothstep(0.0, 1.0, uTransitionProgress));
      diffuseColor.rgb = mix(diffuseColor.rgb, uEscColor, vEsc * uEscTint);
      totalEmissiveRadiance += uEscColor * (vEscFlash * uEscFlash + vEsc * uEscGlow);
    `);

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      vec4 computedData = texture2D(tPositions, aComputeUV);
      vec3 computedPos = computedData.xyz;
      float computedScale = computedData.w;
      ${ESC_VERTEX}

      vec3 transformed = position * computedScale;
      transformed += computedPos;
      vWorldPos = transformed;
      `
    );
    matRef.current = shader;
  }, [dnaPalette]);

  // Pro vĂˇlec na pozadĂ­ (GlobalBackground / KuĹľel) - NESAHAT NA KUĹ˝EL, PLNĂ‰ ZACHOVĂNĂŤ
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

  // Pro projektovĂ© ÄŤĂˇstice v mĂłdu video pouĹľijeme novĂ˝ bohatĂ˝ Jelly materiĂˇl s plnĂ˝m zapojenĂ­m nastavenĂ­
  if (settings.colorMode === 'video' && videoTexture) {
    return (
      <jellyVideoMaterialImpl
        key={`jelly${impostor}`}
        defines={impostor ? (impostor > 1 ? IMPOSTOR_DEPTH_DEFINES : IMPOSTOR_DEFINES) : NO_DEFINES}
        ref={jellyRef}
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
        uTint={settings.videoTint ?? 0.35}
        uWobble={settings.jellyWobble ?? 0.5}
        uVideoGain={settings.videoGain ?? 1.4}
        uGlowKnee={settings.glowThreshold ?? 3.0}
        uGlowRoll={settings.glowHeadroom ?? 0.5}
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
