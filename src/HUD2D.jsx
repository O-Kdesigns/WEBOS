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
  const [localPlateActive, setLocalPlateActive] = useState(false);

  const ui2d = appConfig.ui2d || {};
  if (ui2d.enabled === false) return null;

  const bl = ui2d.bottomLeft || {};
  if (bl.enabled === false) return null;

  const isPlateVisible = Boolean(bl.testPlateEnabled || localPlateActive);

  const color = bl.color || '#9d6ef8';
  const hoverColor = bl.hoverColor || '#ffffff';
  const bloomColor = bl.bloomColor || '#a855f7';
  const bloomIntensity = bl.bloomIntensity ?? 1.4;
  const enableBloom = bl.enableBloom !== false;
  const blendMode = bl.blendMode || 'luminosity';
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
    <>
      {/* Barevná testovací deska přímo pod 2D HUD textem pro testování reakce skla na barvu */}
      {isPlateVisible && (
        <div
          className="hud-test-plate"
          style={{
            position: 'absolute',
            bottom: `${(bl.posY ?? 36) - 18}px`,
            left: `${(bl.posX ?? 36) - 18}px`,
            width: '330px',
            height: '280px',
            backgroundColor: bl.testPlateColor || '#0055ff',
            borderRadius: '16px',
            zIndex: 24, // Z-index 24 leží přesně pod hud-2d-container (z-index 25), takže na něj blendMode reaguje
            pointerEvents: 'none',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.7), inset 0 0 20px rgba(255, 255, 255, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            transition: 'opacity 0.2s ease',
          }}
        />
      )}

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

            // Skleněné režimy (luminosity, color-dodge, screen, overlay atd.) potřebují neutrální barvu,
            // aby fungovaly jako čistý přenos jasu/kontrastu pozadí a neobarvovaly ho původní barvou textu.
            // U 'luminosity' určuje cílový jas (Value) pozadí a přechod černé na bílou.
            const isGlass = blendMode !== 'normal';
            const glassBright = bl.glassBrightness ?? 0.85;
            const glassHex = Math.floor(Math.max(0, Math.min(1, glassBright)) * 255).toString(16).padStart(2, '0');
            const glassColorHex = `#${glassHex}${glassHex}${glassHex}`;
            
            const effectiveColor = isGlass ? glassColorHex : color;
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
        {bl.pillButton?.enabled && (() => {
          const glassBright = bl.glassBrightness ?? 0.85;
          const glassHex = Math.floor(Math.max(0, Math.min(1, glassBright)) * 255).toString(16).padStart(2, '0');
          const glassColorHex = `#${glassHex}${glassHex}${glassHex}`;
          return (
            <a
              href={bl.pillButton.link || '#'}
              onClick={(e) => {
                e.preventDefault();
                setLocalPlateActive(prev => !prev);
              }}
              title="Kliknutím zapneš/vypneš testovací barevnou desku pod textem"
              target={linkNewTab && !bl.pillButton.link?.startsWith('#') ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="hud-pill-button"
              onMouseEnter={() => setIsPillHovered(true)}
              onMouseLeave={() => setIsPillHovered(false)}
              style={{
                borderColor: isPillHovered || isPlateVisible ? '#ffffff' : `rgba(${rgbBloom}, 0.45)`,
                color: (isPillHovered || isPlateVisible) ? '#ffffff' : (blendMode !== 'normal' ? glassColorHex : color),
                textShadow: (isPillHovered || isPlateVisible) ? `0 0 10px #ffffff, 0 0 20px rgba(${rgbBloom}, 0.8)` : 'none',
                boxShadow: (isPillHovered || isPlateVisible)
                  ? `0 0 25px rgba(${rgbBloom}, 0.6), inset 0 0 12px rgba(255, 255, 255, 0.25)`
                  : `0 0 10px rgba(0, 0, 0, 0.5)`,
                letterSpacing: `${letterSpacing}px`,
                cursor: 'pointer',
              }}
            >
              {bl.pillButton.text || 'ASK ME ANYTHING...'}
            </a>
          );
        })()}
      </div>
    </div>
    </>
  );
}
