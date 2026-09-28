import React from 'react';
import { DenseSlider, DenseToggle, DenseColor } from './OrbitSettingsPanel';

// Nastavení vzhledu solidů a světelné vazby particly <-> solidy (per stránka, particlesSettings).
// Logika a shadery: src/SolidLink.jsx. Bez klíčů = původní materiál z GLB a žádné přisvícení.

// Výchozí předvolba (naladěno na Xelith) – tlačítko ji zkopíruje do nového projektu.
export const SOLID_LINK_PRESET = {
  solidMaterial: { enabled: true, color: '#3c3b3d', metalness: 0.92, roughness: 0.28, reflections: 0.6, directLight: 0.02, layerLines: 0, grain: 0.35, rim: 0.8 },
  particleLight: { enabled: true, useVideoColor: true, color: '#ffffff', intensity: 4, radius: 0.3, wrap: 0.5 },
  solidLight: { enabled: true, color: '#ff6a2a', intensity: 1, radius: 0.35, printHeat: 1, selfGlow: 0 },
  bakedLight: { enabled: true, intensity: 4, diffuse: 1, specular: 1.2, glow: 0.08, sheen: 1, particleTint: 0.9, particleGlow: 0.012, live: 1, liveCell: 0.04, lift: 2 }
};

const SubTitle = ({ color, children }) => (
  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color, margin: '12px 0 8px' }}>{children}</div>
);

