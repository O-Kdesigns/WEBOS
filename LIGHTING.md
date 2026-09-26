# LIGHTING.md — světla, samosvítící prvky a post-processing podle scénářů

Mapa všeho, co ve WEBOSu „svítí“: skutečná three.js světla, falešná (shaderová) světla, samosvítící materiály a post-processing, který světlo přidává.
Podle scénářů je vidět, co je v který moment aktivní a na co to působí.

> **Pravidlo pro AI:** když najdeš světlo / světelný efekt, který tu chybí, nebo nějaký změníš či přidáš, **aktualizuj tento soubor ve stejném commitu**.
> Poslední revize: 2026-09-26 (commit e22f5bf + SolidLink).

---

## 1. Inventář zdrojů

### 1a. Skutečná three.js světla (ovlivní jen `MeshStandard/Physical` materiály — GLB meshe, solidy, ne-video particly)

| # | Světlo | Kde | Nastavení (config.json) | Poznámka |
|---|--------|-----|-------------------------|----------|
| L1 | **HDRI Environment `city`** | `App.jsx` `<Environment preset="city">` | `environmentIntensity` (0.8) | IBL odrazy + difúze na všech PBR materiálech. Na solidech tlumí `solidMaterial.reflections`. |
| L2 | **Kamerový spot** | `CameraSpotLight.jsx` | `cameraSpotLight` (intensity 25, angle 0.85, penumbra 0.85, **decay 0, distance 0**, mouseOffset 1.5) | Sedí na kameře, míří dopředu, cíl se posouvá s myší. Bez útlumu → na blízkých objektech přepaluje. Na solidech tlumí `solidMaterial.directLight`. |
| L3 | **Centrální point light** | `VolumetricLight.jsx` `CenterLight` | `volumetricLight` (lightIntensity 20, color, pos 0/0/0; distance 30, decay 2) | Uvnitř DNA na ose. Má i viditelné jádro (koule `lightSize` = 0 → teď neviditelná) a auru (`hasAura`, auraSize 2.2, auraOpacity 0.35) – `meshBasicMaterial`, `toneMapped=false`. Jeho pozice na obrazovce = střed god rays (P1). |
| L4 | **Horní spot** | `App.jsx`, ve skupině se `springScrollY` | pozice [0,15,0], intensity `hdriIntensity × 3` (=15), angle 0.8, penumbra 1, decay default (2) | Jede se scrollem. S útlumem 2 na 15 jednotek má na obsah jen malý vliv. |
| L5 | **Ambient** | `App.jsx`, stejná skupina | intensity 0.2 (natvrdo) | Plošné dosvícení. |

- **Stíny:** `<Canvas shadows>` je zapnuté, ale **žádné světlo nemá `castShadow`** → stíny se reálně nepočítají (`Grass.jsx` má cast/receive jen formálně).
- **GLB (`newworldorder.glb`) žádná světla neobsahuje** (`KHR_lights_punctual` chybí). Kdyby je export začal přidávat, přibudou do scény → zapsat sem.
- Tone mapping = výchozí R3F (ACES Filmic, sRGB výstup). `toneMapped=false` mají jen jádro a aura L3.

### 1b. Falešná / shaderová světla (žádné three.js světlo, počítá se v shaderu)

