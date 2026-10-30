@echo off
rem Starts the built server against ./demo (fake data) on :3001. Requires .output (pnpm build) to exist.
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
start "" http://localhost:3001
pushd "%REPO%\demo"
"%REPO%\runtime\node\node.exe" "%REPO%\.output\server\index.mjs"
popd
