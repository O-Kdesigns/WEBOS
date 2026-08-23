import React, { useState, useRef, Suspense, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, Text, Environment, useGLTF, PerspectiveCamera } from '@react-three/drei';
import { a, useSpring } from '@react-spring/three';
import { motion as motionDom, AnimatePresence } from 'framer-motion';
import { useDrag, useWheel } from '@use-gesture/react';
import * as THREE from 'three';
import settings from './settings.json';
import config from './config.json';
import { Editor } from './Editor';
import { ParticleObject } from './ParticleObject';
import { useVideoTexture } from '@react-three/drei';
import './App.css';

function VideoTextureProvider({ url, children }) {
  if (!url) return <>{children(null)}</>;
  return (
    <Suspense fallback={<>{children(null)}</>}>
      <VideoTextureLoader url={url}>{children}</VideoTextureLoader>
    </Suspense>
  );
}

function VideoTextureLoader({ url, children }) {
  const texture = useVideoTexture(url, { muted: true, loop: true, start: true, crossOrigin: 'Anonymous' });
  return <>{children(texture)}</>;
}

function BackgroundCylinder({ appConfig, visible }) {
  const { scale } = useSpring({
    scale: visible ? 1 : 0.00001,
    config: { duration: 1000 }
  });

  if (appConfig.cylinderSettings?.hasParticles === false) return null;

  return (
    <a.group scale={scale}>
      <ParticleObject 
        settings={{ 
          shape: 'cylinder', 
          count: 10000, 
          radius: 8.0, 
          objectY: 0, 
          objectZ: 0, 
          colorMode: 'single', 
          baseColor: '#3b82f6', 
          hasParticles: true,
          ...appConfig.cylinderSettings 
        }}
        appConfig={appConfig} 
        videoTexture={null} 
      />
    </a.group>
  );
}

// --- Orbital Boards (Desky s portfoliem) ---
function OrbitalBoards({ pagesData, onSelect, visible }) {
  const radius = 10;
  
  const { scale } = useSpring({
    scale: visible ? 1 : 0.00001,
    config: { duration: 1000 }
  });

  return (
    <a.group scale={scale}>
      {pagesData.map((page, i) => {
        const angle = i * (Math.PI / 2);
        return (
          <group key={page.id} rotation-y={angle}>
            <group position-z={radius}>
              {/* Zástupná černá deska */}
              <mesh 
                onClick={() => onSelect(i)}
                onPointerOver={(e) => document.body.style.cursor = 'pointer'}
                onPointerOut={(e) => document.body.style.cursor = 'auto'}
              >
                <boxGeometry args={[4, 6, 0.1]} />
                <meshPhysicalMaterial 
                  color="#000000" 
                  metalness={0.9} 
                  roughness={0.1} 
                  transmission={0.5} 
                  thickness={0.5} 
                />
              </mesh>

              {/* Title na desce */}
              <Text position={[0, 3.5, 0]} fontSize={0.5} color="white" anchorX="center" anchorY="bottom">
                {page.title || `Project ${i + 1}`}
              </Text>
            </group>
          </group>
        );
      })}
    </a.group>
  );
}

