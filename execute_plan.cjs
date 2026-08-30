const fs = require('fs');

function applyReplacements(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\r\n/g, '\n');
  
  for (let i = 0; i < replacements.length; i++) {
    const { target, rep } = replacements[i];
    if (content.includes(target)) {
      content = content.replace(target, rep);
    } else {
      console.warn(`[WARNING] Could not find target ${i} in ${filePath}`);
    }
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`Successfully patched ${filePath}`);
}

const appReplacements = [
  {
    target: `function VideoManager({ allUrls, activeUrl, children }) {
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
        
        entry.video.play().catch(() => {});
        
        // Zabráníme pádu WebGL (INVALID_VALUE: texImage2D: no video) tím,
        // že texturu pošleme do scény až ve chvíli, kdy má video aspoň metadata/snímky.
        if (entry.video.readyState >= 2) {
          setActiveTexture(entry.texture);
        } else {
          const onReady = () => {
            if (entry.isActive) setActiveTexture(entry.texture);
          };
          entry.video.addEventListener('loadeddata', onReady, { once: true });
          
          // Fallback, pokud by se video nechtělo načíst
          entry.video.addEventListener('error', () => {
             console.warn(\`[VideoManager] Video \${url} se nepodařilo načíst a nebude zobrazeno.\`);
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
}`,
    rep: `function VideoManager({ allUrls, children }) {
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
}`
  },
  {
    target: `function BlenderScene({ visible, onSelect, appConfig, pagesData, videoTexture, currentIndex }) {
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
  }, [videoTexture]);`,
    rep: `function BlenderScene({ visible, onSelect, appConfig, pagesData, textures }) {
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
  }, [textures]);`
  },
  {
    target: `        return (
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
              ) : (`,
    rep: `        const rawUrl = page.videoUrl || page.particlesSettings?.videoUrl;
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
              geometry={baseDeskNode.geometry} 
              renderOrder={10}
            >
              {currentDeskTex ? (
                <a.meshBasicMaterial 
                  map={currentDeskTex} 
                  toneMapped={false} 
                  transparent={true} 
                  depthWrite={false}
                  opacity={fade} 
                  side={THREE.DoubleSide} 
                />
              ) : (`
  },
  {
    target: `function App() {
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
  });`,
    rep: `function RotationController({ rotationY, pageDistance, totalPages, setClosestIndex }) {
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
  });`
  },
  {
    target: `          <VideoManager 
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
                    setAbsoluteIndex(prev => {
                      const currentVisual = ((prev % totalPages) + totalPages) % totalPages;
                      let diff = idx - currentVisual;
                      if (diff > totalPages / 2) diff -= totalPages;
                      if (diff < -totalPages / 2) diff += totalPages;
                      const targetIndex = prev + diff;
                      api.start({ 
                        rotationY: targetIndex * -pageDistance, 
                        immediate: false 
                      });
                      return targetIndex;
                    });
                    setViewMode('INSIDE');
                  }} 
                />
                {/* 3. Obsah projektu uvnitř - VYKRESLÍ SE VŽDY PRO AKTIVNÍ PROJEKT */}
                <ProjectContent 
                  page={pagesData[currentIndex]} 
                  appConfig={appConfig}
                  videoTexture={videoTex}
                  currentIndex={currentIndex}
                  pageDistance={pageDistance}
                />
              </>
            )}
          </VideoManager>

          <CameraRig 
            appConfig={appConfig} 
            rotationY={rotationY} 
            viewMode={viewMode} 
            currentIndex={currentIndex} 
          />`,
    rep: `          <RotationController rotationY={rotationY} pageDistance={pageDistance} totalPages={totalPages} setClosestIndex={setClosestIndex} />
          
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
          />`
  },
  {
    target: `function ProjectContent({ page, appConfig, videoTexture, currentIndex, pageDistance }) {`,
    rep: `function ProjectContent({ page, appConfig, videoTexture, currentIndex, pageDistance, rotationY }) {`
  },
  {
    target: `            <ParticleObject 
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
            />`,
    rep: `            <ParticleObject 
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
            />`
  },
  {
    target: `          <ParticleObject 
            settings={settings}
            appConfig={appConfig} 
            videoTexture={videoTexture} 
            opacity={1}
          />`,
    rep: `          <ParticleObject 
            settings={settings}
            appConfig={appConfig} 
            videoTexture={videoTexture} 
            opacity={1}
            rotationY={rotationY}
            pageDistance={pageDistance}
          />`
  }
];

applyReplacements('src/App.jsx', appReplacements);

