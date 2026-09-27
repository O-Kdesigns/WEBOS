@echo off
chcp 65001 >nul
title WEBOS - realny telefon pres USB
cd /d "%~dp0\.."

set PORT=5173

echo ========================================================
echo   WEBOS - TEST NA SKUTECNEM TELEFONU (USB)
echo ========================================================
echo.

where adb >nul 2>nul
if errorlevel 1 (
    echo [CHYBA] adb neni v PATH.
    echo.
    echo Jednorazovy setup ^(udelej rucne, jen jednou^):
    echo   1. Stahni "SDK Platform-Tools for Windows":
    echo      https://developer.android.com/tools/releases/platform-tools
    echo   2. Rozbal napr. do C:\platform-tools
    echo   3. Pridej C:\platform-tools do PATH ^(system promenne prostredi^)
    echo   4. Na telefonu: Nastaveni -^> O telefonu -^> 7x tap na cislo sestaveni
    echo      ^(odemkne "Moznosti pro vyvojare"^), pak zapni "Ladeni USB".
    echo.
    pause
    exit /b 1
)

echo [1/4] Kontroluji pripojene zarizeni...
adb start-server >nul 2>nul
for /f "skip=1 tokens=1,2" %%a in ('adb devices') do (
    if not "%%a"=="" (
        if "%%b"=="device" (
            set DEVICE_FOUND=1
            echo       Nalezeno: %%a
        )
        if "%%b"=="unauthorized" (
            echo       Zarizeni %%a ceka na autorizaci - odemkni telefon a
            echo       potvrd dialog "Povolit ladeni USB" na displeji.
        )
    )
)
if not defined DEVICE_FOUND (
    echo       Zadny telefon nenalezen. Pripoj ho kabelem, odemkni ho a
    echo       potvrd "Povolit ladeni USB", pak spust tenhle .bat znovu.
    pause
    exit /b 1
)
echo.

echo [2/4] Kontroluji dev server na portu %PORT%...
curl -s -o nul http://localhost:%PORT%
if errorlevel 1 (
    echo       Nebezi, spoustim npm run dev v novem okne...
    start "WEBOS Dev Server" cmd /k npm run dev
    :wait_loop
    timeout /t 1 >nul
    curl -s -o nul http://localhost:%PORT%
    if errorlevel 1 goto wait_loop
) else (
    echo       Dev server uz bezi.
)
echo.

echo [3/4] Presmerovavam port telefonu -^> tenhle PC (adb reverse)...
adb reverse tcp:%PORT% tcp:%PORT%
echo       Hotovo. Na telefonu je ted localhost:%PORT% to same, co tady.
echo.

echo [4/4] Otevirej v Chromu na telefonu: http://localhost:%PORT%
echo.
echo Pro presna cisla (fps, frame time) pouzij chrome://inspect na tomhle PC:
echo   1. Otevri Chrome (nebo Brave) tady na PC, jdi na chrome://inspect#devices
echo   2. Pod "Remote Target" najdi telefon a stranku -^> "inspect"
echo   3. DevTools -^> Performance / Rendering -^> FPS meter
echo.
echo Toto okno muzes zavrit, adb reverse zustane aktivni dokud telefon neodpojis.
pause
