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
- **GPGPU dispose je odložený** (`pendingDisposeRef` + `flush`) – okamžitý dispose v cleanupu způsoboval GPU texture leak. Neměnit zpět.
- Node končící na `1` (např. `Particles_Xelith_Obsah1`) je dle `isSolidNode()` **solid**, ne particly.
- GLB `newworldorder.glb` obsahuje jen Xelith nody – doomsday nemá vlastní particle nody (v `settings.json` používá Xelith nody).
- Debug: v DEV je `window.__r3f` (R3F store). `__r3f.gl.info.memory` = počet textur/geometrií (kontrola leaků), `__r3f.get().camera` = aktuální kamera.
- Dev server: `.claude/launch.json` (`webos-dev`, port 5173).

---

## Plánováno (TODO)

- GitHub Pages deploy (GitHub Actions workflow)
- GitHub Pages video fallback: detekce `github.io` hostname → mini placeholder video
- Netlify auto-deploy (pro hotové production buildy)
- Doomsday: vlastní particle nody v GLB (teď sdílí Xelith nody)
- `App.jsx` má rozbité kódování českých komentářů/UI textů (mojibake, např. „ĂšspornĂ˝ reĹľim“) – opravit re-encodingem
- `App.jsx` má 1150+ řádků – porušuje pravidlo 12 (max 500), rozdělit do komponent
