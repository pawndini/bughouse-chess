@echo off
cd /d "%~dp0"
echo Starting Bug Bully at http://127.0.0.1:5000
npm run dev -- --hostname 127.0.0.1 --port 5000
pause
