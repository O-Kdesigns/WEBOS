import React, { useState, useRef, Suspense, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box, Text, Environment, useGLTF, PerspectiveCamera } from '@react-three/drei';
import { a, useSpring, useTransition } from '@react-spring/three';
import { motion as motionDom, AnimatePresence } from 'framer-motion';
import { useDrag, useWheel } from '@use-gesture/react';
import * as THREE from 'three';
import settings from './settings.json';
import config from './config.json';
import { Editor } from './components/Editor/Editor';
import { ParticleObject } from './components/particles/ParticleObject';
import { MusicPlayer } from './MusicPlayer';
import { VolumetricLightPass, CenterLight } from './VolumetricLight';
import { AtmosphereDust } from './AtmosphereDust';
import { TvGlass, useTvGlass } from './TvGlass';
import { SolidPrintDriver, usePrintableSolid } from './SolidPrint';
import { SolidLinkDriver } from './SolidLink';
import { PortalDriver, portalFx } from './PortalTransition';
import { useAiLive, useAiLiveTicker } from './AiLiveMode';
import { DarkStudioBackground } from './DarkStudioBackground';
import { VolumetricVideoBackground } from './VolumetricVideoBackground';
import { CameraSpotLight } from './CameraSpotLight';
import { CanvasDebugTracker, DebugMonitorHUD } from './DebugMonitor';
import { Preloader } from './Preloader';
import { HUD2D } from './HUD2D';
import './App.css';
import { resolveAssetUrl, withBase } from './assetUrl';


// Malé smyčkové video, které se přehraje všude, kde se produkční video nenačte (např. GitHub Pages)
export const VIDEO_FALLBACK_URL = withBase('/placeholder.mp4');

// --- Video Texture Cache (module-level, persists across renders) ---
export const videoTextureCache = new Map();

function ensureVideoEntry(url, gl) {
  if (videoTextureCache.has(url)) return videoTextureCache.get(url);
  
  const video = document.createElement('video');
  video.src = url;
  // Fallback: produkční videa nejsou v gitu (GitHub Pages je nemá) -> při chybě
  // načtení přepneme na malé placeholder video z public/. Cache klíč zůstává původní URL.
  const onVideoError = () => {
    if (video.src.endsWith(VIDEO_FALLBACK_URL)) return;
    console.warn(`[VideoManager] Video nenalezeno, použit placeholder: ${url}`);
    video.src = VIDEO_FALLBACK_URL;
    video.load();
  };
  video.addEventListener('error', onVideoError);
  video.crossOrigin = 'anonymous';
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  
  const maxAniso = gl.capabilities?.getMaxAnisotropy ? Math.min(gl.capabilities.getMaxAnisotropy(), 16) : 1;

  // JedinĂˇ spoleÄŤnĂˇ VideoTexture pro danĂ© video (pro vĂˇlec, desku i vnitĹ™ek)
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = gl.outputColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = maxAniso;

  const entry = { video, texture, isActive: false };
  videoTextureCache.set(url, entry);

  // PĹ™ipravĂ­me prvnĂ­ snĂ­mek jako poster pro neaktivnĂ­ desky
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

  // PosluchaÄŤe pro aktualizaci textur, kdyĹľ se video naÄŤte nebo rozebÄ›hne
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

  // ĹĂ­zenĂ­ pĹ™ehrĂˇvĂˇnĂ­ podle aktivnĂ­ho videa:
  // V ORBIT i INSIDE reĹľimu hraje POUZE video aktivnĂ­ho projektu.
  // NeaktivnĂ­ videa se pozastavĂ­ na svĂ©m snĂ­mku a nezatÄ›ĹľujĂ­ hardware dekodĂ©r ani sbÄ›rnici GPU.
  // PĹ™ehrĂˇvĂˇnĂ­ se spustĂ­ aĹľ po dokonÄŤenĂ­ preloaderu (isPreloaded = true).
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
          <group key={page.id} rotation-y={i * pageDistance}>
            <group position-z={radius}>
              {/* ZĂˇstupnĂˇ ÄŤernĂˇ deska */}
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

  // 3D tisk: vlastní materiály s řezem + žárem (SolidPrint.jsx)
  usePrintableSolid(cloned);

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

// Obsah k solidu: particle node "X0", když je vybraný i solid "X1" -> particly do tvaru vytahuje 3D tisk (emerge).
function hasSolidPair(nodeName, selected) {
  if (!nodeName.endsWith('0')) return false;
  const solid = nodeName.slice(0, -1) + '1';
  return selected.includes(solid) && isSolidNode(solid);
}

// stejná sada solidů = stejné pole (jinak by se nastavení particlů měnilo každý render)
const solidListCache = new Map();
function stableSolidList(list) {
  const key = list.map(n => n.uuid).join('|');
  if (!solidListCache.has(key)) solidListCache.set(key, list);
  return solidListCache.get(key);
}

function ProjectParticleNode({ node, nodeName, settings, appConfig, videoTexture, rotationY, pageDistance, transitionProgress, dnaGeometry, dnaMatrix, nodeMatrix, currentIndex, emerge = false, collisionSolids }) {
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
    // VĂ˝chozĂ­ optimalizace: pozadĂ­ ĂşspornÄ›ji
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
    emerge,
    collisionSolids,
    ...(sphereSegments ? { sphereSegments } : {}),
    transform: {
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      scale: transforms ? transforms.scale : [1, 1, 1]
    }
  }), [settings, node.geometry, multiplier, mouseMultiplier, sphereSegments, transforms, emerge, collisionSolids]);

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
          transitionProgress={transitionProgress}
          dnaGeometry={dnaGeometry}
          dnaMatrix={dnaMatrix}
          nodeMatrix={nodeMatrix}
        />
    </group>
  );
}

