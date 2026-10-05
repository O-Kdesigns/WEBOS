// Putovníci kolem DNA (2026-10-05, Oliver: „ať DNA nepůsobí hubeně, ať je živá“).
// Část particlů DNA (podíl `count`) neopustí DNA jako bordel, ale žije kolem ní: každý má vlastní dráhu kolem osy DNA
// (x = z = 0) ve vzdálenosti `distance` za vláknem, vlastní rychlost a směr oběhu, pomalé houpání nahoru/dolů
// a dýchání dovnitř/ven; každých pár sekund si některý dovolí výlet dál (`excursion`). Particly jdou po blocích
// po 4 (pořadí v textuře): podle `cluster` se blok rozdělí na skupinu 2–4 se společnou dráhou (vedoucí = první
// v bloku, členové kolem něj v rozptylu `spread`) a zbytek jsou samotáři s vlastní dráhou.
// Dráha je jen cíl („domov“) – velocity shader (řízení návratu), poziční shader (lerp bez vody), voda a vodítko
// fungují stejně jako pro DNA. Rezervní kostka (dna.w ≤ 0) nikdy. Selekci sdílí DnaCore (putovníci neodhalují páteř).

export const WANDER_DEFAULTS = {
  enabled: true,
  count: 0.04,      // podíl particlů DNA, které putují (0.04 = 4 %)
  cluster: 0.5,     // shlukování: 0 = všichni sami, 1 = většinou skupinky po 3–4
  distance: 0.7,    // jak daleko od vláken DNA (world, každý 0.3–1×)
  excursion: 0.6,   // výlety dál (world navíc, občas)
  speed: 0.25,      // rychlost putování kolem DNA (world/s, každý 0.4–1.6×)
  spread: 0.14,     // rozptyl členů skupiny kolem vedoucího (world)
};

// uWander: x = podíl, y = shlukování, z = vzdálenost, w = poloměr DNA (0 = vypnuto)
// uWander2: x = rychlost, y = výlety, z = čas (s), w = rozptyl skupiny
export const WANDER_GLSL = /* glsl */`
uniform vec4 uWander;
uniform vec4 uWander2;
float wHash(float n, float k) { return fract(sin(n * 0.1271 + k * 78.233) * 43758.5453); }
float wIndex(vec2 uv, float S) { return floor(uv.x * S) + floor(uv.y * S) * S; }
vec2 wIdxUv(float idx, float S) { return (vec2(mod(idx, S), floor(idx / S)) + 0.5) / S; }
// 1 = putovník. leader = index, jehož dráhu sdílí (sám sebe = samotář), grouped = 1 člen skupiny
float wanderSel(vec2 uv, float S, out float leader, out float grouped) {
  float idx = wIndex(uv, S);
  float block = floor(idx / 4.0);
  float k = idx - block * 4.0;
  leader = idx; grouped = 0.0;
  if (uWander.w <= 0.0 || wHash(block, 1.0) >= uWander.x) return 0.0;
  float gs = 1.0 + floor(wHash(block, 2.0) * 3.999 * uWander.y); // velikost skupiny 1–4
  if (gs > 1.5 && k < gs) { leader = block * 4.0; grouped = 1.0; }
  return 1.0;
}
// dráha kolem osy DNA; homeY = výška domova (vedoucího)
vec3 wanderPath(float seed, float homeY) {
  float t = uWander2.z;
  float h1 = wHash(seed, 3.0), h2 = wHash(seed, 4.0), h3 = wHash(seed, 5.0), h4 = wHash(seed, 6.0), h5 = wHash(seed, 7.0);
  // výlet: dvě pomalé sinusovky se občas sejdou -> každých pár s si část dovolí dál
  float n = 0.5 + 0.5 * sin(t * (0.17 + 0.2 * h5) + h5 * 40.0) * sin(t * (0.11 + 0.1 * h2) + h2 * 30.0);
  float r = uWander.w + uWander.z * (0.3 + 0.7 * h4) + smoothstep(0.55, 0.95, n) * uWander2.y + sin(t * 0.3 + h2 * 9.0) * 0.06;
  float a = h3 * 6.2831853 + t * (h1 < 0.5 ? -1.0 : 1.0) * uWander2.x * (0.4 + 1.2 * h2) / max(r, 0.3);
  float y = homeY + sin(t * (0.05 + 0.08 * h4) + h1 * 20.0) * (0.3 + 0.9 * h5);
  return vec3(cos(a) * r, y, sin(a) * r);
}
vec3 wanderTarget(vec2 uv, float S, float leader, float grouped, sampler2D dnaTex, float ownY) {
  vec4 lh = texture2D(dnaTex, wIdxUv(leader, S));
  vec3 P = wanderPath(leader, lh.w > 0.0 ? lh.y : ownY);
  if (grouped > 0.5) {
    float idx = wIndex(uv, S), t = uWander2.z;
    vec3 o = vec3(wHash(idx, 8.0), wHash(idx, 9.0), wHash(idx, 10.0)) - 0.5;
    o += 0.25 * vec3(sin(t * 0.7 + idx), sin(t * 0.6 + idx * 1.3), cos(t * 0.8 + idx * 0.7));
    P += o * uWander2.w;
  }
  return P;
}
`;

