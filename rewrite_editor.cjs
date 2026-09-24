const fs = require('fs');
let code = fs.readFileSync('src/components/Editor/Editor.jsx', 'utf8');

// Replace imports
code = code.replace(/import \{ GlobalSettingsPanel \} from '.\/panels\/GlobalSettingsPanel';/, "import { OrbitSettingsPanel } from './panels/OrbitSettingsPanel';\nimport { InsideSettingsPanel } from './panels/InsideSettingsPanel';");

// Replace default editorMode
code = code.replace(/const \[editorMode, setEditorMode\] = useState\('global'\);/, "const [editorMode, setEditorMode] = useState('orbit');");

// Update touch keys
code = code.replace(/const topLevelKeys = \[[\s\S]*?\];/, "const topLevelKeys = ['global-2d','global-power-saving','global-volumetric','inside-fog-section','global-background-dark','global-kamera','global-fyzika','global-hudba','global-castice','global-background-cylinder','global-volumetric-unified'];");

// Replace buttons
const oldButtons = \<button 
              onClick={() => setEditorMode('global')}
              style={{ background: editorMode === 'global' ? '#10b981' : 'transparent', color: editorMode === 'global' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Globální nastavení
            </button>
            <button 
              onClick={() => setEditorMode('pages')}
              style={{ background: editorMode === 'pages' ? '#3b82f6' : 'transparent', color: editorMode === 'pages' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Stránky Portfolia
            </button>\;

const newButtons = \<button 
              onClick={() => setEditorMode('orbit')}
              style={{ background: editorMode === 'orbit' ? '#10b981' : 'transparent', color: editorMode === 'orbit' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Globální (DNA & Orbit)
            </button>
            <button 
              onClick={() => setEditorMode('inside')}
              style={{ background: editorMode === 'inside' ? '#f59e0b' : 'transparent', color: editorMode === 'inside' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Uvnitř (Detail projektu)
            </button>
            <button 
              onClick={() => setEditorMode('pages')}
              style={{ background: editorMode === 'pages' ? '#3b82f6' : 'transparent', color: editorMode === 'pages' ? '#fff' : '#aaa', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Stránky Portfolia
            </button>\;

code = code.replace(/<button[\s\S]*?Stránky Portfolia\s*<\/button>/, newButtons);

// Replace render content
const oldRender = \<div className={\editor-content \$\{editorMode === 'global' \? 'editor-content-global' : ''\}\}>
        \{editorMode === 'global' \? \(
          <GlobalSettingsPanel[\s\S]*?\/>
        \) : \(
          pages\.map\(\(page, index\) => \([\s\S]*?\}\)
        \)\}
      <\/div>\;

const newRender = \<div className={\editor-content \$\{editorMode !== 'pages' ? 'editor-content-fullscreen' : ''\}\}>
        {editorMode === 'orbit' && (
          <OrbitSettingsPanel 
            appConfig={appConfig}
            updateConfig={updateConfig}
            dnaHeight360={dnaHeight360}
            updatePowerSaving={updatePowerSaving}
            updateBackground={updateBackground}
            updateCameraSpotLight={updateCameraSpotLight}
            updateDnaSettings={updateDnaSettings}
            openSections={openSections}
            toggleSection={toggleSection}
            touchSection={touchSection}
          />
        )}
        {editorMode === 'inside' && (
          <InsideSettingsPanel 
            appConfig={appConfig}
            updateVolumetric={updateVolumetric}
            updateInsideFog={updateInsideFog}
            updatePhysics={updatePhysics}
            updateParticlePhysics={updateParticlePhysics}
            updateVolumetricVideo={updateVolumetricVideo}
            updateVolumetricDepth={updateVolumetricDepth}
            updateUi2d={updateUi2d}
            updateUi2dBottomLeft={updateUi2dBottomLeft}
            updateUi2dBottomLeftItem={updateUi2dBottomLeftItem}
            addUi2dBottomLeftItem={addUi2dBottomLeftItem}
            removeUi2dBottomLeftItem={removeUi2dBottomLeftItem}
            updateUi2dPillButton={updateUi2dPillButton}
            openSections={openSections}
            toggleSection={toggleSection}
            touchSection={touchSection}
          />
        )}
        {editorMode === 'pages' && (
          pages.map((page, index) => (
            <PageSettingsPanel 
              key={page.id || index}
              page={page}
              index={index}
              updatePage={updatePage}
              removePage={removePage}
              assets={assets}
              openSections={openSections}
              toggleSection={toggleSection}
            />
          ))
        )}
      </div>\;

code = code.replace(/<div className=\{\editor-content[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*\)$/, newRender + '\n    </div>\n  </div>\n  );\n}');

fs.writeFileSync('src/components/Editor/Editor.jsx', code, 'utf8');
