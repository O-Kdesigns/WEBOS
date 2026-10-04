import React, { useState, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import '../../Editor.css';
import { useEditorState } from './useEditorState';
import { withBase } from '../../assetUrl';
import { OrbitSettingsPanel } from './panels/OrbitSettingsPanel';
import { InsideSettingsPanel } from './panels/InsideSettingsPanel';
import { PageSettingsPanel } from './panels/PageSettingsPanel';
import { useAiLive } from '../../AiLiveMode';
import { useFluidView } from '../../FluidView';

export function Editor({ onClose, pages, setPages, appConfig, setAppConfig, dnaHeight360 }) {
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
    'cam-spotlight': true,
    'global-2d': true,
    'sub-2d-bottom-left': true
  });
  const [isTransparent, setIsTransparent] = useState(false);
  const [editorMode, setEditorMode] = useState('orbit');
  const [blenderNodes, setBlenderNodes] = useState([]);
  const [aiLive, setAiLive] = useAiLive();
  const [fluidView, setFluidView] = useFluidView();

  const touchSection = (sectionId) => {
    if (!sectionId) return;
    const topLevelKeys = [
      'global-2d',
      'global-power-saving',
      'global-volumetric',
      'inside-fog-section',
      'global-background-dark',
      'global-kamera',
      'global-fyzika',
      'global-hudba',
      'global-castice',
      'global-background-cylinder',
      'global-volumetric-unified'
    ];

    let targetKey = sectionId;
    if (sectionId.startsWith('sub-2d') || sectionId === 'global-2d') targetKey = 'global-2d';
    else if (sectionId.startsWith('vl-') || sectionId === 'global-volumetric') targetKey = 'global-volumetric';
    else if (sectionId.startsWith('fog-') || sectionId === 'inside-fog-section') targetKey = 'inside-fog-section';
    else if (sectionId.startsWith('bg-') || sectionId === 'global-background-dark') targetKey = 'global-background-dark';
    else if (sectionId.startsWith('cam-') || sectionId === 'global-kamera') targetKey = 'global-kamera';
    else if (sectionId.startsWith('phys-') || sectionId === 'global-fyzika') targetKey = 'global-fyzika';
    else if (sectionId.startsWith('part-') || sectionId === 'global-castice') targetKey = 'global-castice';
    else if (sectionId.startsWith('sub-volumetric') || sectionId === 'global-volumetric-unified') targetKey = 'global-volumetric-unified';

    if (!topLevelKeys.includes(targetKey)) return;

    const currentOrder = (appConfig.editorSectionOrder && Array.isArray(appConfig.editorSectionOrder))
      ? appConfig.editorSectionOrder
      : topLevelKeys;

    if (currentOrder[0] === targetKey) return;

    const newOrder = [targetKey, ...currentOrder.filter(k => k !== targetKey)];
    setAppConfig(prev => ({ ...prev, editorSectionOrder: newOrder }));
  };

  const toggleSection = (sectionId) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
    touchSection(sectionId);
  };

  useEffect(() => {
    fetch('/api/assets')
      .then(r => r.json())
      .then(data => setAssets(data));
      
    const loader = new GLTFLoader();
    loader.load(withBase('/obsah/everything/newworldorder.glb') + '?v=' + Date.now(), (gltf) => {
       const names = [];
       gltf.scene.traverse(child => {
          if (child.name && child.name !== 'Scene') {
            const isSystem = child.name === 'Cylinder' || 
                             child.name === 'dna' ||
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

  const {
    updatePage,
    updateParticlesSettings,
    updateConfig,
    updateVolumetric,
    updateInsideFog,
    updateCameraSpotLight,
    updateBackground,
    updatePhysics,
    updateParticlePhysics,
    updateDnaSettings,
    updatePowerSaving,
    updateVolumetricVideo,
    updateVolumetricDepth,
    updateUi2d,
    updateUi2dBottomLeft,
    updateUi2dBottomLeftItem,
    addUi2dBottomLeftItem,
    removeUi2dBottomLeftItem,
    updateUi2dPillButton,
    addPage,
    deletePage,
    getFilteredAssets
  } = useEditorState(pages, setPages, appConfig, setAppConfig);

  return (
    <div 
      className={`editor-overlay ${isTransparent ? 'transparent-mode' : ''}`}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className={`editor-header ${isTransparent ? 'transparent-mode' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '5px', background: 'rgba(255,255,255,0.05)', padding: '5px', borderRadius: '8px' }}>
            <button 
              onClick={() => setEditorMode('orbit')}
              style={{ background: editorMode === 'orbit' ? '#10b981' : 'transparent', color: editorMode === 'orbit' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Globální (DNA / Orbit)
            </button>
            <button 
              onClick={() => setEditorMode('inside')}
              style={{ background: editorMode === 'inside' ? '#f59e0b' : 'transparent', color: editorMode === 'inside' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Uvnitř (Detail / UI)
            </button>
            <button 
              onClick={() => setEditorMode('pages')}
              style={{ background: editorMode === 'pages' ? '#3b82f6' : 'transparent', color: editorMode === 'pages' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Stránky Portfolia
            </button>
          </div>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#ccc' }}>
            <input type="checkbox" checked={isTransparent} onChange={e => setIsTransparent(e.target.checked)} />
            Průhledný režim (vidět scénu)
          </label>
          {/* AI živý render: plný render i bez fokusu / v neaktivním tabu (src/AiLiveMode.js). Jen tento prohlížeč, jde i přes ?ai=1 / ?ai=0. */}
          <label
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#ccc' }}
            title="Plný render i když okno nemá fokus nebo je tab na pozadí (pro práci s Claude). Vypnuto = platí powerSaving z configu. Pamatuje si to jen tento prohlížeč; jde i přes ?ai=1 / ?ai=0."
          >
            <input type="checkbox" checked={aiLive} onChange={e => setAiLive(e.target.checked)} />
            🤖 AI živý render
          </label>
          {/* Náhled 2D vody, ze které particly berou proud myši (src/FluidView.jsx). 0 = vypnuto, nic se nekreslí. */}
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#ccc' }}
            title="Průhlednost náhledu neviditelné 2D simulace vody (barva = směr proudu). Na 0 se vůbec nekreslí. Pamatuje si to jen tento prohlížeč."
          >
            💧 2D voda
            <input type="range" min={0} max={1} step={0.05} value={fluidView} onChange={e => setFluidView(e.target.value)} style={{ width: 90 }} />
            <span style={{ width: 32, textAlign: 'right' }}>{Math.round(fluidView * 100)}%</span>
          </label>
        </div>
        <div className="editor-actions">
          {editorMode === 'pages' && (
            <button onClick={addPage} className="btn-add">+ Přidat stránku</button>
          )}
          <button onClick={saveSettings} className="btn-save">{saving ? 'Ukládám...' : 'Uložit trvale'}</button>
          <button onClick={onClose} className="btn-close">Zavřít</button>
        </div>
      </div>
      
      <div className={`editor-content ${editorMode !== 'pages' ? 'editor-content-fullscreen' : ''}`}>
        {editorMode === 'orbit' && (
          <OrbitSettingsPanel 
            appConfig={appConfig}
            updateConfig={updateConfig}
            updatePowerSaving={updatePowerSaving}
            updateBackground={updateBackground}
            updateCameraSpotLight={updateCameraSpotLight}
            updateDnaSettings={updateDnaSettings}
            updatePhysics={updatePhysics}
            assets={assets}
            openSections={openSections}
            toggleSection={toggleSection}
            touchSection={touchSection}
          />
        )}
        {editorMode === 'inside' && (
          <InsideSettingsPanel 
            appConfig={appConfig}
            updateConfig={updateConfig}
            updateVolumetric={updateVolumetric}
            updateInsideFog={updateInsideFog}
            updatePhysics={updatePhysics}
            updateParticlePhysics={updateParticlePhysics}
            updateVolumetricVideo={updateVolumetricVideo}
            updateVolumetricDepth={updateVolumetricDepth}
            updateUi2d={updateUi2d}
            updateUi2dBottomLeft={updateUi2dBottomLeft}
            updateUi2dBottomLeftItem={updateUi2dBottomLeftItem}
            addUi2dBottomLeftItem={addUi2dBottomLeftItem}
            removeUi2dBottomLeftItem={removeUi2dBottomLeftItem}
            updateUi2dPillButton={updateUi2dPillButton}
            openSections={openSections}
            toggleSection={toggleSection}
            touchSection={touchSection}
          />
        )}
        {editorMode === 'pages' && pages.map((page, index) => (
          <PageSettingsPanel 
            key={page.id} 
            page={page} 
            index={index} 
            updatePage={updatePage} 
            deletePage={deletePage} 
            assets={assets} 
            getFilteredAssets={getFilteredAssets} 
            openSections={openSections} 
            toggleSection={toggleSection} 
            updateParticlesSettings={updateParticlesSettings} 
            blenderNodes={blenderNodes} 
          />
        ))}
      </div>
    </div>
  );
}
