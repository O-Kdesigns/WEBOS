import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getFluid } from './components/particles/ParticleFluid';
import { WANDER_GLSL } from './components/particles/wander';
import { particleSystems } from './components/particles/utils';
import { portalFx } from './PortalTransition';
import { TEX_LOD0 } from './glslTexLod0';
import { dnaShape, MAX_RUNGS } from './dnaShape';
import { prof } from './debug/GpuProfiler';

// Jádro DNA (ORBIT): skleněná „páteř“ UVNITŘ obou vláken šroubovice a UVNITŘ příček mezi nimi – skleněné
// destičky + energetická nit s pulzy. Schovaná v particlech; ukáže se jen tam, odkud particly odletěly,
// a zhasne dřív, než se úplně vrátí (Oliver: „musí to stihnout, jinak není vidět, že mizí“).
//
// Tvar z DNA cílů particlů (fitHelix): vlákna = šroubovice (pás na r ≈ 1,6), změřeno 2026-09-28:
// R 1,599, θ = 9,373 + 0,4963·y (atan2(z,x)), druhé vlákno +π, odchylka < 3°. Příčky = vodorovné tyče přes osu
// ve směru θ(y) (22 ks, rozestup ~1,26, tloušťka ~0,2; shluky na koncích DNA > 0,45 na výšku se vynechají).
// Geometrie je v „prostoru šroubovice“ -> pozici počítá vertex shader, fit = jen uniformy / atributy instancí.
//
// Odhalení: každý snímek (jen když se voda hýbe / particly se vracejí) se DNA particly vykreslí jako body
// do textury REVEAL_BINS × REVEAL_ROWS: řádky 0–1 = vlákna (sloupec = y domova), řádky 2.. = příčky
// (sloupec = y, řádek = poloha podél příčky). R += „odletěl“ (smoothstep vzdálenosti od domova), G += 1.
// Páteř v úseku = smoothstep(podíl odletěných). Config `dnaCore`, DEV `window.__coreOverride`, `window.__dnaCore`.

export const DNA_CORE_DEFAULTS = {
  enabled: true,
  rest: 0,            // viditelnost v klidu (0 = jen kde particly odletěly)
  intensity: 1.8,
  color: '#b8f2ff',   // energie (nit, pulzy, světlo v hranách skla)
  glass: '#c4d6e0',
  glassOpacity: 1,
  width: 0.22,        // world – šířka destičky (vlákno particlů má poloměr ~0,15–0,2; 0,22 je v klidu ještě schovaná)
  depth: 0.05,
  thick: 0.014,
  spacing: 0.06,      // world – rozestup destiček (vlákna po výšce, příčky po délce)
  spin: 2.2,          // rad / world – stočení destiček kolem vlákna / příčky
  rungs: true,        // páteř i v příčkách
  rungScale: 0.7,     // destičky v příčkách menší (tyče z particlů jsou tenčí než vlákna, ~0,15–0,2 na výšku)
  threadRadius: 0.006,
  glowRadius: 0.035,
  pulseSpeed: 2.2,    // world/s – pulzy tečou dolů a z vláken do příček ke středu
  pulseGap: 5,
  // odhalení podle particlů
  band: 0.4,          // world – particl patří k vláknu, když má domov blíž než tohle od středové linky
  awayMin: 0.15,      // world – odchylka od domova, od které se particl počítá jako „odletěl“ ...
  awayMax: 0.32,      // ... naplno (vyšší = páteř se ukáže až při větším odletu a zhasne dřív;
                      // 0,15–0,32: zmizí ~1,5 s po tahu, poslední particly doma ~2,1 s – dřív 0,06–0,25 = 2,1 s)
  revealFrom: 0.12,   // podíl odletěných v úseku, od kterého se páteř ukazuje ...
  revealFull: 0.4,    // ... a kdy je vidět naplno
  // dvě úrovně (t = 0..1 mezi revealFrom a revealFull): 1) linie se zhmotní z jisker, 2) tyčinky vyrostou 0 -> 1
  lineFrom: 0,
  lineTo: 0.5,
  tileFrom: 0,
  tileTo: 0.7,
  tileAwayMin: 0.24,  // world – tyčinky počítají particly až za touhle vzdáleností od domova (linie od awayMin)
  tileAwayMax: 0.4,
  appearTwist: 3.5,   // rad – o kolik se tyčinka při objevení zašroubuje (střídavě na obě strany)
  // tyčinky roztáčí proud 2D vody (myš) – každá má vlastní úhel a úhlovou rychlost, dlouho dobíhá
  spinMouse: 30,      // rad/s² na (NDC/s) proudu přes tyčinku (kolmo na její osu na obrazovce)
  spinDamp: 0.6,      // 1/s – útlum otáčení (menší = delší dojezd)
  spinMax: 16,        // rad/s – strop úhlové rychlosti (25 = 0,42 rad/snímek -> stroboskop)
  settle: 4,          // s po posledním pohybu vody, kdy se odhalení ještě počítá (particly se vracejí)
  // jak se měří odlet particlu: true = 2D z pohledu kamery (posun na obrazovce přepočtený na world v hloubce
  // domova – particl, který odletěl hlavně dopředu ke kameře, páteř dál zakrývá), false = 3D vzdálenost od domova
  reveal2d: true,
  // ZAKRYTÍ: páteř jen tam, kde ji z pohledu kamery nezakrývá žádný particl (i cizí, přiletěný na místo odletěných).
  // Mapa nejbližšího particlu (1/hloubka) v malém rozlišení, particly jako kolečka své velikosti. Mobil: vypnout.
  cover: true,
  coverRes: 160,      // px – výška mapy zakrytí
  coverFrom: 0.25,    // podíl nezakrytého okolí, od kterého se páteř ukazuje ...
  coverFull: 0.75,    // ... a kdy naplno
  // obálka rozvíření z rychlosti myši – už jen pro útlum god rays (VolumetricLight)
  stirMin: 0.03,
  stirMax: 0.6,
  attack: 0.35,
  hold: 0.6,
  release: 0.35,
};

const HELIX_DEFAULT = { th0: 9.3727, k: 0.4963, R: 1.599, yMin: -21.5, yMax: 6, rungs: [] };
const REVEAL_BINS = 256;
const RUNG_SLOTS = 8;                 // úseky podél příčky v textuře odhalení
const REVEAL_ROWS = 2 + RUNG_SLOTS;

