const fs = require('fs');
let app = fs.readFileSync('src/App.jsx', 'utf8');
app = app.replace(/\r\n/g, '\n');

const regex = /function VideoManager\(\{ allUrls, activeUrl, children \}\) \{[\s\S]*?return <>\s*\{children\(activeTexture\)\}\s*<\/>;\s*\}/;

const rep = `function VideoManager({ allUrls, children }) {
  const gl = useThree(state => state.gl);
  const [textures, setTextures] = useState({});

  const urlsKey = allUrls.filter(Boolean).join('|');
  useMemo(() => {
    allUrls.forEach(rawUrl => {
      if (!rawUrl) return;
      const url = resolveAssetUrl(rawUrl);
      ensureVideoEntry(url, gl);
    });
  }, [urlsKey, gl]);

  useEffect(() => {
    const updateTextures = () => {
      const newTex = {};
      videoTextureCache.forEach((entry, url) => {
        if (entry.video.readyState >= 2) {
          newTex[url] = entry.texture;
        }
      });
      setTextures(newTex);
    };

    videoTextureCache.forEach((entry, url) => {
      entry.isActive = true;
      entry.video.play().catch(() => {});
      if (entry.video.readyState >= 2) {
        updateTextures();
      } else {
        entry.video.addEventListener('loadeddata', updateTextures, { once: true });
      }
    });
  }, [urlsKey]);

  return <>{children(textures)}</>;
}`;

if (regex.test(app)) {
    app = app.replace(regex, rep);
    fs.writeFileSync('src/App.jsx', app);
    console.log("Successfully patched VideoManager");
} else {
    console.log("Failed to patch VideoManager");
}
