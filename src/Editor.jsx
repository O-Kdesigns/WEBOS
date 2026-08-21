import React, { useState, useEffect } from 'react';
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

export function Editor({ onClose, pages, setPages, appConfig, setAppConfig }) {
  const [assets, setAssets] = useState({ models: [], images: [], videos: [] });
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState({});
  const [isTransparent, setIsTransparent] = useState(false);

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
              onClick={() => toggleSection('global-prostredi')}
            >
              Prostředí a 3D svět
              <span>{openSections['global-prostredi'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-prostredi'] && (
              <>
                <div className="input-group">
                  <label>Základní model světa (Ostrov pro všechny stránky):</label>
                  <select value={appConfig.globalSurfaceModel || ''} onChange={e => updateConfig('globalSurfaceModel', e.target.value)}>
                    <option value="">Žádný model povrchu</option>
                    {getFilteredAssets(assets.models, 'trava/').map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="input-group">
                  <label>Velikost ostrova (Horizontální škálování):</label>
                  <DragNumberInput step={0.1} value={appConfig.islandScaleHorizontal ?? 1.0} onChange={val => updateConfig('islandScaleHorizontal', val)} />
                </div>
              </>
            )}
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
                  <label>Intenzita rozmazání (Motion Blur):</label>
                  <DragNumberInput step={1} value={appConfig.blurIntensity ?? 300} onChange={val => updateConfig('blurIntensity', val)} />
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
              </div>

              {/* Sekce: MODUL POVRCH */}
              <div className="editor-section">
                <h4 
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onClick={() => toggleSection('page-povrch')}
                >
                  Modul: Povrch Ostrova
                  <span>{openSections['page-povrch'] ? '▲' : '▼'}</span>
                </h4>
                
                {openSections['page-povrch'] && (
                  <>
                    <div className="input-group">
                      <label>Jak obarvit povrch?</label>
                      <select value={ts.surfaceMode || 'color'} onChange={e => updateTravaSettings(page.id, 'surfaceMode', e.target.value)}>
                        <option value="color">Jednolitou barvou</option>
                        <option value="texture">Natažením textury (obrázku)</option>
                      </select>
                    </div>

                    {ts.surfaceMode === 'texture' ? (
                      <div className="input-group">
                        <label>Vyberte texturu povrchu:</label>
                        <select value={ts.surfaceTexture || ''} onChange={e => updateTravaSettings(page.id, 'surfaceTexture', e.target.value)}>
                          <option value="">Žádná textura</option>
                          {getFilteredAssets(assets.images, 'trava/textury_povrchu').map(img => <option key={img} value={img}>{img}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="input-group">
                        <label>Vyberte barvu povrchu:</label>
                        <input type="color" value={ts.surfaceColor || '#4d9900'} onChange={e => updateTravaSettings(page.id, 'surfaceColor', e.target.value)} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Sekce: MODUL TRÁVA */}
              <div className="editor-section">
                <h4 
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onClick={() => toggleSection('page-trava')}
                >
                  Modul: Porost a Tráva
                  <span>{openSections['page-trava'] ? '▲' : '▼'}</span>
                </h4>
                
                {openSections['page-trava'] && (
                  <>
                    <div className="input-group checkbox-group">
                      <label style={{ fontSize: '1rem', color: '#10b981', fontWeight: 'bold' }}>
                        <input type="checkbox" checked={ts.hasBasicGrass || false} onChange={e => updateTravaSettings(page.id, 'hasBasicGrass', e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                        Vygenerovat porost
                      </label>
                    </div>

                    {ts.hasBasicGrass && (
                      <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', borderLeft: '3px solid #10b981', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        
                        <div className="input-group">
                          <label>Typ modelu porostu:</label>
                          <select value={ts.grassModelType || 'basic'} onChange={e => updateTravaSettings(page.id, 'grassModelType', e.target.value)}>
                            <option value="basic">Základní 3D stébla (kužely)</option>
                            <option value="custom">Vlastní 3D model (.glb / .gltf)</option>
                          </select>
                        </div>

                        {ts.grassModelType === 'custom' && (
                          <div className="input-group">
                            <label>Vyberte vlastní 3D model (ze složky trava/):</label>
                            <select value={ts.grassCustomModel || ''} onChange={e => updateTravaSettings(page.id, 'grassCustomModel', e.target.value)}>
                              <option value="">Nevybrán model</option>
                              {getFilteredAssets(assets.models, 'trava/').map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                        )}

                        <div className="input-group">
                          <label>Jak obarvit porost?</label>
                          <select value={ts.grassColorMode || 'color'} onChange={e => updateTravaSettings(page.id, 'grassColorMode', e.target.value)}>
                            <option value="color">Jednolitou barvou</option>
                            <option value="texture">Natažením textury (obrázku)</option>
                          </select>
                        </div>

                        {ts.grassColorMode === 'texture' ? (
                          <div className="input-group">
                            <label>Vyberte texturu porostu:</label>
                            <select value={ts.grassTexture || ''} onChange={e => updateTravaSettings(page.id, 'grassTexture', e.target.value)}>
                              <option value="">Žádná textura</option>
                              {getFilteredAssets(assets.images, 'trava/textury_povrchu').map(img => <option key={img} value={img}>{img}</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="input-group">
                            <label>Vyberte barvu porostu:</label>
                            <input type="color" value={ts.grassColor || '#4a8505'} onChange={e => updateTravaSettings(page.id, 'grassColor', e.target.value)} />
                          </div>
                        )}
                        
                      </div>
                    )}
                  </>
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
                      <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', borderLeft: '3px solid #10b981', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        
                        <div className="input-group">
                          <label>Tvar částicového oblaku:</label>
                          <select value={page.particlesSettings?.shape || 'sphere'} onChange={e => updateParticlesSettings(page.id, 'shape', e.target.value)}>
                            <option value="sphere">Koule</option>
                            <option value="cube">Krychle</option>
                            <option value="cylinder">Válec</option>
                            <option value="custom">Vlastní 3D model (z obsahu)</option>
                          </select>
                        </div>
                        
                        {page.particlesSettings?.shape === 'custom' && (
                          <div className="input-group">
                            <label>Vyberte model (ze složky obsah/levitate/):</label>
                            <select value={page.particlesSettings?.customModel || ''} onChange={e => updateParticlesSettings(page.id, 'customModel', e.target.value)}>
                              <option value="">Nevybrán model</option>
                              {getFilteredAssets(assets.models, 'obsah/levitate/').map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                        )}
                        
                        {/* UMÍSTĚNÍ */}
                        <div className="editor-section" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                          <h5 
                            onClick={() => toggleSection(`part-pos-${page.id}`)} 
                            style={{ cursor: 'pointer', margin: 0, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}
                          >
                            Umístění <span>{openSections[`part-pos-${page.id}`] ? '▲' : '▼'}</span>
                          </h5>
                          {openSections[`part-pos-${page.id}`] && (
                            <div style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <div className="input-group">
                                <label>Vzdálenost od kamery (do hloubky ostrova):</label>
                                <DragNumberInput step={0.1} value={page.particlesSettings?.objectZ ?? 4.0} onChange={val => updateParticlesSettings(page.id, 'objectZ', val)} />
                              </div>
                              <div className="input-group">
                                <label>Pozice horizontálně (mínus = vlevo, plus = vpravo):</label>
                                <DragNumberInput step={0.1} value={page.particlesSettings?.objectX ?? 0.0} onChange={val => updateParticlesSettings(page.id, 'objectX', val)} />
                              </div>
                              <div className="input-group">
                                <label>Základní výška (od země):</label>
                                <DragNumberInput step={0.1} value={page.particlesSettings?.objectY ?? 2.0} onChange={val => updateParticlesSettings(page.id, 'objectY', val)} />
                              </div>
                              <div className="input-group checkbox-group" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                                <label style={{ fontSize: '0.9rem', color: '#60a5fa' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={page.particlesSettings?.isGlobalLevitating ?? false} 
                                    onChange={e => updateParticlesSettings(page.id, 'isGlobalLevitating', e.target.checked)} 
                                  />
                                  Celkové levitování a rotace oblaku
                                </label>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* MESH (Velikosti a Hustota) */}
                        <div className="editor-section" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                          <h5 
                            onClick={() => toggleSection(`part-mesh-${page.id}`)} 
                            style={{ cursor: 'pointer', margin: 0, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}
                          >
                            Mesh (Velikost a Hustota) <span>{openSections[`part-mesh-${page.id}`] ? '▲' : '▼'}</span>
                          </h5>
                          {openSections[`part-mesh-${page.id}`] && (
                            <div style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <div className="input-group">
                                <label>Základní velikost částice:</label>
                                <DragNumberInput step={0.01} value={page.particlesSettings?.baseSize ?? 0.1} onChange={val => updateParticlesSettings(page.id, 'baseSize', val)} />
                              </div>
                              <div className="input-group">
                                <label>Náhodnost velikosti (0 = stejné, 1 = divoké):</label>
                                <DragNumberInput step={0.05} value={page.particlesSettings?.sizeRandomness ?? 0.5} onChange={val => updateParticlesSettings(page.id, 'sizeRandomness', val)} />
                              </div>
                              <div className="input-group">
                                <label>Velikost oblaku (Radius):</label>
                                <DragNumberInput step={0.1} value={page.particlesSettings?.radius ?? 2.0} onChange={val => updateParticlesSettings(page.id, 'radius', val)} />
                              </div>
                              {page.particlesSettings?.shape === 'custom' ? (
                                <div className="input-group">
                                  <label>Hustota bodů (0 - 100% z originálu):</label>
                                  <DragNumberInput step={1} min={0} max={100} value={page.particlesSettings?.densityPercent ?? 100} onChange={val => updateParticlesSettings(page.id, 'densityPercent', val)} />
                                </div>
                              ) : (
                                <div className="input-group">
                                  <label>Počet částic:</label>
                                  <DragNumberInput step={100} value={page.particlesSettings?.count ?? 2000} onChange={val => updateParticlesSettings(page.id, 'count', val)} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* RENDER (Vzhled materiálu) */}
                        <div className="editor-section" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                          <h5 
                            onClick={() => toggleSection(`part-render-${page.id}`)} 
                            style={{ cursor: 'pointer', margin: 0, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}
                          >
                            Render (Vzhled materiálu) <span>{openSections[`part-render-${page.id}`] ? '▲' : '▼'}</span>
                          </h5>
                          {openSections[`part-render-${page.id}`] && (
                            <div style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <div className="input-group">
                                <label>Mód barev a materiálu:</label>
                                <select value={page.particlesSettings?.colorMode || 'single'} onChange={e => updateParticlesSettings(page.id, 'colorMode', e.target.value)}>
                                  <option value="single">Jedna barva (Metallic)</option>
                                  <option value="vertex">Vertex Colors (Z předlohy)</option>
                                  <option value="video">Lámat video z pozadí (Sklo)</option>
                                </select>
                              </div>
                              {page.particlesSettings?.colorMode === 'single' && (
                                <div className="input-group">
                                  <label>Barva kuliček:</label>
                                  <input 
                                    type="color" 
                                    value={page.particlesSettings?.baseColor || '#3b82f6'} 
                                    onChange={e => updateParticlesSettings(page.id, 'baseColor', e.target.value)} 
                                  />
                                </div>
                              )}
                              {page.particlesSettings?.colorMode === 'video' && (
                                <div className="input-group">
                                  <label>Síla refrakce (Deformace obrazu):</label>
                                  <DragNumberInput step={0.05} value={page.particlesSettings?.refractionDistortion ?? 0.15} onChange={val => updateParticlesSettings(page.id, 'refractionDistortion', val)} />
                                </div>
                              )}
                              
                              <div className="input-group" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                                <label>Metalíza (Metalness):</label>
                                <DragNumberInput step={0.05} value={page.particlesSettings?.metalness ?? 0.1} onChange={val => updateParticlesSettings(page.id, 'metalness', val)} />
                              </div>
                              <div className="input-group">
                                <label>Drsnost (Roughness):</label>
                                <DragNumberInput step={0.05} value={page.particlesSettings?.roughness ?? 0.5} onChange={val => updateParticlesSettings(page.id, 'roughness', val)} />
                              </div>

                              <div className="input-group" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                                <label>Průhlednost / Sklo (Transmission):</label>
                                <DragNumberInput step={0.05} value={page.particlesSettings?.transmission ?? 0.0} onChange={val => updateParticlesSettings(page.id, 'transmission', val)} />
                              </div>
                              <div className="input-group">
                                <label>Tloušťka hmoty / Želé (Thickness):</label>
                                <DragNumberInput step={0.1} value={page.particlesSettings?.thickness ?? 0.0} onChange={val => updateParticlesSettings(page.id, 'thickness', val)} />
                              </div>
                            </div>
                          )}
                        </div>
                        
                      </div>
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
