import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { useGLTF } from '@react-three/drei';

export function Grass({ mesh, count = 3000, settings = {} }) {
  if (settings.grassModelType === 'custom' && settings.grassCustomModel) {
    return <CustomGrass mesh={mesh} count={count} settings={settings} />;
  }
  return <BasicGrass mesh={mesh} count={count} settings={settings} />;
}

// Společná funkce pro získání materiálu trávy na základě settings
function getGrassMaterial(settings) {
  if (settings.grassColorMode === 'texture' && settings.grassTexture) {
    const tex = new THREE.TextureLoader().load(`/obsah/${settings.grassTexture}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ 
      map: tex,
      roughness: 0.8,
      side: THREE.DoubleSide
    });
  }
  return new THREE.MeshStandardMaterial({ 
    color: settings.grassColor || '#4a8505', 
    roughness: 0.8,
    side: THREE.DoubleSide
  });
}

function BasicGrass({ mesh, count, settings }) {
  const meshRef = useRef();

  const geometry = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.03, 0.15, 3);
    geo.translate(0, 0.075, 0); 
    return geo;
  }, []);

  const material = useMemo(() => getGrassMaterial(settings), [settings.grassColorMode, settings.grassColor, settings.grassTexture]);

  useGrassPlacement(mesh, meshRef, count);

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} receiveShadow castShadow />;
}

function CustomGrass({ mesh, count, settings }) {
  const meshRef = useRef();
  
  // Načteme uživatelský GLTF model
  const { scene } = useGLTF(`/obsah/${settings.grassCustomModel}`);
  
  // Najdeme první validní Mesh v nahraném modelu
  const customGeometry = useMemo(() => {
    let geo = null;
    scene.traverse((child) => {
      if (child.isMesh && !geo) {
        geo = child.geometry.clone();
      }
    });
    // Záložní řešení, kdyby v modelu nebyl mesh
    if (!geo) {
      geo = new THREE.ConeGeometry(0.03, 0.15, 3);
      geo.translate(0, 0.075, 0);
    }
    return geo;
  }, [scene]);

  const material = useMemo(() => getGrassMaterial(settings), [settings.grassColorMode, settings.grassColor, settings.grassTexture]);

  useGrassPlacement(mesh, meshRef, count);

  return <instancedMesh ref={meshRef} args={[customGeometry, material, count]} receiveShadow castShadow />;
}

// Společný hook pro matematiku SurfaceSampleru
function useGrassPlacement(mesh, meshRef, count) {
  useEffect(() => {
    if (!mesh || !meshRef.current) return;
    
    mesh.updateMatrixWorld(true);

    const sampler = new MeshSurfaceSampler(mesh).build();
    const dummy = new THREE.Object3D();
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < count; i++) {
      sampler.sample(position, normal);
      
      position.applyMatrix4(mesh.matrixWorld);
      normal.transformDirection(mesh.matrixWorld).normalize();

      dummy.position.copy(position);
      
      // Vlastní modely (i kužely) natáčíme po směru normály
      dummy.quaternion.setFromUnitVectors(up, normal);
      
      dummy.rotateY(Math.random() * Math.PI * 2);
      dummy.rotateX((Math.random() - 0.5) * 0.4);
      dummy.rotateZ((Math.random() - 0.5) * 0.4);
      
      const scale = 1.0 + Math.random() * 1.5;
      dummy.scale.set(scale, scale, scale);
      
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [mesh, count, meshRef]);
}