export const dnaStir = { value: 0, hold: 0 };

const HELIX_GLSL = /* glsl */`
  #define RUNG_SLOTS ${RUNG_SLOTS}.0
  #define REVEAL_ROWS ${REVEAL_ROWS}.0
  uniform vec4 uHelix;      // th0, k, R, -
  uniform vec2 uYRange;
  uniform sampler2D tReveal;
  uniform vec4 uRevealP;    // revealFrom, revealFull, rest, texel x
  uniform vec4 uLevels;     // linie od/do, tyčinky od/do (v t odhalení)
  uniform sampler2D tCover; // r = 1 / hloubka nejbližšího particlu (mapa zakrytí)
  uniform vec4 uCoverP;     // zapnuto, texel x, texel y, -
  uniform vec2 uCoverR;     // coverFrom, coverFull
  // 0..1: jak moc je bod (clip) z pohledu kamery nezakrytý particly (5 vzorků okolí)
  float uncoveredAt(vec4 clip) {
    if (uCoverP.x < 0.5) return 1.0;
    if (clip.w <= 0.05) return 0.0;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    float w = clip.w, cov = 0.0;
    vec2 tx = uCoverP.yz;
    cov += smoothstep(0.0, 0.012, texture2D(tCover, uv).r * w - 1.0);
    cov += smoothstep(0.0, 0.012, texture2D(tCover, uv + vec2(tx.x, 0.0)).r * w - 1.0);
    cov += smoothstep(0.0, 0.012, texture2D(tCover, uv - vec2(tx.x, 0.0)).r * w - 1.0);
    cov += smoothstep(0.0, 0.012, texture2D(tCover, uv + vec2(0.0, tx.y)).r * w - 1.0);
    cov += smoothstep(0.0, 0.012, texture2D(tCover, uv - vec2(0.0, tx.y)).r * w - 1.0);
    return smoothstep(uCoverR.x, uCoverR.y, 1.0 - cov * 0.2);
  }
  void helixFrame(float y, float s, out vec3 C, out vec3 T, out vec3 N, out vec3 B) {
    float th = uHelix.x + uHelix.y * y + s * 3.14159265;
    vec2 cs = vec2(cos(th), sin(th));
    C = vec3(uHelix.z * cs.x, y, uHelix.z * cs.y);
    N = vec3(cs.x, 0.0, cs.y);
    T = normalize(vec3(-uHelix.z * uHelix.y * cs.y, 1.0, uHelix.z * uHelix.y * cs.x));
    B = normalize(cross(T, N));
  }
  // příčka ve výšce y, poloha u podél ní (-1..1 = od vlákna 0 k vláknu 1): osa A, kolmice U (nahoru), V
  void rungFrame(float y, float u, out vec3 C, out vec3 A, out vec3 U, out vec3 V) {
    float th = uHelix.x + uHelix.y * y;
    A = vec3(cos(th), 0.0, sin(th));
    C = A * (u * uHelix.z) + vec3(0.0, y, 0.0);
    U = vec3(0.0, 1.0, 0.0);
    V = normalize(cross(A, U));
  }
  // x = linie (podíl particlů za awayMin..awayMax), y = tyčinky (podíl za větší tileAway…)
  vec2 revealRow(float x, float v) {
    float o = uRevealP.w * 1.5;
    vec4 m = texture2D(tReveal, vec2(x, v)) + 0.5 * (texture2D(tReveal, vec2(x - o, v)) + texture2D(tReveal, vec2(x + o, v)));
    // úseky s málo particly (konce vláken) necitlivé – jeden odtržený particl by tam držel páteř viditelnou
    vec2 f = m.xz / max(m.y, 48.0);
    return max(clamp((f - uRevealP.x) / (uRevealP.y - uRevealP.x), 0.0, 1.0), vec2(uRevealP.z));
  }
  vec2 revealAt(float y, float s) {
    float x = (y - uYRange.x) / (uYRange.y - uYRange.x);
    return revealRow(x, (s < 0.5 ? 0.5 : 1.5) / REVEAL_ROWS);
  }
  vec2 revealRung(float y, float u) {
    float x = (y - uYRange.x) / (uYRange.y - uYRange.x);
    float slot = clamp((u * 0.5 + 0.5) * RUNG_SLOTS - 0.5, 0.0, RUNG_SLOTS - 1.0);
    return revealRow(x, (2.5 + slot) / REVEAL_ROWS);
  }
`;

const PULSE_GLSL = /* glsl */`
  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseGap;
  float h11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
  // pulzy tekoucí po vlákně dolů (a z vlákna do příčky ke středu): 2 vrstvy s různou rychlostí + jiskření
  float pulses(float y) {
    float p = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float gap = uPulseGap * (1.0 + fk * 0.62);
      float s = (y + uTime * uPulseSpeed * (1.0 + fk * 0.45)) / gap + fk * 0.37;
      float cell = floor(s);
      float f = fract(s) - 0.5 + (h11(cell + fk * 17.0) - 0.5) * 0.5;
      float w = 0.018 + h11(cell * 3.1 + fk) * 0.03;
      p += exp(-f * f / w) * (0.55 + 0.45 * h11(cell * 7.7 + fk)) * step(0.25, h11(cell * 1.9 + fk * 5.0));
    }
    return p;
  }
  float flicker(float y) {
    float t = floor(uTime * 24.0);
    return 0.82 + 0.18 * h11(floor(y * 6.0) + t * 13.0);
  }
`;

