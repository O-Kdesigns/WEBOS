import React from 'react';
import { DragNumberInput } from '../controls/DragNumberInput';
import { MagneticSegmentSwitch, SPHERE_QUALITY_PRESETS } from '../controls/MagneticSegmentSwitch';

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <label style={{ margin: 0, fontWeight: 'bold', fontSize: '0.88rem', color: '#f1f5f9' }}>
              3D Objekty scény ({matchedNodes.length > 0 ? `${matchedNodes.length} pro '${pageTitle}'` : `všechny (${availableNodes.length})`}):
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#34d399', padding: '2px 7px', borderRadius: '4px', fontSize: '0.72rem' }}>
              🟢 <b>0</b> = Částice
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.25)', color: '#60a5fa', padding: '2px 7px', borderRadius: '4px', fontSize: '0.72rem' }}>
              🔷 <b>1</b> = Solid mesh
            </span>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {availableNodes.map(nodeName => {
              const isChecked = settings.selectedNodes ? settings.selectedNodes.includes(nodeName) : false;
              const isSolid = isSolidNode(nodeName);
              const multiplier = (settings.nodeMultipliers && settings.nodeMultipliers[nodeName] !== undefined)
                ? settings.nodeMultipliers[nodeName]
                : 1;
              const mouseMultiplier = (settings.nodeMouseMultipliers && settings.nodeMouseMultipliers[nodeName] !== undefined)
                ? settings.nodeMouseMultipliers[nodeName]
                : 1;

              const isBg = nodeName.toLowerCase().includes('backround') || nodeName.toLowerCase().includes('background');
              const qualityLevel = (settings.nodeQuality && settings.nodeQuality[nodeName] !== undefined)
                ? Number(settings.nodeQuality[nodeName])
                : (isBg ? 0 : 1);

              return (
                <div 
                  key={nodeName} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.5rem', 
                    background: isChecked 
                      ? (isSolid ? 'rgba(59, 130, 246, 0.08)' : 'rgba(16, 185, 129, 0.08)') 
                      : 'rgba(255,255,255,0.02)', 
                    border: `1px solid ${isChecked 
                      ? (isSolid ? 'rgba(59, 130, 246, 0.28)' : 'rgba(16, 185, 129, 0.28)') 
                      : 'rgba(255,255,255,0.05)'}`, 
                    padding: '8px 10px', 
                    borderRadius: '6px', 
                    transition: 'background 0.15s ease, border-color 0.15s ease' 
                  }}
                >
                  {/* Horní řádek: Checkbox + Celé jméno bez ořezu + Typ uzlu */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
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
                      <span 
                        style={{ 
                          color: isSolid ? '#93c5fd' : '#6ee7b7', 
                          fontWeight: isChecked ? 600 : 400, 
                          fontSize: '0.82rem', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap', 
                          lineHeight: 1.3 
                        }} 
                        title={nodeName}
                      >
                        {nodeName}
                      </span>
                    </label>

                    <span style={{ 
                      fontSize: '0.68rem', 
                      padding: '2px 7px', 
                      borderRadius: '4px', 
                      fontWeight: 'bold', 
                      whiteSpace: 'nowrap', 
                      flexShrink: 0, 
                      background: isSolid ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)', 
                      color: isSolid ? '#60a5fa' : '#34d399', 
                      border: `1px solid ${isSolid ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}` 
                    }}>
                      {isSolid ? '🔷 SOLID' : '🟢 ČÁSTICE'}
                    </span>
                  </div>

                  {/* Nastavení pro částicové uzly */}
                  {isChecked && !isSolid && (
                    <div 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.55rem', 
                        paddingTop: '6px', 
                        borderTop: '1px solid rgba(255,255,255,0.06)' 
                      }} 
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Řádek násobičů: Velikost a Vliv myši */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.74rem' }}>
                        <div 
                          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} 
                          title="Násobič velikosti částic pro tento objekt"
                        >
                          <span style={{ color: '#94a3b8' }}>Velikost:</span>
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
                          <span style={{ color: '#64748b' }}>×</span>
                        </div>

                        <div 
                          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} 
                          title="Násobič reakce na pohyb myši pro tento objekt (0 = myš částice neovlivňuje)"
                        >
                          <span style={{ color: '#94a3b8' }}>Vliv myši:</span>
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
                          <span style={{ color: '#64748b' }}>×</span>
                        </div>
                      </div>

                      {/* Magnetický switch pro přepínání polygonů / kvality sféry */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '1px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.71rem' }}>
                          <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🌐</span> Polygony koule:
                          </span>
                          <span style={{ color: '#34d399', fontWeight: '600', fontSize: '0.68rem' }}>
                            {SPHERE_QUALITY_PRESETS[qualityLevel]?.desc} ({SPHERE_QUALITY_PRESETS[qualityLevel]?.tris} / částice)
                          </span>
                        </div>
                        <MagneticSegmentSwitch 
                          value={qualityLevel} 
                          onChange={newLevel => {
                            const current = { ...(settings.nodeQuality || {}) };
                            current[nodeName] = newLevel;
                            onUpdate('nodeQuality', current);
                          }} 
                        />
                      </div>
                    </div>
                  )}

                  {/* Informační řádek pro solid 3D meshe */}
                  {isChecked && isSolid && (
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        paddingTop: '5px', 
                        borderTop: '1px solid rgba(59, 130, 246, 0.15)', 
                        fontSize: '0.72rem', 
                        color: '#93c5fd' 
                      }}
                    >
                      <span>🔷 Solid 3D Mesh</span>
                      <span style={{ color: '#60a5fa', fontSize: '0.68rem', opacity: 0.85 }}>PBR & pečené osvětlení</span>
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
