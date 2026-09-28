// Vložit na začátek FRAGMENT shaderu (ShaderMaterial / GPUComputationRenderer), jehož textury nemají mipmapy
// (render targety, VideoTexture, DataTexture). Důvod: na Windows jde WebGL přes ANGLE -> Direct3D a HLSL
// překladač neumí přeskočit if/smyčku, ve které je texture() s implicitní LOD (potřebuje derivace) –
// větev "zploští" a spočítá ji VŽDY, i když je efekt vypnutý. textureLod(…, 0) derivace nepotřebuje,
// takže se větve opravdu přeskakují; bez mipmap je LOD 0 přesně to, co texture() četl -> stejné pixely.
// Změřeno 2026-09-28 (src/debug/GpuProfiler.js): postprocess 1,40 -> 0,68 ms. Viz LIGHTING.md.
// NEPOUŽÍVAT pro shadery s texturami s mipmapami (obrázky, GLTF mapy) – tam by LOD 0 zrnil.
export const TEX_LOD0 = `
#undef texture2D
#define texture2D(s, uv) textureLod(s, uv, 0.0)
`;
