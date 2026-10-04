import React from 'react';
import { ParticleSettingsPanel } from './ParticleSettingsPanel';
import { DNA_CORE_DEFAULTS } from '../../../DnaCore';
import { DNA_HOLD_DEFAULTS } from '../../particles/utils';
import { BRAND_LOGO_DEFAULTS } from '../../../BrandLogo';

export const DenseSlider = ({ label, desc, min, max, step, value, onChange, unit = '', color = '#10b981' }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 45px', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
    <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: desc ? 'help' : 'default' }} title={desc || label}>{label}</div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%', height: '3px', accentColor: color, cursor: 'pointer', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', margin: 0 }} />
    <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: color, textAlign: 'right' }}>{Number(value).toFixed(step < 0.1 ? 2 : (step < 1 ? 1 : 0))}{unit}</div>
  </div>
);

export const DenseToggle = ({ label, desc, checked, onChange, color = '#10b981' }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center', marginBottom: '6px', cursor: desc ? 'help' : 'pointer' }} title={desc || label}>
    <div style={{ fontSize: '0.75rem', color: checked ? '#f8fafc' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: desc ? 'help' : 'pointer' }}>{label}</div>
    <div style={{ display: 'flex' }}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: color, width: '14px', height: '14px', margin: 0, cursor: 'pointer' }} /></div>
  </label>
);

export const DenseColor = ({ label, desc, value, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
    <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: desc ? 'help' : 'default' }} title={desc || label}>{label}</div>
    <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', height: '20px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: '4px' }} />
  </div>
);

export const DenseSelect = ({ label, desc, value, options, onChange, color = '#10b981' }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
    <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: desc ? 'help' : 'default' }} title={desc || label}>{label}</div>
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '2px 6px', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid ' + color + '40', color: '#f8fafc', borderRadius: '4px', cursor: 'pointer', outline: 'none' }}>
      {options.map(o => <option key={o.value} value={o.value} style={{background: '#0f172a'}}>{o.label}</option>)}
    </select>
  </div>
);

export const DashboardCard = ({ title, icon, color, span = 1, children }) => (
  <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid ' + color + '30', borderRadius: '10px', gridColumn: span > 1 ? '1 / -1' : 'span 1', display: 'flex', flexDirection: 'column' }}>
    <div style={{ background: color + '15', padding: '8px 12px', borderBottom: '1px solid ' + color + '30', display: 'flex', alignItems: 'center', gap: '8px', color: color, fontWeight: 'bold', fontSize: '0.8rem', borderTopLeftRadius: '10px', borderTopRightRadius: '10px' }}>
      {icon} {title}
    </div>
    <div style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
      {children}
    </div>
  </div>
);

