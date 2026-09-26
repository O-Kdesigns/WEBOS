import { useEffect, useState } from 'react';
import { advance } from '@react-three/fiber';

// "AI živý render" – režim pro práci s Claude v browser pane.
// Normálně prohlížeč v neaktivním tabu / zakrytém okně zastaví requestAnimationFrame (≈1 fps nebo 0),
// takže Claude při měření vidí zamrzlou scénu. V tomhle režimu:
//  - nikdy se nezapne úsporný režim (pauseOnBlur se ignoruje),
//  - časovač ve Web Workeru (ten prohlížeč neškrtí) každých ~16 ms zkontroluje, jestli proběhl rAF;
//    když ne, snímek dorenderuje sám přes R3F advance() (včetně react-spring animací).
// Zapnutí: checkbox v UI, URL `?ai=1` (vypnutí `?ai=0`), v DEV `window.__aiLive(true/false)`.
// Ukládá se do localStorage = platí jen pro daný prohlížeč (Claude pane ≠ Oliverův Brave).

const KEY = 'webos.aiLive';
const listeners = new Set();

function readInitial() {
  try {
    const q = new URLSearchParams(window.location.search).get('ai');
    if (q === '1' || q === '0') {
      localStorage.setItem(KEY, q);
      return q === '1';
    }
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = typeof window !== 'undefined' ? readInitial() : false;

export function setAiLive(value) {
  enabled = !!value;
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* storage zakázaný – platí jen do reloadu */ }
  listeners.forEach((fn) => fn(enabled));
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__aiLive = (v) => { if (v !== undefined) setAiLive(v); return enabled; };
}

export function useAiLive() {
  const [value, setValue] = useState(enabled);
  useEffect(() => {
    listeners.add(setValue);
    setValue(enabled);
    return () => { listeners.delete(setValue); };
  }, []);
  return [value, setAiLive];
}

const WORKER_SRC = `
  let id = null;
  onmessage = (e) => {
    if (id) clearInterval(id);
    id = e.data > 0 ? setInterval(() => postMessage(0), e.data) : null;
  };
`;

// Záložní smyčka: běží jen když je režim zapnutý; renderuje pouze pokud rAF vynechal.
export function useAiLiveTicker(active) {
  useEffect(() => {
    if (!active) return;
    let lastRaf = performance.now();
    let rafId = 0;
    const onRaf = (t) => { lastRaf = performance.now(); rafId = requestAnimationFrame(onRaf); };
    rafId = requestAnimationFrame(onRaf);

    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = () => {
      const now = performance.now();
      if (now - lastRaf > 40) advance(now, true);
    };
    worker.postMessage(16);

    return () => {
      cancelAnimationFrame(rafId);
      worker.postMessage(0);
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  }, [active]);
}
