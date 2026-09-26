import { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Skleněné tělo televize (nody z Blenderu s prefixem "TV_", rodič GlassDesk).
// Video zůstává na GlassDesk; tohle je jen sklo kolem něj.
// Levné sklo bez transmission passu: tónovaná průhlednost + fresnelový okraj + falešný odraz softboxu.
// Ladí se v Blenderu přes custom properties objektu (export extras -> userData):
//   tvOpacity, tvTint, tvRim, tvRimStrength

const vertexShader = `
  varying vec3 vN;
  varying vec3 vWP;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = `
  uniform vec3 uTint, uRim;
  uniform float uOpacity, uRimStrength, uFade;
  varying vec3 vN;
  varying vec3 vWP;
  void main() {
    vec3 V = normalize(cameraPosition - vWP);
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 4.0);
    // falešný odraz: měkký pruh světla shora (hrany a zkosení ho chytí)
    vec3 R = reflect(-V, N);
    float sheen = smoothstep(0.35, 0.9, R.y) * 0.22;
    vec3 col = uTint + uRim * fres * uRimStrength + vec3(sheen);
    float a = clamp(uOpacity + fres * 0.7 + sheen * 0.6, 0.0, 1.0) * uFade;
    gl_FragColor = vec4(col, a);
  }
`;

function makeMaterial(userData) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTint: { value: new THREE.Color(userData.tvTint ?? '#0c1016') },
      uRim: { value: new THREE.Color(userData.tvRim ?? '#ffb45a') },
      uOpacity: { value: userData.tvOpacity ?? 0.15 },
      uRimStrength: { value: userData.tvRimStrength ?? 1.0 },
      uFade: { value: 1 }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

export function useTvParts(nodes) {
  return useMemo(() => Object.keys(nodes)
    .filter(k => k.startsWith('TV_') && nodes[k].geometry)
    .map(k => {
      const n = nodes[k];
      n.updateWorldMatrix(true, false);
      return {
        name: k,
        geometry: n.geometry,
        position: n.getWorldPosition(new THREE.Vector3()),
        quaternion: n.getWorldQuaternion(new THREE.Quaternion()),
        scale: n.getWorldScale(new THREE.Vector3()),
        userData: n.userData || {}
      };
    }), [nodes]);
}

// Jeden materiál na díl, sdílený všemi deskami (všechny desky fadují stejně).
export function useTvMaterials(parts, fade) {
  const materials = useMemo(() => {
    const m = {};
    parts.forEach(p => { m[p.name] = makeMaterial(p.userData); });
    return m;
  }, [parts]);

  useEffect(() => () => Object.values(materials).forEach(m => m.dispose()), [materials]);

  useFrame(() => {
    const f = fade?.get ? fade.get() : 1;
    for (const k in materials) materials[k].uniforms.uFade.value = f;
  });

  return materials;
}

export function TvGlass({ parts, materials }) {
  return parts.map(p => (
    <mesh
      key={p.name}
      geometry={p.geometry}
      material={materials[p.name]}
      position={p.position}
      quaternion={p.quaternion}
      scale={p.scale}
      renderOrder={3}
    />
  ));
}
