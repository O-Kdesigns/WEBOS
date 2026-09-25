import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { a } from '@react-spring/three';

import './shaders/VideoRefractionMaterial';
import './shaders/JellyVideoMaterial';

export function ParticleMaterial({ appConfig, settings, videoTexture, opacity = 1, rotationY, pageDistance, transitionProgress }) {
  const isCylinder = settings.isCylinder || settings.scatterSpring !== undefined || (settings.shape === 'cylinder' && !settings.customGeometry);
  const matRef = useRef();


  const dnaMetalness = appConfig?.cylinderSettings?.metalness ?? 0.12;
  const dnaRoughness = appConfig?.cylinderSettings?.roughness ?? -0.57;
  const dnaTransmission = appConfig?.cylinderSettings?.transmission ?? 3.1;
  const dnaThickness = appConfig?.cylinderSettings?.thickness ?? -2.0;
  const dnaMinDark = appConfig?.cylinderSettings?.transitionMinDark ?? 0.0;
  const dnaMaxLight = appConfig?.cylinderSettings?.transitionMaxLight ?? 1.19;

  const targetMetalness = settings.metalness ?? 0.1;
  const targetRoughness = settings.roughness ?? 0.5;
  const targetTransmission = settings.transmission !== undefined ? settings.transmission : 0.85;
  const targetThickness = settings.thickness !== undefined ? settings.thickness : 1.2;
  const targetMinDark = settings.transitionMinDark ?? 0.05;
  const targetMaxLight = settings.transitionMaxLight ?? 0.8;

  useFrame((state) => {
    if (!matRef.current) return;
    const time = state.clock.getElapsedTime();
    
    let tProgress = 1.0;
    if (transitionProgress) {
        tProgress = transitionProgress.get ? transitionProgress.get() : transitionProgress;
    }

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
      
      // Interpolate material properties so at t=0 it exactly matches DNA
      
      const smoothT = THREE.MathUtils.smoothstep(tProgress, 0.0, 1.0);
      if (matRef.current.uniforms.uMetalness) matRef.current.uniforms.uMetalness.value = THREE.MathUtils.lerp(dnaMetalness, targetMetalness, smoothT);
      if (matRef.current.uniforms.uTransmission) matRef.current.uniforms.uTransmission.value = THREE.MathUtils.lerp(dnaTransmission, targetTransmission, smoothT);
      if (matRef.current.uniforms.uThickness) matRef.current.uniforms.uThickness.value = THREE.MathUtils.lerp(dnaThickness, targetThickness, smoothT);
      if (matRef.current.uniforms.uMinDark) matRef.current.uniforms.uMinDark.value = THREE.MathUtils.lerp(dnaMinDark, targetMinDark, smoothT);
      if (matRef.current.uniforms.uMaxLight) matRef.current.uniforms.uMaxLight.value = THREE.MathUtils.lerp(dnaMaxLight, targetMaxLight, smoothT);

      if (matRef.current.uniforms.uColor) {
        const dnaCol = new THREE.Color(appConfig?.cylinderSettings?.baseColor || \'#3b82f6\');
        const targetCol = new THREE.Color(settings.baseColor || \'#3b82f6\');
        matRef.current.uniforms.uColor.value.copy(dnaCol).lerp(targetCol, smoothT);
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
      if (matRef.current.uniforms.uTransitionProgress && transitionProgress) {
        matRef.current.uniforms.uTransitionProgress.value = transitionProgress.get ? transitionProgress.get() : transitionProgress;
      }
    }
  });

  const onBeforeCompile = React.useCallback((shader) => {
    shader.uniforms.tPositions = { value: null };
    shader.uniforms.uTransitionProgress = { value: 1.0 };
    shader.uniforms.uDnaColor = { value: new THREE.Color('#3b82f6') }; // DNA base color
    
    shader.vertexShader = `
      uniform sampler2D tPositions;
      uniform float uTransitionProgress;
      uniform vec3 uDnaColor;
      attribute vec2 aComputeUV;
      ${shader.vertexShader}
    `;
    
    // ZmÄ›nĂ­me i barvu vertexĹŻ (morph z DNA barvy do pĹŻvodnĂ­ barvy projektu)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
         vColor = mix(uDnaColor, vColor, smoothstep(0.0, 1.0, uTransitionProgress));
      #endif
      `
    );

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
    matRef.current = shader;
  }, []);

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
