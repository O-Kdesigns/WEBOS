import React, { useState, useRef, Suspense, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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

const resolveAssetUrl = (url) => {
  if (!url) return '';
  let finalUrl = url;
  if (url.startsWith('/obsah/')) finalUrl = url;
  else if (url.startsWith('obsah/')) finalUrl = '/' + url;
  else if (url.startsWith('/')) finalUrl = url;
  else finalUrl = '/obsah/' + url;
  return encodeURI(finalUrl);
};

// --- Video Texture Cache (module-level, persists across renders) ---
const videoTextureCache = new Map();

function ensureVideoEntry(url, gl) {
  if (videoTextureCache.has(url)) return videoTextureCache.get(url);
  
  const video = document.createElement('video');
  video.src = url;
  video.crossOrigin = 'anonymous';
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto'; // Necháme prohlížeč přednačíst metadata
  
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = gl.outputColorSpace;
  
  const entry = { video, texture, isActive: false, warmedUp: false };
  videoTextureCache.set(url, entry);
  
  // Krátké přehrání pro zahřátí dekodéru
  video.addEventListener('canplay', () => {
    if (!entry.warmedUp) {
      entry.warmedUp = true;
      if (!entry.isActive) {
        video.pause();
        video.currentTime = 0; // Připravíme ho hned na začátek
      }
    }
  }, { once: true });

  video.play().catch(() => {});

  return entry;
}

function VideoManager({ allUrls, activeUrl, children }) {
  const gl = useThree(state => state.gl);
  const [activeTexture, setActiveTexture] = useState(null);

  const urlsKey = allUrls.filter(Boolean).join('|');
  useMemo(() => {
    allUrls.forEach(rawUrl => {
      if (!rawUrl) return;
      const url = resolveAssetUrl(rawUrl);
      ensureVideoEntry(url, gl);
    });
  }, [urlsKey, gl]);

  const resolvedActive = activeUrl ? resolveAssetUrl(activeUrl) : null;

  useEffect(() => {
    videoTextureCache.forEach((entry, url) => {
      if (url === resolvedActive) {
        entry.isActive = true;
        
        console.log(`[VideoManager] Zkouším přehrát: ${url} (readyState: ${entry.video.readyState}, networkState: ${entry.video.networkState}, error: ${entry.video.error ? entry.video.error.code : 'none'})`);
        
        entry.video.play().catch((e) => {
           console.warn(`[VideoManager] play() error pro ${url}:`, e);
        });
        
        // Zabráníme pádu WebGL (INVALID_VALUE: texImage2D: no video) tím,
        // že texturu pošleme do scény až ve chvíli, kdy má video aspoň metadata/snímky.
        if (entry.video.readyState >= 2) {
          console.log(`[VideoManager] Video je připraveno (${entry.video.readyState}), posílám do scény: ${url}`);
          setActiveTexture(entry.texture);
        } else {
          console.log(`[VideoManager] Čekám na načtení dat pro: ${url}`);
          const onReady = () => {
            console.log(`[VideoManager] Událost loadeddata spuštěna pro: ${url}`);
            if (entry.isActive) setActiveTexture(entry.texture);
          };
          entry.video.addEventListener('loadeddata', onReady, { once: true });
          // Fallback, pokud by se video nechtělo načíst (např. poškozený soubor jako test2.mp4)
          entry.video.addEventListener('error', (e) => {
             console.error(`[VideoManager] Video ${url} vyhodilo CHYBU:`, entry.video.error);
          }, { once: true });
        }

      } else {
        entry.isActive = false;
        entry.video.pause();
        entry.video.currentTime = 0; 
      }
    });
    
    if (!resolvedActive) setActiveTexture(null);
  }, [resolvedActive]);

  return <>{children(activeTexture)}</>;
}

// --- Orbital Boards (Desky s portfoliem) ---
function OrbitalBoards({ pagesData, onSelect, visible }) {
  const radius = 10;
  const totalPages = Math.max(pagesData.length, 1);
  const pageDistance = (Math.PI * 2) / totalPages;
  
  const { scale } = useSpring({
    scale: visible ? 1 : 0.00001,
    config: { duration: 1000 }
  });

  return (
    <a.group scale={scale}>
      {pagesData.map((page, i) => {
        const angle = i * pageDistance;
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

function ProjectContent({ page, appConfig, videoTexture }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');

  if (!page || !page.particlesSettings?.hasParticles) return null;

  const settings = page.particlesSettings;
  const selected = settings.selectedNodes || [];

  return (
    <group>
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
              opacity={1}
            />
          </group>
        );
      }) : (
        <group>
          <ParticleObject 
            settings={settings}
            appConfig={appConfig} 
            videoTexture={videoTexture} 
            opacity={1}
          />
        </group>
      )}
    </group>
  );
}

export function GlobalBackground({ appConfig, videoTexture, visible }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');
  
  // Místo mizení (fade) animujeme scatter (rozlet)
  const { scatter } = useSpring({
    scatter: visible ? 0 : 1, 
    // Při skládání zpět (visible=true) použijeme původní rychlejší pružinu.
    // Při rozletu (visible=false) použijeme těžší a volnější pružinu, která začne pomaleji a trvá déle.
    config: visible 
      ? { mass: 1, tension: 120, friction: 30 } 
      : { mass: 15, tension: 10, friction: 60 } 
  });

  if (!nodes.Cylinder) return null;
  
  return (
    <group>
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
            colorMode: appConfig.cylinderSettings?.colorMode || 'single',
            scatterSpring: scatter // Předáme spring hodnotu pro animaci shaderu
          }}
          appConfig={appConfig} 
          videoTexture={videoTexture} 
          opacity={1} // Válec už nezmizí, jen se rozletí
          renderOrder={1}
        />
      </group>
    </group>
  );
}

