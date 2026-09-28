# MOBILE.md – co optimalizovat pro mobily

Seznam věcí, které budou na mobilu (slabší GPU, iOS Safari, omezená paměť, teplo/baterie) potřebovat úpravu nebo ověření.
**Při přidání nebo nálezu čehokoli, co je na mobilu rizikové, to sem zapiš** (stejně jako světla do `LIGHTING.md`).
Formát: co, kde, proč je to riziko, návrh řešení, stav.

Stav: ⏳ neověřeno · ⚠️ známý problém · ✅ vyřešeno

---

## GPU / výpočty

| Co | Kde | Riziko | Návrh | Stav |
|----|-----|--------|-------|------|
| GPGPU particlů v **FloatType** render targetech | `particles/utils.js` (`GPUComputationRenderer`, výchozí typ) | Render do float textury potřebuje `EXT_color_buffer_float`; starší iOS / některé Androidy umí jen half float → particly by se vůbec nehýbaly. | Detekovat rozšíření, jinak `gpuCompute.setDataType(THREE.HalfFloatType)`. Pozor: half float má u pozic kolem Y ≈ -20 krok ~0,01–0,02 → particly se můžou chvět; případně pozice uchovávat relativně k pivotu projektu. | ⏳ |
| Počet particlů | Xelith obsah 167k–203k, pozadí ~15k, DNA 16 463 | Fragment shader GPGPU + instancované koule je hlavní zátěž. | Na mobilu nižší `densityPercent` a nižší `sphereSegments` (`getAdaptiveSphereSegments` už snižuje podle počtu). | ⏳ |
| `nodeQuality` (sphere segmenty) na DNA-tvořících nodech | `settings.json` `particlesSettings.nodeQuality` (`Obsah0/Obsah1/Hloubka`), čte `App.jsx` `sphereSegments` → `getAdaptiveSphereSegments` | 2026-09-27: `Obsah0/Obsah1/Hloubka` zvednuty z kvality 1 [5,4] na 2 [6,5] (DNA particly byly na velkém `dnaBaseScale` viditelně nízkopolygonové – "smaragdy"). Zlepšilo to vzhled, ale Oliver hlásí kolísání FPS i na výkonném desktopu – segmenty se aplikují na CELÝ node (167k–203k particlů, i ty co čekají v rezervní kostce mimo obrazovku), ne jen na těch ~16k, co reálně tvoří DNA tvar. Jeden globální `nodeQuality` je kompromis mezi tím, jak DNA vypadá zblízka, a FPS na slabším HW. | Neřešit dalším ručním zvyšováním kvality – použít až plánovaný `performanceTier` (viz `perf-sim/README.md` "Plán: detekce výkonu zařízení při startu"), aby si slabší zařízení vybralo nižší `nodeQuality`/`sphereSegments` a výkonné zůstalo na vyšší kvalitě. | ⚠️ |
| Kolize particlů se solidy | `particles/SolidCollision.js`, `solidCollisionWorker.js` | Za snímek jen 1 texture fetch na particl (levné). Výpočet při načtení stránky běží ve workeru (desktop 0,2–0,4 s, na telefonu odhadem 1–2 s) → nic se nezasekne, jen kolize naběhne později. Worker = extra 154 kB JS. Textura roviny: `FloatType` DataTexture (jen čtení, Nearest – ve WebGL2 OK). | Když by to na mobilu bylo moc, `particleCollision.enabled: false`. | ⏳ |
| Vodnatá fyzika myši | `particles/ParticleFluid.js` | Za snímek ~30 průchodů proudu + kroky vln (podle rychlosti vln: pomalé ~0–1, rychlý švih až 24 malých průchodů 128×~170) mřížky 128×~170 HalfFloat + na každý particle systém jeden draw všech particlů jako bodů do mapy hloubky (MAX blending). Jen při pohybu myši/prstu (po 5 s klidu vypnuto). Potřebuje render do HalfFloat + blending (WebGL2 `EXT_color_buffer_float`/`_half_float`). Na dotyku jede jen při tahu prstem. | Mobil: `fluid.resolution` 64–96, `pressureIterations` 8, `frontRes` 64. | ⏳ |
| Odtržené particly DNA | `particles/utils.js` (velocity shader), `shaders/escapeGlsl.js` | Každý vertex koule čte navíc texturu rychlostí (1 fetch/vertex – u 16k koulí × ~80 vertexů ~1,3 M fetchů/snímek). Stav ve `vel.w` = 2 + čas od zlomu: s HalfFloat simulací (iOS) přesnost ~0,03 s při 60 s – stačí. HDR záblesk jde do god rays. | Mobil: `escape.enabled: false` nebo čtení stavu jen ve fragmentu. | ⏳ |

## Post-processing a extra rendery scény

