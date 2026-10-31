#!/bin/bash
# Refuses to run when: the server is still listening on :3000, the folder is
# not a git checkout, or tracked files (other than src/routeTree.gen.ts / package-lock.json, which
# is restored) are modified. Asks for confirmation when HEAD is on a branch.
# UPDATE_DRY_RUN=1 : exit right after the checkout step (for testing).
set -e
cd "$(dirname "$0")"

# =============================================================
#  Configuration
# =============================================================
NODE_VERSION="22.12.0"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)       ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
esac

if [ "$OS" = "darwin" ]; then
    NODE_DIST="node-v${NODE_VERSION}-darwin-${ARCH}"
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.gz"
    TAR_FLAG="z"
else
    NODE_DIST="node-v${NODE_VERSION}-linux-${ARCH}"
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.xz"
    TAR_FLAG="J"
fi

RUNTIME_DIR="./runtime"
NODE_DIR="${RUNTIME_DIR}/node"
NODE_BIN="${NODE_DIR}/bin"

echo ""
echo "  ======================================="
echo "         87 Studio - Update"
echo "  ======================================="
echo ""

# =============================================================
#  Step 1: Fetch latest release tag
# =============================================================
# Server still running? (skip the check when no tool is available)
PORT_BUSY=0
if command -v lsof &>/dev/null; then
    lsof -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1 && PORT_BUSY=1
elif command -v ss &>/dev/null; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '[:.]3000$' && PORT_BUSY=1
elif command -v nc &>/dev/null; then
    nc -z 127.0.0.1 3000 >/dev/null 2>&1 && PORT_BUSY=1
fi
if [ "$PORT_BUSY" = "1" ]; then
    echo "  [ERROR] 서버가 실행 중입니다. start.sh 를 실행한 터미널에서 Ctrl+C 로 먼저 종료하고 다시 실행해주세요."
    exit 1
fi

# Git checkout?
if [ ! -e .git ]; then
    echo "  [ERROR] 이 폴더는 git으로 받은 경우에만 업데이트할 수 있어요."
    echo "  (ZIP으로 내려받은 폴더는 업데이트할 수 없습니다.)"
    echo "  아래 명령으로 새로 받은 뒤 그 폴더에서 ./start.sh 를 실행해주세요:"
    echo "    git clone https://github.com/snuff8729/87-studio.git"
    exit 1
fi

if ! command -v git &>/dev/null; then
    echo "  [ERROR] Git이 설치되어 있지 않습니다."
    echo "  Git을 설치한 후 다시 실행해주세요."
    exit 1
fi

# On a branch (developer use): updating leaves the branch
if git symbolic-ref -q HEAD >/dev/null 2>&1; then
    BRANCH=$(git symbolic-ref --short HEAD)
    echo ""
    echo "  [주의] 현재 '$BRANCH' 브랜치에 있습니다."
    echo "  업데이트하면 이 폴더가 릴리스 태그로 전환되어 '$BRANCH' 브랜치에서 벗어납니다."
    read -r -p "  계속할까요? (y/N) " ANSWER || ANSWER=""
    case "$ANSWER" in
        y|Y|yes|YES) ;;
        *) echo "  취소했습니다. 변경된 내용은 없습니다."; exit 0 ;;
    esac
fi

# Generated files rewritten by builds: restore before checkout
for GEN_FILE in src/routeTree.gen.ts package-lock.json; do
    if [ -n "$(git status --porcelain --untracked-files=no -- "$GEN_FILE")" ]; then
        git checkout -- "$GEN_FILE"
    fi
done

# Any other tracked modifications: stop (never discard user work)
DIRTY=$(git status --porcelain --untracked-files=no)
if [ -n "$DIRTY" ]; then
    echo ""
    echo "  [ERROR] 수정된 파일이 있어 업데이트할 수 없습니다:"
    echo "$DIRTY" | sed 's/^/    /'
    echo ""
    echo "  직접 수정한 내용이 사라지지 않도록 업데이트를 중단했습니다."
    echo "  변경을 커밋하거나 되돌린 뒤 다시 실행해주세요."
    exit 1
fi

echo "  [1/5] 최신 릴리스 가져오는 중..."
if ! git fetch origin --tags --force; then
    echo "  [ERROR] Git fetch에 실패했습니다."
    echo "  인터넷 연결 또는 저장소 상태를 확인해주세요."
    exit 1
fi

LATEST_TAG=$(git tag --sort=-v:refname | head -n 1)

if [ -z "$LATEST_TAG" ]; then
    echo "  [ERROR] 릴리스 태그를 찾을 수 없습니다."
    exit 1
fi

CURRENT_COMMIT=$(git rev-parse HEAD)
LATEST_TAG_COMMIT=$(git rev-list -n 1 "$LATEST_TAG")
CURRENT_TAG=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "")

if [ "$CURRENT_COMMIT" = "$LATEST_TAG_COMMIT" ]; then
    echo "        이미 최신 버전입니다: $LATEST_TAG"
else
    if [ -n "$CURRENT_TAG" ]; then
        echo "        $CURRENT_TAG -> $LATEST_TAG"
    else
        echo "        -> $LATEST_TAG"
    fi
    git checkout "$LATEST_TAG"
fi
echo "        완료!"

if [ "$UPDATE_DRY_RUN" = "1" ]; then
    echo "  (UPDATE_DRY_RUN) 체크아웃 후 종료합니다."
    exit 0
fi

# =============================================================
#  Step 2: Node.js Runtime
# =============================================================
if [ -f "${NODE_BIN}/node" ]; then
    echo "  [2/5] Node.js ................. OK"
else
    echo "  [2/5] Node.js 다운로드 중..."
    mkdir -p "$RUNTIME_DIR"

    if command -v curl &>/dev/null; then
        curl -fSL "$NODE_URL" -o "${RUNTIME_DIR}/node.tar"
    elif command -v wget &>/dev/null; then
        wget -q "$NODE_URL" -O "${RUNTIME_DIR}/node.tar"
    else
        echo "  [ERROR] curl 또는 wget이 필요합니다."
        exit 1
    fi

    echo "        압축 해제 중..."
    tar -x${TAR_FLAG}f "${RUNTIME_DIR}/node.tar" -C "$RUNTIME_DIR"
    mv "${RUNTIME_DIR}/${NODE_DIST}" "$NODE_DIR"
    rm -f "${RUNTIME_DIR}/node.tar"
    echo "        완료!"
fi

export PATH="${NODE_BIN}:$PATH"

# =============================================================
#  Step 3: Install Dependencies
# =============================================================
echo "  [3/5] 의존성 설치 중..."
"${NODE_BIN}/npm" install --loglevel=error
echo "        완료!"

# =============================================================
#  Step 4: Database Migration
# =============================================================
echo "  [4/5] 데이터베이스 마이그레이션 중..."
mkdir -p data
"${NODE_BIN}/npx" --yes drizzle-kit migrate 2>/dev/null
"${NODE_BIN}/npx" --yes tsx src/server/db/custom-migrations.ts
echo "        완료!"

# =============================================================
#  Step 5: Build Application
# =============================================================
echo "  [5/5] 애플리케이션 빌드 중..."
rm -rf .output
NODE_OPTIONS=--disable-warning=ExperimentalWarning "${NODE_BIN}/npm" run build
echo "        완료!"

# =============================================================
#  Done
# =============================================================
echo ""
echo "  ======================================="
echo "    업데이트가 완료되었습니다!"
echo "    ./start.sh 로 서버를 시작하세요."
echo "  ======================================="
echo ""
