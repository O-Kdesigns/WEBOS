import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { FLUID_DEFAULTS, getFluid, createFrontPass, REST_TARGET_GLSL } from './ParticleFluid';

// Pomocná funkce pro vygenerování palety
export const getColors = () => [
  new THREE.Color('#7CFC00'),
  new THREE.Color('#4169E1'),
  new THREE.Color('#FFFFE0'),
  new THREE.Color('#888888'),
  new THREE.Color('#228B22'),
];

// --- GPGPU SHADERS ---
const fragmentShaderVel = REST_TARGET_GLSL + `
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
uniform float uReturnK;        // tuhost pružiny (1/s²)
uniform float uReturnDamp;     // tlumení pružiny (1/s)
uniform float uReturnDelay;
uniform float uReturnRamp;
uniform float uTime;
uniform float uFloatSpeed;
uniform float uFloatAmplitude;

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
    vel.w = max(vel.w - uDt * uHoldDecay, disturb);

    // Tření - zpomalí "cáknutí" (friction = za snímek při 60 fps, přepočet na skutečné dt)
    vel.xyz *= pow(friction, uDt * 60.0);

    // Návrat pružinou: zrychlení k cíli, rychlost se nemaže -> hybnost i víření dobíhají do návratu.
    // vel je posun za snímek -> přírůstek = K * výchylka * dt².
    float phys = uPhysReturn * step(0.999, uTransitionProgress);
    if (phys > 0.5) {
        vec4 base = texture2D(tBasePosition, uv);
        float offset = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
        vec3 local = base.xyz + vec3(0.0, sin(uTime * uFloatSpeed + offset) * uFloatAmplitude, 0.0);
        vec3 tgt = (uFinalMat * vec4(local, 1.0)).xyz;
        float r = returnRampOf(vel.w);
        vel.xyz += (tgt - pos.xyz) * (uReturnK * r * uDt * uDt);
        vel.xyz *= exp(-uReturnDamp * r * uDt);
    }
    
    gl_FragColor = vel;
}
`;

const fragmentShaderPos = `
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
    ramp *= 1.0 - uPhysReturn * step(0.999, uTransitionProgress); // vodní režim: návrat je pružina v rychlosti
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
      uReturnK: { value: 0 }, uReturnDamp: { value: 0 },
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
    if (import.meta.env.DEV) { (window.__gpgpu = window.__gpgpu || new Set()).add(computeObj); }

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
  if (import.meta.env.DEV) window.__gpgpu?.delete(c);
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

    const phys = appConfig?.particlePhysics || {};
    const velUniforms = compute.velVar.material.uniforms;
    const posUniforms = compute.posVar.material.uniforms;
    
    posUniforms.uTime.value = time;
    posUniforms.uFloatSpeed.value = phys.floatSpeed ?? 1.0;
    posUniforms.uFloatAmplitude.value = phys.floatAmplitude ?? 0.1;
    // Nové nastavení rychlosti návratu částic
    posUniforms.uReturnSpeed.value = phys.returnSpeed ?? 0.05;
    posUniforms.uReturnDelay.value = Math.max(0, phys.returnDelay ?? 0.15);
    posUniforms.uReturnRamp.value = Math.max(0, phys.returnRamp ?? 0.8);
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
      fluid.update(state, delta, fluidCfg);
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
        velUniforms.uFluidForce.value = mouseMult;
        velUniforms.uCoupling.value = fluidCfg.coupling;
        velUniforms.uFriction.value = fluidCfg.friction;
        velUniforms.uFrontShell.value = fluidCfg.frontShell;
        // mapa nejbližších particlů (klidový tvar)
        if (!compute.front) compute.front = createFrontPass(compute.size, compute.targetUniforms);
        const fh = Math.max(16, Math.round(fluidCfg.frontRes));
        compute.front.render(state.gl, mvp,
          Math.max(16, Math.round(fh * state.size.width / state.size.height)), fh, fluidCfg.frontPointSize);
        velUniforms.tFront.value = compute.front.texture;
      }
    }
    velUniforms.uFluidOn.value = fluidOn ? 1 : 0;
    // vodní režim: návrat jako tlumená pružina v rychlosti (ne během emerge letu ani scatteru – ty jedou po dráze)
    const emergeBusy = posUniforms.uEmerge.value > 0.5 && posUniforms.uPrintY.value <= 1e3;
    posUniforms.uPhysReturn.value = fluidOn && !emergeBusy && posUniforms.uScatter.value < 1e-4 ? 1 : 0;
    {
      // rychlost návratu (podíl za snímek při 60 fps) -> vlastní frekvence pružiny se stejně dlouhým návratem
      const rs = Math.min(0.95, Math.max(1e-4, posUniforms.uReturnSpeed.value));
      const omega = Math.min(25, -Math.log(1 - rs) * 60 * 1.5);
      const zeta = Math.max(0.05, phys.returnDamping ?? 0.7);
      velUniforms.uReturnK.value = omega * omega;
      velUniforms.uReturnDamp.value = 2 * zeta * omega;
    }

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
    compute.gpuCompute.compute();
    
    const tex = compute.gpuCompute.getCurrentRenderTarget(compute.posVar).texture;
    
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
