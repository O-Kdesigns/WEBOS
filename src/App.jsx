import React, { useState, useRef, Suspense, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box, Text, Environment, useGLTF, PerspectiveCamera } from '@react-three/drei';
import { a, useSpring } from '@react-spring/three';
import { motion as motionDom, AnimatePresence } from 'framer-motion';
import { useDrag, useWheel } from '@use-gesture/react';
import * as THREE from 'three';
import settings from './settings.json';
import config from './config.json';
import { Editor } from './components/Editor/Editor';
import { ParticleObject } from './components/particles/ParticleObject';
import { MusicPlayer } from './MusicPlayer';
import { VolumetricLightPass, CenterLight } from './VolumetricLight';
import { DarkStudioBackground } from './DarkStudioBackground';
import { VolumetricVideoBackground } from './VolumetricVideoBackground';
import { CameraSpotLight } from './CameraSpotLight';
import { CanvasDebugTracker, DebugMonitorHUD } from './DebugMonitor';
import { Preloader } from './Preloader';
import { HUD2D } from './HUD2D';
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
export const videoTextureCache = new Map();

function ensureVideoEntry(url, gl) {
  if (videoTextureCache.has(url)) return videoTextureCache.get(url);
  
  const video = document.createElement('video');
  video.src = url;
  video.crossOrigin = 'anonymous';
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  
  const maxAniso = gl.capabilities?.getMaxAnisotropy ? Math.min(gl.capabilities.getMaxAnisotropy(), 16) : 1;

  // Jediná společná VideoTexture pro dané video (pro válec, desku i vnitřek)
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = gl.outputColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = maxAniso;

  const entry = { video, texture, isActive: false };
  videoTextureCache.set(url, entry);

  // Připravíme první snímek jako poster pro neaktivní desky
  video.addEventListener('loadeddata', () => {
    if (!entry.isActive && video.currentTime < 0.05) {
      video.currentTime = 0.05;
    }
  }, { once: true });

  return entry;
}

function VideoManager({ allUrls, activeUrl, viewMode, isPreloaded = true, children }) {
  const gl = useThree(state => state.gl);
  const [, setTick] = useState(0);

  const urlsKey = allUrls.filter(Boolean).join('|');
  useMemo(() => {
    allUrls.forEach(rawUrl => {
      if (!rawUrl) return;
      const url = resolveAssetUrl(rawUrl);
      ensureVideoEntry(url, gl);
    });
  }, [urlsKey, gl]);

  // Posluchače pro aktualizaci textur, když se video načte nebo rozeběhne
  useEffect(() => {
    const triggerUpdate = () => setTick(t => t + 1);

    videoTextureCache.forEach((entry) => {
      entry.video.addEventListener('loadeddata', triggerUpdate);
      entry.video.addEventListener('canplay', triggerUpdate);
      entry.video.addEventListener('playing', triggerUpdate);
    });

    return () => {
      videoTextureCache.forEach((entry) => {
        entry.video.removeEventListener('loadeddata', triggerUpdate);
        entry.video.removeEventListener('canplay', triggerUpdate);
        entry.video.removeEventListener('playing', triggerUpdate);
      });
    };
  }, [urlsKey]);

  // Řízení přehrávání podle aktivního videa:
  // V ORBIT i INSIDE režimu hraje POUZE video aktivního projektu.
  // Neaktivní videa se pozastaví na svém snímku a nezatěžují hardware dekodér ani sběrnici GPU.
  // Přehrávání se spustí až po dokončení preloaderu (isPreloaded = true).
  useEffect(() => {
    if (!isPreloaded) return;

    const resolvedActive = activeUrl ? resolveAssetUrl(activeUrl) : null;

    videoTextureCache.forEach((entry, url) => {
      const isCurrentActive = url === resolvedActive;
      entry.isActive = isCurrentActive;

      if (isCurrentActive) {
        if (entry.video.paused) {
          entry.video.play().catch(() => {});
        }
      } else {
        if (!entry.video.paused) {
          entry.video.pause();
        }
      }
    });
  }, [viewMode, activeUrl, isPreloaded]);

  const textures = useMemo(() => {
    const texMap = {};
    videoTextureCache.forEach((entry, url) => {
      if (entry.video.readyState >= 2) {
        texMap[url] = entry.texture;
      }
    });
    return texMap;
  }, [urlsKey, viewMode, activeUrl]);

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
    return cl;
  }, [node]);

  const transforms = useMemo(() => {
    if (!node) return null;
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    node.getWorldPosition(wp);
    node.getWorldQuaternion(wq);
    node.getWorldScale(ws);
    return { worldPos: wp, worldQuat: wq, worldScale: ws };
  }, [node]);

  if (!node || !cloned || !transforms) return null;

  return (
    <group position={transforms.worldPos} quaternion={transforms.worldQuat} scale={transforms.worldScale}>
      <primitive object={cloned} />
    </group>
  );
}

