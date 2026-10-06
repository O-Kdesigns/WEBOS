/* <kinetic-logo> — live, vector (DOM) logo animation. No dependencies.
   Usage:
     <kinetic-logo text="OLIVER" font="Unbounded" weight="700"
                   energy="lively" hover="magnet" rare="0.12" interval="2.2"
                   style="--kl-color:#f2f2f2; --kl-accent:#C4FF00; height:320px"></kinetic-logo>
   Attributes: text, font, weight, tracking (letter spacing in em), energy (calm|lively|wild),
               hover-mix ("magnet:.5 lens:.3 glow:1" = mouse reactions mixed together, each with its own
               strength 0–2; reactions: magnet repel lens tilt ripple flick glitch glow float),
               hover + hover-strength (older single reaction, used only when hover-mix is absent),
               hover-text (second name the logo glitches into while hovered — always on when set,
               on top of the mouse reaction), morph-time (s, default .75),
               o-blink (mean seconds between O ↔ Ø blinks; absent = off),
               force-hover (debug: behaves as if the pointer were on the logo),
               anchor (where the text sits in its box: top-left top top-right left center right
               bottom-left bottom bottom-right; default center), offset ("x y" em from that spot for
               the name, + = right/down), hover-offset ("x y" em for the hover name; default = offset),
               show-zone (draws the hover/click hit zone around the text — for tuning only),
               rare (0–1 chance of a rare animation), interval (seconds between animations),
               rare-set ("orbit shatter …" = which animations count as rare), off ("drop decode" = never auto-play),
               hover-rare-set / hover-off (the same two lists used while the pointer is in the hit zone;
               absent = same as rare-set / off),
               click ("off" disables click-to-play-rare), paused.
   JS: el.play('orbit'), el.next(), KineticLogo.animations; event "kl-anim" {detail:{id, rare}}. */
