@echo off
title Sistema de Entregas - Entregador (VERSAO FINAL)
cd /d "%~dp0entregador"
cls
echo.
echo ===========================================================
echo    SISTEMA DE ENTREGAS - APP DO ENTREGADOR
echo ===========================================================
echo.

:: Verifica se node_modules existe
if not exist node_modules (
    echo [!] Instalando dependencias...
    call npm install
)

:: Limpeza de cache para evitar erros de visualizacao
if exist node_modules\.vite (
    echo [1/2] Limpando cache do Vite...
    rd /s /q node_modules\.vite
)

if exist dist (
    echo [2/2] Limpando arquivos temporarios...
    rd /s /q dist
)

echo.
echo [+] Sincronizacao concluida!
echo.
echo ===========================================================
echo   CADASTRO: No painel de login, clique em
echo   "CRIAR MINHA CONTA" para se registrar como entregador.
echo ===========================================================
echo.

:: Abre o navegador
echo [>] Abrindo o app em http://localhost:5174...
timeout /t 2 /nobreak > nul
start http://localhost:5174

echo.
echo [!] Iniciando servidor de desenvolvimento...
npm run dev -- --port 5174
pause
