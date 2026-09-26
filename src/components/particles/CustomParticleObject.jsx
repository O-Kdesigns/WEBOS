import React, { useRef, useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getColors, useGPGPU, useParticleLogic, getAdaptiveSphereSegments } from './utils';
import { ParticleMaterial } from './ParticleMaterial';
import { withBase } from '../../assetUrl';

export function CustomParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance }) {
  const { scene } = useGLTF(withBase(`/obsah/${settings.customModel}`));
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
  const { gl } = useThree();

  const posX = settings.objectX ?? 0.0;
  const posY = settings.objectY ?? 2.0;
  const posZ = -(settings.objectZ ?? 4.0);
  
  const { vertices, center } = useMemo(() => {
    const pts = [];
    const bbox = new THREE.Box3().setFromObject(scene);
    const c = new THREE.Vector3();
    bbox.getCenter(c);

    scene.traverse((child) => {
      if ((child.isMesh || child.isPoints) && child.geometry) {
        const posAttribute = child.geometry.attributes.position;
        const colorAttribute = child.geometry.attributes.color;
        const localMatrix = child.matrixWorld;
        const v = new THREE.Vector3();
        const col = new THREE.Color();
        
        for (let i = 0; i < posAttribute.count; i++) {
          v.fromBufferAttribute(posAttribute, i);
          v.applyMatrix4(localMatrix);
          
          let pointColor = new THREE.Color('#ffffff');
          if (colorAttribute) {
            col.fromBufferAttribute(colorAttribute, i);
            pointColor = col.clone();
          }
          
          pts.push({ v: v.clone(), c: pointColor });
        }
      }
    });

    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }

    return { vertices: pts, center: c };
  }, [scene]);

  const radiusScale = (settings.radius ?? 2.0) / 2.0;
  const densityPercent = settings.densityPercent ?? 100;
  const count = vertices.length > 0 ? Math.max(1, Math.floor(vertices.length * (densityPercent / 100))) : 0;
  const [segW, segH] = useMemo(() => getAdaptiveSphereSegments(count, settings), [count, settings]);

  const particlesData = useMemo(() => {
    const data = [];
    const baseColorObj = new THREE.Color(settings.baseColor || '#3b82f6');

    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, z = 0;
      let color = baseColorObj;
      
      if (vertices.length > 0) {
        const vIndex = i % vertices.length; 
        const vertexObj = vertices[vIndex];
        
        x = vertexObj.v.x;
        y = vertexObj.v.y;
        z = vertexObj.v.z;

        if (settings.colorMode === 'vertex') {
          color = vertexObj.c;
        }

        x *= radiusScale;
        y *= radiusScale;
        z *= radiusScale;
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
      
      const speed = Math.random() * 0.5 + 0.1;
      const offset = Math.random() * Math.PI * 2;

      data.push({ x, y, z, scale, color, speed, offset });
    }
    return data;
  }, [count, vertices, center, colors, settings.baseSize, settings.sizeRandomness, settings.radius, settings.colorMode, settings.baseColor, settings.sizeMultiplier]);

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
        <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} rotationY={rotationY} pageDistance={pageDistance} />
      </instancedMesh>
    </group>
  );
}
