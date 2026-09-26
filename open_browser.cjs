const http = require('http');
const { exec } = require('child_process');

const url = 'http://localhost:5173';
const maxAttempts = 30;
const interval = 1000;

let attempts = 0;

function check() {
  http.get(url, () => {
    exec(`start brave "${url}"`);
  }).on('error', () => {
    attempts++;
    if (attempts < maxAttempts) {
      setTimeout(check, interval);
    }
  });
}

setTimeout(check, 1000);
