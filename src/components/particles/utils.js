import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GPUComputationRenderer } from './GPUComputationRenderer'; // kopie s rozlišením v uniformě (sdílené shadery)
import { FLUID_DEFAULTS, getFluid, createFrontPass, REST_TARGET_GLSL } from './ParticleFluid';
import { prof } from '../../debug/GpuProfiler';
import { TEX_LOD0 } from '../../glslTexLod0';
import { mark } from '../../debug/FrameProbe';
import { dnaShape, MAX_RUNGS } from '../../dnaShape';

// Pomocná funkce pro vygenerování palety
export const getColors = () => [
  new THREE.Color('#7CFC00'),
  new THREE.Color('#4169E1'),
  new THREE.Color('#FFFFE0'),
  new THREE.Color('#888888'),
  new THREE.Color('#228B22'),
];

// --- GPGPU SHADERS ---
const fragmentShaderVel = TEX_LOD0 + REST_TARGET_GLSL + `
uniform vec3 uMousePos;
uniform vec3 uMouseDir;
uniform vec3 uMouseVel;
uniform float uMouseRadius;
uniform float uMouseForce;
// Vodnatá fyzika (ParticleFluid.js): proud z neviditelné mřížky tekutiny v místě particlu na obrazovce.
uniform float uFluidOn;
uniform sampler2D tFluid;     // xy = rychlost proudu (buňky mřížky / s), z = stopa myši (0..1)
uniform vec2 uFluidTexel;     // 1 / rozměr mřížky
uniform sampler2D tFront;     // 1 / hloubka nejbližšího particlu v buňce obrazovky
uniform mat4 uMVP;            // lokální prostor meshe -> clip
uniform vec3 uCamRight;       // osa X kamery v lokálním prostoru meshe (délka = 1 world)
uniform vec3 uCamUp;
uniform vec2 uProj;           // projectionMatrix[0][0], [1][1]
uniform float uDt;
uniform float uFluidForce;
uniform float uCoupling;
uniform float uFriction;
uniform float uFrontShell;
uniform sampler2D tWave;       // r = výška hladiny (vlny)
uniform float uWaveForce;
uniform float uWaveDrift;
uniform float uWaveC;          // rychlost vln (výšky obrazovky/s)
uniform float uWaveCStep;      // posun vlny za krok simulace (buňky)
uniform float uHoldDecay;      // 1 / (zpoždění + náběh návratu) – jak rychle particl "zapomene" strčení
// Fyzikální návrat (vodní režim): pružina v rychlosti místo posouvání pozice -> particl si nese svou
// hybnost, kmity vln i víření a k cíli se stáčí po oblouku. Sdílené uniformy s pozičním shaderem.
uniform float uPhysReturn;     // 1 = návrat pružinou zde, 0 = starý posun pozice v pozičním shaderu
uniform float uReturnK;        // dojezdová rychlost = vzdálenost × uReturnK (1/s)
uniform float uReturnDamp;     // jak rychle se rychlost particlu přizpůsobí dojezdové (1/s)
uniform float uReturnTurn;     // boční zrychlení stáčení k cíli (world/s²) – menší = širší oblouky
uniform float uReturnDelay;
uniform float uReturnRamp;
uniform float uTime;
uniform float uFloatSpeed;
uniform float uFloatAmplitude;
// Odtržení (jen v klidu DNA): particl odfouknutý dál než uEscDist se (s pravděpodobností uEscChance) přestane
// vracet a volně pluje prostorem. vel.w >= 2 = odtržený, vel.w - 2 = s od zlomu (záblesk v materiálu).
uniform float uEscOn;
uniform float uEscDist;       // world vzdálenost od domova = bod zlomu
uniform float uEscChance;     // podíl particlů, které se můžou odtrhnout
uniform float uEscSeed;       // mění se při každém návratu do DNA -> pokaždé se odtrhnou jiné
uniform float uEscDrift;      // cestovní rychlost volného particlu (world/s)
uniform float uEscFriction;   // tření volných (za snímek při 60 fps) – vesmír = skoro žádné
uniform float uEscLeash;      // poloměr prostoru kolem domova, ve kterém volné plují
uniform float uEscMouse;      // násobek síly vody na volné particly
uniform float uEscScale;      // velikost víření proudu, po kterém plují (1/world)
uniform float uEscLife;       // s od zlomu, po kterých se volný sám připojí zpět
uniform float uReturnPull;    // pružina k domovu (1/s²) – brzdí let od domova, ne jen stáčí směr
// Vodítko DNA (jen v klidu DNA, ne odtržené): particl smí od svého místa v DNA nejvýš ~uDnaLeash world
// (každý 0.6–1.4× náhodně) – dál měkká stěna pohltí rychlost ven a vrátí přesah. Vír myši tak vlákna jen
// nafoukne do chlupaté trubice, šroubovice zůstane čitelná (bez vodítka odletěly vzdálené o celý poloměr DNA).
uniform float uDnaLeash;      // 0 = vypnuto
// Dojezd podél DNA: dokud je particl blízko struktury DNA (vlákna / příčky, do uDnaLeash), smí od domova
// o uDnaSlide.x dál. U limitu BRZDA (celá rychlost, ne jen ven) -> zastaví se, neklouže po neviditelné stěně.
uniform vec3 uDnaSlide;       // navíc (world), brzda (1/s), 1 = tvar DNA je znám
uniform float uDnaLimRand;    // 0..1 – náhodné rozhození limitu (vodítko i dojezd) pro každý particl zvlášť
uniform vec3 uDnaShape;       // th0, k, R (šroubovice os vláken)
uniform float uDnaRungY[${MAX_RUNGS}];
uniform float uDnaRungN;

// vzdálenost od struktury DNA: osa bližšího vlákna (vodorovně × cos sklonu) nebo tyč příčky
float dnaStructDist(vec3 p) {
    float th = uDnaShape.x + uDnaShape.y * p.y;
    vec2 c0 = uDnaShape.z * vec2(cos(th), sin(th));
    float rk = uDnaShape.z * uDnaShape.y;
    float d = min(length(p.xz - c0), length(p.xz + c0)) * inversesqrt(1.0 + rk * rk);
    for (int i = 0; i < ${MAX_RUNGS}; i++) {
        if (float(i) >= uDnaRungN) break;
        float dy = abs(p.y - uDnaRungY[i]);
        if (dy >= d) continue;
        float thr = uDnaShape.x + uDnaShape.y * uDnaRungY[i];
        vec2 A = vec2(cos(thr), sin(thr));
        vec2 perp = p.xz - A * clamp(dot(p.xz, A), -uDnaShape.z, uDnaShape.z);
        d = min(d, length(vec2(length(perp), dy)));
    }
    return d;
}

// síla návratu 0..1 podle "držení" (w): zpoždění, pak pomalý rozjezd (ease-in)
float returnRampOf(float hold) {
    float holdT = uReturnDelay + uReturnRamp;
    if (holdT < 1e-4) return 1.0;
    float sinceHit = (1.0 - hold) * holdT;
    float r = smoothstep(0.0, 1.0, clamp((sinceHit - uReturnDelay) / max(uReturnRamp, 1e-3), 0.0, 1.0));
    return r * r;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    vec4 dnaP = texture2D(tDnaPosition, uv);
    float dnaRest = (1.0 - step(0.001, uTransitionProgress)) * (1.0 - step(dnaP.w, 0.0));
    // odtržený particl se připojí zpět, jakmile začne morph do projektu (nebo je odtržení vypnuté)
    float esc = step(1.5, vel.w) * dnaRest * uEscOn * uPhysReturn;
    // ... nebo sám po uEscLife s (pak ho oblouky návratu dovedou domů)
    if (vel.w > 1.5 && (esc < 0.5 || vel.w - 2.0 > uEscLife)) { vel.w = 0.0; esc = 0.0; }
    
    // AGENT NOTE (from User): 
    // ALWAYS USE VELOCITY BRUSH. NEVER USE REPULSIVE FORCE.
    // Standing still must do NOTHING. Only mouse velocity (uMouseVel) pushes particles.
    
    // MYŠ & TEKUTINA
    float t = dot(pos.xyz - uMousePos, uMouseDir);
    if (t > 0.0 && t < 100.0) {
        vec3 closestPt = uMousePos + uMouseDir * t;
        float d = distance(pos.xyz, closestPt);
        
        if (d < uMouseRadius) {
            float f = 1.0 - (d / uMouseRadius);
            f = smoothstep(0.0, 1.0, f);
            
            // Síla slábne s hloubkou, ale dosáhne až na konec válce (100.0)
            float depthFalloff = 1.0 - (t / 100.0);
            
            vec3 push = uMouseVel * f * (uMouseForce * 8.0);
            
            vel.xyz += push * depthFalloff;
        }
    }
    
    // VODA: particl se přizpůsobuje proudu tekutiny (dojezd, víření, rozrážení). Jen přední vrstva
    // particlů (do uFrontShell za nejbližším particlem v té části obrazovky), zadní zůstanou.
    // Proud je v obrazovce -> přepočet na 3D posun podle hloubky: blízké i vzdálené se vizuálně hýbou stejně.
    float friction = 0.90;
    float disturb = 0.0; // jak silně voda particl tento snímek tlačí (0..1) -> odloží návrat k cíli
    if (uFluidOn > 0.5) {
        friction = uFriction;
        vec4 c = uMVP * vec4(pos.xyz, 1.0);
        vec2 suv = c.xy / max(c.w, 1e-4) * 0.5 + 0.5;
        if (c.w > 0.0 && suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
            // přední vrstva podle klidového tvaru (viz REST_TARGET_GLSL)
            vec4 rc = uMVP * vec4(restTarget(uv), 1.0);
            vec2 ruv = rc.xy / max(rc.w, 1e-4) * 0.5 + 0.5;
            float frontInv = texture2D(tFront, ruv).x;
            float behind = frontInv > 0.0 ? rc.w - 1.0 / frontInv : 0.0;
            float front = 1.0 - smoothstep(uFrontShell * 0.5, uFrontShell, behind);
            // volný particl není ve tvaru -> přední vrstva pro něj neplatí, voda ho tlačí vždy (vlastní síla)
            front = mix(front, uEscMouse, esc);
            vec3 fl = texture2D(tFluid, suv).xyz; // xy = proud, z = stopa myši
            vec2 ndc = fl.xy * smoothstep(0.1, 0.7, fl.z) * uFluidTexel * 2.0 * uDt; // posun v NDC za snímek, jen ve stopě
            vec3 flow = (uCamRight * (ndc.x * c.w / uProj.x) + uCamUp * (ndc.y * c.w / uProj.y)) * uFluidForce;
            // proud strhává jen když je rychlejší než particl; slábnoucí/mizející stopa ho nebrzdí
            // -> po zastavení myši dál klouže vlastní hybností (dojezd), brzdí ho jen odpor vody
            float grab = smoothstep(0.8, 1.3, length(flow) / (length(vel.xyz) + 1e-6));
            vel.xyz += (flow - vel.xyz) * uCoupling * front * grab;
            // vlna: zrychlení -grad(výška) -> hřbet od tahu postupně odtlačí particly ven, pak je vrátí
            vec2 wt = uFluidTexel;
            vec2 grad = vec2(texture2D(tWave, suv + vec2(wt.x, 0.0)).r - texture2D(tWave, suv - vec2(wt.x, 0.0)).r,
                             texture2D(tWave, suv + vec2(0.0, wt.y)).r - texture2D(tWave, suv - vec2(0.0, wt.y)).r) * 0.5;
            // rozrážení: tok energie vlny F = -(dh/dt)*grad(h) míří vždy ve směru šíření (od tahu ven)
            // -> particly jen kmitají (grad) + trvale se odsunou ven (drift), pak je vrátí pružina k cíli
            // posun = výška × rychlost vlny: rychlá vlna přeběhne dřív, ale táhne rychleji -> stejný posun při každé rychlosti
            vec2 wv = texture2D(tWave, suv).rg;
            vec2 flux = -(wv.x - wv.y) * grad;
            // |flux| = krok hladiny × sklon; / krok vlny = sklon² -> sqrt = sklon, jen kde vlna opravdu běží (stojící hrbol = 0)
            float fl2 = length(flux);
            // + 0.7: pomalou vlnu particl "vydrží" (drží ho pružina návratu) -> bez základu by pomalé vlny skoro nerozrážely
            vec2 drift = flux / (fl2 + 1e-7) * sqrt(fl2 / max(uWaveCStep, 1e-3)) * (uWaveC + 0.7) * 2.0; // NDC/s
            vec2 wndc = (drift * uWaveDrift - grad * uWaveForce * uWaveC * uFluidTexel) * uDt;
            vel.xyz += (uCamRight * (wndc.x * c.w / uProj.x) + uCamUp * (wndc.y * c.w / uProj.y)) * uFluidForce * front;
            // tlak v obrazovce (NDC/s): proud + vlna; slabé doběhy vln návrat neodkládají
            float pushNdc = (length(ndc) + length(wndc)) / max(uDt, 1e-4) * uFluidForce * front;
            disturb = smoothstep(0.02, 0.2, pushNdc);
        }
    }
    // w = "držení": 1 = právě strčen, lineárně klesá k 0 za (zpoždění + náběh); poziční shader z něj počítá sílu návratu
    // odtržený: w = 2 + čas od zlomu (strop 60 s)
    vel.w = esc > 0.5 ? min(vel.w + uDt, 62.0) : max(vel.w - uDt * uHoldDecay, disturb);

    // Tření - zpomalí "cáknutí" (friction = za snímek při 60 fps, přepočet na skutečné dt)
    // (volné mají vlastní tření níže – brzdí jen odchylku od plutí)
    if (esc < 0.5) vel.xyz *= pow(friction, uDt * 60.0);

    // Návrat pružinou: zrychlení k cíli, rychlost se nemaže -> hybnost i víření dobíhají do návratu.
    // vel je posun za snímek -> přírůstek = K * výchylka * dt².
    // platí v klidu tvaru projektu i v klidu DNA (ne během morphu; rezervní kostka u kamery jede napevno)
    float projRest = step(0.999, uTransitionProgress);
    float phys = uPhysReturn * (projRest + dnaRest);
    if (esc > 0.5) {
        // VOLNÝ: pluje pomalým vířivým proudem prostorem, drží se v okolí domova (měkké vodítko),
        // rychlost se jen pomalu blíží cestovní -> strčení myší dojíždí dlouho (vesmír)
        vec3 toH = dnaP.xyz - pos.xyz;
        float dh = length(toH);
        float ph = fract(sin(dot(uv, vec2(39.3468, 11.1353))) * 24634.6345) * 6.2831853;
        vec3 q = pos.xyz * uEscScale + vec3(0.0, uTime * 0.07, 0.0);
        vec3 flow = vec3(sin(q.y * 1.7 + ph) + sin(q.z * 2.3 + uTime * 0.11),
                         sin(q.z * 1.9 + ph * 0.7) + sin(q.x * 2.1 - uTime * 0.09),
                         sin(q.x * 1.3 + ph * 1.3) + sin(q.y * 2.7 + uTime * 0.13));
        float fl = length(flow);
        vec3 want = fl > 1e-4 ? flow / fl : vec3(0.0, 1.0, 0.0);
        if (dh > 1e-4) want += toH / dh * smoothstep(uEscLeash * 0.6, uEscLeash, dh) * 2.5;
        float wl = length(want);
        want = wl > 1e-4 ? want / wl : vec3(0.0, 1.0, 0.0);
        // za hranicí dosahu pluje domů rychleji (měkce, úměrně přesahu)
        vec3 cruise = want * (uEscDrift + max(dh - uEscLeash, 0.0) * 0.3) * uDt;
        vel.xyz = cruise + (vel.xyz - cruise) * pow(uEscFriction, uDt * 60.0);
    } else if (phys > 0.5) {
        vec4 base = texture2D(tBasePosition, uv);
        float offset = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
        vec3 local = base.xyz + vec3(0.0, sin(uTime * uFloatSpeed + offset) * uFloatAmplitude, 0.0);
        vec3 tgt = projRest > 0.5 ? (uFinalMat * vec4(local, 1.0)).xyz : dnaP.xyz;
        float r = returnRampOf(vel.w);
        // Řízení místo pružiny: particl si drží rychlost a jen postupně stáčí směr k cíli omezeným
        // bočním zrychlením (uReturnTurn) -> rychlý opisuje široký oblouk, pomalý se otočí hned.
        // Rychlost se jen pozvolna blíží "dojezdové" (úměrné vzdálenosti) -> nikdo nezastaví a nejede rovně.
        vec3 toT = tgt - pos.xyz;
        float dist = length(toT);
        vec3 want = toT / max(dist, 1e-6);
        float s = length(vel.xyz);
        vec3 dir = s > 1e-7 ? vel.xyz / s : want;
        float cosA = clamp(dot(dir, want), -1.0, 1.0);
        vec3 side = want - dir * cosA;
        float sl = length(side);
        if (sl > 1e-5) side /= sl;
        // přesně od cíle: stoč se libovolně do strany (dir je tu jistě jednotkový); přesně k cíli / v cíli: netoč
        else if (cosA < 0.0) side = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        else side = vec3(0.0);
        // stáčení aspoň 1.3× "oběžné" (v²/vzdálenost) -> dráha se vždy stáčí dovnitř, nikdy nezůstane kroužit
        float turnA = max(uReturnTurn * uDt * uDt / max(s, 1e-7), 1.3 * s / max(dist, 1e-4));
        float turn = min(acos(cosA), turnA * r);
        dir = dir * cos(turn) + side * sin(turn);
        float sWant = dist * uReturnK * uDt;           // dojezdová rychlost (posun za snímek)
        s += (sWant - s) * (1.0 - exp(-uReturnDamp * r * uDt));
        vel.xyz = dir * s;
        // pružina: zrychlení přímo k domovu -> let od domova se brzdí (ne jen stáčí), dráha zůstává obloukem
        vel.xyz += toT * uReturnPull * r * uDt * uDt;
        // BOD ZLOMU: odfouknutý daleko -> část particlů se utrhne (záblesk, pak volně pluje)
        // jen když ho právě odfoukla voda (w > 0) – ne při přeletu na nové místo po přepnutí projektu
        float lucky = fract(sin(dot(uv, vec2(63.7264, 10.873)) + uEscSeed * 7.31) * 43758.5453);
        if (dnaRest * uEscOn > 0.5 && vel.w > 0.0 && dist > uEscDist && lucky < uEscChance) vel.w = 2.0;
        // VODÍTKO DNA: limit vzdálenosti od domova (odtržený particl ho tento snímek ještě nemá – od příštího pluje volně)
        if (dnaRest > 0.5 && uDnaLeash > 0.0 && vel.w < 1.5) {
            // každý particl má jiný limit (vodítko i dojezd, nezávislé losy) -> žádná společná „stěna“
            // rozhození r: násobek 1 ± 0,85·r (r 0,85 -> 0,28–1,72×); dřív pevně 0,6–1,4× jen u vodítka
            float hl = fract(sin(dot(uv, vec2(27.619, 57.583))) * 43758.5453);
            float hs = fract(sin(dot(uv, vec2(91.137, 13.719))) * 24634.6345);
            float lim = uDnaLeash * mix(1.0, 0.15 + 1.7 * hl, uDnaLimRand);
            vec3 nextP = pos.xyz + vel.xyz;
            vec3 off = nextP - tgt;
            float ol = length(off);
            // dojezd podél DNA: blízko struktury (do uDnaLeash) smí o uDnaSlide.x dál
            if (uDnaSlide.x > 0.0 && uDnaSlide.z > 0.5 && ol > lim * 0.5)
                lim += uDnaSlide.x * mix(1.0, 0.15 + 1.7 * hs, uDnaLimRand) * (1.0 - smoothstep(uDnaLeash * 0.5, uDnaLeash, dnaStructDist(nextP)));
            if (ol > lim * 0.5) {
                vec3 n = off / ol;
                float b = smoothstep(lim * 0.6, lim, ol);
                // rychlost ven se u limitu pohltí
                float vr = dot(vel.xyz, n);
                if (vr > 0.0) vel.xyz -= n * vr * b;
                // BRZDA celé rychlosti (i do strany) – jen dokud ho strká voda, návrat nebrzdí (r = náběh návratu)
                // -> zastaví se jako o brzdu, neklouže po limitu (dojem neviditelné stěny)
                vel.xyz *= 1.0 - b * (1.0 - r) * (1.0 - exp(-uDnaSlide.y * uDt));
                // přesah za limitem měkce vrátit (~6/s)
                if (ol > lim) vel.xyz -= n * (ol - lim) * (1.0 - exp(-6.0 * uDt));
            }
        }
    }
    
    gl_FragColor = vel;
}
`;

