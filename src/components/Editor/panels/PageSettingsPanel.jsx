import React from 'react';
import { ParticleSettingsPanel } from './ParticleSettingsPanel';
import { SolidLinkPanel } from './SolidLinkPanel';

export function PageSettingsPanel({ page, index, updatePage, deletePage, assets, getFilteredAssets, openSections, toggleSection, updateParticlesSettings, blenderNodes }) {
  return (
            <div key={page.id} className="editor-card">
              <div className="card-header">
                <h3>📁 Stránka {index + 1}: {page.title || 'Bez názvu'}</h3>
                <button onClick={() => deletePage(page.id)} className="btn-delete">Smazat</button>
              </div>
              
              <div className="input-group">
                <label>Nadpis projektu:</label>
                <span className="input-desc">Zobrazuje se na 3D desce i v HUD rozhraní</span>
                <input type="text" value={page.title || ''} onChange={e => updatePage(page.id, 'title', e.target.value)} />
              </div>
              
              <div className="input-group">
                <label>Popis projektu:</label>
                <span className="input-desc">Doplňkový text a anotace</span>
                <textarea value={page.description || ''} onChange={e => updatePage(page.id, 'description', e.target.value)} />
              </div>
              
              <div className="input-group">
                <label>Video na desce a v pozadí:</label>
                <span className="input-desc">Video smyčka promítaná do skleněné desky a želé částic</span>
                <select value={page.videoUrl || ''} onChange={e => updatePage(page.id, 'videoUrl', e.target.value)}>
                  <option value="">Žádné video</option>
                  {getFilteredAssets(assets.videos, 'video/').map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {page.videoUrl && (
                  <div style={{ marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: '#000', display: 'flex', justifyContent: 'center' }}>
                    <video 
                      src={encodeURI(`/obsah/${page.videoUrl.replace(/^\/?(obsah\/)?/, '')}`)}
                      onError={e => {
                        // Video chybí (např. GitHub Pages) -> placeholder
                        const fallback = `${import.meta.env.BASE_URL}placeholder.mp4`;
                        if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
                      }}
                      controls
                      muted
                      style={{ width: '100%', maxHeight: '150px', objectFit: 'contain' }}
                    />
                  </div>
                )}
              </div>

              {/* Sekce: MODUL OBSAH (Částice & 3D Objekty z Blenderu) */}
              <div className="editor-section">
                <h4 
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onClick={() => toggleSection(`page-particles-${page.id}`)}
                >
                  <span>📦 Modul: Obsah (Částice & Objekty)</span>
                  <span>{openSections[`page-particles-${page.id}`] ? '▲' : '▼'}</span>
                </h4>
                
                {openSections[`page-particles-${page.id}`] && (
                  <>
                    <div className="input-group checkbox-group">
                      <label style={{ fontSize: '1rem', color: '#10b981', fontWeight: 'bold' }}>
                        <input type="checkbox" checked={page.particlesSettings?.hasParticles || false} onChange={e => updateParticlesSettings(page.id, 'hasParticles', e.target.checked)} />
                        Aktivovat obsah projektu
                      </label>
                      <span className="input-desc" style={{ width: '100%' }}>Zobrazí vybrané 3D objekty a částice z Blenderu</span>
                    </div>

                    {page.particlesSettings?.hasParticles && (
                      <ParticleSettingsPanel 
                        settings={page.particlesSettings}
                        onUpdate={(field, value) => updateParticlesSettings(page.id, field, value)}
                        id={`page-${page.id}`}
                        assets={assets}
                        openSections={openSections}
                        toggleSection={toggleSection}
                        pageTitle={page.title}
                        blenderNodes={blenderNodes}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Sekce: SOLIDY & SVĚTLO ČÁSTIC (vzhled solidů + světelná vazba, SolidLink.jsx) */}
              {page.particlesSettings?.hasParticles && (
                <div className="editor-section">
                  <h4
                    style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                    onClick={() => toggleSection(`page-solidlink-${page.id}`)}
                  >
                    <span>💡 Solidy & světlo částic</span>
                    <span>{openSections[`page-solidlink-${page.id}`] ? '▲' : '▼'}</span>
                  </h4>
                  {openSections[`page-solidlink-${page.id}`] && (
                    <SolidLinkPanel
                      settings={page.particlesSettings}
                      onUpdate={(field, value) => updateParticlesSettings(page.id, field, value)}
                      onReplace={(obj) => updatePage(page.id, 'particlesSettings', { ...page.particlesSettings, ...obj })}
                    />
                  )}
                </div>
              )}

            </div>
          );
}
