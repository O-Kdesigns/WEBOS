const fs = require('fs');

const orbitCode = \import React from 'react';
import { ParticleSettingsPanel } from './ParticleSettingsPanel';

export const DenseSlider = ({ label, min, max, step, value, onChange, unit = '', color = '#10b981' }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 45px', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
    <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%', height: '3px', accentColor: color, cursor: 'pointer', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', margin: 0 }} />
    <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: color, textAlign: 'right' }}>{Number(value).toFixed(step < 0.1 ? 2 : (step < 1 ? 1 : 0))}{unit}</div>
  </div>
);

export const DenseToggle = ({ label, checked, onChange, color = '#10b981' }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center', marginBottom: '6px', cursor: 'pointer' }}>
    <div style={{ fontSize: '0.75rem', color: checked ? '#f8fafc' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    <div style={{ display: 'flex' }}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: color, width: '14px', height: '14px', margin: 0 }} /></div>
  </label>
);

export const DenseColor = ({ label, value, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
    <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', height: '20px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: '4px' }} />
  </div>
);

export const DashboardCard = ({ title, icon, color, span = 1, children }) => (
  <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: \1px solid \30\, borderRadius: '10px', gridColumn: span > 1 ? '1 / -1' : 'span 1', display: 'flex', flexDirection: 'column' }}>
    <div style={{ background: \\15\, padding: '8px 12px', borderBottom: \1px solid \30\, display: 'flex', alignItems: 'center', gap: '8px', color: color, fontWeight: 'bold', fontSize: '0.8rem', borderTopLeftRadius: '10px', borderTopRightRadius: '10px' }}>
      {icon} {title}
    </div>
    <div style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
      {children}
    </div>
  </div>
);