| Co | Kde | Riziko | Návrh | Stav |
|----|-----|--------|-------|------|
| Cinematic řetězec (DOF, bloom, záře, zrno) | `VolumetricLight.jsx` (1/4 rozlišení, HalfFloat) | Víc průchodů přes celou obrazovku; na mobilu vysoké DPR. | Mobilní profil configu `cinematic` (vypnout DOF / snížit počet blur kroků). | ⏳ |
| Lom skla TV | `TvGlass.jsx` – pozadí se kopíruje (`blitFramebuffer` do 1/2) z hlavního renderu ve chvíli, kdy se kreslí sklo (`tvGlassFx`) | 2026-09-28: dřív druhý render celé scény (~2× cena particlů), teď jen blit ~µs. Starý render zůstává jako záloha, když `volumetricLight.enabled` = false (scéna jde rovnou na obrazovku). `blitFramebuffer` s LINEAR z HalfFloat targetu = WebGL2 (na iOS Safari 15+ OK). | Když by blit na nějakém GPU selhal: `window.__tvGlassFx.inline = 0` = starý render. | ✅ |
| `textureLod` v shaderech (`TEX_LOD0`) | `src/glslTexLod0.js` (post, TvGlass, PrintSteam, GPGPU, Jelly/VideoRefraction) | 2026-09-28: na Windows (ANGLE/D3D) jinak překladač počítá všechny větve se smyčkami vždy. `textureLod` je GLSL ES 3.00 = WebGL2 (projekt WebGL1 fallback nemá). Na mobilních GPU větvení pomáhá stejně. | – | ✅ |
| Canvas bez MSAA / `preserveDrawingBuffer` | `App.jsx` `CANVAS_GL` | 2026-09-28 vypnuto (nic nevyhlazovalo ani nečetlo) → méně paměti a šířky pásma, na mobilu víc než na desktopu. | – | ✅ |
| Maska žáru 3D tisku | `SolidPrint.jsx` (1/4 rozlišení, DPR max 1.25) | Extra render proxy meshů jen během tisku. | Nejspíš OK. | ⏳ |
| Světlo TV + maska vody | `VolumetricLight.jsx` `tvLight()`, config `tvLight` | ORBIT: každý pixel postu 24× hloubka + 24× tBlur (mlha z prachu s paprsky) + 1 fetch proudu. INSIDE: barvivo Pavlovy simulace (512 řádků, advekce + splat každý snímek, dokud voda běží), ve vodě 4× barvivo + 9× hloubka (zakrytí particly) + 1 fetch proudu. Maska vody je jen, když voda běží: na dotyku jen při tahu prstem, jinak je světlo celé bez děr a v INSIDE není vidět vůbec. | Na mobilu `dustFog` 0 nebo méně vzorků (12); zvážit trvalou jemnou vodu nebo jiné zobrazení v INSIDE. | ⏳ |
| Pára nad tiskovou linkou | `PrintSteam.js` (1 průchod za snímek, 160 řádků HalfFloat, 3 fetch masky + 1 proud) + v postu 1 fetch páry | Jen během tisku. Levné. HalfFloat render target (jako voda). | Mobil: `solidPrint.steam` 0 nebo menší `res`. | ⏳ |
| Průměr videa pro přisvícení solidu | `SolidLink.jsx` (render 1×1 HalfFloat za snímek) | Zanedbatelné. | – | ⏳ |

## Obecně

| Co | Kde | Riziko | Návrh | Stav |
|----|-----|--------|-------|------|
| Pixel ratio | Canvas | Telefony mají DPR 3 → 9× víc pixelů než DPR 1. | Omezit DPR na mobilu (např. max 1.5) + adaptivní DPR podle FPS. | ⏳ |
| Video textury | `App.jsx` (VideoManager, videoTextureCache) | iOS: autoplay jen `muted` + `playsinline`, limit dekodérů, paměť. | Menší rozlišení videí pro mobil, max 1 aktivní video. | ⏳ |
| Atmosférický prach | `AtmosphereDust.jsx` (4000 bodů, bokeh) | Overdraw velkých průhledných bodů. | Méně bodů / menší velikost na mobilu. | ⏳ |
| Ovládání | myš = štětec particlů, tah = rotace INSIDE | Na dotyku není hover → štětec funguje jen při tahu. | Navrhnout dotykové chování. | ⏳ |
| HUD text (Active Theory efekt) | `HUD2D.jsx`/`HUD2D.css`, `.hud-blend-group{mix-blend-mode:color-dodge}` nad WebGL canvasem | Od 2026-09-28 nahrazuje starou WebGL masku (`TextContrastPass`, smazáno) skutečným DOM textem s CSS `mix-blend-mode`. Starší iOS Safari (a některé Android WebView) mají historicky nespolehlivé/pomalé skládání `mix-blend-mode` přes `<canvas>`/WebGL vrstvu (padá zpět na `normal` nebo si vynutí extra compositing pass). Nutno ověřit na reálném iOS zařízení – pokud nefunguje, fallback: `blendMode: 'normal'` + pevná `textColor` v `config.json` (`ui2d.bottomLeft`). Předci `.hud-blend-group` nesmí tvořit stacking context (viz LIGHTING.md P12), jinak blend nefunguje nikde. | Otestovat na iPhonu (Safari) a starším Androidu; případně mobilní override configu. | ⏳ |
