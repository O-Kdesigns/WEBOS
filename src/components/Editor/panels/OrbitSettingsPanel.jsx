import React from 'react';
import { ParticleSettingsPanel } from './ParticleSettingsPanel';

export const DenseSlider = ({ label, min, max, step, value, onChange, unit = '', color = '#10b981' }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 45px', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
    <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>
      {label}
    </div>
    <input 
      type="range" min={min} max={max} step={step} value={value} 
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width: '100%', height: '3px', accentColor: color, cursor: 'pointer', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', margin: 0 }}
    />
    <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: color, textAlign: 'right' }}>
      {Number(value).toFixed(step < 0.1 ? 2 : (step < 1 ? 1 : 0))}{unit}
    </div>
  </div>
);

export const DenseToggle = ({ label, checked, onChange, color = '#10b981' }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center', marginBottom: '6px', cursor: 'pointer' }}>
    <div style={{ fontSize: '0.75rem', color: checked ? '#f8fafc' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {label}
    </div>
    <div style={{ display: 'flex' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: color, width: '14px', height: '14px', margin: 0 }} />
    </div>
  </label>
);

export const DenseColor = ({ label, value, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
    <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {label}
    </div>
    <input 
      type="color" value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', height: '20px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: '4px' }}
    />
  </div>
);

export const DashboardCard = ({ title, icon, color, span = 1, children }) => (
  <div style={{ 
    background: 'rgba(15, 23, 42, 0.6)', 
    border: '1px solid ' + color + '30', 
    borderRadius: '10px', 
    gridColumn: span > 1 ? '1 / -1' : 'span 1',
    display: 'flex', flexDirection: 'column'
  }}>
    <div style={{ 
      background: color + '15', 
      padding: '8px 12px', 
      borderBottom: '1px solid ' + color + '30', 
      display: 'flex', alignItems: 'center', gap: '8px', 
      color: color, fontWeight: 'bold', fontSize: '0.8rem',
      borderTopLeftRadius: '10px', borderTopRightRadius: '10px'
    }}>
      {icon} {title}
    </div>
    <div style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
      {children}
    </div>
  </div>
);

export function OrbitSettingsPanel({ appConfig, updateConfig, updatePowerSaving, updateBackground, updateCameraSpotLight, updateDnaSettings, openSections, toggleSection, assets }) {
  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(4, 1fr)', 
      gridAutoRows: 'min-content',
      gap: '16px', 
      width: '100%', 
      height: '100%' 
    }}>
      
      {/* COLUMN 1 & 2: ARCHITECTURE & LIGHTING */}
      <DashboardCard title="Architektura (DNA)" icon="🧬" color="#10b981">
        <DenseSlider 
          label="Výška 360° otočky" min={5} max={100} step={0.5} 
          value={appConfig.dnaHeight360 || 30} onChange={v => updateConfig('dnaHeight360', v)}
        />
        <DenseSlider 
          label="Rozestup projektů" min={1} max={30} step={0.1} 
          value={appConfig.verticalStep || 10} onChange={v => updateConfig('verticalStep', v)}
        />
        <div style={{ height: '10px' }} />
        <DenseToggle 
          label="Zobrazit částice DNA" 
          checked={appConfig.dnaSettings?.hasParticles ?? true} 
          onChange={v => updateDnaSettings('hasParticles', v)}
        />
        <DenseSlider 
          label="Poloměr DNA" min={5} max={50} step={1} 
          value={appConfig.dnaSettings?.radius ?? 20} onChange={v => updateDnaSettings('radius', v)}
        />
      </DashboardCard>

      <DashboardCard title="Světlo a Prostředí" icon="🌍" color="#3b82f6">
        <DenseSlider 
          label="HDRI Obloha" min={0} max={5} step={0.1} color="#3b82f6"
          value={appConfig.hdriIntensity ?? 1.0} onChange={v => updateConfig('hdriIntensity', v)}
        />
        <DenseSlider 
          label="Okolní odrazy" min={0} max={2} step={0.1} color="#3b82f6"
          value={appConfig.environmentIntensity ?? 0.8} onChange={v => updateConfig('environmentIntensity', v)}
        />
        <DenseColor 
          label="Barva pozadí" 
          value={appConfig.darkStudioBg?.color ?? '#0a0a0f'} onChange={v => updateBackground('color', v)}
        />
      </DashboardCard>
      
      <DashboardCard title="Výkon & Systém" icon="⚙️" color="#8b5cf6">
        <DenseToggle 
          label="Pause on Blur (0% GPU)" 
          checked={appConfig.powerSaving?.pauseOnBlur ?? true} color="#8b5cf6"
          onChange={v => updatePowerSaving('pauseOnBlur', v)}
        />
        <DenseToggle 
          label="Zobrazit HUD odznak" 
          checked={appConfig.powerSaving?.showBadge ?? true} color="#8b5cf6"
          onChange={v => updatePowerSaving('showBadge', v)}
        />
        <DenseToggle 
          label="Ztlumit hudbu v pozadí" 
          checked={appConfig.powerSaving?.pauseAudioOnBlur ?? false} color="#8b5cf6"
          onChange={v => updatePowerSaving('pauseAudioOnBlur', v)}
        />
      </DashboardCard>

      <DashboardCard title="Bodové světlo kamery" icon="🔦" color="#eab308">
        <DenseToggle 
          label="Přisvícení objektů" 
          checked={appConfig.cameraSpotLight?.enabled ?? false} color="#eab308"
          onChange={v => updateCameraSpotLight('enabled', v)}
        />
        <DenseSlider 
          label="Intenzita světla" min={0} max={10} step={0.1} color="#eab308"
          value={appConfig.cameraSpotLight?.intensity ?? 2.0} onChange={v => updateCameraSpotLight('intensity', v)}
        />
        <DenseSlider 
          label="Úhel kužele" min={0.1} max={1.5} step={0.1} color="#eab308"
          value={appConfig.cameraSpotLight?.angle ?? 0.6} onChange={v => updateCameraSpotLight('angle', v)}
        />
      </DashboardCard>

      {/* WIDE ROW: PARTICLES DETAIL */}
      {appConfig.dnaSettings?.hasParticles !== false && (
        <DashboardCard title="Detailní nastavení DNA částic" icon="✨" color="#14b8a6" span={4}>
          <div style={{ zoom: 0.9 }}>
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
