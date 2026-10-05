import * as THREE from 'three';

// Vodnatá fyzika particlů s myší (jako Active Theory). Neviditelná mřížka tekutiny přes obrazovku
// (stable fluids: advekce, víření, tlak) – myš do ní vhání proud, proud sám dojíždí, víří a rozráží se
// do stran. Nic se z ní nekreslí: GPGPU particlů (utils.js) si jen přečte proud v místě, kde je particl
// na obrazovce, a přepočte ho na 3D posun podle hloubky -> blízké i vzdálené particly se vizuálně hýbou stejně.
// Posune se jen přední vrstva particlů: každý systém si kreslí malou mapu nejbližší hloubky svých particlů
// (MIN blending), particly hlouběji než `frontShell` za ní proud ignorují.
// Config `particlePhysics.fluid` (vše volitelné, viz FLUID_DEFAULTS). Když se myš nehýbe `idleSleep` s,
// simulace i mapa hloubky se vypnou (klid = nulová cena).

export const FLUID_DEFAULTS = {
  enabled: true,
  // 'pavel' = jako PavelDoGreat WebGL-Fluid-Simulation: myš proud PŘIČÍTÁ (víc tahů = víc energie, střih -> víry),
  // 'brush' = starý štětec: proud ve stopě se NASTAVÍ na rychlost kurzoru (force/speedCurve/maxSpeed/wake/splatHardness)
  mode: 'pavel',
  // 'particles' = vodu tvoří JEN pohyb particlů (2026-10-05, Oliver): myš particly jen poprvé strčí (pole `push`,
  // cítí ho jen particly, rychle mizí), strčené particly svou rychlostí na obrazovce vhánějí proud do vody a vlny
  // (jako loď) -> voda nese a strká další particly. Kde nejsou particly, myš s vodou nic neudělá.
  // 'mouse' = dřívější chování: myš vhání proud i vlny přímo do vody.
  source: 'particles',
  insideSource: 'mouse',  // zdroj vody mimo klid DNA (průlet + INSIDE); 'mouse' = jako do 2026-10-05 (Oliver: v INSIDE lepší)
  pushFade: 0.3,          // [particles] s – jak rychle mizí strčení myší (první náraz do particlů)
  inject: 0.9,            // [particles] jak silně se proud v buňce přizpůsobí rychlosti particlů (za snímek)
  injectCover: 1,         // [particles] 1 / počet strčených particlů v buňce mřížky pro plné pokrytí (dřív 0.5)
  injectPointSize: 5,     // [particles] velikost particlu v mřížce (buňky) – měkký gauss, ne čtverec
  injectWave: 1,          // [particles] vlny z pohybu particlů (× waveHeight)
  // [particles] doznění: particly tvoří vodu jen `afterglow` s po posledním pohybu myši (síla plynule klesá k 0),
  // pak voda utichne útlumem navíc `calm` (1/s). Bez toho se strkání particlů vodou a vody particly řetězilo
  // a vířilo samo dál desítky sekund („autoplay“, Oliver 2026-10-05).
  afterglow: 2,
  calm: 3,
  // [particles] práh víření ve SKUTEČNÉ rychlosti kurzoru (cm/s na displeji, viz pointerSpeed níže): pod `stirSpeed`
  // tah particly jen strčí, vodu z nich netvoří; mezi `stirSpeed` a `stirFull` síla víření plynule roste.
  // (do 2026-10-05 výšky obrazovky/s, výchozí 0 = vířil každý tah – Oliver: „hned to začne dělat“)
  stirSpeed: 12,
  stirFull: 40,
  // [particles] zóna kolem dráhy myši: vodu z particlů smí tvořit jen tam, kudy kurzor nedávno projel (× síla víření
  // podle rychlosti). Mimo zónu je voda jen nese, další vodu z nich nedělá -> víření se nerozleze po celé DNA ani
  // při rychlém tahu a drží se myši. Poloměr ve výškách obrazovky, mizení = časová konstanta v s.
  zoneRadius: 0.09,
  zoneFade: 0.45,
  injectGain: 1.6,        // [particles] voda se rozjede tolikrát rychleji než particly, které ji rozhýbaly
  injectMax: 1.2,         // [particles] měkký strop rychlosti vody z particlů (výšky obrazovky/s)
  splatForce: 6000,       // [pavel] síla tahu (Pavel 6000): posun kurzoru za snímek × tohle = přidaný proud
  pavelCurve: 0.5,        // [pavel] odezva na rychlost myši: 1 = lineární (jako Pavel), menší = pomalý tah silnější, rychlý slabší
  pavelMaxSpeed: 2.5,     // [pavel] strop (výšky obrazovky/s): rychlejší švih už skoro nesílí -> nerozvíří všechno
  pavelRadius: 0.25,      // [pavel] poloměr stopy (Pavel SPLAT_RADIUS 0.25 = rozptyl 0.0025 obrazovky²)
  dyeResolution: 512,     // [pavel] rozlišení barviva pro náhled "2D voda" (Pavel 1024; počítá se jen když je náhled zapnutý)
  dyeFade: 1,             // [pavel] mizení barviva náhledu za s (Pavel DENSITY_DISSIPATION 1)
  resolution: 128,        // výška mřížky tekutiny (šířka podle poměru stran)
  splatRadius: 0.022,     // poloměr stopy myši (podíl výšky obrazovky)
  splatHardness: 2.5,     // ostrost okraje stopy (1 = měkký gauss, víc = plochý střed a ostrá hrana -> ostřejší vlna)
  wakeRadius: 0.06,       // šířka brázdy (podíl výšky obrazovky): širší měkký proud kolem stopy -> za kurzorem se po stranách stočí víry
  wake: 0.35,             // síla brázdy (0 = jen úzká stopa bez vírů, 1 = celá brázda má rychlost kurzoru)
  strength: 1.0,          // celková síla vody na particly (proud i vlny) – hlavní "hlasitost" myši
  force: 1.0,             // 1 = proud v centru stopy má rychlost kurzoru (jen úzká stopa přímo pod kurzorem)
  speedCurve: 0.5,        // odezva na rychlost myši: 1 = lineární, menší = pomalý tah silnější a rychlý slabší
  maxSpeed: 1.0,          // strop rychlosti tahu (výšky obrazovky za s) – rychlý švih nad tím už nesílí
  curl: 8,                // víření (moc = spletitý "plyn", málo = klidná voda)
  trailFade: 1.2,         // mizení stopy za s (proud posouvá particly jen ve stopě; menší = stopa i posun vydrží déle)
  dissipation: 0.35,      // útlum proudu za s (menší = delší dojezd)
  pressureIterations: 24, // víc = čistší, soudržnější proud
  maxFlow: 3,             // strop rychlosti proudu (výšky obrazovky/s) – pojistka proti rozjetí simulace do celé plochy
  coupling: 0.14,         // jak rychle se particl přizpůsobí proudu (za snímek; menší = těžší, líná voda)
  friction: 0.965,        // útlum vlastní rychlosti particlu za snímek (větší = delší klouzání)
  frontShell: 0.12,       // tloušťka přední vrstvy particlů, kterou proud unáší (world)
  frontRes: 128,          // výška mapy nejbližších particlů
  frontPointSize: 4,      // velikost particlu v mapě (buňky) – větší = méně prosvítání zadních
  waveHeight: 3,          // výška vlny z tahu (0 = bez vln)
  waveGrowth: 0,          // růst výšky vlny s rychlostí myši (0 = stejná vlna pro každou rychlost, 1 = lineárně)
  // rychlost vln se řídí myší: vždy waveSpeedRatio× rychlejší než tah -> zdroj nikdy nedožene vlastní vlnu
  // (jinak "nadzvukový třesk": energie se hromadí a vlna odfoukne půl obrazovky)
  waveSpeedMin: 0.2,      // nejpomalejší vlna (výšky obrazovky/s) – pomalý tah = pomalé vlny
  waveSpeedRatio: 1.4,    // rychlost vlny = tolikrát rychlost myši
  waveSpeedMax: 6,        // strop rychlosti vln (výšky obrazovky/s)
  waveSpeedHold: 1.2,     // s, jak dlouho vlny drží rychlost po zpomalení myši
  waveReach: 0.12,        // dosah vln (výšky obrazovky) – útlum podle vzdálenosti, stejný pro pomalé i rychlé vlny
  waveDrift: 0.015,       // rozrážení: jak daleko vlna particly odsune od tahu ven (pak je vrátí pružina)
  waveForce: 6,           // jak silně vlna tlačí particly (od tahu ven)
  idleSleep: 5,           // s bez pohybu myši -> simulace se uspí (nejdřív až proud dozní)
};

