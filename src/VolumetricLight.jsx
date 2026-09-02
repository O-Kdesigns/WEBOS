import React, { useMemo, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const VolumetricLightShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLightScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uExposure: { value: 1.0 },
    uDecay: { value: 0.96 },
    uDensity: { value: 0.95 },
    uWeight: { value: 0.5 },
    uThreshold: { value: 0.4 },
    uLightColor: { value: new THREE.Color('#ffffff') },
    uVisibility: { value: 1.0 },
    uMaxRadius: { value: 1.5 }
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
    uniform vec2 uLightScreenPos;
    uniform float uExposure;
    uniform float uDecay;
    uniform float uDensity;
    uniform float uWeight;
    uniform float uThreshold;
    uniform vec3 uLightColor;
    uniform float uVisibility;
    uniform float uMaxRadius;

    varying vec2 vUv;

    const int NUM_SAMPLES = 48;

    void main() {
      vec4 baseColor = texture2D(tDiffuse, vUv);

      if (uVisibility <= 0.001) {
        gl_FragColor = baseColor;
        return;
      }

      vec2 deltaTexCoord = (vUv - uLightScreenPos) * (1.0 / float(NUM_SAMPLES)) * uDensity;
      vec2 curUv = vUv;
      float illuminationDecay = 1.0;
      vec3 accumRays = vec3(0.0);

      // Radial distance falloff so rays don't hard-edge at screen boundaries
      float distToLight = distance(vUv, uLightScreenPos);
      float distFade = smoothstep(uMaxRadius, 0.0, distToLight);

      for (int i = 0; i < NUM_SAMPLES; i++) {
        curUv -= deltaTexCoord;
        vec2 clampedUv = clamp(curUv, vec2(0.0), vec2(1.0));
        vec4 sampleCol = texture2D(tDiffuse, clampedUv);

        // High-pass filter based on luminance threshold
        // The center light passes through; dark background & particles act as occluders
        vec3 lightExtracted = max(sampleCol.rgb - vec3(uThreshold), vec3(0.0)) / (1.0 - uThreshold + 0.0001);

        accumRays += lightExtracted * illuminationDecay * uWeight;
        illuminationDecay *= uDecay;
      }

      accumRays *= uExposure * uLightColor * uVisibility * distFade;

      // Additive blend with base scene
      vec3 finalColor = baseColor.rgb + accumRays;
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

  return (
    <group position={[posX, posY, posZ]}>
      {/* Kompaktní zářivé jádro uprostřed scény */}
      <mesh renderOrder={1}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/* Jemná záře / aura kolem jádra pro bohatší rozptyl paprsků */}
      <mesh renderOrder={1}>
        <sphereGeometry args={[radius * 2.2, 32, 32]} />
        <meshBasicMaterial 
          color={color} 
          transparent={true} 
          opacity={0.35} 
          toneMapped={false} 
          depthWrite={false}
        />
      </mesh>

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

export function VolumetricLightPass({ appConfig }) {
  const { gl, scene, camera, size } = useThree();

  const dpr = Math.min(gl.getPixelRatio(), 2);
  const width = Math.max(1, Math.floor(size.width * dpr));
  const height = Math.max(1, Math.floor(size.height * dpr));

  const sceneTarget = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType
    });
    target.texture.colorSpace = gl.outputColorSpace;
    return target;
  }, [width, height, gl.outputColorSpace]);

  useEffect(() => {
    return () => {
      sceneTarget.dispose();
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

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  const vl = appConfig?.volumetricLight || {};
  const enabled = vl.enabled ?? true;

  useFrame(() => {
    if (!enabled) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    const lightPos = new THREE.Vector3(
      vl.posX ?? 0,
      vl.posY ?? 0,
      vl.posZ ?? 0
    );

    // DŮLEŽITÉ: Aktualizace světové matice kamery a získání skutečné světové pozice (ne lokální [0,0,0] z rigu)
    camera.updateMatrixWorld();
    const camWorldPos = new THREE.Vector3();
    camera.getWorldPosition(camWorldPos);

    // Screen-space projection
    const proj = lightPos.clone().project(camera);
    const screenX = (proj.x + 1.0) * 0.5;
    const screenY = (proj.y + 1.0) * 0.5;

    // Visibility test (směřuje kamera k centrálnímu světlu?)
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

    material.uniforms.uLightScreenPos.value.set(screenX, screenY);
    material.uniforms.uVisibility.value = visibility;
    material.uniforms.uExposure.value = vl.exposure ?? 1.0;
    material.uniforms.uDecay.value = vl.decay ?? 0.96;
    material.uniforms.uDensity.value = vl.density ?? 0.95;
    material.uniforms.uWeight.value = vl.weight ?? 0.5;
    material.uniforms.uThreshold.value = vl.threshold ?? 0.4;
    material.uniforms.uMaxRadius.value = vl.maxRadius ?? 1.5;
    if (vl.color) {
      material.uniforms.uLightColor.value.set(vl.color);
    }

    // 1. Render main scene to texture
    gl.setRenderTarget(sceneTarget);
    gl.render(scene, camera);

    // 2. Render postprocessing quad to screen
    gl.setRenderTarget(null);
    material.uniforms.tDiffuse.value = sceneTarget.texture;
    gl.render(quadScene, quadCamera);
  }, 1);

  return null;
}