function BlenderScene({ visible, onSelect, appConfig, pagesData, videoTexture, currentIndex }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');

  const { fade } = useSpring({
    fade: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  const deskTex = useMemo(() => {
    if (!videoTexture) return null;
    const tex = videoTexture.clone();
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI; 
    tex.needsUpdate = true;
    return tex;
  }, [videoTexture]);

  const totalPages = Math.max(pagesData.length, 1);
  const pageDistance = (Math.PI * 2) / totalPages;

  let baseDeskNode = nodes.GlassDesk || nodes['GlassDesk-Xelith'];
  if (!baseDeskNode) {
    const glassKey = Object.keys(nodes).find(k => k.startsWith('GlassDesk'));
    if (glassKey) baseDeskNode = nodes[glassKey];
  }

  return (
    <a.group visible={fade.to(v => v > 0)}>
      {/* Skleněné desky pro projekty */}
      {pagesData.map((page, idx) => {
        if (!baseDeskNode) return null;
        const deskPos = baseDeskNode.getWorldPosition(new THREE.Vector3());
        const deskRot = baseDeskNode.getWorldQuaternion(new THREE.Quaternion());
        const deskScale = baseDeskNode.getWorldScale(new THREE.Vector3());
        
        return (
          <group 
            key={page.id}
            rotation-y={idx * pageDistance}
          >
            <group
              onClick={() => onSelect(idx)}
              onPointerOver={(e) => document.body.style.cursor = 'pointer'}
              onPointerOut={(e) => document.body.style.cursor = 'auto'}
            >
            <a.mesh 
              position={deskPos}
              quaternion={deskRot}
              scale={deskScale}
              geometry={baseDeskNode.geometry} 
              renderOrder={10}
            >
              {deskTex && idx === currentIndex ? (
                <a.meshBasicMaterial 
                  map={deskTex} 
                  toneMapped={false} 
                  transparent={true} 
                  depthWrite={false}
                  opacity={fade} 
                  side={THREE.DoubleSide} 
                />
              ) : (
                <a.meshPhysicalMaterial 
                  color="#000000" 
                  metalness={0.9} 
                  roughness={0.1} 
                  transmission={0.5} 
                  thickness={0.5} 
                  transparent={true}
                  depthWrite={false}
                  opacity={fade}
                />
              )}
            </a.mesh>
            </group>
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
  const cameraRef = useRef();
  
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

  // Animujeme pouze přechod (0 až 1) mezi ORBIT a INSIDE pohledem
  const { springZ, springY, baseFovProgress, springBaseAngle } = useSpring({
    springZ: viewMode === 'ORBIT' ? orbitZ : inZ,
    springY: viewMode === 'ORBIT' ? orbitY : inY,
    baseFovProgress: viewMode === 'ORBIT' ? 0 : 1,
    springBaseAngle: viewMode === 'ORBIT' ? orbitAngle : inAngle,
    config: { duration: 1000 }
  });

  // Vypočítáme výsledné FOV v každém snímku (bude reagovat okamžitě na změnu okna/monitoru)
  useFrame((state) => {
    if (cameraRef.current) {
       const currentAspect = state.size.width / state.size.height;
       
       // Interpolace základního FOV (např. mezi 60 a 45) podle toho, kde se nacházíme v animaci
       const currentBaseFov = THREE.MathUtils.lerp(orbitFov, inFov, baseFovProgress.get());
       
       // Matematika pro zachování šířky zobrazení
       const REFERENCE_ASPECT = 16 / 9; 
       const vFovRad = THREE.MathUtils.degToRad(currentBaseFov);
       const targetVFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * (REFERENCE_ASPECT / currentAspect));
       const finalFov = THREE.MathUtils.radToDeg(targetVFovRad);
       
       // Pokud se FOV liší, aplikujeme ho okamžitě
       if (Math.abs(cameraRef.current.fov - finalFov) > 0.01) {
           cameraRef.current.fov = finalFov;
           cameraRef.current.updateProjectionMatrix();
       }
    }
  });

  return (
    <a.group rotation-y={rotationY}>
      <a.group rotation-y={springBaseAngle}>
        <a.group position-z={springZ} position-y={springY}>
          <AnimatedCamera 
            ref={cameraRef}
            makeDefault 
            position={[0, 0, 0]} 
          />
        </a.group>
      </a.group>
    </a.group>
  );
}

function BlurController({ rotationY, appConfig, viewMode, totalPages }) {
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
    
    const pageDistance = (Math.PI * 2) / totalPages;
    const adjustedRot = Math.abs(currentRot);
    const normalizedAngle = adjustedRot % pageDistance;
    const distanceFromPage = Math.min(normalizedAngle, pageDistance - normalizedAngle);
    
    const middleFactor = distanceFromPage / (pageDistance / 2);
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
  
  const allVideoUrls = useMemo(() => {
    return [...new Set(pagesData.map(p => p.videoUrl || p?.particlesSettings?.videoUrl).filter(Boolean))];
  }, [pagesData]);
  
  const [absoluteIndex, setAbsoluteIndex] = useState(0);
  const [viewMode, setViewMode] = useState('ORBIT'); // 'ORBIT' or 'INSIDE'

  const totalPages = Math.max(pagesData.length, 1);
  const pageDistance = (Math.PI * 2) / totalPages;
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
        rotationY: nextIndex * -pageDistance, 
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

    const offsetAngle = (mx / (window.innerWidth / 3)) * pageDistance;

    if (active) {
      api.start({ 
        rotationY: dragStartRotRef.current + offsetAngle, 
        immediate: true 
      });
    } else {
      const finalAngle = dragStartRotRef.current + offsetAngle;
      const exactFloatIndex = finalAngle / -pageDistance;
      
      let targetIndex = Math.round(exactFloatIndex);
      
      if (vx > (appConfig.physics?.swipeVelocityThreshold ?? 0.5)) {
        const dir = mx < 0 ? 1 : -1;
        const startingIndex = Math.round(dragStartRotRef.current / -pageDistance);
        targetIndex = startingIndex + dir;
      }
      
      setAbsoluteIndex(targetIndex);
      api.start({ 
        rotationY: targetIndex * -pageDistance, 
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
          
          <BlurController rotationY={rotationY} appConfig={appConfig} viewMode={viewMode} totalPages={totalPages} />
          
          <VideoManager 
            allUrls={allVideoUrls} 
            activeUrl={pagesData[currentIndex]?.videoUrl || pagesData[currentIndex]?.particlesSettings?.videoUrl}
          >
            {(videoTex) => (
              <>
                <GlobalBackground appConfig={appConfig} videoTexture={videoTex} visible={viewMode === 'ORBIT'} />
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
                      rotationY: targetIndex * -pageDistance, 
                      immediate: false 
                    });
                    setViewMode('INSIDE');
                  }} 
                />
                {/* 3. Obsah projektu uvnitř - VYKRESLÍ SE VŽDY PRO AKTIVNÍ PROJEKT */}
                <ProjectContent 
                  page={pagesData[currentIndex]} 
                  appConfig={appConfig}
                  videoTexture={videoTex}
                />
              </>
            )}
          </VideoManager>

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
