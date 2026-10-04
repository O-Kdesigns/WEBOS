import React, { useEffect, useRef } from 'react';
// Kinetic logo z labu (C:\PROJEKTY\BRAND\brand-kinetic-lab). Oba soubory sem zapisuje lab tlačítkem
// ★ → „🌐 Save for web“ – ručně je neupravovat, při dalším uložení se přepíšou.
import './brand/kinetic-logo.js';
import logo from './brand/logo.json';

// Config `brandLogo` (Editor → Globální → 🔠 Logo). offsetX/offsetY = px od levého horního rohu.
export const BRAND_LOGO_DEFAULTS = { enabled: true, scale: 1, offsetX: 16, offsetY: 8 };
// Šířka boxu loga při scale 1 (px); výška = 7/16 šířky. Text vyplní ~82 % šířky, hover zóna je jen kolem textu.
const BASE_WIDTH = 240;

export function BrandLogo({ appConfig }) {
  const cfg = { ...BRAND_LOGO_DEFAULTS, ...(appConfig.brandLogo || {}) };
  const ref = useRef(null);

  // atributy nastavit přímo (React u custom elementů neřeší všechny názvy s pomlčkou spolehlivě)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // scale z labu je jen náhled (starší uložení ho ještě obsahují) – velikost tady řídí brandLogo.scale
    for (const [k, v] of Object.entries(logo.attrs)) if (k !== 'scale') el.setAttribute(k, v);
  }, [cfg.enabled]);

  if (!cfg.enabled) return null;
  const w = BASE_WIDTH * cfg.scale;
  return (
    <kinetic-logo
      ref={ref}
      style={{
        position: 'absolute',
        left: cfg.offsetX,
        top: `calc(${cfg.offsetY}px + env(safe-area-inset-top, 0px))`,
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
