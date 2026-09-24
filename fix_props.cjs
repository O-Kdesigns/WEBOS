const fs = require('fs');
let code = fs.readFileSync('src/components/Editor/panels/OrbitSettingsPanel.jsx', 'utf8');
code = code.replace(/export function OrbitSettingsPanel\\(\\{ appConfig, updateConfig, updatePowerSaving, updateBackground, updateCameraSpotLight, updateDnaSettings \\}\\)/, 'export function OrbitSettingsPanel({ appConfig, updateConfig, updatePowerSaving, updateBackground, updateCameraSpotLight, updateDnaSettings, openSections, toggleSection, touchSection })');
fs.writeFileSync('src/components/Editor/panels/OrbitSettingsPanel.jsx', code, 'utf8');

let code2 = fs.readFileSync('src/components/Editor/panels/InsideSettingsPanel.jsx', 'utf8');
code2 = code2.replace(/export function InsideSettingsPanel\\(\\{ appConfig, updateVolumetric, updateInsideFog, updatePhysics, updateParticlePhysics, updateVolumetricVideo, updateVolumetricDepth, updateUi2d, updateUi2dBottomLeft, updateUi2dBottomLeftItem, addUi2dBottomLeftItem, removeUi2dBottomLeftItem, updateUi2dPillButton \\}\\)/, 'export function InsideSettingsPanel({ appConfig, updateConfig, updateVolumetric, updateInsideFog, updatePhysics, updateParticlePhysics, updateVolumetricVideo, updateVolumetricDepth, updateUi2d, updateUi2dBottomLeft, updateUi2dBottomLeftItem, addUi2dBottomLeftItem, removeUi2dBottomLeftItem, updateUi2dPillButton, openSections, toggleSection, touchSection })');
fs.writeFileSync('src/components/Editor/panels/InsideSettingsPanel.jsx', code2, 'utf8');

