const fs = require('fs');

let content = fs.readFileSync('src/ParticleObject.jsx', 'utf8');

const targetStr = `float mixFactor = clamp(uNoiseAmount + (n * uNoiseAmount * 0.5), 0.0, 1.0);
    if (uNoiseAmount >= 0.99) mixFactor = 1.0; 
    
    vec3 mixedColor = mix(texColor.rgb, uColor, mixFactor);
    vec3 finalColor = mixedColor + (vec3(1.0) * fresnel * 0.5);`;

const replacementStr = `float mixFactor = clamp(uNoiseAmount + (n * uNoiseAmount * 0.5), 0.0, 1.0);
    if (uNoiseAmount >= 0.99) mixFactor = 1.0; 
    
    // Obnovení původního kontrastu a modré barvy: 
    // V původním kódu se barva videa násobila uColor (texColor.rgb * uColor).
    vec3 baseVideoColor = texColor.rgb * uColor;
    vec3 mixedColor = mix(baseVideoColor, uColor, mixFactor);
    vec3 finalColor = mixedColor + (vec3(1.0) * fresnel * 0.5);`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('src/ParticleObject.jsx', content);
    console.log("Successfully restored contrast and color multiplication!");
} else {
    // try with normalized line endings just in case
    let contentNorm = content.replace(/\r\n/g, '\n');
    let targetNorm = targetStr.replace(/\r\n/g, '\n');
    if (contentNorm.includes(targetNorm)) {
        contentNorm = contentNorm.replace(targetNorm, replacementStr.replace(/\r\n/g, '\n'));
        fs.writeFileSync('src/ParticleObject.jsx', contentNorm);
        console.log("Successfully restored contrast and color multiplication! (normalized)");
    } else {
        console.error("Could not find the target string. The file might differ.");
    }
}
