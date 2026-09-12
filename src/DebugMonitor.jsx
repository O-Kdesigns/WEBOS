import React, { useState, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

// Globální uložiště pro live statistiky z WebGL smyčky
export const debugMetrics = {
  fps: 60,
  frameTime: 16.6,
  drawCalls: 0,
  triangles: 0,
  textures: 0,
  listeners: new Set()
};

// Pomocná komponenta uvnitř <Canvas>, která měří reálné snímkování a WebGL volání
export function CanvasDebugTracker() {
  const { gl } = useThree();
  const frameTimes = useRef([]);
  const lastTime = useRef(performance.now());
  const frameCount = useRef(0);

  useFrame(() => {
    const now = performance.now();
    const delta = now - lastTime.current;
    lastTime.current = now;

    frameTimes.current.push(delta);
    if (frameTimes.current.length > 30) {
      frameTimes.current.shift();
    }

    frameCount.current++;
    if (frameCount.current % 6 === 0) {
      const avgDelta = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
      debugMetrics.fps = Math.round(1000 / Math.max(avgDelta, 1));
      debugMetrics.frameTime = Math.round(avgDelta * 10) / 10;
      debugMetrics.drawCalls = gl.info.render.calls;
      debugMetrics.triangles = gl.info.render.triangles;
      debugMetrics.textures = gl.info.memory.textures;

      debugMetrics.listeners.forEach(fn => fn());
    }
  });

  return null;
}

// UI overlay zobrazený v rohu obrazovky
export function DebugMonitorHUD({ videoTextureCache, viewMode, activeUrl, activeTitle }) {
  const [isOpen, setIsOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    debugMetrics.listeners.add(listener);
    return () => {
      debugMetrics.listeners.delete(listener);
    };
  }, []);

  // Automatické logování do konzole každých 5 sekund pro rychlou kontrolu v DevTools
  useEffect(() => {
    const interval = setInterval(() => {
      const videosInfo = [];
      let playingCount = 0;
      let totalDropped = 0;

      videoTextureCache.forEach((entry, url) => {
        const v = entry.video;
        const isPlaying = v && !v.paused && v.readyState >= 2;
        if (isPlaying) playingCount++;
        const quality = v?.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
        const dropped = quality ? quality.droppedVideoFrames : 0;
        totalDropped += dropped;

        videosInfo.push({
          url: url.split('/').pop(),
          state: isPlaying ? 'PLAYING' : 'PAUSED',
          time: v ? `${v.currentTime.toFixed(1)}s` : '0s',
          droppedFrames: dropped
        });
      });

      console.log(
        `%c[WEBOS Auto-Debug] Mode: ${viewMode} | FPS: ${debugMetrics.fps} (${debugMetrics.frameTime}ms) | Active Videos: ${playingCount}/${videoTextureCache.size} | Total Dropped: ${totalDropped} | Draws: ${debugMetrics.drawCalls}`,
        debugMetrics.fps >= 50 ? 'color: #10b981; font-weight: bold;' : 'color: #ef4444; font-weight: bold;',
        videosInfo
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [viewMode, videoTextureCache]);

  const fps = debugMetrics.fps;
  const fpsColor = fps >= 50 ? '#10b981' : fps >= 30 ? '#f59e0b' : '#ef4444';

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

  return (
    <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 99999, fontFamily: 'monospace', fontSize: 12 }}>
      {/* Tlačítko pro rozbalení/sbalení s živým FPS ukazatelem */}
      <div 
        onClick={() => setIsOpen(o => !o)}
        style={{
          background: 'rgba(15, 23, 42, 0.85)',
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
        <span style={{ color: '#94a3b8' }}>({debugMetrics.frameTime}ms)</span>
        <span style={{ color: '#38bdf8', textTransform: 'uppercase', fontSize: 10 }}>{viewMode}</span>
        <span style={{ color: '#64748b' }}>{isOpen ? '▼' : '▲'}</span>
      </div>

      {/* Rozbalený diagnostický panel */}
      {isOpen && (
        <div style={{
          marginTop: 8,
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#e2e8f0',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '12px',
          borderRadius: '8px',
          width: '320px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
        }}>
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6, marginBottom: 8, fontWeight: 'bold', color: '#38bdf8' }}>
            ⚡ Automatická Diagnostika Scény
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: 10 }}>
            <div>Režim: <b style={{ color: '#38bdf8' }}>{viewMode}</b></div>
            <div>Draw Calls: <b>{debugMetrics.drawCalls}</b></div>
            <div>Trojúhelníky: <b>{(debugMetrics.triangles / 1000).toFixed(1)}k</b></div>
            <div>GPU Textury: <b>{debugMetrics.textures}</b></div>
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
            Aktivní projekt: <span style={{ color: '#f8fafc' }}>{activeTitle || 'Neznámý'}</span>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 6 }}>
            <div style={{ color: '#cbd5e1', marginBottom: 4, fontWeight: 'bold', fontSize: 11 }}>
              Stav Video Dekodérů ({videoList.filter(v => v.isPlaying).length} hraje):
            </div>
            {videoList.map(v => (
              <div key={v.url} style={{
                padding: '4px 6px',
                margin: '3px 0',
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
        </div>
      )}
    </div>
  );
}
