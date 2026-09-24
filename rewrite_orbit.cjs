const fs = require('fs');

const orbitCode = \import React from 'react';

const CompactSlider = ({ label, min, max, step, value, onChange, desc, unit = '' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#e2e8f0', fontWeight: '500' }}>
      <span>{label}</span>
      <span style={{ fontFamily: 'monospace', color: '#10b981' }}>{Number(value).toFixed(step < 0.1 ? 2 : 1)}{unit}</span>
    </div>
    <input 
      type="range" min={min} max={max} step={step} value={value} 
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width: '100%', height: '4px', accentColor: '#10b981', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', appearance: 'none' }}
    />
    {desc && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', lineHeight: '1.2' }}>{desc}</div>}
  </div>
);

const CompactToggle = ({ label, checked, onChange, desc }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px', cursor: 'pointer' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: checked ? '#10b981' : '#e2e8f0', fontWeight: '600' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: '#10b981', width: '16px', height: '16px' }} />
      {label}
    </div>
    {desc && <div style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '24px', lineHeight: '1.2' }}>{desc}</div>}
  </label>
);

const Card = ({ title, icon, color, children }) => (
  <div style={{ background: 'rgba(255,255,255,0.02)', border: \1px solid \40\, borderRadius: '12px', overflow: 'hidden' }}>
    <div style={{ background: \\15\, padding: '12px 16px', borderBottom: \1px solid \40\, display: 'flex', alignItems: 'center', gap: '8px', color: color, fontWeight: 'bold', fontSize: '0.9rem' }}>
      {icon} {title}
    </div>
    <div style={{ padding: '16px' }}>
      {children}
    </div>
  </div>
);

export function OrbitSettingsPanel({ appConfig, updateConfig, updatePowerSaving, updateBackground, updateCameraSpotLight, updateDnaSettings }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', width: '100%', alignItems: 'start' }}>
      
      <Card title="DNA Šroubovice" icon="🧬" color="#10b981">
        <CompactSlider 
          label="Výška jedné 360° otočky" min={5} max={100} step={0.5} 
          value={appConfig.dnaHeight360 || 30} onChange={v => updateConfig('dnaHeight360', v)}
          desc="Výška, na které DNA udělá plnou otočku. Kalibruje rotaci projektů."
        />
        <CompactSlider 
          label="Rozestup projektů" min={1} max={30} step={0.1} 
          value={appConfig.verticalStep || 10} onChange={v => updateConfig('verticalStep', v)}
          desc="Prostorová vzdálenost (krokování) mezi jednotlivými projekty."
        />
        <CompactToggle 
          label="Zobrazit vnější částicový sloup (DNA)" 
          checked={appConfig.dnaSettings?.hasParticles ?? true} 
          onChange={v => updateDnaSettings('hasParticles', v)}
        />
        <CompactSlider 
          label="Poloměr částic DNA" min={5} max={50} step={1} 
          value={appConfig.dnaSettings?.radius ?? 20} onChange={v => updateDnaSettings('radius', v)}
        />
      </Card>

      <Card title="Osvětlení & Prostředí" icon="🌍" color="#3b82f6">
        <CompactSlider 
          label="Intenzita HDRI oblohy" min={0} max={5} step={0.1} 
          value={appConfig.hdriIntensity ?? 1.0} onChange={v => updateConfig('hdriIntensity', v)}
        />
        <CompactSlider 
          label="Intenzita odrazů prostředí" min={0} max={2} step={0.1} 
          value={appConfig.environmentIntensity ?? 0.8} onChange={v => updateConfig('environmentIntensity', v)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px' }}>
          <div style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: '500' }}>Barva pozadí (Studio)</div>
          <input 
            type="color" 
            value={appConfig.darkStudioBg?.color ?? '#0a0a0f'} 
            onChange={e => updateBackground('color', e.target.value)}
            style={{ width: '100%', height: '36px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
        </div>
      </Card>

      <Card title="Systém & Výkon" icon="⚙️" color="#8b5cf6">
        <CompactToggle 
          label="Úsporný režim (Pause on blur)" 
          checked={appConfig.powerSaving?.pauseOnBlur ?? true} 
          onChange={v => updatePowerSaving('pauseOnBlur', v)}
          desc="Zastaví 3D render (0% GPU) při kliknutí vedle."
        />
        <CompactToggle 
          label="Zobrazit odznak úsporného režimu" 
          checked={appConfig.powerSaving?.showBadge ?? true} 
          onChange={v => updatePowerSaving('showBadge', v)}
        />
        <CompactToggle 
          label="Ztlumit hudbu na pozadí" 
          checked={appConfig.powerSaving?.pauseAudioOnBlur ?? false} 
          onChange={v => updatePowerSaving('pauseAudioOnBlur', v)}
        />
      </Card>
      
      <Card title="Bodové světlo kamery" icon="🔦" color="#eab308">
        <CompactToggle 
          label="Přisvícení objektů z kamery" 
          checked={appConfig.cameraSpotLight?.enabled ?? false} 
          onChange={v => updateCameraSpotLight('enabled', v)}
        />
        <CompactSlider 
          label="Intenzita světla" min={0} max={10} step={0.1} 
          value={appConfig.cameraSpotLight?.intensity ?? 2.0} onChange={v => updateCameraSpotLight('intensity', v)}
        />
        <CompactSlider 
          label="Úhel kužele" min={0.1} max={Math.PI/2} step={0.1} 
          value={appConfig.cameraSpotLight?.angle ?? 0.6} onChange={v => updateCameraSpotLight('angle', v)}
        />
      </Card>

    </div>
  );
}
\

fs.writeFileSync('src/components/Editor/panels/OrbitSettingsPanel.jsx', orbitCode, 'utf8');