// --- Skutečná rychlost kurzoru ---
// Z pointer událostí, ne ze snímků: časová razítka událostí + všechny vzorky myši (getCoalescedEvents –
// myš posílá 125–1000 Hz, snímek vidí jen poslední pozici). Rychlost ze snímků skákala 0 / 2× (jiná frekvence
// myši a obrazovky) a při nízkých FPS byla nadsazená (dt oříznuté na 1/30 s).
// Jednotky: CSS px jsou čtvercové (x i y stejně -> poměr stran nehraje roli) a jsou to úhlové jednotky – prohlížeč
// je přes devicePixelRatio (škálování Windows, retina) drží na ~0.2–0.26 mm na desktopu (27" 1440p 100 % 0.23 mm,
// 15" 1080p 125 % 0.22, 4K 27" 150 % 0.23) a ~0.16 mm na mobilu (Android dp = 1/160"). Skutečné DPI prohlížeč
// neprozradí, tohle je nejlepší odhad -> cm/s na displeji nezávisle na velikosti okna i rozlišení.
// ms – rychlost = dráha za posledních 30 ms (2026-10-05 Oliver: „aktuální rychlost“, ať víření naskočí hned;
// dřív 60 ms). 125 Hz myš = ~4 vzorky, 1000 Hz = 30 – kratší okno by u levných myší skákalo.
const POINTER_WINDOW = 30;
// x, y = poslední pozice kurzoru (clientX/Y), has = už přišla událost
const pointer = { pts: [], mmPerPx: 0.25, x: 0, y: 0, has: false };
if (typeof window !== 'undefined') {
  try { if (window.matchMedia('(pointer: coarse)').matches) pointer.mmPerPx = 0.16; } catch { /* starý prohlížeč */ }
  const reset = () => { pointer.pts.length = 0; };
  window.addEventListener('pointermove', (e) => {
    const list = e.getCoalescedEvents?.();
    // časy převedené na hodiny stránky (performance.now): některé prohlížeče/ochrany soukromí dávají timeStamp
    // v jiném základu (epocha) nebo zaokrouhlený -> porovnání s performance.now by dalo rychlost 0 napořád.
    // Posun = příjem události − její timeStamp; sedí-li základ (|posun| < 1 s), platí přesné časy vzorků.
    const at = performance.now(), off = at - e.timeStamp, ok = Math.abs(off) < 1000;
    for (const ev of (list && list.length ? list : [e])) pointer.pts.push(ev.clientX, ev.clientY, ok ? ev.timeStamp : ev.timeStamp + off);
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = true;
    const old = at - 200;
    let k = 0; while (k < pointer.pts.length - 3 && pointer.pts[k + 2] < old) k += 3;
    if (k) pointer.pts.splice(0, k);
  }, { passive: true, capture: true });
  // vjetí do okna / nový dotyk = skok, ne tah
  window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') reset(); }, { passive: true, capture: true });
  window.addEventListener('pointerout', (e) => { if (!e.relatedTarget) reset(); }, { passive: true });
  window.addEventListener('blur', reset);
}
// rychlost kurzoru v CSS px/s (dráha za posledních POINTER_WINDOW ms); null = žádná čerstvá data
export function pointerSpeedPx(now = performance.now()) {
  const p = pointer.pts, n = p.length / 3;
  const last = p[p.length - 1];
  if (n === 0 || now - last > 500) return n === 0 ? null : 0;
  // okno končí u poslední události, dokud chodí (mezera do dalšího vzorku by rychlost ředila o ~10 %);
  // po zastavení (> 25 ms bez události) končí v „teď“ -> rychlost klesne k 0
  const from = (now - last < 25 ? last : now) - POINTER_WINDOW;
  let len = 0;
  for (let i = 1; i < n; i++) {
    const t = p[i * 3 + 2];
    if (t < from) continue;
    const d = Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]);
    // úsek, který začal před oknem, jen poměrnou částí
    const t0 = p[i * 3 - 1], f = t0 < from ? (t - from) / Math.max(1e-3, t - t0) : 1;
    len += d * f;
  }
  return len / POINTER_WINDOW * 1000;
}
// skutečná rychlost kurzoru na displeji (cm/s, odhad viz výše)
export const pointerSpeedCm = (now) => { const px = pointerSpeedPx(now); return px === null ? null : px * pointer.mmPerPx / 10; };

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const HEAD = `uniform vec2 uTexel; varying vec2 vUv;
#define S(t, o) texture2D(t, vUv + (o) * uTexel)
`;

const SPLAT = HEAD + `
uniform sampler2D uVel; uniform vec2 uA; uniform vec2 uB; uniform vec2 uForce; uniform float uRadius; uniform float uAspect; uniform float uHardness;
uniform float uWakeRadius; uniform float uWake;
void main(){
  // stopa = úsečka od minulé pozice kurzoru (bez děr při rychlém tahu)
  vec2 pa = vUv - uA, ba = uB - uA; pa.x *= uAspect; ba.x *= uAspect;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-10), 0.0, 1.0);
  vec2 d = pa - ba * h;
  float w = exp(-pow(dot(d, d) / (uRadius * uRadius), uHardness));
  // brázda: širší měkký proud kolem stopy. Tlak ho po stranách obrací zpátky -> vír na každé straně za kurzorem
  // (jako lžička protažená vodou). V úzké stopě by se víry rozmazaly o pár buněk mřížky.
  float wk = exp(-dot(d, d) / (uWakeRadius * uWakeRadius));
  vec4 v = texture2D(uVel, vUv);
  // xy: prst ve vodě -> proud má rychlost kurzoru; z: stopa = "barvivo" (screen blend, max 1).
  // Barvivo proud unáší (advekce) -> stočí se do vírů a particly v něm proud cítí.
  gl_FragColor = vec4(v.xy + (uForce - v.xy) * max(w, uWake * wk), 1.0 - (1.0 - v.z) * (1.0 - max(w, wk)), 1.0);
}`;

// Pavlův splat: gauss kolem bodu, přičte se (proud i barvivo). Pro proud z = stopa pro particly (screen blend, max 1).
const SPLAT_ADD = HEAD + `
uniform sampler2D uTarget; uniform vec2 uPoint; uniform vec3 uColor; uniform float uRadius; uniform float uAspect; uniform float uMask;
void main(){
  vec2 p = vUv - uPoint; p.x *= uAspect;
  float g = exp(-dot(p, p) / uRadius);
  vec4 b = texture2D(uTarget, vUv);
  vec3 add = b.xyz + g * uColor;
  if (uMask > 0.5) add.z = 1.0 - (1.0 - b.z) * (1.0 - g);
  gl_FragColor = vec4(add, b.w); // w = zóna víření (pole strčení), nepřepisovat
}`;

