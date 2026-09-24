const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const regex = /const totalPages = Math\.max\(pagesData\.length, 1\);[\s\S]*?\/\/ Aby projekty p?esn?> kop?rovaly/;
const newBlock = \const totalPages = Math.max(pagesData.length, 1);
  const yStep = appConfig.verticalStep || 10; 
  const projectsPer360 = dnaHeight360 > 0 ? (dnaHeight360 / yStep) : 3;
  const pageDistance = (Math.PI * 2) / projectsPer360;
  
  // Aby projekty přesně kopírovaly\;

code = code.replace(regex, newBlock);
fs.writeFileSync('src/App.jsx', code, 'utf8');
