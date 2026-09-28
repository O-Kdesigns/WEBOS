import { useEffect, useState } from 'react';
import { useThree, addEffect, addAfterEffect } from '@react-three/fiber';
import { prof } from './GpuProfiler';
import { probe } from './FrameProbe';

// Uvnitř <Canvas>: napojí profiler na renderer a na začátek/konec každého snímku R3F.
// ?prof=1 v URL ho zapne hned po načtení, F9 přepíná.
export function GpuProfilerHook() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    prof.attach(gl);
    probe.attach(gl); // záznamník záseků běží v DEV vždy (debug_logs/hitch_*.log)
    const offA = addEffect(() => { prof.frameBegin(); probe.frameBegin(); });
    const offB = addAfterEffect(() => { prof.frameEnd(); probe.frameEnd(); });
    if (new URLSearchParams(window.location.search).get('prof') === '1') prof.enable();
    const onKey = (e) => { if (e.key === 'F9') { e.preventDefault(); prof.toggle(); } };
    window.addEventListener('keydown', onKey);
    return () => { offA(); offB(); window.removeEventListener('keydown', onKey); prof.disable(); };
  }, [gl]);
  return null;
}

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');

// DOM panel mimo <Canvas> (vpravo nahoře). Zobrazuje se jen když profiler běží.
export function GpuProfilerPanel() {
  const [snap, setSnap] = useState(prof.last);
  const [on, setOn] = useState(prof.on);
  useEffect(() => prof.subscribe((s) => { setSnap(s); setOn(prof.on); }), []);
  useEffect(() => {
    const id = setInterval(() => setOn(prof.on), 500);
    return () => clearInterval(id);
  }, []);
  if (!on) return null;
  const budget = 1000 / 165;
  return (
    <div style={{
      position: 'fixed', top: 8, right: 8, zIndex: 99999, width: 460, maxHeight: '80vh', overflow: 'auto',
      background: 'rgba(8,10,14,0.88)', color: '#d7dde6', font: '11px/1.35 ui-monospace, Consolas, monospace',
      padding: '8px 10px', borderRadius: 6, border: '1px solid #2a3340', pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <b style={{ color: '#fff' }}>GPU profiler (F9)</b>
        <span>{prof.mode}</span>
      </div>
      {!snap ? <div>měřím…</div> : (
        <>
          <div>
            fps <b style={{ color: '#fff' }}>{fmt(snap.fps, 1)}</b> · snímek {fmt(snap.frameMs)} ms (p99 {fmt(snap.frameP99)})
          </div>
          <div>
            GPU <b style={{ color: snap.gpuMs > budget ? '#f87171' : '#34d399' }}>{fmt(snap.gpuMs)} ms</b> / {fmt(budget)} ms rozpočet 165 Hz
            · CPU render {fmt(snap.cpuMs)} ms
          </div>
          <div style={{ color: '#8a96a8', marginBottom: 4 }}>
            canvas {snap.size} · focus {String(snap.focus)}{snap.disjoint ? ` · disjoint ${snap.disjoint}` : ''}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {snap.rows.filter((r) => r.gpu >= 0.005).map((r) => (
                <tr key={r.label}>
                  <td style={{ textAlign: 'right', paddingRight: 6, whiteSpace: 'nowrap' }}>{fmt(r.gpu, 3)}</td>
                  <td style={{ width: 60 }}>
                    <div style={{ height: 6, width: `${Math.min(100, (r.gpu / Math.max(snap.gpuMs, 1e-6)) * 100)}%`, background: '#60a5fa' }} />
                  </td>
                  <td style={{ textAlign: 'right', padding: '0 6px', color: '#8a96a8', whiteSpace: 'nowrap' }}>
                    {r.tris >= 1000 ? `${Math.round(r.tris / 1000)}k` : ''}
                  </td>
                  <td style={{ wordBreak: 'break-all' }}>{r.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
