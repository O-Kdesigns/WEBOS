const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = 'http://localhost:5173';

const candidates = [
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
];

const braveExe = candidates.find(p => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});

let launched = false;

function launchBrowser() {
  if (launched) return;
  launched = true;

  if (braveExe) {
    exec(`"${braveExe}" "${url}"`, () => process.exit(0));
  } else {
    exec(`start "" "${url}"`, () => process.exit(0));
  }
}

function pollServer(remainingAttempts = 80) {
  if (remainingAttempts <= 0) {
    launchBrowser();
    return;
  }

  const req = http.get(url, (res) => {
    // Server odpověděl (Vite běží a servíruje kód).
    // Počkáme 500 ms, aby se dokončila případná prvotní kompilace
    setTimeout(() => {
      launchBrowser();
    }, 500);
  });

  req.on('error', () => {
    setTimeout(() => pollServer(remainingAttempts - 1), 250);
  });
}

// Spustit polling
pollServer();
