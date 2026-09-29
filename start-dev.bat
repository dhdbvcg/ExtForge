@echo off
rem 本地开发服务器启动器。用 %~dp0 定位仓库根目录，不写死任何绝对路径。
setlocal
cd /d "%~dp0"

echo Starting scratch-gui dev server on http://127.0.0.1:8601/
echo Open that URL in your browser. Close this window to stop the server.
echo.

npm start

endlocal
