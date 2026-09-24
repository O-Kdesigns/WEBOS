const fs = require('fs');
let code = fs.readFileSync('src/components/Editor/panels/GlobalSettingsPanel.jsx', 'utf8');

const injection = \              <div style={{ paddingTop: '0.5rem' }}>
                <div className="input-group" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                  <label style={{ color: '#10b981', fontWeight: 'bold' }}>Výška jedné 360° otočky DNA</label>
                  <span className="input-desc">
                    Zadej výšku, na které šroubovice DNA udělá přesně jednu plnou otočku (360°). Tento údaj je nezbytný pro správný výpočet rotace!
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                    <DragNumberInput 
                      step={0.5} 
                      min={5} 
                      max={100} 
                      value={appConfig.dnaHeight360 || 30} 
                      onChange={val => updateConfig('dnaHeight360', val)} 
                    />
                  </div>
                </div>\;

code = code.replace(/<div style=\{\{ paddingTop: '0\.5rem' \}\}/, injection + "\n              <div style={{ paddingTop: '0.5rem' }}>");

fs.writeFileSync('src/components/Editor/panels/GlobalSettingsPanel.jsx', code, 'utf8');