function ProjectContent({ page, visible, appConfig, videoTexture }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');

  // Skryjeme to jen přes condition, nebo vůbec neskrýváme.
  // Jelikož uživatel chce "seamless zoom", necháme particles prostě na místě!
  if (!page || !page.particlesSettings?.hasParticles) return null;

  // Renderujeme je POUZE, pokud jsme ve stavu INSIDE, nebo trvale?
  // Pokud jen INSIDE, bliknou. Uživatel nechce přeblikávání.
  // Změníme to tak, že ProjectContent se vykreslí bez animace scale.
  const settings = page.particlesSettings;
  const selected = settings.selectedNodes || [];

  const { fade } = useSpring({
    fade: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  return (
    <a.group visible={fade.to(v => v > 0)}>
      {selected.length > 0 ? selected.map(nodeName => {
        const node = nodes[nodeName];
        if (!node) return null;
        return (
          <group key={nodeName} position={node.getWorldPosition(new THREE.Vector3())} quaternion={node.getWorldQuaternion(new THREE.Quaternion())}>
            <ParticleObject 
              settings={{ 
                ...settings,
                shape: 'geometry', 
                customGeometry: node.geometry,
                transform: {
                  position: new THREE.Vector3(0,0,0),
                  quaternion: new THREE.Quaternion(),
                  scale: node.getWorldScale(new THREE.Vector3())
                }
              }}
              appConfig={appConfig} 
              videoTexture={videoTexture} 
              opacity={fade}
            />
          </group>
        );
      }) : (
        <group>
          <ParticleObject 
            settings={settings}
            appConfig={appConfig} 
            videoTexture={videoTexture} 
            opacity={fade}
          />
        </group>
      )}
    </a.group>
  );
}

export function GlobalBackground({ appConfig, videoTexture }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');
  
  if (!nodes.Cylinder) return null;
  
  return (
    <group position={nodes.Cylinder.getWorldPosition(new THREE.Vector3())} quaternion={nodes.Cylinder.getWorldQuaternion(new THREE.Quaternion())}>
      <ParticleObject 
        settings={{ 
          shape: 'geometry', 
          customGeometry: nodes.Cylinder.geometry,
          transform: {
            position: new THREE.Vector3(0,0,0),
            quaternion: new THREE.Quaternion(),
            scale: nodes.Cylinder.getWorldScale(new THREE.Vector3())
          },
          count: 10000, 
          hasParticles: appConfig.cylinderSettings?.hasParticles ?? true,
          baseColor: appConfig.cylinderSettings?.baseColor || '#3b82f6',
          colorMode: appConfig.cylinderSettings?.colorMode || 'single'
        }}
        appConfig={appConfig} 
        videoTexture={videoTexture} 
        opacity={1}
      />
    </group>
  );
}

function BlenderScene({ visible, onSelect, appConfig, pagesData, videoTexture, currentIndex }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');

  const { fade } = useSpring({
    fade: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  return (
    <a.group visible={fade.to(v => v > 0)}>
      {/* Skleněné desky pro projekty */}
      {pagesData.map((page, idx) => {
        const deskNode = nodes[`GlassDesk-${page.title}`] || (idx === 0 ? nodes.GlassDesk : null);
        if (!deskNode) return null;
        
        let centerX = 0;
        let centerY = 0;
        let maxZ = 0.5;
        let deskSizeX = 1;
        let deskSizeY = 1;
        if (deskNode.geometry) {
          deskNode.geometry.computeBoundingBox();
          const bbox = deskNode.geometry.boundingBox;
          deskSizeX = bbox.max.x - bbox.min.x;
          deskSizeY = bbox.max.y - bbox.min.y;
          centerX = (bbox.max.x + bbox.min.x) / 2;
          centerY = (bbox.max.y + bbox.min.y) / 2;
          maxZ = bbox.max.z;
        }
        
        return (
          <group key={page.id} position={deskNode.getWorldPosition(new THREE.Vector3())} quaternion={deskNode.getWorldQuaternion(new THREE.Quaternion())} scale={deskNode.getWorldScale(new THREE.Vector3())}>
            <mesh 
              geometry={deskNode.geometry} 
              onClick={() => onSelect(idx)}
              onPointerOver={(e) => document.body.style.cursor = 'pointer'}
              onPointerOut={(e) => document.body.style.cursor = 'auto'}
            >
              <a.meshPhysicalMaterial 
                color="#000000" 
                metalness={0.9} 
                roughness={0.1} 
                transmission={0.5} 
                thickness={0.5} 
                transparent={true}
                opacity={fade}
              />
            </mesh>
            
            {videoTexture && idx === currentIndex && (
              <mesh position={[centerX, centerY, maxZ + 0.001]}>
                <planeGeometry args={[deskSizeX, deskSizeY]} />
                <meshBasicMaterial map={videoTexture} toneMapped={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </a.group>
  );
}

const AnimatedCamera = a(PerspectiveCamera);

// --- Kamerový Rig ---
function CameraRig({ viewMode, rotationY, currentIndex, appConfig }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');
  
  const camChoose = nodes.Camera_CHoose || nodes.Camera_Choose || nodes.Camera || nodes['Camera.001'];
  const camIn = nodes.Camera_In || nodes.Camera_IN;

  // Nastavení pro ORBIT (rotování kolem válce)
  let orbitZ = appConfig.cameraRadius || 18;
  let orbitY = appConfig.cameraHeight ?? 1.5;
  let orbitFov = appConfig.cameraFov || 60;
  let orbitAngle = 0;
  
  if (camChoose) {
     const worldPos = camChoose.getWorldPosition(new THREE.Vector3());
     orbitZ = Math.sqrt(worldPos.x**2 + worldPos.z**2) || orbitZ;
     orbitY = worldPos.y !== undefined ? worldPos.y : orbitY;
     orbitFov = camChoose.fov || orbitFov;
     orbitAngle = Math.atan2(worldPos.x, worldPos.z);
  }

  // Nastavení pro INSIDE (pohled na detail projektu)
  let inZ = 3.0;
  let inY = orbitY;
  let inFov = orbitFov;
  let inAngle = orbitAngle;

  if (camIn) {
      const worldPos = camIn.getWorldPosition(new THREE.Vector3());
      inZ = Math.sqrt(worldPos.x**2 + worldPos.z**2) || inZ;
      inY = worldPos.y !== undefined ? worldPos.y : inY;
      inFov = camIn.fov || inFov;
      inAngle = Math.atan2(worldPos.x, worldPos.z);
  }

  const { springZ, springY, springFov, springBaseAngle } = useSpring({
    springZ: viewMode === 'ORBIT' ? orbitZ : inZ,
    springY: viewMode === 'ORBIT' ? orbitY : inY,
    springFov: viewMode === 'ORBIT' ? orbitFov : inFov,
    springBaseAngle: viewMode === 'ORBIT' ? orbitAngle : inAngle,
    config: { duration: 1000 }
  });

  return (
    <a.group rotation-y={rotationY}>
      <a.group rotation-y={springBaseAngle}>
        <a.group position-z={springZ} position-y={springY}>
          <AnimatedCamera 
            makeDefault 
            fov={springFov} 
            position={[0, 0, 0]} 
          />
        </a.group>
      </a.group>
    </a.group>
  );
}

function BlurController({ rotationY, appConfig, viewMode }) {
  const lastRot = useRef(rotationY.get());
  
  useFrame(() => {
    if (viewMode === 'INSIDE') {
      const filterEl = document.getElementById('motion-blur-filter');
      if (filterEl) filterEl.setAttribute('stdDeviation', `0 0`);
      return;
    }

    const currentRot = rotationY.get();
    const velocity = Math.abs(currentRot - lastRot.current);
    lastRot.current = currentRot;
    
    const pageDistance = Math.PI / 2;
    const adjustedRot = Math.abs(currentRot);
    const normalizedAngle = adjustedRot % pageDistance;
    const distanceFromPage = Math.min(normalizedAngle, pageDistance - normalizedAngle);
    
    const middleFactor = distanceFromPage / (Math.PI / 4);
    const intensity = appConfig.blurIntensity ?? 300;
    
    const velocityBlur = velocity * 300;
    const staticBlur = middleFactor * intensity;
    const blurAmount = Math.min(velocityBlur + staticBlur, 100);
    
    const filterEl = document.getElementById('motion-blur-filter');
    if (filterEl) {
      if (blurAmount < 0.1) {
        filterEl.setAttribute('stdDeviation', `0 0`);
      } else {
        filterEl.setAttribute('stdDeviation', `${blurAmount} 0`);
      }
    }
  });
  
  return null;
}

function App() {
  const [pagesData, setPagesData] = useState(settings.pages || []);
  const [appConfig, setAppConfig] = useState(config || {});
  
  const [absoluteIndex, setAbsoluteIndex] = useState(0);
  const [viewMode, setViewMode] = useState('ORBIT'); // 'ORBIT' or 'INSIDE'

  const totalPages = Math.max(pagesData.length, 1);
  const dragStartRotRef = useRef(0);
  const wheelLockRef = useRef(false);
  
  const [isEditorOpen, setIsEditorOpen] = useState(() => {
    return window.location.search.includes('editor=true');
  });

  // Rotace hlavního rigů kamery kolem osy Y
  const [{ rotationY }, api] = useSpring(() => ({
    rotationY: 0,
    config: { 
      mass: appConfig.physics?.mass ?? 1, 
      tension: appConfig.physics?.tension ?? 170, 
      friction: appConfig.physics?.friction ?? 26 
    }
  }));

  const currentIndex = ((absoluteIndex % totalPages) + totalPages) % totalPages;

  const changePage = (direction) => {
    if (totalPages <= 1 || viewMode === 'INSIDE') return;
    
    setAbsoluteIndex(prev => {
      const nextIndex = prev + direction;
      api.start({ 
        rotationY: nextIndex * -(Math.PI / 2), 
        immediate: false 
      });
      return nextIndex;
    });
  };

  const bindDrag = useDrag(({ active, first, movement: [mx], velocity: [vx] }) => {
    if (totalPages <= 1 || viewMode === 'INSIDE') return;

    if (first) {
      dragStartRotRef.current = rotationY.get();
    }

    const offsetAngle = (mx / (window.innerWidth / 3)) * (Math.PI / 2);

    if (active) {
      api.start({ 
        rotationY: dragStartRotRef.current + offsetAngle, 
        immediate: true 
      });
    } else {
      const finalAngle = dragStartRotRef.current + offsetAngle;
      const exactFloatIndex = finalAngle / -(Math.PI / 2);
      
      let targetIndex = Math.round(exactFloatIndex);
      
      if (vx > (appConfig.physics?.swipeVelocityThreshold ?? 0.5)) {
        const dir = mx < 0 ? 1 : -1;
        const startingIndex = Math.round(dragStartRotRef.current / -(Math.PI / 2));
        targetIndex = startingIndex + dir;
      }
      
      setAbsoluteIndex(targetIndex);
      api.start({ 
        rotationY: targetIndex * -(Math.PI / 2), 
        immediate: false 
      });
    }
  }, { axis: 'x' });

  const bindWheel = useWheel(({ direction: [, dirY] }) => {
     if (wheelLockRef.current || viewMode === 'INSIDE') return;
     
     if (dirY === -1) changePage(1);
     if (dirY === 1) changePage(-1);
     
     wheelLockRef.current = true;
     setTimeout(() => {
       wheelLockRef.current = false;
     }, 1000);
  });

  return (
    <div className="app-container" {...bindWheel()}>
      <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
        <filter id="directional-blur">
          <feGaussianBlur id="motion-blur-filter" stdDeviation="0 0" />
        </filter>
      </svg>

      <div className="canvas-container" {...bindDrag()} style={{ filter: 'url(#directional-blur)', transform: 'translateZ(0)' }}>
        <Canvas shadows>
          <Environment preset="city" background blur={0.8} />
          <spotLight 
            position={[0, 15, 0]} 
            intensity={(appConfig.hdriIntensity ?? 1) * 3} 
            castShadow 
            penumbra={1} 
            angle={0.8} 
            color="#ffffff" 
          />
          <ambientLight intensity={0.2} />
          
          <BlurController rotationY={rotationY} appConfig={appConfig} viewMode={viewMode} />
          
          <VideoTextureProvider url={pagesData[currentIndex]?.videoUrl || pagesData[currentIndex]?.particlesSettings?.videoUrl}>
            {(videoTex) => (
              <>
                <GlobalBackground appConfig={appConfig} videoTexture={videoTex} />
                <BlenderScene 
                  appConfig={appConfig} 
                  pagesData={pagesData}
                  visible={viewMode === 'ORBIT'} 
                  videoTexture={videoTex}
                  currentIndex={currentIndex}
                  onSelect={(idx) => {
                    const targetIndex = idx;
                    setAbsoluteIndex(targetIndex);
                    api.start({ 
                      rotationY: targetIndex * -(Math.PI / 2), 
                      immediate: false 
                    });
                    setViewMode('INSIDE');
                  }} 
                />
                
                {/* 3. Obsah projektu uvnitř - VYKRESLÍ SE JEN KDYŽ JSME INSIDE A JEN PRO AKTIVNÍ PROJEKT */}
                {/* Už to nenatáčíme přes group rotation-y, protože částice mají svou absolutní pozici z Blenderu! */}
                <ProjectContent 
                  page={pagesData[currentIndex]} 
                  visible={viewMode === 'INSIDE'} 
                  appConfig={appConfig}
                  videoTexture={videoTex}
                />
              </>
            )}
          </VideoTextureProvider>

          <CameraRig 
            appConfig={appConfig} 
            rotationY={rotationY} 
            viewMode={viewMode} 
            currentIndex={currentIndex} 
          />
        </Canvas>
      </div>

      <button 
        style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto' }}
        onClick={() => setIsEditorOpen(true)}
      >
        ⚙️ Editor
      </button>

      {isEditorOpen && <Editor 
        pages={pagesData} 
        setPages={setPagesData} 
        appConfig={appConfig} 
        setAppConfig={setAppConfig} 
        onClose={() => {
          setIsEditorOpen(false);
          window.history.pushState({}, '', window.location.pathname);
        }} 
      />}

      <div className="ui-overlay">
        {viewMode === 'ORBIT' ? (
          <div className="instructions" style={{ color: '#aaa', userSelect: 'none' }}>
            Objevuj (Swipe nebo Scroll). Kliknutím na desku vstup do projektu.
          </div>
        ) : (
          <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)' }}>
             <button 
                style={{ pointerEvents: 'auto', padding: '10px 20px', fontSize: '1.2rem', cursor: 'pointer', background: 'white', color: 'black', border: 'none', borderRadius: '30px' }}
                onClick={() => setViewMode('ORBIT')}
             >
                Opustit projekt
             </button>
             <h2 style={{ textAlign: 'center', marginTop: '10px' }}>{pagesData[currentIndex]?.title}</h2>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
