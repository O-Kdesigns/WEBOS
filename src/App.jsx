import React, { useState, useRef, Suspense, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, Text, Environment, useGLTF, PerspectiveCamera } from '@react-three/drei';
import { a, useSpring } from '@react-spring/three';
import { motion as motionDom, AnimatePresence } from 'framer-motion';
import { useDrag, useWheel } from '@use-gesture/react';
import * as THREE from 'three';
import settings from './settings.json';
import config from './config.json';
import { Grass } from './Grass';
import { Editor } from './Editor';
import { ParticleObject } from './ParticleObject';
import './App.css';

const textureCache = {};

// Samostatná komponenta pro levitující objekt
function LevitatingObject({ settings }) {
  if (!settings?.hasObject || !settings?.objectModel) return null;
  
  const { scene } = useGLTF(`/obsah/${settings.objectModel}`);
  const model = useMemo(() => scene.clone(), [scene, settings.objectModel]);
  const ref = useRef();
  
  const baseX = settings.objectX ?? 0.0;
  const baseY = settings.objectY ?? 2.0;
  // Vzdálenost od kamery -> čím větší číslo, tím dál. Kamera se dívá do mínus Z.
  const baseZ = -(settings.objectZ ?? 4.0);
  
  const isLevitating = settings.isLevitating || false;
  const range = settings.levitateRange ?? 0.5;
  const speed = settings.levitateSpeed ?? 1.0;
  const smoothing = settings.levitateSmoothing ?? 0.1;

  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.getElapsedTime();
      
      // Výchozí cílová pozice je čistě základní výška baseY
      let targetY = baseY;
      let targetRotY = 0;

      // Pokud má zapnutý ping-pong
      if (isLevitating) {
        targetY += Math.sin(t * speed) * range;
        targetRotY = Math.sin(t * speed * 0.5) * 0.2;
      }
      
      // Aplikujeme smoothing (čím menší číslo, tím pomaleji objekt dojíždí na cíl)
      ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, targetY, smoothing);
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, targetRotY, smoothing);
    }
  });

  return (
    <group position={[baseX, 0, baseZ]}>
      {/* Y pozici nastavujeme na primitive, aby na ni mohl sahat useFrame přes ref a dělat interpolace */}
      <primitive ref={ref} object={model} position={[0, baseY, 0]} />
    </group>
  );
}

// Globální statický ostrov, který spojuje 4 čtvrtky do jednoho světa
function GlobalIsland({ appConfig, pagesData }) {
  if (!appConfig.globalSurfaceModel) return null;
  const { scene } = useGLTF(`/obsah/${appConfig.globalSurfaceModel}`);
  
  const clonedScene = React.useMemo(() => {
    return scene.clone();
  }, [scene]);

  React.useEffect(() => {
    const scale = appConfig.islandScaleHorizontal ?? 1.0;
    clonedScene.scale.set(scale, 1.0, scale);
    clonedScene.updateMatrixWorld(true);
    
    // Aplikace barev, textur a roztočení čtvrtek podle nastavení jednotlivých stránek z CMS
    clonedScene.traverse((child) => {
      if (child.isMesh) {
        const match = child.name.match(/\d+/);
        if (match) {
          // Automatická detekce podle reálné polohy (kvadrantu) ve 3D světě
          child.geometry.computeBoundingBox();
          const center = new THREE.Vector3();
          child.geometry.boundingBox.getCenter(center);
          child.updateMatrixWorld(true);
          center.applyMatrix4(child.matrixWorld);

          let pageIndex = 0;
          if (center.x <= 0 && center.z <= 0) pageIndex = 0;      // Stránka 1 (index 0)
          else if (center.x > 0 && center.z <= 0) pageIndex = 1;  // Stránka 2 (index 1)
          else if (center.x > 0 && center.z > 0) pageIndex = 2;   // Stránka 3 (index 2)
          else if (center.x <= 0 && center.z > 0) pageIndex = 3;  // Stránka 4 (index 3)
          
          const page = pagesData[pageIndex];
          const ts = page?.travaSettings;
          
          if (ts) {
            if (ts.surfaceMode === 'texture' && ts.surfaceTexture) {
              if (textureCache[ts.surfaceTexture]) {
                child.material = new THREE.MeshStandardMaterial({ map: textureCache[ts.surfaceTexture] });
              } else {
                new THREE.TextureLoader().load(`/obsah/${ts.surfaceTexture}`, (tex) => {
                  tex.flipY = false;
                  tex.colorSpace = THREE.SRGBColorSpace;
                  textureCache[ts.surfaceTexture] = tex;
                  child.material = new THREE.MeshStandardMaterial({ map: tex });
                });
              }
            } else {
              child.material = new THREE.MeshStandardMaterial({
                 color: ts.surfaceColor || '#333333',
                 roughness: 0.8
              });
            }
          }
        }
      }
    });
  }, [clonedScene, appConfig, pagesData]);

  // Nasázíme trávu jen na ty čtvrtky, které to mají v CMS zapnuté
  const grassInstances = React.useMemo(() => {
    const arr = [];
    clonedScene.traverse((child) => {
      if (child.isMesh) {
        // Pokusíme se najít jakékoliv číslo v názvu meshe
        const match = child.name.match(/\d+/);
        if (match) {
          // Automatická detekce podle reálné polohy pro trávu
          child.geometry.computeBoundingBox();
          const center = new THREE.Vector3();
          child.geometry.boundingBox.getCenter(center);
          child.updateMatrixWorld(true);
          center.applyMatrix4(child.matrixWorld);

          let pageIndex = 0;
          if (center.x <= 0 && center.z <= 0) pageIndex = 0;
          else if (center.x > 0 && center.z <= 0) pageIndex = 1;
          else if (center.x > 0 && center.z > 0) pageIndex = 2;
          else if (center.x <= 0 && center.z > 0) pageIndex = 3;
          
          const page = pagesData[pageIndex];
          if (page?.travaSettings?.hasBasicGrass) {
            arr.push({ mesh: child, settings: page.travaSettings });
          }
        }
      }
    });
    return arr;
  }, [clonedScene, pagesData]);

  return (
    <group>
      <primitive object={clonedScene} />
      
      {/* Vykreslíme trávu jen pro vybrané čtvrtky */}
      {grassInstances.map((item, i) => (
        <Grass key={'g'+i} mesh={item.mesh} count={3000} settings={item.settings} />
      ))}
    </group>
  );
}

