@echo off
REM Demo de trazabilidad (datos ficticios, ADR-0021). Requiere Node.js 24.
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta Node.js 24: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Instalando dependencias, solo la primera vez... & call npm install || (pause & exit /b 1))
call npm run build || (pause & exit /b 1)
start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:3000"
node dist\main.js
pause
