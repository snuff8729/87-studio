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
set "GIT_CMD="

echo.
echo   =======================================
echo          87 Studio - Update
echo   =======================================
echo.

:: ============================================================
::  Step 1: Git Pull
:: ============================================================

:: Check PATH
where git >nul 2>&1
if not errorlevel 1 (
    set "GIT_CMD=git"
    goto :git_pull
)

:: Check common install locations
if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
    goto :git_pull
)
if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files (x86)\Git\cmd\git.exe"
    goto :git_pull
)

:: Try winget install
echo   [1/5] Git 설치 중...
where winget >nul 2>&1
if errorlevel 1 goto :git_not_found

winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements >nul 2>&1
if errorlevel 1 goto :git_not_found

:: Check again after install
if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
    echo         Git 설치 완료!
    goto :git_pull
)

:git_not_found
echo.
echo   [ERROR] Git이 설치되어 있지 않습니다.
echo   아래 링크에서 Git을 설치한 후 다시 실행해주세요:
echo   https://git-scm.com/download/win
echo.
goto :fail

:git_pull
echo   [1/5] 최신 릴리스 가져오는 중...
"%GIT_CMD%" fetch --tags
if errorlevel 1 (
    echo.
    echo   [ERROR] Git fetch에 실패했습니다.
    echo   인터넷 연결 또는 저장소 상태를 확인해주세요.
    goto :fail
)

:: Find latest tag
for /f "delims=" %%T in ('"%GIT_CMD%" describe --tags --abbrev^=0 HEAD 2^>nul') do set "CURRENT_TAG=%%T"
for /f "delims=" %%T in ('"%GIT_CMD%" tag --sort^=-v:refname') do (
    if not defined LATEST_TAG set "LATEST_TAG=%%T"
)

if not defined LATEST_TAG (
    echo.
    echo   [ERROR] 릴리스 태그를 찾을 수 없습니다.
    goto :fail
)

if "%CURRENT_TAG%"=="%LATEST_TAG%" (
    echo         이미 최신 버전입니다: %LATEST_TAG%
) else (
    if defined CURRENT_TAG (
        echo         %CURRENT_TAG% -^> %LATEST_TAG%
    ) else (
        echo         -^> %LATEST_TAG%
    )
    "%GIT_CMD%" checkout "%LATEST_TAG%"
    if errorlevel 1 (
        echo.
        echo   [ERROR] 버전 전환에 실패했습니다.
        goto :fail
    )
)
echo         완료!

:: ============================================================
::  Step 2: Node.js Runtime
:: ============================================================
if exist "%NODE_DIR%\node.exe" (
    echo   [2/5] Node.js ................. OK
    goto :deps
)

echo   [2/5] Node.js 다운로드 중...
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
::  Step 3: Install Dependencies
:: ============================================================
:deps
set "PATH=%NODE_DIR%;%PATH%"

echo   [3/5] 의존성 설치 중...
call "%NODE_DIR%\npm.cmd" install --loglevel=warn 2>&1
if errorlevel 1 (
    echo.
    echo   [ERROR] 의존성 설치에 실패했습니다.
    goto :fail
)
echo         완료!

:: ============================================================
::  Step 4: Database Migration
:: ============================================================
echo   [4/5] 데이터베이스 마이그레이션 중...
if not exist "%~dp0data" mkdir "%~dp0data"
call "%NODE_DIR%\npx.cmd" --yes drizzle-kit migrate 2>nul
if errorlevel 1 (
    echo   [ERROR] 데이터베이스 마이그레이션에 실패했습니다.
    goto :fail
)
echo         완료!

:: ============================================================
::  Step 5: Build Application
:: ============================================================
echo   [5/5] 애플리케이션 빌드 중...
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
