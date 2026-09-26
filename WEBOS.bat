@echo off
chcp 65001 >nul
title WEBOS Dev Server
cd /d "%~dp0"

echo ========================================================
echo                 WEBOS - 3D PORTFOLIO
echo ========================================================
echo.

:: 1. Spusteni Claude Code (pokud jeste nebezi)
echo [1/3] Kontroluji Claude Code...
tasklist /fi "imagename eq claude.exe" 2>nul | findstr /i "claude.exe" >nul
if errorlevel 1 (
    echo       Claude Code nebezi, spoustim...
    if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\claude-desktop.exe" (
        start "" "%LOCALAPPDATA%\Microsoft\WindowsApps\claude-desktop.exe" "%~dp0"
    ) else (
        echo       (claude-desktop.exe nebyl nalezen)
    )
) else (
    echo       Claude Code jiz bezi.
)
echo.

:: 2. Spusteni hlidace pro otevreni Brave az po nabehnuti serveru
echo [2/3] Pripravuji otevreni Brave po startu serveru...
start "" /b node open_browser.cjs
echo.

:: 3. Spusteni Vite vyvojoveho serveru
echo [3/3] Spoustim npm run dev...
echo.
echo Pro zastaveni: Ctrl+C nebo zavri toto okno.
echo ========================================================
echo.
call npm run dev

pause
