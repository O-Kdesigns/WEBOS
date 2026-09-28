import { addAfterEffect } from '@react-three/fiber';

// three.js smaže WebGL program, jakmile ho přestane používat poslední materiál. Při přepnutí projektu se
// odpojí všechny particle systémy starého projektu (a jejich materiály) dřív, než se nové poprvé vykreslí,
// takže se stejné shadery kompilovaly znovu – na Windows (ANGLE → D3D) klidně 100 ms zásek, i při každém
// návratu k už navštívenému projektu. Tady si každý program, který kdy vznikl, jednou "přivlastníme"
// (usedTimes + 1) -> nikdy neklesne na 0, zůstane v cache three.js a příště se jen znovu použije.
// Cena: pár desítek malých programů v paměti GPU po celou dobu stránky. Viz LIGHTING.md (výkon).
export function keepShaderPrograms(renderer) {
  const kept = new WeakSet();
  return addAfterEffect(() => {
    const list = renderer.info.programs;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!kept.has(p)) { kept.add(p); p.usedTimes++; }
    }
  });
}
