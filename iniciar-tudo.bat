@echo off
title Sistema de Entregas - Empresa e Entregador (COMPLETO)
cls
echo.
echo ===========================================================
echo    SISTEMA DE ENTREGAS - UBER STYLE V3.5
echo ===========================================================
echo.
echo [+] Otimizando ambiente e preparando servidores...
echo.

echo [1/3] Iniciando Painel da Empresa (Porta 5173)...
start cmd /k "cd /d %~dp0empresa && title SERVIDOR EMPRESA && npm run dev -- --host"

echo [2/3] Iniciando App do Entregador (Porta 5174)...
start cmd /k "cd /d %~dp0entregador && title SERVIDOR ENTREGADOR && npm run dev -- --port 5174 --host"

echo [3/3] Iniciando Painel Administrativo (Porta 5175)...
start cmd /k "cd /d %~dp0admin && title SERVIDOR ADMIN && npm run dev -- --port 5175 --host"

echo.
echo [+] Todos os sistemas estao subindo!
echo.
echo ===========================================================
echo   DICA DE ACESSO:
echo   - Painel Empresa: http://localhost:5173
echo   - App Entregador: http://localhost:5174
echo   - Administracao:  http://localhost:5175
echo ===========================================================
echo.

echo [>] Abrindo navegadores em 3 segundos...
timeout /t 3 /nobreak > nul
start http://localhost:5173
start http://localhost:5174
start http://localhost:5175

echo.
echo Mantenha estas janelas abertas para o funcionamento correto.
pause