function ProjectParticleNode({ node, nodeName, settings, appConfig, videoTexture, rotationY, pageDistance }) {
  const multiplier = (settings.nodeMultipliers && settings.nodeMultipliers[nodeName] !== undefined)
    ? Number(settings.nodeMultipliers[nodeName])
    : 1.0;

  const mouseMultiplier = (settings.nodeMouseMultipliers && settings.nodeMouseMultipliers[nodeName] !== undefined)
    ? Number(settings.nodeMouseMultipliers[nodeName])
    : 1.0;

  const transforms = useMemo(() => {
    if (!node) return null;
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    node.getWorldPosition(wp);
    node.getWorldQuaternion(wq);
    node.getWorldScale(ws);
    return {
      worldPos: wp,
      worldQuat: wq,
      scale: ws
    };
  }, [node]);

  const sphereSegments = useMemo(() => {
    if (settings.nodeQuality && settings.nodeQuality[nodeName] !== undefined) {
      const q = Number(settings.nodeQuality[nodeName]);
      const levels = [[4, 3], [5, 4], [6, 5], [8, 8]];
      return levels[q] || levels[1];
    }
    // Výchozí optimalizace: pozadí úsporněji
    if (nodeName.toLowerCase().includes('backround') || nodeName.toLowerCase().includes('background')) {
      return [4, 3];
    }
    return null;
  }, [settings.nodeQuality, nodeName]);

  const particleSettings = useMemo(() => ({
    ...settings,
    shape: 'geometry',
    customGeometry: node.geometry,
    sizeMultiplier: multiplier,
    mouseMultiplier: mouseMultiplier,
    ...(sphereSegments ? { sphereSegments } : {}),
    transform: {
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      scale: transforms ? transforms.scale : [1, 1, 1]
    }
  }), [settings, node.geometry, multiplier, mouseMultiplier, sphereSegments, transforms]);

  if (!transforms) return null;

  return (
    <group position={transforms.worldPos} quaternion={transforms.worldQuat}>
      <ParticleObject 
        settings={particleSettings}
        appConfig={appConfig} 
        videoTexture={videoTexture} 
        opacity={1}
        renderOrder={3}
        rotationY={rotationY}
        pageDistance={pageDistance}
      />
    </group>
  );
}

function ProjectContent({ page, appConfig, videoTexture, currentIndex, pageDistance, insideRotationY, rotationY }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');

  if (!page || !page.particlesSettings?.hasParticles) return null;

  const settings = page.particlesSettings;
  const selected = settings.selectedNodes || [];

  const innerContent = (
    <>
      {selected.length > 0 ? selected.map(nodeName => {
        const node = nodes[nodeName];
        if (!node) return null;

        if (isSolidNode(nodeName)) {
          return <SolidObject key={nodeName} node={node} />;
        }

        return (
          <ProjectParticleNode
            key={nodeName}
            node={node}
            nodeName={nodeName}
            settings={settings}
            appConfig={appConfig}
            videoTexture={videoTexture}
            rotationY={rotationY}
            pageDistance={pageDistance}
          />
        );
      }) : (
        <group>
          <ParticleObject 
            settings={settings}
            appConfig={appConfig} 
            videoTexture={videoTexture} 
            opacity={1}
            renderOrder={3}
            rotationY={rotationY}
            pageDistance={pageDistance}
          />
        </group>
      )}
    </>
  );

  if (currentIndex !== undefined && pageDistance !== undefined && insideRotationY) {
    return (
      <group rotation-y={currentIndex * -pageDistance}>
        <a.group rotation-y={insideRotationY}>
          {innerContent}
        </a.group>
      </group>
    );
  }

  return innerContent;
}

