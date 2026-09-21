import React, { useState, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import '../../Editor.css';
import { useEditorState } from './useEditorState';
import { GlobalSettingsPanel } from './panels/GlobalSettingsPanel';
import { PageSettingsPanel } from './panels/PageSettingsPanel';

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
    'cam-spotlight': true,
    'global-2d': true,
    'sub-2d-bottom-left': true
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
    updateCylinderSettings,
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
        <GlobalSettingsPanel 
          appConfig={appConfig}
          updateConfig={updateConfig}
          updatePowerSaving={updatePowerSaving}
          updateVolumetric={updateVolumetric}
          updateInsideFog={updateInsideFog}
          updateCameraSpotLight={updateCameraSpotLight}
          updateBackground={updateBackground}
          updatePhysics={updatePhysics}
          updateParticlePhysics={updateParticlePhysics}
          updateCylinderSettings={updateCylinderSettings}
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
          assets={assets}
        />

        {/* STRÁNKY PORTFOLIA */}
        {pages.map((page, index) => (
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
