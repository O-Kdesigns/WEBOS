const fs = require('fs');
let code = fs.readFileSync('src/components/Editor/panels/UI2DSettingsPanel.jsx', 'utf8');

code = code.replace(/display:\s*'flex',\s*alignItems:\s*'center',\s*gap:\s*'6px',\s*background:\s*'rgba\(255, 255, 255, 0\.03\)',/g, 
  "display: 'grid', gridTemplateColumns: '32px 1fr 1fr auto auto', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.03)',");

fs.writeFileSync('src/components/Editor/panels/UI2DSettingsPanel.jsx', code, 'utf8');