// Společný pivot pro objekty, částice i televizi rotující kolem bodu 0 v reakci na myš VŽDY RELEVANTNĚ K AKTUÁLNÍ KAMERĚ
function InsideProjectPivot({ 
  children, 
  viewMode, 
  currentIndex, 
  pageDistance, 
  insideRotationY,
  yStep 
}) {
  const pivotRef = useRef();
  const smoothMouse = useRef(new THREE.Vector2(0, 0));

  // Reusable pomocné objekty (žádný garbage collection za běhu)
  const camQuat = useRef(new THREE.Quaternion());
  const camRight = useRef(new THREE.Vector3());
  const camUp = useRef(new THREE.Vector3());
  const qH = useRef(new THREE.Quaternion());
  const qV = useRef(new THREE.Quaternion());
  const qGyro = useRef(new THREE.Quaternion());

  useFrame((state, delta) => {
    if (!pivotRef.current) return;
    const safeDelta = Math.min(Math.max(delta, 0), 0.1);
    const isInside = viewMode === 'INSIDE';

    // Plynulé sledování myši
    const targetX = isInside ? state.pointer.x : 0;
    const targetY = isInside ? state.pointer.y : 0;
    smoothMouse.current.x = THREE.MathUtils.damp(smoothMouse.current.x, targetX, 5.0, safeDelta);
    smoothMouse.current.y = THREE.MathUtils.damp(smoothMouse.current.y, targetY, 5.0, safeDelta);

    // Získání aktuální orientace a os kamery ve světovém prostoru
    state.camera.getWorldQuaternion(camQuat.current);
    // Vektor doprava ve výhledu kamery (horizontální osa obrazovky ve světě)
    camRight.current.set(1, 0, 0).applyQuaternion(camQuat.current).normalize();
    // Vektor nahoru ve výhledu kamery (vertikální osa obrazovky ve světě)
    camUp.current.set(0, 1, 0).applyQuaternion(camQuat.current).normalize();

    // Úhly rotace relevantní k aktuální kameře
    const mouseRotY = smoothMouse.current.x * 0.14;
    const mouseRotX = -smoothMouse.current.y * 0.09;

    // Rotace striktně podél os pohledu aktuální kamery:
    // Pohyb myši doprava/doleva otáčí scénu kolem svislé osy kamery (camUp)
    qH.current.setFromAxisAngle(camUp.current, mouseRotY);
    // Pohyb myši nahoru/dolů naklápí scénu kolem vodorovné osy kamery (camRight)
    qV.current.setFromAxisAngle(camRight.current, mouseRotX);

    // Výsledná světová rotace pivotu relevantní k aktuální kameře
    qGyro.current.copy(qV.current).multiply(qH.current);
    pivotRef.current.quaternion.copy(qGyro.current);
  });

  return (
    <group ref={pivotRef}>
      <group rotation-y={currentIndex * -pageDistance} position-y={currentIndex * -yStep}>
        <a.group rotation-y={insideRotationY}>
          {children}
        </a.group>
      </group>
    </group>
  );
}

