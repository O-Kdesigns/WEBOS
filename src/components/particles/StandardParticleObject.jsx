import React, { useRef, useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getColors, useGPGPU, useParticleLogic, getAdaptiveSphereSegments } from './utils';
import { ParticleMaterial } from './ParticleMaterial';

export function StandardParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
  const { gl } = useThree();

  const count = settings.count ?? 2000;
  const [segW, segH] = useMemo(() => getAdaptiveSphereSegments(count, settings), [count, settings]);
  const radius = settings.radius ?? 2.0;
  const shape = settings.shape || 'sphere';
  const posX = settings.objectX ?? 0.0;
  const posY = settings.objectY ?? 2.0;
  const posZ = -(settings.objectZ ?? 4.0);

  const particlesData = useMemo(() => {
    const data = [];
    const baseColorObj = new THREE.Color(settings.baseColor || '#3b82f6');

    for (let i = 0; i < count; i++) {
      let x, y, z;

      if (shape === 'cube') {
        x = (Math.random() - 0.5) * radius * 2;
        y = (Math.random() - 0.5) * radius * 2;
        z = (Math.random() - 0.5) * radius * 2;
      } else if (shape === 'cylinder') {
        const u = Math.random();
        const theta = 2 * Math.PI * u;
        const r = radius + (Math.random() - 0.5) * 2; 
        const h = settings.height ?? 40;
        x = r * Math.cos(theta);
        z = r * Math.sin(theta);
        y = (Math.random() - 0.5) * h;
      } else {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radius * Math.pow(Math.random(), 0.7);

        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi);
      }

      const sizeMult = settings.sizeMultiplier ?? 1.0;
      const baseSize = (settings.baseSize ?? 0.1) * sizeMult;
      const sizeRandomness = settings.sizeRandomness ?? 0.5;

      const isLarge = Math.random() > 0.95;
      let scale = baseSize * (1.0 + (Math.random() - 0.5) * sizeRandomness);
      if (isLarge) {
        scale += baseSize * (2.0 + Math.random()) * sizeRandomness;
      }
      scale = Math.max(0.001, scale);

      let color = baseColorObj;
      if (settings.colorMode === 'vertex') {
        color = colors[3];
        const colorRoll = Math.random();
        if (colorRoll > 0.85) color = colors[0];
        else if (colorRoll > 0.75) color = colors[1];
        else if (colorRoll > 0.65) color = colors[2];
      }
      
      const speed = Math.random() * 0.5 + 0.1;
      const offset = Math.random() * Math.PI * 2;

      data.push({ x, y, z, scale, color, speed, offset });
    }
    return data;
  }, [count, radius, shape, colors, settings.baseSize, settings.sizeRandomness, settings.colorMode, settings.baseColor, settings.sizeMultiplier]);

  const compute = useGPGPU(count, particlesData, gl);

  const computeUVs = useMemo(() => {
     if (!compute) return new Float32Array(0);
     const size = compute.size;
     const uvs = new Float32Array(count * 2);
     let i = 0;
     for(let y = 0; y < size; y++) {
         for(let x = 0; x < size; x++) {
             if (i < count) {
                 uvs[i * 2] = (x + 0.5) / size;
                 uvs[i * 2 + 1] = (y + 0.5) / size;
             }
             i++;
         }
     }
     return uvs;
  }, [count, compute]);

  useEffect(() => {
    if (!meshRef.current || !compute) return;
    
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, particlesData[i].color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.frustumCulled = false;
    
    meshRef.current.geometry.setAttribute('aComputeUV', new THREE.InstancedBufferAttribute(computeUVs, 2));
  }, [count, particlesData, dummy, compute, computeUVs, segW, segH]);

  useParticleLogic(meshRef, settings, appConfig, posY, compute);

  return (
    <group position={[posX, 0, posZ]}>
      <instancedMesh ref={meshRef} args={[null, null, count]} renderOrder={renderOrder}>
        <sphereGeometry key={`${segW}-${segH}`} args={[1, segW, segH]} />
        <ParticleMaterial settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} rotationY={rotationY} pageDistance={pageDistance} />
      </instancedMesh>
    </group>
  );
}