// [particles] pole strčení: xyz (proud + stopa) mizí za pushFade, w = zóna víření za zoneFade
const PUSH_FADE = HEAD + `
uniform sampler2D uSrc; uniform float uFade; uniform float uZoneFade;
void main(){ vec4 c = texture2D(uSrc, vUv); gl_FragColor = vec4(c.xyz * uFade, c.w * uZoneFade); }`;

// [particles] zóna víření: úsečka dráhy kurzoru za snímek (bez děr při rychlém tahu), hodnota = síla víření
// podle rychlosti myši; MAX -> opakované tahy zónu nepřesytí, jen obnoví
const ZONE = HEAD + `
uniform sampler2D uSrc; uniform vec2 uA; uniform vec2 uB; uniform float uRadius; uniform float uAspect; uniform float uLevel;
void main(){
  vec4 c = texture2D(uSrc, vUv);
  vec2 pa = vUv - uA, ba = uB - uA; pa.x *= uAspect; ba.x *= uAspect;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-10), 0.0, 1.0);
  vec2 d = pa - ba * h;
  float g = exp(-dot(d, d) / (uRadius * uRadius));
  gl_FragColor = vec4(c.xyz, max(c.w, g * uLevel));
}`;

// [particles] barvivo náhledu z vody, kterou tvoří particly (ne z kurzoru) -> náhled ukazuje skutečnou vodu
const DYE_INJECT = HEAD + `
uniform sampler2D uSrc; uniform sampler2D uInj; uniform sampler2D uZone; uniform vec3 uColor; uniform float uCover; uniform float uAmount;
void main(){
  vec3 j = texture2D(uInj, vUv).xyz;
  float cov = min(1.0, j.z * uCover) * texture2D(uZone, vUv).w;
  gl_FragColor = vec4(texture2D(uSrc, vUv).rgb + uColor * cov * uAmount, 1.0);
}`;

// Advekce barviva (jiné rozlišení než proud) – jako Pavel: výsledek / (1 + útlum·dt)
const ADVECT_DYE = HEAD + `
uniform sampler2D uVel; uniform sampler2D uSrc; uniform vec2 uVelTexel; uniform float uDt; uniform float uDissipation;
void main(){
  vec2 coord = vUv - uDt * texture2D(uVel, vUv).xy * uVelTexel;
  gl_FragColor = vec4(texture2D(uSrc, coord).rgb / (1.0 + uDissipation * uDt), 1.0);
}`;

// [particles] proud v buňce se přizpůsobí průměrné rychlosti strčených particlů (inj: xy = Σ rychlost·váha, z = Σ váha)
const INJECT = HEAD + `
uniform sampler2D uVel; uniform sampler2D uInj; uniform sampler2D uZone; uniform float uStrength; uniform float uCover; uniform float uGain; uniform float uMax;
void main(){
  vec4 v = texture2D(uVel, vUv);
  vec3 j = texture2D(uInj, vUv).xyz;
  if (j.z > 1e-4) {
    // jen v zóně víření kolem dráhy myši -> voda nese particly i dál, ale novou vodu tvoří jen u myši
    float cov = min(1.0, j.z * uCover) * texture2D(uZone, vUv).w;
    // měkký strop rychlosti: rychlý tah udělá hodně vody na místě, ne proud, který odletí přes celou obrazovku
    vec2 t = j.xy / j.z * uGain; float tl = length(t);
    t *= uMax * (1.0 - 2.0 / (exp(2.0 * min(tl / uMax, 10.0)) + 1.0)) / max(tl, 1e-4); // tanh
    v.xy += (t - v.xy) * cov * uStrength;
    v.z = 1.0 - (1.0 - v.z) * (1.0 - cov); // stopa: proud působí na particly jen ve stopě (utils.js)
  }
  gl_FragColor = v;
}`;

const CURL = HEAD + `
uniform sampler2D uVel;
void main(){
  float L = S(uVel, vec2(-1, 0)).y, R = S(uVel, vec2(1, 0)).y, T = S(uVel, vec2(0, 1)).x, B = S(uVel, vec2(0, -1)).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = HEAD + `