const DNA_ONLY_SETTINGS = { hasParticles: true, dnaOnly: true, colorMode: 'video', sizeRandomness: 0.5, selectedNodes: [] };

function ProjectContent({ viewMode, page, appConfig, videoTexture, currentIndex, pageDistance, insideRotationY, rotationY, transitionProgress }) {
  const { nodes } = useGLTF(withBase('/obsah/everything/newworldorder.glb'));

  if (!page) return null;

  // In ORBIT the DNA is built from the active project's particles (single particle system).
  // A page without its own particles still needs the DNA -> render the DNA node itself, frozen in DNA state.
  if (!page.particlesSettings?.hasParticles) {
    if (!nodes.dna) return null;
    return (
      <ProjectParticleNode
        node={nodes.dna}
        nodeName="dna"
        settings={DNA_ONLY_SETTINGS}
        appConfig={appConfig}
        videoTexture={videoTexture}
        rotationY={rotationY}
        pageDistance={pageDistance}
        transitionProgress={0}
        dnaGeometry={nodes.dna.geometry}
        dnaMatrix={nodes.dna.matrixWorld}
      />
    );
  }

  const settings = page.particlesSettings;
  const selected = settings.selectedNodes || [];
  // kolize particlů se solidy stránky (SDF, components/particles/SolidCollision.js)
  const collisionSolids = stableSolidList(selected.filter(isSolidNode).map(n => nodes[n]).filter(Boolean));

  const innerContent = (
    <>
      {/* světelná vazba particly <-> solidy + vzhled solidů (SolidLink.jsx), stejný rodič = stejný prostor */}
      <SolidLinkDriver nodes={nodes} settings={settings} videoTexture={videoTexture} transitionProgress={transitionProgress} isSolidNode={isSolidNode} />
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
              transitionProgress={transitionProgress}
              dnaGeometry={nodes.dna?.geometry}
              dnaMatrix={nodes.dna?.matrixWorld}
              nodeMatrix={node.matrixWorld}
              emerge={hasSolidPair(nodeName, selected)}
              collisionSolids={collisionSolids}
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
            transitionProgress={transitionProgress}
            dnaGeometry={nodes.dna?.geometry}
          />
        </group>
      )}
    </>
  );

  if (currentIndex !== undefined && pageDistance !== undefined && insideRotationY) {
    return (
      <group rotation-y={currentIndex * pageDistance}>
        <a.group rotation-y={insideRotationY}>
          {innerContent}
        </a.group>
      </group>
    );
  }

  return innerContent;
}

