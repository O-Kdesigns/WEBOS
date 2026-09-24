const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// Remove DnaHeightDetector function
code = code.replace(/function DnaHeightDetector\(\{[^\}]+\}\) \{[\s\S]*?return null;\s*\}/, '');
// Remove its usage
code = code.replace(/<DnaHeightDetector setDnaHeight360=\{setDnaHeight360\} \/>/, '');
// Change state to config
code = code.replace(/const \[dnaHeight360, setDnaHeight360\] = useState\(30\);/, 'const dnaHeight360 = appConfig.dnaHeight360 || 30;');

fs.writeFileSync('src/App.jsx', code, 'utf8');
