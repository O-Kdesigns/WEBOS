const fs = require('fs');

function groupIntoOneCard(filename, title) {
  let code = fs.readFileSync(filename, 'utf8');
  
  const oldRender = /return \([\s\S]*?<\/>\s*\);\s*\}/;
  
  const newRender = \eturn (
    <div className="editor-card" style={{ border: '1px solid #10b981', height: 'fit-content', width: '100%', gridColumn: '1 / -1' }}>
      <h3 style={{ color: '#10b981', borderBottom: '1px solid rgba(16, 185, 129, 0.3)', paddingBottom: '10px', marginBottom: '20px' }}>\</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {currentItems.map(sectionId => (
          <div key={sectionId} style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px' }}>
            {sections[sectionId]}
          </div>
        ))}
      </div>
    </div>
  );
}\;

  code = code.replace(oldRender, newRender);
  // Also remove the unused paginatedOrder stuff if it's there
  code = code.replace(/const paginatedOrder = currentItems;/g, '');
  
  fs.writeFileSync(filename, code, 'utf8');
}

groupIntoOneCard('src/components/Editor/panels/OrbitSettingsPanel.jsx', 'Globální nastavení a ORBIT (DNA)');
groupIntoOneCard('src/components/Editor/panels/InsideSettingsPanel.jsx', 'Nastavení detailu projektu (INSIDE)');
