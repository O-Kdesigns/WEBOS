import React, { useState, useEffect, useRef } from 'react';
import { fluidSpeed, pointerSpeedCm } from './components/particles/ParticleFluid';
import { useFrame, useThree } from '@react-three/fiber';

// Globální uložiště pro live statistiky z WebGL smyčky a historii incidentů
export const debugMetrics = {
  fps: 60,
  fpsMin: 60,
  frameTime: 16.6,
  frameTimeMax: 16.6,
  drawCalls: 0,
  triangles: 0,
  textures: 0,
  incidents: [],
  listeners: new Set(),
  onIncidentTrigger: null,
  addIncident(incident) {
    const entry = {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString(),
      ...incident
    };
    debugMetrics.incidents.unshift(entry);
    if (debugMetrics.incidents.length > 40) {
      debugMetrics.incidents.pop();
    }
    if (typeof window !== 'undefined') {
      window.__WEBOS_PERF_LOGS__ = debugMetrics.incidents;
    }
    // Okamžitý zápis na disk při detekci incidentu
    if (typeof debugMetrics.onIncidentTrigger === 'function') {
      debugMetrics.onIncidentTrigger();
    }
  }
};

if (typeof window !== 'undefined') {
  window.__WEBOS_DEBUG_METRICS__ = debugMetrics;
}

// Pomocná komponenta uvnitř <Canvas>, která měří reálné snímkování a WebGL volání
export function CanvasDebugTracker() {
  const { gl } = useThree();
  const frameTimes = useRef([]);
  const lastTime = useRef(performance.now());
  const frameCount = useRef(0);
  const lastSpikeLog = useRef(0);

  useFrame(() => {
    const now = performance.now();
    const delta = now - lastTime.current;
    lastTime.current = now;

    frameTimes.current.push(delta);
    if (frameTimes.current.length > 60) {
      frameTimes.current.shift();
    }

    // Detekce mikrozáseků (stutter spike > 40ms / < 25 FPS)
    if (delta > 40 && now - lastSpikeLog.current > 1500) {
      lastSpikeLog.current = now;
      debugMetrics.addIncident({
        type: 'FPS_SPIKE',
        severity: 'WARN',
        msg: `Zásek renderovací smyčky: ${delta.toFixed(1)}ms (${Math.round(1000 / delta)} FPS)`,
        frameTime: Math.round(delta * 10) / 10
      });
    }

    frameCount.current++;
    if (frameCount.current % 8 === 0) {
      const times = [...frameTimes.current].sort((a, b) => a - b);
      const avgDelta = times.reduce((a, b) => a + b, 0) / times.length;
      const p95Delta = times[Math.floor(times.length * 0.95)] || avgDelta;
      const maxDelta = times[times.length - 1] || avgDelta;

      debugMetrics.fps = Math.round(1000 / Math.max(avgDelta, 1));
      debugMetrics.fpsMin = Math.round(1000 / Math.max(p95Delta, 1));
      debugMetrics.frameTime = Math.round(avgDelta * 10) / 10;
      debugMetrics.frameTimeMax = Math.round(maxDelta * 10) / 10;

      if (gl.info.render.calls > 1) {
        debugMetrics.drawCalls = gl.info.render.calls;
        debugMetrics.triangles = gl.info.render.triangles;
      }
      debugMetrics.textures = gl.info.memory.textures;

      debugMetrics.listeners.forEach(fn => fn());
    }
  });

  return null;
}

