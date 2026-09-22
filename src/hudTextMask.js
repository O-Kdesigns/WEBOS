import * as THREE from 'three';

let maskCanvas = null;
let maskTexture = null;
let lastKey = '';
let allocatedW = 0;
let allocatedH = 0;

// Automatická invalidace mezipaměti po načtení fontů
if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    lastKey = '';
  }).catch(() => {});
}

/**
 * Pomocná funkce pro vykreslení textu s volitelným zesílením tahu (extra bold)
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
 * Generuje 2D textovou masku pro TextContrastPass s pevnou velikostí bufferu (Zero-Ghosting)
 * a přesným spodním ukotvením jako v CSS.
 */
export function getHudTextMask(appConfig, screenWidth, screenHeight, hoveredId) {
  if (typeof document === 'undefined') return null;

  const bl = appConfig?.ui2d?.bottomLeft || {};
  if (appConfig?.ui2d?.enabled === false || bl.enabled === false) {
    return null;
  }

  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  const items = bl.items || [];
  const header = bl.header ? bl.header.toUpperCase() : '';
  const baseFontSize = bl.fontSize ?? 13;
  const fontSize = baseFontSize * dpr;
  const fontWeight = bl.fontWeight ?? 700; // Výchozí Bold
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

  // Pevná velikost oblasti (dostatečná pro libovolné rozestupy řádků bez dynamického měnění bufferu)
  const boxW = Math.max(360, (bl.boxWidth ?? 380));
  const boxH = 500;
  const canvasW = Math.floor(boxW * dpr);
  const canvasH = Math.floor(boxH * dpr);

  // Inicializace canvasu a textury s pevnou alokací paměti
  if (!maskCanvas || allocatedW !== canvasW || allocatedH !== canvasH) {
    if (maskTexture) {
      maskTexture.dispose();
    }
    maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvasW;
    maskCanvas.height = canvasH;
    allocatedW = canvasW;
    allocatedH = canvasH;

    maskTexture = new THREE.CanvasTexture(maskCanvas);
    maskTexture.minFilter = THREE.LinearFilter;
    maskTexture.magFilter = THREE.LinearFilter;
    maskTexture.generateMipmaps = false;
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

  const currentKey = `${screenWidth}|${screenHeight}|${hoveredId}|${fontSize}|${fontWeight}|${fontStroke}|${fontFam}|${letterSpacing}|${lineSpacing}|${header}|${JSON.stringify(items)}|${bl.pillButton?.enabled}|${bl.pillButton?.text}`;
  if (currentKey === lastKey) {
    return { texture: maskTexture, bounds };
  }
  lastKey = currentKey;

  const ctx = maskCanvas.getContext('2d');
  // Čisté vymazání celého bufferu bez zbytků starých snímků
  ctx.clearRect(0, 0, canvasW, canvasH);

  // V Three.js CanvasTexture má flipY = true (default):
  // Canvas Y = canvasH odpovídá vUv.y = minV (spodní okraj na obrazovce, posY = 36px)
  // Canvas Y = 0 odpovídá vUv.y = maxV (horní okraj na obrazovce, posY + boxH)
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';

  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${letterSpacing * dpr}px`;
  }
  ctx.textRendering = 'geometricPrecision';

  const startX = 4 * dpr;

  // Ukotvení odspodu nahoru (přesně jako v CSS s bottom: 36px)
  // Začínáme od spodního okraje canvasu (který leží přesně na posY = 36px)
  let cursorY = canvasH - 4 * dpr;

  // 1. Spodní pilulkové tlačítko (ASK ME ANYTHING...)
  const pillEnabled = bl.pillButton?.enabled !== false;
  if (pillEnabled) {
    const pillText = (bl.pillButton?.text || 'ASK ME ANYTHING...').toUpperCase();
    const pillFontSize = fontSize * 0.88;
    const pillH = 34 * dpr;
    const pillW = Math.min(canvasW - startX * 2, 230 * dpr);
    const radius = pillH * 0.5;

    cursorY -= pillH;
    const pillY = cursorY;

    // Zaoblený rámeček tlačítka
    ctx.beginPath();
    ctx.roundRect(startX, pillY, pillW, pillH, radius);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Text tlačítka
    ctx.font = `700 ${pillFontSize}px ${fontFam}`;
    ctx.globalAlpha = 0.95;
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = `${(letterSpacing * 1.1) * dpr}px`;
    }
    const textMetric = ctx.measureText(pillText);
    const textX = startX + Math.max(14 * dpr, (pillW - textMetric.width) * 0.5);
    const textY = pillY + (pillH - pillFontSize) * 0.5 - 1 * dpr;
    renderCanvasText(ctx, pillText, textX, textY, fontStroke * 0.8);

    // Mezera nad tlačítkem (margin-top v CSS)
    cursorY -= 18 * dpr;
  }

  // 2. Seznam položek (odspodu nahoru: poslední položka leží dole, první nahoře)
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${letterSpacing * dpr}px`;
  }

  for (let idx = items.length - 1; idx >= 0; idx--) {
    const item = items[idx];
    const itemId = item.id || `item-${idx}`;
    const isHovered = itemId === hoveredId;
    const bullet = (item.bullet !== undefined && item.bullet !== '') ? item.bullet : defaultBullet;
    const itemText = (item.text || '').toUpperCase();
    const fullText = bullet ? `${bullet}  ${itemText}` : itemText;

    cursorY -= fontSize;
    const itemY = cursorY;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFam}`;

    if (isHovered) {
      ctx.globalAlpha = 1.0;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10 * dpr;
      renderCanvasText(ctx, fullText, startX, itemY, fontStroke + 0.5 * dpr);
      ctx.shadowBlur = 0;
    } else if (item.dimmed) {
      ctx.globalAlpha = 0.38;
      renderCanvasText(ctx, fullText, startX, itemY, fontStroke);
    } else {
      ctx.globalAlpha = 1.0;
      renderCanvasText(ctx, fullText, startX, itemY, fontStroke);
    }

    // Mezera mezi řádky (lineSpacing se aplikuje mezi položky)
    if (idx > 0) {
      cursorY -= lineSpacing;
    }
  }

  // 3. Nadpis menu (např. WHAT ARE YOU LOOKING FOR?) - leží nahoře nad první položkou
  if (header) {
    cursorY -= 14 * dpr; // Mezera pod nadpisem
    cursorY -= fontSize * 0.95;
    const headerY = cursorY;

    ctx.font = `700 ${fontSize * 0.95}px ${fontFam}`;
    ctx.globalAlpha = 0.88;
    renderCanvasText(ctx, header, startX, headerY, fontStroke * 0.8);
  }

  maskTexture.needsUpdate = true;
  return { texture: maskTexture, bounds };
}