// SpoleÄŤnĂ˝ pivot pro objekty, ÄŤĂˇstice i televizi rotujĂ­cĂ­ kolem bodu 0 v reakci na myĹˇ VĹ˝DY RELEVANTNÄš K AKTUĂLNĂŤ KAMERÄš
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

  // Reusable pomocnĂ© objekty (ĹľĂˇdnĂ˝ garbage collection za bÄ›hu)
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

    // PlynulĂ© sledovĂˇnĂ­ myĹˇi
    const targetX = isInside ? state.pointer.x : 0;
    const targetY = isInside ? state.pointer.y : 0;
    smoothMouse.current.x = THREE.MathUtils.damp(smoothMouse.current.x, targetX, 5.0, safeDelta);
    smoothMouse.current.y = THREE.MathUtils.damp(smoothMouse.current.y, targetY, 5.0, safeDelta);

    // ZĂ­skĂˇnĂ­ aktuĂˇlnĂ­ orientace a os kamery ve svÄ›tovĂ©m prostoru
    state.camera.getWorldQuaternion(camQuat.current);
    // Vektor doprava ve vĂ˝hledu kamery (horizontĂˇlnĂ­ osa obrazovky ve svÄ›tÄ›)
    camRight.current.set(1, 0, 0).applyQuaternion(camQuat.current).normalize();
    // Vektor nahoru ve vĂ˝hledu kamery (vertikĂˇlnĂ­ osa obrazovky ve svÄ›tÄ›)
    camUp.current.set(0, 1, 0).applyQuaternion(camQuat.current).normalize();

    // Ăšhly rotace relevantnĂ­ k aktuĂˇlnĂ­ kameĹ™e
    const mouseRotY = smoothMouse.current.x * 0.14;
    const mouseRotX = -smoothMouse.current.y * 0.09;

    // Rotace striktnÄ› podĂ©l os pohledu aktuĂˇlnĂ­ kamery:
    // Pohyb myĹˇi doprava/doleva otĂˇÄŤĂ­ scĂ©nu kolem svislĂ© osy kamery (camUp)
    qH.current.setFromAxisAngle(camUp.current, mouseRotY);
    // Pohyb myĹˇi nahoru/dolĹŻ naklĂˇpĂ­ scĂ©nu kolem vodorovnĂ© osy kamery (camRight)
    qV.current.setFromAxisAngle(camRight.current, mouseRotX);

    // VĂ˝slednĂˇ svÄ›tovĂˇ rotace pivotu relevantnĂ­ k aktuĂˇlnĂ­ kameĹ™e
    qGyro.current.copy(qV.current).multiply(qH.current);
    pivotRef.current.quaternion.copy(qGyro.current);
  });

  return (
    <group ref={pivotRef}>
      <group rotation-y={currentIndex * pageDistance} position-y={currentIndex * -yStep}>
        <a.group rotation-y={insideRotationY}>
          {children}
        </a.group>
      </group>
    </group>
  );
}

export function GlobalBackground({ appConfig, videoTexture, visible, rotationY, pageDistance }) {
  const { nodes } = useGLTF(withBase('/obsah/everything/newworldorder.glb'));
  const groupRef = useRef();
  const prevRot = useRef(rotationY.get());
  const smoothTilt = useRef(0);
  const cylMouse = useRef(new THREE.Vector2(0, 0));
  
  const { scatter, dnaOpacity } = useSpring({
    scatter: visible ? 0 : 1,
      dnaOpacity: visible ? 1 : 0,
    config: visible 
      ? { mass: 1, tension: 120, friction: 30 } 
      : { mass: 15, tension: 10, friction: 60 } 
  });

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const safeDelta = Math.min(Math.max(delta, 0), 0.1);

    // 1. VĂ˝poÄŤet rychlosti rotace karuselu pro jemnĂ© naklopenĂ­ (banking)
    const currentRot = rotationY.get();
    const rotDelta = (currentRot - prevRot.current);
    prevRot.current = currentRot;
    const rotVel = rotDelta / Math.max(safeDelta, 0.001);

    const targetTilt = THREE.MathUtils.clamp(rotVel * 0.02, -0.05, 0.05);
    smoothTilt.current = THREE.MathUtils.damp(smoothTilt.current, targetTilt, 4, safeDelta);

    // 2. Velmi jemnĂˇ reakce na myĹˇ (snĂ­ĹľenĂˇ, diskrĂ©tnĂ­)
    cylMouse.current.x = THREE.MathUtils.damp(cylMouse.current.x, state.pointer.x, 2.5, safeDelta);
    cylMouse.current.y = THREE.MathUtils.damp(cylMouse.current.y, state.pointer.y, 2.5, safeDelta);

    // Rotace zrusena
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
            hasParticles: appConfig.dnaSettings?.hasParticles ?? true,
            baseColor: appConfig.dnaSettings?.baseColor || '#3b82f6',
            colorMode: appConfig.dnaSettings?.colorMode || 'video',
            refractionDistortion: appConfig.dnaSettings?.refractionDistortion ?? 0.15,
            transitionMaxLight: appConfig.dnaSettings?.transitionMaxLight ?? 0.8,
            transitionMinDark: appConfig.dnaSettings?.transitionMinDark ?? 0.05,
            ...appConfig.dnaSettings,
            shape: 'geometry', 
            customGeometry: nodes.dna.geometry,
            transform: {
              position: new THREE.Vector3(0,0,0),
              quaternion: new THREE.Quaternion(),
              scale: dnaScale
            },
            scatterSpring: scatter,
            isDNA: true
          }}
          appConfig={appConfig} 
          videoTexture={videoTexture} 
          opacity={dnaOpacity}
          rotationY={rotationY}
          pageDistance={pageDistance}
        />
      </group>
    </group>
  );
}

