# Pravidla pro plynulé přehrávání videí a WebGL výkon (WEBOS)

Tento soubor definuje kritická pravidla a osvědčené postupy pro zachování maximálního FPS a plynulého přehrávání videí v projektu WEBOS. Všichni agenti a vývojáři musí tato pravidla dodržovat při jakýchkoliv úpravách 3D scény a práce s médii.

---

## 1. Pravidlo jediného aktivního video streamu (Single Active Stream)
* **Princip:** V jakýkoliv okamžik smí aktivně přehrávat (`video.play()`) **POUZE JEDNO** video – to, které je aktuálně v zorném poli kamery / aktivní projekt (`url === resolvedActive`).
* **Důvod:** Hardwarové video dekodéry GPU (NVDEC, Intel QuickSync, AMD VCN) mají striktní limity propustnosti. Paralelní dekódování 3 a více full-HD 1080p MP4 videí způsobuje okamžitý pokles snímkování, throttling a masivní zahazování snímků (`droppedVideoFrames`).
* **Implementace:** 
  * Neaktivní videa v karuselu musí být pozastavena (`video.pause()`) na svém prvním snímku (`currentTime = 0.05`), kde slouží jako ostrý statický poster.
  * Jakmile uživatel pootočí karusel na další projekt, nový projekt se okamžitě rozběhne a předchozí se pozastaví.

---

## 2. Zákaz duplicitních instancí `THREE.VideoTexture` pro stejné video
* **Princip:** Pro každé unikátní URL videa smí existovat **přesně jedna** instance `THREE.VideoTexture`.
* **Důvod:** Každá `VideoTexture` registruje vlastní `requestVideoFrameCallback` a v každém snímku přenáší data do GPU paměti přes `texSubImage2D` (cca 8.3 MB na snímek). Vytvoření např. `deskTexture` a `texture` pro totéž video zdvojnásobuje sběrnicový přenos na ~50 MB/snímek (~3 GB/s datového toku do GPU VRAM), což zcela zablokuje renderovací vlákno WebGL.
* **Řešení transformací textury:** Pokud plocha (např. skleněná deska) vyžaduje jiné otočení textury (např. o 180°), **NIKDY nevytvářet druhou texturu**. Otočení se provádí jednorázovou úpravou UV souřadnic přímo na klonované geometrii meshe (`geom.attributes.uv.setXY(i, 1 - u, 1 - v)`).

---

## 3. Nulové alokace paměti v `useFrame` (Zero-Allocation Render Loop)
* **Princip:** Uvnitř `useFrame` se **NESMÍ** v žádném snímku volat operátory `new` pro Three.js objekty:
  * Žádné `new THREE.Vector3()`
  * Žádné `new THREE.Quaternion()`
  * Žádné `new THREE.Matrix4()`
  * Žádné `new THREE.Plane()`
* **Důvod:** Alokace desítek objektů 60–120× za sekundu vytváří extrémní tlak na paměť a způsobuje pravidelné záseky (stutter) vlivem Garbage Collectoru JavaScriptu.
* **Implementace:** Všechny pomocné vektory a matice musí být předalokované v `useRef` mimo renderovací smyčku a v `useFrame` se pouze kopírují hodnoty (`.copy()`, `.set()`, `.subVectors()`).

---

## 4. Ochrana před kolizemi priorit v `useFrame`
* **Princip:** Nepřiřazovat pomocným komponentám (světla, kamery) explicitní `renderPriority = 1`, pokud tuto prioritu využívá postprocessing pipeline (`VolumetricLightPass`).
* **Důvod:** Pokud dvě komponenty sdílejí prioritu 1, dochází ke konfliktům pořadí snímků a mikrozásekům.

---

## 5. Spolehlivé předávání textur a fallback na cache
* **Princip:** Komponenty odebírající texturu videa (např. válec, desky, volumetric screen) nesmí spoléhat pouze na asynchronní React state.
* **Implementace:** Vždy číst primárně z persistentní `videoTextureCache.get(resolvedUrl)?.texture` s fallbackem na React state.

---

## 6. Ochrana proti cold-start stutteru (Pre-buffering před spuštěním přehrávání)
* **Princip:** Na čistém startu (studená mezipaměť) se nesmí zavolat `video.play()` dříve, než má video načteno alespoň ~10 % délky (nebo stav `readyState >= 3` / `readyState >= 4`).
* **Důvod:** Pokud se u 1080p MP4 videa spustí dekódování s prázdným bufferem, síťový proud nestačí krmit GPU dekodér, video buffer podtéká (buffer underrun), GPU dekodér zahazuje snímky a renderovací vlákno Three.js trpí mikrozáseky.
* **Implementace:** Použít stylový lehký Active Theory SVG loader (`Preloader`), který monitoruje vyrovnávací paměť aktivního videa (`video.buffered`) a Drei 3D assety. Až po naplnění bufferu (`isPreloaded = true`) předá řízení `VideoManageru`, který video hladce rozběhne.

