import React from 'react';
import './HUD2D.css';

function renderFormattedText(text, globalLink, linkNewTab) {
  if (!text) return null;

  // Pokud je nastaven globální odkaz a text neobsahuje vlastní markdown odkazy
  if (globalLink && !text.includes('](')) {
    return (
      <a
        href={globalLink}
        target={linkNewTab ? '_blank' : '_self'}
        rel="noopener noreferrer"
        className="hud-link"
      >
        {text}
      </a>
    );
  }

  // Podpora pro markdown styl hypertextu: [Název odkazu](https://cesta...)
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const elements = [];
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      elements.push(text.slice(lastIdx, match.index));
    }
    elements.push(
      <a
        key={match.index}
        href={match[2]}
        target={linkNewTab ? '_blank' : '_self'}
        rel="noopener noreferrer"
        className="hud-link"
      >
        {match[1]}
      </a>
    );
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    elements.push(text.slice(lastIdx));
  }

  return elements.length > 0 ? elements : text;
}

export function HUD2D({ appConfig = {}, viewMode = 'ORBIT' }) {
  const ui2d = appConfig.ui2d || {};
  if (ui2d.enabled === false) return null;

  const bl = ui2d.bottomLeft || {};
  const isBlEnabled = bl.enabled !== false;
  if (!isBlEnabled) return null;

  const hasLink = Boolean(bl.link || (bl.text && bl.text.includes('](')));

  return (
    <div className="hud-2d-container">
      <div
        className="hud-bottom-left"
        style={{
          position: 'absolute',
          bottom: `${bl.posY ?? 28}px`,
          left: `${bl.posX ?? 28}px`,
          fontSize: `${bl.fontSize ?? 13}px`,
          color: bl.color || '#94a3b8',
          opacity: bl.opacity ?? 0.85,
          letterSpacing: `${bl.letterSpacing ?? 1.5}px`,
          textTransform: bl.textTransform || 'uppercase',
          pointerEvents: hasLink ? 'auto' : 'none',
        }}
      >
        {renderFormattedText(bl.text ?? 'WEBOS // 2026', bl.link, bl.linkNewTab ?? true)}
      </div>
    </div>
  );
}