function BlenderScene({ visible, onSelect, appConfig, pagesData, textures, yStep, pageDistance, activeIndex }) {
  const { nodes } = useGLTF(withBase('/obsah/everything/newworldorder.glb'));

  const { fade } = useSpring({
    fade: visible ? 1 : 0,
    config: { duration: 1000 }
  });

  // průlet portálem: aktivní deska vyjede ven ke kameře (a za ni), ostatní zmizí s fade
  const rootRef = useRef();
  const pushRef = useRef();
  const outward = useRef(new THREE.Vector3());
  useFrame(() => {
    if (rootRef.current) rootRef.current.visible = fade.get() > 0 || portalFx.progress < 1;
    if (pushRef.current) {
      const push = (appConfig.portal?.deskPush ?? 1.6) * portalFx.desk;
      pushRef.current.position.copy(outward.current).multiplyScalar(push);
    }
  });

  const totalPages = Math.max(pagesData.length, 1);


  let baseDeskNode = nodes.GlassDesk || nodes['GlassDesk-Xelith'];
  if (!baseDeskNode) {
    const glassKey = Object.keys(nodes).find(k => k.startsWith('GlassDesk'));
    if (glassKey) baseDeskNode = nodes[glassKey];
  }

  // skleněná televize (nody TV_* z Blenderu): sklo s lomem, video je portál uvnitř skla
  const tv = useTvGlass(nodes, baseDeskNode, fade);

  // Rotace UV o 180Â° pĹ™Ă­mo na geometrii - eliminuje potĹ™ebu duplicitnĂ­ VideoTexture pro desky
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

  useMemo(() => {
    if (!baseDeskNode) return;
    const p = baseDeskNode.getWorldPosition(new THREE.Vector3());
    outward.current.set(p.x, 0, p.z);
    if (outward.current.lengthSq() < 1e-8) outward.current.set(0, 0, 1);
    outward.current.normalize();
  }, [baseDeskNode]);

  return (
    <group ref={rootRef}>
      {/* SklenÄ›nĂ© desky pro projekty */}
      {pagesData.map((page, idx) => {
        if (!baseDeskNode) return null;
        const deskPos = baseDeskNode.getWorldPosition(new THREE.Vector3());
        const deskRot = baseDeskNode.getWorldQuaternion(new THREE.Quaternion());
        const deskScale = baseDeskNode.getWorldScale(new THREE.Vector3());
        
        const rawUrl = page.videoUrl || page.particlesSettings?.videoUrl;
        const resolvedUrl = rawUrl ? resolveAssetUrl(rawUrl) : null;
        // SpoleÄŤnĂ˝ zdroj textury pro vnitĹ™nĂ­ i vnÄ›jĹˇĂ­ reĹľim
        const currentDeskTex = resolvedUrl ? (videoTextureCache.get(resolvedUrl)?.texture || textures[resolvedUrl]) : null;

        return (
          <group 
            key={page.id}
            rotation-y={idx * pageDistance}
            position-y={idx * -yStep}
          >
            <group
              ref={idx === activeIndex ? pushRef : undefined}
              onClick={() => onSelect(idx)}
              onPointerOver={(e) => document.body.style.cursor = 'pointer'}
              onPointerOut={(e) => document.body.style.cursor = 'auto'}
            >
            {!tv.hasVideo && <a.mesh 
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
            </a.mesh>}
            <TvGlass tv={tv} videoTexture={currentDeskTex} active={idx === activeIndex} />
            </group>
          </group>
        )
      })}
    </group>
  );
}

