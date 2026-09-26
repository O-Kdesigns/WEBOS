import React, { useRef, useMemo, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getColors, useGPGPU, useParticleLogic, getAdaptiveSphereSegments } from './utils';
import { ParticleMaterial } from './ParticleMaterial';

export function GeometryParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance, transitionProgress, dnaGeometry, dnaMatrix, nodeMatrix, currentIndex }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(getColors, []);
  const { gl } = useThree();

  const posX = settings.objectX ?? 0.0;
  const posY = settings.objectY ?? 0.0;
  const posZ = settings.objectZ ?? 0.0;
  
  const { vertices, center } = useMemo(() => {
    const pts = [];
    const c = new THREE.Vector3();
    const geom = settings.customGeometry;
    
    if (geom) {
      geom.computeBoundingBox();
      geom.boundingBox.getCenter(c);

      const posAttribute = geom.attributes.position;
      const colorAttribute = geom.attributes.color;
      const v = new THREE.Vector3();
      const col = new THREE.Color();
      
      for (let i = 0; i < posAttribute.count; i++) {
        v.fromBufferAttribute(posAttribute, i);
        
        let pointColor = new THREE.Color('#ffffff');
        if (colorAttribute) {
          col.fromBufferAttribute(colorAttribute, i);
          pointColor = col.clone();
        }
        
        pts.push({ v: v.clone(), c: pointColor });
      }

      for (let i = pts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pts[i], pts[j]] = [pts[j], pts[i]];
      }
    }

    return { vertices: pts, center: c };
  }, [settings.customGeometry]);

  const radiusScale = settings.radius ?? 1.0;
  const densityPercent = settings.densityPercent ?? 100;
  const count = vertices.length > 0 ? Math.max(1, Math.floor(vertices.length * (densityPercent / 100))) : 0;
  const [segW, segH] = useMemo(() => getAdaptiveSphereSegments(count, settings), [count, settings]);

  const particlesData = useMemo(() => {
    const data = [];
    const baseColorObj = new THREE.Color(settings.baseColor || '#3b82f6');

      // Extract DNA vertices if provided
      let dnaVertices = [];
      if (dnaGeometry) {
        const dnaPosAttr = dnaGeometry.attributes.position;
        for (let i = 0; i < dnaPosAttr.count; i++) { 
          dnaVertices.push(new THREE.Vector3().fromBufferAttribute(dnaPosAttr, i));
        }
      }

      const dnaBaseScale = (appConfig?.dnaSettings?.baseSize ?? 0.08);

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

        // --- DNA Morphing Setup ---
        
          let dnaX = 0, dnaY = 0, dnaZ = 0;
          let dScale = dnaBaseScale * (1.0 + (Math.random() - 0.5) * 0.5);
          
          if (dnaVertices.length > 0) {
              if (i < dnaVertices.length) {
                  const dV = dnaVertices[i].clone();
                  if (dnaMatrix) {
                      dV.applyMatrix4(dnaMatrix);
                  }
                  dnaX = dV.x;
                  dnaY = dV.y;
                  dnaZ = dV.z;
              } else {
                  const isAbove = (i % 2 === 0);
                  dnaX = (Math.random() - 0.5) * 4;
                  dnaY = isAbove ? (12 + Math.random() * 4) : -(12 + Math.random() * 4);
                  dnaZ = (Math.random() - 0.5) * 4;
              }
          } else {
              dnaX = x; dnaY = y; dnaZ = z;
              dScale = scale;
          }


        data.push({ x, y, z, scale, color, speed, offset, dnaX, dnaY, dnaZ, dnaScale: dScale });
      }
      return data;
    }, [count, vertices, center, colors, settings.baseSize, settings.sizeRandomness, settings.radius, settings.colorMode, settings.baseColor, settings.sizeMultiplier, dnaGeometry, dnaMatrix]);

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

  const worldGroupRef = useRef();
  const inverseGroupRef = useRef();
  
  useFrame(() => {
    if (worldGroupRef.current && inverseGroupRef.current && compute) {
      const mat = worldGroupRef.current.matrixWorld;
      if (compute.posVar.material.uniforms.uFinalMat) {
        compute.posVar.material.uniforms.uFinalMat.value.copy(mat);
      }
      inverseGroupRef.current.matrix.copy(mat).invert();
      inverseGroupRef.current.matrixAutoUpdate = false;
    }
  });

  const transform = settings.transform || { position: [posX, 0, posZ] };
  const logicSettings = useMemo(() => ({ ...settings, transitionProgress }), [settings, transitionProgress]);
  useParticleLogic(meshRef, logicSettings, appConfig, 0, compute);

  return (
    <group ref={worldGroupRef} {...transform}>
      <group ref={inverseGroupRef}>
        <instancedMesh ref={meshRef} args={[null, null, count]} renderOrder={renderOrder}>
          <sphereGeometry key={`${segW}-${segH}`} args={[1, segW, segH]} />
          <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} rotationY={rotationY} pageDistance={pageDistance} transitionProgress={transitionProgress} />
        </instancedMesh>
      </group>
    </group>
  );
}
