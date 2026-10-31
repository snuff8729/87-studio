# 87 Studio - Update Script
# This script pulls the latest release, updates dependencies,
# runs migrations, and rebuilds the application.
#
# Refuses to run when: the server is still listening on :3000, the folder is
# not a git checkout, or tracked files (other than src/routeTree.gen.ts, which
# is restored) are modified. Asks for confirmation when HEAD is on a branch.
# UPDATE_DRY_RUN=1 : exit right after the checkout step (for testing).

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "87 Studio - Update"

# ============================================================
#  Configuration
# ============================================================
$NODE_VERSION = "22.12.0"
$NODE_DIST = "node-v$NODE_VERSION-win-x64"
$NODE_URL = "https://nodejs.org/dist/v$NODE_VERSION/$NODE_DIST.zip"

$ROOT_DIR = $PSScriptRoot
$RUNTIME_DIR = Join-Path $ROOT_DIR "runtime"
$NODE_DIR = Join-Path $RUNTIME_DIR "node"
$DATA_DIR = Join-Path $ROOT_DIR "data"

Set-Location $ROOT_DIR

Write-Host ""
Write-Host "   ======================================="
Write-Host "          87 Studio - Update"
Write-Host "   ======================================="
Write-Host ""

# ============================================================
#  Pre-checks (before any git change)
# ============================================================
# 1) Server still running?
$listening = $null
try { $listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue } catch {}
if ($listening) {
    Write-Host "   [ERROR] 서버가 실행 중입니다. start.bat 창을 먼저 닫고 다시 실행해주세요."
    Write-Host ""
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}

# 2) Git checkout?
if (-not (Test-Path (Join-Path $ROOT_DIR ".git"))) {
    Write-Host "   [ERROR] 이 폴더는 git으로 받은 경우에만 업데이트할 수 있어요."
    Write-Host "   (ZIP으로 내려받은 폴더는 업데이트할 수 없습니다.)"
    Write-Host "   아래 명령으로 새로 받은 뒤 그 폴더에서 start.bat 을 실행해주세요:"
    Write-Host "     git clone https://github.com/snuff8729/87-studio.git"
    Write-Host ""
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}

# ============================================================
#  Step 1: Git Pull
# ============================================================
$GIT_CMD = $null

# Check PATH
$gitPath = Get-Command git -ErrorAction SilentlyContinue
if ($gitPath) {
    $GIT_CMD = "git"
} elseif (Test-Path "C:\Program Files\Git\cmd\git.exe") {
    $GIT_CMD = "C:\Program Files\Git\cmd\git.exe"
} elseif (Test-Path "C:\Program Files (x86)\Git\cmd\git.exe") {
    $GIT_CMD = "C:\Program Files (x86)\Git\cmd\git.exe"
} else {
    # Try winget install
    Write-Host "   [1/5] Git 설치 중..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        & winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements 2>$null | Out-Null
        if (Test-Path "C:\Program Files\Git\cmd\git.exe") {
            $GIT_CMD = "C:\Program Files\Git\cmd\git.exe"
            Write-Host "         Git 설치 완료!"
        }
    }

    if (-not $GIT_CMD) {
        Write-Host ""
        Write-Host "   [ERROR] Git이 설치되어 있지 않습니다."
        Write-Host "   아래 링크에서 Git을 설치한 후 다시 실행해주세요:"
        Write-Host "   https://git-scm.com/download/win"
        Write-Host ""
        Read-Host "   Enter 키를 누르면 종료합니다"
        exit 1
    }
}

# On a branch (developer use): updating leaves the branch
& $GIT_CMD symbolic-ref -q HEAD *> $null
if ($LASTEXITCODE -eq 0) {
    $BRANCH = & $GIT_CMD symbolic-ref --short HEAD
    Write-Host ""
    Write-Host "   [주의] 현재 '$BRANCH' 브랜치에 있습니다."
    Write-Host "   업데이트하면 이 폴더가 릴리스 태그로 전환되어 '$BRANCH' 브랜치에서 벗어납니다."
    $answer = Read-Host "   계속할까요? (y/N)"
    if ($answer -notmatch '^[yY]') {
        Write-Host "   취소했습니다. 변경된 내용은 없습니다."
        exit 0
    }
}

