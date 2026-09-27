@echo off
chcp 65001 >nul
title WEBOS - mobil worst-case (SwiftShader)
cd /d "%~dp0"

set PORT=5173
set URL=http://localhost:%PORT%/
set CPU_THROTTLE=4

echo ========================================================
echo   WEBOS - WORST-CASE MOBIL SIMULACE (GPU vypnuta)
echo ========================================================
echo.
echo Moto G Power viewport (412x823 @DPR1.75) + CPU throttle %CPU_THROTTLE%x +
echo GPU VYPNUTA (WebGL bezi softwarove pres SwiftShader).
echo.
echo POZOR: zmereno ~1.6 fps na tehle scene - mnohem hur nez realny telefon
echo (ten dava ~47 fps). Zpomaleni JE skutecne a scale-uje se scenou (vic
echo particlu/passu = pomalejsi), ale absolutni cislo nesedi na zadne
echo konkretni zarizeni. Hodi se na relativni A/B srovnani (vypnu efekt X ->
echo o kolik % rychlejsi), ne na odhad realneho fps. Pro to viz
echo perf-sim\real-device.bat.
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
node perf-sim\emulate-browser.cjs --mode=swiftshader "%URL%" %CPU_THROTTLE%
