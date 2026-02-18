@echo off
chcp 65001 >nul 2>&1
title 87 Studio - Update
cd /d "%~dp0"

:: ============================================================
::  Configuration
:: ============================================================
set "NODE_VERSION=22.12.0"
set "NODE_DIST=node-v%NODE_VERSION%-win-x64"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_DIST%.zip"
set "RUNTIME_DIR=%~dp0runtime"
set "NODE_DIR=%RUNTIME_DIR%\node"

echo.
echo   =======================================
echo          87 Studio - Update
echo   =======================================
echo.

:: ============================================================
::  Step 1: Node.js Runtime
:: ============================================================
if exist "%NODE_DIR%\node.exe" (
    echo   [1/4] Node.js ................. OK
    goto :deps
)

echo   [1/4] Node.js 다운로드 중...
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

echo   [2/4] 의존성 설치 중...
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
echo   [3/4] 데이터베이스 마이그레이션 중...
if not exist "%~dp0data" mkdir "%~dp0data"
call "%NODE_DIR%\npx.cmd" --yes drizzle-kit migrate 2>nul
if errorlevel 1 (
    echo   [ERROR] 데이터베이스 마이그레이션에 실패했습니다.
    goto :fail
)
echo         완료!

:: ============================================================
::  Step 4: Build Application
:: ============================================================
echo   [4/4] 애플리케이션 빌드 중...
if exist "%~dp0.output" rmdir /s /q "%~dp0.output"
call "%NODE_DIR%\npm.cmd" run build 2>&1
if errorlevel 1 (
    echo.
    echo   [ERROR] 빌드에 실패했습니다.
    goto :fail
)
echo         완료!

:: ============================================================
::  Done
:: ============================================================
echo.
echo   =======================================
echo     업데이트가 완료되었습니다!
echo     start.bat 으로 서버를 시작하세요.
echo   =======================================
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
