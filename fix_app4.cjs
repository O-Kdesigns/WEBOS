const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Fix Camera config override
code = code.replace(
  'orbitFov = camChoose.fov || orbitFov;',
  'orbitFov = appConfig.cameraFov || camChoose.fov || 60;'
);
code = code.replace(
  'orbitY = worldPos.y !== undefined ? worldPos.y : orbitY;',
  'orbitY = appConfig.cameraHeight ?? (worldPos.y !== undefined ? worldPos.y : 1.5);'
);

// 2. Fix spring physics hot-reload
code = code.replace(
  /api\.start\(\{ rotationY: currentRotRef\.current, immediate: false \}\);/g,
  "api.start({ rotationY: currentRotRef.current, immediate: false, config: { mass: appConfig.physics?.mass ?? 1, tension: appConfig.physics?.tension ?? 170, friction: appConfig.physics?.friction ?? 26 } });"
);

code = code.replace(
  /insideApi\.start\(\{ insideRotationY: insideRotRef\.current, immediate: false \}\);/g,
  "insideApi.start({ insideRotationY: insideRotRef.current, immediate: false, config: { mass: appConfig.physics?.mass ?? 1, tension: appConfig.physics?.tension ?? 170, friction: appConfig.physics?.friction ?? 26 } });"
);

fs.writeFileSync('src/App.jsx', code, 'utf8');
