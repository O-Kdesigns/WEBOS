import React from 'react';
import { DenseSlider, DenseToggle, DenseColor, DashboardCard } from './OrbitSettingsPanel';
import { FLUID_DEFAULTS } from '../../particles/ParticleFluid';

export function InsideSettingsPanel({ appConfig, updateConfig, updateVolumetric, updateInsideFog, updatePhysics, updateParticlePhysics, updateVolumetricVideo, updateVolumetricDepth, updateUi2d, updateUi2dBottomLeft, updateUi2dBottomLeftItem, addUi2dBottomLeftItem, removeUi2dBottomLeftItem, updateUi2dPillButton, openSections, toggleSection, touchSection }) {
  const fluid = appConfig.particlePhysics?.fluid || {};
  const updateFluid = (field, value) => updateParticlePhysics('fluid', { ...fluid, [field]: value });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gridAutoRows: 'min-content', gap: '16px', width: '100%', height: '100%' }}>
      
      <DashboardCard title="Volumetrické Video" icon="📹" color="#06b6d4">
        <DenseToggle desc="Zobrazí video (projekt) na pozadí jako prostorové světlo." label="Povolit video v pozadí" checked={appConfig.volumetricVideo?.enabled ?? true} color="#06b6d4" onChange={v => updateVolumetricVideo('enabled', v)} />
        <DenseSlider desc="Prohnutí videa do oblouku kolem kamery. 0 = ploché, 1 = výrazné zakřivení." label="Zakřivení plátna" min={-0.5} max={1.5} step={0.05} value={appConfig.volumetricVideo?.curvature ?? 0.35} color="#06b6d4" onChange={v => updateVolumetricVideo('curvature', v)} />
        <DenseSlider desc="Celkové zvětšení videoplátna v prostoru." label="Měřítko (Scale)" min={0.2} max={3.0} step={0.05} value={appConfig.volumetricVideo?.scale ?? 0.85} color="#06b6d4" onChange={v => updateVolumetricVideo('scale', v)} />
        <DenseSlider desc="Z vzdálenost - posune video víc dozadu nebo blíž." label="Odsazení vzad (Z)" min={0.2} max={8.0} step={0.1} value={appConfig.volumetricVideo?.zDistance ?? 1.4} color="#06b6d4" onChange={v => updateVolumetricVideo('zDistance', v)} />
        <DenseSlider desc="Celková průhlednost (viditelnost) video pozadí." label="Krytí videa (Opacity)" min={0} max={1.0} step={0.05} value={appConfig.volumetricVideo?.screenOpacity ?? 1.0} color="#06b6d4" onChange={v => updateVolumetricVideo('screenOpacity', v)} />
        <DenseSlider desc="Základní jas videa." label="Jas (Brightness)" min={0.2} max={2.5} step={0.05} value={appConfig.volumetricVideo?.brightness ?? 1.15} color="#06b6d4" onChange={v => updateVolumetricVideo('brightness', v)} />
        <DenseSlider desc="Barevný kontrast videa." label="Kontrast (Contrast)" min={0.5} max={2.0} step={0.05} value={appConfig.volumetricVideo?.contrast ?? 1.05} color="#06b6d4" onChange={v => updateVolumetricVideo('contrast', v)} />
        <DenseSlider desc="Jak moc se okraje videa měkce vytrácí do černé (vinětace)." label="Měkkost viněty" min={0.05} max={0.85} step={0.05} value={appConfig.volumetricVideo?.vignetteSoftness ?? 0.45} color="#06b6d4" onChange={v => updateVolumetricVideo('vignetteSoftness', v)} />
        <DenseSlider desc="Fyzický posun videoplátna do stran." label="X Posun (Offset)" min={-3} max={3} step={0.05} value={appConfig.volumetricVideo?.posX ?? 0.0} color="#06b6d4" onChange={v => updateVolumetricVideo('posX', v)} />
        <DenseSlider label="Y Posun (Offset)" min={-3} max={3} step={0.05} value={appConfig.volumetricVideo?.posY ?? 0.0} color="#06b6d4" onChange={v => updateVolumetricVideo('posY', v)} />
      </DashboardCard>

      <DashboardCard title="Ghosting a God Rays" icon="🌌" color="#a855f7">
        <DenseToggle desc="Povolí volumetrické vrstvy způsobující světelné stopy." label="Povolit průhled hloubky" checked={appConfig.volumetricDepth?.enabled ?? true} color="#a855f7" onChange={v => updateVolumetricDepth('enabled', v)} />
        <DenseSlider desc="Vzdálenost (od středu), kde se začíná projevovat efekt ztrácení hloubky." label="Start Distance" min={0.5} max={6.0} step={0.05} value={appConfig.volumetricDepth?.startDistance ?? 2.16} color="#a855f7" onChange={v => updateVolumetricDepth('startDistance', v)} />
        <DenseSlider desc="Intenzita ozvěn zanechávajících pohybové stopy v mlze." label="Síla Ghostingu" min={0.0} max={1.0} step={0.05} value={appConfig.volumetricDepth?.ghostStrength ?? 0.35} color="#a855f7" onChange={v => updateVolumetricDepth('ghostStrength', v)} />
        <DenseSlider desc="Jak měkce a pozvolně nabíhá ztráta hloubky do černa." label="Měkkost náběhu (Fade)" min={0.05} max={2.0} step={0.05} value={appConfig.volumetricDepth?.fadeRange ?? 0.6} color="#a855f7" onChange={v => updateVolumetricDepth('fadeRange', v)} />
        
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a855f7', marginBottom: '8px' }}>Středové Paprsky</div>
        
        <DenseSlider desc="Zářivost jasných paprsků z videa skrz prostor (God rays)." label="Expozice paprsků" min={0.0} max={3.0} step={0.05} value={appConfig.volumetricDepth?.raysExposure ?? 1.2} color="#a855f7" onChange={v => updateVolumetricDepth('raysExposure', v)} />
        <DenseSlider desc="Plocha ze které paprsky vystřelují." label="Rádius paprsků" min={0.2} max={1.2} step={0.05} value={appConfig.volumetricDepth?.raysRadius ?? 0.65} color="#a855f7" onChange={v => updateVolumetricDepth('raysRadius', v)} />
        <DenseSlider desc="Jak daleko do prostoru před video paprsky dosáhnou." label="Délka paprsků" min={0.1} max={1.5} step={0.05} value={appConfig.volumetricDepth?.rayLength ?? 0.45} color="#a855f7" onChange={v => updateVolumetricDepth('rayLength', v)} />
        <DenseSlider desc="Odezva paprsků na tmu a světlost (hustota)." label="Hustota paprsků" min={0.2} max={2.0} step={0.05} value={appConfig.volumetricDepth?.rayDensity ?? 1.0} color="#a855f7" onChange={v => updateVolumetricDepth('rayDensity', v)} />
      </DashboardCard>

      <DashboardCard title="Fyzika vnitřních částic" icon="🧲" color="#ec4899">
        <DenseSlider desc="Výška houpání (vlnění) částic letících uvnitř válce." label="Síla levitování" min={0} max={2.0} step={0.01} value={appConfig.particlePhysics?.floatAmplitude ?? 0.1} color="#ec4899" onChange={v => updateParticlePhysics('floatAmplitude', v)} />
        <DenseSlider desc="Frekvence (rychlost) pulzujícího vlnění." label="Rychlost levitování" min={0.1} max={10.0} step={0.1} value={appConfig.particlePhysics?.floatSpeed ?? 1.0} color="#ec4899" onChange={v => updateParticlePhysics('floatSpeed', v)} />
        <DenseSlider desc="Jak rychle a pružně se částice vrací do formace po narušení myší." label="Návrat po rozfouknutí" min={0.01} max={0.5} step={0.01} value={appConfig.particlePhysics?.returnSpeed ?? 0.05} color="#ec4899" onChange={v => updateParticlePhysics('returnSpeed', v)} />
        <DenseSlider desc="Čekání po strčení vodou, než se particl začne vracet na místo (s)." label="Zpoždění návratu" min={0} max={2} step={0.05} value={appConfig.particlePhysics?.returnDelay ?? 0.15} color="#ec4899" onChange={v => updateParticlePhysics('returnDelay', v)} />
        <DenseSlider desc="Za jak dlouho se návrat rozjede z nuly na plnou sílu (s). Pomalý start, pak zrychluje. 0 = hned plnou silou." label="Náběh návratu" min={0} max={3} step={0.05} value={appConfig.particlePhysics?.returnRamp ?? 0.8} color="#ec4899" onChange={v => updateParticlePhysics('returnRamp', v)} />
        <DenseSlider desc="Návrat je pružina, která nechá particlům jejich rychlost a víření. Míň = houpnou se přes cíl a doznívají, víc = dojedou hladce bez překmitu (1 = přesně bez překmitu)." label="Tlumení návratu" min={0.2} max={1.5} step={0.05} value={appConfig.particlePhysics?.returnDamping ?? 0.7} color="#ec4899" onChange={v => updateParticlePhysics('returnDamping', v)} />
        <DenseSlider desc="Zpoždění otáčení obsahu za tahem myši (solidy i částice stejně). 0 = hned za prstem." label="Setrvačnost otáčení" min={0} max={1} step={0.01} value={appConfig.particlePhysics?.spinLag ?? 0.5} color="#ec4899" onChange={v => updateParticlePhysics('spinLag', v)} />
        <DenseSlider desc="Jak moc částice drží se solidy při otáčení. 1 = přesně s nimi, nižší = částice se opožďují (dozvuk)." label="Unášení částic" min={0} max={1} step={0.01} value={appConfig.particlePhysics?.rotationCarry ?? 0.85} color="#ec4899" onChange={v => updateParticlePhysics('rotationCarry', v)} />

        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Voda (myš)</div>
        <DenseToggle desc="Vodnatá fyzika: myš rozhrne jen přední particly, proud dojíždí a víří. Vypnuto = starý štětec (Laser níže)." label="Vodnatá fyzika" checked={fluid.enabled ?? FLUID_DEFAULTS.enabled} color="#ec4899" onChange={v => updateFluid('enabled', v)} />
        <DenseSlider desc="Hlavní síla myši: násobí všechno, čím voda hýbe particly (proud ve stopě i vlny). 0 = myš nic nedělá." label="Celková síla" min={0} max={3} step={0.05} value={fluid.strength ?? FLUID_DEFAULTS.strength} color="#ec4899" onChange={v => updateFluid('strength', v)} />
        <DenseSlider desc="Šířka stopy myši ve vodě (podíl výšky obrazovky)." label="Šířka stopy" min={0.01} max={0.15} step={0.005} value={fluid.splatRadius ?? FLUID_DEFAULTS.splatRadius} color="#ec4899" onChange={v => updateFluid('splatRadius', v)} />
        <DenseSlider desc="Ostrost okraje stopy. Víc = ostřejší vlna, méně = měkká rozmazaná." label="Ostrost vlny" min={0.5} max={5} step={0.1} value={fluid.splatHardness ?? FLUID_DEFAULTS.splatHardness} color="#ec4899" onChange={v => updateFluid('splatHardness', v)} />
        <DenseSlider desc="Rychlost proudu jen v úzké stopě přímo pod kurzorem (1 = rychlost kurzoru). Rozrážení do stran dělají vlny – na celkovou sílu použij Celkovou sílu." label="Síla proudu" min={0.1} max={3} step={0.05} value={fluid.force ?? FLUID_DEFAULTS.force} color="#ec4899" onChange={v => updateFluid('force', v)} />
        <DenseSlider desc="Odezva na rychlost myši. 1 = lineární (pomalý tah slabý, švih extrémní), menší = vyrovnanější." label="Vyrovnání rychlosti" min={0.2} max={1} step={0.05} value={fluid.speedCurve ?? FLUID_DEFAULTS.speedCurve} color="#ec4899" onChange={v => updateFluid('speedCurve', v)} />
        <DenseSlider desc="Strop rychlosti tahu (výšky obrazovky za s). Rychlejší švih už nesílí." label="Strop rychlosti" min={0.5} max={8} step={0.1} value={fluid.maxSpeed ?? FLUID_DEFAULTS.maxSpeed} color="#ec4899" onChange={v => updateFluid('maxSpeed', v)} />
        <DenseSlider desc="Útlum proudu. Menší = delší dojezd vody po zastavení myši." label="Útlum (dojezd)" min={0.05} max={4} step={0.05} value={fluid.dissipation ?? FLUID_DEFAULTS.dissipation} color="#ec4899" onChange={v => updateFluid('dissipation', v)} />
        <DenseSlider desc="Jak rychle mizí stopa myši ve vodě. Menší = particly se posouvají déle a dál." label="Mizení stopy" min={0.1} max={5} step={0.05} value={fluid.trailFade ?? FLUID_DEFAULTS.trailFade} color="#ec4899" onChange={v => updateFluid('trailFade', v)} />
        <DenseSlider desc="Víření vody (malé víry za stopou)." label="Víření" min={0} max={30} step={0.5} value={fluid.curl ?? FLUID_DEFAULTS.curl} color="#ec4899" onChange={v => updateFluid('curl', v)} />
        <DenseSlider desc="Jak rychle se particl nechá strhnout proudem (menší = líné, těžší particly)." label="Strhávání particlů" min={0.02} max={1} step={0.01} value={fluid.coupling ?? FLUID_DEFAULTS.coupling} color="#ec4899" onChange={v => updateFluid('coupling', v)} />
        <DenseSlider desc="Výška vlny, kterou tah myši zvedne (jako loď). 0 = bez vln." label="Výška vlny" min={0} max={10} step={0.1} value={fluid.waveHeight ?? FLUID_DEFAULTS.waveHeight} color="#ec4899" onChange={v => updateFluid('waveHeight', v)} />
        <DenseSlider desc="Rozrážení: jak daleko vlna particly od tahu odsune (pak se vrátí)." label="Rozrážení vlnou" min={0} max={0.08} step={0.001} value={fluid.waveDrift ?? FLUID_DEFAULTS.waveDrift} color="#ec4899" onChange={v => updateFluid('waveDrift', v)} />
        <DenseSlider desc="Houpání particlů na vlně (tam a zpět, bez trvalého posunu). Moc = vibrace." label="Houpání na vlně" min={0} max={40} step={0.5} value={fluid.waveForce ?? FLUID_DEFAULTS.waveForce} color="#ec4899" onChange={v => updateFluid('waveForce', v)} />
        <DenseSlider desc="Rychlost vln = tolikrát rychlost myši. Nad 1 vlna vždy utíká před kurzorem (pod 1 = nadzvukový třesk, vlna odfoukne všechno)." label="Rychlost vln × myš" min={1} max={3} step={0.05} value={fluid.waveSpeedRatio ?? FLUID_DEFAULTS.waveSpeedRatio} color="#ec4899" onChange={v => updateFluid('waveSpeedRatio', v)} />
        <DenseSlider desc="Nejpomalejší vlna (výšky obrazovky/s) – pomalý tah = pomalé vlny." label="Min. rychlost vln" min={0.05} max={1} step={0.01} value={fluid.waveSpeedMin ?? FLUID_DEFAULTS.waveSpeedMin} color="#ec4899" onChange={v => updateFluid('waveSpeedMin', v)} />
        <DenseSlider desc="Strop rychlosti vln (výšky obrazovky/s)." label="Max. rychlost vln" min={1} max={10} step={0.1} value={fluid.waveSpeedMax ?? FLUID_DEFAULTS.waveSpeedMax} color="#ec4899" onChange={v => updateFluid('waveSpeedMax', v)} />
        <DenseSlider desc="Jak dlouho vlny drží rychlost, když myš zpomalí (s)." label="Držení rychlosti vln" min={0.1} max={4} step={0.05} value={fluid.waveSpeedHold ?? FLUID_DEFAULTS.waveSpeedHold} color="#ec4899" onChange={v => updateFluid('waveSpeedHold', v)} />
        <DenseSlider desc="Růst výšky vlny s rychlostí myši. 0 = stejná vlna pro každou rychlost, 1 = lineárně." label="Růst vlny s rychlostí" min={0} max={1} step={0.05} value={fluid.waveGrowth ?? FLUID_DEFAULTS.waveGrowth} color="#ec4899" onChange={v => updateFluid('waveGrowth', v)} />
        <DenseSlider desc="Jak daleko vlna doběhne (výšky obrazovky). Stejné pro pomalé i rychlé vlny." label="Dosah vln" min={0.03} max={0.6} step={0.01} value={fluid.waveReach ?? FLUID_DEFAULTS.waveReach} color="#ec4899" onChange={v => updateFluid('waveReach', v)} />
        <DenseSlider desc="Tloušťka přední vrstvy particlů, kterou voda posouvá (world). Zadní zůstanou." label="Hloubka přední vrstvy" min={0.02} max={1} step={0.01} value={fluid.frontShell ?? FLUID_DEFAULTS.frontShell} color="#ec4899" onChange={v => updateFluid('frontShell', v)} />

        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Interakce myší (Laser – jen když je voda vypnutá)</div>
        <DenseSlider desc="Síla výbuchu, který rozfoukne částice při přejetí myší." label="Síla odfouknutí myší" min={0.1} max={5.0} step={0.1} value={appConfig.particlePhysics?.mouseForce ?? 1.0} color="#ec4899" onChange={v => updateParticlePhysics('mouseForce', v)} />
        <DenseSlider desc="Dosah kolizní kuličky myši rozrážející částice." label="Průměr stopy (Radius)" min={0.1} max={5.0} step={0.1} value={appConfig.particlePhysics?.mouseRadius ?? 2.0} color="#ec4899" onChange={v => updateParticlePhysics('mouseRadius', v)} />
        <DenseSlider desc="Délka pomyslného průniku laseru z kurzoru skrz scénu." label="Délka průniku (Laser)" min={0.1} max={20.0} step={0.1} value={appConfig.particlePhysics?.laserLength ?? 5.0} color="#ec4899" onChange={v => updateParticlePhysics('laserLength', v)} />
      </DashboardCard>

      <DashboardCard title="Vnitřní Mlha" icon="🌫️" color="#6366f1">
        <DenseToggle desc="Zapne efekt plovoucí prostorové mlhy uvnitř." label="Povolit mlhu uvnitř" checked={appConfig.insideFog?.enabled ?? true} color="#6366f1" onChange={v => updateInsideFog('enabled', v)} />
        <DenseSlider desc="Hustota částic mlhy pohlcujících světlo." label="Hustota mlhy" min={0} max={0.5} step={0.01} value={appConfig.insideFog?.density ?? 0.15} color="#6366f1" onChange={v => updateInsideFog('density', v)} />
        <DenseColor desc="Barva, kterou mlha svítí / pohlcuje." label="Barva mlhy" value={appConfig.insideFog?.color ?? '#050510'} onChange={v => updateInsideFog('color', v)} />
      </DashboardCard>

      <DashboardCard title="2D Rozhraní a Menu (HUD)" icon="🖥️" color="#f43f5e" span={2}>
        <DenseToggle desc="Úplně zapne/vypne všechny texty a ovládací prvky 2D UI vrstvy." label="Povolit 2D rozhraní" checked={appConfig.ui2d?.enabled ?? true} color="#f43f5e" onChange={v => updateUi2d('enabled', v)} />
        <DenseToggle desc="Zobrazí plovoucí 'Pill' tlačítko (Menu) v pravém horním rohu obrazovky." label="Menu vpravo nahoře" checked={appConfig.ui2d?.pillButton?.enabled ?? true} color="#f43f5e" onChange={v => updateUi2dPillButton('enabled', v)} />
        
        <div style={{ height: '12px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f43f5e', marginBottom: '12px' }}>Odkazy a texty (Vlevo Dole)</div>
        
        <DenseToggle desc="Zobrazí tento seznam odkazů a popisek do levého dolního rohu okna." label="Zobrazit vlevo dole" checked={appConfig.ui2d?.bottomLeft?.enabled ?? true} color="#f43f5e" onChange={v => updateUi2dBottomLeft('enabled', v)} />
        
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', cursor: 'help' }} title="Nadpis celého bloku. (Např. 'WHAT ARE YOU LOOKING FOR?')">Záhlaví bloku</div>
          <input type="text" value={appConfig.ui2d?.bottomLeft?.title ?? ''} onChange={e => updateUi2dBottomLeft('title', e.target.value)} style={{ width: '100%', padding: '2px 8px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(244,63,94,0.3)', color: 'white', borderRadius: '4px' }} placeholder="Záhlaví..." />
        </div>
        <DenseColor label="Barva záhlaví" value={appConfig.ui2d?.bottomLeft?.titleColor ?? '#ffffff'} onChange={v => updateUi2dBottomLeft('titleColor', v)} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
          {(appConfig.ui2d?.bottomLeft?.items || []).map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '8px', alignItems: 'center', background: 'rgba(244,63,94,0.05)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(244,63,94,0.1)' }}>
              <div style={{ fontSize: '0.7rem', color: '#f43f5e', opacity: 0.6 }}>#{i+1}</div>
              <input type="text" value={item.label} onChange={e => updateUi2dBottomLeftItem(i, 'label', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.75rem', outline: 'none' }} placeholder="Název" />
              <input type="text" value={item.url} onChange={e => updateUi2dBottomLeftItem(i, 'url', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.75rem', outline: 'none' }} placeholder="Odkaz / #hash" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: item.dimmed ? '#f43f5e' : '#94a3b8', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!item.dimmed} onChange={e => updateUi2dBottomLeftItem(i, 'dimmed', e.target.checked)} style={{ accentColor: '#f43f5e' }} />
                Tlumit
              </label>
              <button className="btn-delete" style={{ padding: '2px 6px', fontSize: '0.7rem', marginLeft: '4px' }} onClick={() => removeUi2dBottomLeftItem(i)}>X</button>
            </div>
          ))}
          <button style={{ alignSelf: 'flex-start', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e', padding: '4px 12px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer', marginTop: '4px' }} onClick={addUi2dBottomLeftItem}>+ Přidat řádek</button>
        </div>
      </DashboardCard>

    </div>
  );
}
