
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
      el.innerText = 'ERROR: ' + msg + ' at ' + src + ':' + lineno + ':' + colno + '\n' + (error && error.stack);
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
  import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode v DEV spouští useMemo / efekty 2× a připojí, odpojí a znovu připojí každou komponentu – u
// WebGL scény to znamená 2× data particlů, GPGPU vytvořit/zrušit/vytvořit a zdvojené záseky při přepnutí
// projektu (produkce StrictMode stejně nepoužívá). Pro hledání chyb v efektech: ?strict=1.
const strict = new URLSearchParams(window.location.search).get('strict') === '1';

createRoot(document.getElementById('root')).render(
  strict ? <StrictMode><App /></StrictMode> : <App />,
)
