import * as THREE from 'three';

let maskCanvas = null;
let maskTexture = null;
let lastKey = '';

/**
 * Generuje 2D textovou masku pro TextContrastPass.
 * Vykreslí přesný tvar písmen HUD textu (včetně fontu a odrážek)
 * do THREE.CanvasTexture, kterou shader použije k oříznutí efektu.
 */
export function getHudTextMask(appConfig, screenWidth, screenHeight, hoveredId) {
  if (typeof document === 'undefined') return null;

  const bl = appConfig?.ui2d?.bottomLeft || {};
  if (appConfig?.ui2d?.enabled === false || bl.enabled === false) {
    return null;
  }

  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  const items = bl.items || [];
  const header = bl.header || 'WHAT ARE YOU LOOKING FOR?';
  const fontSize = (bl.fontSize ?? 13) * dpr;
  const lineSpacing = (bl.lineSpacing ?? 11) * dpr;
  const defaultBullet = bl.defaultBullet ?? '->';

  // Přesný výpočet potřebné výšky obsahu pro dokonalé zarovnání bez plovoucího offsetu
  let totalH = 8 * dpr;
  if (header) totalH += fontSize * 0.95 + 12 * dpr;
  totalH += items.length * (fontSize + lineSpacing);
  if (bl.pillButton?.enabled !== false) totalH += 10 * dpr + 34 * dpr + 6 * dpr;

  const boxW = 320;
  const boxH = Math.ceil(totalH / dpr);
  const canvasW = Math.floor(boxW * dpr);
  const canvasH = Math.floor(boxH * dpr);

  if (!maskCanvas) {
    maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvasW;
    maskCanvas.height = canvasH;
    maskTexture = new THREE.CanvasTexture(maskCanvas);
    maskTexture.minFilter = THREE.LinearFilter;
    maskTexture.magFilter = THREE.LinearFilter;
    maskTexture.generateMipmaps = false;
  } else if (maskCanvas.width !== canvasW || maskCanvas.height !== canvasH) {
    maskCanvas.width = canvasW;
    maskCanvas.height = canvasH;
  }

  // Pozice v pixelech na obrazovce (odspodu a zleva)
  const posX = (bl.posX ?? 36);
  const posY = (bl.posY ?? 36);

  // Převod na UV souřadnice obrazovky [minU, minV, maxU, maxV]
  // V Three.js je UV (0,0) vlevo dole
  const minU = Math.max(0, posX / Math.max(1, screenWidth));
  const minV = Math.max(0, posY / Math.max(1, screenHeight));
  const maxU = Math.min(1, (posX + boxW) / Math.max(1, screenWidth));
  const maxV = Math.min(1, (posY + boxH) / Math.max(1, screenHeight));

  const bounds = [minU, minV, maxU, maxV];

  const currentKey = `${screenWidth}|${screenHeight}|${hoveredId}|${fontSize}|${lineSpacing}|${header}|${JSON.stringify(items)}`;
  if (currentKey === lastKey) {
    return { texture: maskTexture, bounds };
  }
  lastKey = currentKey;

  const ctx = maskCanvas.getContext('2d');
  ctx.clearRect(0, 0, canvasW, canvasH);

  // V Three.js CanvasTexture má flipY = true (default):
  // Y = 0 v canvasu odpovídá V = 1 (horní okraj boxu na obrazovce).
  // Y = canvasH v canvasu odpovídá V = 0 (dolní okraj boxu na obrazovce).
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';

  let currentY = 4 * dpr;
  const startX = 4 * dpr;

  // 1. Nadpis menu
  if (header) {
    ctx.font = `700 ${fontSize * 0.95}px nbarchitekt, 'Courier New', monospace`;
    ctx.globalAlpha = 0.9;
    ctx.fillText(header, startX, currentY);
    currentY += fontSize * 0.95 + 12 * dpr;
  }

  // 2. Seznam položek
  items.forEach((item, idx) => {
    const itemId = item.id || `item-${idx}`;
    const isHovered = itemId === hoveredId;
    const bullet = (item.bullet !== undefined && item.bullet !== '') ? item.bullet : defaultBullet;
    const text = `${bullet ? bullet + ' ' : ''}${item.text || ''}`;

    ctx.font = `400 ${fontSize}px nbarchitekt, 'Courier New', monospace`;

    if (isHovered) {
      ctx.globalAlpha = 1.0;
      // Zvýraznění při najetí myší
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8 * dpr;
      ctx.fillText(text, startX, currentY);
      ctx.shadowBlur = 0;
    } else if (item.dimmed) {
      ctx.globalAlpha = 0.38;
      ctx.fillText(text, startX, currentY);
    } else {
      ctx.globalAlpha = 1.0;
      ctx.fillText(text, startX, currentY);
    }

    currentY += fontSize + lineSpacing;
  });

  // 3. Spodní tlačítko (ASK ME ANYTHING...)
  if (bl.pillButton?.enabled) {
    const pillText = bl.pillButton.text || 'ASK ME ANYTHING...';
    currentY += 10 * dpr;
    ctx.font = `400 ${fontSize * 0.9}px nbarchitekt, 'Courier New', monospace`;
    ctx.globalAlpha = 0.9;

    // Zaoblený rámeček tlačítka
    const pillW = Math.min(canvasW - startX * 2, 220 * dpr);
    const pillH = 34 * dpr;
    const radius = 17 * dpr;

    ctx.beginPath();
    ctx.roundRect(startX, currentY, pillW, pillH, radius);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Text uvnitř tlačítka
    ctx.fillText(pillText, startX + 16 * dpr, currentY + 9 * dpr);
  }

  maskTexture.needsUpdate = true;
  return { texture: maskTexture, bounds };
}