| # | Zdroj | Kde | Nastavení | Na co působí |
|---|-------|-----|-----------|--------------|
| F1 | **Jelly key + fill light** | `JellyVideoMaterial.js` | natvrdo: key `(0.35,0.85,0.55)`, fill `(-0.4,-0.3,0.7)`; lesk podle `roughness/metalness` particlů | Video particly (`colorMode: video`). Jelly je `ShaderMaterial` → **L1–L5 ho vůbec neovlivní**, svítí jen F1 + video uvnitř + Fresnel lem + SSS. |
| F2 | **Video uvnitř jelly** | tamtéž | `transmission`, `thickness`, `transitionMaxLight/MinDark` | Particly „svítí“ barvou videa (samosvit), při rotaci DNA se míchá tmavá/světlá (`uNoiseAmount`). |
| F3 | **Particly → solid** | `SolidLink.jsx` (`patchSolidLook`) | stránka `particlesSettings.particleLight` (Xelith: intensity 4, radius 0.3, wrap 0.5, barva z videa) | 12 sond (shluky particlů), barva = průměr videa (1×1 pass za snímek). Difúze + lesk + Fresnel lem (`solidMaterial.rim`) na solidu. |
| F4 | **Solid → particly** | `SolidLink.jsx` (`solidLightAt` v jelly) | `particlesSettings.solidLight` (Xelith: #ff6a2a, intensity 1, radius 0.35) | 8 sond ze solidu. Přisvítí jelly particly kolem solidu. |
| F5 | **Žár tisku → particly** | `SolidLink.jsx` driver | `solidLight.printHeat` (1) × `printFx.uPrintHeat` | Jen sondy blízko řezu (`uPrintY`) svítí barvou `uPrintGlow`. |

### 1c. Samosvítící prvky (nejsou osvětlené, samy vydávají barvu)

| # | Prvek | Kde | Nastavení |
|---|-------|-----|-----------|
| E1 | **Pozadí** | `DarkStudioBackground.jsx` | `backgroundSettings.color` (#0a0a0f), jednobarevné |
| E2 | **Atmosférický prach** | `AtmosphereDust.jsx` | `atmosphereDust` (4000 bodů, additive, bokeh, 4 barvy) |
| E3 | **Skla TV / video na deskách** | `TvGlass.jsx` | Blender custom props `tvRim`, `tvRimStrength`, `tvMilk`, `tvBackground`… Video jako portál, lem skla je samosvit. |
| E4 | **Video plátno INSIDE** | `VolumetricVideoBackground.jsx` | `volumetricVideo` (brightness 2.5, contrast 1.09, vignetteSoftness) |
| E5 | **Žhavá vrstva tisku** | `SolidPrint.jsx` | `solidPrint` (`coolColor`, `glowColor` #ff5a12, `hotColor`, `intensity`, `band`) – emise na řezu solidu + žhavé jádro přes řez (back-faces) |
| E6 | **Vlastní záře solidu** | `SolidLink.jsx` `uLookGlow` | `solidLight.selfGlow` (Xelith 0 = vypnuto) |

### 1d. Post-processing (`VolumetricLightPass` v `VolumetricLight.jsx`, jeden fullscreen shader + blur řetězec 1/4)

| # | Efekt | Nastavení | Kdy |
|---|-------|-----------|-----|
| P1 | **God rays ze středu DNA** (z pozice L3 na obrazovce, z jasných pixelů nad `threshold`) | `volumetricLight` (exposure, decay 0.92, density, weight, threshold 0.4, rayLength 2, maxRadius 0.73) | ORBIT (× `uVisibility` = jak moc kamera míří na L3), zhasínají s `uInsideTransition` |
| P2 | **Bloom** | `cinematic.bloomStrength` 1.2, `bloomThreshold` 0.35 | ORBIT; v INSIDE × `cinematic.insideBloom` (výchozí 0 = vypnuto) |
| P3 | **DOF** (ohnisko = osa DNA + `focusOffset`) | `cinematic.dofStrength/focusRange/blurRadius` | jen ORBIT |
| P4 | **Atmosférická záře** – 2 barevné skvrny v screen-space | `cinematic.atmoColor/X/Y/Size/Strength`, `atmo2*` | vždy (při `cinematic.enabled`) |
| P5 | **Zrno + viněta** | `cinematic.grain`, `cinematic.vignette` | vždy |
| P6 | **Hloubková mlha + kouř** | `insideFog` (masterFogIntensity 70, fogColor, fogNear/Far, smoke*, baseFogBrightness 2.5) | INSIDE |
| P7 | **Světlo myši** (volumetrické světlo + stíny kolem kurzoru, barva `uLightColor` = `volumetricLight.color`) | `insideFog.mouseLightExposure/Radius`, `enableMouseFog` | INSIDE |
| P8 | **Popředová mlha + viněta mlhy** | `insideFog.foregroundFog`, `vignette*`, `edgeFade` | INSIDE |
| P9 | **Ghost video** (video prosvítá do hloubky) | `volumetricDepth` (ghostStrength 0.35, startDistance, fadeRange) | INSIDE |
| P10 | **Středové paprsky z videa** | `volumetricDepth.rays*` | **v kódu vypnuté** (`uCenterRaysExposure = 0`) |
| P11 | **Záře + paprsky tisku** (maska žhavé vrstvy 1/4, paprsky ke kameře od `raysCenterX/Y`) | `solidPrint.raysStrength` 10, `rayLength` 0.9 | jen během tisku/odtisku |
| P12 | **Kontrast HUD textu** (maska pod texty) | `ui2d` / `valueBoost`, `saturationBoost`… | vždy, kde je HUD text |

---

## 2. Scénáře

### 🧬 ORBIT (DNA šroubovice, desky, výběr projektu)
- **Světla:** L1 HDRI city, L2 kamerový spot, L3 centrální point (uvnitř DNA), L4 horní spot, L5 ambient → osvětlují GLB meshe (desky `GlassDesk` apod., `meshPhysicalMaterial`).
- **DNA particly (jelly):** scénická světla na ně nepůsobí → F1 key/fill + F2 video uvnitř. Při rotaci se míchá tmavá/světlá (`transitionMaxLight/MinDark`). F3–F5 jsou vypnuté (solidy jsou skryté, `SolidLinkDriver` má amount 0).
- **Samosvit:** E1 pozadí, E2 prach, E3 skla TV s videem, aura/jádro L3.
- **Post:** P1 god rays ze středu DNA, P2 bloom, P3 DOF, P4 atmosférické skvrny, P5 zrno + viněta, P12 HUD.

### 🌀 PRŮLET PORTÁLEM (`portalFx.progress` 0 → 1, 2 s)
- Vše z ORBITu, kamera jede k `Camera_In` (L2 jede s ní).
- Sklo aktivní desky se u kamery rozpouští po pixelech (E3, `nearStart/nearEnd`).
- **Post:** při `progress` 0.6–0.85 (`portal.insideFrom/insideTo`) se prolne ORBIT → INSIDE. Tedy P1/P3 slábnou a P2 klesne na `insideBloom`, zatímco P6–P9 nabíhají.
- Particly morphují DNA → tvar projektu (`transitionProgress`).

### 🎥 INSIDE — před tiskem / po dotištění (solidy stojí)
- **Světla:** L1–L5 pořád existují (nic se nevypíná podle viewMode). Kamerový spot L2 svítí na solidy zepředu. Proto `solidMaterial.directLight` (Xelith 0.22) tlumí L2–L5 a `reflections` (0.25) tlumí L1.
- **Solidy** (`MeshStandard` z GLB + `patchSolidLook`): vlastní barva/kov/drsnost, tiskové rýhy, zrno. F3 je přisvítí barvou videa z okolních particlů a přidá lem.
- **Particly (jelly):** F1 + F2, F4 přisvícení od solidu (oranžové #ff6a2a, síla 1).
- **Samosvit:** E4 video plátno, E2 prach. E6 je vypnuté.
- **Post:** P6 mlha + kouř, P7 světlo myši, P8 popředová mlha, P9 ghost video, P4 + P5, P2 jen × `insideBloom` (0), P12.
- F3/F4 běží jen při `printFx.progress > 0` (= solid je aspoň částečně vytištěný). Náběh je přes `smoothstep(transitionProgress, 0.6, 1)`.

### 🔥 INSIDE — aktivní 3D tisk (a odtisk při odchodu)
- **Vše ze scénáře INSIDE**, navíc:
  - **E5:** žhavá vrstva na řezu solidu (`uPrintY`) + žhavé jádro přes řez.
  - **F5:** žár tisku svítí na particly jen v pásu u řezu. Barva F4 se míchá do `uPrintGlow` podle podílu žáru.
  - **F3:** pořád svítí na už vytištěnou část.
  - **P11:** maska žhavé vrstvy prosvítí přes mlhu INSIDE + paprsky od vrstvy ke kameře.
- Start: až po `portalFx.progress = 1` a `transitionProgress > 0.97`.
- Při odchodu (`leaving`) se tiskne pozpátku (odtisk) se stejnými efekty, pak ORBIT a průlet zpět. F3/F4 dojedou na 0.

### 🛠 Editor
- Globální světla: sekce Kamera (L2), Volumetric (L3 + P1), Inside fog (P6–P8), Background (E1). `cinematic` a `atmosphereDust` jsou zatím jen v configu / DEV override.
- Per stránka: **Stránky → „💡 Solidy & světlo částic“** (F3, F4, F5, E6, materiál solidu), tlačítko „Výchozí předvolba (Xelith)“.

---

## 3. DEV ladění světel (jen `npm run dev`)
- `window.__cineOverride = {...}` → P2–P5 živě
- `window.__linkOverride = { solidMaterial, particleLight, solidLight }`, `window.__linkFx` → F3–F6
- `window.__printOverride = {...}`, `window.__printHold = 0..1`, `window.__printFx` → E5, P11
- `window.__portalHold = 0..1` → zmrazí průlet (prolnutí ORBIT/INSIDE postu)
- `window.__r3f.get().scene.traverse(o => o.isLight && console.log(o.type, o.intensity))` → výpis skutečných světel (kontrola, jestli nepřibylo nějaké z GLB)

## 4. Známé slabiny / nápady
- L2 bez útlumu (decay 0) přepaluje nejbližší objekty. U solidů se to kompenzuje přes `directLight`, u ostatních GLB meshů ne.
- L4 a L5 jsou natvrdo v `App.jsx` (bez configu a Editoru).
- `insideBloom` je 0 → žhavá vrstva tisku nemá bloom, záři dělá jen P11.
