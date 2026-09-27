@echo off
chcp 65001 >nul
title WEBOS - test video fallbacku
cd /d "%~dp0"

set PORT=5173
set URL=http://localhost:%PORT%/?novideo=1

echo ========================================================
echo         WEBOS - FALLBACK VIDEO TEST (?novideo=1)
echo ========================================================
echo.
echo Vsechna videa pojedou primo na placeholder (public/placeholder.mp4),
echo stejne jako kdyz se produkcni video nenajde (napr. GitHub Pages).
echo.

echo [1/2] Kontroluji dev server na portu %PORT%...
curl -s -o nul http://localhost:%PORT%
if errorlevel 1 (
    echo       Nebezi, spoustim npm run dev v novem okne...
    start "WEBOS Dev Server" cmd /k npm run dev
    echo       Cekam, az server naskoci...
    :wait_loop
    timeout /t 1 >nul
    curl -s -o nul http://localhost:%PORT%
    if errorlevel 1 goto wait_loop
) else (
    echo       Dev server uz bezi.
)
echo.

echo [2/2] Otevirim Brave na %URL% ...
start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --new-window "%URL%"

echo.
echo Hotovo. Tohle okno muzes zavrit, dev server bezi samostatne.
pause
