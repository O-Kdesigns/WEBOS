const fs = require('fs');

let app = fs.readFileSync('src/App.jsx', 'utf8');

// Normalize line endings for replacement
app = app.replace(/\r\n/g, '\n');

// Fix OrbitalBoards
app = app.replace('const angle = i * pageDistance;', 'const angle = i * -pageDistance;');

// Fix BlenderScene
app = app.replace(
`        return (
          <group 
            key={page.id}
            rotation-y={idx * pageDistance}
          >`,
`        return (
          <group 
            key={page.id}
            rotation-y={idx * -pageDistance}
          >`
);

// Fix ProjectContent signature
app = app.replace('function ProjectContent({ page, appConfig, videoTexture }) {', 'function ProjectContent({ page, appConfig, videoTexture, currentIndex, pageDistance }) {');

// Fix ProjectContent rendering
app = app.replace(
`  const settings = page.particlesSettings;
  const selected = settings.selectedNodes || [];

  return (
    <group>`,
`  const settings = page.particlesSettings;
  const selected = settings.selectedNodes || [];

  return (
    <group rotation-y={currentIndex * -pageDistance}>`
);

// Fix ProjectContent call
app = app.replace(
`                <ProjectContent 
                  page={pagesData[currentIndex]} 
                  appConfig={appConfig}
                  videoTexture={videoTex}
                />`,
`                <ProjectContent 
                  page={pagesData[currentIndex]} 
                  appConfig={appConfig}
                  videoTexture={videoTex}
                  currentIndex={currentIndex}
                  pageDistance={pageDistance}
                />`
);

fs.writeFileSync('src/App.jsx', app);
console.log("App.jsx patched properly!");