// trubky: position = (t podél 0..1, úhel kolem, kind) – kind 0/1 = vlákno, 2+i = příčka i (t = -1..1 přes osu)
const tubeVert = HELIX_GLSL + /* glsl */`
  uniform float uRadius;
  uniform float uRungY[${MAX_RUNGS}];
  uniform float uRungCount;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying float vReveal;
  varying float vCoord;   // souřadnice po dráze (šum zhmotnění)
  void main() {
    vec3 wp, dir;
    float t;
    if (position.z < 1.5) {
      float y = mix(uYRange.x, uYRange.y, position.x);
      vec3 C, T, N, B;
      helixFrame(y, position.z, C, T, N, B);
      dir = cos(position.y) * N + sin(position.y) * B;
      wp = C + dir * uRadius;
      vY = y;
      vCoord = y * 1.3 + position.z * 17.0;
      t = revealAt(y, position.z).x;
    } else {
      int i = int(position.z - 2.0 + 0.5);
      float y = uRungY[i];
      float u = position.x * 2.0 - 1.0;
      vec3 C, A, U, V;
      rungFrame(y, u, C, A, U, V);
      dir = cos(position.y) * U + sin(position.y) * V;
      wp = C + dir * uRadius;
      vY = y - (1.0 - abs(u)) * uHelix.z;  // pulz z vlákna pokračuje příčkou ke středu
      vCoord = u * uHelix.z + float(i) * 5.31 + 40.0;
      t = float(i) < uRungCount ? revealRung(y, u).x : 0.0;
    }
    vec4 clip = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vReveal = smoothstep(uLevels.x, uLevels.y, t * uncoveredAt(clip));   // úroveň 1: linie
    vN = dir;
    vV = normalize(cameraPosition - wp);
    // (neschovávat po vrcholech: trojúhelník se smíšenými vrcholy by se roztáhl přes obrazovku – trubky jsou tenké, levné)
    gl_Position = clip;
  }
`;

const tubeFrag = PULSE_GLSL + /* glsl */`
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uCoreness;   // 1 = tenká nit (ostrá), 0 = záře (měkká)
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying float vReveal;
  varying float vCoord;
  float vnoise(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float prof = mix(pow(facing, 3.0) * 0.35, pow(facing, 1.5), uCoreness);
    float e = (0.3 + pulses(vY) * 0.55) * flicker(vY);
    // zhmotnění: linie se rozsvítí z náhodných bodů, které se slévají; na hraně zhmotnění jiskří
    // (mizení obráceně – rozpadne se v jiskrách)
    if (vReveal < 0.001) { gl_FragColor = vec4(0.0); return; }
    // šum 0.08..1 -> při vReveal 0 nesvítí nic (ani jiskry)
    float n = 0.08 + 0.92 * (vnoise(vCoord * 7.0) * 0.7 + vnoise(vCoord * 23.0 + 3.7) * 0.3);
    float lv = vReveal * 1.15;
    float vis = smoothstep(n - 0.07, n, lv);
    float d = (lv - n) / 0.05;
    float spark = exp(-d * d) * (0.6 + 0.4 * h11(floor(vCoord * 40.0) + floor(uTime * 30.0))) * smoothstep(0.0, 0.06, vReveal);
    gl_FragColor = vec4(uColor * (e * vis + spark * 2.2) * prof * uIntensity, 1.0);
  }
`;

// destičky: aInst = (y, kind, stočení), aRung.x = poloha podél příčky (-1..1); kind 0/1 vlákno, 2 příčka
const tileVert = HELIX_GLSL + /* glsl */`
  attribute vec3 aHalf;
  attribute vec3 aInst;
  attribute float aRung;
  uniform float uRungScale;
  attribute vec2 aSt;     // texel stavu otáčení této tyčinky
  uniform sampler2D tSpin; // r = úhel od myši (simulace spinFrag)
  uniform float uAppearTwist; // rad – zašroubování při objevení
  varying vec3 vP;        // pozice v destičce, -1..1 na každé ose
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying float vReveal;
  void main() {
    vec3 C, T, N, B;
    float t;
    if (aInst.y < 1.5) {
      helixFrame(aInst.x, aInst.y, C, T, N, B);
      vY = aInst.x;
      t = revealAt(aInst.x, aInst.y).y;
    } else {
      rungFrame(aInst.x, aRung, C, T, N, B);  // T = osa příčky, N = nahoru
      vY = aInst.x - (1.0 - abs(aRung)) * uHelix.z;
      t = revealRung(aInst.x, aRung).y;
    }
    t *= uncoveredAt(projectionMatrix * viewMatrix * vec4(C, 1.0));
    // úroveň 2: tyčinky vyrostou 0 -> 1 (každá trochu jindy, s přestřelením) a při tom se zašroubují
    float h = fract(sin(aInst.x * 12.9898 + aRung * 78.233 + aInst.y * 3.17) * 43758.5453);
    float lv = clamp(smoothstep(uLevels.z, uLevels.w, t) * 1.35 - h * 0.35, 0.0, 1.0);
    // velikost doroste v první ~60 % (přestřelení), zašroubování dobíhá až do konce -> je vidět
    float q = min(lv / 0.6, 1.0) - 1.0;
    float sc = 1.0 + 2.02 * q * q * q + 1.02 * q * q;   // ease-out-back (mírné přestřelení)
    float rot = 1.0 - lv;
    rot = rot * rot * (3.0 - 2.0 * rot);
    vReveal = smoothstep(0.0, 0.25, lv);
    float spin = aInst.z + rot * uAppearTwist * (h > 0.5 ? 1.0 : -1.0) + texture2D(tSpin, aSt).x;
    float cs = cos(spin), sn = sin(spin);
    vec3 W = cs * N + sn * B;
    vec3 D = -sn * N + cs * B;
    vec3 lp = position * sc * (aInst.y > 1.5 ? uRungScale : 1.0);
    vec3 wp = C + W * lp.x + T * lp.y + D * lp.z;
    vN = normalize(W * normal.x + T * normal.y + D * normal.z);
    vP = position / aHalf;
    vV = normalize(cameraPosition - wp);
    gl_Position = vReveal < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

// skleněná destička: tmavé tělo, Fresnel lem, světlé hrany; hrany chytají světlo niti (víc u pulzu)
const tileFrag = PULSE_GLSL + /* glsl */`
  uniform vec3 uColor;
  uniform vec3 uGlass;
  uniform float uIntensity;
  uniform float uOpacity;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying float vReveal;
  void main() {
    vec3 a = abs(vP);
    // druhá největší souřadnice u 1 = hrana (dvě stěny se potkávají)
    float mx = max(a.x, max(a.y, a.z));
    float mn = min(a.x, min(a.y, a.z));
    float mid = a.x + a.y + a.z - mx - mn;
    float edge = smoothstep(0.72, 0.98, mid);
    float fres = pow(max(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0), 3.0);   // max: |dot| může zaokrouhlením přesáhnout 1 -> pow(záporné) = NaN
    float p = pulses(vY);
    float nearAxis = 1.0 - smoothstep(0.0, 1.0, a.x);
    vec3 energy = uColor * (0.12 + p * 0.4) * (0.35 + 0.65 * nearAxis);
    // měkký odlesk shora (jako světlo „nebe“ v ORBITu) -> horní plochy destiček se lesknou
    float top = pow(max(normalize(vN).y, 0.0), 4.0);
    vec3 col = uGlass * (0.1 + fres * 0.6 + edge * 0.7 + top * 0.35) + energy * (0.5 + edge * 1.2 + fres * 0.5);
    float alpha = clamp(0.2 + fres * 0.45 + edge * 0.6 + top * 0.2 + p * 0.12, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col * uIntensity, alpha * vReveal);
  }
