// Putovníci v DNA (2026-10-05, Oliver: „ať DNA v klidu nepůsobí hubeně, ať je živá – ale ať se drží DNA, jsou v ní
// a jen to vypadá tlustší“). Podíl `count` particlů z VLÁKEN DNA (ne z příček – ty jsou jen v určitých výškách)
// putuje podél svého vlákna: šroubovice se zobrazí sama na sebe posunem o Δy a otočením kolem osy o k·Δy,
// takže domov posunutý tímhle pohybem leží pořád přesně ve vlákně. Δy kmitá (`travel` world, rychlost `speed`).
// Od osy vlákna ven je odsune `distance`·(0.3–1) + občasný výlet `excursion` -> vlákno ztloustne; 0 a 0 = přesně
// tam, kde ostatní particly. Particly jdou po blocích po 4 (pořadí v textuře): podle `cluster` skupinka 2–4 se
// společnou dráhou vedoucího (rozptyl `spread`), zbytek samotáři.
// Dráha je jen cíl („domov“) – velocity shader (řízení návratu), poziční shader (lerp bez vody), voda a vodítko
// fungují stejně jako pro DNA. Rezervní kostka (dna.w ≤ 0) nikdy. Výběr sdílí DnaCore (putovníci neodhalují páteř).

export const WANDER_DEFAULTS = {
  enabled: true,
  count: 0.06,      // podíl particlů vláken DNA, které putují (0.06 = 6 %)
  cluster: 0.5,     // shlukování: 0 = všichni sami, 1 = většinou skupinky po 3–4
  distance: 0.2,    // jak daleko od osy vlákna ven (world, každý 0.3–1×) – 0 = ve vlákně jako ostatní
  excursion: 0.25,  // výlety dál od vlákna (world navíc, občas)
  travel: 2,        // jak daleko putují podél vlákna nahoru/dolů (world, každý 0.3–1×)
  speed: 0.2,       // rychlost putování podél vlákna (world/s, každý 0.5–1.5×)
  spread: 0.06,     // rozptyl členů skupiny kolem vedoucího (world)
};

// uWander: x = podíl, y = shlukování, z = vzdálenost od vlákna, w = 1 zapnuto
// uWander2: x = rychlost, y = výlety, z = čas (s), w = rozptyl skupiny
// uWander3: šroubovice th0, k, R (dnaShape), w = putování podél DNA (world)
export const WANDER_GLSL = /* glsl */`
uniform vec4 uWander;
uniform vec4 uWander2;
uniform vec4 uWander3;
float wHash(float n, float k) { return fract(sin(n * 0.1271 + k * 78.233) * 43758.5453); }
float wIndex(vec2 uv, float S) { return floor(uv.x * S) + floor(uv.y * S) * S; }
vec2 wIdxUv(float idx, float S) { return (vec2(mod(idx, S), floor(idx / S)) + 0.5) / S; }
// odsazení bodu od osy bližšího vlákna (xz, ve vodorovné rovině)
vec2 wStrandOff(vec3 p) {
  float th = uWander3.x + uWander3.y * p.y;
  vec2 c = uWander3.z * vec2(cos(th), sin(th));
  vec2 o0 = p.xz - c, o1 = p.xz + c;
  return dot(o0, o0) < dot(o1, o1) ? o0 : o1;
}
// domov ve vlákně (ne příčka, ne rezervní kostka)
bool wOnStrand(vec4 h) { return h.w > 0.0 && length(wStrandOff(h.xyz)) < uWander3.z * 0.3; }
// 1 = putovník. leader = index, jehož dráhu sdílí (sám sebe = samotář), grouped = 1 člen skupiny
float wanderSel(vec2 uv, float S, vec4 own, sampler2D dnaTex, out float leader, out float grouped) {
  float idx = wIndex(uv, S);
  float block = floor(idx / 4.0);
  float k = idx - block * 4.0;
  leader = idx; grouped = 0.0;
  if (uWander.w < 0.5 || wHash(block, 1.0) >= uWander.x || !wOnStrand(own)) return 0.0;
  float gs = 1.0 + floor(wHash(block, 2.0) * 3.999 * uWander.y); // velikost skupiny 1–4
  if (gs > 1.5 && k < gs && wOnStrand(texture2D(dnaTex, wIdxUv(block * 4.0, S)))) { leader = block * 4.0; grouped = 1.0; }
  return 1.0;
}
// pozice putovníka: domov posunutý podél šroubovice (Δy + otočení k·Δy) + odsazení od osy vlákna ven
vec3 wanderPath(float seed, vec3 home) {
  float t = uWander2.z;
  float h1 = wHash(seed, 3.0), h2 = wHash(seed, 4.0), h3 = wHash(seed, 5.0), h4 = wHash(seed, 6.0), h5 = wHash(seed, 7.0);
  float A = uWander3.w * (0.3 + 0.7 * h2);
  float dy = A * sin(t * uWander2.x * (0.5 + h3) / max(A, 0.1) + h1 * 6.2831853);
  float a = uWander3.y * dy;
  vec2 xz = mat2(cos(a), sin(a), -sin(a), cos(a)) * home.xz; // otočení o a (úhel atan2(z, x) roste)
  vec3 P = vec3(xz.x, home.y + dy, xz.y);
  // výlet: dvě pomalé sinusovky se občas sejdou -> každých pár s si část dovolí dál
  float n = 0.5 + 0.5 * sin(t * (0.17 + 0.2 * h5) + h5 * 40.0) * sin(t * (0.11 + 0.1 * h2) + h2 * 30.0);
  float outD = uWander.z * (0.3 + 0.7 * h4) + smoothstep(0.55, 0.95, n) * uWander2.y;
  outD += sin(t * 0.3 + h2 * 9.0) * 0.03 * min(1.0, outD * 5.0); // dýchání (při 0 nic)
  vec2 o = wStrandOff(P);
  float ol = length(o);
  vec2 dir = ol > 1e-4 ? o / ol : normalize(P.xz + vec2(1e-4));
  P.xz += dir * outD;
  return P;
}
vec3 wanderTarget(vec2 uv, float S, float leader, float grouped, sampler2D dnaTex, vec3 ownHome) {
  vec3 home = grouped > 0.5 ? texture2D(dnaTex, wIdxUv(leader, S)).xyz : ownHome;
  vec3 P = wanderPath(leader, home);
  if (grouped > 0.5) {
    float idx = wIndex(uv, S), t = uWander2.z;
    vec3 o = vec3(wHash(idx, 8.0), wHash(idx, 9.0), wHash(idx, 10.0)) - 0.5;
    o += 0.25 * vec3(sin(t * 0.7 + idx), sin(t * 0.6 + idx * 1.3), cos(t * 0.8 + idx * 0.7));
    P += o * uWander2.w;
  }
  return P;
}
`;
