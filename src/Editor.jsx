import React, { useState, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './Editor.css';

const DragNumberInput = ({ value, onChange, step = 1, min, max }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [localVal, setLocalVal] = React.useState(value);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const startVal = React.useRef(0);

  React.useEffect(() => {
    if (!isEditing && !isDragging.current) setLocalVal(value);
  }, [value, isEditing]);

  const handlePointerDown = (e) => {
    if (isEditing) return;
    isDragging.current = true;
    startX.current = e.clientX;
    startVal.current = Number(value) || 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const delta = e.clientX - startX.current;
    
    const sensitivity = step < 1 ? (step < 0.1 ? 0.01 : 0.05) : 0.2; 
    let newVal = startVal.current + (delta * sensitivity);
    
    const decimals = step.toString().split('.')[1]?.length || 0;
    newVal = Number(newVal.toFixed(decimals));

    if (min !== undefined) newVal = Math.max(min, newVal);
    if (max !== undefined) newVal = Math.min(max, newVal);
    
    setLocalVal(newVal);
    onChange(newVal);
  };

  const handlePointerUp = (e) => {
    if (isDragging.current) {
      isDragging.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (Math.abs(e.clientX - startX.current) < 3) {
        setIsEditing(true);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      onChange(Number(localVal));
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    onChange(Number(localVal));
  };

  if (isEditing) {
    return (
      <input 
        autoFocus
        type="number" 
        step={step}
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="blender-input editing"
      />
    );
  }

  return (
    <div 
      className="blender-input drag-mode"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span className="b-arrow">‹</span>
      <span className="b-value">{localVal}</span>
      <span className="b-arrow">›</span>
    </div>
  );
};

export function isSolidNode(name) {
  if (!name) return false;
  const trimmed = name.trim();
  return (/(?:^|[_.\-\s])1$|(?:\.0*1)$|1$/.test(trimmed)) && !trimmed.endsWith('0');
}

// Sdílená komponenta pro nastavení jakýchkoliv GPGPU částic a objektů
export function ParticleSettingsPanel({ settings = {}, onUpdate, id, assets, openSections, toggleSection, pageTitle, blenderNodes = [] }) {
  const getFilteredAssets = (list, prefix) => list.filter(f => f.startsWith(prefix));

  let matchedNodes = [];
  if (pageTitle && blenderNodes && blenderNodes.length > 0) {
    const cleanTitle = pageTitle.trim().toLowerCase();
    const firstWord = cleanTitle.split(/[\s_-]+/)[0];
    
    matchedNodes = blenderNodes.filter(n => {
      const cleanNode = n.toLowerCase();
      return cleanNode.startsWith(('particles_' + cleanTitle).toLowerCase()) ||
             cleanNode.includes(cleanTitle) ||
             (firstWord && firstWord.length >= 3 && cleanNode.includes(firstWord));
    });
  }

  const availableNodes = matchedNodes.length > 0 ? matchedNodes : (blenderNodes || []);

  return (
    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', borderLeft: '3px solid #10b981', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      
      {availableNodes.length > 0 ? (
        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
            <label style={{ margin: 0, fontWeight: 'bold' }}>
              Zvolte objekty z Blenderu ({matchedNodes.length > 0 ? `${matchedNodes.length} pro '${pageTitle}'` : `všechny (${availableNodes.length})`}):
            </label>
          </div>
          
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
            💡 <b>0 na konci</b> = Částice | <b>1 na konci</b> (např. <code>_1</code>, <code>.001</code>) = Solid 3D objekt
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {availableNodes.map(nodeName => {
              const isChecked = settings.selectedNodes ? settings.selectedNodes.includes(nodeName) : false;
              const isSolid = isSolidNode(nodeName);
              return (
                <label key={nodeName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: isSolid ? '#93c5fd' : '#6ee7b7', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      checked={isChecked}
                      onChange={e => {
                        let current = settings.selectedNodes || [];
                        if (e.target.checked) {
                          current = [...current, nodeName];
                        } else {
                          current = current.filter(n => n !== nodeName);
                        }
                        onUpdate('selectedNodes', current);
                      }} 
                    />
                    <span>{nodeName}</span>
                  </div>
                  <span style={{ 
                    fontSize: '0.72rem', 
                    padding: '2px 6px', 
                    borderRadius: '3px', 
                    fontWeight: 'bold',
                    background: isSolid ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: isSolid ? '#60a5fa' : '#34d399',
                    border: `1px solid ${isSolid ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
                  }}>
                    {isSolid ? '🔷 SOLID (1)' : '🟢 ČÁSTICE (0)'}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="input-group">
          <label>Tvar částicového oblaku (Základní):</label>
          <select value={settings.shape || 'sphere'} onChange={e => onUpdate('shape', e.target.value)}>
            <option value="sphere">Koule</option>
            <option value="cube">Krychle</option>
            <option value="cylinder">Válec</option>
          </select>
        </div>
      )}
      
      {/* MESH (Velikosti a Hustota) */}
      <div className="editor-section" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px' }}>
        <h5 
          onClick={() => toggleSection(`part-mesh-${id}`)} 
          style={{ cursor: 'pointer', margin: 0, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}
        >
          Mesh (Velikost a Hustota) <span>{openSections[`part-mesh-${id}`] ? '▲' : '▼'}</span>
        </h5>
        {openSections[`part-mesh-${id}`] && (
          <div style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label>Základní velikost částice:</label>
              <DragNumberInput step={0.01} value={settings.baseSize ?? 0.1} onChange={val => onUpdate('baseSize', val)} />
            </div>
            <div className="input-group">
              <label>Náhodnost velikosti (0 = stejné, 1 = divoké):</label>
              <DragNumberInput step={0.05} value={settings.sizeRandomness ?? 0.5} onChange={val => onUpdate('sizeRandomness', val)} />
            </div>
            <div className="input-group">
              <label>Hustota bodů z modelu (0 - 100% z originálu):</label>
              <DragNumberInput step={1} min={0} max={100} value={settings.densityPercent ?? 100} onChange={val => onUpdate('densityPercent', val)} />
            </div>
          </div>
        )}
      </div>

      {/* RENDER (Vzhled materiálu) */}
      <div className="editor-section" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px' }}>
        <h5 
          onClick={() => toggleSection(`part-render-${id}`)} 
          style={{ cursor: 'pointer', margin: 0, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}
        >
          Render (Vzhled materiálu) <span>{openSections[`part-render-${id}`] ? '▲' : '▼'}</span>
        </h5>
        {openSections[`part-render-${id}`] && (
          <div style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label>Mód barev a materiálu:</label>
              <select value={settings.colorMode || 'single'} onChange={e => onUpdate('colorMode', e.target.value)}>
                <option value="single">Jedna barva (Metallic)</option>
                <option value="vertex">Vertex Colors (Z předlohy)</option>
                <option value="video">Lámat video z pozadí (Sklo)</option>
              </select>
            </div>
            {settings.colorMode === 'single' && (
              <div className="input-group">
                <label>Barva kuliček:</label>
                <input 
                  type="color" 
                  value={settings.baseColor || '#3b82f6'} 
                  onChange={e => onUpdate('baseColor', e.target.value)} 
                />
              </div>
            )}
            {settings.colorMode === 'video' && (
              <div className="input-group">
                <label>Síla refrakce (Deformace obrazu):</label>
                <DragNumberInput step={0.05} value={settings.refractionDistortion ?? 0.15} onChange={val => onUpdate('refractionDistortion', val)} />
              </div>
            )}
            
            <div className="input-group" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
              <label>Metalíza (Metalness):</label>
              <DragNumberInput step={0.05} value={settings.metalness ?? 0.1} onChange={val => onUpdate('metalness', val)} />
            </div>
            <div className="input-group">
              <label>Drsnost (Roughness):</label>
              <DragNumberInput step={0.05} value={settings.roughness ?? 0.5} onChange={val => onUpdate('roughness', val)} />
            </div>

            <div className="input-group" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
              <label>Průhlednost / Sklo (Transmission):</label>
              <DragNumberInput step={0.05} value={settings.transmission ?? 0.0} onChange={val => onUpdate('transmission', val)} />
            </div>
            <div className="input-group">
              <label>Tloušťka hmoty / Želé (Thickness):</label>
              <DragNumberInput step={0.1} value={settings.thickness ?? 0.0} onChange={val => onUpdate('thickness', val)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Editor({ onClose, pages, setPages, appConfig, setAppConfig }) {
  const [assets, setAssets] = useState({ models: [], images: [], videos: [] });
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState({});
  const [isTransparent, setIsTransparent] = useState(false);
  const [blenderNodes, setBlenderNodes] = useState([]);

  const toggleSection = (sectionId) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  useEffect(() => {
    fetch('/api/assets')
      .then(r => r.json())
      .then(data => setAssets(data));
      
    const loader = new GLTFLoader();
    // Přidáme timestamp, aby prohlížeč nečetl starou verzi z cache
    loader.load('/obsah/everything/newworldorder.glb?v=' + Date.now(), (gltf) => {
       const names = [];
       gltf.scene.traverse(child => {
          if (child.name && child.name !== 'Scene') {
            const isSystem = child.name === 'Cylinder' || 
                             child.name.startsWith('Camera') || 
                             child.name.startsWith('GlassDesk');
            if (!isSystem && (child.isMesh || child.name.includes('Particles_') || child.geometry)) {
              if (!names.includes(child.name)) names.push(child.name);
            }
          }
       });
       setBlenderNodes(names);
    });
      
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const saveSettings = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ pages, config: appConfig })
    });
    setSaving(false);
    
    // Není potřeba tvrdý reload, hodnoty už jsou živě propsané
    // Ale můžeme po uložení zavřít editor (nepovinné, pro teď jen necháme uložit v tichosti)
  };

  const updatePage = (id, field, value) => {
    setPages(pages.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const updateTravaSettings = (id, field, value) => {
    setPages(pages.map(p => {
      if (p.id === id) {
        return {
          ...p,
          travaSettings: {
            ...(p.travaSettings || {}),
            [field]: value
          }
        };
      }
      return p;
    }));
  };

  const updateObsahSettings = (id, field, value) => {
    setPages(pages.map(p => {
      if (p.id === id) {
        return {
          ...p,
          obsahSettings: {
            ...(p.obsahSettings || {}),
            [field]: value
          }
        };
      }
      return p;
    }));
  };

  const updateParticlesSettings = (id, field, value) => {
    setPages(pages.map(p => {
      if (p.id === id) {
        return {
          ...p,
          particlesSettings: {
            ...(p.particlesSettings || {}),
            [field]: value
          }
        };
      }
      return p;
    }));
  };

  const updateConfig = (field, value) => {
    setAppConfig({ ...appConfig, [field]: value });
  };

  const updatePhysics = (field, value) => {
    setAppConfig({
      ...appConfig,
      physics: {
        ...(appConfig.physics || {}),
        [field]: value
      }
    });
  };

  const updateCylinderSettings = (field, value) => {
    setAppConfig({
      ...appConfig,
      cylinderSettings: {
        ...(appConfig.cylinderSettings || {}),
        [field]: value
      }
    });
  };

  const addPage = () => {
    setPages([...pages, {
      id: Date.now().toString(),
      title: "Nová stránka",
      description: "",
      travaSettings: {
        surfaceModel: "",
        surfaceMode: "color",
        surfaceTexture: "",
        surfaceColor: "#4d9900",
        hasBasicGrass: false
      },
      image: "",
      color: "#ffffff"
    }]);
  };

  const deletePage = (id) => {
    setPages(pages.filter(p => p.id !== id));
  };

  // Helper pro filtraci
  const getFilteredAssets = (list, prefix) => list.filter(f => f.startsWith(prefix));

  return (
    <div 
      className={`editor-overlay ${isTransparent ? 'transparent-mode' : ''}`}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className={`editor-header ${isTransparent ? 'transparent-mode' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <h2>🛠 CMS: Správa Portfolia</h2>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#ccc' }}>
            <input type="checkbox" checked={isTransparent} onChange={e => setIsTransparent(e.target.checked)} />
            Průhledný režim (videt skrz)
          </label>
        </div>
        <div className="editor-actions">
          <button onClick={addPage} className="btn-add">+ Přidat stránku</button>
          <button onClick={saveSettings} className="btn-save">{saving ? 'Ukládám...' : 'Uložit trvale'}</button>
          <button onClick={onClose} className="btn-close">Zavřít</button>
        </div>
      </div>
      
      <div className="editor-content">
        {/* GLOBÁLNÍ NASTAVENÍ */}
        <div className="editor-card" style={{ border: '1px solid #3b82f6' }}>
          <div className="card-header">
            <h3 style={{ color: '#3b82f6' }}>Globální nastavení (config.json)</h3>
          </div>
          


          <div className="editor-section">
            <h4 
              style={{ color: '#3b82f6', borderBottomColor: 'rgba(59, 130, 246, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-kamera')}
            >
              Kamera a efekty
              <span>{openSections['global-kamera'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-kamera'] && (
              <>
                <div className="input-group">
                  <label>Zorné pole kamery (FOV):</label>
                  <DragNumberInput step={1} value={appConfig.cameraFov || 60} onChange={val => updateConfig('cameraFov', val)} />
                </div>
                <div className="input-group">
                  <label>Výška kamery (Y os):</label>
                  <DragNumberInput step={0.1} value={appConfig.cameraHeight ?? 1.5} onChange={val => updateConfig('cameraHeight', val)} />
                </div>
                <div className="input-group">
                  <label>Intenzita HDRI (Osvětlení):</label>
                  <DragNumberInput step={0.1} min={0} value={appConfig.hdriIntensity ?? 1} onChange={val => updateConfig('hdriIntensity', val)} />
                </div>
              </>
            )}
          </div>

          <div className="editor-section">
            <h4 
              style={{ color: '#3b82f6', borderBottomColor: 'rgba(59, 130, 246, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-fyzika')}
            >
              Fyzika rotace a gest
              <span>{openSections['global-fyzika'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-fyzika'] && (
              <>
                <div className="input-group">
                  <label>Hmotnost (Mass):</label>
                  <DragNumberInput step={0.1} value={appConfig.physics?.mass || 2.5} onChange={val => updatePhysics('mass', val)} />
                </div>
                <div className="input-group">
                  <label>Pružnost (Tension):</label>
                  <DragNumberInput step={10} value={appConfig.physics?.tension || 500} onChange={val => updatePhysics('tension', val)} />
                </div>
                <div className="input-group">
                  <label>Tření (Friction):</label>
                  <DragNumberInput step={1} value={appConfig.physics?.friction || 100} onChange={val => updatePhysics('friction', val)} />
                </div>
                <div className="input-group">
                  <label>Citlivost tahu (Velocity):</label>
                  <DragNumberInput step={0.1} value={appConfig.physics?.swipeVelocityThreshold || 0.5} onChange={val => updatePhysics('swipeVelocityThreshold', val)} />
                </div>
              </>
            )}
          </div>

          <div className="editor-section">
            <h4 
              style={{ color: '#3b82f6', borderBottomColor: 'rgba(59, 130, 246, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-castice')}
            >
              Fyzika částic a interakce
              <span>{openSections['global-castice'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-castice'] && (
              <>
                <div className="input-group">
                  <label>Síla levitování (Rozkmit):</label>
                  <DragNumberInput step={0.01} value={appConfig.particlePhysics?.floatAmplitude ?? 0.1} onChange={val => updateConfig('particlePhysics', { ...appConfig.particlePhysics, floatAmplitude: val })} />
                </div>
                <div className="input-group">
                  <label>Rychlost levitování:</label>
                  <DragNumberInput step={0.1} value={appConfig.particlePhysics?.floatSpeed ?? 1.0} onChange={val => updateConfig('particlePhysics', { ...appConfig.particlePhysics, floatSpeed: val })} />
                </div>
                <div className="input-group">
                  <label>Rychlost návratu částic:</label>
                  <DragNumberInput step={0.01} value={appConfig.particlePhysics?.returnSpeed ?? 0.05} onChange={val => updateConfig('particlePhysics', { ...appConfig.particlePhysics, returnSpeed: val })} />
                </div>
                <div className="input-group" style={{ borderTop: '1px solid rgba(59, 130, 246, 0.2)', paddingTop: '1rem' }}>
                  <label>Síla odfouknutí myší:</label>
                  <DragNumberInput step={0.1} value={appConfig.particlePhysics?.mouseForce ?? 1.0} onChange={val => updateConfig('particlePhysics', { ...appConfig.particlePhysics, mouseForce: val })} />
                </div>
                <div className="input-group">
                  <label>Průměr efektu myši:</label>
                  <DragNumberInput step={0.1} value={appConfig.particlePhysics?.mouseRadius ?? 2.0} onChange={val => updateConfig('particlePhysics', { ...appConfig.particlePhysics, mouseRadius: val })} />
                </div>
                <div className="input-group">
                  <label>Délka průniku (Lightsaber):</label>
                  <DragNumberInput step={0.1} value={appConfig.particlePhysics?.laserLength ?? 5.0} onChange={val => updateConfig('particlePhysics', { ...appConfig.particlePhysics, laserLength: val })} />
                </div>
                <div className="input-group">
                  <label>Intenzita světla myši (Lightsaber):</label>
                  <DragNumberInput step={1} value={appConfig.particlePhysics?.laserIntensity ?? 10.0} onChange={val => updateConfig('particlePhysics', { ...appConfig.particlePhysics, laserIntensity: val })} />
                </div>
              </>
            )}
          </div>

          <div className="editor-section">
            <h4 
              style={{ color: '#10b981', borderBottomColor: 'rgba(16, 185, 129, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-background-cylinder')}
            >
              Pozadí prostoru (Abstraktní Válec)
              <span>{openSections['global-background-cylinder'] ? '▲' : '▼'}</span>
            </h4>
            {openSections['global-background-cylinder'] && (
              <div style={{ paddingTop: '0.5rem' }}>
                <div className="input-group checkbox-group">
                  <label style={{ fontSize: '1rem', color: '#10b981', fontWeight: 'bold' }}>
                    <input 
                      type="checkbox" 
                      checked={appConfig.cylinderSettings?.hasParticles ?? true} 
                      onChange={e => updateCylinderSettings('hasParticles', e.target.checked)} 
                      style={{ transform: 'scale(1.2)' }} 
                    />
                    Zobrazit částicový sloup v pozadí
                  </label>
                </div>

                {appConfig.cylinderSettings?.hasParticles !== false && (
                  <ParticleSettingsPanel 
                    settings={{ shape: 'cylinder', count: 10000, radius: 8.0, height: 40.0, objectY: 0, objectZ: 0, colorMode: 'single', baseColor: '#3b82f6', ...appConfig.cylinderSettings }}
                    onUpdate={updateCylinderSettings}
                    id="global-cylinder"
                    assets={assets}
                    openSections={openSections}
                    toggleSection={toggleSection}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* STRÁNKY */}
        {pages.map((page, index) => {
          const ts = page.travaSettings || {};
          
          return (
            <div key={page.id} className="editor-card">
              <div className="card-header">
                <h3>Stránka {index + 1}</h3>
                <button onClick={() => deletePage(page.id)} className="btn-delete">Smazat</button>
              </div>
              
              <div className="input-group">
                <label>Nadpis:</label>
                <input type="text" value={page.title || ''} onChange={e => updatePage(page.id, 'title', e.target.value)} />
              </div>
              
              <div className="input-group">
                <label>Popis:</label>
                <textarea value={page.description || ''} onChange={e => updatePage(page.id, 'description', e.target.value)} />
              </div>
              
              <div className="input-group">
                <label>Video na pozadí stránky:</label>
                <select value={page.videoUrl || ''} onChange={e => updatePage(page.id, 'videoUrl', e.target.value)}>
                  <option value="">Žádné video</option>
                  {getFilteredAssets(assets.videos, 'video/').map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {page.videoUrl && (
                  <div style={{ marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: '#000', display: 'flex', justifyContent: 'center' }}>
                    <video 
                      src={encodeURI(`/obsah/${page.videoUrl.replace(/^\/?(obsah\/)?/, '')}`)}
                      controls 
                      muted 
                      style={{ width: '100%', maxHeight: '150px', objectFit: 'contain' }}
                    />
                  </div>
                )}
              </div>



              {/* Sekce: MODUL OBSAH */}
              <div className="editor-section">
                <h4 
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onClick={() => toggleSection('page-obsah')}
                >
                  Modul: Obsah
                  <span>{openSections['page-obsah'] ? '▲' : '▼'}</span>
                </h4>
                
                {openSections['page-obsah'] && (
                  <>
                    <div className="input-group checkbox-group">
                      <label style={{ fontSize: '1rem', color: '#10b981', fontWeight: 'bold' }}>
                        <input type="checkbox" checked={page.obsahSettings?.hasObject || false} onChange={e => updateObsahSettings(page.id, 'hasObject', e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                        3D Objekt (Model)
                      </label>
                    </div>

                    {page.obsahSettings?.hasObject && (
                      <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', borderLeft: '3px solid #10b981', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        
                        <div className="input-group">
                          <label>Vyberte model (ze složky obsah/levitate/):</label>
                          <select value={page.obsahSettings?.objectModel || ''} onChange={e => updateObsahSettings(page.id, 'objectModel', e.target.value)}>
                            <option value="">Nevybrán model</option>
                            {getFilteredAssets(assets.models, 'obsah/levitate/').map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        
                        <div className="input-group" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                          <label>Vzdálenost od kamery (do hloubky ostrova):</label>
                          <DragNumberInput step={0.1} value={page.obsahSettings?.objectZ ?? 4.0} onChange={val => updateObsahSettings(page.id, 'objectZ', val)} />
                        </div>
                        
                        <div className="input-group">
                          <label>Pozice horizontálně (mínus = vlevo, plus = vpravo):</label>
                          <DragNumberInput step={0.1} value={page.obsahSettings?.objectX ?? 0.0} onChange={val => updateObsahSettings(page.id, 'objectX', val)} />
                        </div>

                        <div className="input-group">
                          <label>Základní výška (od země):</label>
                          <DragNumberInput step={0.1} value={page.obsahSettings?.objectY ?? 2.0} onChange={val => updateObsahSettings(page.id, 'objectY', val)} />
                        </div>
                        
                        <div className="input-group checkbox-group" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                          <label style={{ fontSize: '0.9rem', color: '#60a5fa' }}>
                            <input type="checkbox" checked={page.obsahSettings?.isLevitating || false} onChange={e => updateObsahSettings(page.id, 'isLevitating', e.target.checked)} />
                            Zapnout levitování (Ping-pong animace)
                          </label>
                        </div>

                        {page.obsahSettings?.isLevitating && (
                          <div style={{ paddingLeft: '1rem', borderLeft: '2px solid rgba(96, 165, 250, 0.3)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="input-group">
                              <label>Rozmezí ping-pongu (Amplituda):</label>
                              <DragNumberInput step={0.1} value={page.obsahSettings?.levitateRange ?? 0.5} onChange={val => updateObsahSettings(page.id, 'levitateRange', val)} />
                            </div>
                            
                            <div className="input-group">
                              <label>Rychlost vznášení:</label>
                              <DragNumberInput step={0.1} value={page.obsahSettings?.levitateSpeed ?? 1.0} onChange={val => updateObsahSettings(page.id, 'levitateSpeed', val)} />
                            </div>
                            
                            <div className="input-group">
                              <label>Smoothing (Jemnost pohybu):</label>
                              <DragNumberInput step={0.01} value={page.obsahSettings?.levitateSmoothing ?? 0.1} onChange={val => updateObsahSettings(page.id, 'levitateSmoothing', val)} />
                            </div>
                          </div>
                        )}
                        
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Sekce: MODUL ČÁSTICE */}
              <div className="editor-section">
                <h4 
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onClick={() => toggleSection('page-particles')}
                >
                  Modul: Částice
                  <span>{openSections['page-particles'] ? '▲' : '▼'}</span>
                </h4>
                
                {openSections['page-particles'] && (
                  <>
                    <div className="input-group checkbox-group">
                      <label style={{ fontSize: '1rem', color: '#10b981', fontWeight: 'bold' }}>
                        <input type="checkbox" checked={page.particlesSettings?.hasParticles || false} onChange={e => updateParticlesSettings(page.id, 'hasParticles', e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                        Zapnout částice
                      </label>
                    </div>

                    {page.particlesSettings?.hasParticles && (
                      <ParticleSettingsPanel 
                        settings={page.particlesSettings}
                        onUpdate={(field, value) => updateParticlesSettings(page.id, field, value)}
                        id={`page-${page.id}`}
                        assets={assets}
                        openSections={openSections}
                        toggleSection={toggleSection}
                        pageTitle={page.title}
                        blenderNodes={blenderNodes}
                      />
                    )}
                  </>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
