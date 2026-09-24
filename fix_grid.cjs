const fs = require('fs');
['src/components/Editor/panels/OrbitSettingsPanel.jsx', 'src/components/Editor/panels/InsideSettingsPanel.jsx'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/gridTemplateColumns: 'repeat\\(4, 1fr\\)'/, "gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'");
  fs.writeFileSync(file, content, 'utf8');
});
