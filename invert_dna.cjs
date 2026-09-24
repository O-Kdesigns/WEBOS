const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. springScrollY
code = code.replace(/springScrollY = rotationY\.to\(r => \(r \/ -pageDistance\) \* -yStep\)/g, 'springScrollY = rotationY.to(r => (r / pageDistance) * -yStep)');

// 2. maxRot calculations
code = code.replace(/const maxRot = -\(totalPages - 1\) \* pageDistance;/g, 'const maxRot = (totalPages - 1) * pageDistance;');

// 3. dx sensitivity
code = code.replace(/let nextRot = currentRotRef\.current \+ dx \* sensitivity;/g, 'let nextRot = currentRotRef.current - dx * sensitivity;');
code = code.replace(/let nextRot = currentRotRef\.current \+ \(dx \* sensitivity\) \+ \(vx \* 20 \* Math\.sign\(dx\)\);/g, 'let nextRot = currentRotRef.current - (dx * sensitivity) - (vx * 20 * Math.sign(dx));');

// 4. Clamping logic
code = code.replace(/nextRot = Math\.min\(Math\.max\(nextRot, maxRot - pageDistance \* 0\.5\), pageDistance \* 0\.5\);/g, 'nextRot = Math.max(Math.min(nextRot, maxRot + pageDistance * 0.5), -pageDistance * 0.5);');
code = code.replace(/nextRot = Math\.min\(Math\.max\(nextRot, maxRot\), 0\);/g, 'nextRot = Math.max(Math.min(nextRot, maxRot), 0);');

// 5. Wheel step logic
code = code.replace(/const currentStep = currentRotRef\.current \/ -stepAngle;/g, 'const currentStep = currentRotRef.current / stepAngle;');
code = code.replace(/let nextRot = targetStep \* -stepAngle;/g, 'let nextRot = targetStep * stepAngle;');

// 6. Component rendering placements
code = code.replace(/rotation-y=\{angle\}/g, 'rotation-y={i * pageDistance}'); // OrbitalBoards
code = code.replace(/rotation-y=\{currentIndex \* -pageDistance\}/g, 'rotation-y={currentIndex * pageDistance}'); // ProjectContent inside App
code = code.replace(/rotation-y=\{idx \* -pageDistance\}/g, 'rotation-y={idx * pageDistance}'); // BlenderScene
code = code.replace(/const exactIdx = val \/ -pageDistance;/g, 'const exactIdx = val / pageDistance;');
code = code.replace(/currentRotRef\.current = targetIndex \* -pageDistance;/g, 'currentRotRef.current = targetIndex * pageDistance;');
code = code.replace(/let idx = Math\.round\(val \/ -pageDistance\) % totalPages;/g, 'let idx = Math.round(val / pageDistance) % totalPages;');

fs.writeFileSync('src/App.jsx', code, 'utf8');
