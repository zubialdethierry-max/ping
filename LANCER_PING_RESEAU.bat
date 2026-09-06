@echo off
cd /d "%~dp0"
title PING! V0.32 local / Internet-ready
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
echo Demarrage PING! V0.32 local / Internet-ready...
node server.js
pause