`;

// Otáčení tyčinek: 1 texel = 1 tyčinka (tTiles: y, druh, poloha na příčce, platná). Proud 2D vody v místě
// tyčinky na obrazovce, kolmo na její osu (průmět), ji roztočí; útlum -> dlouhý dojezd. r = úhel, g = rychlost.
const spinVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const spinFrag = TEX_LOD0 + HELIX_GLSL + /* glsl */`
  uniform sampler2D tPrev;
  uniform sampler2D tTiles;
  uniform sampler2D tFluid;
  uniform vec2 uFluidTexel;
  uniform float uFluidOn;
  uniform mat4 uVP;
  uniform float uAspect;
  uniform float uDt;
  uniform vec3 uSpin;     // síla, útlum, strop rychlosti
  varying vec2 vUv;
  void main() {
    vec4 st = texture2D(tPrev, vUv);
    vec4 td = texture2D(tTiles, vUv);
    float ang = st.x, vel = st.y;
    if (td.w > 0.5 && uFluidOn > 0.5) {
      vec3 C, T, N, B;
      if (td.y < 1.5) helixFrame(td.x, td.y, C, T, N, B);
      else rungFrame(td.x, td.z, C, T, N, B);
      vec4 c0 = uVP * vec4(C, 1.0), c1 = uVP * vec4(C + T * 0.2, 1.0);
      if (c0.w > 0.05 && c1.w > 0.05) {
        vec2 n0 = c0.xy / c0.w, n1 = c1.xy / c1.w;
        vec2 suv = n0 * 0.5 + 0.5;
        if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
          vec3 fl = texture2D(tFluid, suv).xyz;
          vec2 f = fl.xy * uFluidTexel * 2.0 * smoothstep(0.05, 0.5, fl.z) * vec2(uAspect, 1.0); // NDC/s
          vec2 a = (n1 - n0) * vec2(uAspect, 1.0);
          float al = length(a);
          // proud kolmo na osu tyčinky ji roztočí (osa mířící do kamery = nic)
          if (al > 1e-4) vel += (a.x * f.y - a.y * f.x) / al * smoothstep(0.01, 0.06, al) * uSpin.x * uDt;
        }
      }
    }
    vel = clamp(vel * exp(-uSpin.y * uDt), -uSpin.z, uSpin.z);
    ang = mod(ang + vel * uDt + 3.14159265, 6.2831853) - 3.14159265;
    gl_FragColor = vec4(ang, vel, 0.0, 1.0);
  }
`;

// Mapa zakrytí: 1 kolečko na particl (velikost = jeho poloměr na obrazovce), MAX blending -> nejbližší 1/hloubka
const coverVert = /* glsl */`
  attribute vec2 aUv;
  uniform sampler2D tPos;
  uniform sampler2D tDna;
  uniform mat4 uVP;
  uniform vec2 uCov;      // projectionMatrix[1][1], výška mapy (px)
  varying float vInv;
  void main() {
    vec4 p = texture2D(tPos, aUv);
    vec4 dna = texture2D(tDna, aUv);
    vec4 c = uVP * vec4(p.xyz, 1.0);
    vInv = 1.0 / max(c.w, 0.05);
    gl_PointSize = clamp(abs(p.w) * uCov.x / max(c.w, 0.05) * uCov.y, 1.0, 64.0);
    gl_Position = (dna.w <= 0.0 || c.w < 0.05) ? vec4(2.0, 2.0, 2.0, 1.0) : c;
  }
`;
const coverFrag = /* glsl */`
  varying float vInv;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    if (dot(d, d) > 0.25) discard;
    gl_FragColor = vec4(vInv, 0.0, 0.0, 1.0);
  }
`;

// Akumulace odhalení: 1 bod na particl -> úsek podle DOMOVA (DNA cíle), R += odletěl, G += 1.
// Vlákno: domov blíž než band od středové linky. Příčka: zbytek uvnitř poloměru (příčky vyplňují střed).
const accVert = /* glsl */`
  ${WANDER_GLSL}
  uniform float uWanderS; // velikost GPGPU textury systému (výběr putovníků jako v utils.js)
  #define RUNG_SLOTS ${RUNG_SLOTS}.0
  #define REVEAL_ROWS ${REVEAL_ROWS}.0
  attribute vec2 aUv;
  uniform sampler2D tPos;
  uniform sampler2D tDna;
  uniform vec4 uHelix;
  uniform vec2 uYRange;
  uniform vec4 uAcc;      // band, awayMin, awayMax, v klidu DNA (1/0)
  uniform vec2 uAcc2;     // tileAwayMin, tileAwayMax
  uniform mat4 uVP;       // view-projection kamery (režim 2D)
  uniform vec3 uMode2d;   // 1 = 2D, projectionMatrix[0][0], [1][1]
  varying float vW;
  varying float vW2;
  void main() {
    gl_PointSize = 1.0;
    vec4 dna = texture2D(tDna, aUv);
    vec4 p = texture2D(tPos, aUv);
    float th = uHelix.x + uHelix.y * dna.y;
    vec2 dirT = vec2(cos(th), sin(th));
    vec2 c0 = uHelix.z * dirT;
    float d0 = length(dna.xz - c0), d1 = length(dna.xz + c0);
    float x = (dna.y - uYRange.x) / (uYRange.y - uYRange.x);
    float dd = length(p.xyz - dna.xyz);
    if (uMode2d.x > 0.5) {
      // 2D: posun na obrazovce -> world v hloubce domova (stejné jednotky jako 3D prahy)
      vec4 ch = uVP * vec4(dna.xyz, 1.0), cp = uVP * vec4(p.xyz, 1.0);
      if (ch.w > 0.05 && cp.w > 0.05) {
        vec2 dn = cp.xy / cp.w - ch.xy / ch.w;
        dd = length(vec2(dn.x / uMode2d.y, dn.y / uMode2d.z)) * ch.w;
      }
    }
    vW = smoothstep(uAcc.y, uAcc.z, dd);
    vW2 = smoothstep(uAcc2.x, uAcc2.y, dd);
    float row;
    if (min(d0, d1) < uAcc.x) row = d0 < d1 ? 0.0 : 1.0;
    else {
      float u = clamp(dot(dna.xz, dirT) / uHelix.z, -1.0, 1.0);
      row = 2.0 + min(floor((u * 0.5 + 0.5) * RUNG_SLOTS), RUNG_SLOTS - 1.0);
    }
    // putovníci (wander.js) jsou od domova pořád daleko -> páteř by odhalovali trvale
    float wl, wg;
    bool wanderer = wanderSel(aUv, uWanderS, dna, tDna, wl, wg) > 0.5;
    bool skip = dna.w <= 0.0 || wanderer || length(dna.xz) > uHelix.z + uAcc.x || x < 0.0 || x > 1.0 || uAcc.w < 0.5;
    gl_Position = skip ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(x * 2.0 - 1.0, (row + 0.5) / REVEAL_ROWS * 2.0 - 1.0, 0.0, 1.0);
  }
