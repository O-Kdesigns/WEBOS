import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { a } from '@react-spring/three';

import './shaders/VideoRefractionMaterial';
import './shaders/JellyVideoMaterial';
import { attachParticleLink } from '../../SolidLink';

export function ParticleMaterial({ settings, videoTexture, opacity = 1, rotationY, pageDistance, transitionProgress }) {
  const isCylinder = settings.isCylinder || settings.scatterSpring !== undefined || (settings.shape === 'cylinder' && !settings.customGeometry);
  const matRef = useRef();
  // jelly: sdílené uniformy přisvícení od solidu (SolidLink.jsx) musí existovat už při první kompilaci,
  // three si seznam uniform programu cachuje -> připojit hned při vzniku materiálu, ne až v useFrame
  const jellyRef = React.useCallback((m) => {
    matRef.current = m;
    if (m?.uniforms) attachParticleLink(m.uniforms);
  }, []);

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
