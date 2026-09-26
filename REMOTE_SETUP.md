# Remote Development Setup — WEBOS

Aktualizováno: 2026-09-26

---

## Git & GitHub

- **Remote:** `git@github.com:O-Kdesigns/WEBOS.git`
- **SSH klíč:** `~/.ssh/github_webos` (přidán na O-Kdesigns GitHub účet)
- **SSH config:** `~/.ssh/config` routuje `github.com` na `github_webos` klíč
- **Repo velikost:** ~239 MB (po odstranění videí z git historie)
- **Videa:** Lokálně v `C:\WEBOS\blender\`, v gitu nejsou (ani LFS)

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

## Launcher (WEBOS.bat)

Zkratka `WEBOS.lnk` v `C:\WEBOS\` spouští `WEBOS.bat`:
1. Zkontroluje jestli běží `claude.exe` (Claude Code) — pokud ne, spustí ho
2. Spustí `open_browser.cjs` na pozadí (počká na server, otevře Brave)
3. Spustí `npm run dev`

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

### GitHub Pages (TODO — zatím nenastaveno)

- GitHub Actions workflow pro auto-deploy na push do main
- Pages URL: `https://o-kdesigns.github.io/WEBOS/`
- Videa na Pages nebudou (jen lokálně) — plánován placeholder fallback

### Placeholder video fallback (plánováno)

Pokud build detekuje `window.location.hostname.includes('github.io')`, přepne VideoManager na malé, nízko-rozlišené, krátké loop video z `public/`. Produkční videa zůstávají jen lokálně a na Netlify.

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
C:\WEBOS\
├── WEBOS\               # Git repozitář (tento projekt)
│   ├── src\             # React + Three.js komponenty
│   ├── public\obsah\    # Projekty portfolia (0_uvod, 1_prvni_projekt...)
│   ├── CLAUDE.md        # Hlavní context pro Claude Code (auto-načte se)
│   ├── GEMINI.md        # 15 výkonnostních pravidel
│   ├── .agents\AGENTS.md # Architektura + AI pravidla
│   └── WEBOS.bat        # Launcher
├── blender\             # Blender soubory + exporty (NOT v gitu)
└── WEBOS.lnk            # Zkratka pro spuštění
```
