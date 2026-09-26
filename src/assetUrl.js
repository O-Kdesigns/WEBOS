// Cesty k souborům z public/. Lokálně a na Netlify je base "/", na GitHub Pages "/WEBOS/".
export const withBase = (path) =>
  path && path.startsWith('/') ? import.meta.env.BASE_URL + path.slice(1) : path;

// Normalizuje cestu z settings.json na URL souboru v public/obsah/
export const resolveAssetUrl = (url) => {
  if (!url) return '';
  let finalUrl = url;
  if (url.startsWith('/obsah/')) finalUrl = url;
  else if (url.startsWith('obsah/')) finalUrl = '/' + url;
  else if (url.startsWith('/')) finalUrl = url;
  else finalUrl = '/obsah/' + url;
  return encodeURI(withBase(finalUrl));
};
