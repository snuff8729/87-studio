# 87 Studio - Start Script
# This script downloads Node.js if needed, installs dependencies,
# runs database migrations, builds the app, and starts the server.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "87 Studio"

# ============================================================
#  Configuration
# ============================================================
$NODE_VERSION = "22.12.0"
$NODE_DIST = "node-v$NODE_VERSION-win-x64"
$NODE_URL = "https://nodejs.org/dist/v$NODE_VERSION/$NODE_DIST.zip"

$ROOT_DIR = Split-Path -Parent $PSScriptRoot
$RUNTIME_DIR = Join-Path $ROOT_DIR "runtime"
$NODE_DIR = Join-Path $RUNTIME_DIR "node"
$DATA_DIR = Join-Path $ROOT_DIR "data"

Set-Location $ROOT_DIR

Write-Host ""
Write-Host "   ======================================="
Write-Host "          87 Studio"
Write-Host "   ======================================="
Write-Host ""

# ============================================================
#  Step 1: Node.js Runtime
# ============================================================
if (Test-Path (Join-Path $NODE_DIR "node.exe")) {
    Write-Host "   [1/5] Node.js ................. OK"
} else {
    Write-Host "   [1/5] Node.js 다운로드 중..."
    if (-not (Test-Path $RUNTIME_DIR)) { New-Item -ItemType Directory -Path $RUNTIME_DIR | Out-Null }

    $zipPath = Join-Path $RUNTIME_DIR "node.zip"
    try {
        $ProgressPreference = 'SilentlyContinue'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NODE_URL -OutFile $zipPath
    } catch {
        Write-Host ""
        Write-Host "   [ERROR] Node.js 다운로드에 실패했습니다."
        Write-Host "   인터넷 연결을 확인해주세요."
        Read-Host "   Enter 키를 누르면 종료합니다"
        exit 1
    }

    Write-Host "         압축 해제 중..."
    try {
        Expand-Archive -Path $zipPath -DestinationPath $RUNTIME_DIR -Force
    } catch {
        Write-Host "   [ERROR] 압축 해제에 실패했습니다."
        Read-Host "   Enter 키를 누르면 종료합니다"
        exit 1
    }

    $extractedDir = Join-Path $RUNTIME_DIR $NODE_DIST
    if (Test-Path $extractedDir) {
        Rename-Item $extractedDir "node"
    }
    Remove-Item $zipPath -ErrorAction SilentlyContinue
    Write-Host "         완료!"
}

# ============================================================
#  Step 2: Install Dependencies
# ============================================================
$env:PATH = "$NODE_DIR;$env:PATH"
$npmCmd = Join-Path $NODE_DIR "npm.cmd"
$npxCmd = Join-Path $NODE_DIR "npx.cmd"
$nodeExe = Join-Path $NODE_DIR "node.exe"

$lockFile = Join-Path $ROOT_DIR "node_modules\.package-lock.json"
if (Test-Path $lockFile) {
    Write-Host "   [2/5] Dependencies ............ OK"
} else {
    Write-Host "   [2/5] 의존성 설치 중..."
    Write-Host "         (첫 실행 시 몇 분 소요됩니다)"
    & $npmCmd install --loglevel=warn 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "   [ERROR] 의존성 설치에 실패했습니다."
        Read-Host "   Enter 키를 누르면 종료합니다"
        exit 1
    }
    Write-Host "         완료!"
}

# ============================================================
#  Step 3: Database Migration
# ============================================================
Write-Host "   [3/5] 데이터베이스 확인 중..."
if (-not (Test-Path $DATA_DIR)) { New-Item -ItemType Directory -Path $DATA_DIR | Out-Null }
& $npxCmd --yes drizzle-kit migrate 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   [ERROR] 데이터베이스 마이그레이션에 실패했습니다."
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}
Write-Host "         완료!"

# ============================================================
#  Step 4: Build Application
# ============================================================
$outputIndex = Join-Path $ROOT_DIR ".output\server\index.mjs"
if (Test-Path $outputIndex) {
    Write-Host "   [4/5] Build ................... OK"
} else {
    Write-Host "   [4/5] 애플리케이션 빌드 중..."
    Write-Host "         (첫 실행 시 몇 분 소요됩니다)"
    & $npmCmd run build 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "   [ERROR] 빌드에 실패했습니다."
        Read-Host "   Enter 키를 누르면 종료합니다"
        exit 1
    }
    Write-Host "         완료!"
}

# ============================================================
#  Step 5: Start Server
# ============================================================
Write-Host "   [5/5] 서버 시작!"
Write-Host ""
Write-Host "   ======================================="
Write-Host "     http://localhost:3000"
Write-Host "   ======================================="
Write-Host ""
Write-Host "   브라우저가 자동으로 열립니다."
Write-Host "   종료하려면 이 창을 닫으세요."
Write-Host ""

Start-Process "http://localhost:3000"
& $nodeExe ".output\server\index.mjs"

Write-Host ""
Write-Host "   서버가 종료되었습니다."
Read-Host "   Enter 키를 누르면 종료합니다"