const partReplacements = [
  {
    target: `const VideoRefractionMaterialImpl = shaderMaterial(
  {
    tVideo: null,
    uDistortion: 0.1,
    uOpacity: 1.0,
    uColor: new THREE.Color("#ffffff"),
    tPositions: null
  },`,
    rep: `const VideoRefractionMaterialImpl = shaderMaterial(
  {
    tVideo: null,
    uDistortion: 0.1,
    uOpacity: 1.0,
    uColor: new THREE.Color("#ffffff"),
    tPositions: null,
    uNoiseAmount: 0.0,
    uTime: 0.0
  },`
  },
  {
    target: `  uniform sampler2D tVideo;
  uniform float uDistortion;
  uniform float uOpacity;
  uniform vec3 uColor;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;

  void main() {
    vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
    vec2 distortedUv = screenUv + (vNormal.xy * uDistortion);
    distortedUv = clamp(distortedUv, 0.0, 1.0);
    
    vec4 texColor = texture2D(tVideo, distortedUv);
    
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = dot(normal, viewDir);
    fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
    fresnel = pow(fresnel, 3.0);
    
    vec3 finalColor = (texColor.rgb * uColor) + (vec3(1.0) * fresnel * 0.5);
    gl_FragColor = vec4(finalColor, uOpacity);
  }`,
    rep: `  uniform sampler2D tVideo;
  uniform float uDistortion;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform float uNoiseAmount;
  uniform float uTime;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
    vec2 distortedUv = screenUv + (vNormal.xy * uDistortion);
    
    float n = snoise(vNormal.xy * 3.0 + uTime * 1.5);
    distortedUv += n * (uNoiseAmount * 0.5);
    distortedUv = clamp(distortedUv, 0.0, 1.0);
    
    vec4 texColor = texture2D(tVideo, distortedUv);
    
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = dot(normal, viewDir);
    fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
    fresnel = pow(fresnel, 3.0);
    
    float mixFactor = clamp(uNoiseAmount + (n * uNoiseAmount * 0.5), 0.0, 1.0);
    if (uNoiseAmount >= 0.99) mixFactor = 1.0; 
    
    vec3 mixedColor = mix(texColor.rgb, uColor, mixFactor);
    vec3 finalColor = mixedColor + (vec3(1.0) * fresnel * 0.5);
    
    gl_FragColor = vec4(finalColor, uOpacity);
  }`
  },
  {
    target: `function useParticleLogic(meshRef, pointerLightRef, settings, appConfig, posY, compute) {`,
    rep: `function useParticleLogic(meshRef, pointerLightRef, settings, appConfig, posY, compute, rotationY, pageDistance) {`
  },
  {
    target: `    compute.gpuCompute.compute();
    
    const tex = compute.gpuCompute.getCurrentRenderTarget(compute.posVar).texture;`,
    rep: `    compute.gpuCompute.compute();
    
    const tex = compute.gpuCompute.getCurrentRenderTarget(compute.posVar).texture;

    let noiseAmount = 0.0;
    if (rotationY && pageDistance) {
       const val = rotationY.get();
       const exactIdx = val / -pageDistance;
       const remainder = Math.abs(exactIdx - Math.round(exactIdx));
       noiseAmount = Math.min(remainder * 2.0, 1.0);
    }
    
    if (meshRef.current.material && meshRef.current.material.uniforms) {
       if (meshRef.current.material.uniforms.uNoiseAmount) {
           meshRef.current.material.uniforms.uNoiseAmount.value = noiseAmount;
           meshRef.current.material.uniforms.uTime.value = time;
       }
    }`
  },
  {
    target: `function StandardParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder }) {`,
    rep: `function StandardParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance }) {`
  },
  {
    target: `  useParticleLogic(meshRef, pointerLightRef, settings, appConfig, posY, compute);`,
    rep: `  useParticleLogic(meshRef, pointerLightRef, settings, appConfig, posY, compute, rotationY, pageDistance);`
  },
  {
    target: `function CustomParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder }) {`,
    rep: `function CustomParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance }) {`
  },
  {
    target: `function GeometryParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder }) {`,
    rep: `function GeometryParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder, rotationY, pageDistance }) {`
  },
  {
    target: `export function ParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder = 0 }) {
  if (!settings?.hasParticles) return null;
  
  if (settings.shape === 'custom' && settings.customModel) {
    return <CustomParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} />;
  }

  if (settings.shape === 'geometry' && settings.customGeometry) {
    return <GeometryParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} />;
  }
  
  return <StandardParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} />;
}`,
    rep: `export function ParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder = 0, rotationY, pageDistance }) {
  if (!settings?.hasParticles) return null;
  
  if (settings.shape === 'custom' && settings.customModel) {
    return <CustomParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
  }

  if (settings.shape === 'geometry' && settings.customGeometry) {
    return <GeometryParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
  }
  
  return <StandardParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
}`
  }
];

applyReplacements('src/ParticleObject.jsx', partReplacements);

