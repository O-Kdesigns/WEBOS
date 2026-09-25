import React, { useRef, useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getColors, useGPGPU, useParticleLogic, getAdaptiveSphereSegments } from './utils';
import { ParticleMaterial } from './ParticleMaterial';

export function GeometryParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance, transitionProgress, dnaGeometry, currentIndex }) {
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

      // Compute transform matrix
      const yStep = 50; // default yStep from App.jsx, let's hardcode or approximate if not provided, or wait, it's in App.jsx. Let's just use 50. Wait, yStep is usually 30 or 50. Let's look at App.jsx to see yStep.
      // Actually, we can just pass the world inverse matrix directly, but doing it mathematically is fine.
      // A safer trick: If we just use world coordinates for target in GPGPU? No, GPGPU runs in local space.
      // Let's compute local DNA coords.
      const transformPos = settings.transform?.position || [posX, 0, posZ];
      const transformQuat = settings.transform?.quaternion || [0,0,0,1];
      const transformScale = settings.transform?.scale || [1,1,1];
      
      const pQuat = Array.isArray(transformQuat) ? new THREE.Quaternion().fromArray(transformQuat) : transformQuat;
      const pPos = Array.isArray(transformPos) ? new THREE.Vector3().fromArray(transformPos) : transformPos;
      const pScale = Array.isArray(transformScale) ? new THREE.Vector3().fromArray(transformScale) : transformScale;

      const nodeMat = new THREE.Matrix4().compose(pPos, pQuat, pScale);
      
      const cIdx = currentIndex || 0;
      const pDist = pageDistance || (Math.PI * 2 / 8);
      const cYStep = appConfig?.yStep ?? 30; // fallback

      const carouselMat = new THREE.Matrix4()
          .makeTranslation(0, cIdx * -cYStep, 0)
          .multiply(new THREE.Matrix4().makeRotationY(cIdx * pDist));

      const finalMat = carouselMat.multiply(nodeMat);
      const invFinalMat = finalMat.clone().invert();
      
      const invScale = new THREE.Vector3().setFromMatrixScale(invFinalMat);

      const dnaBaseScale = (appConfig?.dnaSettings?.baseSize ?? 0.08) * invScale.x;

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
            // Find a corresponding DNA vertex
            const dV = dnaVertices[i % dnaVertices.length].clone();
            
            // Logika: Pokud má projekt víc částic než DNA (přebytek),
            // chceme, aby tyto přebytečné částice startovaly na struktuře DNA,
            // ale mimo zorné pole kamery (vysoko nad nebo hluboko pod).
            if (i >= dnaVertices.length) {
                const isAbove = (i % 2 === 0);
                // Posun o 40 až 80 jednotek nahoru nebo dolů ve světových souřadnicích DNA
                dV.y += isAbove ? (40 + Math.random() * 40) : -(40 + Math.random() * 40);
            }

            // DNA is at global [0,0,0], scale could be changed, but usually 1. 
            // We apply inverse matrix to convert DNA world pos -> Project local pos
            dV.applyMatrix4(invFinalMat);
            dnaX = dV.x;
            dnaY = dV.y;
            dnaZ = dV.z;
        } else {
            // No DNA geometry provided, fallback to current position
            dnaX = x; dnaY = y; dnaZ = z;
            dScale = scale;
        }

        data.push({ x, y, z, scale, color, speed, offset, dnaX, dnaY, dnaZ, dnaScale: dScale });
      }
      return data;
    }, [count, vertices, center, colors, settings.baseSize, settings.sizeRandomness, settings.radius, settings.colorMode, settings.baseColor, settings.sizeMultiplier, dnaGeometry, currentIndex, pageDistance, appConfig]);

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

  const transform = settings.transform || { position: [posX, 0, posZ] };
  const logicSettings = useMemo(() => ({ ...settings, transitionProgress }), [settings, transitionProgress]);
  useParticleLogic(meshRef, logicSettings, appConfig, 0, compute);

  return (
    <group {...transform}>
      <instancedMesh ref={meshRef} args={[null, null, count]} renderOrder={renderOrder}>
        <sphereGeometry key={`${segW}-${segH}`} args={[1, segW, segH]} />
        <ParticleMaterial settings={settings} videoTexture={videoTexture} opacity={opacity} rotationY={rotationY} pageDistance={pageDistance} transitionProgress={transitionProgress} />
      </instancedMesh>
    </group>
  );
}
