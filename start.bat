@echo off
chcp 65001 >nul 2>&1
title 87 Studio
cd /d "%~dp0"

:: ============================================================
::  Configuration - Node.js version to use
:: ============================================================
set "NODE_VERSION=22.12.0"
set "NODE_DIST=node-v%NODE_VERSION%-win-x64"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_DIST%.zip"
set "RUNTIME_DIR=%~dp0runtime"
set "NODE_DIR=%RUNTIME_DIR%\node"

echo.
echo   =======================================
echo          87 Studio
echo   =======================================
echo.

:: ============================================================
::  Step 1: Node.js Runtime
:: ============================================================
if exist "%NODE_DIR%\node.exe" (
    echo   [1/5] Node.js ................. OK
    goto :deps
)

echo   [1/5] Node.js 다운로드 중...
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

powershell -Command "& { $ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%RUNTIME_DIR%\node.zip' }"
if errorlevel 1 (
    echo.
    echo   [ERROR] Node.js 다운로드에 실패했습니다.
    echo   인터넷 연결을 확인해주세요.
    goto :fail
)

echo         압축 해제 중...
powershell -Command "Expand-Archive -Path '%RUNTIME_DIR%\node.zip' -DestinationPath '%RUNTIME_DIR%' -Force"
if errorlevel 1 (
    echo   [ERROR] 압축 해제에 실패했습니다.
    goto :fail
)

if exist "%RUNTIME_DIR%\%NODE_DIST%" (
    rename "%RUNTIME_DIR%\%NODE_DIST%" node
)
del /q "%RUNTIME_DIR%\node.zip" 2>nul
echo         완료!

:: ============================================================
::  Step 2: Install Dependencies
:: ============================================================
:deps
set "PATH=%NODE_DIR%;%PATH%"

if exist "%~dp0node_modules\.package-lock.json" (
    echo   [2/5] Dependencies ............ OK
    goto :migrate
)

echo   [2/5] 의존성 설치 중...
echo         (첫 실행 시 몇 분 소요됩니다)
call "%NODE_DIR%\npm.cmd" install --loglevel=warn 2>&1
if errorlevel 1 (
    echo.
    echo   [ERROR] 의존성 설치에 실패했습니다.
    goto :fail
)
echo         완료!

:: ============================================================
::  Step 3: Database Migration
:: ============================================================
:migrate
echo   [3/5] 데이터베이스 확인 중...
call "%NODE_DIR%\npx.cmd" --yes drizzle-kit migrate 2>nul
if errorlevel 1 (
    echo   [ERROR] 데이터베이스 마이그레이션에 실패했습니다.
    goto :fail
)
echo         완료!

:: ============================================================
::  Step 4: Build Application
:: ============================================================
if exist "%~dp0.output\server\index.mjs" (
    echo   [4/5] Build ................... OK
    goto :start
)

echo   [4/5] 애플리케이션 빌드 중...
echo         (첫 실행 시 몇 분 소요됩니다)
call "%NODE_DIR%\npm.cmd" run build 2>&1
if errorlevel 1 (
    echo.
    echo   [ERROR] 빌드에 실패했습니다.
    goto :fail
)
echo         완료!

:: ============================================================
::  Step 5: Start Server
:: ============================================================
:start
echo   [5/5] 서버 시작!
echo.
echo   =======================================
echo     http://localhost:3000
echo   =======================================
echo.
echo   브라우저가 자동으로 열립니다.
echo   종료하려면 이 창을 닫으세요.
echo.

:: Open browser after a short delay
start "" "http://localhost:3000"

:: Start server (blocks until window is closed)
"%NODE_DIR%\node.exe" .output\server\index.mjs

echo.
echo   서버가 종료되었습니다.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
