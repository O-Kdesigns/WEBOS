import React from 'react';
import { DragNumberInput } from '../controls/DragNumberInput';

export function UI2DSettingsPanel({ appConfig, updateUi2d, updateUi2dBottomLeft, updateUi2dBottomLeftItem, addUi2dBottomLeftItem, removeUi2dBottomLeftItem, updateUi2dPillButton, openSections, toggleSection }) {
  return (
    <> 
          <div className="editor-section">
            <h4 
              style={{ color: '#ec4899', borderBottomColor: 'rgba(236, 72, 153, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => toggleSection('global-2d')}
            >
              <span>🖥️ 2D Rozhraní (HUD)</span>
              <span>{openSections['global-2d'] ? '▲' : '▼'}</span>
            </h4>
            
            {openSections['global-2d'] && (
              <>
                <div className="input-group checkbox-group">
                  <label style={{ fontSize: '1rem', color: '#ec4899', fontWeight: 'bold' }}>
                    <input 
                      type="checkbox" 
                      checked={appConfig.ui2d?.enabled ?? true} 
                      onChange={e => updateUi2d('enabled', e.target.checked)} 
                    />
                    Povolit 2D rozhraní
                  </label>
                  <span className="input-desc" style={{ width: '100%' }}>Zapne / vypne zobrazení všech 2D HUD prvků na obrazovce</span>
                </div>

                {/* 1. Podkategorie: Text vlevo dole (Bottom-Left Text) */}
                <div className="editor-subsection">
                  <h5 className="editor-subsection-header" onClick={() => toggleSection('sub-2d-bottom-left')}>
                    <span>📝 1. Text vlevo dole (Bottom-Left)</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: (appConfig.ui2d?.bottomLeft?.enabled ?? true) ? '#10b981' : '#6b7280' }}>
                        {(appConfig.ui2d?.bottomLeft?.enabled ?? true) ? '● ON' : '○ OFF'}
                      </span>
                      <span>{openSections['sub-2d-bottom-left'] ? '▲' : '▼'}</span>
                    </span>
                  </h5>
                  {openSections['sub-2d-bottom-left'] && (
                    <div className="editor-subsection-content">
                      <div className="checkbox-group">
                        <label style={{ fontWeight: '600', color: '#ec4899' }}>
                          <input 
                            type="checkbox" 
                            checked={appConfig.ui2d?.bottomLeft?.enabled ?? true} 
                            onChange={e => updateUi2dBottomLeft('enabled', e.target.checked)} 
                          />
                          Zobrazit menu / text vlevo dole
                        </label>
                      </div>

                      {/* ZÁHLAVÍ MENU */}
                      <div className="input-group">
                        <label>Záhlaví menu (Nadpis):</label>
                        <span className="input-desc">Např. WHAT ARE YOU LOOKING FOR? (nechte prázdné pro vynechání)</span>
                        <input 
                          type="text" 
                          value={appConfig.ui2d?.bottomLeft?.header ?? 'WHAT ARE YOU LOOKING FOR?'} 
                          onChange={e => updateUi2dBottomLeft('header', e.target.value)} 
                          placeholder="WHAT ARE YOU LOOKING FOR?"
                        />
                      </div>

                      <div className="input-group">
                        <label>Barva záhlaví:</label>
                        <span className="input-desc">Barva nadpisu nad odrážkami</span>
                        <input 
                          type="color" 
                          value={appConfig.ui2d?.bottomLeft?.headerColor || '#a594c7'} 
                          onChange={e => updateUi2dBottomLeft('headerColor', e.target.value)} 
                        />
                      </div>

                      {/* SEZNAM ŘÁDKŮ S ODRÁŽKAMI A HYPERTEXTEM */}
                      <div style={{
                        marginTop: '0.6rem',
                        padding: '0.8rem',
                        background: 'rgba(0, 0, 0, 0.4)',
                        borderRadius: '8px',
                        border: '1px solid rgba(236, 72, 153, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#f472b6' }}>
                            📋 Řádky & Odrážky s hypertextem
                          </span>
                          <button
                            type="button"
                            onClick={addUi2dBottomLeftItem}
                            style={{
                              background: '#ec4899',
                              color: 'white',
                              border: 'none',
                              padding: '3px 10px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            + Přidat řádek
                          </button>
                        </div>

                        {(appConfig.ui2d?.bottomLeft?.items || []).map((item, idx) => (
                          <div
                            key={item.id || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'rgba(255, 255, 255, 0.03)',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255, 255, 255, 0.08)'
                            }}
                          >
                            {/* Odrážka / symbol */}
                            <input
                              type="text"
                              value={item.bullet ?? '->'}
                              onChange={e => updateUi2dBottomLeftItem(idx, 'bullet', e.target.value)}
                              title="Odrážka / symbol řádku (např. -> nebo -)"
                              style={{ width: '38px', textAlign: 'center', padding: '3px 2px', fontSize: '0.78rem' }}
                            />

                            {/* Text položky */}
                            <input
                              type="text"
                              value={item.text ?? ''}
                              onChange={e => updateUi2dBottomLeftItem(idx, 'text', e.target.value)}
                              placeholder="Text řádku"
                              style={{ flex: 1, minWidth: '60px', padding: '3px 6px', fontSize: '0.78rem' }}
                            />

                            {/* Odkaz / URL */}
                            <input
                              type="text"
                              value={item.link ?? ''}
                              onChange={e => updateUi2dBottomLeftItem(idx, 'link', e.target.value)}
                              placeholder="URL odkaz (např. #websites)"
                              style={{ flex: 1, minWidth: '60px', padding: '3px 6px', fontSize: '0.78rem', color: '#67e8f9' }}
                            />

                            {/* Tlumený stav (dimmed) */}
                            <label
                              title="Tlumený řádek (nižší průhlednost jako u MULTIPLAYER)"
                              style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', color: '#94a3b8', cursor: 'pointer', flexShrink: 0 }}
                            >
                              <input
                                type="checkbox"
                                checked={item.dimmed || false}
                                onChange={e => updateUi2dBottomLeftItem(idx, 'dimmed', e.target.checked)}
                              />
                              Tlumený
                            </label>

                            {/* Smazat řádek */}
                            <button
                              type="button"
                              onClick={() => removeUi2dBottomLeftItem(idx)}
                              title="Smazat řádek"
                              style={{
                                background: 'rgba(239, 68, 68, 0.25)',
                                color: '#f87171',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '2px 7px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                flexShrink: 0
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* SKLO ZESILOVÁNÍ & BARVY */}
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.8rem',
                        background: 'rgba(168, 85, 247, 0.08)',
                        borderRadius: '8px',
                        border: '1px solid rgba(168, 85, 247, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.8rem'
                      }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#c084fc' }}>
                          🔮 Skleněné zesílení pozadí & Barva
                        </span>

                        <div className="input-group">
                          <label>Režim skla / zesílení pozadí (Blend Mode):</label>
                          <span className="input-desc">Sklo zesilující barvy: text násobí a rozzáří barvy videa a 3D scény za sebou</span>
                          <select 
                            value={appConfig.ui2d?.bottomLeft?.blendMode || 'luminosity'} 
                            onChange={e => updateUi2dBottomLeft('blendMode', e.target.value)}
                          >
                            <option value="luminosity">⚡ luminosity (Aktivní sklo: sytá barva + bílá na černé – doporučeno)</option>
                            <option value="color-dodge">✨ color-dodge (Zrcadlo zesilující jas)</option>
                            <option value="screen">🌟 screen (Jemnější sklo)</option>
                            <option value="overlay">🌓 overlay (Kontrastní sklo)</option>
                            <option value="plus-lighter">➕ plus-lighter (Aditivní světlo)</option>
                            <option value="difference">🔄 difference (Inverzní kontrast)</option>
                            <option value="normal">⚪ normal (Běžné krytí bez blendu)</option>
                          </select>
                        </div>

                        <div className="input-group">
                          <label>Úroveň bílé / Jas skla (Glass Brightness):</label>
                          <span className="input-desc">Pro skleněné režimy určuje sílu zesvětlení/násobení pozadí (0.1 = tmavé sklo, 1.0 = extrémní svítivost/zrcadlo).</span>
                          <DragNumberInput step={0.01} min={0.1} max={1.0} value={appConfig.ui2d?.bottomLeft?.glassBrightness ?? 0.88} onChange={val => updateUi2dBottomLeft('glassBrightness', val)} />
                        </div>

                        <div className="input-group">
                          <label>Základní barva textu (Záloha pro Normal mód):</label>
                          <span className="input-desc">Tato barva se ignoruje v režimech skla (aby text mohl násobit pozadí čistě). Platí jen pro "normal".</span>
                          <input 
                            type="color" 
                            value={appConfig.ui2d?.bottomLeft?.color || '#9d6ef8'} 
                            onChange={e => updateUi2dBottomLeft('color', e.target.value)} 
                          />
                        </div>

                        <div className="input-group">
                          <label>Barva při najetí myší (Hover):</label>
                          <span className="input-desc">Září bíle při najetí (v předloze #ffffff)</span>
                          <input 
                            type="color" 
                            value={appConfig.ui2d?.bottomLeft?.hoverColor || '#ffffff'} 
                            onChange={e => updateUi2dBottomLeft('hoverColor', e.target.value)} 
                          />
                        </div>
                      </div>

                      {/* 2D FALEŠNÝ BLOOM & GLARE VIGNETTE */}
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.8rem',
                        background: 'rgba(236, 72, 153, 0.08)',
                        borderRadius: '8px',
                        border: '1px solid rgba(236, 72, 153, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.8rem'
                      }}>
                        <div className="checkbox-group">
                          <label style={{ fontWeight: 'bold', color: '#f472b6', fontSize: '0.85rem' }}>
                            <input 
                              type="checkbox" 
                              checked={appConfig.ui2d?.bottomLeft?.enableBloom ?? true} 
                              onChange={e => updateUi2dBottomLeft('enableBloom', e.target.checked)} 
                            />
                            ✨ Povolit 2D Bloom & Glare Vignette
                          </label>
                        </div>

                        <div className="input-group">
                          <label>Barva bloomu / záře:</label>
                          <span className="input-desc">Odstín aury svítící kolem aktivního / najetého textu</span>
                          <input 
                            type="color" 
                            value={appConfig.ui2d?.bottomLeft?.bloomColor || '#a855f7'} 
                            onChange={e => updateUi2dBottomLeft('bloomColor', e.target.value)} 
                          />
                        </div>

                        <div className="input-group">
                          <label>Intenzita bloomu (Záře):</label>
                          <span className="input-desc">Síla světelné aury při najetí myší (1.4 = výrazná záře jako v předloze)</span>
                          <DragNumberInput step={0.1} min={0.2} max={3.0} value={appConfig.ui2d?.bottomLeft?.bloomIntensity ?? 1.4} onChange={val => updateUi2dBottomLeft('bloomIntensity', val)} />
                        </div>
                      </div>

                      {/* TYPOGRAFIE & PÍSMO */}
                      <div className="input-group" style={{ marginTop: '0.5rem' }}>
                        <label>Typ písma (Font):</label>
                        <span className="input-desc">Originální Active Theory font (NB Architekt)</span>
                        <select 
                          value={appConfig.ui2d?.bottomLeft?.fontFamily || 'nbarchitekt'} 
                          onChange={e => updateUi2dBottomLeft('fontFamily', e.target.value)}
                        >
                          <option value="nbarchitekt">🏛️ NB Architekt (Active Theory originál)</option>
                          <option value="mono">💻 Systémový Monospace</option>
                          <option value="sans">🔡 Sans-Serif (Inter)</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label>Velikost písma (Font Size px):</label>
                        <span className="input-desc">Velikost písma v pixelech (v předloze ~13-14px)</span>
                        <DragNumberInput step={1} min={8} max={48} value={appConfig.ui2d?.bottomLeft?.fontSize ?? 13} onChange={val => updateUi2dBottomLeft('fontSize', val)} />
                      </div>

                      <div className="input-group">
                        <label>Mezera mezi řádky (Line Spacing px):</label>
                        <span className="input-desc">Vertikální rozestup mezi jednotlivými řádky</span>
                        <DragNumberInput step={1} min={2} max={36} value={appConfig.ui2d?.bottomLeft?.lineSpacing ?? 11} onChange={val => updateUi2dBottomLeft('lineSpacing', val)} />
                      </div>

                      <div className="input-group">
                        <label>Rozpal písma (Letter Spacing px):</label>
                        <span className="input-desc">Odsazení mezi písmeny pro přesný geometrický styl</span>
                        <DragNumberInput step={0.1} min={-1} max={8} value={appConfig.ui2d?.bottomLeft?.letterSpacing ?? 1.4} onChange={val => updateUi2dBottomLeft('letterSpacing', val)} />
                      </div>

                      {/* POZICIONOVÁNÍ */}
                      <div className="input-group">
                        <label>Pozice zleva (X Offset px):</label>
                        <span className="input-desc">Vzdálenost od levého okraje obrazovky v px</span>
                        <DragNumberInput step={2} min={0} max={500} value={appConfig.ui2d?.bottomLeft?.posX ?? 36} onChange={val => updateUi2dBottomLeft('posX', val)} />
                      </div>

                      <div className="input-group">
                        <label>Pozice zdola (Y Offset px):</label>
                        <span className="input-desc">Vzdálenost od spodního okraje obrazovky v px</span>
                        <DragNumberInput step={2} min={0} max={500} value={appConfig.ui2d?.bottomLeft?.posY ?? 36} onChange={val => updateUi2dBottomLeft('posY', val)} />
                      </div>

                      {/* SPODNÍ PILULKOVÉ TLAČÍTKO */}
                      <div style={{
                        marginTop: '0.6rem',
                        padding: '0.8rem',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.7rem'
                      }}>
                        <div className="checkbox-group">
                          <label style={{ fontWeight: '600', color: '#cbd5e1' }}>
                            <input 
                              type="checkbox" 
                              checked={appConfig.ui2d?.bottomLeft?.pillButton?.enabled ?? true} 
                              onChange={e => updateUi2dPillButton('enabled', e.target.checked)} 
                            />
                            🔘 Zobrazit pilulkové tlačítko (ASK ME ANYTHING...)
                          </label>
                        </div>

                        {appConfig.ui2d?.bottomLeft?.pillButton?.enabled && (
                          <>
                            <div className="input-group">
                              <label>Text tlačítka:</label>
                              <input 
                                type="text" 
                                value={appConfig.ui2d?.bottomLeft?.pillButton?.text ?? 'ASK ME ANYTHING...'} 
                                onChange={e => updateUi2dPillButton('text', e.target.value)} 
                              />
                            </div>

                            <div className="input-group">
                              <label>Odkaz / URL tlačítka:</label>
                              <input 
                                type="text" 
                                value={appConfig.ui2d?.bottomLeft?.pillButton?.link ?? '#ask'} 
                                onChange={e => updateUi2dPillButton('link', e.target.value)} 
                                placeholder="např. #ask nebo https://..."
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
    </>
  );
}
