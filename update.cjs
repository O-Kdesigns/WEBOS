const fs = require('fs');
let content = fs.readFileSync('src/Editor.jsx', 'utf-8');

// 1. Rename variable
content = content.replace(/collapsedSections/g, 'openSections');
content = content.replace(/setCollapsedSections/g, 'setOpenSections');

// 2. Invert logic from "!openSections['xxx']" to "openSections['xxx']"
content = content.replace(/!openSections\[/g, 'openSections[');

// 3. Invert arrows
content = content.replace(/\? '▼' : '▲'/g, "? '▲' : '▼'");

fs.writeFileSync('src/Editor.jsx', content, 'utf-8');
console.log('Done');
