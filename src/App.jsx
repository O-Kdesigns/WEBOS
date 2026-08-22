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
import './App.css';

// --- Background Cylinder (Nyní používá reálné GPGPU částice) ---
function BackgroundCylinder({ appConfig, visible }) {
  const { opacity } = useSpring({
    opacity: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  if (appConfig.cylinderSettings?.hasParticles === false) return null;

  return (
    <group>
      <ParticleObject 
        opacity={opacity}
        settings={{ 
          shape: 'cylinder', 
          count: 10000, 
          radius: 8.0, 
          height: 40.0, 
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
    </group>
  );
}

// --- Orbital Boards (Desky s portfoliem) ---
function OrbitalBoards({ pagesData, onSelect, visible }) {
  const radius = 10.0; 
  
  const { opacity } = useSpring({
    opacity: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  return (
    <group>
      {pagesData.map((page, i) => {
        const angle = i * (Math.PI / 2);
        return (
          <group key={page.id} rotation-y={angle}>
            <group position-z={radius}>
              {/* Zástupná černá deska */}
              <mesh 
                onClick={() => { if (visible) onSelect(i); }}
                onPointerOver={(e) => { if (visible) document.body.style.cursor = 'pointer'; }}
                onPointerOut={(e) => { document.body.style.cursor = 'auto'; }}
              >
                <boxGeometry args={[4, 6, 0.1]} />
                <a.meshPhysicalMaterial 
                  color="#000000" 
                  metalness={0.9} 
                  roughness={0.1} 
                  transmission={0.5} 
                  thickness={0.5} 
                  transparent={true}
                  opacity={opacity}
                />
              </mesh>

              {/* Title na desce */}
              <Text position={[0, 3.5, 0]} fontSize={0.5} color="white" anchorX="center" anchorY="bottom" fillOpacity={visible ? 1 : 0}>
                {page.title || `Project ${i + 1}`}
              </Text>
            </group>
          </group>
        );
      })}
    </group>
  );
}

// --- Projekt Content (To co je vidět po kliknutí) ---
function ProjectContent({ page, visible, appConfig }) {
  const { opacity } = useSpring({
    opacity: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  if (!page || !page.particlesSettings?.hasParticles) return null;

  return (
    <group>
      <ParticleObject 
        opacity={opacity}
        settings={page.particlesSettings}
        appConfig={appConfig} 
        videoTexture={null} 
      />
    </group>
  );
}

// --- Kamerový Rig ---
function CameraRig({ viewMode, rotationY, currentIndex, appConfig }) {
  const { springZ } = useSpring({
    springZ: viewMode === 'ORBIT' ? (appConfig.cameraRadius || 18.0) : 9.0,
    config: { duration: 1000 }
  });

  return (
    <a.group rotation-y={rotationY}>
      <a.group position-z={springZ}>
        <PerspectiveCamera 
          makeDefault 
          fov={appConfig.cameraFov || 60} 
          position={[0, appConfig.cameraHeight ?? 1.5, 0]} 
        />
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
          
          {/* 1. Obrovský středový sloup částic, který rotuješ (Zmizí když jsi INSIDE) */}
          <BackgroundCylinder appConfig={appConfig} visible={viewMode === 'ORBIT'} />

          {/* 2. Prstenec portfoliových desek, rotuješ kamerou kolem nich */}
          <OrbitalBoards 
            pagesData={pagesData} 
            visible={viewMode === 'ORBIT'} 
            onSelect={(idx) => {
              setViewMode('INSIDE');
            }} 
          />

          {/* 3. Obsah projektu uvnitř - VYKRESLÍ SE JEN KDYŽ JSME INSIDE A JEN PRO AKTIVNÍ PROJEKT */}
          {viewMode === 'INSIDE' && (
            <group rotation-y={currentIndex * -(Math.PI / 2)}>
               <ProjectContent 
                 page={pagesData[currentIndex]} 
                 appConfig={appConfig}
                 visible={viewMode === 'INSIDE'} 
               />
            </group>
          )}

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
