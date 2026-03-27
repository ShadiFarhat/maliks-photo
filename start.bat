@echo off
title Maliks Photo Studio
cd /d "%~dp0"
echo.
echo   Starting Maliks Photo Studio...
echo.
start http://localhost:3700
node server.js
pause
