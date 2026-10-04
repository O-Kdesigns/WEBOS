import React, { useEffect, useRef } from 'react';
// Kinetic logo z labu (C:\PROJEKTY\BRAND\brand-kinetic-lab). Oba soubory sem zapisuje lab tlačítkem
// ★ → „🌐 Save for web“ – ručně je neupravovat, při dalším uložení se přepíšou.
import './brand/kinetic-logo.js';
import logo from './brand/logo.json';

// Config `brandLogo` (Editor → Globální → 🔠 Logo): jen zobrazit + velikost.
// Umístění (roh / střed = `anchor`) a odsazení jména v idle i při hoveru (`offset`, `hover-offset`, v em)
// se nastavuje v labu (Style → Placement debug) a přijde v logo.json – platí při jakékoli velikosti.
export const BRAND_LOGO_DEFAULTS = { enabled: true, scale: 1 };
// Šířka boxu loga při scale 1 (px); výška = 7/16 šířky.
const BASE_WIDTH = 240;

// box loga do stejného místa obrazovky, jaké určuje anchor (text se v boxu zarovná sám)
function placeBox(anchor = 'top-left') {
  const a = anchor.toLowerCase(), h = /left/.test(a) ? 'l' : /right/.test(a) ? 'r' : 'c', v = /top/.test(a) ? 't' : /bottom/.test(a) ? 'b' : 'm';
  return {
    left: h === 'l' ? 0 : h === 'c' ? '50%' : 'auto', right: h === 'r' ? 0 : 'auto',
    top: v === 't' ? 'env(safe-area-inset-top, 0px)' : v === 'm' ? '50%' : 'auto', bottom: v === 'b' ? 'env(safe-area-inset-bottom, 0px)' : 'auto',
    translate: `${h === 'c' ? '-50%' : '0'} ${v === 'm' ? '-50%' : '0'}`,
  };
}

export function BrandLogo({ appConfig }) {
  const cfg = { ...BRAND_LOGO_DEFAULTS, ...(appConfig.brandLogo || {}) };
  const ref = useRef(null);
  // starší uložení bez anchoru: dřív byl text v boxu na středu, box vlevo nahoře
  const attrs = { anchor: 'top-left', ...logo.attrs };

  // atributy nastavit přímo (React u custom elementů neřeší všechny názvy s pomlčkou spolehlivě)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // scale z labu je jen náhled (starší uložení ho ještě obsahují) – velikost tady řídí brandLogo.scale
    for (const [k, v] of Object.entries(attrs)) if (k !== 'scale') el.setAttribute(k, v);
  }, [cfg.enabled]);

  if (!cfg.enabled) return null;
  const w = BASE_WIDTH * cfg.scale;
  return (
    <kinetic-logo
      ref={ref}
      style={{
        position: 'absolute',
        ...placeBox(attrs.anchor),
        width: w,
        height: w * 7 / 16,
        zIndex: 1000,
        pointerEvents: 'auto',
        '--kl-color': logo.style?.color || '#f2f2f2',
        '--kl-accent': logo.style?.accent || '#C4FF00',
      }}
    />
  );
}
