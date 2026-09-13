@echo off
chcp 65001 >nul
title WEBOS Dev Server
cd /d "%~dp0"

echo ========================================================
echo                 WEBOS - 3D PORTFOLIO
echo ========================================================
echo.

:: 1. Kontrola a spusteni Antigravity (pokud jeste nebezi)
echo [1/3] Kontroluji Antigravity...
tasklist /fi "imagename eq Antigravity.exe" 2>nul | findstr /i "Antigravity.exe" >nul
if errorlevel 1 (
    echo       Antigravity nebezi, spoustim...
    if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" (
        start "" "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" "%~dp0"
    ) else (
        echo       (Antigravity.exe nebyl nalezen ve standardni ceste)
    )
) else (
    echo       Antigravity jiz bezi.
)
echo.

:: 2. Spusteni hlidace pro otevreni Brave az po plnem nabehnuti serveru
echo [2/3] Pripravuji hlidac pro automaticke otevreni Brave prohlizece...
start "" /b node open_browser.cjs
echo.

:: 3. Spusteni Vite vyvojoveho serveru
echo [3/3] Spoustim npm run dev v teto slozce...
echo.
echo Pro zastaveni serveru stisknete Ctrl + C nebo zavrete toto okno.
echo ========================================================
echo.
call npm run dev

pause
