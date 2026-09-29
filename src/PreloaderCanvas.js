// 2D line animation for the Preloader: a double helix drawing itself left → right
// with the load progress, field lines parting around it, ruler + counter.
// At 100 % both strands zip into one glowing line. Pure Canvas 2D, no WebGL.

const MONO = '"JetBrains Mono", "SF Mono", "Roboto Mono", Consolas, monospace';
const TAU = Math.PI * 2;

const smooth = (e0, e1, x) => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

export function startPreloaderCanvas(canvas, progressRef) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, raf = 0;
  let shown = 0;   // smoothed progress 0..1
  let doneAt = -1; // seconds when 100 % was reached
  const t0 = performance.now();

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const t = (now - t0) / 1000;
    shown += (progressRef.current / 100 - shown) * 0.12;
    if (progressRef.current >= 100 && shown > 0.995) {
      shown = 1;
      if (doneAt < 0) doneAt = t;
    }
    const zip = doneAt < 0 ? 0 : smooth(0, 0.55, t - doneAt); // strands merge
    const intro = smooth(0, 0.9, t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const narrow = W < 700;
    const cx = W / 2, cy = H / 2;
    const L = Math.min(W * (narrow ? 0.82 : 0.56), 880);
    const x0 = cx - L / 2, x1 = cx + L / 2;
    const headX = x0 + L * shown;
    const A0 = Math.min(H * 0.07, L * 0.07, 54);
    const A = A0 * (1 - zip);
    const freq = TAU / Math.max(140, L / 5.2);
    const speed = 1.6;

    // ---- background field lines, parting around the drawn helix ----
    const gap = Math.max(11, H / 64);
    const lens = (A0 + 26) * intro;
    const lensEnd = headX + 60;
    ctx.lineWidth = 1;
    for (let yi = gap / 2; yi < H; yi += gap) {
      const dy = yi - cy;
      const ady = Math.abs(dy);
      const a = (0.035 + 0.1 * Math.exp(-ady / 220)) * intro;
      if (a < 0.004) continue;
      const sgn = dy < 0 ? -1 : 1;
      const fall = Math.exp(-ady / (lens * 1.6 + 1));
      ctx.strokeStyle = `rgba(150, 225, 255, ${a})`;
      ctx.beginPath();
      for (let x = 0; x <= W + 8; x += 8) {
        const win = smooth(x0 - 140, x0 + 40, x) * (1 - smooth(lensEnd - 40, lensEnd + 140, x));
        const wave = Math.sin(x * 0.006 - t * 0.7 + yi * 0.02) * 2.2;
        const y = yi + sgn * lens * win * fall * (1 - zip * 0.6) + wave * (0.3 + win);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ---- dotted target path of the unrevealed part ----
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = `rgba(190, 240, 255, ${0.22 * intro})`;
    ctx.beginPath();
    ctx.moveTo(Math.min(headX + 10, x1), cy);
    ctx.lineTo(x1, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // ---- helix ----
    const env = (x) => smooth(x0, x0 + 50, x) * (0.25 + 0.75 * smooth(headX, headX - 70, x));
    const strandY = (x, off) => {
      const ph = (x - x0) * freq - t * speed + off;
      return [cy + A * env(x) * Math.sin(ph), Math.cos(ph)];
    };

    // rungs (base pairs) grow in behind the head
    const rungStep = Math.max(12, L / 60);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1;
    for (let x = x0 + rungStep; x < headX - 4; x += rungStep) {
      const [ya] = strandY(x, 0);
      const [yb] = strandY(x, Math.PI);
      const pop = smooth(0, 90, headX - x);
      const mid = (ya + yb) / 2;
      const h = ((yb - ya) / 2) * pop;
      ctx.strokeStyle = `rgba(160, 230, 255, ${0.28 * pop * (1 - zip)})`;
      ctx.beginPath();
      ctx.moveTo(x, mid - h);
      ctx.lineTo(x, mid + h);
      ctx.stroke();
    }

    // two strands; depth (cos) drives brightness + width
    const step = 3;
    for (const off of [0, Math.PI]) {
      let [py] = strandY(x0, off);
      for (let x = x0 + step; x <= headX; x += step) {
        const [y, z] = strandY(x, off);
        const front = (z + 1) / 2;
        const a = (0.25 + 0.75 * front) * intro;
        ctx.strokeStyle = `rgba(${200 + 55 * zip}, 248, 255, ${a + (1 - a) * zip})`;
        ctx.lineWidth = 0.8 + 1.4 * front + zip;
        ctx.beginPath();
        ctx.moveTo(x - step, py);
        ctx.lineTo(x, y);
        ctx.stroke();
        py = y;
      }
    }

    // scan line + glowing heads
    if (shown > 0.002 && zip < 1) {
      const reach = A0 + 70;
      const scanA = 0.18 * (1 - zip) * intro;
      const grad = ctx.createLinearGradient(0, cy - reach, 0, cy + reach);
      grad.addColorStop(0, 'rgba(0, 240, 255, 0)');
      grad.addColorStop(0.5, `rgba(0, 240, 255, ${scanA})`);
      grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(headX, cy - reach);
      ctx.lineTo(headX, cy + reach);
      ctx.stroke();

      ctx.shadowColor = 'rgba(0, 240, 255, 0.9)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(220, 252, 255, ${1 - zip})`;
      for (const off of [0, Math.PI]) {
        const [y, z] = strandY(headX, off);
        ctx.beginPath();
        ctx.arc(headX, y, 1.6 + 0.6 * (z + 1), 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    // completion flash along the merged line
    if (zip > 0) {
      const f = Math.sin(zip * Math.PI);
      ctx.shadowColor = 'rgba(0, 240, 255, 1)';
      ctx.shadowBlur = 18 * f;
      ctx.strokeStyle = `rgba(230, 253, 255, ${0.5 * f})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, cy);
      ctx.lineTo(x1, cy);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ---- ruler + counter ----
    const ry = cy + A0 + 46;
    const ticks = 50;
    ctx.lineWidth = 1;
    for (let i = 0; i <= ticks; i++) {
      const x = x0 + (L * i) / ticks;
      const major = i % 10 === 0;
      const lit = x <= headX + 0.5;
      const a = lit ? (major ? 0.8 : 0.45) : (major ? 0.25 : 0.1);
      ctx.strokeStyle = `rgba(190, 245, 255, ${a * intro})`;
      ctx.beginPath();
      ctx.moveTo(x, ry);
      ctx.lineTo(x, ry + (major ? 9 : 4));
      ctx.stroke();
    }

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(225, 250, 255, ${0.95 * intro})`;
    ctx.font = `300 ${narrow ? 30 : 40}px ${MONO}`;
    ctx.fillText(String(Math.round(shown * 100)).padStart(3, '0'), x0 - 2, ry + 22);

    ctx.textAlign = 'right';
    ctx.font = `400 10px ${MONO}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.3em';
    ctx.fillStyle = `rgba(0, 229, 255, ${0.55 * intro})`;
    ctx.fillText(zip > 0 ? 'READY' : 'INITIALIZING SCENE', x1, ry + 24);
    ctx.fillStyle = `rgba(190, 240, 255, ${0.28 * intro})`;
    const seq = (Math.floor(t * 37) % 4096).toString(16).padStart(3, '0').toUpperCase();
    ctx.fillText(`SEQ ${seq}`, x1, ry + 42);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
