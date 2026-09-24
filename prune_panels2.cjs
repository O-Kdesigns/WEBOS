const fs = require('fs');
let c1 = fs.readFileSync('src/components/Editor/panels/OrbitSettingsPanel.jsx', 'utf8');
c1 = c1.replace('export function GlobalSettingsPanel', 'export function OrbitSettingsPanel');
c1 = c1.replace(/const DEFAULT_GLOBAL_SECTION_ORDER = \\[[^]*?\\];/, 'const DEFAULT_GLOBAL_SECTION_ORDER = [\\'global-background-cylinder\\',\\'global-background-dark\\',\\'global-kamera\\',\\'global-castice\\',\\'global-hudba\\',\\'global-power-saving\\'];');
c1 = c1.replace(/const itemsPerPage = 5;[^]*?const currentItems = fullOrder\\.slice\\(startIndex, startIndex \\+ itemsPerPage\\);/g, 'const currentItems = fullOrder;');
c1 = c1.replace(/\\{createPortal\\([^]*?\\}\\)/g, '');
fs.writeFileSync('src/components/Editor/panels/OrbitSettingsPanel.jsx', c1, 'utf8');

let c2 = fs.readFileSync('src/components/Editor/panels/InsideSettingsPanel.jsx', 'utf8');
c2 = c2.replace('export function GlobalSettingsPanel', 'export function InsideSettingsPanel');
c2 = c2.replace(/const DEFAULT_GLOBAL_SECTION_ORDER = \\[[^]*?\\];/, 'const DEFAULT_GLOBAL_SECTION_ORDER = [\\'global-volumetric-unified\\',\\'global-volumetric\\',\\'inside-fog-section\\',\\'global-fyzika\\',\\'global-2d\\'];');
c2 = c2.replace(/const itemsPerPage = 5;[^]*?const currentItems = fullOrder\\.slice\\(startIndex, startIndex \\+ itemsPerPage\\);/g, 'const currentItems = fullOrder;');
c2 = c2.replace(/\\{createPortal\\([^]*?\\}\\)/g, '');
fs.writeFileSync('src/components/Editor/panels/InsideSettingsPanel.jsx', c2, 'utf8');