export function GlobalBackground({ appConfig, videoTexture, visible, rotationY, pageDistance }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');
  const groupRef = useRef();
  const prevRot = useRef(rotationY.get());
  const smoothTilt = useRef(0);
  const cylMouse = useRef(new THREE.Vector2(0, 0));
  
  const { scatter } = useSpring({
    scatter: visible ? 0 : 1,
    config: visible 
      ? { mass: 1, tension: 120, friction: 30 } 
      : { mass: 15, tension: 10, friction: 60 } 
  });

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const safeDelta = Math.min(Math.max(delta, 0), 0.1);

    // 1. Výpočet rychlosti rotace karuselu pro jemné naklopení (banking)
    const currentRot = rotationY.get();
    const rotDelta = (currentRot - prevRot.current);
    prevRot.current = currentRot;
    const rotVel = rotDelta / Math.max(safeDelta, 0.001);

    const targetTilt = THREE.MathUtils.clamp(rotVel * 0.02, -0.05, 0.05);
    smoothTilt.current = THREE.MathUtils.damp(smoothTilt.current, targetTilt, 4, safeDelta);

    // 2. Velmi jemná reakce na myš (snížená, diskrétní)
    cylMouse.current.x = THREE.MathUtils.damp(cylMouse.current.x, state.pointer.x, 2.5, safeDelta);
    cylMouse.current.y = THREE.MathUtils.damp(cylMouse.current.y, state.pointer.y, 2.5, safeDelta);

    groupRef.current.rotation.z = smoothTilt.current - cylMouse.current.x * 0.012;
    groupRef.current.rotation.x = cylMouse.current.y * 0.012;
  });

  if (!nodes.dna) return null;

  const dnaPos = nodes.dna.getWorldPosition(new THREE.Vector3());
  const dnaRot = nodes.dna.getWorldQuaternion(new THREE.Quaternion());
  const dnaScale = nodes.dna.getWorldScale(new THREE.Vector3());
  
  return (
    <group ref={groupRef}>
      <group position={dnaPos} quaternion={dnaRot}>
        <ParticleObject 
          settings={{ 
            count: 10000, 
            hasParticles: appConfig.cylinderSettings?.hasParticles ?? true,
            baseColor: appConfig.cylinderSettings?.baseColor || '#3b82f6',
            colorMode: appConfig.cylinderSettings?.colorMode || 'video',
            refractionDistortion: appConfig.cylinderSettings?.refractionDistortion ?? 0.15,
            transitionMaxLight: appConfig.cylinderSettings?.transitionMaxLight ?? 0.8,
            transitionMinDark: appConfig.cylinderSettings?.transitionMinDark ?? 0.05,
            ...appConfig.cylinderSettings,
            shape: 'geometry', 
            customGeometry: nodes.dna.geometry,
            transform: {
              position: new THREE.Vector3(0,0,0),
              quaternion: new THREE.Quaternion(),
              scale: dnaScale
            },
            scatterSpring: scatter,
            isCylinder: true
          }}
          appConfig={appConfig} 
          videoTexture={videoTexture} 
          opacity={1}
          rotationY={rotationY}
          pageDistance={pageDistance}
        />
      </group>
    </group>
  );
}

