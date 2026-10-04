import * as THREE from 'three';

// Předkompilace shaderů na pozadí (compileAsync = KHR_parallel_shader_compile), aby se skryté věci (solidy, tisk,
// pára, video v INSIDE) neskládaly až v prvním snímku, kdy se ukážou = zásek (Windows/ANGLE stovky ms).
// compile() bere i skryté objekty, světla bere ze `scene`. Kompiluje se s nastaveným render targetem:
// vše se kreslí do RT (postprocessing, masky) = lineární barvy bez tone mappingu; bez RT by vznikla varianta
// pro canvas (sRGB + ACES) a při prvním renderu by se program skládal znovu.
let rt = null;

export function prewarm(gl, object, camera, scene = null) {
  if (!rt) rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(rt);
  gl.compileAsync(object, camera, scene);
  gl.setRenderTarget(prev);
}
