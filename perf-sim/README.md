# perf-sim — nástroje na testování výkonu na slabším zařízení

Vznikly z potřeby debugovat výkon na mobilu (viz [MOBILE.md](../MOBILE.md)) bez
nutnosti mít zařízení po ruce. Shrnutí, co který nástroj umí a kdy ho použít.

## Zjištění, které tomu předchází

Chrome/Brave DevTools Protocol (CDP) neumí "částečné" zpomalení grafiky.
`Emulation.setCPUThrottlingRate` brzdí jen JS main thread, ne shader/rasterizaci –
u téhle scény (GPGPU particly, post-processing) je render GPU-bound, takže
samotný CPU throttle 4x nezměnil nic (změřeno: 165 -> 165 fps). Jediný přepínač,
který grafiku fakticky zpomalí, je úplné vypnutí hardwarové GPU akcelerace
(SwiftShader = softwarová rasterizace na CPU) – ale to je o řády pomalejší než
i slabý mobilní GPU (změřeno 1.6 fps na této scéně vs. 47 fps na reálném Xiaomi
13T). Není tedy způsob, jak si v Chromu na desktopu přesně "vyrenderovat"
konkrétní telefon – jen buď plná rychlost, nebo drastický worst-case.

## Nástroje (`../WEBOS-mobile-*.bat`)

| Nástroj | Co dělá | K čemu je dobrý | K čemu NENÍ dobrý |
|---|---|---|---|
| `WEBOS-mobile-hwthrottle.bat` (`emulate-browser.cjs --mode=hw`) | Moto G Power viewport/DPR/UA (oficiální Lighthouse mid-tier profil) + CPU throttle, GPU akcelerace zapnutá | Rychlá kontrola layoutu/UI na mobilním viewportu | Odhad reálného fps (zůstane blízko desktopu, GPU-bound scéna) |
| `WEBOS-mobile-worstcase.bat` (`--mode=swiftshader`) | Totéž + GPU vypnutá (SwiftShader, softwarový render) | Relativní A/B srovnání – vypnu efekt/omezím particly -> o kolik % rychlejší. Zpomalení je skutečné a scéně úměrné (víc práce = pomalejší), ne fixní strop | Odhad absolutního fps na konkrétním zařízení (přestřeluje o řády dolů) |
| `perf-sim/real-device.bat` | `adb reverse` + instrukce pro `chrome://inspect` na skutečný telefon přes USB | Jediný zdroj přesných čísel (fps, frame time) pro konkrétní zařízení | – |

Všechny tři sdílí stejný běžící dev server (port se nastavuje nahoře v každém
`.bat`, výchozí 5173) – nespouští se žádná druhá instance Vite.

`real-device.bat` čeká na jednorázový setup (adb v PATH, USB debugging
povolený na telefonu) – instrukce jsou přímo v tom skriptu, vypíšou se, pokud
`adb` chybí. Jakmile je to jednou nastavené, příště stačí telefon připojit
kabelem a spustit ten `.bat` – najde ho, přesměruje port, dá návod na
`chrome://inspect`.

## Plán (zatím NEIMPLEMENTOVÁNO): detekce výkonu zařízení při startu

Cíl: aplikace při startu (v `Preloader.jsx`, než se odkryje scéna) odhadne,
na jak výkonném zařízení běží, a podle toho zvolí kvalitativní úroveň
(tier) – hlavně počet particlů (`densityPercent`, `sphereSegments` – viz
`MOBILE.md`), DPR strop, zapnutí/vypnutí cinematic post-processingu
(`VolumetricLight.jsx`), rozlišení TV skla (`TvGlass.jsx`) a rozlišení videí.

Úvahy pro budoucí implementaci (nerozhodnuto, k diskuzi až na to dojde):

- **Čistě UA/heuristická detekce** (`navigator.userAgentData`,
  `hardwareConcurrency`, `deviceMemory` – poslední dva jen Chromium/Android)
  je nespolehlivá: foldables, tablety a levné i drahé telefony často sdílí UA
  vzorec, `deviceMemory` a `hardwareConcurrency` nekorelují přímo s GPU
  výkonem (o ten tu jde nejvíc, viz zjištění výše).
- **Empirický mikro-benchmark** při startu (běžný přístup u webových her):
  v `Preloader` na pár desítek/stovek ms vykreslit reprezentativní vzorek
  zátěže (např. N particlů + jeden post-processing průchod) a změřit
  frame time, než se scéna odkryje. Přesnější než UA sniffing, ale prodlužuje
  loading o tu dobu měření.
- Kombinace obojího: UA/heuristika jako rychlý první odhad (mobil vs.
  desktop), mikro-benchmark jen pro jemnější rozlišení v rámci "mobil" větve.
- Výstup by měl být jeden `performanceTier` (např. `low/mid/high`), který se
  propaguje stejnou cestou jako dnes `settings.json`/`config.json`, ne
  roztroušené if/else po kódu.
- Testování/kalibrace prahů se dá dělat právě přes nástroje výš (worst-case
  pro relativní srovnání nákladů jednotlivých efektů, real-device pro reálná
  čísla, na kterých se prahy nakalibrují).

Až se do toho půjde, tenhle plán rozpracovat do konkrétního API (kde se tier
ukládá, jak ho čte `ParticleObject`/`VolumetricLight`/`TvGlass`) – zatím jde
jen o směr, nic z tohohle není v kódu.
