import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Náš vlastní plugin, který funguje jako Backend pro náš CMS Editor
function portfolioCMSPlugin() {
  return {
    name: 'portfolio-cms-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // API pro získání seznamu všech souborů ve složce public/obsah
        if (req.url === '/api/assets' && req.method === 'GET') {
          const obsahDir = path.resolve(process.cwd(), 'public/obsah');
          
          if (!fs.existsSync(obsahDir)) {
            fs.mkdirSync(obsahDir, { recursive: true });
          }
          
          // Rekurzivní skenování složek
          const walkSync = (dir, filelist = [], baseDir = dir) => {
            if (fs.existsSync(dir)) {
              fs.readdirSync(dir).forEach(file => {
                const filepath = path.join(dir, file);
                if (fs.statSync(filepath).isDirectory()) {
                  filelist = walkSync(filepath, filelist, baseDir);
                } else {
                  filelist.push(path.relative(baseDir, filepath).replace(/\\/g, '/'));
                }
              });
            }
            return filelist;
          };
          
          const files = walkSync(obsahDir);
          
          const models = files.filter(f => f.toLowerCase().endsWith('.glb') || f.toLowerCase().endsWith('.gltf'));
          const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp|gif)$/i));
          const videos = files.filter(f => f.match(/\.(mp4|webm|mov)$/i));
          
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ models, images, videos }));
          return;
        }
        
        // API pro fyzický zápis nastavení na disk (uložení z Editoru)
        if (req.url === '/api/settings' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString() });
          req.on('end', () => {
            try {
              // Validace JSONu před uložením
              const parsed = JSON.parse(body);
              
              if (parsed.pages) {
                const settingsPath = path.resolve(process.cwd(), 'src/settings.json');
                fs.writeFileSync(settingsPath, JSON.stringify({ pages: parsed.pages }, null, 2));
              }
              
              if (parsed.config) {
                const configPath = path.resolve(process.cwd(), 'src/config.json');
                fs.writeFileSync(configPath, JSON.stringify(parsed.config, null, 2));
              }
              
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        // API pro automatický zápis výkonnostních logů na disk pro agenta
        if (req.url === '/api/debug-log' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const logsDir = path.resolve(process.cwd(), 'debug_logs');
              if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
              }

              const sessionFileName = `${data.sessionId || 'session_default'}.log`;
              const sessionFilePath = path.join(logsDir, sessionFileName);
              const latestFilePath = path.join(logsDir, 'latest.log');

              const formattedContent = formatDiagnosticLog(data);

              fs.writeFileSync(sessionFilePath, formattedContent, 'utf-8');
              fs.writeFileSync(latestFilePath, formattedContent, 'utf-8');

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, file: sessionFileName }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }
        
        next();
      });
    }
  };
}

function formatDiagnosticLog(data) {
  const m = data.metrics || {};
  const vids = (m.videos || []).map(v => 
    `- ${v.fileName}: ${v.isPlaying ? 'HRAJE' : 'PAUZA'} (${v.currentTime}s / ${v.duration}s) | Drop: ${v.dropped}f | Total: ${v.total}f | State: readyState=${v.readyState}`
  ).join('\n') || '- Žádná videa v paměti';

  const bottlenecks = (data.bottlenecks || []).map(b => `⚠️  ${b}`).join('\n') || '✓ Žádná kritická úzká hrdla nezjištěna (Systém běží plynule)';

  const incidents = (data.incidents || []).map(inc => 
    `[${inc.time || '?'}] [${inc.severity || 'INFO'}] ${inc.msg || inc.type}`
  ).join('\n') || '  (Zatím žádné záseky ani incidenty)';

  return `================================================================================
WEBOS AUTOMATED PERFORMANCE DIAGNOSTIC LOG
Relace (Session): ${data.sessionId || 'unknown'}
Čas zápisu: ${new Date().toLocaleString('cs-CZ')}
Klient: ${data.userAgent || 'Neznámý prohlížeč'} | Obrazovka: ${data.screen || '?'}
================================================================================

[AKTUÁLNÍ METRIKY A VÝKON]
Režim kamery: ${m.viewMode || 'ORBIT'}
Aktivní projekt: ${m.activeProject || 'Neznámý'}
FPS: ${m.fps ?? '?'} (Min / 1% Low: ${m.fpsMin ?? '?'})
Čas snímku: ${m.frameTime ?? '?'} ms (Peak: ${m.frameTimeMax ?? '?'} ms)
Draw Calls: ${m.drawCalls ?? '?'}
Trojúhelníky: ${m.triangles !== undefined ? (m.triangles / 1000).toFixed(1) + 'k' : '?'}
Alokované GPU Textury: ${m.textures ?? '?'}

[STAV VIDEO DEKODÉRŮ]
${vids}

[ANALÝZA ÚZKÝCH HRDEL (BOTTLENECKS)]
${bottlenecks}

[CHRONOLOGICKÝ DENÍK INCIDENTŮ A ZÁSEKŮ]
${incidents}
================================================================================
`;
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages běží na podcestě /WEBOS/, lokál a Netlify na /
  base: process.env.GITHUB_PAGES ? '/WEBOS/' : '/',
  plugins: [
    react(),
    portfolioCMSPlugin()
  ],
  server: {
    watch: {
      ignored: ['**/*.mp4', '**/*.webm', '**/*.mov', '**/*.mkv', '**/debug_logs/**']
    }
  }
});
