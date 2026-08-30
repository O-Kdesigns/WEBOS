const fs = require('fs');

let content = fs.readFileSync('src/ParticleObject.jsx', 'utf8');

// Najdeme celý shader od `uniform sampler2D tVideo;` až po koncovou složenou závorku `}` před `);`
const regex = /uniform sampler2D tVideo;[\s\S]*?gl_FragColor = vec4\(finalColor, uOpacity\);\s*\}/;

const newShader = `uniform sampler2D tVideo;
  uniform float uDistortion;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform float uNoiseAmount;
  uniform float uTime;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vScreenPos;
  varying vec3 vViewPosition;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
    vec2 distortedUv = screenUv + (vNormal.xy * uDistortion);
    
    // Noise pro jelly efekt
    float n = snoise(vNormal.xy * 3.0 + uTime * 1.5);
    distortedUv += n * (uNoiseAmount * 0.5);
    distortedUv = clamp(distortedUv, 0.0, 1.0);
    
    vec4 texColor = texture2D(tVideo, distortedUv);
    
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = dot(normal, viewDir);
    fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
    fresnel = pow(fresnel, 3.0);
    
    // Obnovení původního kontrastu a modré barvy (násobení uColor)
    vec3 baseVideoColor = texColor.rgb * uColor;
    
    float mixFactor = clamp(uNoiseAmount + (n * uNoiseAmount * 0.5), 0.0, 1.0);
    if (uNoiseAmount >= 0.99) mixFactor = 1.0; 
    
    // Přechod ze zabarveného videa do solidní želé barvy
    vec3 mixedColor = mix(baseVideoColor, uColor, mixFactor);
    vec3 finalColor = mixedColor + (vec3(1.0) * fresnel * 0.5);
    
    gl_FragColor = vec4(finalColor, uOpacity);
  }`;

if (regex.test(content)) {
    content = content.replace(regex, newShader);
    fs.writeFileSync('src/ParticleObject.jsx', content);
    console.log("Successfully patched shader to restore contrast and jelly effect.");
} else {
    console.log("Could not find the target shader string via regex.");
}
