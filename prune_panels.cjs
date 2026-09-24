const fs = require('fs');
function processOrbit() {
  let code = fs.readFileSync('src/components/Editor/panels/OrbitSettingsPanel.jsx', 'utf8');
  code = code.replace(/export function GlobalSettingsPanel/g, 'export function OrbitSettingsPanel');
  code = code.replace(/const DEFAULT_GLOBAL_SECTION_ORDER = \\[([\\s\\S]*?)\\];/, 'const DEFAULT_GLOBAL_SECTION_ORDER = [\\'global-background-cylinder\\',\\'global-background-dark\\',\\'global-kamera\\',\\'global-castice\\',\\'global-hudba\\',\\'global-power-saving\\'];');
  code = code.replace(/const itemsPerPage = 5;[\\s\\S]*?const currentItems = fullOrder\\.slice\\(startIndex, startIndex \\+ itemsPerPage\\);/g, 'const currentItems = fullOrder;');
  code = code.replace(/\\{createPortal\\([\\s\\S]*?\\}\\)/g, '');
  fs.writeFileSync('src/components/Editor/panels/OrbitSettingsPanel.jsx', code, 'utf8');
}

function processInside() {
  let code = fs.readFileSync('src/components/Editor/panels/InsideSettingsPanel.jsx', 'utf8');
  code = code.replace(/export function GlobalSettingsPanel/g, 'export function InsideSettingsPanel');
  code = code.replace(/const DEFAULT_GLOBAL_SECTION_ORDER = \\[([\\s\\S]*?)\\];/, 'const DEFAULT_GLOBAL_SECTION_ORDER = [\\'global-volumetric-unified\\',\\'global-volumetric\\',\\'inside-fog-section\\',\\'global-fyzika\\',\\'global-2d\\'];');
  code = code.replace(/const itemsPerPage = 5;[\\s\\S]*?const currentItems = fullOrder\\.slice\\(startIndex, startIndex \\+ itemsPerPage\\);/g, 'const currentItems = fullOrder;');
  code = code.replace(/\\{createPortal\\([\\s\\S]*?\\}\\)/g, '');
  fs.writeFileSync('src/components/Editor/panels/InsideSettingsPanel.jsx', code, 'utf8');
}

processOrbit();
processInside();
