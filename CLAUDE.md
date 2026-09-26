# CLAUDE.md — WEBOS Project Context

Tento soubor Claude Code načte automaticky při každé nové session. Drží základní orientaci a odkazuje na detailní soubory.

---

## Co je WEBOS

3D interaktivní webové portfolio. Kamera se pohybuje skrz vertikální **DNA šroubovici** (dvojitá helix) – scrollem kamera letí dolů, šroubovice se točí, na příčkách jsou projekty. Stack: React + Vite + Three.js + React Three Fiber.

**Branche:**
- `main` — aktuální DNA helix verze
- `backup/cylinder-version` — původní válcová verze (stabilní záloha)

---

## Kritické soubory projektu

| Soubor | Účel |
|--------|------|
| `GEMINI.md` | 15 výkonnostních pravidel (video, GPU, Zero-Alloc) – **MUSÍ se dodržovat** |
| `.agents/AGENTS.md` | Architektura scény, CMS, asset pipeline pravidla |
| `REMOTE_SETUP.md` | Git workflow, push před odchodem, GitHub Pages workflow |
| `src/App.jsx` | Hlavní orchestrace scény (~43KB) – VideoManager, videoTextureCache |
| `vite.config.js` | Plugin pro auto-skenování `public/obsah/` — **NEDOTÝKAT se bez konzultace** |

---

## Git & GitHub

- **Remote:** `git@github.com:O-Kdesigns/WEBOS.git`
- **SSH klíč:** `~/.ssh/github_webos` (O-Kdesigns účet)
- **Workflow:** časté commity lokálně → push před odchodem → GitHub Pages pro cloud preview

---

## Workflow: Claude Code + browser pane

1. `WEBOS.bat` spustí Claude Code + npm run dev + otevře Brave
2. V Claude Code browser pane: naviguj na `localhost:5173`
3. Říkej co chceš — Claude vidí stránku přímo, může scrollovat a číst

---

## Co je vyřešeno (od 2026-09-26)

- Git repozitář vyčištěn (git-filter-repo odstranil videa z historie): 2.8GB → 239MB
- SSH klíč vygenerován a přidán na GitHub O-Kdesigns účet
- Kód pushnut na GitHub (force push po filter-repo)
- `.gitignore` aktualizován: node_modules, dist, videa, blend soubory, debug logy
- LFS nastaven ale nepoužit — videa jsou jen lokálně (Pages fallback plánován)
- `WEBOS.bat` přepsán: Antigravity → Claude Code (Bionic → claude-desktop.exe)
- Browser pane funkční: Claude vidí a ovládá localhost:5173 přímo

---

## Particle architektura (DŮLEŽITÉ – čti před změnou particlů)

- **Single particle system:** DNA v ORBITu NENÍ samostatný objekt. Tvoří ji particly **aktivního projektu** (`ProjectContent` v `App.jsx` renderuje jen `pagesData[closestIndex]`). GPGPU (`particles/utils.js`) morphuje `tDnaPosition` → `tBasePosition` podle `transitionProgress` (0 = ORBIT/DNA, 1 = INSIDE/tvar projektu).
- **Souřadnice:** particle mesh je v `inverseGroup` → renderuje se ve **world space**. DNA cíle jsou world (`dnaMatrix`), tvar projektu je node-local a do world ho převádí `uFinalMat` v GPGPU shaderu.
- **Rezervní kostka:** projekt má víc particlů než DNA vertexů (DNA 16 463) → přebytek čeká v kostce ±12–16 nad/pod **kamerou** (`uCameraY`, flag = záporné `dna.w`).
- **Stránka bez particlů** (např. showreel) → fallback `DNA_ONLY_SETTINGS` (DNA z nodu `dna`), jinak by zmizela celá DNA.
- **GPGPU se přestavuje JEN při změně počtu particlů.** Přepnutí projektu (stejné nody, jiné nastavení) jen přepíše cílové textury `tBasePosition`/`tDnaPosition` in-place (`writeTargets`) → particly plynule doletí, žádný rebuild = žádný lag/probliknutí. `base.w` = projektový scale, levitační fáze se počítá hashem z UV. Náhoda v `GeometryParticleObject` je seedovaná (`rand(i,k)`), aby DNA byla při každém přepočtu identická.
- **Matice ve `useFrame`:** `matrixWorld` se obnovuje až při renderu (po `useFrame`). Pivot projektu při přepnutí skočí (yStep + rotace) → `GeometryParticleObject` volá `worldGroup.updateWorldMatrix(true,false)` před výpočtem inverze, jinak DNA + rezervní kostka na 1 snímek poskočí.
- **GPGPU se vytváří v `useLayoutEffect`** (ne `useEffect`), aby nově mountnutý objekt (doomsday → showreel) neměl jeden snímek bez pozic (probliknutí).
- **GPGPU dispose je odložený** (`pendingDisposeRef` + `flush`) – okamžitý dispose v cleanupu způsoboval GPU texture leak. Neměnit zpět.
- Node končící na `1` (např. `Particles_Xelith_Obsah1`) je dle `isSolidNode()` **solid**, ne particly.
- GLB `newworldorder.glb` obsahuje jen Xelith nody – doomsday nemá vlastní particle nody (v `settings.json` používá Xelith nody).
- Debug: v DEV je `window.__r3f` (R3F store) a `window.__gpgpu` (Set živých GPGPU systémů – `readRenderTargetPixels` na `gpuCompute.getCurrentRenderTarget(posVar)` pro kontrolu pozic). `__r3f.gl.info.memory` = počet textur/geometrií (kontrola leaků), `__r3f.get().camera` = aktuální kamera.
- Dev server: `.claude/launch.json` (`webos-dev`, port 5173).
- **Pozadí** (`DarkStudioBackground`) je jednobarevné = `config.backgroundSettings.color` (Editor → „Barva pozadí“). Žádný gradient.
- **🤖 AI živý render** (`src/AiLiveMode.js`) – checkbox vedle tlačítka Editor. Zapnuto = nikdy nepauzuje při ztrátě fokusu a v neaktivním tabu renderuje ~60 fps (Web Worker časovač + R3F `advance()`, když rAF vynechá). Ukládá se do localStorage (jen daný prohlížeč). **Claude: pokud má v browser pane nízká fps / zamrzlou scénu, zapni si ho** – `?ai=1` v URL nebo `window.__aiLive(true)`. Vypnuto = platí `powerSaving.pauseOnBlur` z configu (úsporný režim).

