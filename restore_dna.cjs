const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const detectorCode = \
function DnaHeightDetector({ setDnaHeight360 }) {
  const { nodes } = useGLTF('/obsah/everything/newworldorder.glb');
  useEffect(() => {
    const deskKeys = Object.keys(nodes).filter(k => k.startsWith('GlassDesk'));
    if (deskKeys.length >= 2) {
      const pos1 = nodes[deskKeys[0]].getWorldPosition(new THREE.Vector3());
      const pos2 = nodes[deskKeys[1]].getWorldPosition(new THREE.Vector3());
      const h = Math.abs(pos1.y - pos2.y);
      if (h > 0.1) {
        // Uživatel potvrdil, že 2 referenční televize v Blenderu jsou od sebe přesně 180° (půl otočky).
        // Takže plná výška 360° otočky je h * 2.
        setDnaHeight360(h * 2);
      }
    }
  }, [nodes, setDnaHeight360]);
  return null;
}
\;

// Insert after function RenderRestorationHandler
code = code.replace(/function App\(\) \{/, detectorCode + '\nfunction App() {');

// Re-add state inside App
code = code.replace(/const dnaHeight360 = appConfig\.dnaHeight360 \|\| 30;/, 'const [dnaHeight360, setDnaHeight360] = useState(appConfig.dnaHeight360 || 30);');

// Re-add component render
code = code.replace(/<RenderRestorationHandler isSuspended=\{isSuspended\} \/>/, '<RenderRestorationHandler isSuspended={isSuspended} />\n          <DnaHeightDetector setDnaHeight360={setDnaHeight360} />');

fs.writeFileSync('src/App.jsx', code, 'utf8');
