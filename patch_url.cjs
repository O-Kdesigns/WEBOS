const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

code = code.replace(/function VideoTextureProvider\(\{\s*url,\s*children\s*\}\)\s*\{[\s\S]*?function VideoTextureLoader\(\{\s*url,\s*children\s*\}\)\s*\{/, 
`const resolveAssetUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('/obsah/')) return url;
  if (url.startsWith('obsah/')) return '/' + url;
  if (url.startsWith('/')) return url;
  return '/obsah/' + url;
};

function VideoTextureProvider({ url, children }) {
  if (!url) return <>{children(null)}</>;
  const resolvedUrl = resolveAssetUrl(url);
  return (
    <Suspense fallback={<>{children(null)}</>}>
      <VideoTextureLoader url={resolvedUrl}>{children}</VideoTextureLoader>
    </Suspense>
  );
}

function VideoTextureLoader({ url, children }) {`);

fs.writeFileSync('src/App.jsx', code);
