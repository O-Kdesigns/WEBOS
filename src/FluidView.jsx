import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { getFluid } from './components/particles/ParticleFluid';
import { prof } from './debug/GpuProfiler';

// Slider "2D voda" vedle AI živého renderu: průhlednost náhledu neviditelné simulace vody,
// ze které particly berou proud myši (ParticleFluid.js). 0 = komponenta se vůbec nepřipojí -> nulová cena.
// Ukládá se do localStorage (jen tento prohlížeč), v DEV i `window.__fluidView(0..1)`.

const KEY = 'webos.fluidView';
const listeners = new Set();
let value = 0;
try { value = Math.min(1, Math.max(0, parseFloat(localStorage.getItem(KEY)) || 0)); } catch { /* bez storage */ }

export function setFluidView(v) {
  value = Math.min(1, Math.max(0, +v || 0));
  try { localStorage.setItem(KEY, String(value)); } catch { /* platí jen do reloadu */ }
  listeners.forEach((fn) => fn(value));
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__fluidView = (v) => { if (v !== undefined) setFluidView(v); return value; };
}

export function useFluidView() {
  const [v, setV] = useState(value);
  useEffect(() => { listeners.add(setV); setV(value); return () => { listeners.delete(setV); }; }, []);
  return [v, setFluidView];
}

// Kreslí se po postprocessingu (VolumetricLightPass má prioritu 1) přímo na obrazovku.
function FluidViewPass({ opacity }) {
  const gl = useThree((s) => s.gl);
  useFrame(() => { prof.scope('náhled 2D vody'); getFluid(gl).drawView(opacity); prof.end(); }, 2);
  return null;
}

export function FluidView() {
  const [opacity] = useFluidView();
  return opacity > 0 ? <FluidViewPass opacity={opacity} /> : null;
}