const fragmentShaderPos = TEX_LOD0 + `
uniform float uTime;
uniform float uFloatSpeed;
uniform float uFloatAmplitude;
uniform float uReturnSpeed;
uniform float uReturnDelay;   // s po strčení vodou, než začne návrat k cíli
uniform float uReturnRamp;    // s, za které se síla návratu rozjede od 0 do plné (ease-in)
uniform float uPhysReturn;    // 1 = návrat řeší pružina ve velocity shaderu, tady se pozice netáhne
uniform float uScatter;
uniform float uTransitionProgress;
uniform sampler2D tBasePosition;
uniform sampler2D tDnaPosition;
// World matrix of the project node group (page offset + inside pivot + node transform).
// The particle mesh renders in world space (inverse group), so project shape targets
// stored in node-local space must be lifted into world space here.
uniform mat4 uFinalMat;
// Pohyb uFinalMat od minulého snímku (rotace INSIDE, gyro myši). Particly se s ním unášejí jako
// solidy – jinak by cíl dobíhaly po tětivě (zaostávání + při rychlé rotaci stažení ke středu).
uniform mat4 uDeltaMat;
uniform float uCarry;         // 0 = jen dobíhají cíl, 1 = unášené přesně jako solidy
uniform float uDeltaAngle;    // úhel rotace uDeltaMat za snímek (rad)
// Camera world Y - the "reserve cube" of surplus particles (dna.w < 0) rides with the camera, out of view.
uniform float uCameraY;
// "Emerge" (obsah k solidu): particly čekají ve spodní vrstvě a do tvaru je vytahuje řez 3D tisku
// jako jiskry pouštěné pozpátku. Vše odvozené od výšky řezu (ne od času) -> odtisk = stejná dráha dopředu.
uniform float uEmerge;        // 0 = vypnuto
uniform float uPrintY;        // world Y řezu (-1e4 = tisk nezačal, 1e4 = hotovo)
uniform float uPrintStart;    // world Y řezu na startu tisku (spodní particly nesmí vyskočit v půlce letu)
uniform vec4 uEmergeFloor;    // x = world Y horní hrany čekací vrstvy, y = tloušťka, z = rozptyl xz, w = výška oblouku (gravitace)
uniform vec4 uEmergeFlight;   // x = předstih (world Y), y = náhodnost předstihu, z = síla víření, w = odpor (drag)
// Kolize se solidy (SolidCollision.js): vlastní rovina povrchu každého particlu v lokálním prostoru nodu
// (xyz = normála ven, w = offset roviny; nula = particl daleko od solidu, bez kolize).
uniform sampler2D tSurfPlane;
uniform float uSurfOn;        // 0 = vypnuto / roviny ještě nejsou
uniform mat4 uFinalInv;       // world -> lokální prostor nodu (inverze uFinalMat)
uniform float uSurfMargin;    // přídavek k poloměru particlu (násobek poloměru)
uniform float uSurfMaxPen;    // max. průnik, který se ještě opravuje (lokální jednotky)

float emergeHash(vec2 p, float k) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + k * 17.137) * 43758.5453); }

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    vec4 base = texture2D(tBasePosition, uv);
    vec4 dna = texture2D(tDnaPosition, uv);
    
    // 0. Unášení s rotací skupiny (jen tvar projektu – váha tProgress; platí i pro rezervní particly, v INSIDE jsou součástí tvaru)
    // zbytek rotace, který particly jen dobíhají, je omezený na 0.2 * uReturnSpeed za snímek:
    // dozvuk max ~0.2 rad a poloměr drží (> 98 %) i při prudkém švihnutí
    float carry = max(uCarry, 1.0 - 0.2 * uReturnSpeed / max(uDeltaAngle, 1e-5));
    float carryW = carry * smoothstep(0.0, 1.0, uTransitionProgress);
    pos.xyz = mix(pos.xyz, (uDeltaMat * vec4(pos.xyz, 1.0)).xyz, carryW);

    // 1. Aplikace fyzikální rychlosti (momentum od myši)
    pos.xyz += vel.xyz;
    
    // 2. Výpočet cílové pozice s levitací (nastavitelná amplituda a rychlost)
    vec3 projLocal = base.xyz;
    // Per-particle phase derived from the texel (base.w now holds the project scale).
    float offset = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
    projLocal.y += sin(uTime * uFloatSpeed + offset) * uFloatAmplitude;
    vec3 projTarget = (uFinalMat * vec4(projLocal, 1.0)).xyz;
    float projScale = length(uFinalMat[0].xyz);

    float inFlight = 0.0;
    float landed = 1.0; // emerge: particl už doletěl do tvaru (čekající dole / v letu nekolidují)
    if (uEmerge > 0.5) {
        vec3 P = projTarget;
        float r1 = emergeHash(uv, 1.0), r2 = emergeHash(uv, 2.0), r3 = emergeHash(uv, 3.0), r4 = emergeHash(uv, 4.0);
        // čekací místo ve spodní vrstvě (pod vlastním cílem, trochu rozházené)
        vec3 R = vec3(P.x + (r1 - 0.5) * uEmergeFloor.z, uEmergeFloor.x - r2 * uEmergeFloor.y, P.z + (r3 - 0.5) * uEmergeFloor.z);
        // s: 0 = čeká dole, 1 = na místě. Doletí přesně, když řez projde jeho výškou.
        float lead = max(1e-3, uEmergeFlight.x * (1.0 - uEmergeFlight.y * r4));
        float arriveY = max(P.y, uPrintStart + lead);
        float s = clamp((uPrintY - arriveY + lead) / lead, 0.0, 1.0);
        // tau = čas jiskry (dopředu): 0 = vystřelena z cíle, 1 = dopadla do vrstvy. Pouštíme pozpátku.
        float tau = 1.0 - s;
        // jiskra: výstřel + gravitace, odpor vzduchu (drag) = rychlý start, zpomalování -> pozpátku zrychluje do cíle
        float k = uEmergeFlight.w;
        float fd = (1.0 - exp(-k * tau)) / (1.0 - exp(-k));
        vec3 g = vec3(0.0, -uEmergeFloor.w * (0.6 + r4 * 0.8), 0.0);
        vec3 D = R - P;
        vec3 arc = P + (D - 0.5 * g) * fd + 0.5 * g * tau * tau;
        // víření během letu (na koncích nulové)
        float env = 4.0 * tau * s;
        float ph = r1 * 6.2831853;
        arc += vec3(sin(tau * 9.0 + ph), sin(tau * 7.0 + ph * 1.7) * 0.5, cos(tau * 11.0 + ph * 2.3)) * uEmergeFlight.z * env;
        projTarget = arc;
        inFlight = step(0.0001, s) * step(s, 0.9999);
        landed = step(0.9999, s);
    }
    // Surplus particles (more project vertices than DNA vertices) are flagged with negative dna.w.
    // Their DNA-state target is relative to the camera height so the cube follows the camera.
    float isReserve = step(dna.w, 0.0);
    vec3 dnaTarget = dna.xyz + vec3(0.0, uCameraY * isReserve, 0.0);
    float dnaScale = abs(dna.w);
    
    // --- ORGANIC MORPH EFFECT ---
    // Smoothstep pro hezký náběh (ease-in-out)
    float tProgress = smoothstep(0.0, 1.0, uTransitionProgress);
    
    // Pozice: z DNA (při t=0) do tvaru projektu (při t=1)
    vec3 targetPos = mix(dnaTarget, projTarget, tProgress);
    
    // --- SCATTER EFFECT (Pro GlobalBackground) ---
    vec3 radial = normalize(base.xyz + vec3(0.001));
    vec3 randomDir = normalize(vec3(
        sin(offset * 132.34) * cos(offset * 342.12),
        cos(offset * 112.54),
        sin(offset * 211.11) * sin(offset * 313.22)
    ));
    vec3 scatterTarget = targetPos + (radial + randomDir) * 300.0; 
    targetPos = mix(targetPos, scatterTarget, uScatter);
    
    // 3. Hladký návrat k cíli
    // Reserve particles snap to the camera-relative cube while in ORBIT (no lag into view while scrolling),
    // and fly smoothly once the INSIDE morph starts.
    // po strčení vodou: zpoždění, pak pomalý rozjezd návratu (ease-in) místo okamžitého nejsilnějšího tahu
    float holdT = uReturnDelay + uReturnRamp;
    float sinceHit = (1.0 - vel.w) * holdT;
    float ramp = smoothstep(0.0, 1.0, clamp((sinceHit - uReturnDelay) / max(uReturnRamp, 1e-3), 0.0, 1.0));
    ramp = mix(1.0, ramp * ramp, step(1e-4, holdT)); // ease-in: pomalý start, pak zrychluje
    // vodní režim: návrat řídí velocity shader (v klidu projektu i DNA, rezervní kostka ne)
    ramp *= 1.0 - uPhysReturn * clamp(step(0.999, uTransitionProgress) + (1.0 - step(0.001, uTransitionProgress)) * (1.0 - isReserve), 0.0, 1.0);
    float returnSpeed = mix(uReturnSpeed * ramp, 1.0, isReserve * (1.0 - step(0.001, tProgress)));
    // jiskra v letu jede přesně po dráze (lag by oblouk rozmazal)
    returnSpeed = mix(returnSpeed, 0.6, inFlight * step(0.999, tProgress));
    pos.xyz += (targetPos - pos.xyz) * returnSpeed;

    // 4. Kolize se solidy: střed particlu musí být aspoň poloměr (+ margin) nad vlastní rovinou povrchu.
    //    Jen tam, kde už solid je (pod řezem 3D tisku), a jen doletěné particly (emerge: čekající dole / jiskry v letu ne).
    if (uSurfOn > 0.5 && landed > 0.5 && pos.y < uPrintY) {
        vec4 pl = texture2D(tSurfPlane, uv);
        if (dot(pl.xyz, pl.xyz) > 0.5) {
            vec3 lp = (uFinalInv * vec4(pos.xyz, 1.0)).xyz;
            float r = abs(pos.w) * (1.0 + uSurfMargin) / projScale; // poloměr v lokálních jednotkách
            float pen = r - (dot(lp, pl.xyz) - pl.w);
            // velký průnik = particl není u své plochy (morph, odlet) -> nechat být
            if (pen > 0.0 && pen < uSurfMaxPen) pos.xyz += normalize(mat3(uFinalMat) * pl.xyz) * pen * projScale * tProgress;
        }
    }

    // Uložíme interpolovanou velikost (scale) do w komponenty (vertex shader ji načte)
    // projektový scale je uložen v base.w
    pos.w = mix(dnaScale, base.w * projScale, tProgress);
    
    gl_FragColor = pos;
}
`;

