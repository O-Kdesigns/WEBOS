const fs = require('fs');

function fix(filename, name, keys) {
  let text = fs.readFileSync(filename, 'utf8');
  text = text.replace('export function GlobalSettingsPanel', 'export function ' + name);
  
  const orderRegex = /const DEFAULT_GLOBAL_SECTION_ORDER = \[[\s\S]*?\];/;
  text = text.replace(orderRegex, 'const DEFAULT_GLOBAL_SECTION_ORDER = ' + JSON.stringify(keys) + ';');
  
  const paginationRegex = /const itemsPerPage = 5;[\s\S]*?const currentItems = fullOrder\.slice\(startIndex, startIndex \+ itemsPerPage\);/;
  text = text.replace(paginationRegex, 'const currentItems = fullOrder;');
  
  const portalRegex = /\{createPortal\([\s\S]*?\}\)/;
  text = text.replace(portalRegex, '');
  
  fs.writeFileSync(filename, text, 'utf8');
}

fix('src/components/Editor/panels/OrbitSettingsPanel.jsx', 'OrbitSettingsPanel', ['global-background-cylinder', 'global-background-dark', 'global-kamera', 'global-castice', 'global-hudba', 'global-power-saving']);
fix('src/components/Editor/panels/InsideSettingsPanel.jsx', 'InsideSettingsPanel', ['global-volumetric-unified', 'global-volumetric', 'inside-fog-section', 'global-fyzika', 'global-2d']);
