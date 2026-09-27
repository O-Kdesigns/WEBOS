@echo off
chcp 65001 >nul
title WEBOS - mobil viewport (GPU zapnuta)
cd /d "%~dp0"

set PORT=5173
set URL=http://localhost:%PORT%/
set CPU_THROTTLE=4

echo ========================================================
echo   WEBOS - MOBIL VIEWPORT, GPU ZAPNUTA
echo ========================================================
echo.
echo Moto G Power viewport (412x823 @DPR1.75) + CPU throttle %CPU_THROTTLE%x,
echo hardwarova GPU akcelerace zustava ZAPNUTA.
echo.
echo POZOR: fps zustane blizko desktopu - tahle scena je GPU-bound, CPU
echo throttle sam o sobe skoro nic nezmeni. Hodi se jen na kontrolu
echo layoutu/UI na mobilnim viewportu, NE na odhad realneho vykonu.
echo Pro realny vykon pouzij WEBOS-mobile-worstcase.bat (SwiftShader,
echo scale-uje se scenou, ale je mnohem pomalejsi nez realny telefon) nebo
echo perf-sim\real-device.bat (skutecny telefon pres USB - presne cislo).
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

echo [2/2] Spoustim simulaci (toto okno NECHTEJ zavrene, dokud testujes)...
echo.
node perf-sim\emulate-browser.cjs --mode=hw "%URL%" %CPU_THROTTLE%
