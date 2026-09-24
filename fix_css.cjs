const fs = require('fs');
let content = fs.readFileSync('src/Editor.css', 'utf8');
content = content.replace(/\.editor-content-fullscreen \{[\s\S]*?\}/g, '');
content += \n.editor-content-fullscreen {
  width: 100%;
  padding-bottom: 40px;
}\n;
fs.writeFileSync('src/Editor.css', content, 'utf8');
