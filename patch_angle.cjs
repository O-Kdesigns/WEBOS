const fs = require('fs');

let app = fs.readFileSync('src/App.jsx', 'utf8');

app = app.replace(/\r\n/g, '\n');

const targetStr = `      inFov = camIn.fov || inFov;
      inAngle = Math.atan2(worldPos.x, worldPos.z);
  }`;

const newStr = `      inFov = camIn.fov || inFov;
      inAngle = Math.atan2(worldPos.x, worldPos.z);
  }

  // Zajistíme nejkratší cestu pro rotaci kamery
  let angleDiff = inAngle - orbitAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
  inAngle = orbitAngle + angleDiff;`;

if (app.includes(targetStr)) {
    app = app.replace(targetStr, newStr);
    fs.writeFileSync('src/App.jsx', app);
    console.log("App.jsx patched angle shortest path!");
} else {
    console.log("Could not find the target string.");
}
