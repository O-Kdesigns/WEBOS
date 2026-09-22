# AI Rozcestník konverzací a milníků

Tento soubor slouží jako index důležitých minulých chatů a milníků, abychom se k nim mohli kdykoliv vrátit bez ztráty kontextu.

### 🌟 Zásadní milníky a refaktoring
* **[Masivní Refaktor Editoru a Částic (Aktuální)](conversation://44076ee6-fc10-4ba9-bec2-4f28c9fa96b3)**
  * *Popis:* Řešení problému s extrémně pomalými odpověďmi AI. Úspěšné rozdělení gigantických souborů `Editor.jsx` (2400+ řádků) a `ParticleObject.jsx` (1100+ řádků) do složek `src/components/Editor/` a `src/components/particles/` bez změny funkcionality.

### 🎨 3D Scéna a Partikly
* **[Tuning částic, GPGPU a myš - FOV a FOV problémy](conversation://db9f0ec3-7c9f-462f-9f34-412c8a2ad830)**
  * *Popis:* Vyladění rotace, interakce částic s myší, řešení chování kamery (FOV zoom). Ustanovení pravidla nepoužívat Repulsive force, ale pouze Velocity Brush.
* **[Bloom efekty, Solid objekty, Fyzika částic](conversation://c2a9ce0e-97be-43bd-8906-95fdc4f8d51c)**
  * *Popis:* Aplikace Bloom efektů, řešení shadingu a refrakce pro pozadí (Válec / Kužel). Přidání hloubky a svícení (VolumetricLightPass).
  
### 💡 Experimenty a Design
* **[Přechod na DNA šroubovici a nová větev](conversation://b2f3f7d8-87c0-4afe-8e0a-64131077af32)**
  * *Popis:* Přechod z horizontálního válce na vertikální DNA Double Helix (vlákna, příčky nesoucí projekty, sekvenovací rozepínací mechanika). Větev `backup/cylinder-version` uchovává předchozí stav, vývoj DNA probíhá na `main`.

---
*Tip pro AI:* Pokud uživatel zmíní, že chce navázat na starší koncept nebo nastavení z těchto vláken, klikni na odkaz, načti si kontext dané session a implementuj poznatky do současného kódu.
