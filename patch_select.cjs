const fs = require('fs');

let app = fs.readFileSync('src/App.jsx', 'utf8');

// Normalize line endings for replacement
app = app.replace(/\r\n/g, '\n');

// The code to replace:
const oldSelect = `                  onSelect={(idx) => {
                    const targetIndex = idx;
                    setAbsoluteIndex(targetIndex);
                    api.start({ 
                      rotationY: targetIndex * -pageDistance, 
                      immediate: false 
                    });
                    setViewMode('INSIDE');
                  }}`;

const newSelect = `                  onSelect={(idx) => {
                    setAbsoluteIndex(prev => {
                      const currentVisual = ((prev % totalPages) + totalPages) % totalPages;
                      let diff = idx - currentVisual;
                      if (diff > totalPages / 2) diff -= totalPages;
                      if (diff < -totalPages / 2) diff += totalPages;
                      const targetIndex = prev + diff;
                      api.start({ 
                        rotationY: targetIndex * -pageDistance, 
                        immediate: false 
                      });
                      return targetIndex;
                    });
                    setViewMode('INSIDE');
                  }}`;

if (app.includes(oldSelect)) {
    app = app.replace(oldSelect, newSelect);
    fs.writeFileSync('src/App.jsx', app);
    console.log("App.jsx patched successfully!");
} else {
    console.log("Could not find the target string. The file might have been modified differently.");
}