// Všechny GPGPU systémy (i ty čekající na dispose – živé mají čerstvé `tick`). Čte DnaCore (odhalení páteře).
export const particleSystems = new Set();

// --- GPGPU HOOK ---
// Writes per-particle targets into the data textures.
// base = project shape (xyz) + project scale (w); dna = DNA state (xyz) + DNA scale (w, negative = reserve cube).
function writeTargets(size, particlesData, basePos, dnaPos, pos0) {
  const bd = basePos.image.data, dd = dnaPos.image.data, pd = pos0 ? pos0.image.data : null;
  const total = size * size;
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const p = particlesData[i];
    if (!p) continue;
    const dx = p.dnaX !== undefined ? p.dnaX : p.x;
    const dy = p.dnaY !== undefined ? p.dnaY : p.y;
    const dz = p.dnaZ !== undefined ? p.dnaZ : p.z;
    const ds = p.dnaScale !== undefined ? p.dnaScale : p.scale;
    bd[idx] = p.x; bd[idx + 1] = p.y; bd[idx + 2] = p.z; bd[idx + 3] = p.scale;
    dd[idx] = dx; dd[idx + 1] = dy; dd[idx + 2] = dz; dd[idx + 3] = ds;
    if (pd) { pd[idx] = dx; pd[idx + 1] = dy; pd[idx + 2] = dz; pd[idx + 3] = Math.abs(ds); }
  }
  basePos.needsUpdate = true;
  dnaPos.needsUpdate = true;
}