- **Cinematic vrstva (Active Theory look)** v `VolumetricLight.jsx`: DOF (ohnisko = vzdálenost kamery od osy DNA + `focusOffset`), bloom, atmosférická záře, zrno, viněta – vše z jednoho blur řetězce ve 1/4 rozlišení. Config `cinematic` (`enabled:false` vypne). V DEV lze ladit živě přes `window.__cineOverride = {...}`.
- **Televize (desky):** sklo = nody `TV_*` (dítě `GlassDesk`), `src/TvGlass.jsx`. Když má sklo video (`tvVideo`), `GlassDesk` se NEvykresluje – video kreslí shader skla jako portál v rovině GlassDesk (UV mapa se dopočítá z geometrie GlassDesk). Lom: scéna bez skla se 1× za snímek renderuje do 1/2 FBO (jen když je sklo ve frustu). Ladí se custom properties v Blenderu (`tvTint/tvRim/tvRimStrength/tvMilk/tvIor/tvDistort/tvFrost/tvScratch/tvBackground/tvRadius`). `tvBackground` drží jas scény za sklem nízko – jinak prosvítá jasný střed DNA do god rays (dřív ho blokovala neprůhledná deska). Nové nody NESMÍ začínat `GlassDesk` (`DnaHeightDetector` bere první dva `GlassDesk*` pro výšku DNA).
- **Blender pipeline:** zdroj `C:/WEBOS/ASSETS/newworldorderN.blend` (Claude ukládá jako `…6ai.blend`), export → `public/obsah/everything/newworldorder.glb`. Nastavení exportu je uložené ve scéně (`scene['glTF2ExportSettings']`: apply, cameras, extras, lights, loose verts). Headless: `"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b file.blend --python script.py`, export `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB', **settings)`.
- **3D tisk solidů** `src/SolidPrint.jsx`: solidy (nody končící na `1`) jsou v ORBITu skryté. Po vstupu do INSIDE, až se particly ustálí (`transitionProgress > 0.97`), vyrostou odspodu nahoru. Řez je ve world Y, výška se zmrazí při startu tisku. Vrstva u řezu žhne a přes řez je vidět žhavé jádro (back-faces). Žhavá vrstva se kreslí do 1/4 masky (proxy meshe – matrixWorld se musí kopírovat i do `matrix`, jinak je render přepíše na identitu; maska má stejnou hloubkovou mlhu jako INSIDE, jinak žhnou i části schované v mlze) a `VolumetricLight` z ní dělá paprsky jako god rays v ORBITu: tiskárna je ZA kamerou, paprsky vedou z vrstvy ke kameře = na obrazovce ven od úběžníku (`raysCenterX/Y`, výchozí 0.5/0.5). Config `solidPrint` (vše volitelné): `enabled, duration, delay, settle, exitSpeed, band, edgeNoise, intensity, layers, coolColor, glowColor, hotColor, raysStrength (10), rayLength (0.9), raysCenterX, raysCenterY`. DEV: `window.__printHold = 0..1` zmrazí fázi tisku, `window.__printOverride = {...}` nahradí config živě, `window.__printFx` = stav.
- **Průlet portálem** `src/PortalTransition.js`: `portalFx.progress` (0 = ORBIT, 1 = kamera v `Camera_In`, lineárně za `portal.duration` 2 s) řídí jízdu kamery (`CameraRig`, poloměr 5.9 → 2.16 + FOV kopnutí), vyjetí aktivní desky ven za kameru (`BlenderScene`, `deskPush` 1.6 – deska je na r 1.19, tedy blíž ose než Camera_In) a vzhled INSIDE ve `VolumetricLight` (naběhne až při průchodu sklem, `insideFrom/insideTo` 0.6–0.85). Sklo aktivní desky nemizí fadem, ale rozpouští se u kamery po pixelech (`uNear`, `nearStart/nearEnd` 0.3–1.8). Tisk začne až po `progress = 1`. Odchod: tlačítko nastaví `leaving` → nejdřív odtisk, `SolidPrintDriver.onUnprinted` → ORBIT → průlet zpět. DEV: `window.__portalHold = 0..1` zmrazí průlet, `window.__portalFx` = stav.
- **Atmosférický prach** `src/AtmosphereDust.jsx`: 4000 bodů s vlastním bokehem (1 draw call, animace jen ve shaderu). Config `atmosphereDust`.

---

## Plánováno (TODO)

- GitHub Pages deploy (GitHub Actions workflow)
- GitHub Pages video fallback: detekce `github.io` hostname → mini placeholder video
- Netlify auto-deploy (pro hotové production buildy)
- Doomsday: vlastní particle nody v GLB (teď sdílí Xelith nody)
- `App.jsx` má rozbité kódování českých komentářů/UI textů (mojibake, např. „ĂšspornĂ˝ reĹľim“) – opravit re-encodingem
- `App.jsx` má 1150+ řádků – porušuje pravidlo 12 (max 500), rozdělit do komponent