// UI overlay zobrazený v rohu obrazovky s automatickým zápisem na disk
// Aktuální rychlost myši vedle FPS (cm/s na displeji – stejná, jakou bere 2D voda pro práh víření).
// Vlastní interval 100 ms, ať se kvůli ní nepřekresluje celý HUD.
function MouseSpeed() {
  const [cm, setCm] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const fs = fluidSpeed();
      setCm(fs ? fs.cm : (pointerSpeedCm(performance.now()) ?? 0));
    }, 100);
    return () => clearInterval(id);
  }, []);
  return <span style={{ color: '#ec4899', fontSize: 10, fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right' }}>{cm.toFixed(0)} cm/s</span>;
}

// actions = tlačítka vlevo vedle FPS ukazatele (App: ⚙️ Editor)
export function DebugMonitorHUD({ videoTextureCache, viewMode, activeUrl, activeTitle, actions }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [, setTick] = useState(0);
  const prevVideoDropsRef = useRef(new Map());
  const prevTextureCountRef = useRef(0);

  // Unikátní název souboru relace vytvořený při startu/refreshi aplikace
  const sessionIdRef = useRef('');
  if (!sessionIdRef.current) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    sessionIdRef.current = `session_${ts}`;
  }

  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    debugMetrics.listeners.add(listener);
    return () => {
      debugMetrics.listeners.delete(listener);
    };
  }, []);

  // Funkce pro odeslání a zápis logu do souboru na disk
  const flushLogsToDisk = useRef(() => {});
  flushLogsToDisk.current = () => {
    if (!sessionIdRef.current) return;

    const vids = [];
    videoTextureCache.forEach((entry, url) => {
      const v = entry.video;
      const isPlaying = v && !v.paused;
      const quality = v?.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      vids.push({
        fileName: decodeURIComponent(url.split('/').pop()),
        isPlaying,
        currentTime: v ? v.currentTime.toFixed(1) : '0',
        duration: v && v.duration ? v.duration.toFixed(1) : '?',
        dropped: quality ? quality.droppedVideoFrames : 0,
        total: quality ? quality.totalVideoFrames : 0,
        readyState: v ? v.readyState : 0
      });
    });

    const bottlenecks = [];
    const playingVid = vids.find(v => v.isPlaying);
    if (playingVid && playingVid.dropped > 100) {
      bottlenecks.push(`Video dekodér: '${playingVid.fileName}' zahodilo ${playingVid.dropped} snímků`);
    }
    if (debugMetrics.triangles > 1000000) {
      bottlenecks.push(`Geometrie: ${(debugMetrics.triangles / 1000000).toFixed(1)}M trojúhelníků`);
    }
    if (debugMetrics.drawCalls > 120) {
      bottlenecks.push(`Draw Calls: ${debugMetrics.drawCalls} volání`);
    }
    if (debugMetrics.textures > 60) {
      bottlenecks.push(`GPU Paměť: ${debugMetrics.textures} alokovaných textur`);
    }

    const payload = {
      sessionId: sessionIdRef.current,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
      metrics: {
        fps: debugMetrics.fps,
        fpsMin: debugMetrics.fpsMin,
        frameTime: debugMetrics.frameTime,
        frameTimeMax: debugMetrics.frameTimeMax,
        drawCalls: debugMetrics.drawCalls,
        triangles: debugMetrics.triangles,
        textures: debugMetrics.textures,
        viewMode,
        activeProject: activeTitle || 'Neznámý',
        videos: vids
      },
      bottlenecks,
      incidents: debugMetrics.incidents.slice(0, 25)
    };

    // Endpoint existuje jen na lokálním dev serveru (vite plugin) – v produkci nic neposílat
    if (!import.meta.env.DEV) return;
    fetch('/api/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  };

  // Zaregistrování okamžitého zápisu při vzniku nového incidentu
  useEffect(() => {
    debugMetrics.onIncidentTrigger = () => {
      flushLogsToDisk.current();
    };
    return () => {
      debugMetrics.onIncidentTrigger = null;
    };
  }, []);

  // Pravidelný zápis na disk každé 3 sekundy + úvodní zápis při spuštění
  useEffect(() => {
    // 1. Úvodní zápis do nového souboru na disku
    flushLogsToDisk.current();

    // 2. Pravidelný heartbeat každé 3 sekundy
    const interval = setInterval(() => {
      // Detekce zahazování snímků u aktivních videí
      videoTextureCache.forEach((entry, url) => {
        const v = entry.video;
        if (!v || v.paused) return;

        const quality = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
        if (!quality) return;

        const currentDropped = quality.droppedVideoFrames;
        const prevDropped = prevVideoDropsRef.current.get(url) ?? currentDropped;
        const droppedDelta = currentDropped - prevDropped;
        prevVideoDropsRef.current.set(url, currentDropped);

        const fileName = decodeURIComponent(url.split('/').pop());

        if (droppedDelta > 3) {
          debugMetrics.addIncident({
            type: 'VIDEO_DROP',
            severity: 'ERROR',
            msg: `Video '${fileName}' zahodilo ${droppedDelta} snímků/s (celkem ${currentDropped}f)!`,
            video: fileName,
            droppedDelta
          });
        }
      });

      // Detekce kumulace GPU textur
      const currentTex = debugMetrics.textures;
      const prevTex = prevTextureCountRef.current;
      if (prevTex > 0 && currentTex - prevTex > 25) {
        debugMetrics.addIncident({
          type: 'TEXTURE_ACCUMULATION',
          severity: 'WARN',
          msg: `Skok v počtu GPU textur: ${prevTex} -> ${currentTex} (+${currentTex - prevTex} textur)`,
          count: currentTex
        });
      }
      prevTextureCountRef.current = currentTex;

      // Zápis aktuálního stavu na disk
      flushLogsToDisk.current();
    }, 3000);

    return () => clearInterval(interval);
  }, [videoTextureCache, viewMode, activeTitle]);

  const fps = debugMetrics.fps;
  const fpsMin = debugMetrics.fpsMin;
  const fpsColor = fps >= 55 ? '#10b981' : fps >= 35 ? '#f59e0b' : '#ef4444';

  const videoList = [];
  videoTextureCache.forEach((entry, url) => {
    const v = entry.video;
    const isPlaying = v && !v.paused;
    const quality = v?.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
    const dropped = quality ? quality.droppedVideoFrames : 0;
    const total = quality ? quality.totalVideoFrames : 0;
    const fileName = decodeURIComponent(url.split('/').pop());

    videoList.push({
      url,
      fileName,
      isPlaying,
      currentTime: v ? v.currentTime.toFixed(1) : '0',
      duration: v && v.duration ? v.duration.toFixed(1) : '?',
      dropped,
      total,
      readyState: v ? v.readyState : 0
    });
  });

  // Analýza úzkého hrdla
  const activeBottlenecks = [];
  const playingVideo = videoList.find(v => v.isPlaying);
  if (playingVideo && playingVideo.dropped > 100) {
    activeBottlenecks.push(`Video dekodér: '${playingVideo.fileName}' zahodilo ${playingVideo.dropped}f`);
  }
  if (debugMetrics.triangles > 1000000) {
    activeBottlenecks.push(`Geometrie: ${(debugMetrics.triangles / 1000000).toFixed(1)}M trojúhelníků přetěžuje GPU`);
  }
  if (debugMetrics.drawCalls > 120) {
    activeBottlenecks.push(`Draw Calls: ${debugMetrics.drawCalls} volání zatěžuje CPU vlákno`);
  }
  if (debugMetrics.textures > 60) {
    activeBottlenecks.push(`GPU Paměť: ${debugMetrics.textures} alokovaných textur`);
  }

  // Funkce pro zkopírování diagnostického reportu do schránky (volitelně)
  const copyReport = () => {
    const activeVidStr = videoList.map(v => 
      `  - ${v.fileName}: ${v.isPlaying ? 'HRAJE' : 'PAUZA'} (${v.currentTime}s / ${v.duration}s) | Drop: ${v.dropped}f / Celkem: ${v.total}f`
    ).join('\n');

    const incidentsStr = debugMetrics.incidents.slice(0, 8).map(inc => 
      `  [${inc.time}] [${inc.severity}] ${inc.msg}`
    ).join('\n') || '  (Žádné incidenty nezaznamenány - scéna běží čistě)';

    const report = `=== WEBOS AGENT DIAGNOSTIC REPORT ===
Relace: ${sessionIdRef.current}
Čas: ${new Date().toLocaleString()}
Režim: ${viewMode} | Aktivní projekt: ${activeTitle || 'Neznámý'}
FPS: ${debugMetrics.fps} (1% Low: ${debugMetrics.fpsMin}) | Čas snímku: ${debugMetrics.frameTime}ms (Peak: ${debugMetrics.frameTimeMax}ms)
Draw Calls: ${debugMetrics.drawCalls} | Trojúhelníky: ${(debugMetrics.triangles / 1000).toFixed(1)}k | GPU Textury: ${debugMetrics.textures}

Stav Video Dekodérů (${videoList.filter(v => v.isPlaying).length} hraje):
${activeVidStr}

Aktivní úzká hrdla:
${activeBottlenecks.length > 0 ? activeBottlenecks.map(b => '  ⚠️ ' + b).join('\n') : '  ✓ Žádná kritická úzká hrdla nezjištěna'}

Nedávné incidenty a záseky:
${incidentsStr}
=====================================`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        setCopiedNotice(true);
        setTimeout(() => setCopiedNotice(false), 2500);
      });
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 99999, fontFamily: 'monospace', fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'stretch' }}>
      {actions}
      {/* Tlačítko pro rozbalení/sbalení s živým FPS ukazatelem */}
      <div
        onClick={() => setIsOpen(o => !o)}
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          color: '#f8fafc',
          border: `1px solid ${fpsColor}`,
          padding: '6px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backdropFilter: 'blur(8px)',
          userSelect: 'none'
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: fpsColor }}></span>
        <span style={{ fontWeight: 'bold' }}>{fps} FPS</span>
        <MouseSpeed />
        <span style={{ color: '#64748b' }}>{isOpen ? '▼' : '▲'}</span>
      </div>
      </div>

      {/* Rozbalený diagnostický panel */}
      {isOpen && (
        <div style={{
          marginTop: 8,
          background: 'rgba(15, 23, 42, 0.96)',
          color: '#e2e8f0',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          padding: '12px',
          borderRadius: '8px',
          width: '340px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6, marginBottom: 8 }}>
            <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>⚡ Diagnostika & Bottlenecky</span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{viewMode}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: 8, fontSize: 11 }}>
            <div>FPS: <b style={{ color: fpsColor }}>{fps}</b> (min {fpsMin})</div>
            <div>Čas: <b>{debugMetrics.frameTime}ms</b></div>
            <div>Draw Calls: <b style={{ color: debugMetrics.drawCalls > 100 ? '#f59e0b' : '#38bdf8' }}>{debugMetrics.drawCalls}</b></div>
            <div>Trojúhelníky: <b>{(debugMetrics.triangles / 1000).toFixed(1)}k</b></div>
            <div>GPU Textury: <b style={{ color: debugMetrics.textures > 40 ? '#f59e0b' : '#38bdf8' }}>{debugMetrics.textures}</b></div>
            <div>Projekt: <b style={{ color: '#f8fafc' }}>{activeTitle || 'Neznámý'}</b></div>
          </div>

          {/* Stav úzkých hrdel */}
          <div style={{ background: activeBottlenecks.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)', border: `1px solid ${activeBottlenecks.length > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`, borderRadius: '4px', padding: '6px 8px', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 'bold', color: activeBottlenecks.length > 0 ? '#f87171' : '#34d399', marginBottom: 2 }}>
              {activeBottlenecks.length > 0 ? '⚠️ DETEKOVÁNA ÚZKÁ HRDLA:' : '✓ SYSTÉM BĚŽÍ BEZ PŘETÍŽENÍ'}
            </div>
            {activeBottlenecks.map((b, idx) => (
              <div key={idx} style={{ fontSize: 10, color: '#fca5a5', marginTop: 1 }}>• {b}</div>
            ))}
          </div>

          {/* Videa */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 4 }}>
            <div style={{ color: '#cbd5e1', marginBottom: 4, fontWeight: 'bold', fontSize: 10 }}>
              Video Dekodéry ({videoList.filter(v => v.isPlaying).length} hraje):
            </div>
            {videoList.map(v => (
              <div key={v.url} style={{
                padding: '4px 6px',
                margin: '2px 0',
                borderRadius: '4px',
                background: v.isPlaying ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.1)',
                borderLeft: v.isPlaying ? '3px solid #10b981' : '3px solid #64748b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }} title={v.fileName}>
                  {v.fileName}
                </div>
                <div style={{ textAlign: 'right', fontSize: 10 }}>
                  <span style={{ color: v.isPlaying ? '#10b981' : '#94a3b8', fontWeight: 'bold' }}>
                    {v.isPlaying ? 'HRAJE' : 'PAUZA'}
                  </span>
                  {' '}({v.currentTime}s)
                  {v.dropped > 0 && (
                    <div style={{ color: '#f87171' }}>Drop: {v.dropped}f</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Informace o ukládání na disk */}
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 10, color: '#94a3b8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
              <span>Automatické ukládání do: <b style={{ color: '#38bdf8' }}>WEBOS/debug_logs/</b></span>
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#a7f3d0' }}>
              Soubor: {sessionIdRef.current}.log
            </div>
          </div>

          {/* Tlačítko pro kopírování pro agenta (volitelná alternativa) */}
          <div style={{ marginTop: 8 }}>
            <button
              onClick={copyReport}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: copiedNotice ? '#10b981' : 'rgba(2, 132, 199, 0.8)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background 0.2s'
              }}
            >
              <span>{copiedNotice ? '✓ ZKOPÍROVÁNO PRO AGENTA!' : '📋 Zkopírovat diagnostiku pro agenta'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
