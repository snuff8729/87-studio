#!/bin/bash
set -e
cd "$(dirname "$0")"

# =============================================================
#  Configuration
# =============================================================
NODE_VERSION="22.12.0"

# Bump DANBOORU_DB_VERSION when uploading a new danbooru.db to HuggingFace
# so existing users get the new file on next start.
DANBOORU_DB_VERSION="1"
DANBOORU_DB_URL="https://huggingface.co/datasets/snuff8729/87-studio/resolve/main/danbooru.db"

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
echo "         87 Studio"
echo "  ======================================="
echo ""

# =============================================================
#  Step 1: Node.js Runtime
# =============================================================
if [ -f "${NODE_BIN}/node" ]; then
    echo "  [1/6] Node.js ................. OK"
else
    echo "  [1/6] Node.js 다운로드 중..."
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
#  Step 2: Install Dependencies
# =============================================================
if [ -f "node_modules/.package-lock.json" ]; then
    echo "  [2/6] Dependencies ............ OK"
else
    echo "  [2/6] 의존성 설치 중..."
    echo "        (첫 실행 시 몇 분 소요됩니다)"
    "${NODE_BIN}/npm" install --loglevel=warn
    echo "        완료!"
fi

# =============================================================
#  Step 3: Database Migration
# =============================================================
echo "  [3/6] 데이터베이스 확인 중..."
mkdir -p data
"${NODE_BIN}/npx" --yes drizzle-kit migrate 2>/dev/null
"${NODE_BIN}/npx" --yes tsx src/server/db/custom-migrations.ts
echo "        완료!"

# =============================================================
#  Step 4: Danbooru DB
# =============================================================
DANBOORU_DB_PATH="./data/danbooru.db"
DANBOORU_DB_TMP="./data/danbooru.db.tmp"
DANBOORU_DB_VERSION_FILE="./data/danbooru.db.version"

NEED_DANBOORU_DOWNLOAD=false
if [ ! -f "$DANBOORU_DB_PATH" ]; then
    NEED_DANBOORU_DOWNLOAD=true
elif [ ! -f "$DANBOORU_DB_VERSION_FILE" ] || [ "$(cat "$DANBOORU_DB_VERSION_FILE" 2>/dev/null)" != "$DANBOORU_DB_VERSION" ]; then
    NEED_DANBOORU_DOWNLOAD=true
fi

if [ "$NEED_DANBOORU_DOWNLOAD" = "true" ]; then
    echo "  [4/6] Danbooru DB 다운로드 중..."
    echo "        (파일 크기가 커서 시간이 걸릴 수 있습니다)"
    rm -f "$DANBOORU_DB_TMP"

    if command -v curl &>/dev/null; then
        curl -fSL "$DANBOORU_DB_URL" -o "$DANBOORU_DB_TMP"
    elif command -v wget &>/dev/null; then
        wget -q --show-progress "$DANBOORU_DB_URL" -O "$DANBOORU_DB_TMP"
    else
        echo "  [ERROR] curl 또는 wget이 필요합니다."
        exit 1
    fi

    # Replace old DB + leftover WAL/SHM files atomically
    rm -f "${DANBOORU_DB_PATH}-shm" "${DANBOORU_DB_PATH}-wal"
    mv "$DANBOORU_DB_TMP" "$DANBOORU_DB_PATH"
    echo "$DANBOORU_DB_VERSION" > "$DANBOORU_DB_VERSION_FILE"
    echo "        완료!"
else
    echo "  [4/6] Danbooru DB ............. OK"
fi

# =============================================================
#  Step 5: Build Application
# =============================================================
if [ -f ".output/server/index.mjs" ]; then
    echo "  [5/6] Build ................... OK"
else
    echo "  [5/6] 애플리케이션 빌드 중..."
    echo "        (첫 실행 시 몇 분 소요됩니다)"
    "${NODE_BIN}/npm" run build
    echo "        완료!"
fi

# =============================================================
#  Step 6: Start Server
# =============================================================
echo "  [6/6] 서버 시작!"
echo ""
echo "  ======================================="
echo "    http://localhost:3000"
echo "  ======================================="
echo ""
echo "  브라우저가 자동으로 열립니다."
echo "  종료하려면 Ctrl+C를 누르세요."
echo ""

# Open browser
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3000" 2>/dev/null &
elif command -v open &>/dev/null; then
    open "http://localhost:3000" &
fi

# Start server (blocks until Ctrl+C)
"${NODE_BIN}/node" .output/server/index.mjs
