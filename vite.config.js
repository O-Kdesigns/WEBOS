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
        
        next();
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    portfolioCMSPlugin()
  ],
  server: {
    watch: {
      ignored: ['**/*.mp4', '**/*.webm', '**/*.mov', '**/*.mkv']
    }
  }
})
