#!/bin/bash
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
if ! command -v git &>/dev/null; then
    echo "  [ERROR] Git이 설치되어 있지 않습니다."
    echo "  Git을 설치한 후 다시 실행해주세요."
    exit 1
fi

echo "  [1/5] 최신 릴리스 가져오는 중..."
git fetch --tags
if [ $? -ne 0 ]; then
    echo "  [ERROR] Git fetch에 실패했습니다."
    echo "  인터넷 연결 또는 저장소 상태를 확인해주세요."
    exit 1
fi

CURRENT_TAG=$(git describe --tags --abbrev=0 HEAD 2>/dev/null || echo "")
LATEST_TAG=$(git tag --sort=-v:refname | head -n 1)

if [ -z "$LATEST_TAG" ]; then
    echo "  [ERROR] 릴리스 태그를 찾을 수 없습니다."
    exit 1
fi

if [ "$CURRENT_TAG" = "$LATEST_TAG" ]; then
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
"${NODE_BIN}/npm" install --loglevel=warn
echo "        완료!"

# =============================================================
#  Step 4: Database Migration
# =============================================================
echo "  [4/5] 데이터베이스 마이그레이션 중..."
mkdir -p data
"${NODE_BIN}/npx" --yes drizzle-kit migrate 2>/dev/null
echo "        완료!"

# =============================================================
#  Step 5: Build Application
# =============================================================
echo "  [5/5] 애플리케이션 빌드 중..."
rm -rf .output
"${NODE_BIN}/npm" run build
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
