import * as THREE from 'three';

let maskCanvas = null;
let maskTexture = null;
let lastKey = '';

// Automatická invalidace mezipaměti po dokončení načtení webových fontů
if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    lastKey = '';
  }).catch(() => {});
}

/**
 * Pomocná funkce pro vykreslení textu s volitelným zesílením tahu (pro extra tučné váhy > 700)
 */
function renderCanvasText(ctx, text, x, y, strokeWidth) {
  if (strokeWidth > 0) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillText(text, x, y);
}

/**
 * Generuje 2D textovou masku pro TextContrastPass.
 * Vykreslí přesný tvar písmen HUD textu (font NB Architekt / Google Fonts, tučnost, rozpal, odrážky)
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
  const header = (bl.header ?? 'WHAT ARE YOU LOOKING FOR?').toUpperCase();
  const baseFontSize = bl.fontSize ?? 13;
  const fontSize = baseFontSize * dpr;
  const fontWeight = bl.fontWeight ?? 700; // Původní vzhled v CSS byl 700 (Bold)
  const fontStroke = Math.max(0, (bl.fontStrokeWidth ?? 0) + Math.max(0, (fontWeight - 700) / 250)) * dpr;
  const letterSpacing = bl.letterSpacing ?? 1.4;
  const lineSpacing = (bl.lineSpacing ?? 11) * dpr;
  const defaultBullet = bl.defaultBullet ?? '->';

  // Volba rodiny písma
  const fontFam = 
    bl.fontFamily === 'orbitron' ? "'Orbitron', sans-serif" :
    bl.fontFamily === 'jetbrains' ? "'JetBrains Mono', monospace" :
    bl.fontFamily === 'space' ? "'Space Mono', monospace" :
    bl.fontFamily === 'syne' ? "'Syne', sans-serif" :
    bl.fontFamily === 'mono' ? "ui-monospace, SFMono-Regular, monospace" :
    bl.fontFamily === 'sans' ? "'Inter', sans-serif" :
    "'nbarchitekt', 'Space Mono', 'Courier New', monospace";

  // Přesný výpočet potřebné výšky obsahu pro dokonalé zarovnání k levému dolnímu rohu obrazovky
  let totalH = 8 * dpr;
  if (header) totalH += (fontSize * 0.95) + 14 * dpr;
  totalH += items.length * (fontSize + lineSpacing);
  if (bl.pillButton?.enabled !== false) totalH += 16 * dpr + 36 * dpr + 6 * dpr;

  const boxW = Math.max(320, bl.boxWidth ?? 340);
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

  const currentKey = `${screenWidth}|${screenHeight}|${hoveredId}|${fontSize}|${fontWeight}|${fontStroke}|${fontFam}|${letterSpacing}|${lineSpacing}|${header}|${JSON.stringify(items)}`;
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

  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${letterSpacing * dpr}px`;
  }
  ctx.textRendering = 'geometricPrecision';

  let currentY = 4 * dpr;
  const startX = 4 * dpr;

  // 1. Nadpis menu (např. WHAT ARE YOU LOOKING FOR?)
  if (header) {
    ctx.font = `700 ${fontSize * 0.95}px ${fontFam}`;
    ctx.globalAlpha = 0.88;
    renderCanvasText(ctx, header, startX, currentY, fontStroke * 0.8);
    currentY += fontSize * 0.95 + 14 * dpr;
  }

  // 2. Seznam položek
  items.forEach((item, idx) => {
    const itemId = item.id || `item-${idx}`;
    const isHovered = itemId === hoveredId;
    const bullet = (item.bullet !== undefined && item.bullet !== '') ? item.bullet : defaultBullet;
    const itemText = (item.text || '').toUpperCase();
    const fullText = bullet ? `${bullet}  ${itemText}` : itemText;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFam}`;

    if (isHovered) {
      ctx.globalAlpha = 1.0;
      // Výrazná bílá záře při najetí myší (odpovídá starému text-shadow)
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10 * dpr;
      renderCanvasText(ctx, fullText, startX, currentY, fontStroke + 0.5 * dpr);
      ctx.shadowBlur = 0;
    } else if (item.dimmed) {
      ctx.globalAlpha = 0.38;
      renderCanvasText(ctx, fullText, startX, currentY, fontStroke);
    } else {
      ctx.globalAlpha = 1.0;
      renderCanvasText(ctx, fullText, startX, currentY, fontStroke);
    }

    currentY += fontSize + lineSpacing;
  });

  // 3. Spodní pilulkové tlačítko (ASK ME ANYTHING...)
  if (bl.pillButton?.enabled !== false) {
    const pillText = (bl.pillButton?.text || 'ASK ME ANYTHING...').toUpperCase();
    currentY += 12 * dpr;
    const pillFontSize = fontSize * 0.88;
    ctx.font = `700 ${pillFontSize}px ${fontFam}`;
    ctx.globalAlpha = 0.95;

    // Rámeček pilulkového tlačítka (border: 1.5px solid)
    const pillW = Math.min(canvasW - startX * 2, 230 * dpr);
    const pillH = 34 * dpr;
    const radius = pillH * 0.5;

    ctx.beginPath();
    ctx.roundRect(startX, currentY, pillW, pillH, radius);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Text tlačítka vycentrovaný vertikálně i horizontálně
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = `${(letterSpacing * 1.1) * dpr}px`;
    }
    const textMetric = ctx.measureText(pillText);
    const textX = startX + Math.max(14 * dpr, (pillW - textMetric.width) * 0.5);
    const textY = currentY + (pillH - pillFontSize) * 0.5 - 1 * dpr;

    renderCanvasText(ctx, pillText, textX, textY, fontStroke * 0.8);
  }

  maskTexture.needsUpdate = true;
  return { texture: maskTexture, bounds };
}
