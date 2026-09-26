# Pravidla a architektura projektu WEBOS

Tento soubor slouží jako sdílená paměť pro všechny budoucí konverzace s Claude Code. Přečti ho před jakoukoliv prací na kódu.

---

## 1. O projektu (Koncept a prostor)

- **Typ:** 3D interaktivní webové portfolio.
- **Architektura:** Kamera letí vertikálně skrz **DNA šroubovici** (Double Helix). Scrollem kamera klesá dolů, šroubovice se synchronně točí. Na příčkách šroubovice jsou zavěšeny projekty.
- **Záloha:** Původní verze s horizontálním válcem (kamera rotuje kolem osy Y) je na větvi `backup/cylinder-version`.

---

## 2. Technologický stack

- **UI a logika:** React, JavaScript (ne TypeScript)
- **3D:** Three.js + React Three Fiber (`@react-three/fiber`, `@react-three/drei`)
- **3D animace:** `@react-spring/three`
- **2D UI animace:** `framer-motion`
- **Gesta:** `@use-gesture/react`
- **Build:** Vite

---

## 3. Architektura složek a automatické načítání

- **Obsah:** `public/obsah/` — složky jednotlivých projektů (např. `0_uvod`, `1_prvni_projekt`)
- **Pojmenování:** Musí začínat číslem (`N_nazev`). Index `0` = první pohled po načtení.
- **Vite plugin:** `vite.config.js` dynamicky skenuje `public/obsah/` a generuje virtuální modul `virtual:obsah-folders`. **Neměnit bez konzultace.**
- **Auto GLB:** Pokud složka obsahuje `.glb`/`.gltf`, načte se automaticky přes `useGLTF`.

---

## 4. Striktní pravidla pro Claude Code

- **Komentáře v kódu:** Složitá logika (matematika, 3D rotace, GPU výpočty) musí být komentována anglicky.
- **Zachování 3D prostoru:** Přechody musí zachovávat pocit reálného 3D (žádné crossfade textury — fyzické 3D uspořádání).
- **Nemazat funkcionalitu:** `App.jsx` a `vite.config.js` obsahují lazy-loading, auto-skenování složek a výpočet absolutního úhlu. Tyto funkce musí zůstat zachovány.

---

## 5. CMS a State Hoisting

- **Editor (CMS)** je napojen v reálném čase. Hlavní stav (`pagesData`, `ppConfig`) je držen přes `useState` v `App.jsx` a předáván jako props.
- Úprava v Editoru se okamžitě projevuje ve 3D scéně. Po kliknutí na "Uložit trvale" se zapíše JSON na backend přes API.
- **Složky pro 3D modely:** Volné objekty (stromy, budovy) → `public/obsah/obsah/levitate/`. Povrchy → `public/obsah/trava/`. CMS je dynamicky načítá do rolovacích nabídek.
- **textureCache:** Editor mění hodnoty 60× za sekundu, proto se textury aplikují v `useEffect` a cachují v globálním `textureCache` (ne v `useMemo`).
- **Event propagation:** Editor má `onWheel={(e) => e.stopPropagation()}` na rootu, aby scrollování nabídkami nerotovalo scénou na pozadí.

---

## 6. Responzivní horizontální FOV (Three.js kamery)

- Three.js FOV je vždy vertikální. Na ultra-wide monitoru je vidět příliš mnoho, na 16:10 jsou oříznuté boky.
- **Řešení:** Vypočítej vertikální FOV dynamicky v `useFrame` podle vzorce:
  ```
  targetVFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * (REFERENCE_ASPECT / currentAspect))
  ```
- **Pozor:** Změna aspect ratia (resize okna) se nesmí animovat přes `useSpring` — způsobí pomalé "dotahování". Přes spring animuj pouze logický přechod (0→1) mezi stavy, výsledek pak aplikuj do vzorce a zapíše přímo do `cameraRef.current.fov` v `useFrame`.

---

## 7. Zpracování cest k assetům a dynamické klonování

- **resolveAssetUrl:** Editor ukládá cesty relativně k `public/obsah` (např. `video/file.mp4`). Aplikace potřebuje absolutní prefix `/obsah/video/file.mp4`. Vždy používej helper funkci `resolveAssetUrl` v `App.jsx`. Neukládej absolutní cesty přímo do `settings.json`.
- **Procedurální rozmisťování 3D objektů:** Nespoléhej na fixní počet stránek. Najdi jeden referenční objekt v GLB, zjisti `totalPages = Math.max(pagesData.length, 1)` a automaticky rozprostři klony do kruhu: `i * (Math.PI * 2) / totalPages`.

---

## 8. Výkon a GPU — přehled (detail viz GEMINI.md)

Kompletní seznam 15 pravidel je v `GEMINI.md`. Nejdůležitější:
1. **Single Active Video Stream** — pouze 1 video přehrává najednou
2. **Zero-Allocation Render Loop** — žádné `new THREE.*` uvnitř `useFrame`
3. **H.264 + faststart** — nikdy HEVC
4. **Explicitní dispose()** — na každém GPGPU rendereru při unmount
5. **Max 500 řádků na komponent** — refaktoruj dřív než soubor nabobtná