export function useGPGPU(count, particlesData, gl) {
  const [compute, setCompute] = useState(null);
  const pendingDisposeRef = useRef([]);
  const dataRef = useRef(particlesData);
  dataRef.current = particlesData;

  // The GPGPU system is (re)created ONLY when the particle count changes.
  // Switching projects (same nodes, different size/colour settings) must NOT rebuild it:
  // a rebuild costs a frame hitch and resets positions/scales -> visible DNA "blink".
  const hasData = !!(particlesData && particlesData.length);
  // Layout effect (not useEffect): setCompute here re-renders synchronously before the next frame.
  // With useEffect a freshly mounted object (e.g. doomsday -> showreel) rendered one frame without
  // GPGPU positions -> the DNA vanished for a frame (visible as a noise "blink").
  useLayoutEffect(() => {
    if (!count || !hasData) {
      setCompute(null);
      return;
    }
    
    const tMark = performance.now();
    const size = Math.ceil(Math.sqrt(count));
    const gpuCompute = new GPUComputationRenderer(size, size, gl);
    
    const pos0 = gpuCompute.createTexture();
    const vel0 = gpuCompute.createTexture(); // zero velocity
    const basePos = gpuCompute.createTexture();
    const dnaPos = gpuCompute.createTexture();
    writeTargets(size, dataRef.current, basePos, dnaPos, pos0);
    
    const velVar = gpuCompute.addVariable("textureVelocity", fragmentShaderVel, vel0);
    const posVar = gpuCompute.addVariable("texturePosition", fragmentShaderPos, pos0);
    
    gpuCompute.setVariableDependencies(velVar, [velVar, posVar]);
    gpuCompute.setVariableDependencies(posVar, [velVar, posVar]);
    
    velVar.material.uniforms.uMousePos = { value: new THREE.Vector3(9999,9999,9999) };
    velVar.material.uniforms.uMouseDir = { value: new THREE.Vector3(0,0,-1) };
    velVar.material.uniforms.uMouseVel = { value: new THREE.Vector3(0,0,0) };
    velVar.material.uniforms.uMouseRadius = { value: 2.0 };
    velVar.material.uniforms.uMouseForce = { value: 1.0 };
    Object.assign(velVar.material.uniforms, {
      uFluidOn: { value: 0 }, tFluid: { value: null }, uFluidTexel: { value: new THREE.Vector2() }, tFront: { value: null },
      uMVP: { value: new THREE.Matrix4() }, uCamRight: { value: new THREE.Vector3() }, uCamUp: { value: new THREE.Vector3() },
      uProj: { value: new THREE.Vector2(1, 1) }, uDt: { value: 1 / 60 }, uFluidForce: { value: 1 }, uCoupling: { value: 0.3 },
      uFriction: { value: 0.92 }, uFrontShell: { value: 0.12 }, tWave: { value: null }, uWaveForce: { value: 1 }, uWaveDrift: { value: 0 }, uWaveC: { value: 0 }, uWaveCStep: { value: 0.5 }, uHoldDecay: { value: 1 },
      uReturnK: { value: 0 }, uReturnDamp: { value: 0 }, uReturnTurn: { value: 10 },
      uEscOn: { value: 0 }, uEscDist: { value: 0.3 }, uEscChance: { value: 0.1 }, uEscSeed: { value: 0 }, uEscDrift: { value: 0.05 },
      uEscFriction: { value: 0.99 }, uEscLeash: { value: 1.5 }, uEscMouse: { value: 1 }, uEscScale: { value: 1.5 }, uEscLife: { value: 25 }, uReturnPull: { value: 0 }, uDnaLeash: { value: 0 },
      uDnaSlide: { value: new THREE.Vector3() }, uDnaLimRand: { value: 0.85 }, uDnaShape: { value: new THREE.Vector3() }, uDnaRungY: { value: new Array(MAX_RUNGS).fill(0) }, uDnaRungN: { value: 0 },
    });
    
    posVar.material.uniforms.uTime = { value: 0 };
    posVar.material.uniforms.uFloatSpeed = { value: 1.0 };
    posVar.material.uniforms.uFloatAmplitude = { value: 0.1 };
    posVar.material.uniforms.uReturnSpeed = { value: 0.05 };
    posVar.material.uniforms.uReturnDelay = { value: 0 };
    posVar.material.uniforms.uReturnRamp = { value: 0 };
    posVar.material.uniforms.uScatter = { value: 0.0 };
    posVar.material.uniforms.uTransitionProgress = { value: 1.0 }; // Default k 1.0 pro safety
    posVar.material.uniforms.tBasePosition = { value: basePos };
    posVar.material.uniforms.tDnaPosition = { value: dnaPos };
    posVar.material.uniforms.uFinalMat = { value: new THREE.Matrix4() };
    posVar.material.uniforms.uDeltaMat = { value: new THREE.Matrix4() };
    posVar.material.uniforms.uCarry = { value: 0 };
    posVar.material.uniforms.uDeltaAngle = { value: 0 };
    posVar.material.uniforms.uCameraY = { value: 0 };
    posVar.material.uniforms.uEmerge = { value: 0 };
    posVar.material.uniforms.uPrintY = { value: 1e4 };
    posVar.material.uniforms.uPrintStart = { value: -1e4 };
    posVar.material.uniforms.uEmergeFloor = { value: new THREE.Vector4() };
    posVar.material.uniforms.uEmergeFlight = { value: new THREE.Vector4() };
    posVar.material.uniforms.tSurfPlane = { value: null };
    posVar.material.uniforms.uSurfOn = { value: 0 };
    posVar.material.uniforms.uFinalInv = { value: new THREE.Matrix4() };
    posVar.material.uniforms.uSurfMargin = { value: 0.3 };
    posVar.material.uniforms.uSurfMaxPen = { value: 0.15 };
    
    // velocity shader počítá klidovou pozici (přední vrstva pro vodu) -> sdílené objekty uniforem cíle
    const pu = posVar.material.uniforms;
    const targetUniforms = { tBasePosition: pu.tBasePosition, tDnaPosition: pu.tDnaPosition, uFinalMat: pu.uFinalMat, uTransitionProgress: pu.uTransitionProgress, uCameraY: pu.uCameraY };
    Object.assign(velVar.material.uniforms, targetUniforms);
    pu.uPhysReturn = { value: 0 };
    // návrat pružinou (velocity shader) potřebuje stejný cíl i náběh jako poziční shader
    Object.assign(velVar.material.uniforms, { uPhysReturn: pu.uPhysReturn, uReturnDelay: pu.uReturnDelay, uReturnRamp: pu.uReturnRamp,
      uTime: pu.uTime, uFloatSpeed: pu.uFloatSpeed, uFloatAmplitude: pu.uFloatAmplitude });

    const error = gpuCompute.init();
    if (error !== null) console.error("GPGPU Error:", error);
    
    const computeObj = { gpuCompute, velVar, posVar, size, targetUniforms, disposed: false, writtenData: dataRef.current };
    setCompute(computeObj);
    mark(`GPGPU ${size}² (${count} particlů) vytvořen, JS ${(performance.now() - tMark).toFixed(1)} ms`);
    if (import.meta.env.DEV) { (window.__gpgpu = window.__gpgpu || new Set()).add(computeObj); }
    particleSystems.add(computeObj);

    // Disposal is deferred: after a dependency change the old system is still used for a frame or two
    // until React re-renders with the new one. Disposing immediately made three.js silently re-allocate
    // the render targets / data textures on the next compute() -> GPU texture leak + one-frame collapse.
    return () => { pendingDisposeRef.current.push(computeObj); };
  }, [count, hasData, gl]);

  // Same count, new targets (project switch / editor tweak): update the target textures in place.
  // Current particle positions live on in the ping-pong render targets, so particles glide to the
  // new targets instead of being reset.
  useLayoutEffect(() => {
    if (!compute || compute.disposed || !particlesData || compute.writtenData === particlesData) return;
    const u = compute.posVar.material.uniforms;
    writeTargets(compute.size, particlesData, u.tBasePosition.value, u.tDnaPosition.value, null);
    compute.writtenData = particlesData;
  }, [compute, particlesData]);

  // Flush deferred disposals once the new system has taken over (called from useParticleLogic)
  // and on unmount.
  const flushRef = useRef(null);
  flushRef.current = (keep) => {
    const pending = pendingDisposeRef.current;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i] === keep) continue;
      disposeCompute(pending[i]);
      pending.splice(i, 1);
    }
  };
  useEffect(() => () => flushRef.current(null), []);

  return compute ? Object.assign(compute, { flush: flushRef }) : null;
}

