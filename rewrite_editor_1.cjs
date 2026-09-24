const fs = require('fs');
let code = fs.readFileSync('src/components/Editor/Editor.jsx', 'utf8');
code = code.replace(/import \\{ GlobalSettingsPanel \\} from '.\\/panels\\/GlobalSettingsPanel';/, "import { OrbitSettingsPanel } from './panels/OrbitSettingsPanel';\\nimport { InsideSettingsPanel } from './panels/InsideSettingsPanel';");
code = code.replace(/const \\[editorMode, setEditorMode\\] = useState\\('global'\\);/, "const [editorMode, setEditorMode] = useState('orbit');");
fs.writeFileSync('src/components/Editor/Editor.jsx', code, 'utf8');
