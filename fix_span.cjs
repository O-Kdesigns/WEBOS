const fs = require('fs');
['src/components/Editor/panels/OrbitSettingsPanel.jsx', 'src/components/Editor/panels/InsideSettingsPanel.jsx'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/gridColumn: 'span ' \+ span/g, "gridColumn: span > 1 ? '1 / -1' : 'span 1'");
  fs.writeFileSync(file, content, 'utf8');
});
