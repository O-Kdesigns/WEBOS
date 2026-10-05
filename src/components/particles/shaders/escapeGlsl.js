// Odtržené particly (utils.js): vel.w >= 2 = odtržený, vel.w - 2 = s od bodu zlomu.
// Vertex kód: vEsc (0/1), vEscFlash (záblesk 1 -> 0) a "pop" zvětšení při záblesku.
// Potřebuje v rozsahu: aComputeUV, computedScale, uniformy tVelocities, uEscFlashTime, uEscPop, uEscLife.
export const ESC_VERTEX = /* glsl */`
    vec4 escData = texture2D(tVelocities, aComputeUV);
    vEsc = step(1.5, escData.w);
    // záblesk: rychlý náběh (bez skoku), pomalé doznění – každý particl ve svůj čas zlomu
    float escAge = max(escData.w - 2.0, 0.0);
    // před samovolným připojením (uEscLife) barva plynule odezní
    vEsc *= 1.0 - smoothstep(uEscLife - 1.5, uEscLife, escAge);
    vEscFlash = step(1.5, escData.w) * smoothstep(0.0, 0.06, escAge) * exp(-escAge / max(uEscFlashTime, 1e-3));
    computedScale *= 1.0 + uEscPop * vEscFlash;
`;

// Barevná odezva na pohyb (particlePhysics.stirLook, utils.js STIR_LOOK_DEFAULTS): particl, který se hýbe (voda,
// myš, návrat domů), se přelije do duhového odstínu podle směru pohybu a jemně se rozzáří -> víry mají barevné
// pruhy, které sledují proud. vel.xyz = posun za snímek (world), uVelDt = délka toho snímku.
// uStirLook = (přebarvení 0..1, záře, rychlost od, plně od [world/s]); uStirHold = barva i podle „držení“ vel.w
// (dotkla se ho myš/voda, za ~2 s dozní) -> i pomalý tah nechá za kurzorem barevnou stopu (rychlost je tam malá).
// Potřebuje escData z ESC_VERTEX.
export const STIR_VERTEX_HEAD = /* glsl */`
  uniform vec4 uStirLook;
  uniform float uVelDt;
  uniform float uStirHold;
  varying float vStir;
  varying vec3 vStirDir;
`;
export const STIR_VERTEX = /* glsl */`
    float stirLen = length(escData.xyz);
    float stirSp = stirLen / max(uVelDt, 1e-4);
    float stirHeld = escData.w < 1.5 ? clamp(escData.w, 0.0, 1.0) : 0.0;
    vStir = max(smoothstep(uStirLook.z, max(uStirLook.w, uStirLook.z + 1e-3), stirSp), stirHeld * stirHeld * uStirHold)
          * (1.0 - step(1.5, escData.w));
    vStirDir = stirLen > 1e-7 ? escData.xyz / stirLen : vec3(0.0, 1.0, 0.0);
`;
export const STIR_FRAG_HEAD = /* glsl */`
  uniform vec4 uStirLook;
  uniform float uStirHue;
  uniform float uStirInside;   // síla uvnitř projektu (INSIDE má barvy videa) – mix podle uTransitionProgress
  varying float vStir;
  varying vec3 vStirDir;
  // duha podle směru pohybu (+ trocha náhody na particl a pomalý posun v čase)
  vec3 stirRainbow(vec3 d, float r, float t) {
    float h = fract(atan(d.y, d.x) / 6.2831853 + d.z * 0.35 + r * 0.15 + t * 0.04 + uStirHue);
    return clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  }
`;