# Generated files rewritten by builds: restore before checkout
$genFile = "src/routeTree.gen.ts"
$genChanged = & $GIT_CMD status --porcelain --untracked-files=no -- $genFile
if ($genChanged) {
    & $GIT_CMD checkout -- $genFile
}

# Any other tracked modifications: stop (never discard user work)
$dirty = & $GIT_CMD status --porcelain --untracked-files=no
if ($dirty) {
    Write-Host ""
    Write-Host "   [ERROR] 수정된 파일이 있어 업데이트할 수 없습니다:"
    foreach ($line in $dirty) { Write-Host "     $line" }
    Write-Host ""
    Write-Host "   직접 수정한 내용이 사라지지 않도록 업데이트를 중단했습니다."
    Write-Host "   변경을 커밋하거나 되돌린 뒤 다시 실행해주세요."
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}

Write-Host "   [1/5] 최신 릴리스 가져오는 중..."
& $GIT_CMD fetch origin --tags --force
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "   [ERROR] Git fetch에 실패했습니다."
    Write-Host "   인터넷 연결 또는 저장소 상태를 확인해주세요."
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}

# Find latest tag and compare commits
$LATEST_TAG = & $GIT_CMD tag --sort=-v:refname | Select-Object -First 1
if (-not $LATEST_TAG) {
    Write-Host ""
    Write-Host "   [ERROR] 릴리스 태그를 찾을 수 없습니다."
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}

$CURRENT_COMMIT = & $GIT_CMD rev-parse HEAD
$LATEST_TAG_COMMIT = & $GIT_CMD rev-list -n 1 $LATEST_TAG
$CURRENT_TAG = & $GIT_CMD describe --tags --exact-match HEAD 2>$null

if ($CURRENT_COMMIT -eq $LATEST_TAG_COMMIT) {
    Write-Host "         이미 최신 버전입니다: $LATEST_TAG"
} else {
    if ($CURRENT_TAG) {
        Write-Host "         $CURRENT_TAG -> $LATEST_TAG"
    } else {
        Write-Host "         -> $LATEST_TAG"
    }
    & $GIT_CMD checkout $LATEST_TAG
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "   [ERROR] 버전 전환에 실패했습니다."
        Read-Host "   Enter 키를 누르면 종료합니다"
        exit 1
    }
}
Write-Host "         완료!"

if ($env:UPDATE_DRY_RUN -eq "1") {
    Write-Host "   (UPDATE_DRY_RUN) 체크아웃 후 종료합니다."
    exit 0
}

# ============================================================
#  Step 2: Node.js Runtime
# ============================================================
if (Test-Path (Join-Path $NODE_DIR "node.exe")) {
    Write-Host "   [2/5] Node.js ................. OK"
} else {
    Write-Host "   [2/5] Node.js 다운로드 중..."
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
#  Step 3: Install Dependencies
# ============================================================
$env:PATH = "$NODE_DIR;$env:PATH"
$npmCmd = Join-Path $NODE_DIR "npm.cmd"
$npxCmd = Join-Path $NODE_DIR "npx.cmd"

Write-Host "   [3/5] 의존성 설치 중..."
& $npmCmd install --loglevel=error 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "   [ERROR] 의존성 설치에 실패했습니다."
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}
Write-Host "         완료!"

# ============================================================
#  Step 4: Database Migration
# ============================================================
Write-Host "   [4/5] 데이터베이스 마이그레이션 중..."
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
#  Step 5: Build Application
# ============================================================
Write-Host "   [5/5] 애플리케이션 빌드 중..."
$outputDir = Join-Path $ROOT_DIR ".output"
if (Test-Path $outputDir) { Remove-Item $outputDir -Recurse -Force }
$env:NODE_OPTIONS = "--disable-warning=ExperimentalWarning"
& $npmCmd run build 2>&1 | Out-Host
Remove-Item Env:NODE_OPTIONS
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "   [ERROR] 빌드에 실패했습니다."
    Read-Host "   Enter 키를 누르면 종료합니다"
    exit 1
}
Write-Host "         완료!"

# ============================================================
#  Done
# ============================================================
Write-Host ""
Write-Host "   ======================================="
Write-Host "     업데이트가 완료되었습니다!"
Write-Host "     start.bat 으로 서버를 시작하세요."
Write-Host "   ======================================="
Write-Host ""
Read-Host "   Enter 키를 누르면 종료합니다"
