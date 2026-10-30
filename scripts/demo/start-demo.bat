@echo off
rem Starts the built server against ./demo (fake data) on :3001 in NAI mock mode
rem (no NovelAI requests; Generate produces fake images). Requires .output (pnpm build).
setlocal
set "REPO=%~dp0..\.."
pushd "%REPO%"
set "REPO=%CD%"
popd
if not exist "%REPO%\.output\server\index.mjs" (
  echo Build output not found: run the build first.
  exit /b 1
)
if not exist "%REPO%\demo\data\studio.db" (
  echo Seeding demo data...
  "%REPO%\runtime\node\node.exe" "%REPO%\scripts\demo\seed.mjs" || exit /b 1
)
set PORT=3001
set NITRO_PORT=3001
set NAI_MOCK=1
if not defined NAI_MOCK_DELAY_MS set NAI_MOCK_DELAY_MS=1500
set "STUDIO_DATA_DIR=%REPO%\demo\data"
start "" http://localhost:3001
pushd "%REPO%\demo"
"%REPO%\runtime\node\node.exe" "%REPO%\.output\server\index.mjs"
popd
