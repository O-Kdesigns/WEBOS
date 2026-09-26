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
- **Úsporný režim GPU** (`powerSaving.pauseOnBlur`) – checkbox vedle tlačítka Editor, ukládá se hned do `config.json` přes `/api/settings` (vychází z on-disk configu, ne z neuloženého stavu editoru). Zápis configu způsobí reload stránky (Vite HMR).

- **Cinematic vrstva (Active Theory look)** v `VolumetricLight.jsx`: DOF (ohnisko = vzdálenost kamery od osy DNA + `focusOffset`), bloom, atmosférická záře, zrno, viněta – vše z jednoho blur řetězce ve 1/4 rozlišení. Config `cinematic` (`enabled:false` vypne). V DEV lze ladit živě přes `window.__cineOverride = {...}`.
- **Televize (desky):** video je na `GlassDesk` (web bere geometrii + world transform, UV otočené o 180°). Skleněné tělo = děti `TV_*` (`src/TvGlass.jsx`, vlastní levný shader, ladí se custom properties v Blenderu `tvOpacity/tvTint/tvRim/tvRimStrength` → export extras). Nové nody NESMÍ začínat `GlassDesk` (`DnaHeightDetector` bere první dva `GlassDesk*` pro výšku DNA).
- **Blender pipeline:** zdroj `C:/WEBOS/ASSETS/newworldorderN.blend` (Claude ukládá jako `…6ai.blend`), export → `public/obsah/everything/newworldorder.glb`. Nastavení exportu je uložené ve scéně (`scene['glTF2ExportSettings']`: apply, cameras, extras, lights, loose verts). Headless: `"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b file.blend --python script.py`, export `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB', **settings)`.
- **Atmosférický prach** `src/AtmosphereDust.jsx`: 4000 bodů s vlastním bokehem (1 draw call, animace jen ve shaderu). Config `atmosphereDust`.

---

## Plánováno (TODO)

- GitHub Pages deploy (GitHub Actions workflow)
- GitHub Pages video fallback: detekce `github.io` hostname → mini placeholder video
- Netlify auto-deploy (pro hotové production buildy)
- Doomsday: vlastní particle nody v GLB (teď sdílí Xelith nody)
- `App.jsx` má rozbité kódování českých komentářů/UI textů (mojibake, např. „ĂšspornĂ˝ reĹľim“) – opravit re-encodingem
- `App.jsx` má 1150+ řádků – porušuje pravidlo 12 (max 500), rozdělit do komponent
