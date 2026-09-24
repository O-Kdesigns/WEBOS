const fs = require('fs');
let code = fs.readFileSync('src/components/Editor/Editor.jsx', 'utf8');
code = code.replace(
  'updateDnaSettings={updateDnaSettings}',
  'updateDnaSettings={updateDnaSettings}\n            updatePhysics={updatePhysics}\n            assets={assets}'
);
fs.writeFileSync('src/components/Editor/Editor.jsx', code, 'utf8');
