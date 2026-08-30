const fs = require('fs');

let content = fs.readFileSync('src/ParticleObject.jsx', 'utf8');

// The line to change is:
// vec3 mixedColor = mix(texColor.rgb, uColor, mixFactor);
// We want to change it to:
// vec3 baseVideoColor = texColor.rgb * uColor;
// vec3 mixedColor = mix(baseVideoColor, uColor, mixFactor);

const regex = /vec3 mixedColor = mix\(texColor\.rgb, uColor, mixFactor\);/;
if (regex.test(content)) {
    content = content.replace(regex, `vec3 baseVideoColor = texColor.rgb * uColor;\n    vec3 mixedColor = mix(baseVideoColor, uColor, mixFactor);`);
    fs.writeFileSync('src/ParticleObject.jsx', content);
    console.log("Reverted contrast and blue color changes successfully via regex.");
} else {
    console.log("Could not find the target line to replace.");
}
