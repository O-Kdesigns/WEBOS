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