export function OrbitSettingsPanel({ appConfig, updateConfig, updatePowerSaving, updateBackground, updateCameraSpotLight, updateDnaSettings, updatePhysics, assets, openSections, toggleSection, touchSection }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gridAutoRows: 'min-content', gap: '16px', width: '100%', height: '100%' }}>
      
      <DashboardCard title="Architektura (DNA)" icon="🧬" color="#10b981">
        <DenseSlider label="Výška 360° otočky" min={5} max={100} step={0.5} value={appConfig.dnaHeight360 || 30} onChange={v => updateConfig('dnaHeight360', v)} />
        <DenseSlider label="Rozestup projektů" min={1} max={30} step={0.1} value={appConfig.verticalStep || 10} onChange={v => updateConfig('verticalStep', v)} />
        <div style={{ height: '10px' }} />
        <DenseToggle label="Zobrazit částice DNA" checked={appConfig.dnaSettings?.hasParticles ?? true} onChange={v => updateDnaSettings('hasParticles', v)} />
        <DenseSlider label="Poloměr DNA" min={5} max={50} step={1} value={appConfig.dnaSettings?.radius ?? 20} onChange={v => updateDnaSettings('radius', v)} />
      </DashboardCard>

      <DashboardCard title="Pohyb a Kamera" icon="🚀" color="#f43f5e">
        <DenseSlider label="Zorné pole (FOV)" min={30} max={120} step={1} color="#f43f5e" value={appConfig.cameraFov || 60} onChange={v => updateConfig('cameraFov', v)} />
        <DenseSlider label="Výška kamery (Y)" min={0} max={5} step={0.1} color="#f43f5e" value={appConfig.cameraHeight ?? 1.5} onChange={v => updateConfig('cameraHeight', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f43f5e', marginBottom: '8px' }}>Fyzika rotace a posunu</div>
        <DenseSlider label="Hmotnost (Mass)" min={0.5} max={10} step={0.1} color="#f43f5e" value={appConfig.physics?.mass || 2.5} onChange={v => updatePhysics('mass', v)} />
        <DenseSlider label="Pružnost (Tension)" min={50} max={1000} step={10} color="#f43f5e" value={appConfig.physics?.tension || 500} onChange={v => updatePhysics('tension', v)} />
        <DenseSlider label="Tření (Friction)" min={10} max={300} step={1} color="#f43f5e" value={appConfig.physics?.friction || 100} onChange={v => updatePhysics('friction', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f43f5e', marginBottom: '8px' }}>Gesta a Kolečka myši</div>
        <DenseSlider label="Kroků na projekt" min={1} max={20} step={1} color="#f43f5e" value={appConfig.scrollStepsPerPortfolio ?? 5} onChange={v => updateConfig('scrollStepsPerPortfolio', v)} />
        <DenseSlider label="Rychlost scrollu" min={0.1} max={3.0} step={0.1} color="#f43f5e" value={appConfig.scrollSpeed ?? 1.0} onChange={v => updateConfig('scrollSpeed', v)} />
        <DenseSlider label="Citlivost tahu (Swipe)" min={0.1} max={3.0} step={0.1} color="#f43f5e" value={appConfig.physics?.swipeVelocityThreshold || 0.5} onChange={v => updatePhysics('swipeVelocityThreshold', v)} />
      </DashboardCard>

      <DashboardCard title="Světlo a Prostředí" icon="🌍" color="#3b82f6">
        <DenseSlider label="HDRI Obloha" min={0} max={5} step={0.1} color="#3b82f6" value={appConfig.hdriIntensity ?? 1.0} onChange={v => updateConfig('hdriIntensity', v)} />
        <DenseSlider label="Okolní odrazy" min={0} max={2} step={0.1} color="#3b82f6" value={appConfig.environmentIntensity ?? 0.8} onChange={v => updateConfig('environmentIntensity', v)} />
        <DenseColor label="Barva pozadí" value={appConfig.darkStudioBg?.color ?? '#0a0a0f'} onChange={v => updateBackground('color', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#3b82f6', marginBottom: '8px' }}>Bodové osvětlení z kamery</div>
        <DenseToggle label="Přisvícení objektů" checked={appConfig.cameraSpotLight?.enabled ?? false} color="#3b82f6" onChange={v => updateCameraSpotLight('enabled', v)} />
        <DenseSlider label="Intenzita světla" min={0} max={10} step={0.1} color="#3b82f6" value={appConfig.cameraSpotLight?.intensity ?? 2.0} onChange={v => updateCameraSpotLight('intensity', v)} />
        <DenseSlider label="Úhel kužele" min={0.1} max={1.5} step={0.1} color="#3b82f6" value={appConfig.cameraSpotLight?.angle ?? 0.6} onChange={v => updateCameraSpotLight('angle', v)} />
      </DashboardCard>
      
      <DashboardCard title="Systém & Výkon" icon="⚙️" color="#8b5cf6">
        <DenseToggle label="Pause on Blur (0% GPU)" checked={appConfig.powerSaving?.pauseOnBlur ?? true} color="#8b5cf6" onChange={v => updatePowerSaving('pauseOnBlur', v)} />
        <DenseToggle label="Zobrazit HUD odznak" checked={appConfig.powerSaving?.showBadge ?? true} color="#8b5cf6" onChange={v => updatePowerSaving('showBadge', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#8b5cf6', marginBottom: '8px' }}>Hudební přehrávač</div>
        <DenseToggle label="Ztlumit v pozadí" checked={appConfig.powerSaving?.pauseAudioOnBlur ?? false} color="#8b5cf6" onChange={v => updatePowerSaving('pauseAudioOnBlur', v)} />
        <DenseSlider label="Hlasitost hudby" min={0} max={1} step={0.05} color="#8b5cf6" value={appConfig.musicVolume ?? 0.4} onChange={v => updateConfig('musicVolume', v)} />
      </DashboardCard>

      {appConfig.dnaSettings?.hasParticles !== false && (
        <DashboardCard title="Detailní nastavení vnějšího oblaku (Orbit částice)" icon="✨" color="#14b8a6" span={4}>
          <div style={{ zoom: 0.9, marginTop: '-10px', marginBottom: '-10px' }}>
            <ParticleSettingsPanel 
              settings={{ shape: 'geometry', count: 10000, colorMode: 'video', baseColor: '#3b82f6', ...appConfig.dnaSettings }}
              onUpdate={updateDnaSettings}
              id="global-dna"
              assets={assets}
              openSections={openSections}
              toggleSection={toggleSection}
            />
          </div>
        </DashboardCard>
      )}
    </div>
  );
}
\;

fs.writeFileSync('src/components/Editor/panels/OrbitSettingsPanel.jsx', orbitCode, 'utf8');

const insideCode = \import React from 'react';
import { DenseSlider, DenseToggle, DenseColor, DashboardCard } from './OrbitSettingsPanel';
import { UI2DSettingsPanel } from './UI2DSettingsPanel';

export function InsideSettingsPanel({ appConfig, updateConfig, updateVolumetric, updateInsideFog, updatePhysics, updateParticlePhysics, updateVolumetricVideo, updateVolumetricDepth, updateUi2d, updateUi2dBottomLeft, updateUi2dBottomLeftItem, addUi2dBottomLeftItem, removeUi2dBottomLeftItem, updateUi2dPillButton, openSections, toggleSection, touchSection }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gridAutoRows: 'min-content', gap: '16px', width: '100%', height: '100%' }}>
      
      <DashboardCard title="Volumetrické Video" icon="📹" color="#06b6d4">
        <DenseToggle label="Povolit video v pozadí" checked={appConfig.volumetricVideo?.enabled ?? true} color="#06b6d4" onChange={v => updateVolumetricVideo('enabled', v)} />
        <DenseSlider label="Zakřivení plátna" min={-0.5} max={1.5} step={0.05} value={appConfig.volumetricVideo?.curvature ?? 0.35} color="#06b6d4" onChange={v => updateVolumetricVideo('curvature', v)} />
        <DenseSlider label="Měřítko (Scale)" min={0.2} max={3.0} step={0.05} value={appConfig.volumetricVideo?.scale ?? 0.85} color="#06b6d4" onChange={v => updateVolumetricVideo('scale', v)} />
        <DenseSlider label="Odsazení vzad (Z)" min={0.2} max={8.0} step={0.1} value={appConfig.volumetricVideo?.zDistance ?? 1.4} color="#06b6d4" onChange={v => updateVolumetricVideo('zDistance', v)} />
        <DenseSlider label="Krytí videa (Opacity)" min={0} max={1.0} step={0.05} value={appConfig.volumetricVideo?.screenOpacity ?? 1.0} color="#06b6d4" onChange={v => updateVolumetricVideo('screenOpacity', v)} />
        <DenseSlider label="Jas (Brightness)" min={0.2} max={2.5} step={0.05} value={appConfig.volumetricVideo?.brightness ?? 1.15} color="#06b6d4" onChange={v => updateVolumetricVideo('brightness', v)} />
        <DenseSlider label="Kontrast (Contrast)" min={0.5} max={2.0} step={0.05} value={appConfig.volumetricVideo?.contrast ?? 1.05} color="#06b6d4" onChange={v => updateVolumetricVideo('contrast', v)} />
        <DenseSlider label="Měkkost viněty" min={0.05} max={0.85} step={0.05} value={appConfig.volumetricVideo?.vignetteSoftness ?? 0.45} color="#06b6d4" onChange={v => updateVolumetricVideo('vignetteSoftness', v)} />
        <DenseSlider label="X Posun (Offset)" min={-3} max={3} step={0.05} value={appConfig.volumetricVideo?.posX ?? 0.0} color="#06b6d4" onChange={v => updateVolumetricVideo('posX', v)} />
        <DenseSlider label="Y Posun (Offset)" min={-3} max={3} step={0.05} value={appConfig.volumetricVideo?.posY ?? 0.0} color="#06b6d4" onChange={v => updateVolumetricVideo('posY', v)} />
      </DashboardCard>

      <DashboardCard title="Ghosting a God Rays" icon="🌌" color="#a855f7">
        <DenseToggle label="Povolit průhled hloubky" checked={appConfig.volumetricDepth?.enabled ?? true} color="#a855f7" onChange={v => updateVolumetricDepth('enabled', v)} />
        <DenseSlider label="Start Distance" min={0.5} max={6.0} step={0.05} value={appConfig.volumetricDepth?.startDistance ?? 2.16} color="#a855f7" onChange={v => updateVolumetricDepth('startDistance', v)} />
        <DenseSlider label="Síla Ghostingu" min={0.0} max={1.0} step={0.05} value={appConfig.volumetricDepth?.ghostStrength ?? 0.35} color="#a855f7" onChange={v => updateVolumetricDepth('ghostStrength', v)} />
        <DenseSlider label="Měkkost náběhu (Fade)" min={0.05} max={2.0} step={0.05} value={appConfig.volumetricDepth?.fadeRange ?? 0.6} color="#a855f7" onChange={v => updateVolumetricDepth('fadeRange', v)} />
        
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a855f7', marginBottom: '8px' }}>Středové Paprsky</div>
        
        <DenseSlider label="Expozice paprsků" min={0.0} max={3.0} step={0.05} value={appConfig.volumetricDepth?.raysExposure ?? 1.2} color="#a855f7" onChange={v => updateVolumetricDepth('raysExposure', v)} />
        <DenseSlider label="Rádius paprsků" min={0.2} max={1.2} step={0.05} value={appConfig.volumetricDepth?.raysRadius ?? 0.65} color="#a855f7" onChange={v => updateVolumetricDepth('raysRadius', v)} />
        <DenseSlider label="Délka paprsků" min={0.1} max={1.5} step={0.05} value={appConfig.volumetricDepth?.rayLength ?? 0.45} color="#a855f7" onChange={v => updateVolumetricDepth('rayLength', v)} />
        <DenseSlider label="Hustota paprsků" min={0.2} max={2.0} step={0.05} value={appConfig.volumetricDepth?.rayDensity ?? 1.0} color="#a855f7" onChange={v => updateVolumetricDepth('rayDensity', v)} />
      </DashboardCard>

      <DashboardCard title="Fyzika vnitřních částic" icon="🧲" color="#ec4899">
        <DenseSlider label="Síla levitování" min={0} max={2.0} step={0.01} value={appConfig.particlePhysics?.floatAmplitude ?? 0.1} color="#ec4899" onChange={v => updateParticlePhysics('floatAmplitude', v)} />
        <DenseSlider label="Rychlost levitování" min={0.1} max={10.0} step={0.1} value={appConfig.particlePhysics?.floatSpeed ?? 1.0} color="#ec4899" onChange={v => updateParticlePhysics('floatSpeed', v)} />
        <DenseSlider label="Návrat po rozfouknutí" min={0.01} max={0.5} step={0.01} value={appConfig.particlePhysics?.returnSpeed ?? 0.05} color="#ec4899" onChange={v => updateParticlePhysics('returnSpeed', v)} />
        
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Interakce myší (Laser)</div>
        <DenseSlider label="Síla odfouknutí myší" min={0.1} max={5.0} step={0.1} value={appConfig.particlePhysics?.mouseForce ?? 1.0} color="#ec4899" onChange={v => updateParticlePhysics('mouseForce', v)} />
        <DenseSlider label="Průměr stopy (Radius)" min={0.1} max={5.0} step={0.1} value={appConfig.particlePhysics?.mouseRadius ?? 2.0} color="#ec4899" onChange={v => updateParticlePhysics('mouseRadius', v)} />
        <DenseSlider label="Délka průniku (Laser)" min={0.1} max={20.0} step={0.1} value={appConfig.particlePhysics?.laserLength ?? 5.0} color="#ec4899" onChange={v => updateParticlePhysics('laserLength', v)} />
      </DashboardCard>

      <DashboardCard title="Vnitřní Mlha" icon="🌫️" color="#6366f1">
        <DenseToggle label="Povolit mlhu uvnitř" checked={appConfig.insideFog?.enabled ?? true} color="#6366f1" onChange={v => updateInsideFog('enabled', v)} />
        <DenseSlider label="Hustota mlhy" min={0} max={0.5} step={0.01} value={appConfig.insideFog?.density ?? 0.15} color="#6366f1" onChange={v => updateInsideFog('density', v)} />
        <DenseColor label="Barva mlhy" value={appConfig.insideFog?.color ?? '#050510'} onChange={v => updateInsideFog('color', v)} />
      </DashboardCard>

      <DashboardCard title="2D Rozhraní HUD (Zatím origo)" icon="🖥️" color="#f43f5e" span={4}>
        <div style={{ zoom: 0.9, marginTop: '-10px', marginBottom: '-10px' }}>
          <UI2DSettingsPanel 
            appConfig={appConfig}
            updateUi2d={updateUi2d}
            updateUi2dBottomLeft={updateUi2dBottomLeft}
            updateUi2dBottomLeftItem={updateUi2dBottomLeftItem}
            addUi2dBottomLeftItem={addUi2dBottomLeftItem}
            removeUi2dBottomLeftItem={removeUi2dBottomLeftItem}
            updateUi2dPillButton={updateUi2dPillButton}
            openSections={openSections}
            toggleSection={toggleSection}
          />
        </div>
      </DashboardCard>

    </div>
  );
}
\;

fs.writeFileSync('src/components/Editor/panels/InsideSettingsPanel.jsx', insideCode, 'utf8');
