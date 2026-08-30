const fs = require('fs');
let code = fs.readFileSync('src/main.jsx', 'utf8');
if(!code.includes('window.onerror')) {
  code = `
    window.onerror = function(msg, src, lineno, colno, error) {
      const el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = '0';
      el.style.zIndex = '999999';
      el.style.background = 'red';
      el.style.color = 'white';
      el.style.padding = '20px';
      el.style.whiteSpace = 'pre-wrap';
      el.innerText = 'ERROR: ' + msg + ' at ' + src + ':' + lineno + ':' + colno + '\\n' + (error && error.stack);
      document.body.appendChild(el);
    };
    window.addEventListener('unhandledrejection', function(event) {
      const el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.top = '100px';
      el.style.left = '0';
      el.style.zIndex = '999999';
      el.style.background = 'red';
      el.style.color = 'white';
      el.style.padding = '20px';
      el.style.whiteSpace = 'pre-wrap';
      el.innerText = 'PROMISE REJECTION: ' + (event.reason && event.reason.stack ? event.reason.stack : event.reason);
      document.body.appendChild(el);
    });
  ` + code;
  fs.writeFileSync('src/main.jsx', code);
}