function disposeCompute(c) {
  if (!c || c.disposed) return;
  c.disposed = true;
  mark(`GPGPU ${c.size}² uvolněn`);
  if (import.meta.env.DEV) window.__gpgpu?.delete(c);
  particleSystems.delete(c);
  c.spinePoints?.geometry.dispose();
  c.spinePoints?.material.dispose();
  c.coverPoints?.material.dispose();
  const u = c.posVar.material.uniforms;
  // Data textures that are not owned by GPUComputationRenderer
  u.tBasePosition.value?.dispose();
  u.tDnaPosition.value?.dispose();
  c.front?.dispose();
  // Disposes render targets, initial value textures, materials and the fullscreen quad
  c.gpuCompute.dispose();
}

function mergeFluidCfg(prev, src) {
  const ov = import.meta.env.DEV ? window.__fluidOverride : null; // DEV ladění
  if (prev && prev.src === src && prev.ov === ov) return prev;
  return { ...FLUID_DEFAULTS, ...(src || {}), ...(ov || {}), src, ov };
}

// Klid DNA v ORBITu (config particlePhysics.dnaForce / dnaLeash, editor Uvnitř → Fyzika)
export const DNA_HOLD_DEFAULTS = {
  dnaForce: 0.6,   // násobek síly vody jen v klidu DNA (projekt INSIDE má plnou)
  dnaLeash: 0.45,  // world – jak daleko od místa v DNA smí particl odletět (každý 0.6–1.4×), 0 = bez vodítka (0.35 -> 0.45: víc místa pro odhalení jádra)
  // návrat v klidu DNA pomalejší než v projektu -> particly chvíli „visí“ venku a je vidět jádro (Oliver: moc krátké)
  dnaReturnDelay: 0.7, // s – zdržení po strčení vodou (projekt: returnDelay 0.15)
  dnaReturnRamp: 1.3,  // s – rozjezd návratu (projekt: returnRamp 0.8)
  dnaSlide: 0.6,       // world – o kolik dál smí particl od domova, dokud je blízko struktury DNA (0 = nic)
  dnaBrake: 40,        // 1/s – brzda u limitu (celá rychlost -> zastaví se, neklouže po limitu)
  dnaLimitRandom: 0.85, // 0..1 – náhodné rozhození limitu pro každý particl (0,85 -> 0,28–1,72×), 0 = všichni stejně
};