(() => {
'use strict';
if (customElements.get('kinetic-logo')) return;

// Google variable fonts the component can load by itself: [css2 spec, min wght, max wght]
const FONTS = {
  'Unbounded': ['Unbounded:wght@200..900', 200, 900],
  'Inter Tight': ['Inter+Tight:wght@100..900', 100, 900],
  'Space Grotesk': ['Space+Grotesk:wght@300..700', 300, 700],
  'Big Shoulders Display': ['Big+Shoulders+Display:wght@100..900', 100, 900],
  'Bodoni Moda': ['Bodoni+Moda:wght@400..900', 400, 900],
  'JetBrains Mono': ['JetBrains+Mono:wght@100..800', 100, 800],
};
function loadFont(f) {
  const spec = FONTS[f]; if (!spec) return;
  const id = 'kl-font-' + f.replace(/\W/g, '');
  if (document.getElementById(id)) return;
  const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${spec[0]}&display=swap`;
  document.head.appendChild(l);
}

/* ---------- math ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const outC = t => 1 - Math.pow(1 - t, 3), inC = t => t * t * t;
const outBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const elastic = t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * TAU / 3) + 1;
const bounce = t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
const bump = t => Math.sin(Math.PI * clamp(t, 0, 1));
const stag = (p, i, n, s) => clamp(p * (1 + s) - (n > 1 ? i / (n - 1) : 0) * s, 0, 1);
// hash a seed first when neighbouring seeds (i, i+1 …) must give unrelated numbers — xorshift's first outputs follow the seed
const hs = x => { x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return x ^ (x >>> 16); };
function rng(seed) { let s = (seed | 0) || 0x9e3779b9; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const GLY = 'ABCDEFGHJKLMNOPRSTUVXYZ0123456789#%&*+/<>=?@$';
const glyphAt = r => GLY[Math.floor(r * GLY.length) % GLY.length];


/* ---------- character-aware helpers: Ø and dash animations work from wherever those glyphs sit ---------- */
const isO = ch => ch === 'Ø' || ch === 'ø';
const isDash = ch => /^[-‐‒–—―−]$/.test(ch);
const REACTIONS = ['magnet', 'repel', 'lens', 'tilt', 'ripple', 'flick', 'glitch', 'glow', 'float'];   // see _hoverL
const COMBINE = { magnet: .7, lens: .75, tilt: .6 };   // old hover="combine" = this mix
const ZONE_IN = .3, ZONE_STAY = .55;   // hit-zone padding around the text in em (see _hitAt)
const O_SWAP ={ O: 'Ø', 'Ø': 'O', o: 'ø', 'ø': 'o' };   // o-blink: each O flickers to its opposite
const NEEDS = { 'Ø': isO, '—': isDash };
const nearest = (c, i, set) => { let b = set[0]; for (const o of set) if (Math.abs(c.hx[i] - c.hx[o]) < Math.abs(c.hx[i] - c.hx[b])) b = o; return b; };
// target offsets that put [right part, dash, left part] in place of [left, dash, right], keeping the real gaps
function swapTargets(c, n) {
  const d = c.dI[0], gap = i => (i < 0 || i >= n - 1) ? 0 : c.hx[i + 1] - c.hx[i] - (c.w[i] + c.w[i + 1]) / 2;
  const order = []; for (let i = d + 1; i < n; i++) order.push(i); order.push(d); for (let i = 0; i < d; i++) order.push(i);
  const tx = new Array(n); let x = c.hx[0] - c.w[0] / 2;
  order.forEach((i, k) => {
    tx[i] = x + c.w[i] / 2 - c.hx[i];
    const nx = order[k + 1]; if (nx === undefined) return;
    // inside a part keep its own gap; around the dash reuse the gaps the dash originally had
    const g = nx === i + 1 ? gap(i) : nx === d ? gap(d) : gap(d - 1);
    x += c.w[i] + g;
  });
  return tx;
}

/* ======================================================================================
   ANIMATIONS — catalogue. Every entry is documented with the same fields so it can be
   re-tuned without re-reading the maths:
     WHAT   – what the viewer sees
     WHO    – which letters move (all / the Ø / the dash / letters near X …)
     TIME   – phases over progress p (0 → 1); real length = dur × energy.d (calm 1.25, wild .85)
     REACH  – how the effect spreads along the name (stagger / distance falloff / whole word)
     KNOBS  – the numbers to change, and what each does
   ---------------------------------------------------------------------------------------
   Conventions
   • fn(L, i, n, p, c) is called every frame for every visible (non-space) letter:
       L  letter state to ADD onto (it is reset each frame): x y z (em), rx ry rz skx (deg),
          s sx sy (scale ×), o (opacity ×), blur (em), w (font weight), glow / acc (0–1 accent),
          g / go (glitch ghost offset / on), clipT / clipB (em hidden above / below = invisible line),
          show (character actually displayed)
       i  index among visible letters (0 … n-1), p progress 0–1
       c  run context, fixed for one play: c.I intensity (energy), c.hx[i] letter centre x in em
          from the word centre, c.w[i] letter width em, c.r[i] three randoms −1…1, c.pick random
          index, c.oI / c.dI indices of Ø / dash letters, c.R ring radius, c.maxD max distance
          to nearest Ø, c.wFar / c.wMax weights, c.seed
   • Units are em → identical at every size. Keep vertical moves ≲ ±0.5 em so nothing leaves a
     tight banner (host height can be only 2 em); hide things behind invisible lines (clipT/B)
     instead of moving them off-screen.
   • REACH tools:
       stag(p, i, n, s) – left→right cascade; s = how spread out it is (0 = all at once,
                          1.4 = first letter is done before the last starts). Index-based, so it
                          always covers the WHOLE name regardless of length.
       Math.exp(-dist * k) – distance falloff from a source letter (Ø, dash, cursor). Smaller k =
                          reaches further along the name (k .18 ≈ half strength at 3.9 em away).
       t0 + dist * v    – arrival delay of a travelling wave; smaller v = faster wave.
   ====================================================================================== */
const ANIMS = [
  /* ---------------------------------- NORMAL ---------------------------------- */

  /* wave — letters hop up one after another, alternate ones tilt left/right.
     WHO all · TIME one hop per letter, cascading left→right
     REACH stag spread 1.4 (whole name, strongly cascaded)
     KNOBS .24 hop height em · 4 tilt deg · 1.4 cascade spread */
  { id: 'wave', dur: 1.6, fn(L, i, n, p, c) { const b = bump(stag(p, i, n, 1.4)); L.y -= .24 * b * c.I; L.rz += (i % 2 ? 4 : -4) * b * c.I; } },

  /* weight — font weight swells to the opposite extreme and back (needs a variable font).
     WHO all · TIME one swell per letter, cascading · REACH stag 1.2
     KNOBS c.wFar = heaviest if base is light, lightest if base is heavy · 1.2 cascade spread */
  { id: 'weight', dur: 2.4, variable: 1, fn(L, i, n, p, c) { L.w = lerp(L.w, c.wFar, bump(stag(p, i, n, 1.2))); } },

  /* flip — every letter does a full forward somersault (around X).
     WHO all · REACH stag .9 · KNOBS 360 deg (720 = double flip) · .9 cascade spread */
  { id: 'flip', dur: 1.7, fn(L, i, n, p) { L.rx -= 360 * inOut(stag(p, i, n, .9)); } },

  /* spin — every letter turns 360° around its vertical axis (like a revolving door).
     WHO all · REACH stag .7 · KNOBS 360 deg · .7 cascade spread */
  { id: 'spin', dur: 1.9, fn(L, i, n, p) { L.ry += 360 * inOut(stag(p, i, n, .7)); } },

  /* scatter — letters burst to random nearby spots, hang, then spring home elastically.
     WHO all, simultaneously · TIME 0–.28 burst out · .28–.42 hold · .42–1 elastic return
     REACH no cascade — every letter at once, direction random (c.r)
     KNOBS .8 / .38 max x / y offset em · 80 max rotation deg · .2 shrink while out */
  { id: 'scatter', dur: 2.6, fn(L, i, n, p, c) {
      const r = c.r[i], a = p < .28 ? outC(p / .28) : p < .42 ? 1 : 1 - elastic((p - .42) / .58);
      L.x += r[0] * .8 * a * c.I; L.y += r[1] * .38 * a * c.I; L.rz += r[2] * 80 * a; L.s *= 1 - .2 * a; } },

  /* breathe — the word inhales: letters spread away from the word centre, then close again.
     WHO all · REACH linear with distance from the centre index (outer letters move most)
     KNOBS .26 extra spacing per letter step em */
  { id: 'breathe', dur: 2.2, fn(L, i, n, p, c) { L.x += (i - (n - 1) / 2) * .26 * bump(inOut(p)) * c.I; } },

  /* decode — letters flicker through random glyphs (#%&A3…) and resolve back to the name.
     WHO all · REACH stag 1.6 (resolves left→right) · KNOBS 22 glyph changes/s · .85 chance of a
     random glyph each tick · .55 opacity while scrambling */
  { id: 'decode', dur: 1.5, fn(L, i, n, p, c) {
      const q = stag(p, i, n, 1.6);
      if (q > 0 && q < 1) { const r = rng(c.seed + i * 977 + Math.floor(p * c.dur * 22))(); if (r < .85) L.show = glyphAt(r / .85); L.o *= .55 + .45 * q; } } },

  /* drop — each letter falls through an invisible floor at its own baseline, then drops back in
     through an invisible ceiling and bounces to rest. Never leaves its own 1 em box.
     WHO all · TIME per letter: 0–.4 fall out (clipB) · .4–1 fall in + bounce (clipT)
     REACH stag .7 · KNOBS 1.05 depth em (≥1 = fully hidden) · .4 split between out / in */
  { id: 'drop', dur: 1.9, fn(L, i, n, p) {
      const q = stag(p, i, n, .7);
      if (q < .4) { const d = inC(q / .4) * 1.05; L.y += d; L.clipB = d; }
      else { const d = (1 - bounce((q - .4) / .6)) * 1.05; L.y -= d; L.clipT = d; } } },

  /* tuck — a ripple: each letter ducks halfway behind its baseline and pops back with overshoot.
     WHO all · REACH stag 1.3 · KNOBS .75 duck depth em (1.05 = disappears fully) */
  { id: 'tuck', dur: 1.7, fn(L, i, n, p) {
      const q = stag(p, i, n, 1.3), d = q < .45 ? inOut(q / .45) * .75 : .75 * (1 - outBack((q - .45) / .55));
      L.y += d; L.clipB = Math.max(0, d); } },

  /* skew — an italic gust sweeps across: letters lean back and nudge right.
     WHO all · REACH stag .6 · KNOBS 24 lean deg · .06 nudge em */
  { id: 'skew', dur: 1.3, fn(L, i, n, p, c) { const b = bump(stag(p, i, n, .6)); L.skx -= 24 * b * c.I; L.x += .06 * b; } },

  /* focus — a defocus pass: letters blur, fade and swell slightly, then snap sharp.
     WHO all · REACH stag 1 · KNOBS .07 blur em · .65 fade · .12 swell */
  { id: 'focus', dur: 1.8, fn(L, i, n, p) { const b = bump(stag(p, i, n, 1)); L.blur += .07 * b; L.o *= 1 - .65 * b; L.s *= 1 + .12 * b; } },

  /* squash — rubber letters: stretch tall & thin and spring back, cascading.
     WHO all · REACH stag 1 · KNOBS .4 extra height · .18 thinning · .08 lift em */
  { id: 'squash', dur: 1.3, fn(L, i, n, p, c) { const b = bump(stag(p, i, n, 1)); L.sy *= 1 + .4 * b * c.I; L.sx *= 1 - .18 * b * c.I; L.y -= .08 * b; } },

  /* ----------------------------------- RARE ----------------------------------- */

  /* glitch — digital breakdown: random letters jitter, skew, split into red/cyan ghosts and
     briefly swap to random glyphs; settles in the last 15 %.
     WHO random letters each tick (16 ticks/s) · REACH whole name, random, no cascade
     KNOBS .6 chance a letter glitches per tick · .16 jitter em · 36 skew deg · .09 ghost split em ·
     .12 chance of a wrong glyph */
  { id: 'glitch', rare: 1, dur: 1.4, fn(L, i, n, p, c) {
      const env = 1 - sm(.85, 1, p), R = rng(c.seed + i * 131 + Math.floor(p * c.dur * 16));
      if (R() < .6 * env) { L.x += (R() - .5) * .16 * c.I; L.skx += (R() - .5) * 36; L.g = (R() - .5) * .09; L.go = 1; L.sy *= 1 + (R() - .5) * .25; if (R() < .12) L.show = glyphAt(R()); } } },

  /* orbit — the word lifts into a 3D ring seen slightly from above, makes one full turn, lands.
     WHO all, evenly spaced around the ring · TIME 0–.2 form ring · .1–.9 one turn · .8–1 land
     REACH whole word at once · KNOBS c.R ring radius (set in _ctx: W/τ × 1.7) · .16 ellipse
     flattening (y of the back half) · 14 ring tilt deg · .32 back-half dimming */
  { id: 'orbit', rare: 1, dur: 4.2, fn(L, i, n, p, c) {
      const m = inOut(sm(0, .2, p)) * (1 - inOut(sm(.8, 1, p)));
      const a = ((i - (n - 1) / 2) / n) * TAU + TAU * inOut(sm(.1, .9, p));
      const ca = Math.cos(a);
      L.x += (Math.sin(a) * c.R - c.hx[i]) * m; L.z += (ca - 1) * c.R * m; L.y += (1 - ca) * c.R * .16 * m;
      L.ry += a * 57.2958 * m; L.rx -= 14 * m; L.o *= 1 - (1 - ca) * .32 * m; L.s *= 1 - (1 - ca) * .12 * m; } },

  /* sink — the whole word sinks behind an invisible floor letter by letter, stays gone a beat,
     then rises with an overshoot. WHO all · TIME per letter .38 down · .14 hidden · .48 up
     REACH letter i starts i/(n-1) × .22 later (whole name) · KNOBS .22 cascade · 1.05 depth em ·
     10 wobble deg while sinking */
  { id: 'sink', rare: 1, dur: 3.4, fn(L, i, n, p, c) {
      const q = clamp((p - (n > 1 ? i / (n - 1) : 0) * .22) / .78, 0, 1);
      const d = q < .38 ? inC(q / .38) * 1.05 : q < .52 ? 1.05 : 1.05 * (1 - outBack((q - .52) / .48));
      L.y += d; L.clipB = Math.max(0, d); L.rz += c.r[i][2] * 10 * Math.min(1, Math.max(0, d)); } },

  /* blackhole — letters spiral into the word centre, shrinking and spinning, then spiral back out.
     WHO all · TIME 0–.45 in · .55–1 out · REACH distance from centre (outer letters travel most)
     KNOBS 1.1 spiral turns · .18 vertical squash of the spiral (keep small for banners) ·
     .94 shrink · 600 spin deg */
  { id: 'blackhole', rare: 1, dur: 3.2, fn(L, i, n, p, c) {
      const k = inOut(sm(0, .45, p)) * (1 - outC(sm(.55, 1, p))), th = k * TAU * 1.1, hx = c.hx[i], rr = hx * (1 - k);
      L.x += rr * Math.cos(th) - hx; L.y += rr * Math.sin(th) * .18; L.s *= 1 - .94 * k; L.rz += 600 * k; L.o *= 1 - .4 * k * k; } },

  /* mirror — the word turns into its mirror image (letters swap sides AND flip around Y), holds,
     turns back. WHO all · REACH tiny stagger .06 · KNOBS .4 bulge toward the viewer em */
  { id: 'mirror', rare: 1, dur: 2.8, fn(L, i, n, p, c) {
      const q = clamp(p + (n > 1 ? i / (n - 1) : 0) * .06 - .03, 0, 1), k = inOut(sm(0, .38, q)) * (1 - inOut(sm(.62, 1, q)));
      L.x -= 2 * c.hx[i] * k; L.ry += 180 * k; L.z += .4 * Math.sin(Math.PI * k); } },

  /* solo — one random letter (c.pick) takes the stage: grows, turns, glows in accent, goes heavy;
     the others dim and soften. WHO c.pick vs. the rest · REACH all others equally
     TIME 0–.22 rise · .12–.88 one turn · .78–1 back; dur 1.6 s (was 2.8 — felt far too long)
     KNOBS dur · .55 grow · 360 turn deg · .7 dimming · .025 blur em of the others */
  { id: 'solo', rare: 1, dur: 1.6, fn(L, i, n, p, c) {
      const b = sm(0, .22, p) * (1 - sm(.78, 1, p));
      if (i === c.pick) { L.s *= 1 + .55 * b; L.ry += 360 * inOut(sm(.12, .88, p)); L.glow = Math.max(L.glow, b); L.acc = Math.max(L.acc, b); L.z += .3 * b; L.w = lerp(L.w, c.wMax, b); }
      else { L.o *= 1 - .7 * b; L.blur += .025 * b; L.s *= 1 - .06 * b; } } },

  /* ignite — letters switch on like neon tubes: flicker, then glow in accent, then cool down.
     WHO all · REACH stag 1.1 · KNOBS .35 flicker phase length · 14 flickers/s · .5 on/off chance */
  { id: 'ignite', rare: 1, dur: 2.4, fn(L, i, n, p, c) {
      const q = stag(p, i, n, 1.1), R = rng(c.seed + i * 31 + Math.floor(p * c.dur * 14));
      const fl = q > 0 && q < .35 ? (R() < .5 ? 0 : 1) : 1, b = sm(0, .15, q) * (1 - sm(.75, 1, q)) * fl;
      L.glow = Math.max(L.glow, b); L.acc = Math.max(L.acc, b); if (q > 0 && q < .35) L.o *= .35 + .65 * fl; } },

  /* shatter — letters dissolve into ~34 dots each (30 % accent), the dots drift apart, then fly
     back and re-form the letters. Dots follow the hover mode (see _updDots).
     WHO all · TIME .04–.14 letters fade · .1–.48 explode · .56–.86 re-form · .8–.94 letters back
     KNOBS in _buildDots: 34 dots/letter · dist .5–2.3 em · vertical ×.22 clamped ±.42 em */
  { id: 'shatter', rare: 1, dur: 3.4,
    start(c, K) { K._buildDots(c); }, end(c, K) { K._clearDots(); },
    fn(L, i, n, p) { L.o *= clamp(1 - sm(.04, .14, p) + sm(.8, .94, p), 0, 1); },
    all(p, c, K) { K._updDots(p, c); } },

  /* ------------------ Ø — radiate from the slashed O, wherever it is ------------------ */

  /* dial — every Ø turns 180° twice like a dial clicking and flashes accent; each click sends a
     shockwave through the name that pushes letters away from the nearest Ø.
     WHO Ø: rotates · others: pushed outward (away from their nearest Ø)
     TIME clicks at p .0–.42 and .5–.92; waves leave at t0 = .2 and .7
     REACH falloff exp(-dist × .18) (≈ half strength 3.9 em away); wave delay dist × .035
     KNOBS .18 falloff (lower = reaches the far end of long names) · .035 wave speed (lower =
     faster) · .16 push em · .1 lift em · 9 tilt deg */
  { id: 'dial', needs: 'Ø', dur: 2.6, fn(L, i, n, p, c) {
      if (c.oI.includes(i)) {
        const a1 = sm(0, .42, p), a2 = sm(.5, .92, p), pulse = Math.max(bump(a1), bump(a2));
        L.rz += 180 * inOut(a1) + 180 * inOut(a2); L.s *= 1 + .14 * pulse; L.glow = Math.max(L.glow, pulse * .8); L.acc = Math.max(L.acc, pulse * .7); return;
      }
      const o = nearest(c, i, c.oI), dx = c.hx[i] - c.hx[o], dist = Math.abs(dx), sg = Math.sign(dx) || 1, fall = Math.exp(-dist * .18);
      for (const t0 of [.2, .7]) { const b = bump((p - t0 - dist * .035) / .2) * fall * c.I; L.x += sg * .16 * b; L.y -= .1 * b; L.rz += sg * 9 * b; L.s *= 1 + .08 * b; } } },

  /* portal — the Ø opens (grows, spins, glows) and swallows the other letters, nearest first;
     then spits them back out in reverse order with an overshoot. With two Ø each letter goes
     into the closer one. WHO Ø: the portal · others: travel into it and back
     TIME suck-in starts .06 + rank × .28 (rank = distance / farthest distance), lasts .18;
     spit-out starts .56 + (1−rank) × .2, lasts .22
     REACH whole name — rank is normalised by c.maxD, so the farthest letter is always reached
     KNOBS .28 / .2 how spread the in / out order is · .92 shrink · 300 spin deg · .5 depth em */
  { id: 'portal', needs: 'Ø', rare: 1, dur: 3.6, fn(L, i, n, p, c) {
      const open = sm(0, .12, p) * (1 - sm(.88, 1, p));
      if (c.oI.includes(i)) { L.s *= 1 + .3 * open; L.rz -= 540 * inOut(p); L.glow = Math.max(L.glow, open * .9); L.acc = Math.max(L.acc, open); L.z += .25 * open; return; }
      const o = nearest(c, i, c.oI), dx = c.hx[o] - c.hx[i], rank = Math.abs(dx) / c.maxD;
      const tin = .06 + rank * .28, tout = .56 + (1 - rank) * .2;
      const k = inOut(clamp((p - tin) / .18, 0, 1)) * (1 - outBack(clamp((p - tout) / .22, 0, 1))), kk = clamp(k, 0, 1);
      L.x += dx * k; L.s *= 1 - .92 * kk; L.rz += (dx > 0 ? 1 : -1) * 300 * k; L.z -= .5 * kk; L.o *= 1 - .6 * kk * kk; } },

  /* magnify — the first Ø lifts off and rolls along the word like a lens (rotation matches the
     distance, so it really rolls): to the farther end first, then the other end, then home.
     Letters under it grow and go heavy. WHO first Ø: the lens · others: magnified as it passes
     TIME 0–.32 to far end · .32–.72 to near end · .72–1 home
     REACH the lens visits every letter; magnification width exp(-d² / .3) (≈ ±0.5 em)
     KNOBS .3 lens width (bigger = wider lens) · .5 magnification · 140 roll deg per em ·
     .55 lift toward viewer em */
  { id: 'magnify', needs: 'Ø', rare: 1, dur: 3.8, fn(L, i, n, p, c) {
      const o = c.oI[0], xa = c.hx[o], lo = c.hx[0] - .1, hi = c.hx[n - 1] + .1;
      const far = hi - xa > xa - lo ? hi : lo, near = far === hi ? lo : hi;
      const xs = p < .32 ? lerp(xa, far, inOut(p / .32)) : p < .72 ? lerp(far, near, inOut((p - .32) / .4)) : lerp(near, xa, inOut((p - .72) / .28));
      const lift = sm(0, .08, p) * (1 - sm(.92, 1, p));
      if (i === o) { L.x += xs - xa; L.z += .55 * lift; L.s *= 1 + .2 * lift; L.y -= .04 * lift; L.rz += (xs - xa) * 140; L.glow = Math.max(L.glow, .5 * lift); L.acc = Math.max(L.acc, .6 * lift); return; }
      const f = Math.exp(-((c.hx[i] - xs) ** 2) / .3) * lift;
      L.s *= 1 + .5 * f; L.w = lerp(L.w, c.wMax, f); L.y -= .06 * f; } },

  /* ------------------ dash — the name splits around the (first) dash ------------------ */

  /* stretch — the two halves pull apart and the dash stretches like rubber to bridge the gap,
     then everything snaps back elastically. Dash at the very start/end: only one side moves and
     the dash stretches only toward it. WHO dash: stretches · left part: moves left · right: right
     TIME .0–.38 pull · .38–.5 hold · .5–1 elastic snap · REACH every letter of a side moves the
     same distance; each step away from the dash lags .02 (whip effect)
     KNOBS .55 pull distance em · .02 lag per letter (bigger = more whip) · 12 lean deg */
  { id: 'stretch', needs: '—', dur: 2.4, fn(L, i, n, p, c) {
      const d = c.dI[0], amt = q => (q < .38 ? outC(clamp(q / .38, 0, 1)) : q < .5 ? 1 : 1 - elastic(clamp((q - .5) / .5, 0, 1))) * .55 * c.I;
      const left = d > 0 ? 1 : 0, right = d < n - 1 ? 1 : 0;
      if (i === d) { const A = amt(p); L.sx *= Math.max(.2, 1 + A * (left + right) / Math.max(c.w[d], .15)); L.x += A * (right - left) / 2; L.acc = Math.max(L.acc, Math.min(1, A * 2)); return; }
      const A = amt(p - Math.abs(i - d) * .02), sg = i < d ? -1 : 1;
      L.x += sg * A; L.rz -= sg * 12 * A; } },

  /* swap — the parts left and right of the dash trade places (left arcs over, right arcs under,
     dash spins 180° and glows), hold, then trade back. OLIVER—KANTOR → KANTOR—OLIVER.
     Target positions come from swapTargets() and keep the real gaps.
     WHO all · TIME .05–.42 swap · hold · .62–.97 swap back · REACH whole parts move as blocks
     KNOBS .42 arc height em · .3 arc depth em */
  { id: 'swap', needs: '—', rare: 1, dur: 3.2, fn(L, i, n, p, c) {
      if (!c.sw) c.sw = swapTargets(c, n);
      const d = c.dI[0], k = inOut(sm(.05, .42, p)) * (1 - inOut(sm(.62, .97, p))), arc = Math.sin(Math.PI * k);
      L.x += c.sw[i] * k;
      if (i === d) { L.rz += 180 * k; L.s *= 1 + .2 * arc; L.glow = Math.max(L.glow, arc * .7); L.acc = Math.max(L.acc, arc); }
      else if (i < d) { L.y -= .42 * arc * c.I; L.z += .3 * arc; }
      else { L.y += .42 * arc * c.I; L.z -= .3 * arc; } } },

  /* underline — the dash slides down and stretches into an underline under the whole name;
     letters bounce on it twice like on a trampoline, the bounce travelling outward from where
     the dash was; then the dash returns. WHO dash: becomes the line · others: bounce
     TIME 0–.22 line forms · bounces at ta and ta + .26 · .8–1 line returns
     REACH bounce arrival ta = .24 + min(.16, dist × .035) — capped so the far end still bounces
     twice before the line leaves (raise the .16 cap only together with dur)
     KNOBS .42 line drop em · .3 bounce height em · .035 wave speed · .18 landing squash */
  { id: 'underline', needs: '—', dur: 2.8, fn(L, i, n, p, c) {
      const d = c.dI[0], x0 = c.hx[0] - c.w[0] / 2, x1 = c.hx[n - 1] + c.w[n - 1] / 2;
      const m = inOut(sm(0, .22, p)) * (1 - inOut(sm(.8, 1, p)));
      if (i === d) { L.x += ((x0 + x1) / 2 - c.hx[d]) * m; L.y += .42 * m; L.sx *= 1 + ((x1 - x0) / Math.max(c.w[d], .15) - 1) * m; L.sy *= 1 - .3 * m; L.acc = Math.max(L.acc, m); return; }
      const dx = c.hx[i] - c.hx[d], ta = .24 + Math.min(.16, Math.abs(dx) * .035);
      for (const t0 of [ta, ta + .26]) {
        const u = (p - t0) / .22;
        if (u > 0 && u < 1) { const b = Math.sin(Math.PI * u); L.y -= .3 * b * c.I; L.rz += (Math.sign(dx) || 1) * 6 * b; }
        else if (u >= 1 && u < 1.25) { const sq = bump((u - 1) / .25); L.sy *= 1 - .18 * sq; L.sx *= 1 + .1 * sq; L.y += .03 * sq; }
      } } },
];
const ENERGY = {
  calm:   { I: .7,  E: .45, iv: 1.6, d: 1.25, rare: .8 },
  lively: { I: 1,   E: 1,   iv: 1,   d: 1,    rare: 1 },
  wild:   { I: 1.35,E: 1.7, iv: .45, d: .85,  rare: 1.6 },
};

/* ---------- glyph sampling for the shatter dots (measurement only, output is DOM) ---------- */
const ptsCache = new Map();
let measCanvas = null;
function glyphPts(ch, font, w) {
  const key = font + '|' + w + '|' + ch; let pts = ptsCache.get(key); if (pts) return pts;
  const N = 200; measCanvas = measCanvas || document.createElement('canvas'); measCanvas.width = measCanvas.height = N;
  const g = measCanvas.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, N, N); g.font = `${w} 140px "${font}", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000';
  g.fillText(ch, N / 2, N / 2);
  const d = g.getImageData(0, 0, N, N).data; pts = [];
  for (let y = 0; y < N; y += 3) for (let x = 0; x < N; x += 3) if (d[(y * N + x) * 4 + 3] > 128) pts.push([(x - N / 2) / 140, (y - N / 2) / 140]);
  if (!pts.length) pts.push([0, 0]);
  ptsCache.set(key, pts); return pts;
}

const CSS = `
:host{display:block;position:relative;aspect-ratio:16/7;overflow:visible;color:var(--kl-color,currentColor);--acc:var(--kl-accent,#C4FF00);
  user-select:none;-webkit-user-select:none;contain:layout;-webkit-tap-highlight-color:transparent}
.stage{position:absolute;inset:0;display:grid;place-items:center;perspective:1200px}
.row{grid-area:1/1;position:relative;display:inline-flex;align-items:center;line-height:1;white-space:pre;perspective:7em;transform-style:preserve-3d}
.row.off{visibility:hidden}
.stage.hot{cursor:pointer}
.zone{display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:1px dashed var(--acc);opacity:.55;border-radius:.12em;pointer-events:none}
:host([show-zone]) .zone{display:block}
.ch{display:inline-block;position:relative;transform-style:preserve-3d;will-change:transform}
.ch+.ch{margin-left:var(--tr,0em)}
.ch::before,.ch::after{content:attr(data-c);position:absolute;inset:0;opacity:var(--go,0);pointer-events:none;mix-blend-mode:screen}
.ch::before{color:#ff2a55;transform:translateX(calc(var(--g,0) * 1em))}
.ch::after{color:#00e5ff;transform:translateX(calc(var(--g,0) * -1em))}
.dots{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}
.dot{position:absolute;left:0;top:0;width:.05em;height:.05em;margin:-.025em;border-radius:50%;background:currentColor;will-change:transform,opacity}
`;
const RM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const f3 = v => (Math.abs(v) < 1e-4 ? 0 : v).toFixed(3), f1 = v => (Math.abs(v) < .01 ? 0 : v).toFixed(1);

class KineticLogo extends HTMLElement {
  static get observedAttributes() { return ['text', 'font', 'weight', 'tracking', 'scale', 'paused', 'hover-text', 'anchor', 'offset', 'hover-offset']; }
  // groups: 'rare-set' = space-separated ids treated as rare (default: built-in), 'off' = ids that never auto-play
  static get reactions() { return REACTIONS.slice(); }
  static get animations() { return ANIMS.map(a => ({ id: a.id, rare: !!a.rare, needs: a.needs || '' })); }

  constructor() {
    super();
    const sh = this.attachShadow({ mode: 'open' });
    // two overlaid rows: A = text, B = hover-text (morph). this.$row / _vis / _hx always point at the active one.
    sh.innerHTML = `<style>${CSS}</style><div class="stage" part="stage"><i class="zone" part="zone"></i><div class="row" part="row"></div><div class="row off" part="row row-alt"></div></div>`;
    this.$stage = sh.querySelector('.stage'); [this.$rowA, this.$rowB] = sh.querySelectorAll('.row'); this.$row = this.$rowA;
    this.$zone = sh.querySelector('.zone');
    this._rows = []; this._m = 0; this._mSeed = 1; this._bkWait = 1.5; this._bkRep = null;
    this._vis = []; this._hx = []; this._t = 0; this._cur = null; this._wait = .8; this._lastId = '';
    this._hv = 0; this._vx = 0; this._mx = 0; this._my = 0; this._tmx = 0; this._tmy = 0; this._in = false;
    this._fs = 100; this._cx = 0; this._cy = 0; this._W = 1; this._H = 1; this._run = false; this._onScreen = true; this._seed = (Math.random() * 1e9) | 0;
    this._frame = this._frame.bind(this);
    // the pointer only counts inside the hit zone around the text (see _hitAt); re-checked every frame in _step,
    // so scrolling, resizing and the morph changing the name length are handled without a pointermove
    this._over = false; this._px = 0; this._py = 0;
    const ptr = e => { this._px = e.clientX; this._py = e.clientY; this._over = true; };
    this.addEventListener('pointerenter', ptr);
    this.addEventListener('pointermove', ptr);
    this.addEventListener('pointerleave', () => { this._over = false; });
    this.addEventListener('click', e => { if (this.getAttribute('click') !== 'off' && this._hitAt(e.clientX, e.clientY, this._in).hit) this.next(true); });
  }
  // ---- config ----
  get text() { return this.getAttribute('text') ?? 'LOGO'; }
  get font() { return this.getAttribute('font') || 'Unbounded'; }
  get weight() { return +(this.getAttribute('weight') || 700); }
  get tracking() { const v = parseFloat(this.getAttribute('tracking')); return isNaN(v) ? 0 : clamp(v, -.3, 1.5); }
  get scale() { const v = parseFloat(this.getAttribute('scale')); return isNaN(v) ? 1 : clamp(v, .1, 1); }
  get energy() { return ENERGY[this.getAttribute('energy')] || ENERGY.lively; }
  get hover() { const v = this.getAttribute('hover') || 'magnet'; return v === 'morph' ? 'off' : v; }   // 'morph' = old name of "hover-text only"
  get hoverStrength() { const v = parseFloat(this.getAttribute('hover-strength')); return isNaN(v) ? 1 : clamp(v, 0, 2); }
  get hoverText() { return this.getAttribute('hover-text') || ''; }
  // anchor → [justify, align] of the rows in the stage grid
  get anchor() {
    const a = (this.getAttribute('anchor') || 'center').toLowerCase();
    return [/left/.test(a) ? 'start' : /right/.test(a) ? 'end' : 'center', /top/.test(a) ? 'start' : /bottom/.test(a) ? 'end' : 'center'];
  }
  _off(name) { const v = (this.getAttribute(name) || '').split(/[\s,]+/).map(parseFloat); return [isNaN(v[0]) ? 0 : v[0], isNaN(v[1]) ? 0 : v[1]]; }
  get offset() { return this._off('offset'); }
  get hoverOffset() { return this.hasAttribute('hover-offset') ? this._off('hover-offset') : this.offset; }
  // active mouse reactions as [[name, strength], …]: hover-mix, else the old single hover + hover-strength
  get hoverMix() {
    const key = this.getAttribute('hover-mix') + '|' + this.getAttribute('hover') + '|' + this.getAttribute('hover-strength');
    if (key === this._mixKey) return this._mix;
    let mix;
    if (this.hasAttribute('hover-mix')) mix = this.getAttribute('hover-mix').split(/[\s,]+/).filter(Boolean).map(t => { const [n, v] = t.split(':'); const w = parseFloat(v); return [n, isNaN(w) ? 1 : clamp(w, 0, 2)]; });
    else { const h = this.hover, s = this.hoverStrength; mix = h === 'off' ? [] : h === 'combine' ? Object.entries(COMBINE).map(([n, w]) => [n, w * s]) : [[h, s]]; }
    this._mixKey = key; this._mix = mix.filter(([n, w]) => REACTIONS.includes(n) && w > 0);
    return this._mix;
  }
  get morphTime() { const v = parseFloat(this.getAttribute('morph-time')); return isNaN(v) ? .75 : clamp(v, .1, 5); }
  get oBlink() { const a = this.getAttribute('o-blink'); if (a === null) return 0; const v = parseFloat(a); return isNaN(v) ? 3 : v <= 0 ? 0 : clamp(v, .2, 60); }
  get rare() { const v = parseFloat(this.getAttribute('rare')); return isNaN(v) ? .12 : clamp(v, 0, 1); }
  get interval() { const v = parseFloat(this.getAttribute('interval')); return isNaN(v) ? 2.2 : Math.max(0, v); }
  // idle lists, or the hover-* lists while hovered (each falls back to its idle twin when absent)
  _list(name, hov) { const v = hov && this.hasAttribute('hover-' + name) ? this.getAttribute('hover-' + name) : this.getAttribute(name); return v === null ? null : new Set(v.split(/[\s,]+/).filter(Boolean)); }
  _rareSet(hov) { return this._list('rare-set', hov) || new Set(ANIMS.filter(a => a.rare).map(a => a.id)); }
  _offSet(hov) { return this._list('off', hov) || new Set(); }
  get rareSet() { return this._rareSet(this._hovering()); }
  get offSet() { return this._offSet(this._hovering()); }
  // the logo counts as hovered when the pointer is in the zone and something reacts to it (mouse reaction or morph)
  _hovering() { return this._in && (this.hoverMix.length > 0 || !!this._rows[1]); }
  get range() { const s = FONTS[this.font]; return s ? [s[1], s[2]] : [100, 900]; }

  connectedCallback() {
    this._build();
    this._ro = new ResizeObserver(() => this._fit()); this._ro.observe(this);
    this._io = new IntersectionObserver(es => { this._onScreen = es[es.length - 1].isIntersecting; this._kick(); }); this._io.observe(this);
    this._visH = () => this._kick(); document.addEventListener('visibilitychange', this._visH);
    if (document.fonts) { this._fontH = () => this._fit(); document.fonts.addEventListener('loadingdone', this._fontH); document.fonts.ready.then(this._fontH); }
    this._gH = e => { this._gx = e.clientX; this._gy = e.clientY; }; window.addEventListener('pointermove', this._gH, { passive: true });
    this._kick();
  }
  disconnectedCallback() {
    window.removeEventListener('pointermove', this._gH);
    this._ro && this._ro.disconnect(); this._io && this._io.disconnect();
    document.removeEventListener('visibilitychange', this._visH);
    if (document.fonts && this._fontH) document.fonts.removeEventListener('loadingdone', this._fontH);
    this._run = false; cancelAnimationFrame(this._raf);
  }
  attributeChangedCallback(name) {
    if (!this.$row || !this.isConnected) return;
    if (name === 'text' || name === 'font' || name === 'hover-text') this._build();
    else if (name === 'weight' || name === 'tracking' || name === 'scale' || name === 'anchor' || name === 'offset' || name === 'hover-offset') this._fit();
    else if (name === 'paused') this._kick();
  }

  // ---- public ----
  // an animation is available when the font supports it and the name contains the glyph it needs
  available(id) {
    const a = ANIMS.find(x => x.id === id); if (!a) return false;
    if (a.variable && !FONTS[this.font]) return false;
    return !a.needs || this._vis.some(L => NEEDS[a.needs](L.ch));
  }
  play(id) {
    const a = ANIMS.find(x => x.id === id); if (!a) return;
    if (!this.available(id)) return false;
    if (this._m > 0 && this._m < 1) return false;   // mid-morph: the glitch owns the letters
    this._endCur();
    if (a.variable && !FONTS[this.font]) return this.next();
    const c = this._ctx(a);
    this._cur = { a, p: 0, c }; this._lastId = a.id;
    a.start && a.start(c, this);
    this.dispatchEvent(new CustomEvent('kl-anim', { detail: { id: a.id, rare: this.rareSet.has(a.id), hover: this._hovering() } }));
  }
  next(forceRare) {
    const rareP = this.rare * this.energy.rare + (this._hovering() ? .1 : 0);
    const wantRare = forceRare || Math.random() < rareP;
    const rs = this.rareSet, off = this.offSet;
    const ok = ANIMS.filter(a => !off.has(a.id) && this.available(a.id));
    const pick = want => { const g = ok.filter(a => rs.has(a.id) === want); return g.filter(a => a.id !== this._lastId).length ? g.filter(a => a.id !== this._lastId) : g; };
    let pool = pick(wantRare); if (!pool.length) pool = pick(!wantRare);
    if (!pool.length) { this._wait = this.interval || 1; return; }
    this.play(pool[(Math.random() * pool.length) | 0].id);
  }

  // ---- internals ----
  _build() {
    this._endCur();
    loadFont(this.font);
    const mk = (el, text) => {
      el.style.fontFamily = `"${this.font}", system-ui, sans-serif`; el.textContent = '';
      const vis = [];
      for (const ch of Array.from(text || ' ')) {
        const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; s.dataset.c = ch;
        el.appendChild(s);
        if (ch.trim()) vis.push({ el: s, ch, last: '', lastShow: ch, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, sx: 1, sy: 1, skx: 0, o: 1, blur: 0, w: 700, glow: 0, acc: 0, g: 0, go: 0, show: ch, bk: null });
      }
      return { el, vis, hx: [], wd: [], W: 1 };
    };
    const alt = this.hoverText;
    this._rows = [mk(this.$rowA, this.text), alt ? mk(this.$rowB, alt) : null];
    if (!alt) this.$rowB.textContent = '';
    this._m = 0; this._act = this._rows[0]; this._use(this._act); this._rowVis();
    this.setAttribute('role', 'img'); this.setAttribute('aria-label', this.text);
    this._fit();
  }
  _fit() {
    if (!this.isConnected || !this._rows[0]) return;
    const w = this.clientWidth, h = this.clientHeight; if (!w || !h) return;
    const rows = this._rows.filter(Boolean), wt = this.weight, [ji, ai] = this.anchor;
    this.$stage.style.justifyItems = ji; this.$stage.style.alignItems = ai;
    // PLACEMENT — each name is aligned to the anchor and shifted by its own offset (em), so the hover
    // name glitches in at its own spot instead of the logo sliding. `translate` keeps `transform` free for tilt.
    rows.forEach((R, k) => { const o = k ? this.hoverOffset : this.offset; R.ox = o[0]; R.oy = o[1]; R.el.style.translate = o[0] || o[1] ? `${o[0]}em ${o[1]}em` : ''; });
    for (const R of rows) {
      R.el.style.fontSize = '100px'; R.el.style.setProperty('--tr', this.tracking + 'em');
      for (const s of R.el.children) s.style.fontWeight = wt;
      for (const L of R.vis) L.last = '';
    }
    // the wider of the two names decides the size, so the morph never overflows the box
    const em = Math.max(...rows.map(R => R.el.offsetWidth)) / 100;
    // scale (0.1–1): fraction of the full fitted size, logo stays centred in its box
    this._fs = Math.max(4, Math.min(w * .82 / Math.max(em, .3), h * .5) * this.scale);
    for (const R of rows) R.el.style.fontSize = this._fs.toFixed(2) + 'px';
    this._measure();
  }
  _measure() {
    const fs = this._fs, sw = this.$stage.clientWidth, sh = this.$stage.clientHeight;
    for (const R of this._rows) {
      if (!R) continue;
      const rw = R.el.offsetWidth;
      R.cx = (R.el.offsetLeft + rw / 2 - sw / 2) / fs + (R.ox || 0);
      R.cy = (R.el.offsetTop + R.el.offsetHeight / 2 - sh / 2) / fs + (R.oy || 0);
      R.hx = R.vis.map(L => (L.el.offsetLeft + L.el.offsetWidth / 2 - rw / 2) / fs);
      R.wd = R.vis.map(L => L.el.offsetWidth / fs);
      R.W = rw / fs;
    }
    this._use(this._act);
  }
  // make row R the one animations, hover and clicks work on
  _use(R) {
    if (!R) return;
    this.$row = R.el; this._vis = R.vis; this._hx = R.hx; this._wd = R.wd; this._W = R.W; this._cx = R.cx || 0; this._cy = R.cy || 0; this._H = this.clientHeight / (this._fs || 100);
  }
  _rowVis() {
    const B = this._rows[1];
    this.$rowA.classList.toggle('off', !!B && this._m >= 1);
    this.$rowB.classList.toggle('off', !B || this._m <= 0);
  }
  _ctx(a) {
    this._measure();
    const n = this._vis.length, R = rng(++this._seed * 2654435761), [lo, hi] = this.range, wB = this.weight, en = this.energy;
    const oI = [], dI = []; this._vis.forEach((L, j) => { if (isO(L.ch)) oI.push(j); if (isDash(L.ch)) dI.push(j); });
    const maxD = Math.max(.5, ...this._hx.map((x, j) => oI.length ? Math.abs(x - this._hx[nearest({ hx: this._hx }, j, oI)]) : 0));
    return { I: en.I, seed: this._seed * 7919, dur: a.dur * en.d, hx: this._hx.slice(), w: this._wd.slice(), oI, dI, maxD, n,
      r: this._vis.map(() => [R() * 2 - 1, R() * 2 - 1, R() * 2 - 1]), pick: (R() * n) | 0,
      wFar: wB < (lo + hi) / 2 ? hi : lo, wMax: hi, R: Math.max(1.1, this._W / TAU * 1.7) };
  }
  _endCur() { if (this._cur) { const { a, c } = this._cur; a.end && a.end(c, this); this._cur = null; } }
  _kick() {
    const go = this.isConnected && this._onScreen && document.visibilityState !== 'hidden' && !this.hasAttribute('paused');
    if (go && !this._run) { this._run = true; this._prev = performance.now(); this._raf = requestAnimationFrame(this._frame); }
    else if (!go && this._run) { this._run = false; cancelAnimationFrame(this._raf); }
  }
  _frame(now) {
    if (!this._run) return;
    this._raf = requestAnimationFrame(this._frame);
    const dt = Math.min(.05, Math.max(0, (now - this._prev) / 1000)); this._prev = now;
    this._step(dt);
  }
  /* HIT ZONE — where hover and click react: a box around the text, in em (so it scales with the
     font size, the scale attribute and the host size; the empty rest of the host box is dead).
     Width = shown name, height = one line, plus a padding. Hysteresis: entering needs the smaller
     zone around the shown name; once inside, the zone grows to the wider of both names (morph) and
     a larger padding — no flicker at the edge, no flip-back when the morph makes the name shorter.
     Each name has its own box where it really sits (anchor + offset); the stay zone = all boxes.
     Host pages can extend the stay zone with `logo.stayRects = () => [DOMRect-like…]` (e.g. a link beside the
     logo): while the logo is already unfolded, a pointer on such a rect keeps it unfolded; it never unfolds it.
     KNOBS ZONE_IN .3 em enter padding · ZONE_STAY .55 em stay padding · .45 half line height em */
  _hitAt(x, y, stay) {
    const r = this.$stage.getBoundingClientRect(), fs = this._fs;
    const mx = (x - (r.left + r.width / 2)) / fs, my = (y - (r.top + r.height / 2)) / fs;
    return { mx, my, hit: this._zones(stay).some(z => Math.abs(mx - z[0]) <= z[2] && Math.abs(my - z[1]) <= z[3]) };
  }
  // [centre x, centre y, half width, half height] in em from the stage centre, one per name
  _zones(stay) {
    const rows = stay ? this._rows.filter(Boolean) : [this._act || this._rows[0]], pad = stay ? ZONE_STAY : ZONE_IN;
    return rows.filter(Boolean).map(R => [R.cx || 0, R.cy || 0, Math.max(.25, R.W / 2) + pad, .45 + pad]);
  }
  _step(dt) {
    this._t += dt; this._dt = dt;
    // pointer → hit zone
    const was = this._in;
    if (this._over) { const h = this._hitAt(this._px, this._py, was); this._tmx = h.mx; this._tmy = h.my; this._in = h.hit; }
    else this._in = false;
    // stayRects: host page can set a function returning DOMRects (e.g. a link next to the logo) that extend the
    // hit zone — but only while the logo is already unfolded (was) and the pointer is on such a rect
    if (!this._in && was && this.stayRects && this._gx != null) this._in = this.stayRects().some(r => this._gx >= r.left && this._gx <= r.right && this._gy >= r.top && this._gy <= r.bottom);
    if (this.hasAttribute('force-hover')) this._in = true;
    if (this._in !== was) {
      if (this._in && this._hv < .05) { this._mx = this._tmx; this._my = this._tmy; }
      this.$stage.classList.toggle('hot', this._in && this.getAttribute('click') !== 'off');
    }
    if (this.hasAttribute('show-zone')) {   // outline of the (union of) zones
      const zs = this._zones(this._in), x0 = Math.min(...zs.map(z => z[0] - z[2])), x1 = Math.max(...zs.map(z => z[0] + z[2])), y0 = Math.min(...zs.map(z => z[1] - z[3])), y1 = Math.max(...zs.map(z => z[1] + z[3]));
      this.$zone.style.cssText = `font-size:${this._fs.toFixed(2)}px;width:${(x1 - x0).toFixed(3)}em;height:${(y1 - y0).toFixed(3)}em;margin-left:${((x0 + x1) / 2).toFixed(3)}em;margin-top:${((y0 + y1) / 2).toFixed(3)}em`;
    }
    const en = this.energy, hover = this.hover, hovering = this._hovering();
    // morph: m 0 → 1 while hovered (name → hover-text), back on leave; see _morphL
    const A = this._rows[0], B = this._rows[1];
    if (B) {
      const tgt = this._in ? 1 : 0;
      if (this._m !== tgt) {
        if (this._m === 0 || this._m === 1) this._mSeed = (++this._seed * 2654435761) | 0;   // new letter order each time
        this._endCur();
        this._m = clamp(this._m + (tgt ? dt : -dt) / this.morphTime, 0, 1);
        if (this._m === tgt) { this._act = this._rows[tgt]; this._use(this._act); this._wait = Math.max(this._wait, .5); }
        this._rowVis();
      }
    }
    const mT = !!B && this._m > 0 && this._m < 1;
    // scheduler
    if (this._cur) {
      this._cur.p += dt / this._cur.c.dur;
      if (this._cur.p >= 1) { this._endCur(); this._wait = this.interval * en.iv * (.6 + Math.random() * .8); }
    } else if (!RM.matches && this.interval > 0 && !mT) {
      this._wait -= dt * (hovering ? 2.5 : 1);
      if (this._wait <= 0) this.next();
    }
    this._blinkSched(dt, mT);
    // hover smoothing
    const mix = this.hoverMix;
    this._hv += ((this._in && mix.length ? 1 : 0) - this._hv) * (1 - Math.exp(-dt * 6));
    const k = 1 - Math.exp(-dt * 12), pmx = this._mx; this._mx += (this._tmx - this._mx) * k; this._my += (this._tmy - this._my) * k;
    this._vx += ((dt > 0 && this._in ? (this._mx - pmx) / dt : 0) - this._vx) * (1 - Math.exp(-dt * 8));   // flick
    const hv = this._hv, mx = this._mx, my = this._my, t = this._t, [lo, hi] = this.range, variable = !!FONTS[this.font];
    const cur = this._cur, rows = !B || this._m === 0 ? [A] : this._m === 1 ? [B] : [A, B];
    const tear = mT ? this._tear() : 0;
    for (const R of rows) {
      const vis = R.vis, n = vis.length, act = R === this._act;
      for (let j = 0; j < n; j++) {
        const L = vis[j];
        L.x = L.y = L.z = L.rx = L.ry = L.rz = L.skx = L.blur = L.glow = L.acc = L.g = L.go = L.clipT = L.clipB = 0;
        L.s = L.sx = L.sy = L.o = 1; L.w = this.weight; L.show = L.ch;
        if (!RM.matches) {
          L.y += Math.sin(t * 1.3 + j * .7) * .012 * en.E;
          L.rz += Math.sin(t * .8 + j * 1.3) * .5 * en.E;
          if (variable) L.w += Math.sin(t * 1.1 + j * .55) * 35 * en.E;
        }
        if (cur && act) cur.a.fn(L, j, n, Math.min(1, cur.p), cur.c);
        if (hv > .001 && act) for (const [m, w] of mix) this._hoverL(L, j, hv * w, mx - this._cx, my - this._cy, hi, m);
        if (mT) this._morphL(L, j, R === B, tear);
        if (L.bk !== null) this._blinkL(L, dt);
        L.w = clamp(L.w, lo, hi);
        this._write(L);
      }
    }
    if (cur && cur.a.all && this._cur === cur) cur.a.all(Math.min(1, cur.p), cur.c, this);
    let tv = 0; for (const [m, w] of mix) if (m === 'tilt') tv += hv * w;
    const rowT = tv > .001 ? `rotateY(${f1(clamp((mx - this._cx) / Math.max(this._W / 2, .5), -1.5, 1.5) * 18 * tv)}deg) rotateX(${f1(clamp(this._cy - my, -1.5, 1.5) * 20 * tv)}deg)` : '';
    // the shown row changes with the morph — move the tilt to it and clear it from the old one
    if (rowT !== this._rowT || this.$row !== this._rowTEl) {
      if (this._rowTEl && this._rowTEl !== this.$row) this._rowTEl.style.transform = '';
      this._rowT = rowT; this._rowTEl = this.$row; this.$row.style.transform = rowT;
    }
  }
  /* HOVER MODES — added on top of the running animation for every letter, every frame.
     Several can run at once (hover-mix); each gets hv = 0…1 hover fade (in/out ~6/s) × its own strength
     (0–2, so every number below is "at strength 1"). mx/my = smoothed cursor in em from the word centre,
     _vx = smoothed horizontal cursor speed em/s. Runs together with the morph (hover-text).
     REACH is the radius in em around the cursor:
       magnet – radius 1.6 em, (1−d/R)² falloff: letters lean toward the cursor, get heavier.
                KNOBS 1.6 radius · .3 pull · 10 tilt deg per em · 260 extra weight · .08 grow
       repel  – radius 1.4 em: letters are pushed straight away. KNOBS 1.4 radius · .45 push em
       lens   – gaussian, horizontal width .45 / vertical 1.2: magnifies + max weight under the
                cursor. KNOBS .45 lens width (bigger = more letters) · .38 magnification
       tilt   – the whole row tilts toward the cursor (row transform in _step, 18°/20°);
                letters within 2.2 em of the cursor pop forward .28 em.
       ripple – a small wave runs along the name away from the cursor, all the time while hovered.
                REACH falloff exp(−dist × .45) along x. KNOBS .1 height em · 9 rad/s speed ·
                3.2 wave number (bigger = shorter waves) · 4 tilt deg
       flick  – letters near the cursor turn around Y by the horizontal cursor speed, like swiping
                over cards; they turn back when the mouse stops (_vx smoothing 8/s).
                REACH gaussian width 1.5 (≈ ±1.2 em). KNOBS 4 deg per em/s · 75 max deg
       glitch – letters near the cursor twitch: jitter, skew, red/cyan ghosts, now and then a wrong
                glyph (20 ticks/s). REACH gaussian .8. KNOBS .5 chance · .12 jitter em · 20 skew ·
                .1 ghost em · .15 wrong-glyph chance
       glow   – letters under the cursor light up in the accent colour (+ glow halo).
                REACH gaussian .9. KNOBS 1 glow · .9 accent tint
       float  – letters near the cursor lift a little and bob as if weightless.
                REACH gaussian 1.2 (x) / 2 (y). KNOBS .14 lift em · .035 bob em · 4 bob tilt deg
     The shatter dots have their own (stronger) version of the same modes in _updDots. */
  _hoverL(L, j, hv, mx, my, hi, mode) {
    const dx = mx - this._hx[j], dy = my, d = Math.hypot(dx, dy) + 1e-4;
    if (mode === 'magnet') {
      const f = Math.pow(Math.max(0, 1 - d / 1.6), 2) * hv;
      L.x += dx * .3 * f; L.y += dy * .3 * f; L.rz += dx * 10 * f; L.w += 260 * f; L.s *= 1 + .08 * f;
    } else if (mode === 'repel') {
      const f = Math.pow(Math.max(0, 1 - d / 1.4), 2) * hv;
      L.x -= dx / d * .45 * f; L.y -= dy / d * .45 * f; L.rz -= dx * 14 * f; L.s *= 1 - .1 * f;
    } else if (mode === 'lens') {
      const f = Math.exp(-dx * dx / .45) * Math.exp(-dy * dy / 1.2) * hv;
      L.s *= 1 + .38 * f; L.w = lerp(L.w, hi, f); L.y -= .04 * f; L.z += .2 * f;
    } else if (mode === 'tilt') {
      L.z += .28 * hv * Math.max(0, 1 - Math.abs(dx) / 2.2);
    } else if (mode === 'ripple') {
      const ad = Math.abs(dx), b = Math.sin(this._t * 9 - ad * 3.2) * Math.exp(-ad * .45) * hv;
      L.y -= .1 * b; L.rz += (Math.sign(-dx) || 1) * 4 * b;
    } else if (mode === 'flick') {
      L.ry += clamp(this._vx * 4, -75, 75) * Math.exp(-dx * dx / 1.5) * hv;
    } else if (mode === 'glitch') {
      const f = Math.exp(-d * d / .8) * hv, R = rng(hs(j * 7919 + Math.floor(this._t * 20) * 131 + 977));
      if (R() < .5 * f) { L.x += (R() - .5) * .12 * f; L.skx += (R() - .5) * 20 * f; L.g = (R() - .5) * .1 * f; L.go = 1; if (R() < .15 * f) L.show = glyphAt(R()); }
    } else if (mode === 'glow') {
      const f = Math.min(1, Math.exp(-d * d / .9) * hv);
      L.glow = Math.max(L.glow, f); L.acc = Math.max(L.acc, f * .9);
    } else if (mode === 'float') {
      const f = Math.exp(-dx * dx / 1.2) * Math.exp(-dy * dy / 2) * hv;
      L.y -= .14 * f + Math.sin(this._t * 2.4 + j * 1.7) * .035 * f; L.rz += Math.sin(this._t * 1.9 + j) * 4 * f;
    }
  }
  /* morph (hover-text, independent of the mouse reaction) — on hover the name glitches into the second name within
     morph-time (.75 s), on leave it glitches back. Both names are real rows laid over each other.
     WHO every letter of both names, each at its own random moment (new order every hover)
     TIME m 0→1 over morph-time. Old letter i dies in m th…th+.3, th = random 0–.5;
          new letter appears in m th…th+.3, th = .2 + random 0–.5 → m .2–.8 both names glitch together
     REACH whole name, random order, no cascade. While a letter is in its window, 26 ticks/s:
          flickers on/off (more often visible the further it is in), wrong glyphs, jitter, skew,
          red/cyan ghosts, horizontal slicing (clipT/clipB), accent flashes; + the whole row tears
     KNOBS .3 window (longer = more letters glitching at once) · .5 order spread · .2 new-name head start · 26 ticks/s ·
          .22 jitter em · 40 skew deg · .14 ghost split em · .55 wrong-glyph chance · .35 slice
          chance · .5 max slice em · .25 accent chance · tear: .3 chance per tick, ±.07 em
     Running animations stop when a morph starts; afterwards they play on the shown name. */
  _tear() {
    const R = rng(hs(this._mSeed + Math.floor(this._t * 26) * 977));
    return R() < .3 ? (R() - .5) * .14 : 0;
  }
  _morphL(L, j, isB, tear) {
    const P = rng(hs(this._mSeed + j * 104729 + (isB ? 7919 : 0)));
    const th = (isB ? .2 : 0) + P() * .5, u = clamp((this._m - th) / .3, 0, 1), pres = isB ? u : 1 - u;
    if (RM.matches) { if (pres < .5) L.o = 0; return; }
    L.x += tear;
    if (u <= 0 || u >= 1) { if (!pres) L.o = 0; return; }
    const g = bump(u), T = rng(hs(this._mSeed + j * 131 + (isB ? 17 : 0) + Math.floor(this._t * 26) * 7));
    if (T() > .1 + .85 * pres) { L.o = 0; return; }
    L.x += (T() - .5) * .22 * g; L.skx += (T() - .5) * 40 * g; L.g = (T() - .5) * .14 * g; L.go = 1; L.sy *= 1 + (T() - .5) * .3 * g;
    if (T() < .55 * g) L.show = glyphAt(T());
    if (T() < .35 * g) { if (T() < .5) L.clipT = T() * .5; else L.clipB = T() * .5; }
    if (T() < .25 * g) L.acc = 1;
  }
  /* o-blink — every O / o / Ø / ø briefly flickers into its opposite (O ↔ Ø) and back.
     Works in both names, independent of animations (skipped while a letter shows another glyph).
     WHEN gaps are random around the mean (o-blink seconds): exponential (−ln U), clamped .3–2.5×
          mean → mostly short, sometimes a long quiet; 30 % of blinks get a quick repeat
          .12–.32 s later (double blink, same letters)
     WHO  60 % one random O · 20 % all O at once · 20 % all O cascading left→right .07 s apart
          (with a single O it is always that one)
     TIME plain blink .26 s, 30 flickers/s, 60 % showing the opposite · 20 % of blinks "stick":
          flicker in .14 s → hold the opposite .4–1.5 s → flicker back .14 s
     KNOBS .6/.2/.2 who split · .3 repeat chance · .26 blink length · .2 stick chance ·
          .08 ghost split em · .04 jitter em · .15 dim chance */
  _blinkSched(dt, busy) {
    const mean = this.oBlink;
    if (!mean || RM.matches) return;
    this._bkWait -= dt;
    if (this._bkWait > 0) return;
    const rep = this._bkRep; this._bkRep = null;
    const os = rep || this._vis.filter(L => O_SWAP[L.ch]);
    if (os.length && !busy) {
      let set = os, step = 0;
      if (!rep) { const r = Math.random(); if (r < .6 || os.length < 2) set = [os[(Math.random() * os.length) | 0]]; else if (r >= .8) step = .07; }
      set.forEach((L, k) => { L.bk = -k * step; L.bkHold = !rep && Math.random() < .2 ? .4 + Math.random() * 1.1 : 0; L.bkSeed = (Math.random() * 1e9) | 0; });
      if (!rep && !set.some(L => L.bkHold) && Math.random() < .3) this._bkRep = set;
    }
    this._bkWait = this._bkRep ? .12 + Math.random() * .2 : mean * clamp(-Math.log(1 - Math.random()), .3, 2.5);
  }
  _blinkL(L, dt) {
    L.bk += dt;
    const b = L.bk, H = L.bkHold, F = .14;
    if (b < 0) return;
    if (b >= (H ? 2 * F + H : .26)) { L.bk = null; return; }
    const R = rng(hs(L.bkSeed + Math.floor(b * 30)));
    let alt, fl = true;
    if (!H) alt = R() < .6;
    else if (b < F) alt = R() < .35 + .6 * b / F;
    else if (b < F + H) { alt = true; fl = false; }
    else alt = R() < .95 - .7 * (b - F - H) / F;
    if (L.show !== L.ch) return;
    if (alt) L.show = O_SWAP[L.ch];
    if (fl) { L.go = 1; L.g = (R() - .5) * .08; L.x += (R() - .5) * .04; if (R() < .15) L.o *= .35; }
  }
  _write(L) {
    const tf = `translate3d(${f3(L.x)}em,${f3(L.y)}em,${f3(L.z)}em) rotateX(${f1(L.rx)}deg) rotateY(${f1(L.ry)}deg) rotateZ(${f1(L.rz)}deg) skewX(${f1(L.skx)}deg) scale(${f3(L.s * L.sx)},${f3(L.s * L.sy)})`;
    const w = Math.round(L.w), o = clamp(L.o, 0, 1).toFixed(3), bl = L.blur > .0008 ? (L.blur * this._fs).toFixed(2) : '';
    const gl = L.glow > .01 ? L.glow.toFixed(2) : '', ac = L.acc > .01 ? Math.round(L.acc * 100) : 0, g = L.go ? L.g.toFixed(3) : '';
    const cp = L.clipT > .001 || L.clipB > .001 ? `inset(${L.clipT > .001 ? f3(L.clipT) : '-.6'}em -.6em ${L.clipB > .001 ? f3(L.clipB) : '-.6'}em -.6em)` : '';
    const key = tf + o + bl + w + gl + ac + g + cp + L.show;
    if (key === L.last) return;
    L.last = key;
    const st = L.el.style;
    st.transform = tf; st.opacity = o; st.fontWeight = w;
    st.filter = bl ? `blur(${bl}px)` : ''; st.clipPath = cp;
    st.textShadow = gl ? `0 0 ${(.08 + .22 * L.glow).toFixed(3)}em color-mix(in srgb, var(--acc) ${Math.round(L.glow * 90)}%, transparent), 0 0 ${(.4 * L.glow).toFixed(3)}em color-mix(in srgb, var(--acc) ${Math.round(L.glow * 45)}%, transparent)` : '';
    st.color = ac ? `color-mix(in srgb, var(--acc) ${ac}%, currentColor)` : '';
    if (g) { st.setProperty('--g', g); st.setProperty('--go', '1'); } else { st.removeProperty('--g'); st.removeProperty('--go'); }
    if (L.show !== L.lastShow) { L.el.textContent = L.show; L.el.dataset.c = L.show; L.lastShow = L.show; }
  }
  _buildDots(c) {
    this._clearDots();
    const layer = document.createElement('div'); layer.className = 'dots'; this.$row.appendChild(layer);
    const R = rng(c.seed + 5), w = this.weight; this._dots = [];
    this._vis.forEach((L, j) => {
      const pts = glyphPts(L.ch, this.font, w);
      for (let k = 0; k < 34; k++) {
        const p = pts[(R() * pts.length) | 0], d = document.createElement('i'); d.className = 'dot';
        if (R() < .3) d.style.background = 'var(--acc)';
        layer.appendChild(d);
        const bx = c.hx[j] + p[0], by = p[1], a = Math.atan2(by, p[0] + (R() - .5) * .6) + (R() - .5) * 1.2, dist = (.5 + R() * 1.8) * c.I;
        this._dots.push({ d, bx, by, ex: bx + Math.cos(a) * dist + (R() - .5) * .4, ey: clamp(by + Math.sin(a) * dist * .22, -.42, .42), s: .6 + R() * 1.2, ph: R() * TAU, ox: 0, oy: 0, sc: 1 });
      }
    });
    this._dotLayer = layer;
  }
  _updDots(p) {
    if (!this._dots) return;
    const k = p < .1 ? 0 : p < .48 ? outC((p - .1) / .38) : p < .56 ? 1 : 1 - inOut(clamp((p - .56) / .3, 0, 1));
    const o = (sm(.02, .1, p) * (1 - sm(.86, .97, p))).toFixed(3);
    // dots react to the cursor with the same hover mode as the letters; each dot eases on its own (inertia ∝ size)
    const hv = this._hv, mx = this._mx - this._cx, my = this._my - this._cy, mix = this.hoverMix, dt = this._dt || 1 / 60;   // row-local, like the dots
    for (const D of this._dots) {
      const x = lerp(D.bx, D.ex, k) + Math.sin(p * 9 + D.ph) * .06 * k, y = lerp(D.by, D.ey, k) + Math.cos(p * 7 + D.ph) * .05 * k;
      let tx = 0, ty = 0, ts = 1;
      if (hv > .001) {
        const dx = mx - x, dy = my - y, d = Math.hypot(dx, dy) + 1e-4, w = 1.5 - D.s * .4;
        for (const [m, w] of mix) {   // only magnet / repel / lens / tilt move the dots
          const h = hv * w;
          if (m === 'magnet') { const f = Math.pow(Math.max(0, 1 - d / 2), 2) * h; tx += dx * .85 * f * w; ty += dy * .85 * f * w; ts += .5 * f; }
          else if (m === 'repel') { const f = Math.pow(Math.max(0, 1 - d / 1.6), 2) * h; tx -= dx / d * .75 * f * w; ty -= dy / d * .75 * f * w; }
          else if (m === 'lens') { const f = Math.exp(-d * d / .6) * h; tx -= dx * .45 * f; ty -= dy * .45 * f; ts += 1.3 * f; }
          else if (m === 'tilt') { tx += mx * .1 * (D.s - 1.2) * h; ty += my * .1 * (D.s - 1.2) * h; }
        }
      }
      const a = 1 - Math.exp(-dt * (5 + 5 / D.s));
      D.ox += (tx - D.ox) * a; D.oy += (ty - D.oy) * a; D.sc += (ts - D.sc) * a;
      D.d.style.transform = `translate3d(${(x + D.ox).toFixed(3)}em,${(y + D.oy).toFixed(3)}em,0) scale(${(D.s * (1 - .3 * k) * D.sc).toFixed(2)})`;
      D.d.style.opacity = o;
    }
  }
  _clearDots() { if (this._dotLayer) { this._dotLayer.remove(); this._dotLayer = null; this._dots = null; } }
}
customElements.define('kinetic-logo', KineticLogo);
window.KineticLogo = KineticLogo;
})();
