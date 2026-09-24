const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const oldBlock =   const projectsPer360 = appConfig.projectsPer360 || 3;
  const pageDistance = (Math.PI * 2) / projectsPer360;
  
  // yStep je výška, o kterou se kamera a projekty posunou dolů při přechodu na další projekt.
  // Aby projekty přesně kopírovaly šroubovici DNA, musí yStep matematicky odpovídat úhlu (pageDistance).
  const yStep = dnaHeight360 > 0 ? (dnaHeight360 / projectsPer360) : 10;;

const newBlock =   // Vzdálenost (výška) mezi projekty určuje uživatel přes verticalStep
  const yStep = appConfig.verticalStep || 10;
  // Z výšky a celkové výšky jedné 360° otočky DNA odvodíme počet projektů na 360°
  const projectsPer360 = dnaHeight360 > 0 ? (dnaHeight360 / yStep) : 3;
  // A z toho konečně úhel pootočení, aby projekty přesně seděly na vláknu DNA
  const pageDistance = (Math.PI * 2) / projectsPer360;;

// More tolerant replace if exact match fails
code = code.replace(/const projectsPer360 = appConfig\.projectsPer360 \|\| 3;[\s\S]*?const yStep = dnaHeight360 > 0 \? \(dnaHeight360 \/ projectsPer360\) : 10;/, newBlock);

fs.writeFileSync('src/App.jsx', code, 'utf8');