function BlenderScene({ visible, onSelect, appConfig, pagesData, textures, yStep }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');

  const { fade } = useSpring({
    fade: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  const totalPages = Math.max(pagesData.length, 1);
  const pageDistance = (Math.PI * 2) / totalPages;

  let baseDeskNode = nodes.GlassDesk || nodes['GlassDesk-Xelith'];
  if (!baseDeskNode) {
    const glassKey = Object.keys(nodes).find(k => k.startsWith('GlassDesk'));
    if (glassKey) baseDeskNode = nodes[glassKey];
  }

  // Rotace UV o 180° přímo na geometrii - eliminuje potřebu duplicitní VideoTexture pro desky
  const deskGeometry = useMemo(() => {
    if (!baseDeskNode?.geometry) return null;
    const geom = baseDeskNode.geometry.clone();
    const uv = geom.attributes.uv;
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, 1 - uv.getX(i), 1 - uv.getY(i));
      }
      uv.needsUpdate = true;
    }
    return geom;
  }, [baseDeskNode]);

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
        // Společný zdroj textury pro vnitřní i vnější režim
        const currentDeskTex = resolvedUrl ? (videoTextureCache.get(resolvedUrl)?.texture || textures[resolvedUrl]) : null;

        return (
          <group 
            key={page.id}
            rotation-y={idx * -pageDistance}
            position-y={idx * -yStep}
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
              geometry={deskGeometry || baseDeskNode.geometry} renderOrder={2} 
            >
              {currentDeskTex ? (
                <a.meshBasicMaterial 
                  map={currentDeskTex} 
                  toneMapped={false} 
                  transparent={true} 
                  depthWrite={true}
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
function CameraRig({ viewMode, rotationY, springScrollY, currentIndex, appConfig }) {
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

  const gyroMouse = useRef(new THREE.Vector2(0, 0));

  // Vypočítáme výsledné FOV a lehký gyroskop v každém snímku
  useFrame((state, delta) => {
    const safeDelta = Math.min(Math.max(delta, 0), 0.1);

    // Jemný, plynule vyhlazený gyroskop kamery na myš (subtilní, nezasahuje do posunu částic)
    gyroMouse.current.x = THREE.MathUtils.damp(gyroMouse.current.x, state.pointer.x, 6.0, safeDelta);
    gyroMouse.current.y = THREE.MathUtils.damp(gyroMouse.current.y, state.pointer.y, 6.0, safeDelta);

    if (cameraRef.current) {
      const isInside = viewMode === 'INSIDE';
      const gyroRotY = isInside ? (gyroMouse.current.x * 0.035) : (-gyroMouse.current.x * 0.008);
      const gyroRotX = isInside ? (-gyroMouse.current.y * 0.025) : (gyroMouse.current.y * 0.005);
      const gyroPosX = gyroMouse.current.x * (isInside ? 0.08 : 0.015);
      const gyroPosY = gyroMouse.current.y * (isInside ? 0.05 : 0.01);

      cameraRef.current.position.set(gyroPosX, gyroPosY, 0);
      cameraRef.current.rotation.set(gyroRotX, gyroRotY, 0);

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
    <a.group position-y={springScrollY}>
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

function RenderRestorationHandler({ isSuspended }) {
  const { clock, invalidate } = useThree();
  const wasSuspendedRef = useRef(false);

  useEffect(() => {
    if (wasSuspendedRef.current && !isSuspended) {
      if (clock.running) {
        clock.oldTime = (typeof performance === 'undefined' ? Date : performance).now();
      }
      invalidate();
    }
    wasSuspendedRef.current = isSuspended;
  }, [isSuspended, clock, invalidate]);

  return null;
}

function App() {
  const [pagesData, setPagesData] = useState(settings.pages || []);
  const [appConfig, setAppConfig] = useState(config || {});
  
  const pauseOnBlur = appConfig.powerSaving?.pauseOnBlur ?? true;
  const [isSuspended, setIsSuspended] = useState(false);
  
  const allVideoUrls = useMemo(() => {
    return [...new Set(pagesData.map(p => p.videoUrl || p?.particlesSettings?.videoUrl).filter(Boolean))];
  }, [pagesData]);
  
  const [closestIndex, setClosestIndex] = useState(0);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const currentRotRef = useRef(0);
  const [viewMode, setViewMode] = useState('ORBIT'); 

  const totalPages = Math.max(pagesData.length, 1);
  const pageDistance = (Math.PI * 2) / totalPages;
  const yStep = appConfig.verticalStep || 10;
  
  const [isEditorOpen, setIsEditorOpen] = useState(() => {
    return window.location.search.includes('editor=true');
  });

  const wheelAccumulatorRef = useRef(0);
  const wheelTimeoutRef = useRef(null);

  // Sledování fokusu okna a úsporný režim
  useEffect(() => {
    if (!pauseOnBlur) {
      setIsSuspended(false);
      return;
    }

    let blurTimeout = null;

    const handleBlur = () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      blurTimeout = setTimeout(() => {
        if (!document.hasFocus() || document.hidden) {
          setIsSuspended(true);
        }
      }, 150);
    };

    const handleFocus = () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      setIsSuspended(false);
      wheelAccumulatorRef.current = 0;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleBlur();
      } else if (document.hasFocus()) {
        handleFocus();
      }
    };

    const handleWakeup = () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      setIsSuspended(false);
      wheelAccumulatorRef.current = 0;
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pointerdown', handleWakeup);
    window.addEventListener('keydown', handleWakeup);

    return () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointerdown', handleWakeup);
      window.removeEventListener('keydown', handleWakeup);
    };
  }, [pauseOnBlur]);

  // Pozastavení a probuzení dekódování videí pro nulovou zátěž GPU a video dekodéru
  useEffect(() => {
    if (isSuspended) {
      videoTextureCache.forEach(entry => {
        if (entry.video && !entry.video.paused) {
          entry.video.pause();
        }
      });
    } else {
      const activeRawUrl = pagesData[closestIndex]?.videoUrl || pagesData[closestIndex]?.particlesSettings?.videoUrl;
      const resolvedActive = activeRawUrl ? resolveAssetUrl(activeRawUrl) : null;
      videoTextureCache.forEach((entry, url) => {
        if (entry.video && entry.video.paused) {
          if (url === resolvedActive) {
            entry.isActive = true;
            entry.video.play().catch(() => {});
          } else {
            entry.isActive = false;
          }
        }
      });
    }
  }, [isSuspended, closestIndex, pagesData]);

  const [{ rotationY }, api] = useSpring(() => ({
    rotationY: 0,
    config: { 
      mass: appConfig.physics?.mass ?? 1, 
      tension: appConfig.physics?.tension ?? 170, 
      friction: appConfig.physics?.friction ?? 26 
    }
  }));

  const springScrollY = rotationY.to(r => (r / -pageDistance) * -yStep);

  const insideRotRef = useRef(0);
  const [{ insideRotationY }, insideApi] = useSpring(() => ({
    insideRotationY: 0,
    config: { 
      mass: appConfig.physics?.mass ?? 1, 
      tension: appConfig.physics?.tension ?? 170, 
      friction: appConfig.physics?.friction ?? 26 
    }
  }));

  useEffect(() => {
    if (viewMode === 'ORBIT') {
      insideRotRef.current = 0;
      insideApi.start({ insideRotationY: 0, immediate: true });
    }
  }, [viewMode, insideApi]);

  const bindDrag = useDrag(({ active, movement: [mx], delta: [dx], velocity: [vx] }) => {
    if (viewMode === 'INSIDE') {
      const sensitivity = ((Math.PI * 2) / (window.innerWidth / 1.5)) * (appConfig.scrollSpeed || 1.0);
      if (active) {
        insideRotRef.current += dx * sensitivity;
        insideApi.start({ insideRotationY: insideRotRef.current, immediate: true });
      } else {
        insideRotRef.current += (dx * sensitivity) + (vx * 20 * Math.sign(dx) * (appConfig.scrollSpeed || 1.0));
        insideApi.start({ insideRotationY: insideRotRef.current, immediate: false });
      }
      return;
    }

    if (totalPages <= 1) return;
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
    if (viewMode === 'INSIDE') {
      // Rotace objektu uvnitř portfolia při scrollu
      insideRotRef.current -= dy * 0.005 * (appConfig.scrollSpeed || 1.0);
      insideApi.start({ insideRotationY: insideRotRef.current, immediate: false });
      return;
    }

    if (totalPages <= 1) return;
    
    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => {
      wheelAccumulatorRef.current = 0;
    }, 250);

    const stepsPerPortfolio = appConfig.scrollStepsPerPortfolio || 5;
    const stepAngle = pageDistance / stepsPerPortfolio;
    const threshold = 60 / (appConfig.scrollSpeed || 1.0);

    wheelAccumulatorRef.current += dy;

    if (Math.abs(wheelAccumulatorRef.current) >= threshold) {
      const stepCount = Math.floor(Math.abs(wheelAccumulatorRef.current) / threshold);
      const direction = Math.sign(wheelAccumulatorRef.current);
      wheelAccumulatorRef.current -= direction * stepCount * threshold;

      const currentStep = currentRotRef.current / -stepAngle;
      let targetStep;
      if (direction > 0) {
        targetStep = Math.floor(currentStep + 1e-4) + stepCount;
      } else {
        targetStep = Math.ceil(currentStep - 1e-4) - stepCount;
      }

      currentRotRef.current = targetStep * -stepAngle;
      api.start({ rotationY: currentRotRef.current, immediate: false });
    }
  });

  return (
    <div className="app-container" {...bindWheel()}>
      <div className="canvas-container" {...bindDrag()}>
        <Canvas 
          shadows 
          frameloop={isSuspended ? 'never' : 'always'}
          gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
        >
          <RenderRestorationHandler isSuspended={isSuspended} />
          <CanvasDebugTracker />
          <DarkStudioBackground appConfig={appConfig} />
          <Environment preset="city" environmentIntensity={appConfig.environmentIntensity ?? 0.8} />
          <CenterLight appConfig={appConfig} />
          <spotLight 
            position={[0, 15, 0]} 
            intensity={(appConfig.hdriIntensity ?? 1) * 3} 
            penumbra={1} 
            angle={0.8} 
            color="#ffffff" 
          />
          <ambientLight intensity={0.2} />
          <CameraSpotLight appConfig={appConfig} />
          
          <RotationController rotationY={rotationY} pageDistance={pageDistance} totalPages={totalPages} setClosestIndex={setClosestIndex} />
          
          <VideoManager 
            allUrls={allVideoUrls}
            activeUrl={pagesData[closestIndex]?.videoUrl || pagesData[closestIndex]?.particlesSettings?.videoUrl}
            viewMode={viewMode}
            isPreloaded={isPreloaded}
          >
            {(textures) => {
              const activeRawUrl = pagesData[closestIndex]?.videoUrl || pagesData[closestIndex]?.particlesSettings?.videoUrl;
              const resolvedActiveUrl = activeRawUrl ? resolveAssetUrl(activeRawUrl) : '';
              const activeVideoTex = resolvedActiveUrl ? (videoTextureCache.get(resolvedActiveUrl)?.texture || textures[resolvedActiveUrl] || null) : null;
              
              return (
              <>
                <GlobalBackground appConfig={appConfig} videoTexture={activeVideoTex} visible={viewMode === 'ORBIT'} rotationY={rotationY} pageDistance={pageDistance} />
                <BlenderScene 
                  appConfig={appConfig} 
                  pagesData={pagesData}
                  visible={viewMode === 'ORBIT'} 
                  textures={textures}
                  yStep={yStep}
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
                <VolumetricVideoBackground 
                  appConfig={appConfig}
                  videoTexture={activeVideoTex}
                  visible={viewMode === 'INSIDE'}
                  currentIndex={closestIndex}
                  pageDistance={pageDistance}
                  yStep={yStep}
                />
                <InsideProjectPivot
                  viewMode={viewMode}
                  currentIndex={closestIndex}
                  pageDistance={pageDistance}
                  insideRotationY={insideRotationY}
                  yStep={yStep}
                >
                  {viewMode === 'INSIDE' && (
                    <ProjectContent 
                      page={pagesData[closestIndex]} 
                      appConfig={appConfig} 
                      videoTexture={activeVideoTex} 
                      rotationY={rotationY}
                      pageDistance={pageDistance}
                    />
                  )}
                </InsideProjectPivot>
                <VolumetricLightPass 
                  appConfig={appConfig} 
                  viewMode={viewMode} 
                  videoTexture={activeVideoTex} 
                />
              </>
            )}}
          </VideoManager>

          <CameraRig 
            appConfig={appConfig} 
            rotationY={rotationY} 
            springScrollY={springScrollY}
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

      {isSuspended && (appConfig.powerSaving?.showBadge ?? true) && (
        <div 
          className="eco-mode-badge"
          onClick={() => setIsSuspended(false)}
          title="Klikněte pro obnovení výpočtů"
        >
          <span className="eco-dot"></span>
          <span>Úsporný režim (0 % GPU)</span>
        </div>
      )}

      <MusicPlayer 
        tracks={appConfig.musicTracks} 
        volume={appConfig.musicVolume ?? 0.4} 
        isSuspended={isSuspended && !!appConfig.powerSaving?.pauseAudioOnBlur}
      />

      <DebugMonitorHUD 
        videoTextureCache={videoTextureCache}
        viewMode={viewMode}
        activeUrl={pagesData[closestIndex]?.videoUrl || pagesData[closestIndex]?.particlesSettings?.videoUrl}
        activeTitle={pagesData[closestIndex]?.title}
      />

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

      <HUD2D appConfig={appConfig} viewMode={viewMode} />

      <Preloader 
        activeVideoUrl={pagesData[closestIndex]?.videoUrl || pagesData[closestIndex]?.particlesSettings?.videoUrl} 
        onLoaded={() => setIsPreloaded(true)} 
      />
    </div>
  );
}

export default App;
