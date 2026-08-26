# Pravidla a architektura projektu 3D Portfolio

Tento soubor slouží jako sdílená paměť pro všechny budoucí konverzace s AI asistenty (Antigravity). Asistent si tento soubor vždy přečte, než začne pomáhat s kódem.

## 1. O projektu (Koncept a Prostor)
- **Typ aplikace:** 3D interaktivní webové portfolio.
- **Hlavní myšlenka (Kamera uvnitř):** Uživatel (kamera) se nachází přesně ve středu (0, 0, 0) 3D scény (ostrova). Pomocí swipování na mobilu (nebo scrollování na PC) rotuje **samotná kamera** kolem své osy (doleva/doprava), nikoliv scéna kolem ní.
- **Kouzlo rotace a FOV:** Ostrov a objekty portfolia jsou staticky rozmístěny do kruhu kolem kamery.
- **Krok 90 stupňů:** Kamera se při každém swipu otočí o přesných 90 stupňů. FOV kamery (a případně vzdálenost) je nastaveno tak, aby v jednom záběru viděla přesně "čtvrtinu" ostrova a příslušný projekt. Při rotaci uživatel zahlédne, jak 3D prostředí (na březích) fyzicky a prostorově navazuje na sousední kvadrant. Nechceme umělé problikávání nebo prolínání textur (žádný shader crossfade na ostrově) – prostředí je skutečné a plně 3D.

## 2. Technologický stack (V čem děláme)
- **Základ UI a logiky:** React, JavaScript (ne TypeScript).
- **Základ 3D:** Three.js + React Three Fiber (`@react-three/fiber`, `@react-three/drei`).
- **3D animace a rotace:** `@react-spring/three` (zajišťuje plynulou fyzikální rotaci kamery/scény).
- **2D UI a HTML animace:** `framer-motion` (použito např. na vrstvu pro přechodové video nad Canvasem).
- **Detekce gest:** `@use-gesture/react` (sledování swajpování a kolečka myši).
- **Build tool:** Vite.

## 3. Architektura složek a automatické načítání
- **Obsah (`public/obsah/`):** Zde jsou uloženy složky jednotlivých stránek portfolia (např. `0_uvod`, `1_prvni_projekt`).
- **Pravidla pojmenování:** Názvy složek v `obsah/` musí vždy začínat číslem (určuje jejich chronologické pořadí v kruhu). Index `0` označuje první stránku, kam se podívá kamera po načtení.
- **Automatizace (Vite plugin):** V `vite.config.js` je napsán vlastní plugin, který dynamicky skenuje složku `public/obsah/`. Kód v `App.jsx` si seznam načítá z virtuálního modulu `virtual:obsah-folders`. Není potřeba ručně registrovat žádné složky ani cesty v kódu.
- **Automatické načítání 3D (GLB):** Pokud je uvnitř složky přítomen soubor s příponou `.glb` nebo `.gltf`, React Three Fiber jej automaticky načte a zobrazí nad daným výsekem ostrova přes `useGLTF`.

## 4. Striktní pravidla pro AI (Pokyny pro budoucí konverzace)
- **Komentování kódu:** Při jakýchkoliv úpravách striktně a podrobně **komentuj kód v angličtině, je to pro tebe lepší**. Je nutné vysvětlit složitější logiku (matematiku, 3D rotace), aby na ni mohl kdykoliv navázat další agent bez ztráty kontextu.
- **Respektování prostoru:** Řešení 3D přechodů musí vždy zachovávat pocit reálného 3D prostoru (žádné crossfade textury ostrova, ale fyzické uspořádání do prostorového kruhu/polygonu s reálně vymodelovanými okraji nebo přechody na 3D modelu).
- **Nemazat funkcionality:** Než přepíšeš komponenty (např. `App.jsx` nebo `vite.config.js`), pamatuj, že obsahují logiku pro lazy-loading (optimalizace sousedních prvků), automatické skenování složek a výpočet absolutního úhlu rotace (prevence přetočení). Tyto funkce musí zůstat zachovány.

## 5. Nov� Architektura z v�voje CMS (D�le�it� pro budouc� agenty)
- **CMS a State Hoisting:** Editor (CMS) je nyn� napojen v re�ln�m �ase. Hlavn� stav aplikace (pagesData, ppConfig) je dr�en p�es useState p��mo v App.jsx a p�ed�v�n jako props. Jak�koliv �prava v Editoru se okam�it� projevuje ve 3D sc�n�, a a� po kliknut� na "Ulo�it trvale" se provede z�pis do JSONu na backendu p�es API.
- **Slo�ky pro komponenty:** 3D modely pro voln� objekty (stromy, budovy) se neukl�daj� p��mo do slo�ek str�nek, ale do sd�len� slo�ky public/obsah/obsah/levitate/ (pro objekty) nebo public/obsah/trava/ (pro povrchy). Odtud je CMS dynamicky na��t� do roletek.
- **Optimalizace real-time updat� (textureCache):** Proto�e Editor umo��uje m�nit hodnoty ta�en�m 60kr�t za vte�inu, nelze aplikovat nov� textury uvnit� useMemo. Aplikace barev a materi�l� je p�esunuta do useEffect a textury jsou cachov�ny v glob�ln�m objektu 	extureCache, aby nedoch�zelo k propadu framerate a neust�l�mu stahov�n�.
- **Event propagation:** Editor m� na sv�m rootu onWheel={(e) => e.stopPropagation()}, aby p�i scrollov�n� nab�dkami neodrotov�vala sc�na na pozad�.

## 6. Zajištění responzivního horizontálního FOV (Three.js kamery)
- **Problém:** V Three.js je FOV vždy vertikální. Na ultrawide monitorech je vidět příliš mnoho do stran, na užších displejích (16:10) jsou naopak oříznuté boky.
- **Řešení:** Nepoužívej fixní ov pro kameru, ale vypočítej vertikální FOV dynamicky v useFrame tak, aby zachovalo fixní horizontální úhel (podle zadané reference, např. 16:9).
- **Postup (Active Theory styl):** V useFrame si načti aktuální aspect ratio z rendereru (state.size.width / state.size.height) a aplikuj vzorec:
  	argetVFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * (REFERENCE_ASPECT / currentAspect))
- **Plynulost vs. Animace (Kritické):** Změna aspect ratia (resizing okna) se nesmí animovat přes useSpring. Pokud pošleš dynamické FOV rovnou do springu, animace způsobí pomalé "dotahování" zobrazení při přesunu okna na jiný monitor. 
- **Správná implementace:** Přes useSpring animuj pouze logický přechod (např. z 0 do 1) mezi stavy (z orbitFov do insideFov). Tento mezivýsledek (přes lerp) pak aplikuj do výše uvedeného vzorce a okamžitě zapiš do cameraRef.current.fov uvnitř useFrame.
