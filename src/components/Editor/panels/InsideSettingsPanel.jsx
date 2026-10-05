import React from 'react';
import { DenseSlider, DenseToggle, DenseColor, DashboardCard } from './OrbitSettingsPanel';
import { FLUID_DEFAULTS } from '../../particles/ParticleFluid';
import { ESCAPE_DEFAULTS } from '../../particles/utils';

export function InsideSettingsPanel({ appConfig, updateConfig, updateVolumetric, updateInsideFog, updatePhysics, updateParticlePhysics, updateVolumetricVideo, updateVolumetricDepth, updateUi2d, updateUi2dBottomLeft, updateUi2dBottomLeftItem, addUi2dBottomLeftItem, removeUi2dBottomLeftItem, updateUi2dPillButton, openSections, toggleSection, touchSection }) {
  const fluid = appConfig.particlePhysics?.fluid || {};
  const updateFluid = (field, value) => updateParticlePhysics('fluid', { ...fluid, [field]: value });
  const esc = { ...ESCAPE_DEFAULTS, ...(appConfig.particlePhysics?.escape || {}) };
  const updateSolidPrint = (field, value) => updateConfig('solidPrint', { ...(appConfig.solidPrint || {}), [field]: value });
  const updateEscape = (field, value) => updateParticlePhysics('escape', { ...(appConfig.particlePhysics?.escape || {}), [field]: value });
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
        <DenseSlider desc="Jak rychle particl při návratu ztratí svou rychlost. Míň = dlouho si drží tempo a letí přes cíl, víc = rychle se srovná na klidný dojezd." label="Tlumení návratu" min={0.2} max={1.5} step={0.05} value={appConfig.particlePhysics?.returnDamping ?? 0.7} color="#ec4899" onChange={v => updateParticlePhysics('returnDamping', v)} />
        <DenseSlider desc="Jak široký oblouk particl opíše, než se stočí zpátky k cíli. 0 = otočí se skoro na místě, 1 = velké líné oblouky. Rychlejší particly vždy berou širší oblouk." label="Oblouk návratu" min={0} max={1} step={0.01} value={appConfig.particlePhysics?.returnArc ?? 0.5} color="#ec4899" onChange={v => updateParticlePhysics('returnArc', v)} />
        <DenseSlider desc="Pružina k domovu JEN pro particly, které se vracejí (odtržené neovlivní). Přímo brzdí let od domova – víc = kratší odlet a menší oblouky, 0 = jen stáčení (dlouhé oblouky). Platí pro volný návrat v klidu (DNA i projekt), ne pro morph." label="Síla pružiny (vracející)" min={0} max={3} step={0.05} value={appConfig.particlePhysics?.returnStrength ?? 1} color="#ec4899" onChange={v => updateParticlePhysics('returnStrength', v)} />
        <DenseSlider desc="Zpoždění otáčení obsahu za tahem myši (solidy i částice stejně). 0 = hned za prstem." label="Setrvačnost otáčení" min={0} max={1} step={0.01} value={appConfig.particlePhysics?.spinLag ?? 0.5} color="#ec4899" onChange={v => updateParticlePhysics('spinLag', v)} />
        <DenseSlider desc="Jak moc částice drží se solidy při otáčení. 1 = přesně s nimi, nižší = částice se opožďují (dozvuk)." label="Unášení částic" min={0} max={1} step={0.01} value={appConfig.particlePhysics?.rotationCarry ?? 0.85} color="#ec4899" onChange={v => updateParticlePhysics('rotationCarry', v)} />

        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Odtržené particly (jen DNA)</div>
        <DenseToggle desc="Část particlů odfouknutých daleko od DNA se utrhne, zazáří a dál volně pluje prostorem (myš na ně působí dál). Po vstupu do projektu a návratu se zase připojí." label="Odtrhávání" checked={esc.enabled} color="#ec4899" onChange={v => updateEscape('enabled', v)} />
        <DenseSlider desc="Za kolik sekund od zlomu se odtržený particl sám připojí zpět (barva plynule odezní a oblouky ho dovedou domů). Dřív se připojily až s uspáním vody (~30 s)." label="Doba odtržení (s)" min={2} max={59} step={1} value={esc.life} color="#ec4899" onChange={v => updateEscape('life', v)} />
        <DenseSlider desc="Bod zlomu: jak daleko od svého místa (world) musí particl odletět, aby se mohl utrhnout. Míň = utrhnou se i po slabém tahu." label="Vzdálenost zlomu" min={0.05} max={1} step={0.01} value={esc.distance} color="#ec4899" onChange={v => updateEscape('distance', v)} />
        <DenseSlider desc="Kolik z odfouknutých particlů se utrhne (0 = žádný, 1 = všechny za bodem zlomu)." label="Podíl odtržených" min={0} max={1} step={0.01} value={esc.chance} color="#ec4899" onChange={v => updateEscape('chance', v)} />
        <DenseSlider desc="Rychlost pomalého plutí volných particlů (world/s)." label="Rychlost plutí" min={0} max={0.5} step={0.005} value={esc.drift} color="#ec4899" onChange={v => updateEscape('drift', v)} />
        <DenseSlider desc="Jak dlouho volný particl dojíždí po strčení myší (za snímek). 1 = vesmír bez odporu, míň = brzdí." label="Setrvačnost volných" min={0.9} max={1} step={0.001} value={esc.friction} color="#ec4899" onChange={v => updateEscape('friction', v)} />
        <DenseSlider desc="Jak daleko od DNA smí volné particly odplout (world). Dál je měkce stočí zpátky do okolí." label="Dosah plutí" min={0.2} max={5} step={0.05} value={esc.leash} color="#ec4899" onChange={v => updateEscape('leash', v)} />
        <DenseSlider desc="Násobek síly myši (vody) na volné particly. Vracejících se to netýká." label="Síla myši na volné" min={0} max={3} step={0.05} value={esc.mouse} color="#ec4899" onChange={v => updateEscape('mouse', v)} />
        <DenseSlider desc="Velikost vírů, po kterých plují. Víc = drobnější, neklidnější dráhy." label="Drobnost proudu" min={0.2} max={6} step={0.1} value={esc.flowScale} color="#ec4899" onChange={v => updateEscape('flowScale', v)} />
        <DenseColor desc="Barva, kterou odtržené particly převezmou a kterou zazáří." label="Barva odtržených" value={esc.color} onChange={v => updateEscape('color', v)} />
        <DenseSlider desc="Jak moc převezmou barvu (0 = původní barva, jen záblesk)." label="Přebarvení" min={0} max={1} step={0.01} value={esc.tint} color="#ec4899" onChange={v => updateEscape('tint', v)} />
        <DenseSlider desc="Jas záblesku v bodě zlomu (nad 1 = HDR, chytá bloom)." label="Záblesk zlomu" min={0} max={20} step={0.1} value={esc.flash} color="#ec4899" onChange={v => updateEscape('flash', v)} />
        <DenseSlider desc="Za jak dlouho záblesk dozní (s)." label="Doznění záblesku" min={0.05} max={3} step={0.05} value={esc.flashTime} color="#ec4899" onChange={v => updateEscape('flashTime', v)} />
        <DenseSlider desc="Trvalá záře volných particlů po záblesku." label="Záře volných" min={0} max={3} step={0.05} value={esc.glow} color="#ec4899" onChange={v => updateEscape('glow', v)} />
        <DenseSlider desc="Jak moc se particl v záblesku zvětší (0 = vůbec)." label="Zvětšení při zlomu" min={0} max={3} step={0.05} value={esc.pop} color="#ec4899" onChange={v => updateEscape('pop', v)} />

        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Voda (myš) – platí v ORBITu i uvnitř projektu</div>
        <DenseToggle desc="Vodnatá fyzika: myš rozhrne jen přední particly, proud dojíždí a víří. Vypnuto = starý štětec (Laser níže)." label="Vodnatá fyzika" checked={fluid.enabled ?? FLUID_DEFAULTS.enabled} color="#ec4899" onChange={v => updateFluid('enabled', v)} />
        <DenseSlider desc="Hlavní síla myši: násobí všechno, čím voda hýbe particly (proud ve stopě i vlny). 0 = myš nic nedělá." label="Celková síla" min={0} max={3} step={0.05} value={fluid.strength ?? FLUID_DEFAULTS.strength} color="#ec4899" onChange={v => updateFluid('strength', v)} />
        <DenseToggle desc="Zapnuto = vodu tvoří JEN pohyb particlů: myš particly jen poprvé strčí, strčené particly svou rychlostí rozhýbou vodu a ta nese další. Kde nejsou particly, myš vodu nehne. Vypnuto = myš vhání proud i vlny přímo do vody (dřívější chování)." label="Vodu tvoří particly" checked={(fluid.source ?? FLUID_DEFAULTS.source) === 'particles'} color="#ec4899" onChange={v => updateFluid('source', v ? 'particles' : 'mouse')} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>První strčení myší (tah)</div>
        <DenseToggle desc="Pavel (jako PavelDoGreat): myš proud přičítá -> tenké proudy stočené do vírů. Vypnuto = starý štětec (proud nastavený na rychlost kurzoru; platí Šířka stopy, Ostrost, Brázda, Síla proudu, Vyrovnání a Strop rychlosti)." label="Režim Pavel" checked={(fluid.mode ?? FLUID_DEFAULTS.mode) !== 'brush'} color="#ec4899" onChange={v => updateFluid('mode', v ? 'pavel' : 'brush')} />
        <DenseSlider desc="[Pavel] Síla tahu: posun kurzoru za snímek × tohle = přidaný proud (Pavel 6000)." label="Síla tahu (Pavel)" min={500} max={15000} step={100} value={fluid.splatForce ?? FLUID_DEFAULTS.splatForce} color="#ec4899" onChange={v => updateFluid('splatForce', v)} />
        <DenseSlider desc="[Pavel] Odezva na rychlost myši. 1 = lineární jako Pavel (pomalý tah slabý, švih rozvíří vše), menší = i pomalý tah dělá víry a rychlý je slabší." label="Vyrovnání rychlosti (Pavel)" min={0.2} max={1} step={0.05} value={fluid.pavelCurve ?? FLUID_DEFAULTS.pavelCurve} color="#ec4899" onChange={v => updateFluid('pavelCurve', v)} />
        <DenseSlider desc="[Pavel] Strop rychlosti tahu (výšky obrazovky za s): nad ním už švih skoro nesílí. Menší = poctivý švih nerozvíří celou DNA." label="Strop rychlosti (Pavel)" min={0.2} max={6} step={0.1} value={fluid.pavelMaxSpeed ?? FLUID_DEFAULTS.pavelMaxSpeed} color="#ec4899" onChange={v => updateFluid('pavelMaxSpeed', v)} />
        <DenseSlider desc="[Pavel] Poloměr stopy (Pavel 0.25)." label="Poloměr stopy (Pavel)" min={0.05} max={1} step={0.01} value={fluid.pavelRadius ?? FLUID_DEFAULTS.pavelRadius} color="#ec4899" onChange={v => updateFluid('pavelRadius', v)} />
        <DenseSlider desc="[Voda z particlů] Jak dlouho trvá náraz myši do particlů (s). Míň = jen krátké ťuknutí, víc = myš particly tlačí déle." label="Délka nárazu myši" min={0.03} max={1.5} step={0.01} value={fluid.pushFade ?? FLUID_DEFAULTS.pushFade} color="#ec4899" onChange={v => updateFluid('pushFade', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Voda z particlů (jak moc se tvoří)</div>
        <DenseSlider desc="[Voda z particlů] Jak silně rychlost strčených particlů rozhýbe vodu v jejich místě (za snímek). 1 = voda hned převezme rychlost particlů." label="Síla vody z particlů" min={0} max={1} step={0.01} value={fluid.inject ?? FLUID_DEFAULTS.inject} color="#ec4899" onChange={v => updateFluid('inject', v)} />
        <DenseSlider desc="[Voda z particlů] Kolik vody vznikne z jednoho particlu (1 / počet particlů v buňce pro plné pokrytí). Víc = i řídké particly udělají plnou vodu." label="Voda z 1 particlu" min={0.05} max={3} step={0.05} value={fluid.injectCover ?? FLUID_DEFAULTS.injectCover} color="#ec4899" onChange={v => updateFluid('injectCover', v)} />
        <DenseSlider desc="[Voda z particlů] Velikost stopy jednoho particlu ve vodě (buňky mřížky). Víc = širší proud kolem každého particlu." label="Stopa particlu" min={1} max={6} step={1} value={fluid.injectPointSize ?? FLUID_DEFAULTS.injectPointSize} color="#ec4899" onChange={v => updateFluid('injectPointSize', v)} />
        <DenseSlider desc="[Voda z particlů] Vlny, které pohybující se particly zvedají (jako loď), × Výška vlny níže. 0 = bez vln." label="Vlny z particlů" min={0} max={4} step={0.05} value={fluid.injectWave ?? FLUID_DEFAULTS.injectWave} color="#ec4899" onChange={v => updateFluid('injectWave', v)} />
        <DenseSlider desc="[Voda z particlů] Jak rychle musí myš táhnout, aby se to začalo vířit (výšky obrazovky za s). Pomalejší tah particly jen strčí, vodu z nich netvoří. Doznění se počítá od posledního tahu nad prahem. 0 = víří každý tah." label="Práh rychlosti víření" min={0} max={5} step={0.05} value={fluid.stirSpeed ?? FLUID_DEFAULTS.stirSpeed} color="#ec4899" onChange={v => updateFluid('stirSpeed', v)} />
        <DenseSlider desc="[Voda z particlů] Jak dlouho po posledním pohybu myši ještě strkané particly tvoří vodu (s). Síla plynule klesá k nule – potom už nic nevíří samo." label="Doznění po myši" min={0.2} max={10} step={0.1} value={fluid.afterglow ?? FLUID_DEFAULTS.afterglow} color="#ec4899" onChange={v => updateFluid('afterglow', v)} />
        <DenseSlider desc="[Voda z particlů] Jak rychle voda po doznění utichne (útlum za s navíc). Víc = hned klid, míň = ještě chvíli dojíždí." label="Utišení po doznění" min={0} max={10} step={0.1} value={fluid.calm ?? FLUID_DEFAULTS.calm} color="#ec4899" onChange={v => updateFluid('calm', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Šíření vody (do stran a do dálky)</div>
        <DenseSlider desc="Útlum proudu. Menší = delší dojezd vody po zastavení myši." label="Útlum (dojezd)" min={0.05} max={4} step={0.05} value={fluid.dissipation ?? FLUID_DEFAULTS.dissipation} color="#ec4899" onChange={v => updateFluid('dissipation', v)} />
        <DenseSlider desc="Zesílení vírů (drží je roztočené, jinak se rozmažou). Víry samotné vznikají v brázdě." label="Víření" min={0} max={60} step={0.5} value={fluid.curl ?? FLUID_DEFAULTS.curl} color="#ec4899" onChange={v => updateFluid('curl', v)} />
        <DenseSlider desc="Jak rychle mizí stopa myši ve vodě. Menší = particly se posouvají déle a dál." label="Mizení stopy" min={0.1} max={5} step={0.05} value={fluid.trailFade ?? FLUID_DEFAULTS.trailFade} color="#ec4899" onChange={v => updateFluid('trailFade', v)} />
        <DenseSlider desc="Jak rychle se particl nechá strhnout proudem (menší = líné, těžší particly)." label="Strhávání particlů" min={0.02} max={1} step={0.01} value={fluid.coupling ?? FLUID_DEFAULTS.coupling} color="#ec4899" onChange={v => updateFluid('coupling', v)} />
        <DenseSlider desc="Výška vlny, kterou tah myši zvedne (jako loď). 0 = bez vln." label="Výška vlny" min={0} max={10} step={0.1} value={fluid.waveHeight ?? FLUID_DEFAULTS.waveHeight} color="#ec4899" onChange={v => updateFluid('waveHeight', v)} />
        <DenseSlider desc="Jak daleko vlna doběhne (výšky obrazovky). Stejné pro pomalé i rychlé vlny." label="Dosah vln" min={0.03} max={0.6} step={0.01} value={fluid.waveReach ?? FLUID_DEFAULTS.waveReach} color="#ec4899" onChange={v => updateFluid('waveReach', v)} />
        <DenseSlider desc="Rozrážení: jak daleko vlna particly od tahu odsune (pak se vrátí)." label="Rozrážení vlnou" min={0} max={0.08} step={0.001} value={fluid.waveDrift ?? FLUID_DEFAULTS.waveDrift} color="#ec4899" onChange={v => updateFluid('waveDrift', v)} />
        <DenseSlider desc="Houpání particlů na vlně (tam a zpět, bez trvalého posunu). Moc = vibrace." label="Houpání na vlně" min={0} max={40} step={0.5} value={fluid.waveForce ?? FLUID_DEFAULTS.waveForce} color="#ec4899" onChange={v => updateFluid('waveForce', v)} />
        <DenseSlider desc="Rychlost vln = tolikrát rychlost myši. Nad 1 vlna vždy utíká před kurzorem (pod 1 = nadzvukový třesk, vlna odfoukne všechno)." label="Rychlost vln × myš" min={1} max={3} step={0.05} value={fluid.waveSpeedRatio ?? FLUID_DEFAULTS.waveSpeedRatio} color="#ec4899" onChange={v => updateFluid('waveSpeedRatio', v)} />
        <DenseSlider desc="Nejpomalejší vlna (výšky obrazovky/s) – pomalý tah = pomalé vlny." label="Min. rychlost vln" min={0.05} max={1} step={0.01} value={fluid.waveSpeedMin ?? FLUID_DEFAULTS.waveSpeedMin} color="#ec4899" onChange={v => updateFluid('waveSpeedMin', v)} />
        <DenseSlider desc="Strop rychlosti vln (výšky obrazovky/s)." label="Max. rychlost vln" min={1} max={10} step={0.1} value={fluid.waveSpeedMax ?? FLUID_DEFAULTS.waveSpeedMax} color="#ec4899" onChange={v => updateFluid('waveSpeedMax', v)} />
        <DenseSlider desc="Jak dlouho vlny drží rychlost, když myš zpomalí (s)." label="Držení rychlosti vln" min={0.1} max={4} step={0.05} value={fluid.waveSpeedHold ?? FLUID_DEFAULTS.waveSpeedHold} color="#ec4899" onChange={v => updateFluid('waveSpeedHold', v)} />
        <DenseSlider desc="Růst výšky vlny s rychlostí myši. 0 = stejná vlna pro každou rychlost, 1 = lineárně." label="Růst vlny s rychlostí" min={0} max={1} step={0.05} value={fluid.waveGrowth ?? FLUID_DEFAULTS.waveGrowth} color="#ec4899" onChange={v => updateFluid('waveGrowth', v)} />
        <DenseSlider desc="Tloušťka přední vrstvy particlů, kterou voda posouvá (world). Zadní zůstanou." label="Hloubka přední vrstvy" min={0.02} max={1} step={0.01} value={fluid.frontShell ?? FLUID_DEFAULTS.frontShell} color="#ec4899" onChange={v => updateFluid('frontShell', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Náhled a starý štětec</div>
        <DenseSlider desc="[Pavel] Mizení barviva v náhledu 💧 2D voda (jen vzhled náhledu, particly neovlivní; Pavel 1)." label="Mizení barviva (náhled)" min={0.1} max={5} step={0.05} value={fluid.dyeFade ?? FLUID_DEFAULTS.dyeFade} color="#ec4899" onChange={v => updateFluid('dyeFade', v)} />
        <DenseSlider desc="Šířka stopy myši ve vodě (podíl výšky obrazovky)." label="Šířka stopy" min={0.01} max={0.15} step={0.005} value={fluid.splatRadius ?? FLUID_DEFAULTS.splatRadius} color="#ec4899" onChange={v => updateFluid('splatRadius', v)} />
        <DenseSlider desc="Ostrost okraje stopy. Víc = ostřejší vlna, méně = měkká rozmazaná." label="Ostrost vlny" min={0.5} max={5} step={0.1} value={fluid.splatHardness ?? FLUID_DEFAULTS.splatHardness} color="#ec4899" onChange={v => updateFluid('splatHardness', v)} />
        <DenseSlider desc="Šířka brázdy za kurzorem. Širší měkký proud kolem stopy – po stranách se za kurzorem stočí víry (jako lžička ve vodě)." label="Šířka brázdy" min={0.02} max={0.2} step={0.005} value={fluid.wakeRadius ?? FLUID_DEFAULTS.wakeRadius} color="#ec4899" onChange={v => updateFluid('wakeRadius', v)} />
        <DenseSlider desc="Síla brázdy (proudu kolem stopy). 0 = jen úzká stopa bez vírů po stranách, víc = silnější víry." label="Síla brázdy" min={0} max={1} step={0.01} value={fluid.wake ?? FLUID_DEFAULTS.wake} color="#ec4899" onChange={v => updateFluid('wake', v)} />
        <DenseSlider desc="Rychlost proudu jen v úzké stopě přímo pod kurzorem (1 = rychlost kurzoru). Rozrážení do stran dělají vlny – na celkovou sílu použij Celkovou sílu." label="Síla proudu" min={0.1} max={3} step={0.05} value={fluid.force ?? FLUID_DEFAULTS.force} color="#ec4899" onChange={v => updateFluid('force', v)} />
        <DenseSlider desc="Odezva na rychlost myši. 1 = lineární (pomalý tah slabý, švih extrémní), menší = vyrovnanější." label="Vyrovnání rychlosti" min={0.2} max={1} step={0.05} value={fluid.speedCurve ?? FLUID_DEFAULTS.speedCurve} color="#ec4899" onChange={v => updateFluid('speedCurve', v)} />
        <DenseSlider desc="Strop rychlosti tahu (výšky obrazovky za s). Rychlejší švih už nesílí." label="Strop rychlosti" min={0.5} max={8} step={0.1} value={fluid.maxSpeed ?? FLUID_DEFAULTS.maxSpeed} color="#ec4899" onChange={v => updateFluid('maxSpeed', v)} />

        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Interakce myší (Laser – jen když je voda vypnutá)</div>
        <DenseSlider desc="Síla výbuchu, který rozfoukne částice při přejetí myší." label="Síla odfouknutí myší" min={0.1} max={5.0} step={0.1} value={appConfig.particlePhysics?.mouseForce ?? 1.0} color="#ec4899" onChange={v => updateParticlePhysics('mouseForce', v)} />
        <DenseSlider desc="Dosah kolizní kuličky myši rozrážející částice." label="Průměr stopy (Radius)" min={0.1} max={5.0} step={0.1} value={appConfig.particlePhysics?.mouseRadius ?? 2.0} color="#ec4899" onChange={v => updateParticlePhysics('mouseRadius', v)} />
        <DenseSlider desc="Délka pomyslného průniku laseru z kurzoru skrz scénu." label="Délka průniku (Laser)" min={0.1} max={20.0} step={0.1} value={appConfig.particlePhysics?.laserLength ?? 5.0} color="#ec4899" onChange={v => updateParticlePhysics('laserLength', v)} />

        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Paprsky 3D tisku</div>
        <DenseSlider desc="Síla laserů, které míří na celou tiskovou linku i tam, kde nic není. Kde se tiskne mesh, jsou vždy silnější. 0 = jen na mesh." label="Lasery do prázdna" min={0} max={3} step={0.05} value={appConfig.solidPrint?.raysBed ?? 1} color="#ec4899" onChange={v => updateSolidPrint('raysBed', v)} />
        <DenseSlider desc="Prodloužení tiskové linky za krajní tištěné body (podíl její délky na každou stranu). 0 = přesně od nejlevějšího po nejpravější tištěné místo." label="Přesah linky" min={0} max={0.5} step={0.01} value={appConfig.solidPrint?.raysBedMargin ?? 0} color="#ec4899" onChange={v => updateSolidPrint('raysBedMargin', v)} />
        <DenseSlider desc="Výška bodu, ze kterého lasery vycházejí: 0 = spodek obrazovky, 1 = vršek." label="Zdroj laserů (Y)" min={0} max={1} step={0.01} value={appConfig.solidPrint?.raysCenterY ?? 0.25} color="#ec4899" onChange={v => updateSolidPrint('raysCenterY', v)} />
        <DenseSlider desc="Síla páry nad tiskovou linkou (fake, levná). Víc páry je tam, kde se opravdu tiskne. 0 = vypnuto." label="Pára nad linkou" min={0} max={3} step={0.05} value={appConfig.solidPrint?.steam ?? 2} color="#ec4899" onChange={v => updateSolidPrint('steam', v)} />
        <DenseSlider desc="Vztlak páry – gravitace nahoru (výšky obrazovky/s²). Víc = pára rychleji zrychluje vzhůru." label="Vztlak páry" min={0} max={1.5} step={0.01} value={appConfig.solidPrint?.steamRise ?? 0.15} color="#ec4899" onChange={v => updateSolidPrint('steamRise', v)} />
        <DenseSlider desc="Víření páry (sílí s výškou, jak se pára rozpadá)." label="Víření páry" min={0} max={4} step={0.05} value={appConfig.solidPrint?.steamTurb ?? 1.5} color="#ec4899" onChange={v => updateSolidPrint('steamTurb', v)} />
        <DenseSlider desc="Jak rychle pára mizí (za s). Menší = vyšší sloupce." label="Mizení páry" min={0.2} max={5} step={0.05} value={appConfig.solidPrint?.steamFade ?? 1.1} color="#ec4899" onChange={v => updateSolidPrint('steamFade', v)} />
        <DenseSlider desc="Jak silně páru strhává proud myši z 2D vody." label="Myš v páře" min={0} max={4} step={0.05} value={appConfig.solidPrint?.steamMouse ?? 1} color="#ec4899" onChange={v => updateSolidPrint('steamMouse', v)} />
        <DenseSlider desc="Šedý kouř stoupající z celé tiskové linky (dole do červena, nahoře šedý). 0 = jen horká pára z tištěných míst." label="Kouř z linky" min={0} max={1} step={0.01} value={appConfig.solidPrint?.smoke ?? 0.6} color="#ec4899" onChange={v => updateSolidPrint('smoke', v)} />
        <DenseSlider desc="Horká pára, která po dotištění pořád stoupá ze svítících míst solidů (panely, diamanty) – solidy vypadají žhavé. 0 = po tisku nic." label="Žhavá pára po tisku" min={0} max={3} step={0.05} value={appConfig.solidPrint?.hotSmoke ?? 1} color="#ec4899" onChange={v => updateSolidPrint('hotSmoke', v)} />
        <DenseColor desc="Barva kouře nahoře (dole se míchá s barvou žáru)." label="Barva kouře" value={appConfig.solidPrint?.smokeColor ?? '#a4a4aa'} onChange={v => updateSolidPrint('smokeColor', v)} />
        <DenseToggle desc="Experiment: paprsky k okrajům rámu místo do bodu (zatím nefunguje hezky)." label="Rám místo bodu (experiment)" checked={appConfig.solidPrint?.raysFrame ?? false} color="#ec4899" onChange={v => updateSolidPrint('raysFrame', v)} />
        <DenseSlider desc="Kam se paprsky tisku sbíhají: 1 = přesně k okrajům obrazovky, 0 = rám se smrskne do jednoho bodu ve středu." label="Rám paprsků (Scale)" min={0} max={1} step={0.01} value={appConfig.solidPrint?.raysFrameScale ?? 1} color="#ec4899" onChange={v => updateSolidPrint('raysFrameScale', v)} />
        <DenseSlider desc="Zaoblení rohů rámu – změkčí zlom paprsků mezi hranami." label="Bevel hran" min={0} max={1} step={0.01} value={appConfig.solidPrint?.raysBevel ?? 0.3} color="#ec4899" onChange={v => updateSolidPrint('raysBevel', v)} />
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
          <input type="text" value={appConfig.ui2d?.bottomLeft?.header ?? ''} onChange={e => updateUi2dBottomLeft('header', e.target.value)} style={{ width: '100%', padding: '2px 8px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(244,63,94,0.3)', color: 'white', borderRadius: '4px' }} placeholder="Záhlaví..." />
        </div>
        <DenseColor label="Barva záhlaví" value={appConfig.ui2d?.bottomLeft?.headerColor ?? '#ffffff'} onChange={v => updateUi2dBottomLeft('headerColor', v)} />
        <DenseColor label="Barva textu odkazů" value={appConfig.ui2d?.bottomLeft?.textColor ?? '#c9c9c9'} onChange={v => updateUi2dBottomLeft('textColor', v)} />
        <DenseSlider desc="Color-dodge text na černém pozadí skoro mizí (pozadí ÷ (1 − barva textu)). Tichá kopie textu pod ním dá písmenům minimální jas; na světlejším pozadí se nic nemění. 0 = čistý Active Theory efekt." label="Čitelnost na tmavém" min={0} max={0.4} step={0.01} value={appConfig.ui2d?.bottomLeft?.darkFloor ?? 0.14} color="#f43f5e" onChange={v => updateUi2dBottomLeft('darkFloor', v)} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
          {(appConfig.ui2d?.bottomLeft?.items || []).map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '8px', alignItems: 'center', background: 'rgba(244,63,94,0.05)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(244,63,94,0.1)' }}>
              <div style={{ fontSize: '0.7rem', color: '#f43f5e', opacity: 0.6 }}>#{i+1}</div>
              <input type="text" value={item.text} onChange={e => updateUi2dBottomLeftItem(i, 'text', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.75rem', outline: 'none' }} placeholder="Název" />
              <input type="text" value={item.link} onChange={e => updateUi2dBottomLeftItem(i, 'link', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.75rem', outline: 'none' }} placeholder="Odkaz / #hash" />
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