function CameraRig({ rotationY, appConfig }) {
  return (
    <a.group rotation-y={rotationY}>
      <PerspectiveCamera makeDefault position={[0, appConfig.cameraHeight ?? 1.5, 0]} fov={appConfig.cameraFov} />
    </a.group>
  );
}

// Controller pro Motion Blur závislý na rychlosti kamery a vzdálenosti od středu
function BlurController({ rotationY, appConfig }) {
  const lastRot = useRef(rotationY.get());
  
  useFrame(() => {
    const currentRot = rotationY.get();
    // Vypočítáme rychlost pohybu
    const velocity = Math.abs(currentRot - lastRot.current);
    lastRot.current = currentRot;
    
    // Zjistíme, jak moc jsme "mezi" dvěma stránkami.
    // Každá stránka je vzdálená 90 stupňů (Math.PI / 2).
    const pageDistance = Math.PI / 2;
    // Odečteme 45 stupňový offset, aby střed stránky opět matematicky odpovídal 0
    const adjustedRot = Math.abs(currentRot - (Math.PI / 4));
    // Převedeme aktuální úhel na kladné číslo z rozsahu 0 až 90 stupňů
    const normalizedAngle = adjustedRot % pageDistance;
    // Zjistíme absolutní vzdálenost od nejbližší stránky (0 = stojíme na stránce, Math.PI/4 = jsme přesně uprostřed v "nicotě")
    const distanceFromPage = Math.min(normalizedAngle, pageDistance - normalizedAngle);
    
    // Změníme to na poměr 0 až 1 (kde 1 = přesně uprostřed, 0 = jsme na stránce)
    const middleFactor = distanceFromPage / (Math.PI / 4);

    const intensity = appConfig.blurIntensity ?? 300;
    
    // Složka 1: Dynamický blur podle toho, jak rychle myší švihneme
    const velocityBlur = velocity * 300;
    
    // Složka 2: Statický blur podle pozice. I když úplně stojíme, uprostřed mezi stránkami MUSÍ být obraz rozmazaný.
    const staticBlur = middleFactor * intensity;

    // Sečteme oba vlivy (maximální dovolená hodnota rozmazání je pro jistotu 100)
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

// Zobrazení obsahu pro jednu stránku (jeden projekt)
import { useVideoTexture } from '@react-three/drei';

function PageContent({ page, index, appConfig }) {
  const radius = 0;
  const angle = index * -(Math.PI / 2) + (Math.PI / 4);
  
  // Načteme video pro stránku, pokud existuje
  const videoTexture = page.videoUrl ? useVideoTexture(`/obsah/${page.videoUrl}`) : null;
  
  return (
    <group rotation={[0, angle, 0]}>
      <group position={[0, 0, -radius]}>
        <group>
          <Suspense fallback={
            <Box args={[3, 3, 3]}>
              <meshStandardMaterial color="#333" wireframe />
            </Box>
          }>
          
            {/* Video na pozadí, pokud je nastaveno */}
            {videoTexture && (
              <mesh position={[0, 0, -10]} scale={[16, 9, 1]}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial 
                  map={videoTexture} 
                  transparent={true} 
                  opacity={page.backgroundVideoOpacity ?? 0.3} 
                  depthWrite={false}
                />
              </mesh>
            )}
            
            <ParticleObject settings={page.particlesSettings} appConfig={appConfig} videoTexture={videoTexture} />

            {/* Pokud je u stránky přiřazený obrázek, můžeme ho vyrenderovat před modelem */}
            {page.image && (
              <mesh position={[0, 2, 2]}>
                <planeGeometry args={[4, 3]} />
                <meshBasicMaterial color="#fff" />
              </mesh>
            )}

            {/* Nadpis a popis ze settings.json */}
            <Text position={[0, -2.5, 2]} fontSize={0.8} color="white" anchorX="center" anchorY="middle">
              {page.title || 'Nepojmenováno'}
            </Text>
            {page.description && (
              <Text position={[0, -3.5, 2]} fontSize={0.3} color="#ccc" anchorX="center" anchorY="middle" maxWidth={5} textAlign="center">
                {page.description}
              </Text>
            )}

          </Suspense>
        </group>
      </group>
    </group>
  );
}

// Vykreslení projektů metodou nekonečné smyčky (Lazy-Loading)
function Scene({ absoluteIndex, pagesData, appConfig }) {
  const totalPages = pagesData.length;
  if (totalPages === 0) return null;

  // Renderujeme vždy jen 3 sloty (místa kolem kamery): [předchozí, aktuální, následující]
  const activeSlots = [
    absoluteIndex - 1,
    absoluteIndex,
    absoluteIndex + 1
  ];

  return (
    <group>
      {activeSlots.map((slotIndex) => {
        // Vypočítáme, který projekt ze settings připadá na toto konkrétní místo
        const pageIndex = ((slotIndex % totalPages) + totalPages) % totalPages;
        const page = pagesData[pageIndex];
        
        return <PageContent key={slotIndex} page={page} index={slotIndex} appConfig={appConfig} />;
      })}
    </group>
  );
}

function App() {
  const [pagesData, setPagesData] = useState(settings.pages || []);
  const [appConfig, setAppConfig] = useState(config || {});
  
  const [absoluteIndex, setAbsoluteIndex] = useState(0);
  const totalPages = Math.max(pagesData.length, 1);
  const dragStartRotRef = useRef(0);
  const wheelLockRef = useRef(false);
  
  // Zobrazení CMS Editoru (aktivuje se přidáním ?editor=true do URL)
  const [isEditorOpen, setIsEditorOpen] = useState(() => {
    return window.location.search.includes('editor=true');
  });

  // Hlavní pružina pro rotaci kamery (spravovaná celou aplikostí)
  const [{ rotationY }, api] = useSpring(() => ({
    rotationY: (0 * -(Math.PI / 2)) + (Math.PI / 4),
    config: { 
      mass: appConfig.physics?.mass ?? 1, 
      tension: appConfig.physics?.tension ?? 170, 
      friction: appConfig.physics?.friction ?? 26 
    }
  }));

  // Aktuální index projektu pro zobrazení UI
  const currentIndex = ((absoluteIndex % totalPages) + totalPages) % totalPages;

  // Funkce pro změnu stránky (využívané primárně pro kolečko myši)
  const changePage = (direction) => {
    if (totalPages <= 1) return;
    
    setAbsoluteIndex(prev => {
      const nextIndex = prev + direction;
      api.start({ 
        rotationY: (nextIndex * -(Math.PI / 2)) + (Math.PI / 4), 
        immediate: false 
      });
      return nextIndex;
    });
  };

  // Interaktivní fyzikální tažení (nyní naprosto volné a bez umělých blokací!)
  const bindDrag = useDrag(({ active, first, movement: [mx], velocity: [vx] }) => {
    if (totalPages <= 1) return;

    if (first) {
      // Při zahájení tahu si uložíme přesný úhel, kde kamera fyzicky je
      dragStartRotRef.current = rotationY.get();
    }

    // Tažení o 1/3 šířky okna znamená otočení o 90 stupňů (Math.PI / 2)
    const offsetAngle = (mx / (window.innerWidth / 3)) * (Math.PI / 2);

    if (active) {
      // Během tahu kamera absolutně a bez prodlev (immediate: true) sleduje prst
      api.start({ 
        rotationY: dragStartRotRef.current + offsetAngle, 
        immediate: true 
      });
    } else {
      // Při puštění vypočítáme, kam přesně jsme dotočili
      const finalAngle = dragStartRotRef.current + offsetAngle;
      // Pro správný výpočet indexu musíme nejprve odečíst náš 45stupňový offset
      const normalizedFinalAngle = finalAngle - (Math.PI / 4);
      const exactFloatIndex = normalizedFinalAngle / -(Math.PI / 2);
      
      let targetIndex = Math.round(exactFloatIndex);
      
      // Pokud byl tah příliš rychlý (švih), skočíme záměrně o 1 projekt podle směru
      if (vx > (appConfig.physics?.swipeVelocityThreshold ?? 0.5)) {
        const dir = mx < 0 ? 1 : -1;
        // Získáme index, na kterém jsme tah fyzicky ZAČALI
        const normalizedStartAngle = dragStartRotRef.current - (Math.PI / 4);
        const startingIndex = Math.round(normalizedStartAngle / -(Math.PI / 2));
        targetIndex = startingIndex + dir;
      }
      
      setAbsoluteIndex(targetIndex);
      
      // Animujeme "odskočení" nebo "dotočení" přesně na cílový projekt (s offsetem!)
      api.start({ 
        rotationY: (targetIndex * -(Math.PI / 2)) + (Math.PI / 4), 
        immediate: false 
      });
    }
  }, { axis: 'x' }); // Zajímají nás jen horizontální gesta

  const bindWheel = useWheel(({ direction: [, dirY] }) => {
     if (wheelLockRef.current) return; // Propustí jen jeden tik kolečka za definovanou dobu
     
     if (dirY === -1) changePage(1);
     if (dirY === 1) changePage(-1);
     
     // Ochrana proti protáčení kolečka (Trackpad pošle 100 eventů za vteřinu, potřebujeme to tlumit)
     wheelLockRef.current = true;
     setTimeout(() => {
       wheelLockRef.current = false;
     }, 1000);
  });

  return (
    <div className="app-container" {...bindWheel()}>
      
      {/* Skryté SVG pro vytvoření hardwarově akcelerovaného horizontálního rozostření */}
      <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
        <filter id="directional-blur">
          <feGaussianBlur id="motion-blur-filter" stdDeviation="0 0" />
        </filter>
      </svg>

      {/* Zde je aplikován náš CSS filtr odkazující na SVG výše */}
      <div className="canvas-container" {...bindDrag()} style={{ filter: 'url(#directional-blur)', transform: 'translateZ(0)' }}>
        <Canvas shadows>
          <color attach="background" args={['#050505']} />
          <spotLight 
            position={[0, 15, 0]} 
            intensity={(appConfig.hdriIntensity ?? 1) * 3} 
            castShadow 
            penumbra={1} 
            angle={0.8} 
            color="#ffffff" 
            shadow-mapSize={[4096, 4096]}
            shadow-bias={-0.00001}
            shadow-camera-near={5}
            shadow-camera-far={25}
          />
          <ambientLight intensity={0.2} />
          <hemisphereLight groundColor="#222222" skyColor="#ffffff" intensity={0.5} />
          
          <BlurController rotationY={rotationY} appConfig={appConfig} />
          
          {/* Globální ostrov ve středu světa */}
          <GlobalIsland appConfig={appConfig} pagesData={pagesData} />
          
          {/* Kamera uprostřed, která rotuje na základě tažení myší */}
          <CameraRig rotationY={rotationY} appConfig={appConfig} />
          
          {/* Dynamicky se nahrávající projekty portfolia (Lazy Loading cyklus) */}
          <Scene absoluteIndex={absoluteIndex} pagesData={pagesData} appConfig={appConfig} />
        </Canvas>
      </div>

      {/* Skrytá klávesová zkratka pro Editor (Ctrl+E) */}
      <button 
        style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto' }}
        onClick={() => setIsEditorOpen(true)}
      >
        ⚙️ Editor
      </button>

      {/* Pokud je zapnutý editor, zobrazíme ho přes celou obrazovku */}
      {isEditorOpen && <Editor 
        pages={pagesData} 
        setPages={setPagesData} 
        appConfig={appConfig} 
        setAppConfig={setAppConfig} 
        onClose={() => {
          setIsEditorOpen(false);
          // Odstranění ?editor=true z URL bez refreshe
          window.history.pushState({}, '', window.location.pathname);
        }} 
      />}

      <div className="ui-overlay">
        <div className="page-indicator">
          {pagesData.length > 0 ? (
            <>Stránka: {pagesData[currentIndex]?.title}</>
          ) : (
            <>Žádné stránky definovány.</>
          )}
        </div>
        <div className="instructions" style={{ color: '#aaa', userSelect: 'none' }}>
          Potáhněte prstem (swipe) nebo posuňte kolečkem myši
        </div>
      </div>

      {/* Vrstva s videem (Zatím vypnuto dle přání)
      <AnimatePresence>
        {isTransitioning && (
          <motionDom.div
            className="video-transition-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div style={{ color: 'white', fontSize: '1.5rem', textAlign: 'center' }}>
              Zde se přehraje video transition<br/>ze složky swipe-screen
            </div>
          </motionDom.div>
        )}
      </AnimatePresence>
      */}
    </div>
  );
}

export default App;
