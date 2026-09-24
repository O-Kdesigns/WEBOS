import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function DarkStudioBackground({ appConfig }) {
  const meshRef = useRef();
  const bgSettings = appConfig?.darkStudioBg || appConfig?.backgroundSettings || {};

  const centerColor = bgSettings.color || bgSettings.centerColor || '#060608';
  const edgeColor = bgSettings.edgeColor || '#232630';
  const rimPower = bgSettings.rimPower ?? 2.2;

  const uniforms = useMemo(() => ({
    uCenterColor: { value: new THREE.Color(centerColor) },
    uEdgeColor: { value: new THREE.Color(edgeColor) },
    uRimPower: { value: rimPower }
  }), []);

  useFrame(() => {
    if (meshRef.current?.material?.uniforms) {
      const u = meshRef.current.material.uniforms;
      if (bgSettings.color || bgSettings.centerColor) u.uCenterColor.value.set(bgSettings.color || bgSettings.centerColor);
      if (bgSettings.edgeColor) u.uEdgeColor.value.set(bgSettings.edgeColor);
      u.uRimPower.value = bgSettings.rimPower ?? 2.2;
    }
  });

  return (
    <mesh ref={meshRef} scale={120}>
      <sphereGeometry args={[1, 32, 32]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vWorldPosition;
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `}
        fragmentShader={`
          uniform vec3 uCenterColor;
          uniform vec3 uEdgeColor;
          uniform float uRimPower;
          varying vec3 vWorldPosition;
          varying vec3 vNormal;

          void main() {
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            // Inverted sphere normal
            vec3 n = normalize(-vNormal);
            float rim = 1.0 - max(dot(n, viewDir), 0.0);
            float edgeFactor = pow(clamp(rim, 0.0, 1.0), uRimPower);

            // Subtle vertical horizon curve for studio gradient feel
            float horizon = sin(clamp((normalize(vWorldPosition).y * 0.5 + 0.5), 0.0, 1.0) * 3.14159);
            
            vec3 color = mix(uCenterColor, uEdgeColor, edgeFactor);
            color += uEdgeColor * (horizon * 0.15);

            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}
