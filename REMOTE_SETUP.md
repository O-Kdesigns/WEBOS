# Remote Development Setup — WEBOS

Aktualizováno: 2026-09-26

---

## Git & GitHub

- **Remote:** `git@github.com:O-Kdesigns/WEBOS.git`
- **SSH klíč:** `~/.ssh/github_webos` (přidán na O-Kdesigns GitHub účet)
- **SSH config:** `~/.ssh/config` routuje `github.com` na `github_webos` klíč
- **Repo velikost:** ~239 MB (po odstranění videí z git historie)
- **Videa:** Lokálně v `public\obsah\video\`, v gitu nejsou (ani LFS)

### Běžný workflow

```bash
# Průběžná práce
git add <soubor>
git commit -m "feat: popis"

# Před odchodem od PC
git push origin main
```

### Pokud pushuje poprvé po filter-repo

```bash
git push --force origin main
```

---

## Launcher (BRAND)

Zástupce `BRAND` na ploše spouští `C:\PROJEKTY\BRAND\launcher` (okno s menu; `config.json` = co umí spustit).
Dev server se startuje sám (okno minimalizované), pokud ještě neběží, a stránka se otevře v defaultním prohlížeči.
Starý `WEBOS.bat` + `open_browser.cjs` už se nepoužívají.

Claude Code exe: `%LOCALAPPDATA%\Microsoft\WindowsApps\claude-desktop.exe`

---

## Remote workflow z iPadu / mobilu

Když odcházíš od PC:

```
1. Řekni: "pushni to"
2. Já pushnu na GitHub
3. Na iPadu: otevři Claude Code → nová session
4. Session se spustí v cloudu, přečte GitHub repozitář
5. Řekni "uprav X" → commitnu → "pushni a spusť Pages deploy"
6. Za ~2 minuty si v Brave otevřeš github.io/WEBOS a vidíš změny
```

### GitHub Pages (běží)

- URL: `https://o-kdesigns.github.io/WEBOS/`
- `.github/workflows/pages.yml` nasadí každý push do `main` (~1–2 min), ručně: Actions → Deploy GitHub Pages → Run workflow
- Videa na Pages nejsou → přehraje se `public/placeholder.mp4` (fallback při chybě načtení videa)
- Plné produkční verze s videi: `npm run build` lokálně → ruční upload `dist/` na Netlify

---

## Větve

```bash
git checkout main                    # DNA helix (aktuální vývoj)
git checkout backup/cylinder-version # Původní válcová verze (stabilní záloha)
```

---

## Užitečné příkazy

```bash
npm run dev              # Dev server (localhost:5173)
npm run build            # Production build
git log --oneline -10    # Posledních 10 commitů
git status               # Co je rozpracováno
git push origin main     # Push na GitHub
```

---

## Soubory ve workspace

```
C:\PROJEKTY\BRAND\
├── WEBOS\               # Git repozitář (tento projekt)
│   ├── src\             # React + Three.js komponenty
│   ├── public\obsah\    # Projekty portfolia (videa v public\obsah\video – NOT v gitu)
│   ├── ASSETS\          # Blender soubory + bake (NOT v gitu)
│   ├── CLAUDE.md        # Hlavní context pro Claude Code (auto-načte se)
│   ├── GEMINI.md        # 15 výkonnostních pravidel
│   └── .agents\AGENTS.md # Architektura + AI pravidla
├── brand-kinetic-lab\
└── launcher\            # BRAND launcher (zástupce BRAND na ploše)
```
