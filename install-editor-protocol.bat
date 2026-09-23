@echo off
setlocal
title install scratchedit:// protocol

REM =============================================================
REM  Registers the custom URL protocol  scratchedit://
REM  so a link/button in the browser can start the local editor.
REM
REM    scratchedit://start   ->   start-editor.bat
REM
REM  Writes to HKEY_CURRENT_USER only (no admin rights needed).
REM  To uninstall:  install-editor-protocol.bat remove
REM
REM  Keep this file pure ASCII (cmd.exe reads .bat as GBK).
REM =============================================================

set "BAT=%~dp0start-editor.bat"

if /i "%~1"=="remove" (
    reg delete "HKCU\Software\Classes\scratchedit" /f >nul 2>nul
    echo [ok] scratchedit:// protocol removed.
    pause
    exit /b 0
)

if not exist "%BAT%" (
    echo [x] start-editor.bat was not found next to this file.
    echo     Expected: %BAT%
    pause
    exit /b 1
)

echo Registering URL protocol: scratchedit://
reg add "HKCU\Software\Classes\scratchedit" /ve /t REG_SZ /d "URL:scratch extension editor launcher" /f >nul
reg add "HKCU\Software\Classes\scratchedit" /v "URL Protocol" /t REG_SZ /d "" /f >nul
REM  Pass "nolaunch" so start-editor.bat does NOT open a browser tab:
REM  the userscript already opens one, otherwise TWO tabs would appear.
reg add "HKCU\Software\Classes\scratchedit\shell\open\command" /ve /t REG_SZ /d "\"%BAT%\" nolaunch" /f >nul

if errorlevel 1 (
    echo [x] Failed to write the registry key.
    pause
    exit /b 1
)

echo.
echo [ok] Done. The launcher is registered as:
echo        %BAT%
echo.
echo Test it: paste this into the browser address bar and press Enter:
echo        scratchedit://start
echo   (this only STARTS the server - it will not open a tab, because
echo    the userscript handles opening. Double-click start-editor.bat
echo    if you want it to open the browser too.)
echo.
echo If you upgraded from an older version, re-run this file once to
echo apply the "nolaunch" argument.
echo.
echo Uninstall: run this file with the word  remove
pause
exit /b 0
