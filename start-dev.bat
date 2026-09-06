@echo off
setlocal
set "NODEBIN=C:\Users\dell\.workbuddy\binaries\node\versions\22.22.2-2"
if exist "%NODEBIN%\node.exe" set "PATH=%NODEBIN%;%PATH%"
cd /d "C:\Users\dell\scratch-gui"
echo Starting scratch-gui dev server on http://127.0.0.1:8601/
echo Open that URL in your browser. Close this window to stop the server.
npm start
endlocal