const AnimatedCamera = a(PerspectiveCamera);

// --- KamerovĂ˝ Rig ---
function CameraRig({ viewMode, rotationY, springScrollY, currentIndex, appConfig }) {
  const { nodes } = useGLTF(withBase('/obsah/everything/newworldorder.glb'));
  const cameraRef = useRef();
  
  const camChoose = nodes.Camera_CHoose || nodes.Camera_Choose || nodes.Camera || nodes['Camera.001'];
  const camIn = nodes.Camera_In || nodes.Camera_IN;

  // NastavenĂ­ pro ORBIT (rotovĂˇnĂ­ kolem vĂˇlce)
  let orbitZ = appConfig.cameraRadius || 18;
  let orbitY = appConfig.cameraHeight ?? 1.5;
  let orbitFov = appConfig.cameraFov || 60;
  let orbitAngle = 0;
  
  if (camChoose) {
     const worldPos = camChoose.getWorldPosition(new THREE.Vector3());
     orbitZ = Math.sqrt(worldPos.x**2 + worldPos.z**2) || orbitZ;
     orbitY = appConfig.cameraHeight ?? (worldPos.y !== undefined ? worldPos.y : 1.5);
     orbitFov = appConfig.cameraFov || camChoose.fov || 60;
     orbitAngle = Math.atan2(worldPos.x, worldPos.z);
  }

  // NastavenĂ­ pro INSIDE (pohled na detail projektu)
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

  // ZajistĂ­me nejkratĹˇĂ­ cestu pro rotaci kamery
  let angleDiff = inAngle - orbitAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
  inAngle = orbitAngle + angleDiff;

  // Animujeme pouze pĹ™echod (0 aĹľ 1) mezi ORBIT a INSIDE pohledem
  const { springY, springBaseAngle } = useSpring({
    springY: viewMode === 'ORBIT' ? orbitY : orbitY, // ZĹŻstĂˇvĂˇ venku
    springBaseAngle: viewMode === 'ORBIT' ? orbitAngle : inAngle,
    config: { duration: 1000 }
  });

  // jízda kamery ORBIT -> Camera_In řídí průlet portálem (portalFx), ne vlastní pružina
  const dollyRef = useRef();
  const gyroMouse = useRef(new THREE.Vector2(0, 0));

  // VypoÄŤĂ­tĂˇme vĂ˝slednĂ© FOV a lehkĂ˝ gyroskop v kaĹľdĂ©m snĂ­mku
  useFrame((state, delta) => {
    const safeDelta = Math.min(Math.max(delta, 0), 0.1);

    // JemnĂ˝, plynule vyhlazenĂ˝ gyroskop kamery na myĹˇ (subtilnĂ­, nezasahuje do posunu ÄŤĂˇstic)
    gyroMouse.current.x = THREE.MathUtils.damp(gyroMouse.current.x, state.pointer.x, 6.0, safeDelta);
    gyroMouse.current.y = THREE.MathUtils.damp(gyroMouse.current.y, state.pointer.y, 6.0, safeDelta);

    if (dollyRef.current) dollyRef.current.position.z = THREE.MathUtils.lerp(orbitZ, inZ, portalFx.camera);

    if (cameraRef.current) {
      const isInside = viewMode === 'INSIDE';
      const gyroRotY = isInside ? (gyroMouse.current.x * 0.035) : (-gyroMouse.current.x * 0.008);
      const gyroRotX = isInside ? (-gyroMouse.current.y * 0.025) : (gyroMouse.current.y * 0.005);
      const gyroPosX = gyroMouse.current.x * (isInside ? 0.08 : 0.015);
      const gyroPosY = gyroMouse.current.y * (isInside ? 0.05 : 0.01);

      cameraRef.current.position.set(gyroPosX, gyroPosY, 0);
      cameraRef.current.rotation.set(gyroRotX, gyroRotY, 0);

      const currentAspect = state.size.width / state.size.height;
       
      // Interpolace zĂˇkladnĂ­ho FOV (napĹ™. mezi 60 a 45) podle toho, kde se nachĂˇzĂ­me v animaci
      // + krátké rozšíření FOV ve špičce rychlosti (pocit zrychlení při průletu sklem)
      const currentBaseFov = THREE.MathUtils.lerp(orbitFov, inFov, portalFx.camera) + portalFx.kick * (appConfig.portal?.fovKick ?? 14);
       
      // Matematika pro zachovĂˇnĂ­ ĹˇĂ­Ĺ™ky zobrazenĂ­
      const REFERENCE_ASPECT = 16 / 9; 
      const vFovRad = THREE.MathUtils.degToRad(currentBaseFov);
      const targetVFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * (REFERENCE_ASPECT / currentAspect));
      const finalFov = THREE.MathUtils.radToDeg(targetVFovRad);
       
      // Pokud se FOV liĹˇĂ­, aplikujeme ho okamĹľitÄ›
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
          <a.group ref={dollyRef} position-z={orbitZ} position-y={springY}>
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
    let idx = Math.round(val / pageDistance) % totalPages;
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


function DnaHeightDetector({ setDnaHeight360 }) {
  const { nodes } = useGLTF(withBase('/obsah/everything/newworldorder.glb'));
  useEffect(() => {
    const deskKeys = Object.keys(nodes).filter(k => k.startsWith('GlassDesk'));
    if (deskKeys.length >= 2) {
      const pos1 = nodes[deskKeys[0]].getWorldPosition(new THREE.Vector3());
      const pos2 = nodes[deskKeys[1]].getWorldPosition(new THREE.Vector3());
      const h = Math.abs(pos1.y - pos2.y);
      if (h > 0.1) {
        setDnaHeight360(h * 2);
      }
    }
  }, [nodes, setDnaHeight360]);
  return null;
}

function App() {
  const [pagesData, setPagesData] = useState(settings.pages || []);
  const [appConfig, setAppConfig] = useState(config || {});
  
  // AI živý render (src/AiLiveMode.js): nepauzuje při ztrátě fokusu a renderuje i v neaktivním tabu
  const [aiLive, setAiLive] = useAiLive();
  useAiLiveTicker(aiLive);
  const pauseOnBlur = !aiLive && (appConfig.powerSaving?.pauseOnBlur ?? true);

  const [isSuspended, setIsSuspended] = useState(false);
  
  const allVideoUrls = useMemo(() => {
    return [...new Set(pagesData.map(p => p.videoUrl || p?.particlesSettings?.videoUrl).filter(Boolean))];
  }, [pagesData]);
  
  const [closestIndex, setClosestIndex] = useState(0);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const currentRotRef = useRef(0);
  const [viewMode, setViewMode] = useState('ORBIT');
  // odchod z projektu: nejdřív odtisk solidů, až pak (onUnprinted) ORBIT = průlet portálem zpět
  const [leaving, setLeaving] = useState(false);
  const finishLeaving = useCallback(() => { setLeaving(false); setViewMode('ORBIT'); }, []);

  const [detectedDnaHeight360, setDetectedDnaHeight360] = useState(30);
  const dnaHeight360 = appConfig.dnaHeight360 || detectedDnaHeight360;

  const totalPages = Math.max(pagesData.length, 1);
  
  // UĹľivatelem nastavenĂˇ vĂ˝ĹˇkovĂˇ vzdĂˇlenost mezi projekty
  const yStep = appConfig.verticalStep || 10; 
  // KolikrĂˇt se tato vzdĂˇlenost vejde do jednĂ© 360Â° otoÄŤky DNA (kterĂˇ mĂˇ vĂ˝Ĺˇku dnaHeight360)
  const projectsPer360 = dnaHeight360 > 0 ? (dnaHeight360 / yStep) : 3;
  // ĂšhlovĂˇ vzdĂˇlenost (rotace), kterĂˇ pĹ™esnÄ› odpovĂ­dĂˇ posunu po vlĂˇknÄ› o yStep
  const pageDistance = (Math.PI * 2) / projectsPer360;
  const [isEditorOpen, setIsEditorOpen] = useState(() => {
    return window.location.search.includes('editor=true');
  });

  const wheelAccumulatorRef = useRef(0);
  const wheelTimeoutRef = useRef(null);

  // SledovĂˇnĂ­ fokusu okna a ĂşspornĂ˝ reĹľim
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

  // PozastavenĂ­ a probuzenĂ­ dekĂłdovĂˇnĂ­ videĂ­ pro nulovou zĂˇtÄ›Ĺľ GPU a video dekodĂ©ru
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

  const springScrollY = rotationY.to(r => (r / pageDistance) * -yStep);

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

  const { transitionProgress } = useSpring({
    transitionProgress: viewMode === 'INSIDE' ? 1 : 0,
    config: viewMode === 'ORBIT'
      ? { mass: 1, tension: 120, friction: 30 }
      : { mass: 2, tension: 150, friction: 40 }
  });

  const bindDrag = useDrag(({ active, movement: [mx], delta: [dx], velocity: [vx] }) => {
    if (viewMode === 'INSIDE') {
      const sensitivity = ((Math.PI * 2) / (window.innerWidth / 1.5)) * (appConfig.scrollSpeed || 1.0);
      if (active) {
        insideRotRef.current += dx * sensitivity;
        // tah přes pružinu (ne okamžitě) – solidy i particly se zpožďují stejně; 0 = hned za prstem
        const lag = appConfig.particlePhysics?.spinLag ?? 0.5;
        const tension = 40 + 560 * (1 - lag) * (1 - lag);
        insideApi.start({ insideRotationY: insideRotRef.current, immediate: lag <= 0, config: { mass: 1, tension, friction: 2 * Math.sqrt(tension) } });
      } else {
        insideRotRef.current += (dx * sensitivity) + (vx * 20 * Math.sign(dx) * (appConfig.scrollSpeed || 1.0));
        insideApi.start({ insideRotationY: insideRotRef.current, immediate: false, config: { mass: appConfig.physics?.mass ?? 1, tension: appConfig.physics?.tension ?? 170, friction: appConfig.physics?.friction ?? 26 } });
      }
      return;
    }

    if (totalPages <= 1) return;
    const sensitivity = pageDistance / (window.innerWidth / 1.5);
    const maxRot = (totalPages - 1) * pageDistance;
    
    if (active) {
      let nextRot = currentRotRef.current - dx * sensitivity;
      nextRot = Math.max(Math.min(nextRot, maxRot + pageDistance * 0.5), -pageDistance * 0.5); // Allow slight overscroll when active
      currentRotRef.current = nextRot;
      api.start({ rotationY: currentRotRef.current, immediate: true });
    } else {
      let nextRot = currentRotRef.current - (dx * sensitivity) - (vx * 20 * Math.sign(dx));
      nextRot = Math.max(Math.min(nextRot, maxRot), 0);
      currentRotRef.current = nextRot;
      api.start({ rotationY: currentRotRef.current, immediate: false, config: { mass: appConfig.physics?.mass ?? 1, tension: appConfig.physics?.tension ?? 170, friction: appConfig.physics?.friction ?? 26 } });
    }
  }, { axis: 'x' });

  const bindWheel = useWheel(({ delta: [, dy] }) => {
    if (viewMode === 'INSIDE') {
      // Rotace objektu uvnitĹ™ portfolia pĹ™i scrollu
      insideRotRef.current -= dy * 0.005 * (appConfig.scrollSpeed || 1.0);
      insideApi.start({ insideRotationY: insideRotRef.current, immediate: false, config: { mass: appConfig.physics?.mass ?? 1, tension: appConfig.physics?.tension ?? 170, friction: appConfig.physics?.friction ?? 26 } });
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

      const currentStep = currentRotRef.current / stepAngle;
      let targetStep;
      if (direction > 0) {
        targetStep = Math.floor(currentStep + 1e-4) + stepCount;
      } else {
        targetStep = Math.ceil(currentStep - 1e-4) - stepCount;
      }

      let nextRot = targetStep * stepAngle;
      const maxRot = (totalPages - 1) * pageDistance;
      nextRot = Math.max(Math.min(nextRot, maxRot), 0);

      currentRotRef.current = nextRot;
      api.start({ rotationY: currentRotRef.current, immediate: false, config: { mass: appConfig.physics?.mass ?? 1, tension: appConfig.physics?.tension ?? 170, friction: appConfig.physics?.friction ?? 26 } });
    }
  });

  return (
    <div className="app-container" {...bindWheel()}>
      <div className="canvas-container" {...bindDrag()}>
        <Canvas 
          shadows 
          frameloop={isSuspended ? 'never' : 'always'}
          gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
          onCreated={(state) => { if (import.meta.env.DEV) window.__r3f = state; }}
        >
          <RenderRestorationHandler isSuspended={isSuspended} />
          <DnaHeightDetector setDnaHeight360={setDetectedDnaHeight360} />
          <CanvasDebugTracker />
          <Environment preset="city" environmentIntensity={appConfig.environmentIntensity ?? 0.8} />
          
          <AtmosphereDust appConfig={appConfig} springScrollY={springScrollY} rotationY={rotationY} pageDistance={pageDistance} />
          <a.group position-y={springScrollY}>
            <DarkStudioBackground appConfig={appConfig} />
            <CenterLight appConfig={appConfig} />
            <spotLight 
              position={[0, 15, 0]} 
              intensity={(appConfig.hdriIntensity ?? 1) * 3} 
              penumbra={1} 
              angle={0.8} 
              color="#ffffff" 
            />
            <ambientLight intensity={0.2} />
          </a.group>

          <CameraSpotLight appConfig={appConfig} />
          
          <RotationController rotationY={rotationY} pageDistance={pageDistance} totalPages={totalPages} setClosestIndex={setClosestIndex} />
          <PortalDriver viewMode={viewMode} activeIndex={closestIndex} appConfig={appConfig} />
          
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
                
                <BlenderScene 
                  appConfig={appConfig} 
                  pagesData={pagesData}
                  visible={viewMode === 'ORBIT'} 
                  textures={textures}
                  yStep={yStep}
                  pageDistance={pageDistance}
                  activeIndex={closestIndex}
                  onSelect={(idx) => {
                    const val = currentRotRef.current;
                    const exactIdx = val / pageDistance;
                    let diff = idx - (exactIdx % totalPages);
                    if (diff > totalPages / 2) diff -= totalPages;
                    if (diff < -totalPages / 2) diff += totalPages;
                    const targetIndex = exactIdx + diff;
                    currentRotRef.current = targetIndex * pageDistance;
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
                  <ProjectContent 
                    viewMode={viewMode}
                    page={pagesData[closestIndex]} 
                    appConfig={appConfig} 
                    videoTexture={activeVideoTex} 
                    rotationY={rotationY}
                    pageDistance={pageDistance}
                    transitionProgress={transitionProgress}
                  />
                </InsideProjectPivot>
                <SolidPrintDriver
                  viewMode={viewMode}
                  transitionProgress={transitionProgress}
                  appConfig={appConfig}
                  leaving={leaving}
                  onUnprinted={finishLeaving}
                />
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

      {/* AI živý render: plný render i bez fokusu / v neaktivním tabu. Ukládá se do localStorage (jen tento prohlížeč). */}
      <label
        style={{ position: 'absolute', top: 10, left: 100, zIndex: 1000, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', userSelect: 'none' }}
        title="Plný render i když okno nemá fokus nebo je tab na pozadí (pro práci s Claude). Vypnuto = platí powerSaving z configu. Pamatuje si to jen tento prohlížeč; jde i přes ?ai=1 / ?ai=0."
      >
        <input type="checkbox" checked={aiLive} onChange={(e) => setAiLive(e.target.checked)} />
        🤖 AI živý render
      </label>

      {isSuspended && (appConfig.powerSaving?.showBadge ?? true) && (
        <div 
          className="eco-mode-badge"
          onClick={() => setIsSuspended(false)}
          title="KliknÄ›te pro obnovenĂ­ vĂ˝poÄŤtĹŻ"
        >
          <span className="eco-dot"></span>
          <span>ĂšspornĂ˝ reĹľim (0 % GPU)</span>
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
        dnaHeight360={dnaHeight360}
        onClose={() => {
          setIsEditorOpen(false);
          window.history.pushState({}, '', window.location.pathname);
        }} 
      />}

      <div className="ui-overlay">
        {viewMode === 'ORBIT' ? (
          <div className="instructions" style={{ color: '#aaa', userSelect: 'none' }}>
            Objevuj (Swipe nebo Scroll). KliknutĂ­m na desku vstup do projektu.
          </div>
        ) : !leaving && (
          <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)' }}>
             <button
                style={{ pointerEvents: 'auto', padding: '10px 20px', fontSize: '1.2rem', cursor: 'pointer', background: 'white', color: 'black', border: 'none', borderRadius: '30px' }}
                onClick={() => setLeaving(true)}
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
