@echo off
title 扩展编辑器启动器
echo ========================================
echo   扩展编辑器 - 启动中...
echo   地址: http://127.0.0.1:8601
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] 启动开发服务器...
start /B node node_modules\webpack-dev-server\bin\webpack-dev-server.js --mode development --port 8601 > nul 2>&1

echo [2/2] 等待服务器就绪...
:wait
timeout /t 2 /nobreak > nul
netstat -ano | findstr ":8601" | findstr "LISTENING" > nul 2>&1
if errorlevel 1 goto wait

echo.
echo 服务器已就绪！正在打开浏览器...
start http://127.0.0.1:8601

echo.
echo 关闭此窗口将停止服务器。
echo 按 Ctrl+C 也可停止。
pause > nul
