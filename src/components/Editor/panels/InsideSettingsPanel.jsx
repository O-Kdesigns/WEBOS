import React from 'react';
import { CompactSlider, CompactToggle, Card } from './OrbitSettingsPanel';
import { UI2DSettingsPanel } from './UI2DSettingsPanel';

export function InsideSettingsPanel({ appConfig, updateVolumetric, updateInsideFog, updatePhysics, updateParticlePhysics, updateVolumetricVideo, updateVolumetricDepth, updateUi2d, updateUi2dBottomLeft, updateUi2dBottomLeftItem, addUi2dBottomLeftItem, removeUi2dBottomLeftItem, updateUi2dPillButton }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', width: '100%', alignItems: 'start' }}>
      
      <Card title="Volumetrické Video" icon="📹" color="#06b6d4">
        <CompactToggle 
          label="Povolit video na pozadí" 
          checked={appConfig.volumetricVideo?.enabled ?? true} color="#06b6d4"
          onChange={v => updateVolumetricVideo('enabled', v)}
        />
        <CompactSlider 
          label="Zakřivení plátna" min={-0.5} max={1.5} step={0.05} 
          value={appConfig.volumetricVideo?.curvature ?? 0.35} onChange={v => updateVolumetricVideo('curvature', v)}
        />
        <CompactSlider 
          label="Měřítko videa (Scale)" min={0.2} max={3.0} step={0.05} 
          value={appConfig.volumetricVideo?.scale ?? 0.85} onChange={v => updateVolumetricVideo('scale', v)}
        />
        <CompactSlider 
          label="Vzdálenost (Z-Distance)" min={0.2} max={8.0} step={0.1} 
          value={appConfig.volumetricVideo?.zDistance ?? 1.4} onChange={v => updateVolumetricVideo('zDistance', v)}
        />
        <CompactSlider 
          label="Průhlednost (Opacity)" min={0} max={1.0} step={0.05} 
          value={appConfig.volumetricVideo?.screenOpacity ?? 1.0} onChange={v => updateVolumetricVideo('screenOpacity', v)}
        />
        <CompactSlider 
          label="Jas videa" min={0.2} max={2.5} step={0.05} 
          value={appConfig.volumetricVideo?.brightness ?? 1.15} onChange={v => updateVolumetricVideo('brightness', v)}
        />
        <CompactSlider 
          label="Kontrast videa" min={0.5} max={2.0} step={0.05} 
          value={appConfig.volumetricVideo?.contrast ?? 1.05} onChange={v => updateVolumetricVideo('contrast', v)}
        />
        <CompactSlider 
          label="Měkkost viněty" min={0.05} max={0.85} step={0.05} 
          value={appConfig.volumetricVideo?.vignetteSoftness ?? 0.45} onChange={v => updateVolumetricVideo('vignetteSoftness', v)}
        />
      </Card>

      <Card title="Průhled a Středové Paprsky" icon="🌌" color="#a855f7">
        <CompactToggle 
          label="Povolit volumetrický průhled" 
          checked={appConfig.volumetricDepth?.enabled ?? true} color="#a855f7"
          onChange={v => updateVolumetricDepth('enabled', v)}
        />
        <CompactSlider 
          label="Start Distance" min={0.5} max={6.0} step={0.05} 
          value={appConfig.volumetricDepth?.startDistance ?? 2.16} onChange={v => updateVolumetricDepth('startDistance', v)}
        />
        <CompactSlider 
          label="Síla ghostingu (viditelnost)" min={0.0} max={1.0} step={0.05} 
          value={appConfig.volumetricDepth?.ghostStrength ?? 0.35} onChange={v => updateVolumetricDepth('ghostStrength', v)}
        />
        <div style={{ borderTop: '1px solid rgba(168, 85, 247, 0.2)', margin: '12px 0' }} />
        <div style={{ fontSize: '0.8rem', color: '#c084fc', marginBottom: '10px' }}>Paprsky (God Rays)</div>
        <CompactSlider 
          label="Intenzita paprsků (Exposure)" min={0.0} max={3.0} step={0.05} 
          value={appConfig.volumetricDepth?.raysExposure ?? 1.2} onChange={v => updateVolumetricDepth('raysExposure', v)}
        />
        <CompactSlider 
          label="Dosah od středu (Radius)" min={0.2} max={1.2} step={0.05} 
          value={appConfig.volumetricDepth?.raysRadius ?? 0.65} onChange={v => updateVolumetricDepth('raysRadius', v)}
        />
        <CompactSlider 
          label="Délka paprsků (Ray Length)" min={0.1} max={1.5} step={0.05} 
          value={appConfig.volumetricDepth?.rayLength ?? 0.45} onChange={v => updateVolumetricDepth('rayLength', v)}
        />
      </Card>

      <Card title="Vnitřní Mlha a Sklo" icon="🌫️" color="#6366f1">
        <CompactToggle 
          label="Povolit mlhu uvnitř" 
          checked={appConfig.insideFog?.enabled ?? true} color="#6366f1"
          onChange={v => updateInsideFog('enabled', v)}
        />
        <CompactSlider 
          label="Hustota mlhy (Density)" min={0} max={0.5} step={0.01} 
          value={appConfig.insideFog?.density ?? 0.15} onChange={v => updateInsideFog('density', v)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px' }}>
          <div style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: '500' }}>Barva mlhy</div>
          <input 
            type="color" 
            value={appConfig.insideFog?.color ?? '#050510'} 
            onChange={e => updateInsideFog('color', e.target.value)}
            style={{ width: '100%', height: '36px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
        </div>
      </Card>

      <Card title="Fyzika Částic (GPGPU)" icon="🧲" color="#ec4899">
        <CompactSlider 
          label="Síla Attractoru" min={0} max={5} step={0.1} 
          value={appConfig.physics?.attractorStrength ?? 1.5} onChange={v => updatePhysics('attractorStrength', v)}
        />
        <CompactSlider 
          label="Odpor prostředí (Friction)" min={0.8} max={0.99} step={0.01} 
          value={appConfig.physics?.friction ?? 0.95} onChange={v => updatePhysics('friction', v)}
        />
        <CompactSlider 
          label="Rozptyl částic" min={0.1} max={2.0} step={0.1} 
          value={appConfig.physics?.spread ?? 1.0} onChange={v => updatePhysics('spread', v)}
        />
      </Card>

      <div style={{ gridColumn: '1 / -1' }}>
        <Card title="2D Rozhraní HUD (Zatím legacy layout, brzy redesign)" icon="🖥️" color="#f43f5e">
          <UI2DSettingsPanel 
            appConfig={appConfig}
            updateUi2d={updateUi2d}
            updateUi2dBottomLeft={updateUi2dBottomLeft}
            updateUi2dBottomLeftItem={updateUi2dBottomLeftItem}
            addUi2dBottomLeftItem={addUi2dBottomLeftItem}
            removeUi2dBottomLeftItem={removeUi2dBottomLeftItem}
            updateUi2dPillButton={updateUi2dPillButton}
          />
        </Card>
      </div>

    </div>
  );
}
