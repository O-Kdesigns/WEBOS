import { useFrame } from '@react-three/fiber';

// Průlet portálem (vstup do projektu přes GlassDesk).
// Jedna hodnota portalFx.progress (0 = ORBIT, 1 = kamera v Camera_In) řídí:
//  - jízdu kamery (CameraRig: poloměr orbitZ -> inZ, FOV + "kopnutí" při průletu),
//  - vyjetí aktivní desky ven ke kameře (BlenderScene) – deska skončí ZA kamerou,
//  - start 3D tisku (SolidPrint čeká na progress = 1).
// Sklo se u kamery rozpouští po pixelech podle vzdálenosti (TvGlass uNear) -> žádné bliknutí při průchodu.
// Odchod: nejdřív se odtiskne (App čeká na printFx.progress = 0), až pak jede kamera zpět.
// Config `portal` (vše volitelné): duration, deskPush, fovKick, nearStart, nearEnd.
// DEV: window.__portalHold = 0..1 zmrazí průlet (ladění), window.__portalFx = stav.

export const portalFx = {
  progress: 0,   // lineární čas přechodu 0..1
  camera: 0,     // eased poloha kamery 0..1
  desk: 0,       // eased vyjetí desky 0..1
  kick: 0,       // 0..1..0 špička rychlosti (FOV kopnutí)
  target: 0,
  activeIndex: 0,
  nearStart: 0.3,
  nearEnd: 1.8
};
if (import.meta.env.DEV && typeof window !== 'undefined') window.__portalFx = portalFx;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export function PortalDriver({ viewMode, activeIndex, appConfig }) {
  const cfg = appConfig?.portal || {};

  useFrame((_, delta) => {
    const dt = Math.min(Math.max(delta, 0), 0.1);
    const duration = Math.max(0.1, cfg.duration ?? 2.0);
    portalFx.target = viewMode === 'INSIDE' ? 1 : 0;
    // aktivní deska se mění jen v ORBITu (během průletu drží tu, kterou kamera projíždí)
    if (portalFx.progress <= 0) portalFx.activeIndex = activeIndex;

    const step = dt / duration;
    portalFx.progress = portalFx.target > 0
      ? Math.min(1, portalFx.progress + step)
      : Math.max(0, portalFx.progress - step);
    if (import.meta.env.DEV && typeof window.__portalHold === 'number') portalFx.progress = window.__portalHold;

    const t = portalFx.progress;
    portalFx.camera = easeInOutCubic(t);
    portalFx.desk = easeInOutSine(t);
    portalFx.kick = Math.sin(Math.PI * t) ** 2;
    portalFx.nearStart = cfg.nearStart ?? 0.3;
    portalFx.nearEnd = cfg.nearEnd ?? 1.8;
  });

  return null;
}
