const fs = require('fs');
let code = fs.readFileSync('src/components/Editor/panels/GlobalSettingsPanel.jsx', 'utf8');
if (code.charCodeAt(0) === 0xFEFF) {
  code = code.slice(1);
}
fs.writeFileSync('src/components/Editor/panels/GlobalSettingsPanel.jsx', code, 'utf8');
