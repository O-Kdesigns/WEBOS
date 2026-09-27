import React from 'react';
import { DenseSlider, DenseSelect, DenseColor } from './OrbitSettingsPanel';

function isSolidNode(name) {
  if (!name) return false;
  const trimmed = name.trim();
  return (/(?:^|[_.\-\s])1$|(?:\.0*1)$|1$/.test(trimmed)) && !trimmed.endsWith('0');
}

export function ParticleSettingsPanel({ settings = {}, onUpdate, id, pageTitle, blenderNodes = [] }) {
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
  const c = '#14b8a6';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {availableNodes.length > 0 ? (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
            Nalezené 3D uzly pro částice ({matchedNodes.length > 0 ? `${matchedNodes.length} pro '${pageTitle}'` : `${availableNodes.length} celkem`}):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {availableNodes.slice(0, 10).map(node => (
              <span key={node} style={{ display: 'inline-block', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)', color: '#5eead4', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                {node} {isSolidNode(node) && '(Solid)'}
              </span>
            ))}
            {availableNodes.length > 10 && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>+ dalších {availableNodes.length - 10}</span>}
          </div>
        </div>
      ) : (
        <DenseSelect 
          desc="Geometrický tvar pro rozmístění částic, pokud není nalezen žádný model." 
          label="Základní tvar" value={settings.shape || 'sphere'} color={c}
          options={[{value: 'sphere', label: 'Koule'}, {value: 'cube', label: 'Krychle'}, {value: 'cylinder', label: 'Válec'}]} 
          onChange={v => onUpdate('shape', v)} 
        />
      )}

      <DenseSlider desc="Měřítko jednotlivých kuliček." label="Velikost částic" min={0.002} max={0.1} step={0.001} color={c} value={settings.baseSize ?? 0.1} onChange={v => onUpdate('baseSize', v)} />
      <DenseSlider desc="0 = stejná velikost, 1 = divoký organický rozptyl" label="Náhodnost velikosti" min={0} max={1.0} step={0.01} color={c} value={settings.sizeRandomness ?? 0.0} onChange={v => onUpdate('sizeRandomness', v)} />
      <DenseSlider desc="Procento z celkového počtu vrcholů sítě." label="Hustota bodů z modelu" min={0} max={100} step={1} color={c} value={settings.modelDensity ?? 100} unit="%" onChange={v => onUpdate('modelDensity', v)} />
      
      <div style={{ height: '8px' }} />
      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: c, marginBottom: '8px' }}>Materiál a Barva (Render)</div>
      
      <DenseSelect 
        desc="Způsob obarvení a stínování částic." label="Mód barev a materiálu" 
        value={settings.colorMode || 'single'} color={c}
        options={[{value: 'single', label: 'Jedna barva (Solid / Metal)'}, {value: 'vertex', label: 'Vertex Colors (Z předlohy)'}, {value: 'video', label: 'Video uvnitř želé (Jelly Video)'}]} 
        onChange={v => onUpdate('colorMode', v)} 
      />

      {settings.colorMode !== 'vertex' && (
        <DenseColor desc="Odstín skleněného těla nebo povrchu." label={settings.colorMode === 'video' ? 'Tónování želé (Barva)' : 'Barva kuliček'} value={settings.baseColor || '#ffffff'} onChange={v => onUpdate('baseColor', v)} />
      )}
      
      <DenseSlider desc="0 = sametově matné, 1 = zrcadlově lesklé." label="Drsnost (Roughness)" min={0} max={1.0} step={0.05} color={c} value={settings.roughness ?? 0.1} onChange={v => onUpdate('roughness', v)} />
      <DenseSlider desc="Míra kovových odlesků a reflexe." label="Metalíza (Metalness)" min={0} max={1.0} step={0.05} color={c} value={settings.metalness ?? 0.1} onChange={v => onUpdate('metalness', v)} />
      
      {settings.colorMode === 'video' && (
        <>
          <DenseSlider desc="Efekt rybího oka a čočky promítající video do kuličky." label="Zakřivení optiky (Distortion)" min={0} max={2.0} step={0.05} color={c} value={settings.refractionDistortion ?? 0.6} onChange={v => onUpdate('refractionDistortion', v)} />
          <DenseSlider desc="Při otáčení DNA: nejsvětlejší tón víření." label="Maximální světlá (Jas)" min={0} max={2.0} step={0.05} color={c} value={settings.transitionMaxLight ?? 0.8} onChange={v => onUpdate('transitionMaxLight', v)} />
          <DenseSlider desc="Jak hluboká je černá v tmavých proudech (0 = tma, 0.2 = měkká temnota)." label="Minimální tmavá (Úroveň)" min={0} max={1.0} step={0.05} color={c} value={settings.transitionMinDark ?? 0.05} onChange={v => onUpdate('transitionMinDark', v)} />
          <DenseSlider desc="0 = neprůhledné, 1 = plně zářivý průchod videa skrz kuličku." label="Průchod světla (Transmise)" min={0} max={1.0} step={0.05} color={c} value={settings.transmission ?? 0.85} onChange={v => onUpdate('transmission', v)} />
          <DenseSlider desc="Absorpce světla a sytost želatinového jádra." label="Hloubka sytosti (Thickness)" min={0} max={5.0} step={0.1} color={c} value={settings.thickness ?? 1.2} onChange={v => onUpdate('thickness', v)} />
          <DenseSlider desc="0 = video ve svých barvách, 1 = celé přebarvené barvou želé." label="Tónování videa (síla)" min={0} max={1.0} step={0.05} color={c} value={settings.videoTint ?? 0.35} onChange={v => onUpdate('videoTint', v)} />
          <DenseSlider desc="Jas videa uvnitř kuliček." label="Jas videa v želé" min={0.2} max={4.0} step={0.05} color={c} value={settings.videoGain ?? 1.4} onChange={v => onUpdate('videoGain', v)} />
          <DenseSlider desc="Jak moc se kuličky přelévají (dýchají) – 0 = tuhé koule." label="Želé vlnění" min={0} max={1.5} step={0.05} color={c} value={settings.jellyWobble ?? 0.5} onChange={v => onUpdate('jellyWobble', v)} />
        </>
      )}
    </div>
  );
}
