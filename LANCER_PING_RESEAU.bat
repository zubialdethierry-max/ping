@echo off
cd /d "%~dp0"
title PING! Fresh LAN V0.1
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js est requis. Installe Node.js LTS puis relance.
 pause
 exit /b 1
)
if not exist node_modules (
 echo Installation des dependances...
 call npm install
 if errorlevel 1 pause & exit /b 1
)
echo.
echo Demarrage PING! Fresh LAN V0.1...
node server.js
pause
