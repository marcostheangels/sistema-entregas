@echo off
title Painel Administrativo - Sistema de Entregas
cd /d "%~dp0admin"
if not exist node_modules (
    echo Instalando dependencias, aguarde...
    call npm install
)
start "" http://localhost:5175
call npm run dev -- --port 5175 --strictPort --host
pause
