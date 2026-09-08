@echo off
setlocal enabledelayedexpansion
title PAINEL ADMINISTRATIVO - SISTEMA DE ENTREGAS V4.0
mode con: cols=100 lines=30
color 0F

:menu
cls
echo.
echo  ##########################################################################################
echo  #                                                                                        #
echo  #     DDDD   EEEEE  L      IIIII  V   V  EEEEE  RRRR    AAA    DDDD   OOO   RRRR    AAA    #
echo  #     D   D  E      L        I    V   V  E      R   R  A   A   D   D  O   O  R   R  A   A   #
echo  #     D   D  EEEE   L        I    V   V  EEEE   RRRR   AAAAA   D   D  O   O  RRRR   AAAAA   #
echo  #     D   D  E      L        I     V V   E      R  R   A   A   D   D  O   O  R  R   A   A   #
echo  #     DDDD   EEEEE  LLLLL  IIIII    V    EEEEE  R   R  A   A   DDDD   OOO   R   R  A   A   #
echo  #                                                                                        #
echo  ##########################################################################################
echo.
echo                           SISTEMA DE GESTAO DE ENTREGAS PROFISSIONAL
echo.
echo  [1] INICIAR PAINEL ADMINISTRATIVO (RECOMENDADO)
echo  [2] LIMPAR CACHE E REINSTALAR DEPENDENCIAS
echo  [3] SAIR
echo.
set /p opt=" SELECIONE UMA OPCAO: "

if "%opt%"=="1" goto start_app
if "%opt%"=="2" goto clean_install
if "%opt%"=="3" exit
goto menu

:start_app
cls
echo.
echo  [+] Verificando ambiente...
cd /d "%~dp0empresa"

if not exist node_modules (
    echo  [!] Dependencias nao encontradas. Instalando...
    call npm install
)

echo  [+] Limpando arquivos temporarios do motor Vite...
if exist node_modules\.vite rd /s /q node_modules\.vite
if exist dist rd /s /q dist

echo  [+] Abrindo interface de controle...
timeout /t 2 /nobreak > nul
start http://localhost:5173

echo.
echo  ==========================================================================================
echo     SERVIDOR ATIVO EM: http://localhost:5173
echo     PARA ENCERRAR O SISTEMA, FECHE ESTA JANELA.
echo  ==========================================================================================
echo.
npm run dev
pause
goto menu

:clean_install
cls
echo.
echo  [!] ALERTA: Este processo pode levar alguns minutos.
echo.
cd /d "%~dp0empresa"
echo  [1/3] Removendo pastas de cache...
if exist node_modules rd /s /q node_modules
if exist package-lock.json del /f /q package-lock.json
echo  [2/3] Instalando dependencias do zero...
call npm install
echo  [3/3] Sincronizando arquivos...
echo.
echo  [OK] Sistema restaurado com sucesso!
pause
goto menu
