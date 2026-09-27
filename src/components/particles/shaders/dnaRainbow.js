// Barva particlů v ORBITu (DNA stav): dřív jeden pevný uDnaColor (natvrdo modrý, pak jsme
// ho zkusili navázat na barvu aktivního projektu - ale to dělalo OKAMŽITOU změnu barvy při
// přepnutí projektu). Teď: stojatá (world-space, na kameře nezávislá) duha, pomalu se
// proměňující v čase, namíchaná ze skutečné palety - 2D prach (config.atmosphereDust.colors)
// + barvy všech portfolií (settings.json) - viz ParticleMaterial.jsx (spočítá `uDnaPalette`).
export const DNA_PALETTE_MAX = 8;

// Sdílená logika prolnutí: každý shader si sám spočítá `field` (0..1, ze své world pozice
// + uTime) a zavolá dnaPaletteBlend(field) - výsledek je plynulá směs 2 (výjimečně 3)
// nejbližších barev z palety, nikdy syntetická barva mimo paletu.
export const DNA_RAINBOW_GLSL = `
  uniform vec3 uDnaPalette[${DNA_PALETTE_MAX}];
  uniform float uDnaCount;

  vec3 dnaPaletteBlend(float field) {
    float n = max(uDnaCount, 1.0);
    vec3 col = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < ${DNA_PALETTE_MAX}; i++) {
      if (i >= int(uDnaCount)) break;
      float phase = (float(i) + 0.5) / n;
      float d = abs(field - phase);
      d = min(d, 1.0 - d);
      float w = pow(max(0.0, 1.0 - d * n * 0.85), 2.0);
      col += uDnaPalette[i] * w;
      wsum += w;
    }
    return wsum > 0.0001 ? col / wsum : uDnaPalette[0];
  }
`;

// appConfig.atmosphereDust.colors (živé, z Editoru) + barva každého portfolia ze settings.json
// (particlesSettings.baseColor, jinak page.color) - automaticky, beze zmínky konkrétní stránky
// v kódu. Pages je statický import (settings.json), takže se aktualizuje s HMR/reloadem;
// dust barvy jdou přes appConfig prop, reagují na živou úpravu v Editoru.
//
// Vrací VŽDY pole délky DNA_PALETTE_MAX (three.js `PureArrayUniform` čte přesně tolik prvků,
// kolik má pole deklarované v shaderu - kratší JS pole shodilo upload s "toArray of undefined").
// `count` říká shaderu, kolik prvků od začátku je "opravdových" (zbytek je jen padding).
export function buildDnaPalette(THREE, appConfig, pages) {
  const dustColors = appConfig?.atmosphereDust?.colors || [];
  const pageColors = (pages || [])
    .map((p) => p.particlesSettings?.baseColor || p.color)
    .filter(Boolean);
  const seen = new Set();
  const real = [];
  for (const hex of [...dustColors, ...pageColors]) {
    const key = String(hex).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    real.push(new THREE.Color(hex));
    if (real.length >= DNA_PALETTE_MAX) break;
  }
  if (real.length < 2) real.push(new THREE.Color('#3b82f6'), new THREE.Color('#6df73b'));
  const colors = real.slice();
  while (colors.length < DNA_PALETTE_MAX) colors.push(real[colors.length % real.length]);
  return { colors, count: real.length };
}
