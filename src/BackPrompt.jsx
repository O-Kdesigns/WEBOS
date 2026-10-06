import React, { useEffect, useRef, useState } from 'react';
import './HUD2D.css'; // font nbarchitekt + .hud-dark-floor

// „<- BACK TO INFO“ vedle loga vlevo nahoře = cesta zpět na WEBINFO (prozatímní propojení webů).
// Vzhled = spodní menu HUD2D (ui2d.bottomLeft: font, barvy, color-dodge, darkFloor).
// Kam vede: ?back=<url> (posílá WEBINFO při vstupu, uloží se do sessionStorage) → config ui2d.backPrompt.url
// → v DEV http://localhost:5180/, online WEBINFO (adresa ve fallbacku níže – po koupi domény přepsat). Bez adresy se nezobrazí. Pozice sleduje šířku textu loga
// (Ø/K ↔ ØLIVER KANTØR, morph `_m` uvnitř <kinetic-logo>) – posun přímo přes style, bez re-renderu.
const BACK_KEY = 'webos.backUrl';

function readBackUrl(cfgUrl) {
  try {
    const q = new URLSearchParams(window.location.search);
    const back = q.get('back');
    if (back && /^https?:\/\//.test(back)) {
      sessionStorage.setItem(BACK_KEY, back);
      q.delete('back'); q.delete('from');
      const rest = q.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
      return back;
    }
    const saved = sessionStorage.getItem(BACK_KEY);
    if (saved) return saved;
  } catch { /* sessionStorage může být zakázaný */ }
  return cfgUrl || (import.meta.env.DEV ? 'http://localhost:5180/' : 'https://webinfo.qlopmr.workers.dev/');
}

export function BackPrompt({ appConfig = {} }) {
  const ui2d = appConfig.ui2d || {};
  const cfg = ui2d.backPrompt || {};
  const bl = ui2d.bottomLeft || {};
  const [url] = useState(() => readBackUrl(cfg.url));
  const [hover, setHover] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const boxRef = useRef(null);

  // pozice: vpravo od textu loga, svisle na jeho středu
  useEffect(() => {
    if (!url) return;
    let raf = 0, last = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const box = boxRef.current, logo = document.querySelector('kinetic-logo');
      const rows = logo?.shadowRoot?.querySelectorAll('.row');
      if (!box || !rows || rows.length < 2) return;
      const a = rows[0].getBoundingClientRect(), b = rows[1].getBoundingClientRect();
      if (!a.width) return;
      const m = Math.min(1, Math.max(0, logo._m || 0)), e = m * m * (3 - 2 * m);
      const right = b.width ? a.right + (b.right - a.right) * e : a.right;
      const x = Math.round(right + (cfg.gap ?? 22)), y = Math.round(a.top + a.height / 2 - box.offsetHeight / 2);
      const key = x + ',' + y;
      if (key !== last) { last = key; box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.visibility = 'visible'; }
    };
    raf = requestAnimationFrame(tick);
    // plocha, která drží rozbalené logo, se rozšíří i na odkaz (a mezeru k němu) – jen když je logo už rozbalené,
    // takže najetí přímo na odkaz logo nerozbaluje (kinetic-logo `stayRects`)
    const logo = document.querySelector('kinetic-logo');
    if (logo) logo.stayRects = () => {
      const box = boxRef.current; if (!box) return [];
      const r = box.getBoundingClientRect(), g = (cfg.gap ?? 22) + 6;
      return [{ left: r.left - g, right: r.right, top: r.top, bottom: r.bottom }];
    };
    return () => { cancelAnimationFrame(raf); if (logo) logo.stayRects = null; };
  }, [url, cfg.gap]);

  if (!url || cfg.enabled === false || ui2d.enabled === false) return null;

  const textColor = bl.textColor || '#c9c9c9';
  const hoverColor = bl.hoverColor || '#ffffff';
  const bloom = bl.bloomColor || '#a855f7';
  const blendOff = new URLSearchParams(window.location.search).get('hudblend') === '0';
  const blendMode = blendOff ? 'normal' : (bl.blendMode || 'color-dodge');
  const darkFloor = Math.min(1, Math.max(0, bl.darkFloor ?? 0.14));
  const fontFamily = bl.fontFamily === 'sans' ? "'Inter', sans-serif" :
    bl.fontFamily === 'mono' ? 'ui-monospace, SFMono-Regular, monospace' :
    "'nbarchitekt', ui-monospace, 'Share Tech Mono', monospace";
  const text = cfg.text || 'BACK TO INFO';
  const bullet = cfg.bullet ?? '<-';
  const style = { fontFamily, fontSize: `${cfg.fontSize ?? bl.fontSize ?? 14}px`, fontWeight: bl.fontWeight ?? 400, letterSpacing: `${bl.letterSpacing ?? 0}px` };

  const go = (e) => {
    e.preventDefault();
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => { window.location.href = url; }, 380);
  };

  const label = (color, shadow) => (
    <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', color, textShadow: shadow, transition: 'color .18s, text-shadow .18s' }}>
      <span className="hud-bullet">{bullet}</span><span>{text}</span>
    </span>
  );

  return (
    <>
      {/* obal BEZ stacking contextu (žádný transform/opacity/z-index) – color-dodge se musí míchat s canvasem (viz HUD2D.css);
          vrstvy nad logem (z-index 1000) až na dětech */}
      <div ref={boxRef} style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'nowrap', ...style }}>
        {blendMode !== 'normal' && darkFloor > 0 && (
          <div className="hud-dark-floor" aria-hidden="true" style={{ opacity: darkFloor, padding: '2px 6px', zIndex: 1001 }}>{label(textColor)}</div>
        )}
        <a
          href={url}
          onClick={go}
          onMouseEnter={() => { setHover(true); }}
          onMouseLeave={() => { setHover(false); }}
          style={{ position: 'relative', zIndex: 1002, display: 'block', padding: '2px 6px', textDecoration: 'none', pointerEvents: 'auto', cursor: 'pointer', mixBlendMode: blendMode }}
        >
          {label(hover ? hoverColor : textColor, hover ? `0 0 12px ${bloom}b0, 0 0 28px ${bloom}66` : 'none')}
        </a>
      </div>
      {/* odchod: krátké zatmění, pak WEBINFO */}
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 3000, pointerEvents: 'none', opacity: leaving ? 1 : 0, transition: 'opacity .38s ease' }} />
    </>
  );
}