// Odtržené particly (config particlePhysics.escape, editor Uvnitř → Odtržené particly)
export const ESCAPE_DEFAULTS = {
  enabled: true,
  distance: 0.3,     // world – jak daleko od domova musí být odfouknutý, aby se utrhl (bod zlomu; < dnaLeash, jinak ho vodítko nepustí)
  chance: 0.05,      // podíl particlů, které se utrhnout můžou (0.12 -> 0.05: méně bordelu kolem DNA)
  drift: 0.2,        // world/s – rychlost pomalého plutí
  friction: 0.975,   // za snímek při 60 fps – jak dlouho dojíždí strčení myší
  leash: 1.0,        // world – jak daleko od domova smí odplout (2.0 -> 1.0: drží se u DNA)
  mouse: 1,          // násobek síly vody na volné
  flowScale: 2.2,    // velikost víření proudu (větší = drobnější víry -> sousedé se víc rozejdou)
  life: 12,          // s od zlomu, po kterých se sám připojí zpět
  color: '#ffb347',
  tint: 0.7,         // jak moc převezmou barvu
  flash: 1.2,        // jas záblesku v bodě zlomu (přičte se k barvě; ~1 = jen o trochu přes normál)
  flashTime: 0.6,    // s – doznění záblesku
  glow: 0.1,         // trvalá záře volných
  pop: 0.4,          // zvětšení při záblesku
};

