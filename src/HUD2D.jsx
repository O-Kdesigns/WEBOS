import React, { useState } from 'react';
import './HUD2D.css';

function hexToRgb(hex, defaultVal = '168, 85, 247') {
  if (!hex || typeof hex !== 'string') return defaultVal;
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `${r}, ${g}, ${b}`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }
  return defaultVal;
}

export function HUD2D({ appConfig = {}, viewMode = 'ORBIT' }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [isPillHovered, setIsPillHovered] = useState(false);

  const ui2d = appConfig.ui2d || {};
  if (ui2d.enabled === false) return null;

  const bl = ui2d.bottomLeft || {};
  if (bl.enabled === false) return null;

  const color = bl.color || '#9d6ef8';
  const hoverColor = bl.hoverColor || '#ffffff';
  const bloomColor = bl.bloomColor || '#a855f7';
  const bloomIntensity = bl.bloomIntensity ?? 1.4;
  const enableBloom = bl.enableBloom !== false;
  const blendMode = bl.blendMode || 'screen';
  const fontSize = bl.fontSize ?? 14;
  const letterSpacing = bl.letterSpacing ?? 1.4;
  const lineSpacing = bl.lineSpacing ?? 12;
  const linkNewTab = bl.linkNewTab ?? true;
  const defaultBullet = bl.defaultBullet ?? '->';
  const fontFam = bl.fontFamily === 'sans' ? "'Inter', sans-serif" :
                  bl.fontFamily === 'mono' ? "ui-monospace, SFMono-Regular, monospace" :
                  "'nbarchitekt', ui-monospace, 'Share Tech Mono', monospace";

  const rgbBloom = hexToRgb(bloomColor);

  // Normalizace položek menu (buď ze strukturovaného pole, nebo z textu)
  let items = bl.items;
  if (!Array.isArray(items) || items.length === 0) {
    if (bl.text) {
      items = [
        {
          id: 'default-1',
          text: bl.text,
          link: bl.link || '',
          bullet: defaultBullet,
          dimmed: false
        }
      ];
    } else {
      items = [];
    }
  }

  return (
    <div 
      className="hud-2d-container"
      style={{ mixBlendMode: blendMode }}
    >
      <div
        className="hud-bottom-left"
        style={{
          position: 'absolute',
          bottom: `${bl.posY ?? 36}px`,
          left: `${bl.posX ?? 36}px`,
          fontFamily: fontFam,
          fontSize: `${fontSize}px`,
        }}
      >
        {/* Záhlaví menu (např. WHAT ARE YOU LOOKING FOR?) */}
        {bl.header && (
          <div
            className="hud-menu-header"
            style={{
              color: bl.headerColor || 'rgba(255, 255, 255, 0.8)',
              fontSize: `${fontSize * 0.95}px`,
              letterSpacing: `${letterSpacing * 1.1}px`,
            }}
          >
            {bl.header}
          </div>
        )}

        {/* Seznam řádků */}
        <div className="hud-menu-items" style={{ gap: `${lineSpacing}px` }}>
          {items.map((item, idx) => {
            const itemId = item.id || `item-${idx}`;
            const isHovered = hoveredId === itemId;
            const bulletStr = (item.bullet !== undefined && item.bullet !== '') ? item.bullet : defaultBullet;

            const isClickable = Boolean(item.link);

            // Skleněné režimy (color-dodge, screen, overlay atd.) potřebují neutrální šedou/bílou barvu,
            // aby fungovaly jako čistý násobič jasu/kontrastu pozadí a neobarvovaly ho původní barvou textu.
            // Čím světlejší šedá, tím vyšší úroveň bílé a jasu (násobič).
            const isGlass = blendMode !== 'normal';
            const effectiveColor = isGlass ? '#dfdfdf' : color;
            const effectiveHoverColor = isGlass ? '#ffffff' : hoverColor;

            // Výsledný text shadow a bloom efekt
            const itemTextShadow = isHovered
              ? `0 0 5px rgba(255, 255, 255, 0.95), 0 0 12px #ffffff, 0 0 24px rgba(${rgbBloom}, ${0.85 * bloomIntensity}), 0 0 42px rgba(${rgbBloom}, ${0.7 * bloomIntensity})`
              : enableBloom
              ? `0 0 6px rgba(${rgbBloom}, ${0.35 * bloomIntensity}), 0 0 14px rgba(${rgbBloom}, ${0.2 * bloomIntensity})`
              : 'none';

            return (
              <div
                key={itemId}
                className={`hud-menu-item ${item.dimmed ? 'dimmed' : ''}`}
                onMouseEnter={() => setHoveredId(itemId)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* 2D Bloom & Glare Vignette (eliptická záře pod textem) */}
                {enableBloom && (
                  <div
                    className="hud-glare-vignette"
                    style={{
                      opacity: isHovered ? Math.min(1, 0.6 * bloomIntensity) : 0,
                      transform: isHovered ? 'translate(-50%, -50%) scale(1.0)' : 'translate(-50%, -50%) scale(0.85)',
                      background: `radial-gradient(ellipse 65% 100% at 50% 50%, rgba(255, 255, 255, 0.8) 0%, rgba(${rgbBloom}, 0.6) 25%, rgba(${rgbBloom}, 0.15) 55%, transparent 75%)`,
                      filter: 'blur(10px)',
                    }}
                  />
                )}

                {isClickable ? (
                  <a
                    href={item.link}
                    target={linkNewTab && !item.link.startsWith('#') ? '_blank' : '_self'}
                    rel="noopener noreferrer"
                    className="hud-item-link"
                    style={{
                      color: isHovered ? effectiveHoverColor : effectiveColor,
                      textShadow: itemTextShadow,
                      letterSpacing: `${letterSpacing}px`,
                    }}
                  >
                    {bulletStr && <span className="hud-bullet">{bulletStr}</span>}
                    <span className="hud-text">{item.text}</span>
                  </a>
                ) : (
                  <div
                    className="hud-item-static"
                    style={{
                      color: isHovered ? effectiveHoverColor : effectiveColor,
                      textShadow: itemTextShadow,
                      letterSpacing: `${letterSpacing}px`,
                    }}
                  >
                    {bulletStr && <span className="hud-bullet">{bulletStr}</span>}
                    <span className="hud-text">{item.text}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Spodní pilulkové tlačítko (např. ASK ME ANYTHING...) */}
        {bl.pillButton?.enabled && (
          <a
            href={bl.pillButton.link || '#'}
            target={linkNewTab && !bl.pillButton.link?.startsWith('#') ? '_blank' : '_self'}
            rel="noopener noreferrer"
            className="hud-pill-button"
            onMouseEnter={() => setIsPillHovered(true)}
            onMouseLeave={() => setIsPillHovered(false)}
            style={{
              borderColor: isPillHovered ? '#ffffff' : `rgba(${rgbBloom}, 0.45)`,
              color: isPillHovered ? (blendMode !== 'normal' ? '#ffffff' : '#ffffff') : (blendMode !== 'normal' ? '#dfdfdf' : color),
              textShadow: isPillHovered ? `0 0 10px #ffffff, 0 0 20px rgba(${rgbBloom}, 0.8)` : 'none',
              boxShadow: isPillHovered
                ? `0 0 25px rgba(${rgbBloom}, 0.6), inset 0 0 12px rgba(255, 255, 255, 0.25)`
                : `0 0 10px rgba(0, 0, 0, 0.5)`,
              letterSpacing: `${letterSpacing}px`,
            }}
          >
            {bl.pillButton.text || 'ASK ME ANYTHING...'}
          </a>
        )}
      </div>
    </div>
  );
}
