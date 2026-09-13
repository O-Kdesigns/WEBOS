import React, { useState, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './Editor.css';

const DragNumberInput = ({ value, onChange, step = 1, min, max, compact = false }) => {
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
        className={`blender-input editing ${compact ? 'compact' : ''}`}
        style={compact ? { height: '24px', padding: '2px 4px', fontSize: '0.78rem', width: '56px' } : undefined}
      />
    );
  }

  return (
    <div 
      className={`blender-input drag-mode ${compact ? 'compact' : ''}`}
      style={compact ? { height: '24px', padding: '0 4px', fontSize: '0.78rem', width: '56px' } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span className="b-arrow" style={compact ? { fontSize: '0.85rem' } : undefined}>‹</span>
      <span className="b-value" style={compact ? { fontSize: '0.78rem' } : undefined}>{localVal}</span>
      <span className="b-arrow" style={compact ? { fontSize: '0.85rem' } : undefined}>›</span>
    </div>
  );
};

function isSolidNode(name) {
  if (!name) return false;
  const trimmed = name.trim();
  return (/(?:^|[_.\-\s])1$|(?:\.0*1)$|1$/.test(trimmed)) && !trimmed.endsWith('0');
}

// Sdílená komponenta pro nastavení jakýchkoliv GPGPU částic a objektů
export function ParticleSettingsPanel({ settings = {}, onUpdate, id, openSections, toggleSection, pageTitle, blenderNodes = [] }) {
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
              Objekty z Blenderu ({matchedNodes.length > 0 ? `${matchedNodes.length} pro '${pageTitle}'` : `všechny (${availableNodes.length})`}):
            </label>
          </div>
          <span className="input-desc">💡 <b>0 na konci</b> = Částice | <b>1 na konci</b> (např. <code>_1</code>, <code>.001</code>) = Solid 3D mesh</span>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {availableNodes.map(nodeName => {
              const isChecked = settings.selectedNodes ? settings.selectedNodes.includes(nodeName) : false;
              const isSolid = isSolidNode(nodeName);
              const multiplier = (settings.nodeMultipliers && settings.nodeMultipliers[nodeName] !== undefined)
                ? settings.nodeMultipliers[nodeName]
                : 1;
              const mouseMultiplier = (settings.nodeMouseMultipliers && settings.nodeMouseMultipliers[nodeName] !== undefined)
                ? settings.nodeMouseMultipliers[nodeName]
                : 1;

              return (
                <div 
                  key={nodeName} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '0.4rem',
                    background: isChecked 
                      ? (isSolid ? 'rgba(59, 130, 246, 0.08)' : 'rgba(16, 185, 129, 0.08)') 
                      : 'rgba(255,255,255,0.02)', 
                    border: `1px solid ${isChecked 
                      ? (isSolid ? 'rgba(59, 130, 246, 0.28)' : 'rgba(16, 185, 129, 0.28)') 
                      : 'rgba(255,255,255,0.05)'}`,
                    padding: '6px 10px', 
                    borderRadius: '6px',
                    transition: 'background 0.15s ease, border-color 0.15s ease'
                  }}
                >
                  {/* Horní řádek: Checkbox + Celé jméno bez ořezu + Typ uzlu */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', margin: 0, flex: 1, minWidth: 0 }}>
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
                        style={{ cursor: 'pointer', width: '16px', height: '16px', flexShrink: 0 }}
                      />
                      <span style={{ 
                        color: isSolid ? '#93c5fd' : '#6ee7b7', 
                        fontWeight: isChecked ? 600 : 400,
                        fontSize: '0.84rem',
                        wordBreak: 'break-word',
                        lineHeight: 1.35
                      }}>
                        {nodeName}
                      </span>
                    </label>

                    <span style={{ 
                      fontSize: '0.68rem', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      background: isSolid ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                      color: isSolid ? '#60a5fa' : '#34d399',
                      border: `1px solid ${isSolid ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
                    }}>
                      {isSolid ? '🔷 SOLID (1)' : '🟢 ČÁSTICE (0)'}
                    </span>
                  </div>

                  {/* Spodní řádek: Násobiče pro velikost a vliv myši */}
                  {!isSolid && (
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        flexWrap: 'wrap', 
                        gap: '0.8rem',
                        paddingTop: '5px',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        fontSize: '0.74rem',
                        color: '#94a3b8'
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Násobič velikosti */}
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} 
                        title="Násobič velikosti částic pro tento objekt"
                      >
                        <span style={{ color: '#cbd5e1' }}>Velikost:</span>
                        <DragNumberInput 
                          compact={true}
                          step={0.1} 
                          min={0.01} 
                          max={20} 
                          value={multiplier} 
                          onChange={val => {
                            const current = { ...(settings.nodeMultipliers || {}) };
                            current[nodeName] = val;
                            onUpdate('nodeMultipliers', current);
                          }} 
                        />
                        <span>×</span>
                      </div>

                      {/* Násobič vlivu myši */}
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} 
                        title="Násobič reakce na pohyb myši pro tento objekt (0 = myš částice neovlivňuje)"
                      >
                        <span style={{ color: '#cbd5e1' }}>Vliv myši:</span>
                        <DragNumberInput 
                          compact={true}
                          step={0.1} 
                          min={0} 
                          max={20} 
                          value={mouseMultiplier} 
                          onChange={val => {
                            const current = { ...(settings.nodeMouseMultipliers || {}) };
                            current[nodeName] = val;
                            onUpdate('nodeMouseMultipliers', current);
                          }} 
                        />
                        <span>×</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="input-group">
          <label>Základní tvar částicového oblaku:</label>
          <span className="input-desc">Geometrický tvar pro rozmístění částic, pokud není vybrán model</span>
          <select value={settings.shape || 'sphere'} onChange={e => onUpdate('shape', e.target.value)}>
            <option value="sphere">Koule</option>
            <option value="cube">Krychle</option>
            <option value="cylinder">Válec</option>
          </select>
        </div>
      )}
      
      {/* MESH (Velikosti a Hustota) */}
      <div className="editor-subsection">
        <h5 
          className="editor-subsection-header"
          onClick={() => toggleSection(`part-mesh-${id}`)} 
        >
          <span>📏 Mesh & Hustota bodů</span>
          <span>{openSections[`part-mesh-${id}`] ? '▲' : '▼'}</span>
        </h5>
        {openSections[`part-mesh-${id}`] && (
          <div className="editor-subsection-content">
            <div className="input-group">
              <label>Základní velikost částic:</label>
              <span className="input-desc">Měřítko jednotlivých kuliček</span>
              <DragNumberInput step={0.01} value={settings.baseSize ?? 0.1} onChange={val => onUpdate('baseSize', val)} />
            </div>
            <div className="input-group">
              <label>Náhodnost velikosti:</label>
              <span className="input-desc">0 = stejná velikost, 1 = divoký organický rozptyl</span>
              <DragNumberInput step={0.05} value={settings.sizeRandomness ?? 0.5} onChange={val => onUpdate('sizeRandomness', val)} />
            </div>
            <div className="input-group">
              <label>Hustota bodů z modelu (0 - 100%):</label>
              <span className="input-desc">Procento z celkového počtu vrcholů sítě</span>
              <DragNumberInput step={1} min={0} max={100} value={settings.densityPercent ?? 100} onChange={val => onUpdate('densityPercent', val)} />
            </div>
          </div>
        )}
      </div>

      {/* RENDER (Vzhled materiálu) */}
      <div className="editor-subsection">
        <h5 
          className="editor-subsection-header"
          onClick={() => toggleSection(`part-render-${id}`)} 
        >
          <span>🎨 Materiál & Želé (Render)</span>
          <span>{openSections[`part-render-${id}`] ? '▲' : '▼'}</span>
        </h5>
        {openSections[`part-render-${id}`] && (
          <div className="editor-subsection-content">
            <div className="input-group">
              <label>Mód barev a materiálu:</label>
              <span className="input-desc">Způsob obarvení a stínování částic</span>
              <select value={settings.colorMode || 'single'} onChange={e => onUpdate('colorMode', e.target.value)}>
                <option value="single">Jedna barva (Solid / Metal)</option>
                <option value="vertex">Vertex Colors (Z předlohy)</option>
                <option value="video">Video uvnitř želé (Jelly Video)</option>
              </select>
            </div>
            
            {settings.colorMode !== 'vertex' && (
              <div className="input-group">
                <label>{settings.colorMode === 'video' ? 'Tónování želé (Barva):' : 'Barva kuliček:'}</label>
                <span className="input-desc">Odstín skleněného těla nebo povrchu</span>
                <input 
                  type="color" 
                  value={settings.baseColor || '#6df73b'} 
                  onChange={e => onUpdate('baseColor', e.target.value)} 
                />
              </div>
            )}

            {settings.colorMode === 'video' && (
              <>
                <div className="input-group">
                  <label>Zakřivení optiky videa (Distortion):</label>
                  <span className="input-desc">Efekt rybího oka a čočky promítající video do kuličky</span>
                  <DragNumberInput step={0.05} min={0} max={2} value={settings.refractionDistortion ?? 0.6} onChange={val => onUpdate('refractionDistortion', val)} />
                </div>

                <div style={{ marginTop: '0.8rem', marginBottom: '0.4rem', padding: '0.4rem 0.6rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', borderLeft: '3px solid #3b82f6' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#93c5fd' }}>🌊 Přechod mezi videi (Vodní zamíchání)</span>
                </div>

                <div className="input-group">
                  <label>Maximální světlá (Jas světlých vírů):</label>
                  <span className="input-desc">Maximální intenzita světlé / modré barvy při zamíchání (např. 0.8)</span>
                  <DragNumberInput step={0.05} min={0} max={3} value={settings.transitionMaxLight ?? 0.8} onChange={val => onUpdate('transitionMaxLight', val)} />
                </div>

                <div className="input-group">
                  <label>Minimální tmavá (Úroveň tmavých vírů):</label>
                  <span className="input-desc">Jak hluboká je černá v tmavých proudech (0 = úplná tma, 0.05 = lehký nádech, 0.2 = měkčí temnota)</span>
                  <DragNumberInput step={0.01} min={0} max={1} value={settings.transitionMinDark ?? 0.05} onChange={val => onUpdate('transitionMinDark', val)} />
                </div>
              </>
            )}
            
            <div className="input-group">
              <label>Průchod světla / Transmise videa:</label>
              <span className="input-desc">0 = neprůhledné, 1 = plný zářivý průchod videa skrz kuličku</span>
              <DragNumberInput step={0.05} min={0} max={1} value={settings.transmission ?? 0.85} onChange={val => onUpdate('transmission', val)} />
            </div>

            <div className="input-group">
              <label>Hloubka a tloušťka sytosti želé (Thickness):</label>
              <span className="input-desc">Absorpce světla a sytost želatinového jádra</span>
              <DragNumberInput step={0.1} min={0} max={10} value={settings.thickness ?? 1.2} onChange={val => onUpdate('thickness', val)} />
            </div>

            <div className="input-group">
              <label>Drsnost povrchu (Roughness):</label>
              <span className="input-desc">0 = zrcadlově lesklé, 1 = sametově matné</span>
              <DragNumberInput step={0.05} min={0} max={1} value={settings.roughness ?? 0.2} onChange={val => onUpdate('roughness', val)} />
            </div>

            <div className="input-group">
              <label>Metalíza (Metalness):</label>
              <span className="input-desc">Míra kovových odlesků a reflexe</span>
              <DragNumberInput step={0.05} min={0} max={1} value={settings.metalness ?? 0.1} onChange={val => onUpdate('metalness', val)} />
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
  const [openSections, setOpenSections] = useState({
    'global-volumetric': true,
    'vl-source': true,
    'vl-optics': true,
    'global-background-cylinder': true,
    'part-render-global-cylinder': true,
    'global-volumetric-unified': true,
    'sub-volumetric-screen': true,
    'sub-volumetric-depth': true,
    'cam-spotlight': true
  });
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
  };

  const updatePage = (id, field, value) => {
    setPages(pages.map(p => p.id === id ? { ...p, [field]: value } : p));
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

  const updateVolumetric = (field, value) => {
    setAppConfig({
      ...appConfig,
      volumetricLight: {
        ...(appConfig.volumetricLight || {}),
        [field]: value
      }
    });
  };

  const updateInsideFog = (field, value) => {
    setAppConfig({
      ...appConfig,
      insideFog: {
        ...(appConfig.insideFog || {}),
        [field]: value
      }
    });
  };

  const updateCameraSpotLight = (field, value) => {
    setAppConfig({
      ...appConfig,
      cameraSpotLight: {
        ...(appConfig.cameraSpotLight || {}),
        [field]: value
      }
    });
  };

  const updateBackground = (field, value) => {
    setAppConfig({
      ...appConfig,
      backgroundSettings: {
        ...(appConfig.backgroundSettings || {}),
        [field]: value
      }
    });
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

  const updateParticlePhysics = (field, value) => {
    setAppConfig({
      ...appConfig,
      particlePhysics: {
        ...(appConfig.particlePhysics || {}),
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

  const updatePowerSaving = (field, value) => {
    setAppConfig({
      ...appConfig,
      powerSaving: {
        ...(appConfig.powerSaving || {}),
        [field]: value
      }
    });
  };

  const updateVolumetricVideo = (field, value) => {
    setAppConfig({
      ...appConfig,
      volumetricVideo: {
        ...(appConfig.volumetricVideo || {}),
        [field]: value
      }
    });
  };

  const updateVolumetricDepth = (field, value) => {
    setAppConfig({
      ...appConfig,
      volumetricDepth: {
        ...(appConfig.volumetricDepth || {}),
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
            Průhledný režim (vidět scénu)
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
            <h3 style={{ color: '#3b82f6' }}>⚙️ Globální nastavení (config.json)</h3>
          </div>

          {/* ÚSPORNÝ REŽIM (POWER SAVING) */}
          <div className="editor-section">
            <h4 
              style={{ color: '#10b981', borderBottomColor: 'rgba(16, 185, 129, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-power-saving')}
            >
              <span>⚡ Úsporný režim (Pozastavení při neaktivitě)</span>
              <span>{openSections['global-power-saving'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-power-saving'] && (
              <div className="editor-subsection-content" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div className="checkbox-group">
                  <label style={{ fontWeight: '600', color: '#10b981' }}>
                    <input 
                      type="checkbox" 
                      checked={appConfig.powerSaving?.pauseOnBlur ?? true} 
                      onChange={e => updatePowerSaving('pauseOnBlur', e.target.checked)} 
                    />
                    Pozastavit výpočty při ztrátě fokusu (0 % GPU)
                  </label>
                  <span className="input-desc" style={{ width: '100%' }}>
                    Zastaví Three.js render smyčku, GPGPU simulaci částic a dekódování videí, když kliknete do jiné aplikace (např. Antigravity) nebo přepnete záložku.
                  </span>
                </div>

                <div className="checkbox-group">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={appConfig.powerSaving?.pauseAudioOnBlur ?? false} 
                      onChange={e => updatePowerSaving('pauseAudioOnBlur', e.target.checked)} 
                    />
                    Pozastavit také hudbu na pozadí
                  </label>
                  <span className="input-desc" style={{ width: '100%' }}>
                    Pokud je vypnuto (doporučeno), hudba hraje nepřerušovaně na pozadí i při práci v jiném programu.
                  </span>
                </div>

                <div className="checkbox-group">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={appConfig.powerSaving?.showBadge ?? true} 
                      onChange={e => updatePowerSaving('showBadge', e.target.checked)} 
                    />
                    Zobrazit odznak úsporného režimu
                  </label>
                  <span className="input-desc" style={{ width: '100%' }}>
                    Diskrétní odznak v rohu obrazovky informující o pozastavení výpočtů.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 1. VOLUMETRIC LIGHT (GOD RAYS) */}
          <div className="editor-section">
            <h4 
              style={{ color: '#f59e0b', borderBottomColor: 'rgba(245, 158, 11, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-volumetric')}
            >
              <span>✨ Volumetric Light (God Rays)</span>
              <span>{openSections['global-volumetric'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-volumetric'] && (
              <>
                <div className="input-group checkbox-group">
                  <label style={{ fontSize: '1rem', color: '#f59e0b', fontWeight: 'bold' }}>
                    <input 
                      type="checkbox" 
                      checked={appConfig.volumetricLight?.enabled ?? true} 
                      onChange={e => updateVolumetric('enabled', e.target.checked)} 
                    />
                    Aktivovat Volumetric Postprocessing
                  </label>
                  <span className="input-desc" style={{ width: '100%' }}>Zapne/vypne screen-space radial blur raymarching světla</span>
                </div>

                {/* Podsekce: Světelný zdroj a středové jádro */}
                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('vl-source')}
                  >
                    <span>🌟 Zdroj světla & Středové jádro</span>
                    <span>{openSections['vl-source'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['vl-source'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Pozice Y (Výška středu):</label>
                        <span className="input-desc">Vertikální umístění světelného zdroje ve 3D prostoru</span>
                        <DragNumberInput step={0.1} value={appConfig.volumetricLight?.posY ?? 0} onChange={val => updateVolumetric('posY', val)} />
                      </div>
                      <div className="input-group">
                        <label>Pozice X (Horizontálně):</label>
                        <span className="input-desc">Vodorovné posunutí středu světla</span>
                        <DragNumberInput step={0.1} value={appConfig.volumetricLight?.posX ?? 0} onChange={val => updateVolumetric('posX', val)} />
                      </div>
                      <div className="input-group">
                        <label>Velikost světelného jádra (Radius):</label>
                        <span className="input-desc">Poloměr centrální zářivé kuličky</span>
                        <DragNumberInput step={0.05} min={0.05} max={3.0} value={appConfig.volumetricLight?.lightSize ?? 0.35} onChange={val => updateVolumetric('lightSize', val)} />
                      </div>
                      <div className="input-group">
                        <label>Intenzita bodového světla:</label>
                        <span className="input-desc">Reálné prosvícení vnitřní stěny částic</span>
                        <DragNumberInput step={1} min={0} max={100} value={appConfig.volumetricLight?.lightIntensity ?? 20} onChange={val => updateVolumetric('lightIntensity', val)} />
                      </div>
                      <div className="input-group">
                        <label>Barva světla & paprsků:</label>
                        <span className="input-desc">Základní tónování vyzařovaného světla</span>
                        <input 
                          type="color" 
                          value={appConfig.volumetricLight?.color || '#ffffff'} 
                          onChange={e => updateVolumetric('color', e.target.value)} 
                        />
                      </div>

                      <div className="input-group checkbox-group" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
                        <label style={{ color: '#fde68a' }}>
                          <input 
                            type="checkbox" 
                            checked={appConfig.volumetricLight?.hasAura ?? true} 
                            onChange={e => updateVolumetric('hasAura', e.target.checked)} 
                          />
                          Světelná aura / opar kolem středu
                        </label>
                      </div>

                      {appConfig.volumetricLight?.hasAura !== false && (
                        <>
                          <div className="input-group">
                            <label>Násobič velikosti aury:</label>
                            <span className="input-desc">Rozptyl jemného zářivého halo obalu</span>
                            <DragNumberInput step={0.1} min={1.0} max={6.0} value={appConfig.volumetricLight?.auraSize ?? 2.2} onChange={val => updateVolumetric('auraSize', val)} />
                          </div>
                          <div className="input-group">
                            <label>Průhlednost aury (Hustota):</label>
                            <span className="input-desc">Sytost světelného oparu pro plnější tělo paprsků</span>
                            <DragNumberInput step={0.05} min={0.05} max={1.0} value={appConfig.volumetricLight?.auraOpacity ?? 0.35} onChange={val => updateVolumetric('auraOpacity', val)} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Podsekce: Optika a chování paprsků */}
                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('vl-optics')}
                  >
                    <span>⚡ Chování & Optika paprsků</span>
                    <span>{openSections['vl-optics'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['vl-optics'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Expozice paprsků (Exposure):</label>
                        <span className="input-desc">Celkový jas a intenzita vyzařovaných paprsků</span>
                        <DragNumberInput step={0.05} min={0} max={4} value={appConfig.volumetricLight?.exposure ?? 1.0} onChange={val => updateVolumetric('exposure', val)} />
                      </div>
                      <div className="input-group">
                        <label>Útlum do dálky (Decay):</label>
                        <span className="input-desc">Rychlost slábnutí paprsku se vzdáleností (0.90 = rychlý útlum, 0.98 = nekonečný dosah)</span>
                        <DragNumberInput step={0.01} min={0.5} max={0.99} value={appConfig.volumetricLight?.decay ?? 0.96} onChange={val => updateVolumetric('decay', val)} />
                      </div>
                      <div className="input-group">
                        <label>Hustota / Rozptyl paprsků (Density):</label>
                        <span className="input-desc">Šířka a rozptyl paprsků přes obrazovku</span>
                        <DragNumberInput step={0.05} min={0.1} max={2.0} value={appConfig.volumetricLight?.density ?? 0.95} onChange={val => updateVolumetric('density', val)} />
                      </div>
                      <div className="input-group">
                        <label>Váha vzorků (Weight):</label>
                        <span className="input-desc">Výraznost a sytost jednotlivých světelných stop</span>
                        <DragNumberInput step={0.05} min={0} max={2.0} value={appConfig.volumetricLight?.weight ?? 0.5} onChange={val => updateVolumetric('weight', val)} />
                      </div>
                      <div className="input-group">
                        <label>Práh jasu (Threshold):</label>
                        <span className="input-desc">Hodnota jasu, od které objekty začnou vyzařovat paprsky (nízká = září i okolí, vysoká = jen střed)</span>
                        <DragNumberInput step={0.05} min={0} max={1.0} value={appConfig.volumetricLight?.threshold ?? 0.4} onChange={val => updateVolumetric('threshold', val)} />
                      </div>
                      <div className="input-group">
                        <label>Délka paprsků (Ray Length):</label>
                        <span className="input-desc">Fyzická délka paprsku (menší hodnota = krátké sevřené paprsky u středu)</span>
                        <DragNumberInput step={0.05} min={0.1} max={2.0} value={appConfig.volumetricLight?.rayLength ?? 0.45} onChange={val => updateVolumetric('rayLength', val)} />
                      </div>
                      <div className="input-group">
                        <label>Maximální dosah (Max Radius):</label>
                        <span className="input-desc">Kruhový poloměr na obrazovce, za kterým paprsky plynule mizí</span>
                        <DragNumberInput step={0.05} min={0.2} max={3.0} value={appConfig.volumetricLight?.maxRadius ?? 0.9} onChange={val => updateVolumetric('maxRadius', val)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Podsekce: Kvalita a Vyhlazení */}
                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('vl-quality')}
                  >
                    <span>🔬 Vyhlazení & Dithering (Anti-Banding)</span>
                    <span>{openSections['vl-quality'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['vl-quality'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Síla Ditheringu (Jitter):</label>
                        <span className="input-desc">1 = naprosto hladké celistvé paprsky, 0 = zřetelné proužky/zuby</span>
                        <DragNumberInput step={0.1} min={0} max={1} value={appConfig.volumetricLight?.ditherStrength ?? 1.0} onChange={val => updateVolumetric('ditherStrength', val)} />
                      </div>
                      <div className="input-group">
                        <label>Měkkost prahu (Smooth Threshold):</label>
                        <span className="input-desc">Šířka prolínání světla na hranách objektů pro jemnější okraje</span>
                        <DragNumberInput step={0.02} min={0.01} max={0.5} value={appConfig.volumetricLight?.smoothThreshold ?? 0.15} onChange={val => updateVolumetric('smoothThreshold', val)} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* VOLUMETRICKÁ MLHA & STÍNY UVNITŘ (INSIDE FOG & SHADOWS) */}
          <div className="editor-section">
            <h4 
              style={{ color: '#06b6d4', borderBottomColor: 'rgba(6, 182, 212, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('inside-fog-section')}
            >
              <span>🌫️ Inside Volumetric Fog (3 Fogy & Stíny)</span>
              <span>{openSections['inside-fog-section'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['inside-fog-section'] && (
              <>
                {/* HLAVNÍ MASTER SLIDER: CELKOVÁ INTENZITA MLHY */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.18) 0%, rgba(14, 165, 233, 0.08) 100%)',
                  border: '1px solid rgba(6, 182, 212, 0.45)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: '0 4px 12px rgba(6, 182, 212, 0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>🎛️</span>
                      <div>
                        <span style={{ fontSize: '0.92rem', fontWeight: 'bold', color: '#67e8f9', display: 'block' }}>
                          Celková intenzita mlhy (Master Fog)
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          Jednotný slider pro hustotu a svítivost všech typů mlh
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ 
                        fontWeight: 'bold', 
                        fontSize: '1.05rem', 
                        color: '#38bdf8', 
                        background: 'rgba(0,0,0,0.5)', 
                        padding: '3px 10px', 
                        borderRadius: '6px',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        minWidth: '58px',
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        {appConfig.insideFog?.masterFogIntensity ?? 100} %
                      </span>
                      {[25, 50, 75, 100].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => updateInsideFog('masterFogIntensity', pct)}
                          style={{
                            background: (appConfig.insideFog?.masterFogIntensity ?? 100) === pct ? 'rgba(6, 182, 212, 0.4)' : 'rgba(255,255,255,0.06)',
                            border: '1px solid ' + ((appConfig.insideFog?.masterFogIntensity ?? 100) === pct ? 'rgba(6, 182, 212, 0.6)' : 'rgba(255,255,255,0.12)'),
                            color: (appConfig.insideFog?.masterFogIntensity ?? 100) === pct ? '#67e8f9' : '#94a3b8',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            fontWeight: (appConfig.insideFog?.masterFogIntensity ?? 100) === pct ? '700' : '500'
                          }}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', minWidth: '22px' }}>0%</span>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="1"
                      value={appConfig.insideFog?.masterFogIntensity ?? 100}
                      onChange={e => updateInsideFog('masterFogIntensity', Number(e.target.value))}
                      style={{
                        flex: 1,
                        accentColor: '#06b6d4',
                        cursor: 'pointer',
                        height: '8px'
                      }}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b', minWidth: '32px', textAlign: 'right' }}>100%</span>
                  </div>

                  <span className="input-desc" style={{ color: '#94a3b8', fontSize: '0.74rem', margin: 0, lineHeight: 1.4 }}>
                    💡 <b>100 % = ideální maximum</b> (aktuálně sesynchronizované hodnoty v sekcích níže). Slider škáluje proudění hustoty a jasu přímo do kódu bez přepisování čísel v editovacích polích.
                  </span>
                </div>

                {/* OVLÁDACÍ PANEL: RYCHLÉ VYPÍNÁNÍ A SOLO PRO JEDNOTLIVÉ VRSTVY */}
                <div style={{
                  background: 'rgba(6, 182, 212, 0.08)',
                  border: '1px solid rgba(6, 182, 212, 0.25)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#06b6d4' }}>
                      👁️ Izolace a vypínání vrstev mlhy
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAppConfig(prev => ({
                          ...prev,
                          insideFog: {
                            ...(prev.insideFog || {}),
                            enableMouseFog: true,
                            enableDepthFog: true,
                            enableForegroundFog: true,
                            enableVignette: true,
                            enableSmoke: true
                          }
                        }));
                      }}
                      style={{
                        background: 'rgba(6, 182, 212, 0.2)',
                        border: '1px solid rgba(6, 182, 212, 0.4)',
                        color: '#67e8f9',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      Zapnout vše (All ON)
                    </button>
                  </div>

                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Zaškrtni pro zapnutí/vypnutí, nebo klikni na <b>Solo</b> pro zobrazení pouze dané vrstvy:
                  </span>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', marginTop: '2px' }}>
                    {[
                      { key: 'enableMouseFog', label: '🕯️ Myš & stíny' },
                      { key: 'enableDepthFog', label: '🌫️ Hloubka (3D)' },
                      { key: 'enableForegroundFog', label: '👁️ Popředí (24/7)' },
                      { key: 'enableVignette', label: '📺 Viněta' },
                      { key: 'enableSmoke', label: '💨 Kouř / šum' }
                    ].map(layer => {
                      const isEnabled = appConfig.insideFog?.[layer.key] ?? true;
                      return (
                        <div key={layer.key} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isEnabled ? 'rgba(6, 182, 212, 0.15)' : 'rgba(0,0,0,0.3)',
                          border: isEnabled ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          padding: '4px 6px'
                        }}>
                          <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            color: isEnabled ? '#fff' : '#64748b',
                            userSelect: 'none',
                            margin: 0
                          }}>
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={e => updateInsideFog(layer.key, e.target.checked)}
                              style={{ cursor: 'pointer' }}
                            />
                            {layer.label}
                          </label>

                          <button
                            type="button"
                            title={`Zobrazit pouze ${layer.label}`}
                            onClick={() => {
                              setAppConfig(prev => ({
                                ...prev,
                                insideFog: {
                                  ...(prev.insideFog || {}),
                                  enableMouseFog: layer.key === 'enableMouseFog',
                                  enableDepthFog: layer.key === 'enableDepthFog',
                                  enableForegroundFog: layer.key === 'enableForegroundFog',
                                  enableVignette: layer.key === 'enableVignette',
                                  enableSmoke: layer.key === 'enableSmoke' ? true : (prev.insideFog?.enableSmoke ?? true)
                                }
                              }));
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.1)',
                              border: 'none',
                              color: '#cbd5e1',
                              borderRadius: '3px',
                              padding: '2px 5px',
                              fontSize: '0.66rem',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            Solo
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 1. FOG: MLHA A STÍNY Z MYŠI */}
                <div className="editor-subsection">
                  <h5 className="editor-subsection-header" onClick={() => toggleSection('fog-basics')}>
                    <span>🕯️ 1. Mlha z myši (Kruh s postupnou ztrátou + Stíny)</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: (appConfig.insideFog?.enableMouseFog ?? true) ? '#10b981' : '#6b7280' }}>
                        {(appConfig.insideFog?.enableMouseFog ?? true) ? '● ON' : '○ OFF'}
                      </span>
                      <span>{openSections['fog-basics'] ? '▲' : '▼'}</span>
                    </span>
                  </h5>
                  {openSections['fog-basics'] && (
                    <div className="editor-subsection-content">
                      <div className="checkbox-group" style={{ marginBottom: '6px' }}>
                        <label>
                          <input 
                            type="checkbox" 
                            checked={appConfig.insideFog?.enableMouseFog ?? true} 
                            onChange={e => updateInsideFog('enableMouseFog', e.target.checked)} 
                          />
                          Povolit světlo a stíny z myši
                        </label>
                      </div>
                      <div className="input-group">
                        <label>Dosah kruhu světla (Light Radius):</label>
                        <span className="input-desc">Poloměr kruhu světla kolem kurzoru myši s postupným útlumem</span>
                        <DragNumberInput step={0.05} min={0.05} max={3.0} value={appConfig.insideFog?.mouseLightRadius ?? 0.2} onChange={val => updateInsideFog('mouseLightRadius', val)} />
                      </div>
                      <div className="input-group">
                        <label>Intenzita světla z myši (Light Exposure):</label>
                        <span className="input-desc">Jas kruhového záření a kuželu světla z myši</span>
                        <DragNumberInput step={0.05} min={0} max={3.0} value={appConfig.insideFog?.mouseLightExposure ?? 0.3} onChange={val => updateInsideFog('mouseLightExposure', val)} />
                      </div>
                      <div className="input-group">
                        <label>Síla vržených stínů (Shadow Strength):</label>
                        <span className="input-desc">Jak hlubokou tmu vrhají objekty za sebou směrem od myši (0 = bez stínů, 1 = hluboké kužely tmy)</span>
                        <DragNumberInput step={0.05} min={0} max={1} value={appConfig.insideFog?.shadowStrength ?? 1.0} onChange={val => updateInsideFog('shadowStrength', val)} />
                      </div>
                      <div className="input-group">
                        <label>Práh stínění (Shadow Threshold):</label>
                        <span className="input-desc">Osvětlené povrchy nad tímto prahem propouštějí světlo, tmavé vrhají stín</span>
                        <DragNumberInput step={0.02} min={0.02} max={1.0} value={appConfig.insideFog?.shadowThreshold ?? 0.14} onChange={val => updateInsideFog('shadowThreshold', val)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. FOG: HLOUBKOVÁ MLHA */}
                <div className="editor-subsection">
                  <h5 className="editor-subsection-header" onClick={() => toggleSection('fog-depth')}>
                    <span>🌫️ 2. Hloubková mlha (Depth-Aware Fog)</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: (appConfig.insideFog?.enableDepthFog ?? true) ? '#10b981' : '#6b7280' }}>
                        {(appConfig.insideFog?.enableDepthFog ?? true) ? '● ON' : '○ OFF'}
                      </span>
                      <span>{openSections['fog-depth'] ? '▲' : '▼'}</span>
                    </span>
                  </h5>
                  {openSections['fog-depth'] && (
                    <div className="editor-subsection-content">
                      <div className="checkbox-group" style={{ marginBottom: '6px' }}>
                        <label>
                          <input 
                            type="checkbox" 
                            checked={appConfig.insideFog?.enableDepthFog ?? true} 
                            onChange={e => updateInsideFog('enableDepthFog', e.target.checked)} 
                          />
                          Povolit hloubkovou mlhu (3D Z-Buffer)
                        </label>
                      </div>
                      <div className="input-group">
                        <label>Barva mlhy (Fog Color):</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            type="color" 
                            value={appConfig.insideFog?.fogColor || '#0b0e14'} 
                            onChange={e => updateInsideFog('fogColor', e.target.value)} 
                          />
                          <span style={{ fontSize: '0.8rem', color: '#888' }}>{appConfig.insideFog?.fogColor || '#0b0e14'}</span>
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Základní jas mlhy v prostoru (Ambient Light):</label>
                        <span className="input-desc">Jak silně je mlha vidět a osvětluje celý prostor (nezávisle na myši)</span>
                        <DragNumberInput step={0.05} min={0} max={2.5} value={appConfig.insideFog?.baseFogBrightness ?? 0.6} onChange={val => updateInsideFog('baseFogBrightness', val)} />
                      </div>
                      <div className="input-group">
                        <label>Hustota mlhy (Fog Density):</label>
                        <span className="input-desc">Hustota prostorové mlhy pohlcující vzdálenější objekty v prostoru</span>
                        <DragNumberInput step={0.05} min={0} max={1.5} value={appConfig.insideFog?.fogDensity ?? 0.65} onChange={val => updateInsideFog('fogDensity', val)} />
                      </div>
                      <div className="input-group">
                        <label>Začátek mlhy (Fog Near):</label>
                        <span className="input-desc">Vzdálenost od kamery ve 3D, kde mlha začíná</span>
                        <DragNumberInput step={0.5} min={0.1} max={10} value={appConfig.insideFog?.fogNear ?? 1.0} onChange={val => updateInsideFog('fogNear', val)} />
                      </div>
                      <div className="input-group">
                        <label>Konec mlhy (Fog Far):</label>
                        <span className="input-desc">Vzdálenost od kamery ve 3D, kde je mlha 100% neprůhledná</span>
                        <DragNumberInput step={1} min={2} max={40} value={appConfig.insideFog?.fogFar ?? 14.0} onChange={val => updateInsideFog('fogFar', val)} />
                      </div>
                      <div className="input-group">
                        <label>Křivka náběhu / rychlost vzrůstu (Fog Curve):</label>
                        <span className="input-desc">1.0 = lineární diagonála, 2.0 až 5.0 = pomalý, jemný náběh od začátku, který pozvolna houstne do dálky</span>
                        <DragNumberInput step={0.1} min={0.5} max={6.0} value={appConfig.insideFog?.fogCurve ?? 2.2} onChange={val => updateInsideFog('fogCurve', val)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. FOG: POPŘEDOVÁ & VINĚTOVÁ MLHA DISPLEJE */}
                <div className="editor-subsection">
                  <h5 className="editor-subsection-header" onClick={() => toggleSection('fog-vignette')}>
                    <span>📺 3. Popředová & Vinětová mlha (Foreground & Vignette Fog)</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: ((appConfig.insideFog?.enableForegroundFog ?? true) || (appConfig.insideFog?.enableVignette ?? true)) ? '#10b981' : '#6b7280' }}>
                        {((appConfig.insideFog?.enableForegroundFog ?? true) || (appConfig.insideFog?.enableVignette ?? true)) ? '● ON' : '○ OFF'}
                      </span>
                      <span>{openSections['fog-vignette'] ? '▲' : '▼'}</span>
                    </span>
                  </h5>
                  {openSections['fog-vignette'] && (
                    <div className="editor-subsection-content">
                      <div className="checkbox-group" style={{ marginBottom: '6px' }}>
                        <label>
                          <input 
                            type="checkbox" 
                            checked={appConfig.insideFog?.enableForegroundFog ?? true} 
                            onChange={e => updateInsideFog('enableForegroundFog', e.target.checked)} 
                          />
                          Povolit popředovou mlhu (24/7 před stíny)
                        </label>
                        <label>
                          <input 
                            type="checkbox" 
                            checked={appConfig.insideFog?.enableVignette ?? true} 
                            onChange={e => updateInsideFog('enableVignette', e.target.checked)} 
                          />
                          Povolit vinětovou mlhu displeje
                        </label>
                      </div>

                      <div className="input-group">
                        <label>Popředová mlha před stíny (Foreground Fog):</label>
                        <span className="input-desc">Množství mlhy přímo před kamerou – svítí 24/7 a je vidět všude i přes vržené stíny</span>
                        <DragNumberInput step={0.05} min={0} max={1.0} value={appConfig.insideFog?.foregroundFog ?? 0.35} onChange={val => updateInsideFog('foregroundFog', val)} />
                      </div>
                      <div className="input-group">
                        <label>Síla vinětové mlhy (Vignette Strength):</label>
                        <span className="input-desc">Vinětový opar rámující obrazovku</span>
                        <DragNumberInput step={0.05} min={0} max={1.0} value={appConfig.insideFog?.vignetteStrength ?? 0.35} onChange={val => updateInsideFog('vignetteStrength', val)} />
                      </div>

                      <div className="checkbox-group" style={{ margin: '4px 0' }}>
                        <label>
                          <input 
                            type="checkbox" 
                            checked={appConfig.insideFog?.vignetteInvert ?? false} 
                            onChange={e => updateInsideFog('vignetteInvert', e.target.checked)} 
                          />
                          Invertovat směr viněty (mlha ve středu vs na okrajích)
                        </label>
                      </div>

                      <div className="input-group">
                        <label>Kulatost viněty (Vignette Roundness):</label>
                        <span className="input-desc">1 = dokonalý kruh na displeji, 0 = širokoúhlá elipsa</span>
                        <DragNumberInput step={0.05} min={0} max={1.0} value={appConfig.insideFog?.vignetteRoundness ?? 1.0} onChange={val => updateInsideFog('vignetteRoundness', val)} />
                      </div>

                      <div className="input-group">
                        <label>Organičnost viněty (Vignette Smoke Influence):</label>
                        <span className="input-desc">0 = hladký sametový kruh, 1 = silně modulovaná kouřem</span>
                        <DragNumberInput step={0.02} min={0} max={1.0} value={appConfig.insideFog?.vignetteOrganic ?? 0.1} onChange={val => updateInsideFog('vignetteOrganic', val)} />
                      </div>

                      <div className="input-group">
                        <label>Zhasnutí na okrajích displeje (Edge Fade):</label>
                        <span className="input-desc">Šířka plynulého vymizení mlhy u samých okrajů obrazovky pro čistý rám</span>
                        <DragNumberInput step={0.02} min={0.01} max={0.4} value={appConfig.insideFog?.edgeFade ?? 0.12} onChange={val => updateInsideFog('edgeFade', val)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. ORGANICKÝ KOUŘ */}
                <div className="editor-subsection">
                  <h5 className="editor-subsection-header" onClick={() => toggleSection('fog-smoke')}>
                    <span>💨 4. Organický kouř (Smoke Motion)</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: (appConfig.insideFog?.enableSmoke ?? true) ? '#10b981' : '#6b7280' }}>
                        {(appConfig.insideFog?.enableSmoke ?? true) ? '● ON' : '○ OFF'}
                      </span>
                      <span>{openSections['fog-smoke'] ? '▲' : '▼'}</span>
                    </span>
                  </h5>
                  {openSections['fog-smoke'] && (
                    <div className="editor-subsection-content">
                      <div className="checkbox-group" style={{ marginBottom: '6px' }}>
                        <label>
                          <input 
                            type="checkbox" 
                            checked={appConfig.insideFog?.enableSmoke ?? true} 
                            onChange={e => updateInsideFog('enableSmoke', e.target.checked)} 
                          />
                          Povolit vlnění kouře (Simplex FBM šum)
                        </label>
                      </div>

                      <div className="input-group">
                        <label>Směr proudění / větru (Wind Angle):</label>
                        <span className="input-desc">Úhel v prostoru (0° = vpravo, 90° = nahoru, 180° = vlevo, 270° = dolů)</span>
                        <DragNumberInput step={5} min={0} max={360} value={appConfig.insideFog?.smokeAngle ?? 135} onChange={val => updateInsideFog('smokeAngle', val)} />
                      </div>
                      <div className="input-group">
                        <label>Síla kouře (Smoke Strength):</label>
                        <span className="input-desc">Vlnění a textura kouřového oparu v mlze</span>
                        <DragNumberInput step={0.05} min={0} max={1.0} value={appConfig.insideFog?.smokeStrength ?? 0.79} onChange={val => updateInsideFog('smokeStrength', val)} />
                      </div>
                      <div className="input-group">
                        <label>Rychlost kouře (Smoke Speed):</label>
                        <span className="input-desc">Rychlost proudění a dýchání kouřového oparu</span>
                        <DragNumberInput step={0.05} min={0} max={3.0} value={appConfig.insideFog?.smokeSpeed ?? 1.37} onChange={val => updateInsideFog('smokeSpeed', val)} />
                      </div>
                      <div className="input-group">
                        <label>Měřítko kouře (Smoke Scale):</label>
                        <span className="input-desc">Hustota a velikost kouřových vírů v prostoru</span>
                        <DragNumberInput step={0.5} min={1.0} max={15.0} value={appConfig.insideFog?.smokeScale ?? 4.5} onChange={val => updateInsideFog('smokeScale', val)} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 2. POZADÍ A HDRI (DARK STUDIO) */}
          <div className="editor-section">
            <h4 
              style={{ color: '#8b5cf6', borderBottomColor: 'rgba(139, 92, 246, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-background-dark')}
            >
              <span>🌌 Pozadí & HDRI (Dark Studio)</span>
              <span>{openSections['global-background-dark'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-background-dark'] && (
              <>
                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('bg-pbr')}
                  >
                    <span>💎 PBR Odlesky prostředí</span>
                    <span>{openSections['bg-pbr'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['bg-pbr'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Intenzita HDRI odlesků (Environment):</label>
                        <span className="input-desc">Síla PBR odlesků města/studia na skleněných deskách a kuličkách</span>
                        <DragNumberInput step={0.1} min={0} max={5} value={appConfig.environmentIntensity ?? 0.8} onChange={val => updateConfig('environmentIntensity', val)} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('bg-gradient')}
                  >
                    <span>🎨 Gradient studiového pozadí</span>
                    <span>{openSections['bg-gradient'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['bg-gradient'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Barva středu pozadí:</label>
                        <span className="input-desc">Hluboký tmavý odstín v přímém pohledu kamery</span>
                        <input 
                          type="color" 
                          value={appConfig.backgroundSettings?.centerColor || '#060608'} 
                          onChange={e => updateBackground('centerColor', e.target.value)} 
                        />
                      </div>
                      <div className="input-group">
                        <label>Barva okrajů pozadí (Rim Glow):</label>
                        <span className="input-desc">Světlejší stříbřitý tón na okrajích a horizontu</span>
                        <input 
                          type="color" 
                          value={appConfig.backgroundSettings?.edgeColor || '#232630'} 
                          onChange={e => updateBackground('edgeColor', e.target.value)} 
                        />
                      </div>
                      <div className="input-group">
                        <label>Strmost přechodu (Rim Power):</label>
                        <span className="input-desc">Křivka přechodu mezi středem a okrajem (vyšší = užší lem na kraji)</span>
                        <DragNumberInput step={0.1} min={0.5} max={8.0} value={appConfig.backgroundSettings?.rimPower ?? 2.2} onChange={val => updateBackground('rimPower', val)} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 3. KAMERA A OSVĚTLENÍ */}
          <div className="editor-section">
            <h4 
              style={{ color: '#3b82f6', borderBottomColor: 'rgba(59, 130, 246, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-kamera')}
            >
              <span>🎥 Kamera & Přímé osvětlení</span>
              <span>{openSections['global-kamera'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-kamera'] && (
              <>
                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('cam-rig')}
                  >
                    <span>🔭 Kamerový Rig</span>
                    <span>{openSections['cam-rig'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['cam-rig'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Zorné pole kamery (FOV):</label>
                        <span className="input-desc">Šířka zorného úhlu kamery v ORBIT módu</span>
                        <DragNumberInput step={1} value={appConfig.cameraFov || 60} onChange={val => updateConfig('cameraFov', val)} />
                      </div>
                      <div className="input-group">
                        <label>Výška kamery (Y os):</label>
                        <span className="input-desc">Vertikální výška kamery nad středem scény</span>
                        <DragNumberInput step={0.1} value={appConfig.cameraHeight ?? 1.5} onChange={val => updateConfig('cameraHeight', val)} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('cam-direct-light')}
                  >
                    <span>🔦 Přímé scénické světlo</span>
                    <span>{openSections['cam-direct-light'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['cam-direct-light'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Intenzita kuželového světla (SpotLight):</label>
                        <span className="input-desc">Hlavní kuželové scénické světlo shora</span>
                        <DragNumberInput step={0.1} min={0} value={appConfig.hdriIntensity ?? 1} onChange={val => updateConfig('hdriIntensity', val)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* ČELNÍ SPOTLIGHT Z KAMERY (FOLLOW SPOT) */}
                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('cam-spotlight')}
                  >
                    <span>🎯 Čelní reflektor z kamery (Follow Spot)</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: (appConfig.cameraSpotLight?.enabled ?? true) ? '#10b981' : '#6b7280' }}>
                        {(appConfig.cameraSpotLight?.enabled ?? true) ? '● ON' : '○ OFF'}
                      </span>
                      <span>{openSections['cam-spotlight'] ? '▲' : '▼'}</span>
                    </span>
                  </h5>
                  {openSections['cam-spotlight'] && (
                    <div className="editor-subsection-content">
                      <div className="checkbox-group" style={{ marginBottom: '6px' }}>
                        <label>
                          <input 
                            type="checkbox" 
                            checked={appConfig.cameraSpotLight?.enabled ?? true} 
                            onChange={e => updateCameraSpotLight('enabled', e.target.checked)} 
                          />
                          Aktivovat čelní spot světlo
                        </label>
                      </div>

                      <div className="input-group">
                        <label>Intenzita světla (Intensity):</label>
                        <span className="input-desc">Jas čelního kuželu mířícího z kamery do středu</span>
                        <DragNumberInput step={1} min={0} max={200} value={appConfig.cameraSpotLight?.intensity ?? 25} onChange={val => updateCameraSpotLight('intensity', val)} />
                      </div>

                      <div className="input-group">
                        <label>Barva světla (Color):</label>
                        <span className="input-desc">Barevný tón osvětlení středu scény</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            type="color" 
                            value={appConfig.cameraSpotLight?.color || '#ffffff'} 
                            onChange={e => updateCameraSpotLight('color', e.target.value)} 
                          />
                          <span style={{ fontSize: '0.8rem', color: '#888' }}>{appConfig.cameraSpotLight?.color || '#ffffff'}</span>
                        </div>
                      </div>

                      <div className="input-group">
                        <label>Šířka kuželu / Úhel (Angle):</label>
                        <span className="input-desc">Rozptyl světelného kuželu (0.2 úzký bod, 0.85 střed, 1.5 široký reflektor)</span>
                        <DragNumberInput step={0.05} min={0.1} max={1.55} value={appConfig.cameraSpotLight?.angle ?? 0.85} onChange={val => updateCameraSpotLight('angle', val)} />
                      </div>

                      <div className="input-group">
                        <label>Falloff okrajů / Měkkost (Penumbra):</label>
                        <span className="input-desc">Měkkost přechodu od středu ke kraji kuželu (0 = ostrý kruh, 1 = plynulý měkký gradient od středu)</span>
                        <DragNumberInput step={0.05} min={0} max={1} value={appConfig.cameraSpotLight?.penumbra ?? 0.85} onChange={val => updateCameraSpotLight('penumbra', val)} />
                      </div>

                      <div className="input-group">
                        <label>Posun myší (Mouse Offset):</label>
                        <span className="input-desc">Mírné vychýlení světla od středu podle polohy myši (0 = pevně na střed, 1.5 = jemný náklon)</span>
                        <DragNumberInput step={0.1} min={0} max={8} value={appConfig.cameraSpotLight?.mouseOffset ?? 1.5} onChange={val => updateCameraSpotLight('mouseOffset', val)} />
                      </div>

                      <div className="input-group">
                        <label>Útlum se vzdáleností (Decay):</label>
                        <span className="input-desc">0 = rovnoměrné osvětlení nezávislé na vzdálenosti kamery, 1 - 2 = fyzikální útlum</span>
                        <DragNumberInput step={0.1} min={0} max={2} value={appConfig.cameraSpotLight?.decay ?? 0} onChange={val => updateCameraSpotLight('decay', val)} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 4. FYZIKA ROTACE A GEST */}
          <div className="editor-section">
            <h4 
              style={{ color: '#3b82f6', borderBottomColor: 'rgba(59, 130, 246, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-fyzika')}
            >
              <span>🌀 Fyzika rotace & Gesta</span>
              <span>{openSections['global-fyzika'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-fyzika'] && (
              <>
                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('phys-springs')}
                  >
                    <span>⚡ Pružiny & Setrvačnost (Springs)</span>
                    <span>{openSections['phys-springs'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['phys-springs'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Hmotnost (Mass):</label>
                        <span className="input-desc">Tíha a setrvačnost při roztočení kruhu projektů</span>
                        <DragNumberInput step={0.1} value={appConfig.physics?.mass || 2.5} onChange={val => updatePhysics('mass', val)} />
                      </div>
                      <div className="input-group">
                        <label>Pružnost (Tension):</label>
                        <span className="input-desc">Síla pružiny přitahující pohled k nejbližší desce</span>
                        <DragNumberInput step={10} value={appConfig.physics?.tension || 500} onChange={val => updatePhysics('tension', val)} />
                      </div>
                      <div className="input-group">
                        <label>Tření (Friction):</label>
                        <span className="input-desc">Tlumení a rychlost dobrzdění po švihu</span>
                        <DragNumberInput step={1} value={appConfig.physics?.friction || 100} onChange={val => updatePhysics('friction', val)} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('phys-gestures')}
                  >
                    <span>👆 Gesta & Kolečko myši</span>
                    <span>{openSections['phys-gestures'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['phys-gestures'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Citlivost tahu (Swipe Velocity):</label>
                        <span className="input-desc">Práh rychlosti gesta pro přeskok na další projekt</span>
                        <DragNumberInput step={0.1} value={appConfig.physics?.swipeVelocityThreshold || 0.5} onChange={val => updatePhysics('swipeVelocityThreshold', val)} />
                      </div>
                      <div className="input-group">
                        <label>Kroků scrollu na portfolio:</label>
                        <span className="input-desc">Počet záseků kolečka myši pro otočení o jeden projekt</span>
                        <DragNumberInput step={1} min={1} value={appConfig.scrollStepsPerPortfolio ?? 5} onChange={val => updateConfig('scrollStepsPerPortfolio', Math.max(1, Math.round(val)))} />
                      </div>
                      <div className="input-group">
                        <label>Rychlost / citlivost scrollu:</label>
                        <span className="input-desc">Globální násobič citlivosti kolečka</span>
                        <DragNumberInput step={0.1} min={0.1} value={appConfig.scrollSpeed ?? 1.0} onChange={val => updateConfig('scrollSpeed', val)} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 5. HUDEBNÍ PŘEHRÁVAČ */}
          <div className="editor-section">
            <h4 
              style={{ color: '#3b82f6', borderBottomColor: 'rgba(59, 130, 246, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-hudba')}
            >
              <span>🎵 Hudební přehrávač (HUD)</span>
              <span>{openSections['global-hudba'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-hudba'] && (
              <div className="editor-subsection-content">
                <div className="input-group">
                  <label>Hlasitost hudby (0 - 1):</label>
                  <span className="input-desc">Výchozí úroveň hlasitosti při spuštění</span>
                  <DragNumberInput step={0.05} min={0} max={1} value={appConfig.musicVolume ?? 0.4} onChange={val => updateConfig('musicVolume', val)} />
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem', lineHeight: '1.4' }}>
                  📁 <b>Složka pro hudbu:</b> <code>/public/music/</code><br/>
                  📝 <b>Seznam skladeb:</b> <code>src/tracks.json</code>
                </div>
              </div>
            )}
          </div>

          {/* 6. FYZIKA ČÁSTIC A INTERAKCE */}
          <div className="editor-section">
            <h4 
              style={{ color: '#3b82f6', borderBottomColor: 'rgba(59, 130, 246, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-castice')}
            >
              <span>💥 Fyzika částic & Interakce</span>
              <span>{openSections['global-castice'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-castice'] && (
              <>
                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('part-float')}
                  >
                    <span>🌊 Levitace & Návrat částic</span>
                    <span>{openSections['part-float'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['part-float'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Síla levitování (Rozkmit):</label>
                        <span className="input-desc">Výška vertikálního vlnění částic</span>
                        <DragNumberInput step={0.01} value={appConfig.particlePhysics?.floatAmplitude ?? 0.1} onChange={val => updateParticlePhysics('floatAmplitude', val)} />
                      </div>
                      <div className="input-group">
                        <label>Rychlost levitování:</label>
                        <span className="input-desc">Frekvence a tempo pulzujícího pohybu</span>
                        <DragNumberInput step={0.1} value={appConfig.particlePhysics?.floatSpeed ?? 1.0} onChange={val => updateParticlePhysics('floatSpeed', val)} />
                      </div>
                      <div className="input-group">
                        <label>Rychlost návratu částic (Return Speed):</label>
                        <span className="input-desc">Rychlost, jakou se částice vrací do původního tvaru po odfouknutí</span>
                        <DragNumberInput step={0.01} value={appConfig.particlePhysics?.returnSpeed ?? 0.05} onChange={val => updateParticlePhysics('returnSpeed', val)} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="editor-subsection">
                  <h5 
                    className="editor-subsection-header"
                    onClick={() => toggleSection('part-mouse')}
                  >
                    <span>⚔️ Interakce myší (Laser / Lightsaber)</span>
                    <span>{openSections['part-mouse'] ? '▲' : '▼'}</span>
                  </h5>
                  {openSections['part-mouse'] && (
                    <div className="editor-subsection-content">
                      <div className="input-group">
                        <label>Síla odfouknutí myší:</label>
                        <span className="input-desc">Síla tlakového impulsu při rychlém pohybu kurzoru</span>
                        <DragNumberInput step={0.1} value={appConfig.particlePhysics?.mouseForce ?? 1.0} onChange={val => updateParticlePhysics('mouseForce', val)} />
                      </div>
                      <div className="input-group">
                        <label>Průměr efektu myši (Radius):</label>
                        <span className="input-desc">Akční rádius tlakové vlny od kurzoru</span>
                        <DragNumberInput step={0.1} value={appConfig.particlePhysics?.mouseRadius ?? 2.0} onChange={val => updateParticlePhysics('mouseRadius', val)} />
                      </div>
                      <div className="input-group">
                        <label>Délka průniku (Laser Length):</label>
                        <span className="input-desc">Hloubka laserového paprsku do prostoru scény</span>
                        <DragNumberInput step={0.1} value={appConfig.particlePhysics?.laserLength ?? 5.0} onChange={val => updateParticlePhysics('laserLength', val)} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 7. POZADÍ PROSTORU (VÁLEC) */}
          <div className="editor-section">
            <h4 
              style={{ color: '#10b981', borderBottomColor: 'rgba(16, 185, 129, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-background-cylinder')}
            >
              <span>🏛️ Pozadí prostoru (Abstraktní Válec)</span>
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
                    />
                    Zobrazit částicový sloup v pozadí
                  </label>
                  <span className="input-desc" style={{ width: '100%' }}>Aktivuje vnější částicový válec v pozadí</span>
                </div>

                {appConfig.cylinderSettings?.hasParticles !== false && (
                  <ParticleSettingsPanel 
                    settings={{ shape: 'cylinder', count: 10000, radius: 8.0, height: 40.0, objectY: 0, objectZ: 0, colorMode: 'video', baseColor: '#3b82f6', ...appConfig.cylinderSettings }}
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

          {/* 8. VOLUMETRICKÉ VIDEO & PROSTOROVÝ PRŮHLED (ACTIVE THEORY) */}
          <div className="editor-section">
            <h4 
              style={{ color: '#06b6d4', borderBottomColor: 'rgba(6, 182, 212, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-volumetric-unified')}
            >
              <span>🎬 Volumetrické video & Hloubkový průhled (Active Theory)</span>
              <span>{openSections['global-volumetric-unified'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-volumetric-unified'] && (
              <>
                {/* 1. Obrazovka & Zakřivení videa */}
                <div className="editor-subsection">
                  <h5 className="editor-subsection-header" onClick={() => toggleSection('sub-volumetric-screen')}>
                    <span>📹 1. Obrazovka & Zakřivení videa (Screen & Cylinder Curve)</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: (appConfig.volumetricVideo?.enabled ?? true) ? '#10b981' : '#6b7280' }}>
                        {(appConfig.volumetricVideo?.enabled ?? true) ? '● ON' : '○ OFF'}
                      </span>
                      <span>{openSections['sub-volumetric-screen'] ? '▲' : '▼'}</span>
                    </span>
                  </h5>
                  {openSections['sub-volumetric-screen'] && (
                    <div className="editor-subsection-content">
                      <div className="checkbox-group">
                        <label style={{ fontWeight: '600', color: '#06b6d4' }}>
                          <input 
                            type="checkbox" 
                            checked={appConfig.volumetricVideo?.enabled ?? true} 
                            onChange={e => updateVolumetricVideo('enabled', e.target.checked)} 
                          />
                          Povolit video na pozadí
                        </label>
                        <span className="input-desc" style={{ width: '100%' }}>
                          Při vstupu do projektu zobrazí video vybrané stránky v pozadí s měkkou vinětou do ztracena (bez rámečku).
                        </span>
                      </div>

                      <div className="input-group">
                        <label>Zakřivení do válce (Cylinder Curvature):</label>
                        <span className="input-desc">Prohnutí obrazovky do oblouku válce kolem kamery (0 = ploché, 0.35 = přirozený oblouk, 1.0 = výrazné zakřivení)</span>
                        <DragNumberInput step={0.05} min={-0.5} max={1.5} value={appConfig.volumetricVideo?.curvature ?? 0.35} onChange={val => updateVolumetricVideo('curvature', val)} />
                      </div>

                      <div className="input-group">
                        <label>Měřítko videa (Scale):</label>
                        <span className="input-desc">Velikost videa v prostoru (0.85 = kompaktní střed dle reference)</span>
                        <DragNumberInput step={0.05} min={0.2} max={3.0} value={appConfig.volumetricVideo?.scale ?? 0.85} onChange={val => updateVolumetricVideo('scale', val)} />
                      </div>

                      <div className="input-group">
                        <label>Vzdálenost za objekty (Z-Distance):</label>
                        <span className="input-desc">Hloubková pozice za 3D objekty scény (menší hodnota = blíž k popředí)</span>
                        <DragNumberInput step={0.1} min={0.2} max={8.0} value={appConfig.volumetricVideo?.zDistance ?? 1.4} onChange={val => updateVolumetricVideo('zDistance', val)} />
                      </div>

                      <div className="input-group">
                        <label>Měkkost viněty do ztracena (Vignette Softness):</label>
                        <span className="input-desc">Jak jemně a pozvolna okraje videa přechází do tmy (0.1 = ostrý okraj, 0.7 = velmi měkké rozplynutí)</span>
                        <DragNumberInput step={0.05} min={0.05} max={0.85} value={appConfig.volumetricVideo?.vignetteSoftness ?? 0.45} onChange={val => updateVolumetricVideo('vignetteSoftness', val)} />
                      </div>

                      <div className="input-group">
                        <label>Průhlednost videa (Opacity):</label>
                        <span className="input-desc">Celkové krytí videa na pozadí</span>
                        <DragNumberInput step={0.05} min={0} max={1.0} value={appConfig.volumetricVideo?.screenOpacity ?? 1.0} onChange={val => updateVolumetricVideo('screenOpacity', val)} />
                      </div>

                      <div className="input-group">
                        <label>Vertikální posun (Y Offset):</label>
                        <span className="input-desc">Posun videa nahoru / dolů</span>
                        <DragNumberInput step={0.05} min={-3} max={3} value={appConfig.volumetricVideo?.posY ?? 0.0} onChange={val => updateVolumetricVideo('posY', val)} />
                      </div>

                      <div className="input-group">
                        <label>Horizontální posun (X Offset):</label>
                        <span className="input-desc">Posun videa doleva / doprava</span>
                        <DragNumberInput step={0.05} min={-3} max={3} value={appConfig.volumetricVideo?.posX ?? 0.0} onChange={val => updateVolumetricVideo('posX', val)} />
                      </div>

                      <div className="input-group">
                        <label>Jas videa (Brightness):</label>
                        <span className="input-desc">Úroveň jasu a svítivosti videa</span>
                        <DragNumberInput step={0.05} min={0.2} max={2.5} value={appConfig.volumetricVideo?.brightness ?? 1.15} onChange={val => updateVolumetricVideo('brightness', val)} />
                      </div>

                      <div className="input-group">
                        <label>Kontrast videa (Contrast):</label>
                        <span className="input-desc">Kontrast obrazu videa</span>
                        <DragNumberInput step={0.05} min={0.5} max={2.0} value={appConfig.volumetricVideo?.contrast ?? 1.05} onChange={val => updateVolumetricVideo('contrast', val)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Průhled skrz objekty & Středové paprsky */}
                <div className="editor-subsection">
                  <h5 className="editor-subsection-header" onClick={() => toggleSection('sub-volumetric-depth')}>
                    <span>🌌 2. Průhled skrz objekty & Středové paprsky (Depth Ghosting & God Rays)</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: (appConfig.volumetricDepth?.enabled ?? true) ? '#10b981' : '#6b7280' }}>
                        {(appConfig.volumetricDepth?.enabled ?? true) ? '● ON' : '○ OFF'}
                      </span>
                      <span>{openSections['sub-volumetric-depth'] ? '▲' : '▼'}</span>
                    </span>
                  </h5>
                  {openSections['sub-volumetric-depth'] && (
                    <div className="editor-subsection-content">
                      <div className="checkbox-group">
                        <label style={{ fontWeight: '600', color: '#a855f7' }}>
                          <input 
                            type="checkbox" 
                            checked={appConfig.volumetricDepth?.enabled ?? true} 
                            onChange={e => updateVolumetricDepth('enabled', e.target.checked)} 
                          />
                          Povolit volumetrický průhled skrz objekty
                        </label>
                        <span className="input-desc" style={{ width: '100%' }}>
                          Od nastavené vzdálenosti od kamery začne být video lehce vidět skrz částice a 3D objekty scény.
                        </span>
                      </div>

                      <div className="input-group">
                        <label>Vzdálenost začátku průhledu od kamery (Start Distance):</label>
                        <span className="input-desc">Vzdálenost ve 3D prostoru, kde video začíná prosvítat skrz objekty (2.16 = střed světa)</span>
                        <DragNumberInput step={0.05} min={0.5} max={6.0} value={appConfig.volumetricDepth?.startDistance ?? 2.16} onChange={val => updateVolumetricDepth('startDistance', val)} />
                      </div>

                      <div className="input-group">
                        <label>Síla / viditelnost videa skrz objekty (Ghost Strength):</label>
                        <span className="input-desc">Jak silně video prosvítá přes částice a kostky (0.0 = neprůhledné objekty, 1.0 = plně viditelné)</span>
                        <DragNumberInput step={0.05} min={0.0} max={1.0} value={appConfig.volumetricDepth?.ghostStrength ?? 0.35} onChange={val => updateVolumetricDepth('ghostStrength', val)} />
                      </div>

                      <div className="input-group">
                        <label>Plynulost náběhu hloubky (Fade Range):</label>
                        <span className="input-desc">Délka přechodové zóny hloubky pro měkký náběh průhledu</span>
                        <DragNumberInput step={0.05} min={0.05} max={2.0} value={appConfig.volumetricDepth?.fadeRange ?? 0.6} onChange={val => updateVolumetricDepth('fadeRange', val)} />
                      </div>

                      <div style={{
                        marginTop: '6px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(168, 85, 247, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.8rem'
                      }}>
                        <div style={{ fontWeight: '600', color: '#c084fc', fontSize: '0.85rem' }}>
                          ✨ Středové paprsky prosvítání (Center Video God Rays)
                        </div>

                        <div className="input-group">
                          <label>Intenzita paprsků (Rays Exposure):</label>
                          <span className="input-desc">Jak silně světlo z videa prosvítá zprostředka přes objekty v popředí</span>
                          <DragNumberInput step={0.05} min={0.0} max={3.0} value={appConfig.volumetricDepth?.raysExposure ?? 1.2} onChange={val => updateVolumetricDepth('raysExposure', val)} />
                        </div>

                        <div className="input-group">
                          <label>Dosah od středu obrazovky (Rays Radius):</label>
                          <span className="input-desc">Ohraničení paprsků pouze na střed televizoru (zabraňuje dosahu do rohů obrazovky)</span>
                          <DragNumberInput step={0.05} min={0.2} max={1.2} value={appConfig.volumetricDepth?.raysRadius ?? 0.65} onChange={val => updateVolumetricDepth('raysRadius', val)} />
                        </div>

                        <div className="input-group">
                          <label>Délka paprsků (Ray Length):</label>
                          <span className="input-desc">Vzdálenost rozptylu paprsků od středu obrazu</span>
                          <DragNumberInput step={0.05} min={0.1} max={1.5} value={appConfig.volumetricDepth?.rayLength ?? 0.45} onChange={val => updateVolumetricDepth('rayLength', val)} />
                        </div>

                        <div className="input-group">
                          <label>Hustota paprsků (Ray Density):</label>
                          <span className="input-desc">Hustota a sevřenost světelného toku paprsků</span>
                          <DragNumberInput step={0.05} min={0.2} max={2.0} value={appConfig.volumetricDepth?.rayDensity ?? 1.0} onChange={val => updateVolumetricDepth('rayDensity', val)} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* STRÁNKY PORTFOLIA */}
        {pages.map((page, index) => {
          return (
            <div key={page.id} className="editor-card">
              <div className="card-header">
                <h3>📁 Stránka {index + 1}: {page.title || 'Bez názvu'}</h3>
                <button onClick={() => deletePage(page.id)} className="btn-delete">Smazat</button>
              </div>
              
              <div className="input-group">
                <label>Nadpis projektu:</label>
                <span className="input-desc">Zobrazuje se na 3D desce i v HUD rozhraní</span>
                <input type="text" value={page.title || ''} onChange={e => updatePage(page.id, 'title', e.target.value)} />
              </div>
              
              <div className="input-group">
                <label>Popis projektu:</label>
                <span className="input-desc">Doplňkový text a anotace</span>
                <textarea value={page.description || ''} onChange={e => updatePage(page.id, 'description', e.target.value)} />
              </div>
              
              <div className="input-group">
                <label>Video na desce a v pozadí:</label>
                <span className="input-desc">Video smyčka promítaná do skleněné desky a želé částic</span>
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

              {/* Sekce: MODUL OBSAH (Částice & 3D Objekty z Blenderu) */}
              <div className="editor-section">
                <h4 
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onClick={() => toggleSection(`page-particles-${page.id}`)}
                >
                  <span>📦 Modul: Obsah (Částice & Objekty)</span>
                  <span>{openSections[`page-particles-${page.id}`] ? '▲' : '▼'}</span>
                </h4>
                
                {openSections[`page-particles-${page.id}`] && (
                  <>
                    <div className="input-group checkbox-group">
                      <label style={{ fontSize: '1rem', color: '#10b981', fontWeight: 'bold' }}>
                        <input type="checkbox" checked={page.particlesSettings?.hasParticles || false} onChange={e => updateParticlesSettings(page.id, 'hasParticles', e.target.checked)} />
                        Aktivovat obsah projektu
                      </label>
                      <span className="input-desc" style={{ width: '100%' }}>Zobrazí vybrané 3D objekty a částice z Blenderu</span>
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
