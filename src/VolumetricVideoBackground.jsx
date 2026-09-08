import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSpring } from '@react-spring/three';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// 1x1 černá fallback textura
const dummyTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
dummyTexture.needsUpdate = true;

// Shader pro video na pozadí s měkkou vinětou do ztracena (bez rámečku a bez přidaných částic)
const BackgroundVideoShader = {
  uniforms: {
    uVideo: { value: dummyTexture },
    uFade: { value: 0.0 },
    uOpacity: { value: 1.0 },
    uBrightness: { value: 1.0 },
    uContrast: { value: 1.05 },
    uVignetteSoftness: { value: 0.45 },
    uMouseParallax: { value: new THREE.Vector2(0, 0) }
  },
  vertexShader: `
    uniform vec2 uMouseParallax;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 pos = position;
      // Velmi jemný 3D parallax podle myši
      pos.x += uMouseParallax.x * 0.06;
      pos.y += uMouseParallax.y * 0.04;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uVideo;
    uniform float uFade;
    uniform float uOpacity;
    uniform float uBrightness;
    uniform float uContrast;
    uniform float uVignetteSoftness;

    varying vec2 vUv;

    void main() {
      vec4 vid = texture2D(uVideo, vUv);
      vec3 col = vid.rgb;
      
      // Úprava kontrastu a jasu
      col = ((col - 0.5) * uContrast) + 0.5;
      col = max(vec3(0.0), col * uBrightness);

      // Měkký okraj viněty do ztracena (žádný rámeček)
      // d je od 0.0 (střed) do 1.0 (okraj)
      vec2 d = abs(vUv - vec2(0.5)) * 2.0;
      
      // Hladký pokles k nule na okrajích
      float softness = clamp(uVignetteSoftness, 0.05, 0.9);
      float vx = smoothstep(1.0, 1.0 - softness, d.x);
      float vy = smoothstep(1.0, 1.0 - softness, d.y);
      float vignette = vx * vy;

      // Hladká nelineární křivka pro zcela přirozené rozplynutí do temnoty
      vignette = pow(vignette, 1.3);

      float finalAlpha = vignette * uOpacity * uFade;
      if (finalAlpha < 0.002) discard;

      gl_FragColor = vec4(col, finalAlpha);
    }
  `
};

export function VolumetricVideoBackground({
  videoTexture,
  visible,
  appConfig,
  currentIndex,
  pageDistance
}) {
  const cfg = appConfig.volumetricVideo || {};
  const isEnabled = cfg.enabled ?? true;

  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');
  const camIn = nodes?.Camera_In || nodes?.Camera_IN;
  let inY = appConfig.cameraHeight ?? 1.5;
  let inAngle = 0;
  if (camIn) {
    const worldPos = camIn.getWorldPosition(new THREE.Vector3());
    inY = worldPos.y !== undefined ? worldPos.y : inY;
    inAngle = Math.atan2(worldPos.x, worldPos.z);
  }

  const groupRef = useRef();
  const screenMatRef = useRef();
  const mouseLerp = useRef(new THREE.Vector2(0, 0));

  // Plynulý přechod zjevení a zmizení
  const { fade } = useSpring({
    fade: (visible && isEnabled) ? 1 : 0,
    config: { duration: 700 }
  });

  const screenMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(BackgroundVideoShader.uniforms),
      vertexShader: BackgroundVideoShader.vertexShader,
      fragmentShader: BackgroundVideoShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
  }, []);

  useFrame((state) => {
    const currentFade = fade.get();
    if (!groupRef.current) return;

    if (currentFade <= 0.001) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    // Sledování myši pro jemný parallax
    const targetX = state.pointer.x;
    const targetY = state.pointer.y;
    mouseLerp.current.x += (targetX - mouseLerp.current.x) * 0.05;
    mouseLerp.current.y += (targetY - mouseLerp.current.y) * 0.05;

    const tex = videoTexture || dummyTexture;

    if (screenMatRef.current) {
      const su = screenMatRef.current.uniforms;
      su.uVideo.value = tex;
      su.uFade.value = currentFade;
      su.uOpacity.value = cfg.screenOpacity ?? 1.0;
      su.uBrightness.value = cfg.brightness ?? 1.0;
      su.uContrast.value = cfg.contrast ?? 1.05;
      su.uVignetteSoftness.value = cfg.vignetteSoftness ?? 0.45;
      su.uMouseParallax.value.copy(mouseLerp.current);
    }
  });

  // Rozměry a pozice obrazovky v pozadí
  // Základní formát 16:9 (např. šířka 3.2, výška 1.8)
  const screenScale = cfg.scale ?? 1.0;
  const zDist = cfg.zDistance ?? 1.4;
  const posX = cfg.posX ?? 0.0;
  const posY = (cfg.posY ?? 0.0) + inY;

  return (
    <group rotation-y={currentIndex * -pageDistance}>
      <group rotation-y={inAngle}>
        <group 
          ref={groupRef}
          position={[posX, posY, -zDist]}
          scale={[screenScale, screenScale, screenScale]}
        >
          {/* Čisté video na pozadí s měkkým okrajem do ztracena (žádný rámeček, žádné částice) */}
          <mesh position={[0, 0, 0]} renderOrder={1}>
            <planeGeometry args={[2.5, 1.406]} />
            <primitive object={screenMaterial} ref={screenMatRef} attach="material" />
          </mesh>
        </group>
      </group>
    </group>
  );
}
