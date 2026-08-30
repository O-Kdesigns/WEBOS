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

function VideoManager({ allUrls, children }) {
  const gl = useThree(state => state.gl);
  const [textures, setTextures] = useState({});

  const urlsKey = allUrls.filter(Boolean).join('|');
  useMemo(() => {
    allUrls.forEach(rawUrl => {
      if (!rawUrl) return;
      const url = resolveAssetUrl(rawUrl);
      ensureVideoEntry(url, gl);
    });
  }, [urlsKey, gl]);

  useEffect(() => {
    const updateTextures = () => {
      const newTex = {};
      videoTextureCache.forEach((entry, url) => {
        if (entry.video.readyState >= 2) {
          newTex[url] = entry.texture;
        }
      });
      setTextures(newTex);
    };

    videoTextureCache.forEach((entry, url) => {
      entry.isActive = true;
      entry.video.play().catch(() => {});
      if (entry.video.readyState >= 2) {
        updateTextures();
      } else {
        entry.video.addEventListener('loadeddata', updateTextures, { once: true });
      }
    });
  }, [urlsKey]);

  return <>{children(textures)}</>;
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
        const angle = i * -pageDistance;
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

export function isSolidNode(name) {
  if (!name) return false;
  const trimmed = name.trim();
  return (/(?:^|[_.\-\s])1$|(?:\.0*1)$|1$/.test(trimmed)) && !trimmed.endsWith('0');
}

function SolidObject({ node }) {
  const cloned = useMemo(() => {
    if (!node) return null;
    const cl = node.clone(true);
    cl.position.set(0, 0, 0);
    cl.quaternion.set(0, 0, 0, 1);
    cl.scale.set(1, 1, 1);
    cl.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return cl;
  }, [node]);

  if (!node || !cloned) return null;

  const worldPos = node.getWorldPosition(new THREE.Vector3());
  const worldQuat = node.getWorldQuaternion(new THREE.Quaternion());
  const worldScale = node.getWorldScale(new THREE.Vector3());

  return (
    <group position={worldPos} quaternion={worldQuat} scale={worldScale}>
      <primitive object={cloned} />
    </group>
  );
}

function ProjectContent({ page, appConfig, videoTexture, currentIndex, pageDistance, rotationY }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');

  if (!page || !page.particlesSettings?.hasParticles) return null;

  const settings = page.particlesSettings;
  const selected = settings.selectedNodes || [];

  return (
    <group rotation-y={currentIndex * -pageDistance}>
      {selected.length > 0 ? selected.map(nodeName => {
        const node = nodes[nodeName];
        if (!node) return null;

        if (isSolidNode(nodeName)) {
          return <SolidObject key={nodeName} node={node} />;
        }

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
              rotationY={rotationY}
              pageDistance={pageDistance}
              renderOrder={3}
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
            rotationY={rotationY}
              pageDistance={pageDistance}
              renderOrder={3}
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
          
        />
      </group>
    </group>
  );
}

function BlenderScene({ visible, onSelect, appConfig, pagesData, textures }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');

  const { fade } = useSpring({
    fade: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  const processedTextures = useMemo(() => {
    const res = {};
    Object.keys(textures).forEach(url => {
      const tex = textures[url].clone();
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI;
      tex.needsUpdate = true;
      res[url] = tex;
    });
    return res;
  }, [textures]);

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
        
        const rawUrl = page.videoUrl || page.particlesSettings?.videoUrl;
        const resolvedUrl = rawUrl ? resolveAssetUrl(rawUrl) : null;
        const currentDeskTex = resolvedUrl ? processedTextures[resolvedUrl] : null;

        return (
          <group 
            key={page.id}
            rotation-y={idx * -pageDistance}
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
              geometry={baseDeskNode.geometry} renderOrder={2} 
              
            >
              {currentDeskTex ? (
                <a.meshBasicMaterial 
                  map={currentDeskTex} 
                  toneMapped={false} 
                  transparent={true} 
                  depthWrite={true}
                  opacity={fade} 
                  side={THREE.BackSide} 
                 />
              ) : (
                <a.meshPhysicalMaterial 
                  color="#000000" 
                  metalness={0.9} 
                  roughness={0.1} 
                  transmission={0.5} 
                  thickness={0.5} 
                  transparent={true}
                  depthWrite={true}
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

  // Zajistíme nejkratší cestu pro rotaci kamery
  let angleDiff = inAngle - orbitAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
  inAngle = orbitAngle + angleDiff;

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


function RotationController({ rotationY, pageDistance, totalPages, setClosestIndex }) {
  useFrame(() => {
    const val = rotationY.get();
    let idx = Math.round(val / -pageDistance) % totalPages;
    if (idx < 0) idx += totalPages;
    setClosestIndex(prev => prev !== idx ? idx : prev);
  });
  return null;
}

function App() {
  const [pagesData, setPagesData] = useState(settings.pages || []);
  const [appConfig, setAppConfig] = useState(config || {});
  
  const allVideoUrls = useMemo(() => {
    return [...new Set(pagesData.map(p => p.videoUrl || p?.particlesSettings?.videoUrl).filter(Boolean))];
  }, [pagesData]);
  
  const [closestIndex, setClosestIndex] = useState(0);
  const currentRotRef = useRef(0);
  const [viewMode, setViewMode] = useState('ORBIT'); 

  const totalPages = Math.max(pagesData.length, 1);
  const pageDistance = (Math.PI * 2) / totalPages;
  
  const [isEditorOpen, setIsEditorOpen] = useState(() => {
    return window.location.search.includes('editor=true');
  });

  const [{ rotationY }, api] = useSpring(() => ({
    rotationY: 0,
    config: { 
      mass: appConfig.physics?.mass ?? 1, 
      tension: appConfig.physics?.tension ?? 170, 
      friction: appConfig.physics?.friction ?? 26 
    }
  }));

  const bindDrag = useDrag(({ active, movement: [mx], delta: [dx], velocity: [vx] }) => {
    if (totalPages <= 1 || viewMode === 'INSIDE') return;
    const sensitivity = pageDistance / (window.innerWidth / 1.5);
    
    if (active) {
      currentRotRef.current += dx * sensitivity;
      api.start({ rotationY: currentRotRef.current, immediate: true });
    } else {
      currentRotRef.current += (dx * sensitivity) + (vx * 20 * Math.sign(dx));
      api.start({ rotationY: currentRotRef.current, immediate: false });
    }
  }, { axis: 'x' });

  const bindWheel = useWheel(({ delta: [, dy] }) => {
     if (viewMode === 'INSIDE' || totalPages <= 1) return;
     currentRotRef.current -= dy * 0.005 * (appConfig.scrollSpeed || 1.0);
     api.start({ rotationY: currentRotRef.current, immediate: false });
  });

  return (
    <div className="app-container" {...bindWheel()}>
      <div className="canvas-container" {...bindDrag()}>
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
          
          <RotationController rotationY={rotationY} pageDistance={pageDistance} totalPages={totalPages} setClosestIndex={setClosestIndex} />
          
          <VideoManager allUrls={allVideoUrls}>
            {(textures) => {
              const activeRawUrl = pagesData[closestIndex]?.videoUrl || pagesData[closestIndex]?.particlesSettings?.videoUrl;
              const activeVideoTex = activeRawUrl ? textures[resolveAssetUrl(activeRawUrl)] : null;
              
              return (
              <>
                <GlobalBackground appConfig={appConfig} videoTexture={activeVideoTex} visible={viewMode === 'ORBIT'} />
                <BlenderScene 
                  appConfig={appConfig} 
                  pagesData={pagesData}
                  visible={viewMode === 'ORBIT'} 
                  textures={textures}
                  onSelect={(idx) => {
                    const val = currentRotRef.current;
                    const exactIdx = val / -pageDistance;
                    let diff = idx - (exactIdx % totalPages);
                    if (diff > totalPages / 2) diff -= totalPages;
                    if (diff < -totalPages / 2) diff += totalPages;
                    const targetIndex = exactIdx + diff;
                    currentRotRef.current = targetIndex * -pageDistance;
                    api.start({ 
                      rotationY: currentRotRef.current, 
                      immediate: false 
                    });
                    setViewMode('INSIDE');
                  }} 
                />
                <ProjectContent 
                  page={pagesData[closestIndex]} 
                  appConfig={appConfig}
                  videoTexture={activeVideoTex}
                  currentIndex={closestIndex}
                  pageDistance={pageDistance}
                  rotationY={rotationY}
                />
              </>
            )}}
          </VideoManager>

          <CameraRig 
            appConfig={appConfig} 
            rotationY={rotationY} 
            viewMode={viewMode} 
            currentIndex={closestIndex} 
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
             <h2 style={{ textAlign: 'center', marginTop: '10px' }}>{pagesData[closestIndex]?.title}</h2>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
