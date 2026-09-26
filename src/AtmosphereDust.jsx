import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Atmosférický prach (Active Theory look): tisíce drobných teček kolem DNA s vlastním bokehem.
// Tečky mimo ohniskovou vzdálenost rostou a blednou (měkký disk), ostré jsou malé a jasné.
// Jeden draw call, pozice se animují jen ve vertex shaderu (žádná práce na CPU, žádné alokace v useFrame).

const rand = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function AtmosphereDust({ appConfig, springScrollY, rotationY, pageDistance }) {
  const cfg = appConfig?.atmosphereDust || {};
  const enabled = cfg.enabled ?? true;
  const count = Math.max(0, Math.floor(cfg.count ?? 4000));
  const colorsKey = (cfg.colors || ['#9fd66b', '#d8c86a', '#5fc9c9', '#7fb0ff']).join(',');

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const palette = colorsKey.split(',').map(c => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      // válcové rozložení zhuštěné kolem osy DNA (jako mrak kolem loga u Active Theory)
      const ang = rand(i, 1) * Math.PI * 2;
      const r = 0.12 + Math.pow(rand(i, 3), 1.8) * 0.88;
      pos[i * 3] = Math.cos(ang) * r;
      pos[i * 3 + 1] = (rand(i, 2) - 0.5) * 2;
      pos[i * 3 + 2] = Math.sin(ang) * r;
      const c = palette[Math.floor(rand(i, 4) * palette.length) % palette.length];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      seed[i] = rand(i, 5);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count, colorsKey]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uCamY: { value: 0 },
      uRot: { value: 0 },
      uBox: { value: new THREE.Vector3(10, 8, 10) },
      uSize: { value: 0.035 },
      uFocus: { value: 4.0 },
      uFocusRange: { value: 3.0 },
      uBokeh: { value: 6.0 },
      uOpacity: { value: 0.8 },
      uPixelRatio: { value: 1 },
      uViewportH: { value: 1000 }
    },
    vertexShader: `
      uniform float uTime, uScroll, uCamY, uRot, uSize, uFocus, uFocusRange, uBokeh, uPixelRatio, uViewportH;
      uniform vec3 uBox;
      attribute vec3 aColor;
      attribute float aSeed;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vSoft;
      void main() {
        vec3 p = position * uBox;
        // pomalý drift + paralaxa se scrollem (prach je "hlubší" než DNA)
        p.y += uTime * (0.05 + aSeed * 0.1) + uScroll;
        // wrap kolem kamery (kamera za posledním projektem sjíždí ve world Y dolů -> prach musí jet s ní)
        p.y = mod(p.y - uCamY + uBox.y, uBox.y * 2.0) - uBox.y;
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.15;
        p.z += cos(uTime * 0.25 + aSeed * 23.0) * 0.15;
        float s = sin(uRot), c = cos(uRot);
        p.xz = mat2(c, -s, s, c) * p.xz;

        vec4 mv = modelViewMatrix * vec4(p + vec3(0.0, uCamY, 0.0), 1.0);
        float dist = -mv.z;
        float coc = smoothstep(0.0, uFocusRange, abs(dist - uFocus));
        float grow = 1.0 + coc * uBokeh;
        float worldSize = uSize * (0.4 + aSeed * aSeed * 1.6) * grow;
        gl_PointSize = max(1.0, worldSize * uViewportH * uPixelRatio / max(0.1, dist));
        gl_Position = projectionMatrix * mv;

        vColor = aColor;
        // energie bokeh disku se rozprostře do větší plochy -> slábne s kvadrátem růstu
        vAlpha = (0.35 + aSeed * 0.65) / (grow * grow * 0.6 + 0.4);
        vAlpha *= smoothstep(0.3, 1.2, dist);            // nic těsně před objektivem
        vAlpha *= 1.0 - smoothstep(uBox.y * 0.75, uBox.y, abs(p.y)); // měkký okraj boxu (wrap)
        vSoft = coc;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vSoft;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        // ostrá tečka = tvrdší hrana, bokeh = plochý disk s lehkým okrajem
        float edge = mix(0.35, 0.9, vSoft);
        float a = 1.0 - smoothstep(edge, 1.0, d);
        a *= mix(1.0, 0.8 + 0.2 * smoothstep(0.5, 0.95, d), vSoft);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }), []);

  useEffect(() => () => material.dispose(), [material]);

  const pointsRef = useRef();
  const camPos = useRef(new THREE.Vector3());

  useFrame((state) => {
    if (!enabled) return;
    const u = material.uniforms;
    u.uTime.value = state.clock.getElapsedTime();
    const scroll = springScrollY?.get ? springScrollY.get() : 0;
    u.uScroll.value = scroll * (cfg.scrollParallax ?? 0.6);
    const rot = rotationY?.get ? rotationY.get() : 0;
    u.uRot.value = rot * (cfg.rotateParallax ?? 0.15);
    u.uSize.value = cfg.size ?? 0.03;
    u.uBokeh.value = cfg.bokeh ?? 4.0;
    u.uOpacity.value = cfg.opacity ?? 0.8;
    u.uFocusRange.value = appConfig?.cinematic?.focusRange ?? 3.5;
    state.camera.getWorldPosition(camPos.current);
    u.uCamY.value = camPos.current.y;
    u.uFocus.value = Math.hypot(camPos.current.x, camPos.current.z) + (appConfig?.cinematic?.focusOffset ?? 0);
    u.uPixelRatio.value = state.gl.getPixelRatio();
    u.uViewportH.value = state.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(state.camera.fov ?? 60) / 2));
  });

  if (!enabled || count === 0) return null;
  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}
