import * as THREE from 'three';

/**
 * TextContrastShader - Čistá matematická transformace v HSV prostoru
 * 1. Propustí barvu (100% vzorkování z tDiffuse)
 * 2. Zvýší Value (jas / kontrast)
 * 3. Změří úroveň černé a posune barvu směrem k bílému středu (nízká sytost/hue-to-white)
 */
export const TextContrastShader = {
  uniforms: {
    tDiffuse: { value: null },
    uValueBoost: { value: 1.0 },      // Zvýšení Value (kontrast jasu do maxima)
    uWhiteShift: { value: 1.0 },      // Síla posunu k bílé podle úrovně černé
    uHueShift: { value: 0.0 },        // Jemný posun Hue (0.0 = beze změny)
    uIntensity: { value: 1.0 }        // Celková síla post-processingu (0 = původní, 1 = 100%)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uValueBoost;
    uniform float uWhiteShift;
    uniform float uHueShift;
    uniform float uIntensity;
    varying vec2 vUv;

    // RGB do HSV
    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    // HSV do RGB
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      // 1. Propustí 100% původní barvy
      vec4 baseColor = texture2D(tDiffuse, vUv);
      if (baseColor.a <= 0.001) {
        gl_FragColor = baseColor;
        return;
      }

      // Převod do HSV prostoru
      vec3 hsv = rgb2hsv(baseColor.rgb);

      // Úroveň černé (1.0 = černá, 0.0 = plně jasná)
      float blackLevel = clamp(1.0 - hsv.z, 0.0, 1.0);

      // 2. Zvýšení Value (kontrast jasu): tmavá fialová -> světlá kontrastní fialová
      hsv.z = mix(hsv.z, 1.0, uValueBoost);

      // 3. Posun do bílé: čím černější barva byla, tím více se posune do bílého středu (hodně světlá fialová)
      hsv.y = mix(hsv.y, 0.0, clamp(blackLevel * uWhiteShift, 0.0, 1.0));

      // Volitelný Hue posun
      hsv.x = fract(hsv.x + uHueShift);

      // Převod zpět do RGB
      vec3 finalRgb = hsv2rgb(hsv);

      // Smíchání s původní barvou podle intensity
      vec3 result = mix(baseColor.rgb, finalRgb, uIntensity);

      gl_FragColor = vec4(result, baseColor.a);
    }
  `
};

/**
 * TextContrastPass - Samostatný objektový post-processing pass pro Three.js
 */
export class TextContrastPass {
  constructor(options = {}) {
    this.enabled = true;
    this.needsSwap = true;
    this.renderToScreen = false;

    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(TextContrastShader.uniforms),
      vertexShader: TextContrastShader.vertexShader,
      fragmentShader: TextContrastShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      transparent: true
    });

    if (options.valueBoost !== undefined) this.material.uniforms.uValueBoost.value = options.valueBoost;
    if (options.whiteShift !== undefined) this.material.uniforms.uWhiteShift.value = options.whiteShift;
    if (options.hueShift !== undefined) this.material.uniforms.uHueShift.value = options.hueShift;
    if (options.intensity !== undefined) this.material.uniforms.uIntensity.value = options.intensity;

    // Fullscreen quad geometrie a scéna pro vykreslení
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  // Přímé gettery/settery pro snadné ovládání parametrů
  get valueBoost() { return this.material.uniforms.uValueBoost.value; }
  set valueBoost(v) { this.material.uniforms.uValueBoost.value = v; }

  get whiteShift() { return this.material.uniforms.uWhiteShift.value; }
  set whiteShift(v) { this.material.uniforms.uWhiteShift.value = v; }

  get hueShift() { return this.material.uniforms.uHueShift.value; }
  set hueShift(v) { this.material.uniforms.uHueShift.value = v; }

  get intensity() { return this.material.uniforms.uIntensity.value; }
  set intensity(v) { this.material.uniforms.uIntensity.value = v; }

  /**
   * Vykreslení passu (kompatibilní s Three.js EffectComposer i samostatným voláním)
   */
  render(renderer, writeBuffer, readBuffer) {
    if (!this.enabled) return;

    const inputTexture = readBuffer ? (readBuffer.texture || readBuffer) : null;
    if (inputTexture) {
      this.material.uniforms.tDiffuse.value = inputTexture;
    }

    if (this.renderToScreen || !writeBuffer) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
    }

    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
