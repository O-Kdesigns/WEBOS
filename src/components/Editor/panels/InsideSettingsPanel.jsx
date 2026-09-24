import React from 'react';
import { DenseSlider, DenseToggle, DenseColor, DashboardCard } from './OrbitSettingsPanel';
import { UI2DSettingsPanel } from './UI2DSettingsPanel';

export function InsideSettingsPanel({ appConfig, updateVolumetric, updateInsideFog, updatePhysics, updateParticlePhysics, updateVolumetricVideo, updateVolumetricDepth, updateUi2d, updateUi2dBottomLeft, updateUi2dBottomLeftItem, addUi2dBottomLeftItem, removeUi2dBottomLeftItem, updateUi2dPillButton }) {
  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(4, 1fr)', 
      gridAutoRows: 'min-content',
      gap: '16px', 
      width: '100%', 
      height: '100%' 
    }}>
      
      <DashboardCard title="Volumetrické Video" icon="📹" color="#06b6d4">
        <DenseToggle label="Povolit video v pozadí" checked={appConfig.volumetricVideo?.enabled ?? true} color="#06b6d4" onChange={v => updateVolumetricVideo('enabled', v)} />
        <DenseSlider label="Zakřivení plátna" min={-0.5} max={1.5} step={0.05} value={appConfig.volumetricVideo?.curvature ?? 0.35} color="#06b6d4" onChange={v => updateVolumetricVideo('curvature', v)} />
        <DenseSlider label="Měřítko (Scale)" min={0.2} max={3.0} step={0.05} value={appConfig.volumetricVideo?.scale ?? 0.85} color="#06b6d4" onChange={v => updateVolumetricVideo('scale', v)} />
        <DenseSlider label="Odsazení vzad (Z)" min={0.2} max={8.0} step={0.1} value={appConfig.volumetricVideo?.zDistance ?? 1.4} color="#06b6d4" onChange={v => updateVolumetricVideo('zDistance', v)} />
        <DenseSlider label="Krytí videa (Opacity)" min={0} max={1.0} step={0.05} value={appConfig.volumetricVideo?.screenOpacity ?? 1.0} color="#06b6d4" onChange={v => updateVolumetricVideo('screenOpacity', v)} />
        <DenseSlider label="Jas (Brightness)" min={0.2} max={2.5} step={0.05} value={appConfig.volumetricVideo?.brightness ?? 1.15} color="#06b6d4" onChange={v => updateVolumetricVideo('brightness', v)} />
        <DenseSlider label="Kontrast (Contrast)" min={0.5} max={2.0} step={0.05} value={appConfig.volumetricVideo?.contrast ?? 1.05} color="#06b6d4" onChange={v => updateVolumetricVideo('contrast', v)} />
        <DenseSlider label="Měkkost viněty" min={0.05} max={0.85} step={0.05} value={appConfig.volumetricVideo?.vignetteSoftness ?? 0.45} color="#06b6d4" onChange={v => updateVolumetricVideo('vignetteSoftness', v)} />
      </DashboardCard>

      <DashboardCard title="Ghosting a God Rays" icon="🌌" color="#a855f7">
        <DenseToggle label="Povolit průhled hloubky" checked={appConfig.volumetricDepth?.enabled ?? true} color="#a855f7" onChange={v => updateVolumetricDepth('enabled', v)} />
        <DenseSlider label="Vzdálenost náběhu" min={0.5} max={6.0} step={0.05} value={appConfig.volumetricDepth?.startDistance ?? 2.16} color="#a855f7" onChange={v => updateVolumetricDepth('startDistance', v)} />
        <DenseSlider label="Síla Ghostingu" min={0.0} max={1.0} step={0.05} value={appConfig.volumetricDepth?.ghostStrength ?? 0.35} color="#a855f7" onChange={v => updateVolumetricDepth('ghostStrength', v)} />
        
        <div style={{ height: '10px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a855f7', marginBottom: '8px' }}>Středové Paprsky</div>
        
        <DenseSlider label="Expozice paprsků" min={0.0} max={3.0} step={0.05} value={appConfig.volumetricDepth?.raysExposure ?? 1.2} color="#a855f7" onChange={v => updateVolumetricDepth('raysExposure', v)} />
        <DenseSlider label="Rádius paprsků" min={0.2} max={1.2} step={0.05} value={appConfig.volumetricDepth?.raysRadius ?? 0.65} color="#a855f7" onChange={v => updateVolumetricDepth('raysRadius', v)} />
        <DenseSlider label="Délka paprsků" min={0.1} max={1.5} step={0.05} value={appConfig.volumetricDepth?.rayLength ?? 0.45} color="#a855f7" onChange={v => updateVolumetricDepth('rayLength', v)} />
      </DashboardCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', gridColumn: 'span 1' }}>
        <DashboardCard title="Atmosféra (Mlha a Sklo)" icon="🌫️" color="#6366f1">
          <DenseToggle label="Povolit mlhu uvnitř" checked={appConfig.insideFog?.enabled ?? true} color="#6366f1" onChange={v => updateInsideFog('enabled', v)} />
          <DenseSlider label="Hustota mlhy" min={0} max={0.5} step={0.01} value={appConfig.insideFog?.density ?? 0.15} color="#6366f1" onChange={v => updateInsideFog('density', v)} />
          <DenseColor label="Barva mlhy" value={appConfig.insideFog?.color ?? '#050510'} onChange={v => updateInsideFog('color', v)} />
        </DashboardCard>

        <DashboardCard title="Fyzika Částic (Uvnitř)" icon="🧲" color="#ec4899">
          <DenseSlider label="Síla Attractoru" min={0} max={5} step={0.1} value={appConfig.physics?.attractorStrength ?? 1.5} color="#ec4899" onChange={v => updatePhysics('attractorStrength', v)} />
          <DenseSlider label="Odpor (Friction)" min={0.8} max={0.99} step={0.01} value={appConfig.physics?.friction ?? 0.95} color="#ec4899" onChange={v => updatePhysics('friction', v)} />
          <DenseSlider label="Rozptyl (Spread)" min={0.1} max={2.0} step={0.1} value={appConfig.physics?.spread ?? 1.0} color="#ec4899" onChange={v => updatePhysics('spread', v)} />
        </DashboardCard>
      </div>

      <DashboardCard title="2D Rozhraní HUD (Zatím zachovaný originál)" icon="🖥️" color="#f43f5e" span={4}>
        <div style={{ zoom: 0.9 }}>
          <UI2DSettingsPanel 
            appConfig={appConfig}
            updateUi2d={updateUi2d}
            updateUi2dBottomLeft={updateUi2dBottomLeft}
            updateUi2dBottomLeftItem={updateUi2dBottomLeftItem}
            addUi2dBottomLeftItem={addUi2dBottomLeftItem}
            removeUi2dBottomLeftItem={removeUi2dBottomLeftItem}
            updateUi2dPillButton={updateUi2dPillButton}
          />
        </div>
      </DashboardCard>

    </div>
  );
}
