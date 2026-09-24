const fs = require('fs');
let code = fs.readFileSync('src/DarkStudioBackground.jsx', 'utf8');
code = code.replace(
  'const bgSettings = appConfig?.backgroundSettings || {};',
  'const bgSettings = appConfig?.darkStudioBg || appConfig?.backgroundSettings || {};'
);
code = code.replace(
  'const centerColor = bgSettings.centerColor || ''#060608'';',
  'const centerColor = bgSettings.color || bgSettings.centerColor || ''#060608'';'
);
code = code.replace(
  'if (bgSettings.centerColor) u.uCenterColor.value.set(bgSettings.centerColor);',
  'if (bgSettings.color || bgSettings.centerColor) u.uCenterColor.value.set(bgSettings.color || bgSettings.centerColor);'
);
fs.writeFileSync('src/DarkStudioBackground.jsx', code, 'utf8');
