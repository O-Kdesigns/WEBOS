const fs = require('fs');
let code = fs.readFileSync('src/components/Editor/Editor.jsx', 'utf8');

const regex = /<div \n      className=\{\editor-overlay.*?(?=<GlobalSettingsPanel)/s;
const newHeader = \
  return (
    <div 
      className={\\\editor-overlay \\\\}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className={\\\editor-header \\\\}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '5px', background: 'rgba(255,255,255,0.05)', padding: '5px', borderRadius: '8px' }}>
            <button 
              onClick={() => setEditorMode('global')}
              style={{ background: editorMode === 'global' ? '#10b981' : 'transparent', color: editorMode === 'global' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Globální nastavení
            </button>
            <button 
              onClick={() => setEditorMode('pages')}
              style={{ background: editorMode === 'pages' ? '#3b82f6' : 'transparent', color: editorMode === 'pages' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Stránky Portfolia
            </button>
          </div>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#ccc' }}>
            <input type="checkbox" checked={isTransparent} onChange={e => setIsTransparent(e.target.checked)} />
            Průhledný režim (vidět scénu)
          </label>
        </div>
        <div className="editor-actions">
          {editorMode === 'pages' && (
            <button onClick={addPage} className="btn-add">+ Přidat stránku</button>
          )}
          <button onClick={saveSettings} className="btn-save">{saving ? 'Ukládám...' : 'Uložit trvale'}</button>
          <button onClick={onClose} className="btn-close">Zavřít</button>
        </div>
      </div>
      
      <div className={\\\editor-content \\\\}>
        {editorMode === 'global' ? (
          \;

code = code.replace(regex, newHeader);
fs.writeFileSync('src/components/Editor/Editor.jsx', code, 'utf8');
