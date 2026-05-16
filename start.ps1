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

# Bump DANBOORU_DB_VERSION when uploading a new danbooru.db to HuggingFace
# so existing users get the new file on next start.
$DANBOORU_DB_VERSION = "1"
$DANBOORU_DB_URL = "https://huggingface.co/datasets/snuff8729/87-studio/resolve/main/danbooru.db"

$ROOT_DIR = $PSScriptRoot
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
    Write-Host "   [1/6] Node.js ................. OK"
} else {
    Write-Host "   [1/6] Node.js 다운로드 중..."
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
    Write-Host "   [2/6] Dependencies ............ OK"
} else {
    Write-Host "   [2/6] 의존성 설치 중..."
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
Write-Host "   [3/6] 데이터베이스 확인 중..."
if (-not (Test-Path $DATA_DIR)) { New-Item -ItemType Directory -Path $DATA_DIR | Out-Null }
& $npxCmd --yes drizzle-kit migrate 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   [ERROR] 데이터베이스 마이그레이션에 실패했습니다."
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}
& $npxCmd --yes tsx src/server/db/custom-migrations.ts
Write-Host "         완료!"

# ============================================================
#  Step 4: Danbooru DB
# ============================================================
$DANBOORU_DB_PATH = Join-Path $DATA_DIR "danbooru.db"
$DANBOORU_DB_TMP = Join-Path $DATA_DIR "danbooru.db.tmp"
$DANBOORU_DB_VERSION_FILE = Join-Path $DATA_DIR "danbooru.db.version"

$needDanbooruDownload = $false
if (-not (Test-Path $DANBOORU_DB_PATH)) {
    $needDanbooruDownload = $true
} elseif (-not (Test-Path $DANBOORU_DB_VERSION_FILE)) {
    $needDanbooruDownload = $true
} else {
    $currentVersion = ""
    try {
        $currentVersion = (Get-Content $DANBOORU_DB_VERSION_FILE -Raw -ErrorAction Stop).Trim()
    } catch {
        $currentVersion = ""
    }
    if ($currentVersion -ne $DANBOORU_DB_VERSION) {
        $needDanbooruDownload = $true
    }
}

if ($needDanbooruDownload) {
    Write-Host "   [4/6] Danbooru DB 다운로드 중..."
    Write-Host "         (파일 크기가 커서 시간이 걸릴 수 있습니다)"
    Remove-Item $DANBOORU_DB_TMP -ErrorAction SilentlyContinue
    try {
        $ProgressPreference = 'SilentlyContinue'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $DANBOORU_DB_URL -OutFile $DANBOORU_DB_TMP
    } catch {
        Write-Host ""
        Write-Host "   [ERROR] Danbooru DB 다운로드에 실패했습니다."
        Write-Host "   인터넷 연결을 확인해주세요."
        Remove-Item $DANBOORU_DB_TMP -ErrorAction SilentlyContinue
        Read-Host "   Enter 키를 누르면 종료합니다"
        exit 1
    }

    # Replace old DB + leftover WAL/SHM files
    Remove-Item "$DANBOORU_DB_PATH-shm" -ErrorAction SilentlyContinue
    Remove-Item "$DANBOORU_DB_PATH-wal" -ErrorAction SilentlyContinue
    if (Test-Path $DANBOORU_DB_PATH) { Remove-Item $DANBOORU_DB_PATH -Force }
    Move-Item -Path $DANBOORU_DB_TMP -Destination $DANBOORU_DB_PATH -Force
    Set-Content -Path $DANBOORU_DB_VERSION_FILE -Value $DANBOORU_DB_VERSION -NoNewline
    Write-Host "         완료!"
} else {
    Write-Host "   [4/6] Danbooru DB ............. OK"
}

# ============================================================
#  Step 5: Build Application
# ============================================================
$outputIndex = Join-Path $ROOT_DIR ".output\server\index.mjs"
if (Test-Path $outputIndex) {
    Write-Host "   [5/6] Build ................... OK"
} else {
    Write-Host "   [5/6] 애플리케이션 빌드 중..."
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
#  Step 6: Start Server
# ============================================================
Write-Host "   [6/6] 서버 시작!"
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