uniform sampler2D uVel; uniform sampler2D uCurl; uniform float uCurlStrength; uniform float uDt;
void main(){
  float L = S(uCurl, vec2(-1, 0)).x, R = S(uCurl, vec2(1, 0)).x, T = S(uCurl, vec2(0, 1)).x, B = S(uCurl, vec2(0, -1)).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= uCurlStrength * C; f.y *= -1.0;
  vec4 v = texture2D(uVel, vUv);
  gl_FragColor = vec4(v.xy + f * uDt, v.z, 1.0);
}`;

const DIVERGENCE = HEAD + `
uniform sampler2D uVel;
void main(){
  float L = S(uVel, vec2(-1, 0)).x, R = S(uVel, vec2(1, 0)).x, T = S(uVel, vec2(0, 1)).y, B = S(uVel, vec2(0, -1)).y;
  // stěny na okrajích obrazovky (jako Pavel): za okrajem proud odrazí -> tlak nepustí proud ven ani celou vodu
  // do jednoho směru. Bez toho (clamp) zůstala hybnost tahů v celé ploše jako "gravitace" na jednu stranu.
  vec2 C = texture2D(uVel, vUv).xy;
  if (vUv.x - uTexel.x < 0.0) L = -C.x;
  if (vUv.x + uTexel.x > 1.0) R = -C.x;
  if (vUv.y + uTexel.y > 1.0) T = -C.y;
  if (vUv.y - uTexel.y < 0.0) B = -C.y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const SCALE = HEAD + `
uniform sampler2D uSrc; uniform float uValue;
void main(){ gl_FragColor = texture2D(uSrc, vUv) * uValue; }`;

const PRESSURE = HEAD + `
uniform sampler2D uP; uniform sampler2D uDiv;
void main(){
  float L = S(uP, vec2(-1, 0)).x, R = S(uP, vec2(1, 0)).x, T = S(uP, vec2(0, 1)).x, B = S(uP, vec2(0, -1)).x;
  gl_FragColor = vec4((L + R + T + B - texture2D(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = HEAD + `
uniform sampler2D uP; uniform sampler2D uVel;
void main(){
  float L = S(uP, vec2(-1, 0)).x, R = S(uP, vec2(1, 0)).x, T = S(uP, vec2(0, 1)).x, B = S(uP, vec2(0, -1)).x;
  vec4 v = texture2D(uVel, vUv);
  gl_FragColor = vec4(v.xy - 0.5 * vec2(R - L, T - B), v.z, 1.0);
}`;

const ADVECT = HEAD + `
uniform sampler2D uVel; uniform float uDt; uniform float uDissipation; uniform float uTrailFade; uniform float uMaxFlow;
void main(){
  vec2 coord = vUv - uDt * texture2D(uVel, vUv).xy * uTexel;
  vec4 v = texture2D(uVel, coord);
  vec2 f = v.xy / (1.0 + uDissipation * uDt);
  f *= min(1.0, uMaxFlow / max(length(f), 1e-4)); // strop: jinak se vzácně rozjel proud přes celou plochu (1000+ buněk/s)
  gl_FragColor = vec4(f, v.z * exp(-uTrailFade * uDt), 1.0);
}`;

// Vlny na hladině (rovnice vln na výškové mapě, jako ripple/brázda za lodí v hrách): tah myši je jako loď (před sebou zvedne vodu, za sebou důlek),
// ten se pak rozbíhá kolmo od tahu ven -> postupné rozrážení. r = výška teď, g = výška minulý krok.
// Particly dostávají zrychlení -grad(výška) (hybnost mělké vody): vlna je postupně odtlačí ven a zase vrátí.
const WAVE = HEAD + `
uniform sampler2D uWave; uniform vec2 uA; uniform vec2 uB; uniform float uRadius; uniform float uAspect;
uniform float uPush; uniform float uC2; uniform float uDamp; uniform float uLeak;
uniform sampler2D uInj; uniform sampler2D uZone; uniform float uInjPush; uniform float uInjCover;
// [particles] průměrná rychlost strčených particlů × pokrytí buňky × zóna víření
vec2 iv(vec2 o){ vec3 j = S(uInj, o).xyz; return j.z > 1e-4 ? j.xy / j.z * min(1.0, j.z * uInjCover) * S(uZone, o).w : vec2(0.0); }
void main(){
  vec4 c = texture2D(uWave, vUv);
  float L = S(uWave, vec2(-1, 0)).r, R = S(uWave, vec2(1, 0)).r, T = S(uWave, vec2(0, 1)).r, B = S(uWave, vec2(0, -1)).r;
  // útlum jen rychlosti hladiny (h - předchozí), jinak by se celá plocha houpala
  float h = c.r + (c.r - c.g) * uDamp + uC2 * (L + R + T + B - 4.0 * c.r);
  h *= uLeak; // stojící hrbol (zbytek po tahu) pomalu splaskne
  // tah myši = pohybující se předmět ve vodě (jako loď): vodu před sebou zvedne, za sebou nechá důlek
  // (stopa teď - stopa minule) -> čistá příďová vlna bez přidané vody
  vec2 pb = vUv - uB, pa = vUv - uA; pb.x *= uAspect; pa.x *= uAspect;
  float r2 = uRadius * uRadius;
  h += uPush * (exp(-dot(pb, pb) / r2) - exp(-dot(pa, pa) / r2));
  // [particles] pohybující se particly jako loď: kde se jejich proud sbíhá (před nimi), voda se zvedne, za nimi klesne
  if (uInjPush > 0.0) h -= uInjPush * 0.5 * (iv(vec2(1, 0)).x - iv(vec2(-1, 0)).x + iv(vec2(0, 1)).y - iv(vec2(0, -1)).y);
  // okraje obrazovky pohlcují (vlna se neodráží zpátky)
  vec2 e = min(vUv, 1.0 - vUv);
  h *= mix(0.85, 1.0, smoothstep(0.0, 0.05, min(e.x, e.y)));
  gl_FragColor = vec4(h, c.r, 0.0, 1.0);
}`;

// Náhled vody na obrazovce (slider "2D voda" vedle AI živého renderu).
// pavel: barvivo jako PavelDoGreat (barva tahu + stínování z gradientu jasu, krytí = jas).
// brush: barva = směr proudu, jas = rychlost, krytí = stopa přesně tak, jak ji cítí particly (smoothstep jako v utils.js).
const VIEW = HEAD + `
uniform sampler2D uVel; uniform sampler2D uDye; uniform float uUseDye; uniform vec2 uDyeTexel; uniform float uOpacity; uniform float uSpeedNorm;
vec3 hue(float h){ return clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
void main(){
  if (uUseDye > 0.5) {
    vec3 c = texture2D(uDye, vUv).rgb;
    float dx = length(texture2D(uDye, vUv + vec2(uDyeTexel.x, 0.0)).rgb) - length(texture2D(uDye, vUv - vec2(uDyeTexel.x, 0.0)).rgb);
    float dy = length(texture2D(uDye, vUv + vec2(0.0, uDyeTexel.y)).rgb) - length(texture2D(uDye, vUv - vec2(0.0, uDyeTexel.y)).rgb);
    vec3 n = normalize(vec3(dx, dy, length(uDyeTexel)));
    c *= clamp(n.z + 0.7, 0.7, 1.0);
    float a = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c / max(a, 1e-4), clamp(a, 0.0, 1.0) * uOpacity); // barva bez ztmavení, jas -> krytí
    return;
  }
  vec4 v = texture2D(uVel, vUv);
  float sp = length(v.xy) * uSpeedNorm;
  float a = smoothstep(0.1, 0.7, v.z);
  vec3 col = hue(atan(v.y, v.x) / 6.2831853 + 0.5) * (0.25 + 0.75 * clamp(sp, 0.0, 1.0));
  gl_FragColor = vec4(col, a * uOpacity);
}`;

function makeTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
  });
}

class Fluid {
  constructor(gl) {
    this.gl = gl;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fs, uniforms: { uTexel: { value: new THREE.Vector2() }, ...u }, depthTest: false, depthWrite: false });
    this.m = {
      splat: mk(SPLAT, { uVel: { value: null }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uForce: { value: new THREE.Vector2() }, uRadius: { value: 0.04 }, uAspect: { value: 1 }, uHardness: { value: 1 }, uWakeRadius: { value: 0.06 }, uWake: { value: 0 } }),
      curl: mk(CURL, { uVel: { value: null } }),
      vorticity: mk(VORTICITY, { uVel: { value: null }, uCurl: { value: null }, uCurlStrength: { value: 0 }, uDt: { value: 0 } }),
      divergence: mk(DIVERGENCE, { uVel: { value: null } }),
      scale: mk(SCALE, { uSrc: { value: null }, uValue: { value: 0 } }),
      pressure: mk(PRESSURE, { uP: { value: null }, uDiv: { value: null } }),
      gradient: mk(GRADIENT, { uP: { value: null }, uVel: { value: null } }),
      advect: mk(ADVECT, { uVel: { value: null }, uDt: { value: 0 }, uDissipation: { value: 0 }, uTrailFade: { value: 0 }, uMaxFlow: { value: 384 } }),
      view: mk(VIEW, { uVel: { value: null }, uDye: { value: null }, uUseDye: { value: 0 }, uDyeTexel: { value: new THREE.Vector2() }, uOpacity: { value: 0 }, uSpeedNorm: { value: 0.01 } }),
      splatAdd: mk(SPLAT_ADD, { uTarget: { value: null }, uPoint: { value: new THREE.Vector2() }, uColor: { value: new THREE.Vector3() }, uRadius: { value: 0.0025 }, uAspect: { value: 1 }, uMask: { value: 0 } }),
      advectDye: mk(ADVECT_DYE, { uVel: { value: null }, uSrc: { value: null }, uVelTexel: { value: new THREE.Vector2() }, uDt: { value: 0 }, uDissipation: { value: 1 } }),
      wave: mk(WAVE, { uWave: { value: null }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uRadius: { value: 0.03 }, uAspect: { value: 1 }, uPush: { value: 0 }, uC2: { value: 0.4 }, uDamp: { value: 0.99 }, uLeak: { value: 1 },
        uInj: { value: null }, uZone: { value: null }, uInjPush: { value: 0 }, uInjCover: { value: 0.5 } }),
      inject: mk(INJECT, { uVel: { value: null }, uInj: { value: null }, uZone: { value: null }, uStrength: { value: 0.9 }, uCover: { value: 0.5 }, uGain: { value: 1 }, uMax: { value: 150 } }),
      pushFade: mk(PUSH_FADE, { uSrc: { value: null }, uFade: { value: 1 }, uZoneFade: { value: 1 } }),
      zone: mk(ZONE, { uSrc: { value: null }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uRadius: { value: 0.1 }, uAspect: { value: 1 }, uLevel: { value: 0 } }),
      dyeInject: mk(DYE_INJECT, { uSrc: { value: null }, uInj: { value: null }, uZone: { value: null }, uColor: { value: new THREE.Vector3() }, uCover: { value: 0.5 }, uAmount: { value: 0 } }),
    };
    this.w = 0; this.h = 0;
    this.prev = new THREE.Vector2(NaN, NaN);
    this.lastMove = -1e9;
    this.active = false;
    this.frameDone = false;
    this.texel = new THREE.Vector2();
    this.velocity = null;
    this.wave = null;
    this.push = null;          // [particles] strčení myší (jen pro particly)
    this.injectTarget = null;  // [particles] sem particle systémy kreslí svou rychlost (aditivně), spotřebuje další update
    const reset = () => this.prev.set(NaN, NaN);
    window.addEventListener('blur', reset);
    window.addEventListener('focus', reset);
  }

  // Barvivo pro náhled (jen pavel + zapnutý náhled): vlastní rozlišení, texel se nastavuje zvlášť.
  ensureDye(w, h) {
    if (this.dye && this.dye[0].width === w && this.dye[0].height === h) return;
    this.dye?.forEach((t) => t.dispose());
    this.dye = [makeTarget(w, h), makeTarget(w, h)];
    this.dyeTexel = new THREE.Vector2(1 / w, 1 / h);
    const gl = this.gl, prev = gl.getRenderTarget(), col = gl.getClearColor(new THREE.Color()), a = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    this.dye.forEach((t) => { gl.setRenderTarget(t); gl.clear(true, false, false); });
    gl.setClearColor(col, a); gl.setRenderTarget(prev);
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.dispose();
    this.w = w; this.h = h;
    this.texel.set(1 / w, 1 / h);
    this.vel = [makeTarget(w, h), makeTarget(w, h)];
    this.p = [makeTarget(w, h), makeTarget(w, h)];
    this.div = makeTarget(w, h);
    this.curlRT = makeTarget(w, h);
    this.waveRT = [makeTarget(w, h), makeTarget(w, h)];
    this.pushRT = [makeTarget(w, h), makeTarget(w, h)];
    this.injRT = makeTarget(w, h);
    Object.values(this.m).forEach((m) => m.uniforms.uTexel.value.copy(this.texel));
    this.clear();
  }

  clear() {
    const gl = this.gl, prev = gl.getRenderTarget();
    const col = gl.getClearColor(new THREE.Color()), a = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    [...this.vel, ...this.p, ...this.waveRT, ...this.pushRT, this.injRT].forEach((t) => { gl.setRenderTarget(t); gl.clear(true, false, false); });
    gl.setClearColor(col, a);
    gl.setRenderTarget(prev);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.scene, this.cam);
  }

  swapVel() { this.vel.reverse(); }

  // Jednou za snímek (volá ho první particle systém, další snímek už mají hotový).
  update(state, delta, cfg) {
    if (this.frameDone) return;
    this.frameDone = true;
    queueMicrotask(() => { this.frameDone = false; });

    const { width, height } = state.size;
    const H = Math.max(16, Math.round(cfg.resolution));
    this.resize(Math.max(16, Math.round(H * width / height)), H);

    const now = performance.now() / 1000;
    const dt = Math.min(Math.max(delta, 1 / 240), 1 / 30);
    // pozice kurzoru přímo z pointer událostí okna (clientX/Y vůči canvasu), ne z R3F state.pointer:
    // R3F ji počítá z offsetX vůči prvku pod kurzorem – když si myš zachytí jiný prvek (DIV), stála
    // state.pointer na místě, voda neviděla pohyb a víření nikdy nenaskočilo (Oliver 2026-10-05: „funguje jen
    // nad televizí“; záznam: 3800 událostí, state.pointer pořád 0.345/-0.978). Rect jen při změně velikosti.
    let pu, pv;
    if (pointer.has) {
      const el = this.gl.domElement;
      if (!this.rect || this.rectW !== width || this.rectH !== height) { this.rect = el.getBoundingClientRect(); this.rectW = width; this.rectH = height; }
      pu = (pointer.x - this.rect.left) / Math.max(1, this.rect.width);
      pv = 1 - (pointer.y - this.rect.top) / Math.max(1, this.rect.height);
    } else { pu = state.pointer.x * 0.5 + 0.5; pv = state.pointer.y * 0.5 + 0.5; }
    // skok kurzoru (vjetí do okna odjinud, dotyk jinde) není tah -> jen přesun bez vln a proudu
    if (Math.hypot((pu - this.prev.x) * width / height, pv - this.prev.y) > Math.max(0.25, 20 * dt)) this.prev.set(NaN, NaN);
    const moved = Number.isFinite(this.prev.x) && (pu !== this.prev.x || pv !== this.prev.y);
    if (moved) {
      if (!this.active) { this.clear(); this.active = true; this.speed = 0; this.waveC = 0; this.waveAcc = 0; this.waveSrc?.set(this.prev.x, this.prev.y); }
      this.lastMove = now;
    }
    // uspat až když proud skoro dozněl (95 %), jinak by dojezd uťal
    const sleepAfter = cfg.source === 'particles'
      ? Math.max(1, (cfg.afterglow ?? 2) + 3 / Math.max(0.05, Math.min(cfg.dissipation + (cfg.calm ?? 3), cfg.trailFade)))
      : Math.max(cfg.idleSleep, 3 / Math.max(0.05, Math.min(cfg.dissipation, cfg.trailFade)));
    if (this.active && now - this.lastMove > sleepAfter) this.active = false;
    if (!this.active) { this.prev.set(pu, pv); this.velocity = null; this.wave = null; this.push = null; this.injectTarget = null; return; }
    const fromParticles = cfg.source === 'particles';

    const gl = this.gl, prevTarget = gl.getRenderTarget(), prevAutoClear = gl.autoClear;
    gl.autoClear = false;
    const m = this.m;

    // rychlost tahu (výšky obrazovky/s): ze skutečných pointer událostí (pointerSpeedPx, dráha za 30 ms);
    // bez nich (syntetický pointer) ze snímků, vyhlazená ~50 ms – myš posílá pozice jinou frekvencí než snímky
    const aspect = width / height;
    const rawSp = moved ? Math.hypot((pu - this.prev.x) * aspect, pv - this.prev.y) / dt : 0;
    const evPx = pointerSpeedPx(now * 1000);
    // záloha ze snímků (vždy, levné); pointer události platí, jen když dávají smysl – kurzor se hýbe a události
    // hlásí 0 (rozbité časy) = použij snímky
    this.frameSpeed = (this.frameSpeed ?? 0) + (rawSp - (this.frameSpeed ?? 0)) * (1 - Math.exp(-dt / 0.03));
    const evOk = evPx !== null && !(moved && evPx < 1 && this.frameSpeed > 0.05);
    this.speedSrc = evOk ? 'events' : 'frames';
    this.speed = evOk ? evPx / height : this.frameSpeed;
    // skutečná rychlost kurzoru na displeji (cm/s) – prahy víření (CSS px × mm/px)
    this.speedCm = this.speed * height * pointer.mmPerPx / 10;
    const sp = Math.max(this.speed, 1e-4);
    // [particles] síla víření podle skutečné rychlosti (měkký práh stirSpeed..stirFull, cm/s); obálka drží
    // nejvyšší úroveň a po tahu lineárně klesá k 0 za afterglow s (doznění)
    const s0 = cfg.stirSpeed ?? 0, s1 = Math.max(s0 + 0.1, cfg.stirFull ?? s0 + 0.1);
    const st = Math.min(1, Math.max(0, (this.speedCm - s0) / (s1 - s0)));
    this.stirLevel = moved ? st * st * (3 - 2 * st) : 0;
    const after = Math.max(0.01, cfg.afterglow ?? 2);
    this.stirEnv = Math.max(this.stirLevel, (this.stirEnv ?? 0) - dt / after);
    if (this.lastStir === undefined) this.lastStir = -1e9;
    if (this.stirLevel > 0.01) this.lastStir = now;
    const sinceStir = now - this.lastStir;
    // křivka odezvy: sqrt-ish + měkký strop -> out = výsledná rychlost proudu (výšky obrazovky/s)
    const cap = Math.max(0.1, cfg.maxSpeed);
    const out = cap * Math.tanh(Math.pow(sp, Math.max(0.1, cfg.speedCurve)) / cap);
    const k = Math.min(4, out / sp);
    this.speedGain = k;

    // rychlost vln podle myši: nahoru hned, dolů pomalu (vypuštěné vlny nezastaví)
    const cTarget = Math.min(cfg.waveSpeedMax, Math.max(cfg.waveSpeedMin, cfg.waveSpeedRatio * this.speed));
    this.waveC = cTarget > (this.waveC ?? 0) ? cTarget : this.waveC + (cTarget - this.waveC) * (1 - Math.exp(-dt / Math.max(0.05, cfg.waveSpeedHold)));
    // kroky vln: každý krok posune vlnu přesně o 0.5 buňky (c² = 0.25, stabilní) -> počet kroků za snímek podle času.
    // Stejná délka kroku je nutná: střídání délek (1 / 2 kroky za snímek) hladinu rozhoupe až do výbuchu.
    const CSTEP = 0.5;
    this.waveAcc = (this.waveAcc ?? 0) + this.waveC * this.h * dt / CSTEP;
    const steps = Math.min(24, Math.floor(this.waveAcc));
    this.waveAcc = Math.min(1, this.waveAcc - steps);
    this.waveCStep = CSTEP;
    this.waveCEff = this.waveC;

    // výška vlny: rychlost vln roste s myší -> vlna je už sama vyrovnaná, jen mírný růst (1 výška obrazovky/s = waveHeight)
    const wavePush = fromParticles ? 0 : cfg.waveHeight * Math.min(3, Math.pow(sp, Math.max(0, cfg.waveGrowth)));
    const wu = m.wave.uniforms;
    // zdroj = posun stopy od posledního kroku vln (při pomalých vlnách nemusí být krok v každém snímku)
    if (!this.waveSrc) this.waveSrc = new THREE.Vector2(pu, pv);
    if (!Number.isFinite(this.prev.x)) this.waveSrc.set(pu, pv); // po skoku kurzoru bez vlny
    const srcMoved = this.waveSrc.x !== pu || this.waveSrc.y !== pv;
    wu.uA.value.copy(this.waveSrc); wu.uB.value.set(pu, pv);
    wu.uRadius.value = cfg.splatRadius * 1.5;
    wu.uAspect.value = aspect;
    wu.uC2.value = CSTEP * CSTEP;
    // útlum za krok: vlna ztratí ~2/3 na dráze waveReach (krok = 0.5 buňky dráhy -> nezávisí na rychlosti vln)
    wu.uDamp.value = Math.exp(-CSTEP / (Math.max(0.02, cfg.waveReach) * this.h));
    wu.uLeak.value = Math.exp(-0.8 * CSTEP / (Math.max(0.05, this.waveC) * this.h));
    wu.uInj.value = this.injRT.texture;
    wu.uZone.value = this.pushRT[0].texture;
    wu.uInjCover.value = cfg.injectCover;
    for (let i = 0; i < steps; i++) {
      wu.uPush.value = i === 0 && srcMoved ? wavePush : 0;
      // [particles] vlny z pohybu particlů: přírůstek ∝ sbíhání proudu × čas (stejný tvar jako posun stopy myši / poloměr)
      wu.uInjPush.value = fromParticles && i === 0 ? cfg.waveHeight * cfg.injectWave * dt * this.stirEnv ** 2 : 0;
      wu.uWave.value = this.waveRT[0].texture;
      this.pass(m.wave, this.waveRT[1]); this.waveRT.reverse();
    }
    if (steps > 0) this.waveSrc.set(pu, pv);
    this.wave = this.waveRT[0].texture;

    const pavel = cfg.mode !== 'brush';
    // barvivo jen když se náhled kreslí (drawView v posledních 0.5 s) – particly ho nepotřebují
    const dyeOn = pavel && now - (this.viewAt ?? -1e9) < 0.5;
    if (dyeOn) {
      const dh = Math.max(64, Math.round(cfg.dyeResolution));
      this.ensureDye(Math.max(64, Math.round(dh * aspect)), dh);
    }
    if (fromParticles) {
      // strčení myší rychle mizí (cítí ho jen particly; dál je nese voda, kterou sami rozpohybují); zóna víření pomaleji
      const pf = m.pushFade.uniforms;
      pf.uSrc.value = this.pushRT[0].texture; pf.uFade.value = Math.exp(-dt / Math.max(0.01, cfg.pushFade));
      pf.uZoneFade.value = Math.exp(-dt / Math.max(0.01, cfg.zoneFade ?? 0.45));
      this.pass(m.pushFade, this.pushRT[1]); this.pushRT.reverse();
      // zóna víření podél dráhy kurzoru (síla podle skutečné rychlosti)
      if (moved && this.stirLevel > 0.001) {
        const zu = m.zone.uniforms;
        zu.uSrc.value = this.pushRT[0].texture;
        zu.uA.value.copy(this.prev); zu.uB.value.set(pu, pv);
        zu.uRadius.value = Math.max(0.005, cfg.zoneRadius ?? 0.09); zu.uAspect.value = aspect; zu.uLevel.value = this.stirLevel;
        this.pass(m.zone, this.pushRT[1]); this.pushRT.reverse();
      }
      // rychlost strčených particlů z minulého snímku -> proud (pak běží tlak, víření, advekce jako dřív)
      const iu = m.inject.uniforms;
      iu.uVel.value = this.vel[0].texture; iu.uInj.value = this.injRT.texture; iu.uZone.value = this.pushRT[0].texture;
      // doznění: po afterglow s od posledního víření particly vodu netvoří (žádné samovolné víření)
      this.injectEnv = this.stirEnv * this.stirEnv;
      iu.uStrength.value = Math.min(1, Math.max(0, cfg.inject)) * this.injectEnv; iu.uCover.value = cfg.injectCover;
      iu.uGain.value = Math.max(0, cfg.injectGain ?? 1);
      iu.uMax.value = Math.max(0.05, cfg.injectMax ?? 1.2) * this.h;
      this.pass(m.inject, this.vel[1]); this.swapVel();
      if (dyeOn) {
        // náhled: barvivo tam, kde particly vodu opravdu tvoří (barva jako Pavel: náhodný odstín, mění se ~10× za s)
        this.colorT = (this.colorT ?? 1) + dt * 10;
        if (this.colorT >= 1 || !this.dyeColor) { this.colorT %= 1; this.dyeColor = new THREE.Color().setHSL(Math.random(), 1, 0.5).multiplyScalar(0.15); }
        const du = m.dyeInject.uniforms;
        du.uSrc.value = this.dye[0].texture; du.uInj.value = this.injRT.texture; du.uZone.value = this.pushRT[0].texture;
        du.uColor.value.set(this.dyeColor.r, this.dyeColor.g, this.dyeColor.b);
        du.uCover.value = cfg.injectCover; du.uAmount.value = 30 * dt * this.injectEnv;
        du.uTexel.value.copy(this.dyeTexel);
        this.pass(m.dyeInject, this.dye[1]); this.dye.reverse();
      }
    }
    if (moved && pavel) {
      // Pavel: splat v aktuálním bodě, proud += posun kurzoru × splatForce (posun y / poměr stran jako u Pavla)
      const sa = m.splatAdd.uniforms;
      // křivka odezvy jako u štětce (vlastní hodnoty): síla ~ cap·tanh(rychlost^křivka / cap) místo lineární
      const pcap = Math.max(0.1, cfg.pavelMaxSpeed);
      // zesílení z vyhlazené rychlosti, ale ne větší než podle okamžité: na začátku tahu je vyhlazená ~0
      // -> zesílení (∝ rychlost^-0.5) by vyletělo až na strop a první směrový signál by odfoukl všechno
      // (s rychlostí z pointer událostí ten problém není – je hned přesná)
      const gs = evOk ? sp : Math.max(sp, rawSp);
      const pk = Math.min(6, pcap * Math.tanh(Math.pow(gs, Math.max(0.1, cfg.pavelCurve)) / pcap) / gs);
      let dx = (pu - this.prev.x) * pk, dy = (pv - this.prev.y) * pk;
      if (aspect < 1) dx *= aspect; else dy /= aspect;
      sa.uPoint.value.set(pu, pv);
      sa.uAspect.value = aspect;
      sa.uRadius.value = Math.max(0.01, cfg.pavelRadius) / 100 * Math.max(1, aspect);
      // [particles] tah jde jen do pole strčení (particly), ne do vody
      const tgt = fromParticles ? this.pushRT : this.vel;
      sa.uTarget.value = tgt[0].texture;
      sa.uColor.value.set(dx * cfg.splatForce, dy * cfg.splatForce, 0);
      sa.uMask.value = 1;
      this.pass(m.splatAdd, tgt[1]); tgt.reverse();
      if (dyeOn && !fromParticles) {
        // barva tahu jako Pavel: náhodný odstín ×0.15, mění se ~10× za s
        this.colorT = (this.colorT ?? 1) + dt * 10;
        if (this.colorT >= 1 || !this.dyeColor) { this.colorT %= 1; this.dyeColor = new THREE.Color().setHSL(Math.random(), 1, 0.5).multiplyScalar(0.15); }
        sa.uTarget.value = this.dye[0].texture;
        sa.uColor.value.set(this.dyeColor.r, this.dyeColor.g, this.dyeColor.b);
        sa.uMask.value = 0;
        this.pass(m.splatAdd, this.dye[1]); this.dye.reverse();
      }
    } else if (moved) {
      const s = m.splat.uniforms;
      const tgt = fromParticles ? this.pushRT : this.vel;
      s.uVel.value = tgt[0].texture;
      s.uA.value.copy(this.prev); s.uB.value.set(pu, pv);
      // směr tahu × rychlost z křivky odezvy (buňky mřížky za s; buňka je čtverec -> x * w, y * h)
      s.uForce.value.set((pu - this.prev.x) * this.w, (pv - this.prev.y) * this.h).normalize().multiplyScalar(out * this.h * cfg.force);
      s.uRadius.value = cfg.splatRadius;
      s.uHardness.value = Math.max(0.5, cfg.splatHardness);
      s.uWakeRadius.value = Math.max(cfg.splatRadius, cfg.wakeRadius ?? 0);
      s.uWake.value = Math.max(0, cfg.wake ?? 0);
      s.uAspect.value = width / height;
      this.pass(m.splat, tgt[1]); tgt.reverse();
    }
    this.prev.set(pu, pv);

    m.curl.uniforms.uVel.value = this.vel[0].texture;
    this.pass(m.curl, this.curlRT);

    const v = m.vorticity.uniforms;
    // [particles] po doznění utichne i víření (vorticity confinement by jinak zbytek proudu držel roztočený)
    const calmK = fromParticles ? Math.min(1, Math.max(0, (sinceStir - (cfg.afterglow ?? 2)) / 0.5)) : 0;
    v.uVel.value = this.vel[0].texture; v.uCurl.value = this.curlRT.texture; v.uCurlStrength.value = cfg.curl * (1 - calmK); v.uDt.value = dt;
    this.pass(m.vorticity, this.vel[1]); this.swapVel();

    m.divergence.uniforms.uVel.value = this.vel[0].texture;
    this.pass(m.divergence, this.div);

    m.scale.uniforms.uSrc.value = this.p[0].texture; m.scale.uniforms.uValue.value = 0.8;
    this.pass(m.scale, this.p[1]); this.p.reverse();

    m.pressure.uniforms.uDiv.value = this.div.texture;
    for (let i = 0; i < cfg.pressureIterations; i++) {
      m.pressure.uniforms.uP.value = this.p[0].texture;
      this.pass(m.pressure, this.p[1]); this.p.reverse();
    }

    m.gradient.uniforms.uP.value = this.p[0].texture; m.gradient.uniforms.uVel.value = this.vel[0].texture;
    this.pass(m.gradient, this.vel[1]); this.swapVel();

    const a = m.advect.uniforms;
    a.uVel.value = this.vel[0].texture; a.uDt.value = dt; a.uDissipation.value = cfg.dissipation; a.uTrailFade.value = cfg.trailFade;
    // [particles] po doznění voda rychle utichne
    if (fromParticles) a.uDissipation.value += (cfg.calm ?? 3) * calmK;
    a.uMaxFlow.value = Math.max(0.1, cfg.maxFlow ?? 3) * this.h;
    this.pass(m.advect, this.vel[1]); this.swapVel();

    if (dyeOn) {
      const ad = m.advectDye.uniforms;
      ad.uVel.value = this.vel[0].texture; ad.uSrc.value = this.dye[0].texture; ad.uVelTexel.value.copy(this.texel);
      ad.uDt.value = dt; ad.uDissipation.value = cfg.dyeFade;
      ad.uTexel.value.copy(this.dyeTexel);
      this.pass(m.advectDye, this.dye[1]); this.dye.reverse();
    }
    this.dyeLive = dyeOn;

    gl.autoClear = prevAutoClear;
    gl.setRenderTarget(prevTarget);
    this.velocity = this.vel[0].texture;
    this.push = fromParticles ? this.pushRT[0].texture : null;
    // spotřebováno -> vyčistit, particle systémy do něj po svém výpočtu nakreslí tento snímek
    if (fromParticles) {
      const col = gl.getClearColor(new THREE.Color()), ca = gl.getClearAlpha();
      gl.setClearColor(0x000000, 0);
      gl.setRenderTarget(this.injRT); gl.clear(true, false, false);
      gl.setClearColor(col, ca);
      gl.setRenderTarget(prevTarget);
    }
    this.injectTarget = fromParticles ? this.injRT : null;
  }

  // Nakreslí proud přes hotový snímek (volá FluidView po postprocessingu). Uspaná voda = nic.
  drawView(opacity) {
    this.viewAt = performance.now() / 1000;
    if (!this.velocity || opacity <= 0) return;
    const gl = this.gl, prev = gl.getRenderTarget(), ac = gl.autoClear, mv = this.m.view;
    mv.transparent = true;
    mv.uniforms.uVel.value = this.velocity;
    mv.uniforms.uUseDye.value = this.dyeLive && this.dye ? 1 : 0;
    if (this.dye) { mv.uniforms.uDye.value = this.dye[0].texture; mv.uniforms.uDyeTexel.value.copy(this.dyeTexel); }
    mv.uniforms.uOpacity.value = opacity;
    mv.uniforms.uSpeedNorm.value = 2 / Math.max(1, this.h); // proud 0.5 výšky obrazovky/s = plná barva
    gl.autoClear = false;
    this.pass(mv, null);
    gl.autoClear = ac;
    gl.setRenderTarget(prev);
  }

  dispose() {
    [...(this.vel || []), ...(this.p || []), ...(this.waveRT || []), ...(this.dye || []), ...(this.pushRT || []), this.injRT, this.div, this.curlRT].forEach((t) => t?.dispose());
    this.dye = null;
  }
}

let fluid = null;
// rychlost, kterou voda opravdu použila (pro Editor): cm/s + zdroj ('events' / 'frames'), null = voda spí
export const fluidSpeed = () => (fluid?.velocity ? { cm: fluid.speedCm ?? 0, src: fluid.speedSrc, stir: fluid.stirLevel ?? 0 } : null);
export function getFluid(gl) {
  if (!fluid) { fluid = new Fluid(gl); if (import.meta.env.DEV) window.__fluid = fluid; }
  return fluid;
}

// --- Mapa nejbližších particlů (per systém) ---
// Všechny particly (klidové pozice) jako body do malé mapy obrazovky, MAX blending 1/hloubka -> v každé buňce nejbližší particl
// (1/hloubka: čistí se nulou, žádná obří clear hodnota).
// Klidová pozice particlu (cíl bez levitace / emerge / scatteru) – stejná funkce je ve velocity shaderu (utils.js).
// Přední vrstva se určuje z klidového tvaru: jinak by proud přední particly odsunul, zadní by se staly
// "předními" a voda by objekt postupně vyhlodala.
export const REST_TARGET_GLSL = `
uniform sampler2D tBasePosition; uniform sampler2D tDnaPosition; uniform mat4 uFinalMat;
uniform float uTransitionProgress; uniform float uCameraY;
vec3 restTarget(vec2 ref) {
  vec4 base = texture2D(tBasePosition, ref), dna = texture2D(tDnaPosition, ref);
  vec3 dnaT = dna.xyz + vec3(0.0, uCameraY * step(dna.w, 0.0), 0.0);
  return mix(dnaT, (uFinalMat * vec4(base.xyz, 1.0)).xyz, smoothstep(0.0, 1.0, uTransitionProgress));
}
`;

const FRONT_VERT = REST_TARGET_GLSL + `
uniform mat4 uMVP; uniform float uPointSize; attribute vec2 aRef; varying float vDepth;
void main(){
  vec4 c = uMVP * vec4(restTarget(aRef), 1.0);
  vDepth = c.w;
  gl_Position = c;
  gl_PointSize = uPointSize; // > 1 buňka: zaplní mezery mezi předními particly, ať jimi neprosvítají zadní
}`;
const FRONT_FRAG = `varying float vDepth; void main(){ gl_FragColor = vec4(1.0 / vDepth); }`;

export function createFrontPass(size, targetUniforms) {
  const n = size * size;
  const ref = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { ref[i * 2] = ((i % size) + 0.5) / size; ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aRef', new THREE.BufferAttribute(ref, 2));
  const mat = new THREE.ShaderMaterial({
    vertexShader: FRONT_VERT, fragmentShader: FRONT_FRAG,
    // sdílí uniformy cíle s GPGPU (tBasePosition, tDnaPosition, uFinalMat, uTransitionProgress, uCameraY)
    uniforms: { ...targetUniforms, uMVP: { value: new THREE.Matrix4() }, uPointSize: { value: 4 } },
    depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  const cam = new THREE.OrthographicCamera();
  let rt = null;
  const _c = new THREE.Color();
  return {
    get texture() { return rt?.texture; },
    get target() { return rt; },
    render(gl, mvp, w, h, pointSize) {
      if (!rt || rt.width !== w || rt.height !== h) {
        rt?.dispose();
        rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      }
      mat.uniforms.uMVP.value.copy(mvp);
      mat.uniforms.uPointSize.value = pointSize;
      const prev = gl.getRenderTarget(), col = gl.getClearColor(_c), a = gl.getClearAlpha(), ac = gl.autoClear;
      gl.autoClear = false;
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.render(scene, cam);
      gl.setClearColor(col, a); gl.autoClear = ac;
      gl.setRenderTarget(prev);
    },
    dispose() { geo.dispose(); mat.dispose(); rt?.dispose(); },
  };
}

// --- [particles] Rychlost strčených particlů do mřížky vody (per systém) ---
// Každý particl jako bod: barva = (rychlost na obrazovce v buňkách/s × váha, váha), aditivně. Váha = "držení" vel.w
// (1 = právě strčen vodou/myší, klesá k 0 při návratu); odtržené (w >= 1.5) a klidné nepíšou nic.
const INJ_VERT = `
uniform sampler2D tPos; uniform sampler2D tVel; uniform mat4 uMVP; uniform vec2 uGrid; uniform float uDt; uniform float uPointSize;
attribute vec2 aRef; varying vec3 vOut;
void main(){
  vec4 p = texture2D(tPos, aRef), v = texture2D(tVel, aRef);
  float w = v.w < 1.5 ? clamp(v.w, 0.0, 1.0) : 0.0;
  vec4 c0 = uMVP * vec4(p.xyz, 1.0), c1 = uMVP * vec4(p.xyz + v.xyz, 1.0);
  if (w < 0.01 || c0.w <= 0.0 || c1.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 1.0; vOut = vec3(0.0); return; }
  vec2 n0 = c0.xy / c0.w, n1 = c1.xy / c1.w;
  // vel = posun za snímek -> NDC/s -> buňky mřížky/s
  vOut = vec3((n1 - n0) * 0.5 * uGrid / max(uDt, 1e-4) * w, w);
  gl_Position = vec4(n0, 0.0, 1.0);
  gl_PointSize = uPointSize;
}`;
// měkký gauss místo čtverce: particl rozhýbe vodu kolem sebe plynule (větší stopa bez zubatých buněk)
const INJ_FRAG = `varying vec3 vOut; void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vOut * exp(-3.0 * r2), 0.0);
}`;

export function createInjectPass(size) {
  const n = size * size;
  const ref = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { ref[i * 2] = ((i % size) + 0.5) / size; ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aRef', new THREE.BufferAttribute(ref, 2));
  const mat = new THREE.ShaderMaterial({
    vertexShader: INJ_VERT, fragmentShader: INJ_FRAG,
    uniforms: { tPos: { value: null }, tVel: { value: null }, uMVP: { value: new THREE.Matrix4() }, uGrid: { value: new THREE.Vector2() }, uDt: { value: 1 / 60 }, uPointSize: { value: 2 } },
    depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  const cam = new THREE.OrthographicCamera();
  return {
    render(gl, target, mvp, posTex, velTex, dt, pointSize) {
      const u = mat.uniforms;
      u.tPos.value = posTex; u.tVel.value = velTex; u.uMVP.value.copy(mvp);
      u.uGrid.value.set(target.width, target.height); u.uDt.value = dt; u.uPointSize.value = pointSize;
      const prev = gl.getRenderTarget(), ac = gl.autoClear;
      gl.autoClear = false;
      gl.setRenderTarget(target);
      gl.render(scene, cam);
      gl.autoClear = ac;
      gl.setRenderTarget(prev);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
