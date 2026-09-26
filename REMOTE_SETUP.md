# 🚀 Remote Development Setup

**Datum:** 2026-09-26  
**Stav:** Připraveno pro vzdálenou práci s Claude Code

---

## 📋 Krátký přehled projektu

- **Typ:** 3D interaktivní webové portfolio (React + Three.js)
- **Architektura:** DNA helix (vertikální scroll s rotující kamerou)
- **Branche:** `main` (aktuální) + `backup/cylinder-version` (původní válec)
- **Status:** 107 unpushed commitů (připraveno na push)
- **Velikost repo:** ~500 MB (bez node_modules, dist, media)

---

## 🔧 Klíčová pravidla projektu (z GEMINI.md)

### Performance Rules
1. **Single Active Video Stream** – Jen jedno video přehrává najednou
2. **Zero-Allocation Render Loop** – Žádné `new` v useFrame
3. **H.264 Video Codec** – Striktně H.264 s faststart, ne HEVC
4. **GPU Memory Cleanup** – Explicitní dispose() na GPGPU smyčkách

### Architecture Rules
1. **DNA Helix** – Vertikální scroll s rotující kamerou
2. **Component Split** – Max 500 řádků na file
3. **Atomic Changes** – Vždy commit + feedback loop
4. **Async Fallback** – textureCache.get() s React state fallback

---

## 💻 Workflow pro Remote Development

### Ty pracuješ, já commituju:

```bash
# Ty něco řekneš v chatu (Claude Code)
# Já upravím kód, otestuji, commituju

# Každý commit bude mít:
# - Jasný popis (CO a PROČ)
# - Typ změny (feat/fix/refactor/perf)
# - Reference na GEMINI.md pravidla (pokud relevantní)
```

### Když odchází od počítače:

```bash
git push origin main
# -> GitHub se aktualizuje
# -> Ty můžeš koukat na kód online
# -> Příští session: `git pull` v Claude Code
```

### Pokud chceš experimentovat:

```bash
# 1. Vytvoř si feature branch
git checkout -b feat/tvoje-idea

# 2. Pracuje se na něm
# 3. Až budeš spokojen/á:
git merge main
git checkout main
# -> Je to zpátky v main
```

---

## 🔌 Remote Control (Vzdálený přístup)

Když nejsi u počítače a chceš se koukat / upravovat:

### Varianta 1: Cloud Claude Session (nejjednoduší)
```
Řekneš: "Přesuň session do cloudu"
Já: Přesunem se na cloud Claude Agent SDK
-> Máš přístup na:
   - Browser (síť, čtení)
   - Terminal (git, npm)
   - GitHub (čtení/zápis)
   - Bez přístupu na lokální soubory
```

### Varianta 2: Remote Control (s přístupem na PC)
```
Potřebuješ: 
1. Remote Control zapnutý na PC
2. Synchronizace přes Claude API
3. Přístup na .git, src/, public/

Status: Zatím není nastaveno, lze zkonfigurovat v /config
```

---

## 📁 Struktura projektu

```
WEBOS/
├── .agents/              # AI agent pravidla (AGENTS.md)
├── .git/                 # Git repo (107 unpushed commits)
├── src/                  # React komponenty (~420KB)
│   ├── App.jsx
│   ├── components/       # UI + 3D komponenty
│   ├── hooks/
│   └── ...
├── public/obsah/         # Jednotlivé projekty portfolia
│   ├── 0_uvod/
│   ├── 1_prvni_projekt/
│   └── ... (číslo určuje pořadí)
├── GEMINI.md             # Pravidla pro výkon & vývojářské instrukce
├── AGENTS.md             # Architektura + AI pravidla
├── REMOTE_SETUP.md       # Tenhle soubor
└── package.json
```

### Soubory kterých se NE DJA DOTÝKAT bez konzultace:
- `vite.config.js` – Plugin pro automatické načítání obsahu
- `public/obsah/` struktura – Pojmenování musí být `N_nazev`
- Three.js render loop – Striktní performance rules

---

## 🎯 Next Steps

- [ ] Projít `src/App.jsx` a pochopit flow
- [ ] Zkontrolovat `package.json` a nainstalovat deps (`npm install`)
- [ ] Spustit dev server (`npm run dev`)
- [ ] Otestovat v prohlížeči (HMR, 3D scene)
- [ ] Setup Remote Control (pokud chceš pracovat vzdáleně bez PC)
- [ ] Pushovat 107 commitů na GitHub (postupně?)

---

## ⚡ Commands Reference

```bash
# Development
npm run dev              # Spustit dev server
npm run build            # Build production
npm run preview          # Preview build

# Git
git status               # Viz unpushed commits
git log --oneline -10    # Posledních 10 commitů
git push origin main     # Push 107 commitů
git checkout backup/cylinder-version  # Vrátit se na starou verzi

# Diagnostika
git diff main backup/cylinder-version  # Porovnání verzí
```

---

## 🤖 Jak pracovat s Claude Code

1. **Řekni co chceš:** "Oprav bug v App.jsx" / "Přidej 3D animaci"
2. **Já přečtu relevantní files:** GEMINI.md, AGENTS.md, src/
3. **Udělám změnu** s explicitními commity
4. **Kdykoli:** "Pushni to" → kód jde na GitHub
5. **Offline:** "Přesuň session do cloudu" → pokračuješ bez PC

---

## 📞 Need Help?

```
Pokud se něco rozbije:
1. Podívej se na nejnovější commit: git log --oneline -5
2. Řekni: "Vrátit se na předchozí commit"
3. Já rollbackneme a vyřešíme to jinak
```

**Vše je reversibilní!** 🔄

---

*Aktualizováno: 2026-09-26*
