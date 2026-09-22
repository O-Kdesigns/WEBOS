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
    tMask: { value: null },           // 2D textová maska pro vykrojení efektu přesně na písmena
    uMaskBounds: { value: new THREE.Vector4(0, 0, 1, 1) }, // UV hranice textu [minU, minV, maxU, maxV]
    uEnableMask: { value: 1.0 },      // 1.0 = oříznout na text, 0.0 = celá plocha / roh
    uValueBoost: { value: 1.0 },      // Cílové Value (jas do maxima, 1.0 = 100% jas)
    uSaturationBoost: { value: 1.4 }, // Zvýšení sytosti podkladové barvy
    uBlackThreshold: { value: 0.18 }, // Práh černé (pod ním přechází do bílé)
    uWhiteShift: { value: 1.0 },      // Síla posunu k bílé na černé (1.0 = čistě bílá na černé)
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
    uniform sampler2D tMask;
    uniform vec4 uMaskBounds;
    uniform float uEnableMask;
    uniform float uValueBoost;
    uniform float uSaturationBoost;
    uniform float uBlackThreshold;
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
      float mask = 1.0;

      // Oříznutí pouze na písmena a tvar HUD prvků
      if (uEnableMask > 0.5) {
        if (vUv.x < uMaskBounds.x || vUv.x > uMaskBounds.z ||
            vUv.y < uMaskBounds.y || vUv.y > uMaskBounds.w) {
          discard;
        }

        vec2 maskUv = vec2(
          (vUv.x - uMaskBounds.x) / max(0.0001, uMaskBounds.z - uMaskBounds.x),
          (vUv.y - uMaskBounds.y) / max(0.0001, uMaskBounds.w - uMaskBounds.y)
        );

        mask = texture2D(tMask, maskUv).a;
        if (mask <= 0.02) {
          discard;
        }
      }

      // Vzorkování podkladového pixelu
      vec4 baseColor = texture2D(tDiffuse, vUv);

      // Převod podkladu do HSV prostoru (jako v Blender Color Pickeru)
      vec3 hsv = rgb2hsv(baseColor.rgb);

      // 1. ZVÝŠENÍ VALUE (JAS A KONTRAST):
      // Vytáhne jas do plného/vysokého maxima (jak žádal uživatel: "proste vytahne value")
      float targetV = clamp(uValueBoost, 0.0, 1.5);

      // 2. ZVÝŠENÍ SATURATION (SYTOST):
      // Vytáhne sytost barvy podkladu, aby nezbledla do šedé
      // Pokud podklad má alespoň náznak barvy (hsv.y > 0.05), sytost se vytáhne
      float boostedS = clamp(max(hsv.y * uSaturationBoost, 0.85 * step(0.05, hsv.y)), 0.0, 1.0);

      // 3. PŘECHOD ČERNÁ -> ČISTĚ BÍLÁ:
      // "čím víc černá, tím úměrně toho to změnit na čistou bílou, což je ubírání saturace"
      // blackFactor: 1.0 pro absolutní černou (hsv.z = 0), 0.0 pro barevný/světlý podklad (hsv.z >= uBlackThreshold)
      float blackFactor = clamp((uBlackThreshold - hsv.z) / max(0.001, uBlackThreshold), 0.0, 1.0);

      // Pokud je podklad bez sytosti (čistě monochromatická šedá), také zůstává bílá
      float desatFactor = clamp((0.08 - hsv.y) / 0.08, 0.0, 1.0);
      float toWhite = clamp(max(blackFactor * uWhiteShift, desatFactor), 0.0, 1.0);

      // Výsledná sytost: na černé jde do 0.0 (čistá bílá), na barvě zůstává boostedS (zářivá svítivá barva)
      float finalS = mix(boostedS, 0.0, toWhite);

      // 4. HUE: Plně zachován podle podkladu
      float finalH = fract(hsv.x + uHueShift);

      // 5. Převod zpět do RGB
      vec3 finalRgb = hsv2rgb(vec3(finalH, finalS, targetV));

      // 6. Smíchání s původní barvou podle uIntensity
      vec3 result = mix(baseColor.rgb, finalRgb, uIntensity);

      gl_FragColor = vec4(result, mask);
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
      transparent: true,
      blending: THREE.NormalBlending
    });

    if (options.valueBoost !== undefined) this.material.uniforms.uValueBoost.value = options.valueBoost;
    if (options.saturationBoost !== undefined) this.material.uniforms.uSaturationBoost.value = options.saturationBoost;
    if (options.blackThreshold !== undefined) this.material.uniforms.uBlackThreshold.value = options.blackThreshold;
    if (options.whiteShift !== undefined) this.material.uniforms.uWhiteShift.value = options.whiteShift;
    if (options.hueShift !== undefined) this.material.uniforms.uHueShift.value = options.hueShift;
    if (options.intensity !== undefined) this.material.uniforms.uIntensity.value = options.intensity;
    if (options.enableMask !== undefined) this.material.uniforms.uEnableMask.value = options.enableMask;

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

  get saturationBoost() { return this.material.uniforms.uSaturationBoost.value; }
  set saturationBoost(v) { this.material.uniforms.uSaturationBoost.value = v; }

  get blackThreshold() { return this.material.uniforms.uBlackThreshold.value; }
  set blackThreshold(v) { this.material.uniforms.uBlackThreshold.value = v; }

  get whiteShift() { return this.material.uniforms.uWhiteShift.value; }
  set whiteShift(v) { this.material.uniforms.uWhiteShift.value = v; }

  get hueShift() { return this.material.uniforms.uHueShift.value; }
  set hueShift(v) { this.material.uniforms.uHueShift.value = v; }

  get intensity() { return this.material.uniforms.uIntensity.value; }
  set intensity(v) { this.material.uniforms.uIntensity.value = v; }

  get mask() { return this.material.uniforms.tMask.value; }
  set mask(v) { this.material.uniforms.tMask.value = v; }

  get maskBounds() { return this.material.uniforms.uMaskBounds.value; }
  set maskBounds(v) { this.material.uniforms.uMaskBounds.value = v; }

  get enableMask() { return this.material.uniforms.uEnableMask.value; }
  set enableMask(v) { this.material.uniforms.uEnableMask.value = v; }

  /**
   * Vykreslení passu
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

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    renderer.render(this.scene, this.camera);

    renderer.autoClear = prevAutoClear;
  }

  dispose() {
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