export function OrbitSettingsPanel({ appConfig, updateConfig, updatePowerSaving, updateBackground, updateCameraSpotLight, updateDnaSettings, updatePhysics, assets, openSections, toggleSection, touchSection }) {
  const p = appConfig.dnaSettings || {};
  const core = { ...DNA_CORE_DEFAULTS, ...(appConfig.dnaCore || {}) };
  const updateCore = (field, value) => updateConfig('dnaCore', { ...(appConfig.dnaCore || {}), [field]: value });
  const pp = appConfig.particlePhysics || {};
  const updatePP = (field, value) => updateConfig('particlePhysics', { ...pp, [field]: value });
  const vl = appConfig.volumetricLight || {};
  const updateVL = (field, value) => updateConfig('volumetricLight', { ...vl, [field]: value });
  const updateTvLight = (field, value) => updateConfig('tvLight', { ...(appConfig.tvLight || {}), [field]: value });
  const logoCfg = { ...BRAND_LOGO_DEFAULTS, ...(appConfig.brandLogo || {}) };
  const updateLogo = (field, value) => updateConfig('brandLogo', { ...logoCfg, [field]: value });
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gridAutoRows: 'min-content', gap: '16px', width: '100%', height: '100%' }}>

      <DashboardCard title="Logo" icon="🔠" color="#c4ff00">
        <DenseToggle desc="Kinetic logo z labu (brand-kinetic-lab → ★ → 🌐 Save for web). Vzhled, animace, roh a odsazení se nastavují v labu (Style → Placement debug), tady jen velikost." label="Zobrazit logo" color="#c4ff00" checked={logoCfg.enabled} onChange={v => updateLogo('enabled', v)} />
        <DenseSlider desc="Velikost loga (1 = box 240 × 105 px, text ho vyplní na šířku). Odsazení z labu je v em, takže roste s ní." label="Velikost (scale)" min={0.2} max={3} step={0.05} color="#c4ff00" value={logoCfg.scale} onChange={v => updateLogo('scale', v)} />
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 6 }}>Roh a odsazení: lab → Style → Placement debug → ★ 🌐 Save for web.</div>
      </DashboardCard>

      <DashboardCard title="Architektura (DNA)" icon="🧬" color="#10b981">
        <DenseSlider desc="Výška, na které DNA udělá plnou otočku. Kalibruje rotaci projektů." label="Výška 360° otočky" min={5} max={100} step={0.5} value={appConfig.dnaHeight360 || 30} onChange={v => updateConfig('dnaHeight360', v)} />
        <DenseSlider desc="Prostorová vzdálenost (krokování) mezi jednotlivými projekty v ose Y." label="Rozestup projektů" min={1} max={30} step={0.1} value={appConfig.verticalStep || 10} onChange={v => updateConfig('verticalStep', v)} />
        <div style={{ height: '10px' }} />
        <DenseToggle desc="Zobrazí vnější dekorativní sloupec částic simulující DNA." label="Zobrazit částice DNA" checked={p.hasParticles ?? true} onChange={v => updateDnaSettings('hasParticles', v)} />
        <DenseSlider desc="Šířka oblouku (rádius) obíhajících částic." label="Poloměr oblaku" min={5} max={50} step={1} value={p.radius ?? 20} onChange={v => updateDnaSettings('radius', v)} />
        <div style={{ height: '10px' }} />
        <DenseToggle desc="Želé kuličky jako plošky natočené na kameru, kouli dopočítá shader po pixelech: dokonale kulaté v jakékoli velikosti a 4 vrcholy místo ~40. Vypnuto = 3D koule z trojúhelníků (hranaté u velkých kuliček)." label="Kuličky jako plošky (impostor)" checked={appConfig.particleImpostor?.enabled ?? false} onChange={v => updateConfig('particleImpostor', { ...(appConfig.particleImpostor || {}), enabled: v })} />
        <DenseToggle desc="Kuličky zapisují skutečnou hloubku bodu na kouli -> překrývající se kuličky se protínají jako koule. Vypnuto = ploché kotouče (rychlejší, ale u překryvu je vidět rovný řez)." label="Prolínání kuliček" checked={appConfig.particleImpostor?.depth ?? true} onChange={v => updateConfig('particleImpostor', { ...(appConfig.particleImpostor || {}), depth: v })} />
      </DashboardCard>

      <DashboardCard title="Rozvíření DNA (myš v ORBITu)" icon="🌀" color="#22d3ee">
        <DenseSlider desc="Násobek síly vody (myši) jen v klidu DNA v ORBITu. Projekt uvnitř má plnou sílu. Menší = menší bordel při kroužení." label="Síla myši na DNA" min={0} max={2} step={0.05} color="#22d3ee" value={pp.dnaForce ?? DNA_HOLD_DEFAULTS.dnaForce} onChange={v => updatePP('dnaForce', v)} />
        <DenseSlider desc="Jak daleko smí particl DNA odletět od svého místa (world, každý náhodně 0.6–1.4×). Dál ho měkká stěna nepustí – šroubovice zůstane čitelná i při silném kroužení. 0 = bez omezení (starý stav: odletěly až o poloměr DNA)." label="Vodítko DNA" min={0} max={1.5} step={0.01} color="#22d3ee" value={pp.dnaLeash ?? DNA_HOLD_DEFAULTS.dnaLeash} onChange={v => updatePP('dnaLeash', v)} />
        <DenseSlider desc="O kolik dál (world) smí particl od svého místa odjet, dokud se drží blízko struktury DNA (vláken nebo příček, do vzdálenosti Vodítka). 0 = nic navíc. Odjede-li od DNA, platí zase jen Vodítko." label="Dojezd podél DNA" min={0} max={3} step={0.05} color="#22d3ee" value={pp.dnaSlide ?? DNA_HOLD_DEFAULTS.dnaSlide} onChange={v => updatePP('dnaSlide', v)} />
        <DenseSlider desc="Od jaké části limitu začne voda ztrácet sílu tlačit particl ven a particl se obloukem stočí zpátky k DNA. Víc = měkčí, dřívější otočka (méně se jich nahromadí u hranice). Particly se u hranice nezastaví, krouží dál." label="Měkkost hranice" min={0.05} max={0.7} step={0.05} color="#22d3ee" value={pp.dnaEdge ?? DNA_HOLD_DEFAULTS.dnaEdge} onChange={v => updatePP('dnaEdge', v)} />
        <DenseSlider desc="Náhodné rozhození limitu odjezdu (Vodítko i Dojezd podél DNA) pro každý particl zvlášť. 0 = všichni mají stejný limit (viditelná „stěna“), 1 = od 0,15× do 1,85×." label="Rozhození limitu" min={0} max={1} step={0.01} color="#22d3ee" value={pp.dnaLimitRandom ?? DNA_HOLD_DEFAULTS.dnaLimitRandom} onChange={v => updatePP('dnaLimitRandom', v)} />
        <DenseSlider desc="Jak dlouho particly DNA po strčení myší visí venku, než se začnou vracet (s). Projekt uvnitř má vlastní (Zpoždění návratu)." label="Zdržení návratu DNA" min={0} max={3} step={0.05} color="#22d3ee" value={pp.dnaReturnDelay ?? DNA_HOLD_DEFAULTS.dnaReturnDelay} onChange={v => updatePP('dnaReturnDelay', v)} />
        <DenseSlider desc="Za jak dlouho se návrat DNA rozjede na plnou sílu (s). Víc = pomalejší, línější návrat." label="Rozjezd návratu DNA" min={0} max={4} step={0.05} color="#22d3ee" value={pp.dnaReturnRamp ?? DNA_HOLD_DEFAULTS.dnaReturnRamp} onChange={v => updatePP('dnaReturnRamp', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#22d3ee', marginBottom: '8px' }}>Jádro DNA (skleněná páteř)</div>
        <DenseToggle desc="Skleněné destičky uvnitř obou vláken DNA + energetická nit s pulzy. Schované v particlech – ukáže se jen tam, odkud particly odletěly, a zhasne dřív, než se vrátí." label="Jádro DNA" checked={core.enabled} color="#22d3ee" onChange={v => updateCore('enabled', v)} />
        <DenseSlider desc="Celkový jas jádra při plném rozvíření." label="Síla jádra" min={0} max={3} step={0.05} color="#22d3ee" value={core.intensity} onChange={v => updateCore('intensity', v)} />
        <DenseSlider desc="Viditelnost jádra v klidu (0 = jen kde particly odletěly, 1 = pořád – schované uvnitř vláken)." label="Viditelnost v klidu" min={0} max={1} step={0.01} color="#22d3ee" value={core.rest} onChange={v => updateCore('rest', v)} />
        <DenseToggle desc="Jak se měří odlet particlů pro odhalení páteře. Zapnuto = 2D z pohledu kamery (particl, který odletěl hlavně dopředu ke kameře, páteř pořád zakrývá -> neodhalí ji). Vypnuto = 3D vzdálenost od svého místa." label="Odlet z pohledu kamery (2D)" checked={core.reveal2d} color="#22d3ee" onChange={v => updateCore('reveal2d', v)} />
        <DenseToggle desc="Páteř jen tam, kde ji z pohledu kamery nezakrývá žádný particl (ani cizí, který přiletěl na místo odletěných). Stojí 1 malý render všech particlů navíc za snímek (jen při víření) – na mobilu vypnout." label="Zakrytí z pohledu kamery" checked={core.cover} color="#22d3ee" onChange={v => updateCore('cover', v)} />
        <DenseSlider desc="[Zakrytí] Jak velká část okolí páteře musí být z pohledu kamery volná, aby se začala ukazovat." label="Volno od" min={0} max={0.95} step={0.01} color="#22d3ee" value={core.coverFrom} onChange={v => updateCore('coverFrom', v)} />
        <DenseToggle desc="Páteř i uvnitř příček, které spojují obě vlákna (tyče přes střed DNA)." label="Páteř v příčkách" checked={core.rungs} color="#22d3ee" onChange={v => updateCore('rungs', v)} />
        <DenseSlider desc="Od jaké vzdálenosti od svého místa se particl začne počítat jako „odletěl“ (world). Víc = páteř se ukáže až při větším odletu a při návratu zhasne dřív." label="Začátek odletu" min={0} max={0.4} step={0.01} color="#22d3ee" value={core.awayMin} onChange={v => updateCore('awayMin', v)} />
        <DenseSlider desc="Od jaké vzdálenosti se particl počítá jako odletěl naplno (world). Víc = páteř zhasne dřív, než se particly vrátí." label="Plný odlet" min={0.08} max={0.6} step={0.01} color="#22d3ee" value={core.awayMax} onChange={v => updateCore('awayMax', v)} />
        <DenseSlider desc="Podíl odletěných particlů v úseku vlákna, od kterého se páteř začne ukazovat." label="Práh odhalení" min={0.01} max={0.8} step={0.01} color="#22d3ee" value={core.revealFrom} onChange={v => updateCore('revealFrom', v)} />
        <DenseSlider desc="Podíl odletěných particlů, při kterém je páteř vidět naplno." label="Plné odhalení" min={0.05} max={1} step={0.01} color="#22d3ee" value={core.revealFull} onChange={v => updateCore('revealFull', v)} />
        <DenseSlider desc="Úroveň 1 – linie (zhmotní se z jisker): kdy je plně vidět (podíl mezi Prahem a Plným odhalením)." label="Linie naplno při" min={0.05} max={1} step={0.01} color="#22d3ee" value={core.lineTo} onChange={v => updateCore('lineTo', v)} />
        <DenseSlider desc="Úroveň 2 – tyčinky vyrostou, až když particly odletí dál než tohle (world). Linie se ukazuje už od Začátku odletu." label="Tyčinky od odletu" min={0.05} max={0.8} step={0.01} color="#22d3ee" value={core.tileAwayMin} onChange={v => updateCore('tileAwayMin', v)} />
        <DenseSlider desc="Odlet, při kterém se particl pro tyčinky počítá naplno (world)." label="Tyčinky plně od" min={0.1} max={1} step={0.01} color="#22d3ee" value={core.tileAwayMax} onChange={v => updateCore('tileAwayMax', v)} />
        <DenseSlider desc="O kolik se tyčinka při objevení zašroubuje (radiány, střídavě na obě strany)." label="Zašroubování" min={0} max={8} step={0.1} color="#22d3ee" value={core.appearTwist} onChange={v => updateCore('appearTwist', v)} />
        <DenseSlider desc="Jak silně proud myši (2D voda) roztočí tyčinky, přes které přejede. Každá tyčinka má vlastní otáčení (0 = vůbec)." label="Roztočení myší" min={0} max={100} step={1} color="#22d3ee" value={core.spinMouse} onChange={v => updateCore('spinMouse', v)} />
        <DenseSlider desc="Útlum otáčení tyčinek (1/s). Menší = delší dojezd, víc = rychle zastaví." label="Útlum otáčení" min={0.05} max={3} step={0.05} color="#22d3ee" value={core.spinDamp} onChange={v => updateCore('spinDamp', v)} />
        <DenseColor desc="Barva energie – nit, pulzy a světlo v hranách skla." label="Barva energie" value={core.color} onChange={v => updateCore('color', v)} />
        <DenseColor desc="Barva skla destiček." label="Barva skla" value={core.glass} onChange={v => updateCore('glass', v)} />
        <DenseSlider desc="Krytí skleněných destiček." label="Krytí skla" min={0} max={1.5} step={0.05} color="#22d3ee" value={core.glassOpacity} onChange={v => updateCore('glassOpacity', v)} />
        <DenseSlider desc="Šířka destiček (world). Vlákno particlů má poloměr ~0,15–0,2 – širší destičky budou prosvítat v klidu." label="Šířka destiček" min={0.04} max={0.4} step={0.01} color="#22d3ee" value={core.width} onChange={v => updateCore('width', v)} />
        <DenseSlider desc="Rozestup destiček po výšce (world Y)." label="Rozestup destiček" min={0.02} max={0.3} step={0.005} color="#22d3ee" value={core.spacing} onChange={v => updateCore('spacing', v)} />
        <DenseSlider desc="Stočení destiček kolem vlákna (radiány na jednotku výšky)." label="Stočení" min={0} max={8} step={0.1} color="#22d3ee" value={core.spin} onChange={v => updateCore('spin', v)} />
        <DenseSlider desc="Rychlost pulzů, které tečou po niti dolů (world/s)." label="Rychlost pulzů" min={0} max={8} step={0.1} color="#22d3ee" value={core.pulseSpeed} onChange={v => updateCore('pulseSpeed', v)} />
        <DenseSlider desc="Průměrná vzdálenost pulzů (world). Víc = řidší pulzy." label="Rozestup pulzů" min={0.5} max={15} step={0.1} color="#22d3ee" value={core.pulseGap} onChange={v => updateCore('pulseGap', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#22d3ee', marginBottom: '8px' }}>Paprsky (god rays ze středu)</div>
        <DenseSlider desc="Základní síla god rays v ORBITu (paprsky z jasných míst scény)." label="Síla paprsků" min={0} max={3} step={0.05} color="#22d3ee" value={vl.exposure ?? 1} onChange={v => updateVL('exposure', v)} />
        <DenseSlider desc="O kolik paprsky zeslábnou při rozvíření DNA myší (rozházené svítící particly jinak dělají paprsky přes celou obrazovku)." label="Útlum při víření" min={0} max={1} step={0.05} color="#22d3ee" value={vl.stirCut ?? 0.6} onChange={v => updateVL('stirCut', v)} />
        <DenseSlider desc="O kolik paprsky zeslábnou při scrollu (podle rychlosti jízdy kamery)." label="Útlum při scrollu" min={0} max={1} step={0.05} color="#22d3ee" value={vl.scrollCut ?? 0.5} onChange={v => updateVL('scrollCut', v)} />
        <DenseSlider desc="O kolik paprsky (i mlha z prachu) slábnou přes sklo aktivní televize – jinak kladou závoj přes video. 0 = jako dřív." label="Paprsky přes sklo TV" min={0} max={1} step={0.05} color="#22d3ee" value={appConfig.tvLight?.rayMask ?? 0.85} onChange={v => updateTvLight('rayMask', v)} />
      </DashboardCard>

      <DashboardCard title="Pohyb a Kamera" icon="🚀" color="#f43f5e">
        <DenseSlider desc="Šířka zorného úhlu kamery." label="Zorné pole (FOV)" min={30} max={120} step={1} color="#f43f5e" value={appConfig.cameraFov || 60} onChange={v => updateConfig('cameraFov', v)} />
        <DenseSlider desc="Vertikální výška kamery nad středem scény." label="Výška kamery (Y)" min={0} max={5} step={0.1} color="#f43f5e" value={appConfig.cameraHeight ?? 1.5} onChange={v => updateConfig('cameraHeight', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f43f5e', marginBottom: '8px' }}>Fyzika rotace a posunu</div>
        <DenseSlider desc="Tíha a setrvačnost scény při roztáčení." label="Hmotnost (Mass)" min={0.5} max={10} step={0.1} color="#f43f5e" value={appConfig.physics?.mass || 2.5} onChange={v => updatePhysics('mass', v)} />
        <DenseSlider desc="Síla pružiny, která po puštění přitáhne pohled na nejbližší projekt." label="Pružnost (Tension)" min={50} max={1000} step={10} color="#f43f5e" value={appConfig.physics?.tension || 500} onChange={v => updatePhysics('tension', v)} />
        <DenseSlider desc="Tlumení roztáčení. Vyšší hodnota = rychleji zabrzdí." label="Tření (Friction)" min={10} max={300} step={1} color="#f43f5e" value={appConfig.physics?.friction || 100} onChange={v => updatePhysics('friction', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f43f5e', marginBottom: '8px' }}>Gesta a Kolečka myši</div>
        <DenseSlider desc="Počet záseků kolečka myši potřebných pro posun o 1 projekt." label="Kroků na projekt" min={1} max={20} step={1} color="#f43f5e" value={appConfig.scrollStepsPerPortfolio ?? 5} onChange={v => updateConfig('scrollStepsPerPortfolio', v)} />
        <DenseSlider desc="Násobič rychlosti scrollování myší." label="Rychlost scrollu" min={0.1} max={3.0} step={0.1} color="#f43f5e" value={appConfig.scrollSpeed ?? 1.0} onChange={v => updateConfig('scrollSpeed', v)} />
        <DenseSlider desc="Práh rychlosti tažením (swipe) pro přeskok na další projekt." label="Citlivost tahu (Swipe)" min={0.1} max={3.0} step={0.1} color="#f43f5e" value={appConfig.physics?.swipeVelocityThreshold || 0.5} onChange={v => updatePhysics('swipeVelocityThreshold', v)} />
      </DashboardCard>

      <DashboardCard title="Světlo a Prostředí" icon="🌍" color="#3b82f6">
        <DenseSlider desc="Intenzita textury oblohy odrážející se ve skle." label="HDRI Obloha" min={0} max={5} step={0.1} color="#3b82f6" value={appConfig.hdriIntensity ?? 1.0} onChange={v => updateConfig('hdriIntensity', v)} />
        <DenseSlider desc="Síla ambientního nasvícení (nepřímé světlo)." label="Okolní odrazy" min={0} max={2} step={0.1} color="#3b82f6" value={appConfig.environmentIntensity ?? 0.8} onChange={v => updateConfig('environmentIntensity', v)} />
        <DenseColor desc="Základní barva nekonečného prostoru za scénou." label="Barva pozadí" value={appConfig.backgroundSettings?.color ?? appConfig.backgroundSettings?.centerColor ?? '#0a0a0f'} onChange={v => updateBackground('color', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#3b82f6', marginBottom: '8px' }}>Bodové osvětlení z kamery</div>
        <DenseToggle desc="Spustí kuželové světlo svítící z pohledu kamery." label="Přisvícení objektů" checked={appConfig.cameraSpotLight?.enabled ?? false} color="#3b82f6" onChange={v => updateCameraSpotLight('enabled', v)} />
        <DenseSlider desc="Jak moc kužel kamery září." label="Intenzita světla" min={0} max={10} step={0.1} color="#3b82f6" value={appConfig.cameraSpotLight?.intensity ?? 2.0} onChange={v => updateCameraSpotLight('intensity', v)} />
        <DenseSlider desc="Jak široký je světelný kužel kamery." label="Úhel kužele" min={0.1} max={1.5} step={0.1} color="#3b82f6" value={appConfig.cameraSpotLight?.angle ?? 0.6} onChange={v => updateCameraSpotLight('angle', v)} />
      </DashboardCard>
      
      <DashboardCard title="Systém & Výkon" icon="⚙️" color="#8b5cf6">
        <DenseToggle desc="Zastaví render (0% GPU), když klikneš vedle prohlížeče." label="Pause on Blur" checked={appConfig.powerSaving?.pauseOnBlur ?? true} color="#8b5cf6" onChange={v => updatePowerSaving('pauseOnBlur', v)} />
        <DenseToggle desc="Ukáže malou oranžovou ikonu PAUZA, pokud scéna neběží." label="Zobrazit HUD odznak" checked={appConfig.powerSaving?.showBadge ?? true} color="#8b5cf6" onChange={v => updatePowerSaving('showBadge', v)} />
        <div style={{ height: '8px' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#8b5cf6', marginBottom: '8px' }}>Hudební přehrávač</div>
        <DenseToggle desc="Automaticky ztlumí (Mute) zvuk při kliknutí do jiné záložky." label="Ztlumit v pozadí" checked={appConfig.powerSaving?.pauseAudioOnBlur ?? false} color="#8b5cf6" onChange={v => updatePowerSaving('pauseAudioOnBlur', v)} />
        <DenseSlider desc="Celková hlasitost hudebního podkresu v UI." label="Hlasitost hudby" min={0} max={1} step={0.05} color="#8b5cf6" value={appConfig.musicVolume ?? 0.4} onChange={v => updateConfig('musicVolume', v)} />
      </DashboardCard>

      {p.hasParticles !== false && (
        <DashboardCard title="Geometrie Částic (Orbit)" icon="✨" color="#14b8a6">
          <ParticleSettingsPanel 
            settings={{ shape: 'sphere', count: 10000, colorMode: 'video', baseColor: '#3b82f6', ...appConfig.dnaSettings }}
            onUpdate={updateDnaSettings}
            id="global-dna"
            blenderNodes={[]}
          />
        </DashboardCard>
      )}

    </div>
  );
}