// --- LOGIKA ---
export function useParticleLogic(meshRef, settings, appConfig, posY, compute) {
  const prevMouse = useRef(new THREE.Vector3(9999, 9999, 9999));
  const smoothedMouse = useRef(new THREE.Vector3(9999, 9999, 9999));
  const mouseVelocity = useMemo(() => new THREE.Vector3(), []);

  const planeNormal = useRef(new THREE.Vector3());
  const planePoint = useRef(new THREE.Vector3());
  const plane = useRef(new THREE.Plane());
  const rawTarget = useRef(new THREE.Vector3());
  const invMat = useRef(new THREE.Matrix4());
  const worldCameraPos = useRef(new THREE.Vector3());
  const localCameraPos = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());
  const fluidCfgRef = useRef(null);
  const mvp = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    const handleReset = () => {
      prevMouse.current.set(9999, 9999, 9999);
      smoothedMouse.current.set(9999, 9999, 9999);
      mouseVelocity.set(0, 0, 0);
    };
    window.addEventListener('blur', handleReset);
    window.addEventListener('focus', handleReset);
    return () => {
      window.removeEventListener('blur', handleReset);
      window.removeEventListener('focus', handleReset);
    };
  }, [mouseVelocity]);

  useFrame((state, delta) => {
    if (!meshRef.current || !compute || compute.disposed) return;
    const time = state.clock.getElapsedTime();
    
    if (settings.isGlobalLevitating) {
      meshRef.current.rotation.y = time * 0.15;
      meshRef.current.rotation.z = Math.sin(time * 0.05) * 0.1;
      meshRef.current.position.y = posY + Math.sin(time * 0.5) * 0.2;
    } else {
      meshRef.current.rotation.y = 0;
      meshRef.current.rotation.z = 0;
      meshRef.current.position.y = posY;
    }

    // DEV: window.__physOverride = { dnaSlide: 0, ... } přepíše particlePhysics živě
    const phys = import.meta.env.DEV && window.__physOverride ? { ...(appConfig?.particlePhysics || {}), ...window.__physOverride } : (appConfig?.particlePhysics || {});
    const velUniforms = compute.velVar.material.uniforms;
    const posUniforms = compute.posVar.material.uniforms;
    
    posUniforms.uTime.value = time;
    posUniforms.uFloatSpeed.value = phys.floatSpeed ?? 1.0;
    posUniforms.uFloatAmplitude.value = phys.floatAmplitude ?? 0.1;
    // Nové nastavení rychlosti návratu částic
    posUniforms.uReturnSpeed.value = phys.returnSpeed ?? 0.05;
    // v klidu DNA (ORBIT) vlastní zdržení a rozjezd návratu (tp z minulého snímku stačí)
    const dnaRest = posUniforms.uTransitionProgress.value < 0.001;
    posUniforms.uReturnDelay.value = Math.max(0, dnaRest ? (phys.dnaReturnDelay ?? DNA_HOLD_DEFAULTS.dnaReturnDelay) : (phys.returnDelay ?? 0.15));
    posUniforms.uReturnRamp.value = Math.max(0, dnaRest ? (phys.dnaReturnRamp ?? DNA_HOLD_DEFAULTS.dnaReturnRamp) : (phys.returnRamp ?? 0.8));
    velUniforms.uHoldDecay.value = 1 / Math.max(1e-3, posUniforms.uReturnDelay.value + posUniforms.uReturnRamp.value);
    velUniforms.uDt.value = Math.min(Math.max(delta, 1 / 240), 1 / 30);
    // unášení s rotací INSIDE (1 = particly drží se solidy, míň = zbytkový dozvuk)
    if (posUniforms.uCarry) posUniforms.uCarry.value = phys.rotationCarry ?? 0.85;
    
    if (settings.transitionProgress != null) {
      posUniforms.uTransitionProgress.value = settings.transitionProgress.get ? settings.transitionProgress.get() : settings.transitionProgress;
    }

    if (settings.scatterSpring) {
      // Umocněním na třetí získáme extrémně pomalý rozjezd (0.1^3 = 0.001) a rychlý konec
      posUniforms.uScatter.value = Math.pow(settings.scatterSpring.get(), 3.0);
    } else {
      posUniforms.uScatter.value = 0.0;
    }

    velUniforms.uMouseRadius.value = phys.mouseRadius ?? 2.0;
    const baseMouseForce = phys.mouseForce ?? 1.0;
    const mouseMult = settings.mouseMultiplier !== undefined ? Number(settings.mouseMultiplier) : 1.0;
    velUniforms.uMouseForce.value = baseMouseForce * mouseMult;

    // Rovina pro raycaster musí VŽDY směřovat ke kameře, jinak se při rotaci rozbije interakce
    state.camera.getWorldDirection(planeNormal.current);
    planeNormal.current.negate(); // Normála směřuje proti pohledu kamery
    
    meshRef.current.getWorldPosition(planePoint.current); 
    plane.current.setFromNormalAndCoplanarPoint(planeNormal.current, planePoint.current);
    const hasIntersection = state.raycaster.ray.intersectPlane(plane.current, rawTarget.current);
    
    invMat.current.copy(meshRef.current.matrixWorld).invert();
    
    // Získat SKUTEČNOU světovou pozici kamery, ne její lokální [0,0,0] z rigu!
    state.camera.getWorldPosition(worldCameraPos.current);
    localCameraPos.current.copy(worldCameraPos.current).applyMatrix4(invMat.current);

    // Vodnatá fyzika (ParticleFluid.js) nahrazuje starý štětec; config particlePhysics.fluid.enabled = false -> starý štětec
    const fluidCfg = fluidCfgRef.current = mergeFluidCfg(fluidCfgRef.current, phys.fluid);
    let fluidOn = false;
    if (fluidCfg.enabled) {
      const fluid = getFluid(state.gl);
      prof.scope('fluid (voda myši)');
      fluid.update(state, delta, fluidCfg);
      prof.end();
      fluidOn = !!fluid.velocity;
      if (fluidOn) {
        const mesh = meshRef.current, cam = state.camera;
        mvp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(mesh.matrixWorld);
        const invScale = 1 / Math.max(1e-6, mesh.matrixWorld.getMaxScaleOnAxis());
        velUniforms.uCamRight.value.setFromMatrixColumn(cam.matrixWorld, 0).transformDirection(invMat.current).multiplyScalar(invScale);
        velUniforms.uCamUp.value.setFromMatrixColumn(cam.matrixWorld, 1).transformDirection(invMat.current).multiplyScalar(invScale);
        velUniforms.uProj.value.set(cam.projectionMatrix.elements[0], cam.projectionMatrix.elements[5]);
        velUniforms.uMVP.value.copy(mvp);
        velUniforms.tFluid.value = fluid.velocity;
        velUniforms.tWave.value = fluid.wave;
        velUniforms.uWaveForce.value = fluidCfg.waveForce;
        velUniforms.uWaveDrift.value = fluidCfg.waveDrift;
        velUniforms.uWaveC.value = fluid.waveCEff ?? 0;
        velUniforms.uWaveCStep.value = fluid.waveCStep ?? 0.5;
        velUniforms.uFluidTexel.value.copy(fluid.texel);
        velUniforms.uDt.value = Math.min(Math.max(delta, 1 / 240), 1 / 30);
        // celková síla: násobí vše, co voda particlům dává (proud i vlny); v klidu DNA (ORBIT) × dnaForce
        const inDna = posUniforms.uTransitionProgress.value < 0.001;
        velUniforms.uFluidForce.value = mouseMult * Math.max(0, fluidCfg.strength ?? 1) * (inDna ? Math.max(0, phys.dnaForce ?? DNA_HOLD_DEFAULTS.dnaForce) : 1);
        velUniforms.uCoupling.value = fluidCfg.coupling;
        velUniforms.uFriction.value = fluidCfg.friction;
        velUniforms.uFrontShell.value = fluidCfg.frontShell;
        // mapa nejbližších particlů (klidový tvar)
        if (!compute.front) compute.front = createFrontPass(compute.size, compute.targetUniforms);
        const fh = Math.max(16, Math.round(fluidCfg.frontRes));
        prof.scope(`fluid front mapa ${compute.size}²`);
        compute.front.render(state.gl, mvp,
          Math.max(16, Math.round(fh * state.size.width / state.size.height)), fh, fluidCfg.frontPointSize);
        prof.end();
        velUniforms.tFront.value = compute.front.texture;
      }
    }
    velUniforms.uFluidOn.value = fluidOn ? 1 : 0;
    // vodní režim: návrat jako tlumená pružina v rychlosti (ne během emerge letu ani scatteru – ty jedou po dráze)
    // (v klidu DNA emerge nic nedělá – cíl je DNA; dřív tu obsah se solidem v ORBITu jel bez fyziky i vodítka)
    const emergeBusy = posUniforms.uEmerge.value > 0.5 && posUniforms.uPrintY.value <= 1e3 && posUniforms.uTransitionProgress.value >= 0.001;
    posUniforms.uPhysReturn.value = fluidOn && !emergeBusy && posUniforms.uScatter.value < 1e-4 ? 1 : 0;
    {
      // rychlost návratu (podíl za snímek při 60 fps) -> vlastní frekvence pružiny se stejně dlouhým návratem
      const rs = Math.min(0.95, Math.max(1e-4, posUniforms.uReturnSpeed.value));
      // returnStrength = násobek jen pro vracející se particly (odtržené neovlivní)
      const omega = Math.min(25, -Math.log(1 - rs) * 60 * 1.5);
      // returnStrength = pružina k domovu jen pro vracející se (odtržené neovlivní)
      velUniforms.uReturnPull.value = omega * omega * 0.16 * Math.max(0, phys.returnStrength ?? 1);
      const zeta = Math.max(0.05, phys.returnDamping ?? 0.7);
      velUniforms.uReturnK.value = omega * 0.7;
      velUniforms.uReturnDamp.value = zeta * omega;
      // oblouk 0 = ostré otočky, 1 = hodně široké oblouky
      const arc = Math.min(1, Math.max(0, phys.returnArc ?? 0.5));
      velUniforms.uReturnTurn.value = omega * omega * 0.08 * Math.pow(40, 1 - 2 * arc);
    }
    velUniforms.uDnaLeash.value = Math.max(0, phys.dnaLeash ?? DNA_HOLD_DEFAULTS.dnaLeash);
    velUniforms.uDnaLimRand.value = Math.min(1, Math.max(0, phys.dnaLimitRandom ?? DNA_HOLD_DEFAULTS.dnaLimitRandom));
    velUniforms.uDnaSlide.value.set(Math.max(0, phys.dnaSlide ?? DNA_HOLD_DEFAULTS.dnaSlide), Math.max(0, phys.dnaBrake ?? DNA_HOLD_DEFAULTS.dnaBrake), dnaShape.valid ? 1 : 0);
    if (compute.dnaShapeVer !== dnaShape.version) {
      compute.dnaShapeVer = dnaShape.version;
      velUniforms.uDnaShape.value.set(dnaShape.th0, dnaShape.k, dnaShape.R);
      for (let i = 0; i < MAX_RUNGS; i++) velUniforms.uDnaRungY.value[i] = dnaShape.rungs[i] ?? 0;
      velUniforms.uDnaRungN.value = Math.min(MAX_RUNGS, dnaShape.rungs.length);
    }
    // odtržené particly (jen v klidu DNA)
    const esc = { ...ESCAPE_DEFAULTS, ...(phys.escape || {}) };
    velUniforms.uEscOn.value = esc.enabled ? 1 : 0;
    velUniforms.uEscDist.value = esc.distance;
    velUniforms.uEscChance.value = esc.chance;
    velUniforms.uEscDrift.value = esc.drift;
    velUniforms.uEscFriction.value = esc.friction;
    velUniforms.uEscLeash.value = esc.leash;
    velUniforms.uEscMouse.value = esc.mouse;
    velUniforms.uEscScale.value = esc.flowScale;
    velUniforms.uEscLife.value = Math.min(59, esc.life);
    // při každém odchodu z DNA jiný los -> příště se utrhnou jiné particly
    if (posUniforms.uTransitionProgress.value > 0.001) compute.escLeft = true;
    else if (compute.escLeft) { compute.escLeft = false; velUniforms.uEscSeed.value = (velUniforms.uEscSeed.value + 1) % 1000; }

    if (hasIntersection && !fluidCfg.enabled) {
      meshRef.current.worldToLocal(rawTarget.current);

      if (smoothedMouse.current.x === 9999) {
        smoothedMouse.current.copy(rawTarget.current);
        prevMouse.current.copy(rawTarget.current);
      } else {
        smoothedMouse.current.lerp(rawTarget.current, 0.4);
      }

      mouseVelocity.subVectors(smoothedMouse.current, prevMouse.current);
      mouseVelocity.clampLength(0, 2.0);
      prevMouse.current.copy(smoothedMouse.current);

      rayDir.current.subVectors(smoothedMouse.current, localCameraPos.current).normalize();
      
      velUniforms.uMousePos.value.copy(localCameraPos.current);
      velUniforms.uMouseDir.value.copy(rayDir.current);
      velUniforms.uMouseVel.value.copy(mouseVelocity);
    } else {
      velUniforms.uMousePos.value.set(9999,9999,9999);
      velUniforms.uMouseVel.value.set(0,0,0);
    }
    
    posUniforms.uCameraY.value = worldCameraPos.current.y;
    compute.tick = performance.now(); // živý systém (odložené k dispose se nepočítají) – čte DnaCore
    prof.scope(`particly GPGPU ${compute.size}²`);
    compute.gpuCompute.compute();
    prof.end();
    
    const tex = compute.gpuCompute.getCurrentRenderTarget(compute.posVar).texture;
    // vzhled odtržených (barva + záblesk) – materiál čte stav z textury rychlostí
    const mu = meshRef.current.material?.uniforms?.tVelocities ? meshRef.current.material.uniforms : meshRef.current.material?.userData?.shader?.uniforms;
    if (mu?.tVelocities) {
      mu.tVelocities.value = compute.gpuCompute.getCurrentRenderTarget(compute.velVar).texture;
      mu.uEscColor.value.set(esc.color);
      mu.uEscTint.value = esc.tint;
      mu.uEscFlash.value = esc.flash;
      mu.uEscFlashTime.value = esc.flashTime;
      mu.uEscGlow.value = esc.glow;
      mu.uEscPop.value = esc.pop;
      if (mu.uEscLife) mu.uEscLife.value = Math.min(59, esc.life);
    }
    
    if (meshRef.current.material) {
        if (meshRef.current.material.uniforms && meshRef.current.material.uniforms.tPositions) {
            meshRef.current.material.uniforms.tPositions.value = tex;
        } else if (meshRef.current.material.userData && meshRef.current.material.userData.shader) {
            meshRef.current.material.userData.shader.uniforms.tPositions.value = tex;
        } else if (meshRef.current.material.type === 'MeshPhysicalMaterial') {
            if (!meshRef.current.material.onBeforeCompile.__injected) {
               const original = meshRef.current.material.onBeforeCompile;
               meshRef.current.material.onBeforeCompile = (shader, renderer) => {
                   shader.uniforms.tPositions = { value: tex };
                   meshRef.current.material.userData.shader = shader;
                   original(shader, renderer);
               };
               meshRef.current.material.onBeforeCompile.__injected = true;
            }
        }
    }
    // The mesh now samples the current system's texture -> old systems can be freed safely.
    if (compute.flush) compute.flush.current(compute);
  });
}

// --- ADAPTIVNÍ SEGMENTACE GEOMETRIE PODLE POČTU ČÁSTIC ---
export function getAdaptiveSphereSegments(count, settings = {}) {
  if (settings.sphereSegments && Array.isArray(settings.sphereSegments)) {
    return settings.sphereSegments;
  }
  // 1. Do 20 000 částic (např. pozadí ~15k) -> 8x8 (112 trojúhelníků, plná kvalita pro velké/viditelné částice)
  if (!count || count <= 20000) {
    return [8, 8];
  }
  // 2. 20 000 - 60 000 částic -> 6x5 (48 trojúhelníků, 57% úspora)
  if (count <= 60000) {
    return [6, 5];
  }
  // 3. 60 000 - 120 000 částic -> 5x4 (30 trojúhelníků, 73% úspora)
  if (count <= 120000) {
    return [5, 4];
  }
  // 4. Nad 120 000 částic (např. obsah Xelithu 167k a 203k) -> 4x3 (16 trojúhelníků, 86% úspora)
  return [4, 3];
}
