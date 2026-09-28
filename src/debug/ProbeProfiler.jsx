import { Profiler } from 'react';
import { mark } from './FrameProbe';

// DEV: kolik ms React renderoval podstrom (render fáze, bez efektů) -> značka v záznamu záseků (FrameProbe.js).
// V produkci jen propustí děti.
const onRender = (id, phase, actualDuration) => {
  if (actualDuration >= 1) mark(`React render ${id} (${phase}) ${actualDuration.toFixed(1)} ms`);
};

export function ProbeProfiler({ id, children }) {
  if (!import.meta.env.DEV) return children;
  return <Profiler id={id} onRender={onRender}>{children}</Profiler>;
}