`;
const accFrag = /* glsl */`
  varying float vW;
  varying float vW2;
  void main() { gl_FragColor = vec4(vW, 1.0, vW2, 1.0); }
`;

// Šroubovice z DNA cílů: vlákna = particly na vnějším plášti (r > 0,85 × p90), úhel osy vláken po řezech Y
// (zdvojený úhel spojí obě vlákna), lineární fit úhlu. Příčky = shluky vnitřních particlů po výšce.
// Řídce (každý 5. particl) – běží jen při změně cílů.
function fitHelix(systems) {
  const pts = [];
  for (const c of systems) {
    const D = c.posVar.material.uniforms.tDnaPosition.value?.image?.data;
    if (!D) continue;
    for (let i = 0; i < D.length; i += 20) if (D[i + 3] > 0) pts.push(D[i], D[i + 1], D[i + 2]);
  }
  const n = pts.length / 3;
  if (n < 500) return null;
  const rs = new Float32Array(n);
  for (let i = 0; i < n; i++) rs[i] = Math.hypot(pts[i * 3], pts[i * 3 + 2]);
  const sorted = Float32Array.from(rs).sort();
  const rCut = sorted[Math.floor(n * 0.9)] * 0.85;
  let yMin = Infinity, yMax = -Infinity, rSum = 0, m = 0;
  for (let i = 0; i < n; i++) if (rs[i] > rCut) { const y = pts[i * 3 + 1]; yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); rSum += rs[i]; m++; }
  const dy = 0.25, nb = Math.max(1, Math.ceil((yMax - yMin) / dy));
  const acc = new Float32Array(nb * 3);
  for (let i = 0; i < n; i++) {
    if (rs[i] <= rCut) continue;
    const b = Math.min(nb - 1, Math.floor((pts[i * 3 + 1] - yMin) / dy));
    const a = 2 * Math.atan2(pts[i * 3 + 2], pts[i * 3]);
    acc[b * 3] += Math.cos(a); acc[b * 3 + 1] += Math.sin(a); acc[b * 3 + 2]++;
  }
  const ys = [], as = [];
  let prev = null;
  for (let b = 0; b < nb; b++) {
    if (acc[b * 3 + 2] < 8) continue;
    let a = Math.atan2(acc[b * 3 + 1], acc[b * 3]) / 2;
    if (prev !== null) { while (a - prev > Math.PI / 2) a -= Math.PI; while (a - prev < -Math.PI / 2) a += Math.PI; }
    prev = a; ys.push(yMin + (b + 0.5) * dy); as.push(a);
  }
  if (ys.length < 8) return null;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length, ma = as.reduce((s, v) => s + v, 0) / as.length;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < ys.length; i++) { sxy += (ys[i] - my) * (as[i] - ma); sxx += (ys[i] - my) ** 2; }
  const k = sxy / sxx;
  const R = rSum / m;

  // příčky: vnitřní particly (r < 0,7 R) po výšce po 0,05 -> souvislé shluky; vysoké (> 0,45) = čepičky na koncích
  const hb = 0.05, hn = Math.ceil((yMax - yMin + 2) / hb) + 1, hy0 = yMin - 1;
  const hist = new Float32Array(hn), hsum = new Float32Array(hn);
  for (let i = 0; i < n; i++) {
    if (rs[i] > R * 0.7) continue;
    const y = pts[i * 3 + 1], b = Math.floor((y - hy0) / hb);
    if (b >= 0 && b < hn) { hist[b]++; hsum[b] += y; }
  }
  const rungs = [];
  for (let b = 0; b < hn;) {
    if (!hist[b]) { b++; continue; }
    let cnt = 0, sy = 0, b0 = b;
    while (b < hn && hist[b]) { cnt += hist[b]; sy += hsum[b]; b++; }
    if ((b - b0) * hb <= 0.45 && cnt >= 5 && rungs.length < MAX_RUNGS) rungs.push(sy / cnt);
  }
  return { th0: ma - k * my, k, R, yMin, yMax, rungs };
}

function mergeCfg(appConfig) {
  const ov = import.meta.env.DEV ? window.__coreOverride : null;
  return { ...DNA_CORE_DEFAULTS, ...(appConfig?.dnaCore || {}), ...(ov || {}) };
}

// 2 vlákna (t 0..1) + MAX_RUNGS příček (t 0..1 -> -1..1 přes osu)
function tubeGeometry(seg, rungSeg, rad) {
  const pos = [], idx = [];
  const strip = (kind, segs) => {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) for (let j = 0; j <= rad; j++) pos.push(i / segs, (j / rad) * Math.PI * 2, kind);
    for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
      const a = base + i * (rad + 1) + j, b = a + rad + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  };
  strip(0, seg); strip(1, seg);
  for (let r = 0; r < MAX_RUNGS; r++) strip(2 + r, rungSeg);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function DnaCore({ appConfig }) {
  const { gl } = useThree();
  const groupRef = useRef(null);
  const st = useRef({ lastActive: -1e9, fitKey: '', ids: new WeakMap(), nextId: 1 });
  const base = mergeCfg(appConfig);
  const geoKey = [base.width, base.depth, base.thick, base.spacing].join(',');

  const shared = useMemo(() => ({
    uTime: { value: 0 }, uPulseSpeed: { value: 2 }, uPulseGap: { value: 3 }, uColor: { value: new THREE.Color() },
    uIntensity: { value: 1 },
    uHelix: { value: new THREE.Vector4(HELIX_DEFAULT.th0, HELIX_DEFAULT.k, HELIX_DEFAULT.R, 0) },
    uYRange: { value: new THREE.Vector2(HELIX_DEFAULT.yMin, HELIX_DEFAULT.yMax) },
    tReveal: { value: null },
    uRevealP: { value: new THREE.Vector4(0.06, 0.3, 0, 1 / REVEAL_BINS) },
    uRungY: { value: new Array(MAX_RUNGS).fill(0) },
    uRungCount: { value: 0 },
    uLevels: { value: new THREE.Vector4(0, 0.5, 0.35, 1) },
    tCover: { value: null },
    uCoverP: { value: new THREE.Vector4() },
    uCoverR: { value: new THREE.Vector2(0.25, 0.75) },
  }), []);

  // akumulace odhalení (malý HalfFloat target, aditivně)
  const acc = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(REVEAL_BINS, REVEAL_ROWS, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
    });
    const mat = new THREE.ShaderMaterial({
      vertexShader: accVert, fragmentShader: accFrag,
      uniforms: { tPos: { value: null }, tDna: { value: null }, uHelix: shared.uHelix, uYRange: shared.uYRange, uAcc: { value: new THREE.Vector4() }, uAcc2: { value: new THREE.Vector2() },
        uVP: { value: new THREE.Matrix4() }, uMode2d: { value: new THREE.Vector3() },
        uWander: { value: new THREE.Vector4() }, uWander2: { value: new THREE.Vector4() }, uWander3: { value: new THREE.Vector4() }, uWanderS: { value: 1 } },
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false, transparent: true,
    });
    const coverRT = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    });
    const coverMat = new THREE.ShaderMaterial({
      vertexShader: coverVert, fragmentShader: coverFrag,
      uniforms: { tPos: { value: null }, tDna: { value: null }, uVP: { value: new THREE.Matrix4() }, uCov: { value: new THREE.Vector2() } },
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false, transparent: true,
    });
    return { rt, mat, coverRT, coverMat, scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, [shared]);
  shared.tReveal.value = acc.rt.texture;

  const parts = useMemo(() => {
    const c = base;
    const box = new THREE.BoxGeometry(c.width, c.thick, c.depth);
    const half = new Float32Array(box.attributes.position.count * 3);
    for (let i = 0; i < half.length; i += 3) { half[i] = c.width / 2; half[i + 1] = c.thick / 2; half[i + 2] = c.depth / 2; }
    box.setAttribute('aHalf', new THREE.BufferAttribute(half, 3));
    const tileGeo = new THREE.InstancedBufferGeometry().copy(box);
    box.dispose();
    // vlákna: pevný počet na vlákno (y z fitu), příčky: pevný počet na příčku × MAX_RUNGS (y z fitu)
    const perStrand = Math.max(1, Math.round((HELIX_DEFAULT.yMax - HELIX_DEFAULT.yMin + 2) / c.spacing));
    const perRung = Math.max(2, Math.round(2 * HELIX_DEFAULT.R / c.spacing));
    const total = perStrand * 2 + perRung * MAX_RUNGS;
    tileGeo.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3));
    tileGeo.setAttribute('aRung', new THREE.InstancedBufferAttribute(new Float32Array(total), 1));
    tileGeo.instanceCount = perStrand * 2;
    // stav otáčení: 1 texel na tyčinku
    const S = Math.ceil(Math.sqrt(total));
    const stUv = new Float32Array(total * 2);
    for (let i = 0; i < total; i++) { stUv[i * 2] = ((i % S) + 0.5) / S; stUv[i * 2 + 1] = (Math.floor(i / S) + 0.5) / S; }
    tileGeo.setAttribute('aSt', new THREE.InstancedBufferAttribute(stUv, 2));
    const tilesTex = new THREE.DataTexture(new Float32Array(S * S * 4), S, S, THREE.RGBAFormat, THREE.FloatType);
    tilesTex.needsUpdate = true;
    const mkState = () => new THREE.WebGLRenderTarget(S, S, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    });
    const spinRT = [mkState(), mkState()];
    const spinMat = new THREE.ShaderMaterial({
      vertexShader: spinVert, fragmentShader: spinFrag,
      uniforms: { ...shared, tPrev: { value: null }, tTiles: { value: tilesTex }, tFluid: { value: null }, uFluidTexel: { value: new THREE.Vector2() },
        uFluidOn: { value: 0 }, uVP: { value: new THREE.Matrix4() }, uAspect: { value: 1 }, uDt: { value: 0 }, uSpin: { value: new THREE.Vector3() } },
      depthTest: false, depthWrite: false,
    });
    const spinScene = new THREE.Scene();
    const spinQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), spinMat);
    spinQuad.frustumCulled = false;
    spinScene.add(spinQuad);
    const tileMat = new THREE.ShaderMaterial({
      vertexShader: tileVert, fragmentShader: tileFrag,
      uniforms: { ...shared, uGlass: { value: new THREE.Color() }, uOpacity: { value: 1 }, uRungScale: { value: 0.7 },
        tSpin: { value: spinRT[0].texture }, uAppearTwist: { value: 3.5 } },
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const tube = tubeGeometry(700, 48, 8);
    const mkTube = (coreness) => new THREE.ShaderMaterial({
      vertexShader: tubeVert, fragmentShader: tubeFrag,
      uniforms: { ...shared, uCoreness: { value: coreness }, uRadius: { value: 0.01 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    return { tileGeo, tileMat, tube, threadMat: mkTube(1), glowMat: mkTube(0), perStrand, perRung, instKey: '',
      S, tilesTex, spinRT, spinMat, spinScene, spinQuad, spinFresh: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, shared]);

  useEffect(() => () => {
    parts.tileGeo.dispose(); parts.tileMat.dispose(); parts.tube.dispose();
    parts.threadMat.dispose(); parts.glowMat.dispose();
    parts.tilesTex.dispose(); parts.spinRT.forEach((t) => t.dispose()); parts.spinMat.dispose(); parts.spinQuad.geometry.dispose();
  }, [parts]);
  useEffect(() => () => { acc.rt.dispose(); acc.mat.dispose(); acc.coverRT.dispose(); acc.coverMat.dispose(); }, [acc]);

  useFrame((state, delta) => {
    const c = mergeCfg(appConfig);
    const s = st.current;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    const now = performance.now() / 1000;
    const fl = getFluid(gl);
    const orbit = 1 - THREE.MathUtils.smoothstep(portalFx.progress, 0, 0.3);

    // obálka rozvíření z rychlosti tahu myši -> útlum god rays (VolumetricLight)
    {
      const sp = fl.velocity ? (fl.speed ?? 0) : 0;
      const target = THREE.MathUtils.smoothstep(sp, c.stirMin, c.stirMax) * orbit;
      if (target >= dnaStir.value) dnaStir.hold = c.hold;
      else dnaStir.hold -= dt;
      if (target >= dnaStir.value || dnaStir.hold <= 0) {
        const tau = target > dnaStir.value ? c.attack : c.release;
        dnaStir.value += (target - dnaStir.value) * (1 - Math.exp(-dt / Math.max(0.02, tau)));
        if (dnaStir.value < 1e-4) dnaStir.value = 0;
      }
    }

    // živé systémy (odložené k dispose už se nepočítají)
    const tickNow = performance.now();
    const live = [];
    for (const sys of particleSystems) if (!sys.disposed && tickNow - (sys.tick || 0) < 250) live.push(sys);

    // fit šroubovice + příček při změně DNA cílů
    let key = '';
    for (const sys of live) {
      const w = sys.writtenData;
      if (w && !s.ids.has(w)) s.ids.set(w, s.nextId++);
      key += sys.size + ':' + (w ? s.ids.get(w) : 0) + ',';
    }
    if (key !== s.fitKey && live.length) {
      s.fitKey = key;
      const f = fitHelix(live);
      if (f) {
        shared.uHelix.value.set(f.th0, f.k, f.R, 0);
        shared.uYRange.value.set(f.yMin, f.yMax);
        for (let i = 0; i < MAX_RUNGS; i++) shared.uRungY.value[i] = f.rungs[i] ?? 0;
        s.rungs = f.rungs;
        // pro fyziku particlů (dojezd podél DNA)
        Object.assign(dnaShape, { valid: true, th0: f.th0, k: f.k, R: f.R, rungs: f.rungs, version: dnaShape.version + 1 });
      }
      s.fit = f;
      if (import.meta.env.DEV) { s.rt = acc.rt; window.__dnaCore = s; }
    }
    const rungs = c.rungs ? (s.rungs || []) : [];
    shared.uRungCount.value = rungs.length;

    if (fl.velocity) s.lastActive = now;
    const anyRest = live.some((sys) => sys.posVar.material.uniforms.uTransitionProgress.value < 0.001);
    const active = c.enabled && orbit > 0.001 && anyRest && (now - s.lastActive < c.settle || c.rest > 0);
    const g = groupRef.current;
    if (g) g.visible = active;
    if (!active) return;

    // 1) akumulace: kolik particlů každého úseku vlákna / příčky odletělo
    prof.scope('jádro DNA: odhalení');
    const prevRT = gl.getRenderTarget(), prevAuto = gl.autoClear;
    const col = gl.getClearColor(s.tmpCol || (s.tmpCol = new THREE.Color())), alpha = gl.getClearAlpha();
    gl.autoClear = false;
    gl.setRenderTarget(acc.rt);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    (s.vp || (s.vp = new THREE.Matrix4())).multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
    for (const sys of live) {
      const pu = sys.posVar.material.uniforms;
      if (!sys.spinePoints || sys.spinePoints.material.vertexShader !== accVert) {
        sys.spinePoints?.geometry.dispose(); sys.spinePoints?.material.dispose();
        const n = sys.size * sys.size, uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uv[i * 2] = ((i % sys.size) + 0.5) / sys.size; uv[i * 2 + 1] = (Math.floor(i / sys.size) + 0.5) / sys.size; }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        geo.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
        const mat = acc.mat.clone();
        mat.uniforms.uHelix = shared.uHelix; mat.uniforms.uYRange = shared.uYRange;
        sys.spinePoints = new THREE.Points(geo, mat);
        sys.spinePoints.frustumCulled = false;
      }
      const u = sys.spinePoints.material.uniforms;
      u.tPos.value = sys.gpuCompute.getCurrentRenderTarget(sys.posVar).texture;
      u.tDna.value = pu.tDnaPosition.value;
      u.uAcc.value.set(c.band, c.awayMin, c.awayMax, pu.uTransitionProgress.value < 0.001 ? 1 : 0);
      u.uAcc2.value.set(c.tileAwayMin, Math.max(c.tileAwayMin + 0.01, c.tileAwayMax));
      if (pu.uWander) { u.uWander.value.copy(pu.uWander.value); u.uWander2.value.copy(pu.uWander2.value); u.uWander3.value.copy(pu.uWander3.value); }
      u.uWanderS.value = sys.size;
      u.uVP.value.copy(s.vp);
      u.uMode2d.value.set(c.reveal2d ? 1 : 0, state.camera.projectionMatrix.elements[0], state.camera.projectionMatrix.elements[5]);
      acc.scene.add(sys.spinePoints);
      gl.render(acc.scene, acc.cam);
      acc.scene.remove(sys.spinePoints);
    }
    prof.end();
    // 1b) zakrytí: mapa nejbližších particlů z pohledu kamery
    if (c.cover) {
      prof.scope('jádro DNA: zakrytí');
      const H = Math.max(16, Math.round(c.coverRes)), W = Math.max(16, Math.round(H * state.size.width / Math.max(1, state.size.height)));
      if (acc.coverRT.width !== W || acc.coverRT.height !== H) acc.coverRT.setSize(W, H);
      gl.setRenderTarget(acc.coverRT);
      gl.clear(true, false, false);
      for (const sys of live) {
        if (!sys.spinePoints) continue;
        if (!sys.coverPoints || sys.coverPoints.material.vertexShader !== coverVert) {
          sys.coverPoints?.material.dispose();
          sys.coverPoints = new THREE.Points(sys.spinePoints.geometry, acc.coverMat.clone());
          sys.coverPoints.frustumCulled = false;
        }
        const u = sys.coverPoints.material.uniforms;
        u.tPos.value = sys.gpuCompute.getCurrentRenderTarget(sys.posVar).texture;
        u.tDna.value = sys.posVar.material.uniforms.tDnaPosition.value;
        u.uVP.value.copy(s.vp);
        u.uCov.value.set(state.camera.projectionMatrix.elements[5], H * 0.5);
        acc.scene.add(sys.coverPoints);
        gl.render(acc.scene, acc.cam);
        acc.scene.remove(sys.coverPoints);
      }
      prof.end();
      shared.tCover.value = acc.coverRT.texture;
      shared.uCoverP.value.set(1, 1 / W, 1 / H, 0);
    } else shared.uCoverP.value.x = 0;
    shared.uCoverR.value.set(c.coverFrom, Math.max(c.coverFrom + 0.01, c.coverFull));
    if (import.meta.env.DEV) s.coverRT = acc.coverRT;
    gl.setClearColor(col, alpha);
    gl.setRenderTarget(prevRT);
    gl.autoClear = prevAuto;

    // 2) páteř: instance destiček (y + stočení) jen při změně fitu / příček / stočení
    const y0 = shared.uYRange.value.x, y1 = shared.uYRange.value.y;
    const instKey = y0 + ',' + y1 + ',' + c.spin + ',' + rungs.join(',');
    if (instKey !== parts.instKey) {
      parts.instKey = instKey;
      const a = parts.tileGeo.attributes.aInst, ar = parts.tileGeo.attributes.aRung;
      const ps = parts.perStrand, pr = parts.perRung, R = shared.uHelix.value.z;
      const nS = Math.min(ps, Math.max(1, Math.round((y1 - y0) / c.spacing)));
      let o = 0;
      for (let sI = 0; sI < 2; sI++) for (let i = 0; i < nS; i++, o++) {
        const y = y0 + (y1 - y0) * (i + 0.5) / nS;
        a.array[o * 3] = y; a.array[o * 3 + 1] = sI; a.array[o * 3 + 2] = y * c.spin + sI * 1.7;
        ar.array[o] = 0;
      }
      // příčky: od vlákna k vláknu, konce kousek uvnitř vlákna (spojení s páteří vlákna)
      const uMax = (R - c.width * 0.25) / R;
      for (let r = 0; r < rungs.length; r++) for (let i = 0; i < pr; i++, o++) {
        const u = -uMax + 2 * uMax * (i + 0.5) / pr;
        a.array[o * 3] = rungs[r]; a.array[o * 3 + 1] = 2; a.array[o * 3 + 2] = u * R * c.spin + r * 0.9;
        ar.array[o] = u;
      }
      parts.tileGeo.instanceCount = o;
      a.needsUpdate = true; ar.needsUpdate = true;
      const td = parts.tilesTex.image.data;
      td.fill(0);
      for (let i = 0; i < o; i++) { td[i * 4] = a.array[i * 3]; td[i * 4 + 1] = a.array[i * 3 + 1]; td[i * 4 + 2] = ar.array[i]; td[i * 4 + 3] = 1; }
      parts.tilesTex.needsUpdate = true;
    }
    // otáčení tyčinek: simulace (1 texel = 1 tyčinka), proud vody je roztočí, dlouho dobíhají
    {
      const sm = parts.spinMat.uniforms;
      const cam = state.camera;
      sm.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      sm.uAspect.value = state.size.width / Math.max(1, state.size.height);
      sm.uDt.value = dt;
      sm.uSpin.value.set(c.spinMouse, c.spinDamp, c.spinMax);
      sm.tFluid.value = fl.velocity || null;
      sm.uFluidOn.value = fl.velocity ? 1 : 0;
      if (fl.texel) sm.uFluidTexel.value.copy(fl.texel);
      const prev = gl.getRenderTarget();
      if (parts.spinFresh) {
        parts.spinFresh = false;
        const col2 = gl.getClearColor(s.tmpCol2 || (s.tmpCol2 = new THREE.Color())), a2 = gl.getClearAlpha();
        gl.setClearColor(0x000000, 0);
        parts.spinRT.forEach((t) => { gl.setRenderTarget(t); gl.clear(true, false, false); });
        gl.setClearColor(col2, a2);
      }
      sm.tPrev.value = parts.spinRT[0].texture;
      gl.setRenderTarget(parts.spinRT[1]);
      gl.render(parts.spinScene, acc.cam);
      gl.setRenderTarget(prev);
      parts.spinRT.reverse();
      parts.tileMat.uniforms.tSpin.value = parts.spinRT[0].texture;
      if (import.meta.env.DEV) s.spinRT = parts.spinRT;
    }
    shared.uLevels.value.set(c.lineFrom, Math.max(c.lineFrom + 0.01, c.lineTo), c.tileFrom, Math.max(c.tileFrom + 0.01, c.tileTo));
    shared.uTime.value = state.clock.elapsedTime;
    shared.uPulseSpeed.value = c.pulseSpeed;
    shared.uPulseGap.value = Math.max(0.2, c.pulseGap);
    shared.uColor.value.set(c.color);
    shared.uIntensity.value = c.intensity * orbit;
    shared.uRevealP.value.set(c.revealFrom, Math.max(c.revealFrom + 0.01, c.revealFull), c.rest, 1 / REVEAL_BINS);
    parts.tileMat.uniforms.uGlass.value.set(c.glass);
    parts.tileMat.uniforms.uOpacity.value = c.glassOpacity;
    parts.tileMat.uniforms.uRungScale.value = c.rungScale;
    parts.tileMat.uniforms.uAppearTwist.value = c.appearTwist;
    parts.threadMat.uniforms.uRadius.value = c.threadRadius;
    parts.glowMat.uniforms.uRadius.value = c.glowRadius;
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={parts.tileGeo} material={parts.tileMat} renderOrder={3} frustumCulled={false} />
      <mesh geometry={parts.tube} material={parts.glowMat} renderOrder={4} frustumCulled={false} />
      <mesh geometry={parts.tube} material={parts.threadMat} renderOrder={4} frustumCulled={false} />
    </group>
  );
}