// onUpdate(field, value) = jedno pole; onReplace(obj) = víc polí naráz (updateParticlesSettings bere stav
// z closure, tři volání za sebou by se navzájem přepsala)
export function SolidLinkPanel({ settings, onUpdate, onReplace }) {
  const P = SOLID_LINK_PRESET;
  const sm = settings.solidMaterial || {};
  const pl = settings.particleLight || {};
  const sl = settings.solidLight || {};
  const bl = settings.bakedLight || {};
  // změna jednoho pole = nový objekt (chybějící hodnoty doplní předvolba, ať se po zapnutí nic neskokově nemění)
  const set = (key, cur, def) => (field, value) => onUpdate(key, { ...def, ...cur, [field]: value });
  const setSm = set('solidMaterial', sm, P.solidMaterial);
  const setPl = set('particleLight', pl, P.particleLight);
  const setSl = set('solidLight', sl, P.solidLight);
  const setBl = set('bakedLight', bl, P.bakedLight);
  const v = (obj, def, k) => obj[k] ?? def[k];

  return (
    <div>
      <button
        onClick={() => onReplace({ solidMaterial: { ...P.solidMaterial }, particleLight: { ...P.particleLight }, solidLight: { ...P.solidLight }, bakedLight: { ...P.bakedLight } })}
        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', padding: '4px 12px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer', marginBottom: '8px' }}
        title="Nastaví všechny skupiny na výchozí hodnoty (naladěno na Xelith)"
      >↺ Výchozí předvolba (Xelith)</button>

      <SubTitle color="#e2e8f0">🧱 Materiál solidu</SubTitle>
      <DenseToggle label="Vlastní materiál" desc="Zapnuto = přepíše materiál z Blenderu (GLB) níže uvedenými hodnotami. Vypnuto = původní materiál." checked={sm.enabled ?? false} color="#e2e8f0" onChange={x => setSm('enabled', x)} />
      {sm.enabled && (<>
        <DenseColor label="Barva" desc="Základní barva povrchu solidu." value={v(sm, P.solidMaterial, 'color')} onChange={x => setSm('color', x)} />
        <DenseSlider label="Kov (metalness)" desc="0 = plast/pryskyřice, 1 = kov (bere barvu jen z odrazů)." min={0} max={1} step={0.01} value={v(sm, P.solidMaterial, 'metalness')} color="#e2e8f0" onChange={x => setSm('metalness', x)} />
        <DenseSlider label="Drsnost" desc="0 = zrcadlo, 1 = matný. Vyšší = méně lesku." min={0.04} max={1} step={0.01} value={v(sm, P.solidMaterial, 'roughness')} color="#e2e8f0" onChange={x => setSm('roughness', x)} />
        <DenseSlider label="Přímá světla" desc="Síla světel scény (kamerový spot, centrální světlo) na solidu. Nižší = solid nepřepaluje do bílé." min={0} max={1.5} step={0.01} value={v(sm, P.solidMaterial, 'directLight')} color="#e2e8f0" onChange={x => setSm('directLight', x)} />
        <DenseSlider label="Odrazy okolí" desc="Síla odrazů HDRI prostředí (city). Nízko = solid neodráží světlo, které ve scéně není." min={0} max={1.5} step={0.01} value={v(sm, P.solidMaterial, 'reflections')} color="#e2e8f0" onChange={x => setSm('reflections', x)} />
        <DenseSlider label="Tiskové vrstvy" desc="Vodorovné rýhy po 3D tisku (hustota = počet vrstev tisku)." min={0} max={1.5} step={0.01} value={v(sm, P.solidMaterial, 'layerLines')} color="#e2e8f0" onChange={x => setSm('layerLines', x)} />
        <DenseSlider label="Zrno povrchu" desc="Jemná nerovnost lesku po povrchu." min={0} max={1} step={0.01} value={v(sm, P.solidMaterial, 'grain')} color="#e2e8f0" onChange={x => setSm('grain', x)} />
        <DenseSlider label="Lem od částic" desc="Jak moc se světlo částic chytá na hranách solidu (Fresnel)." min={0} max={2} step={0.01} value={v(sm, P.solidMaterial, 'rim')} color="#e2e8f0" onChange={x => setSm('rim', x)} />
      </>)}

      <SubTitle color="#dc2626">🟥 Zapečené světlo (Blender)</SubTitle>
      <DenseToggle label="Zapnout" desc="Solid z GLB s emisní texturou (Xelith: rudé světlo z emisních dílů, zapečené v Cycles). Emise se čte jako světlo dopadající na kov, ne jako záře. Vypnuto = bez zapečeného světla." checked={v(bl, P.bakedLight, 'enabled')} color="#dc2626" onChange={x => setBl('enabled', x)} />
      {v(bl, P.bakedLight, 'enabled') && (<>
        <DenseSlider label="Síla" desc="Celková síla zapečeného světla." min={0} max={10} step={0.05} value={v(bl, P.bakedLight, 'intensity')} color="#dc2626" onChange={x => setBl('intensity', x)} />
        <DenseSlider label="Zvednout střední" desc="Zesílí slabě a středně osvětlená místa (solid i particly), plně světlá a černá zůstanou. 0 = jak je zapečeno." min={0} max={6} step={0.1} value={v(bl, P.bakedLight, 'lift')} color="#dc2626" onChange={x => setBl('lift', x)} />
        <DenseSlider label="V odlesku" desc="Kolik světla se ukáže v lesku kovu (hlavní složka u kovu)." min={0} max={4} step={0.05} value={v(bl, P.bakedLight, 'specular')} color="#dc2626" onChange={x => setBl('specular', x)} />
        <DenseSlider label="Difuzně" desc="Světlo × barva povrchu (u kovu slabé, víc u nekovu)." min={0} max={4} step={0.05} value={v(bl, P.bakedLight, 'diffuse')} color="#dc2626" onChange={x => setBl('diffuse', x)} />
        <DenseSlider label="Pod úhlem" desc="Na hranách a plochách pod ostrým úhlem se odlesk blíží bílé (Fresnel)." min={0} max={1} step={0.01} value={v(bl, P.bakedLight, 'sheen')} color="#dc2626" onChange={x => setBl('sheen', x)} />
        <DenseSlider label="Záře" desc="Podíl, který svítí sám (nezávisle na materiálu). Vyšší = jako plochá emise." min={0} max={1} step={0.01} value={v(bl, P.bakedLight, 'glow')} color="#dc2626" onChange={x => setBl('glow', x)} />
        <DenseSlider label="Particly: barva" desc="Particly obsahu u solidu převezmou barvu zapečeného světla v místě, kde na solidu sedí (0 = barva videa)." min={0} max={1} step={0.01} value={v(bl, P.bakedLight, 'particleTint')} color="#dc2626" onChange={x => setBl('particleTint', x)} />
        <DenseSlider label="Particly: záře" desc="Jak moc particly tou barvou samy září (vysoko = ploché rudé fleky)." min={0} max={0.3} step={0.005} value={v(bl, P.bakedLight, 'particleGlow')} color="#dc2626" onChange={x => setBl('particleGlow', x)} />
        <DenseSlider label="Živé světlo" desc="Světlo na solidu svítí jen tam, kde jsou právě particly (odfouknutí myší = potemní, návrat = rozsvítí; při tisku se rozsvěcí s doletem). 0 = statické." min={0} max={1} step={0.01} value={v(bl, P.bakedLight, 'live')} color="#dc2626" onChange={x => setBl('live', x)} />
        <DenseSlider label="Živé: buňka (m)" desc="Velikost buňky mřížky particlů. Menší = ostřejší reakce, ale víc šumu z levitace." min={0.02} max={0.12} step={0.005} value={v(bl, P.bakedLight, 'liveCell')} color="#dc2626" onChange={x => setBl('liveCell', x)} />
      </>)}

      <SubTitle color="#ef4444">✨ Částice osvětlují solid</SubTitle>
      <DenseToggle label="Zapnout" desc="Částice kolem solidu ho přisvítí (měkké světlo ze shluků částic, bez skutečných světel)." checked={pl.enabled ?? false} color="#ef4444" onChange={x => setPl('enabled', x)} />
      {pl.enabled && (<>
        <DenseToggle label="Barva z videa" desc="Světlo má průměrnou barvu videa, které částice zobrazují. Barva níže ho pak jen tónuje." checked={v(pl, P.particleLight, 'useVideoColor')} color="#ef4444" onChange={x => setPl('useVideoColor', x)} />
        <DenseColor label="Barva / tón" desc="Barva světla částic (s videem = násobí barvu videa)." value={v(pl, P.particleLight, 'color')} onChange={x => setPl('color', x)} />
        <DenseSlider label="Síla" min={0} max={10} step={0.1} value={v(pl, P.particleLight, 'intensity')} color="#ef4444" onChange={x => setPl('intensity', x)} />
        <DenseSlider label="Dosah" desc="Jak daleko od shluku částic světlo sahá (world jednotky)." min={0.05} max={1.5} step={0.01} value={v(pl, P.particleLight, 'radius')} color="#ef4444" onChange={x => setPl('radius', x)} />
        <DenseSlider label="Obtékání" desc="0 = svítí jen na strany otočené k částicím, 1 = obtéká kolem dokola." min={0} max={1} step={0.01} value={v(pl, P.particleLight, 'wrap')} color="#ef4444" onChange={x => setPl('wrap', x)} />
      </>)}

      <SubTitle color="#f59e0b">🔥 Solid osvětluje částice</SubTitle>
      <DenseToggle label="Zapnout" desc="Solid přisvítí částice kolem sebe. Při 3D tisku svítí žhavá vrstva na částice u sebe." checked={sl.enabled ?? false} color="#f59e0b" onChange={x => setSl('enabled', x)} />
      {sl.enabled && (<>
        <DenseColor label="Barva" desc="Barva světla solidu (mimo žár tisku)." value={v(sl, P.solidLight, 'color')} onChange={x => setSl('color', x)} />
        <DenseSlider label="Síla" desc="Stálé světlo solidu na částice po dotištění." min={0} max={5} step={0.05} value={v(sl, P.solidLight, 'intensity')} color="#f59e0b" onChange={x => setSl('intensity', x)} />
        <DenseSlider label="Dosah" min={0.05} max={1.5} step={0.01} value={v(sl, P.solidLight, 'radius')} color="#f59e0b" onChange={x => setSl('radius', x)} />
        <DenseSlider label="Žár tisku" desc="Jak silně žhavá vrstva 3D tisku svítí na částice (0 = vůbec)." min={0} max={5} step={0.05} value={v(sl, P.solidLight, 'printHeat')} color="#f59e0b" onChange={x => setSl('printHeat', x)} />
        <DenseSlider label="Vlastní záře" desc="Solid sám svítí barvou výše (emise). 0 = nesvítí." min={0} max={2} step={0.01} value={v(sl, P.solidLight, 'selfGlow')} color="#f59e0b" onChange={x => setSl('selfGlow', x)} />
      </>)}
    </div>
  );
}
