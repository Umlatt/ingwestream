#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BOLD}==> $*${NC}"; }
ok()   { echo -e "${GREEN}    ✔ $*${NC}"; }
fail() { echo -e "${RED}    ✘ $*${NC}"; }

# ── Frontend build (shared by both targets) ──────────────────────────────────
log "Building frontend…"
npm run build

# ── Linux .deb ────────────────────────────────────────────────────────────────
log "Building Linux (deb)…"
LINUX_OK=true
if npm run tauri build -- --bundles deb 2>&1; then
    DEB="$(find src-tauri/target/release/bundle/deb -name '*.deb' | head -1)"
    BIN="src-tauri/target/release/ingwestream"
else
    LINUX_OK=false
fi

# ── Windows exe + NSIS installer (cross-compile via cargo-xwin) ───────────────
log "Building Windows (exe + nsis)…"
WIN_OK=true

# Ensure wrapper tools are present
if ! command -v clang-cl &>/dev/null; then
    fail "clang-cl not found — run: sudo apt-get install -y clang lld && sudo ln -sf /usr/bin/clang-14 /usr/bin/clang-cl"
    WIN_OK=false
fi
if ! command -v llvm-rc &>/dev/null; then
    fail "llvm-rc not found — run: sudo apt-get install -y llvm"
    WIN_OK=false
fi
if ! command -v makensis.exe &>/dev/null 2>&1; then
    fail "makensis.exe not found — run: sudo apt-get install -y nsis && echo -e '#!/bin/bash\nexec makensis \"\$@\"' | sudo tee /usr/local/bin/makensis.exe && sudo chmod +x /usr/local/bin/makensis.exe"
    WIN_OK=false
fi

if [[ "$WIN_OK" == true ]]; then
    export CC_x86_64_pc_windows_msvc=clang-cl
    export CXX_x86_64_pc_windows_msvc=clang-cl

    if npm run tauri build -- \
        --target x86_64-pc-windows-msvc \
        --bundles nsis \
        --runner cargo-xwin 2>&1 | grep -v 'warning 5202'; then

        WIN_BIN="src-tauri/target/x86_64-pc-windows-msvc/release/ingwestream.exe"
        WIN_NSIS="$(find src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis -name '*.exe' | head -1)"
    else
        WIN_OK=false
    fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Build summary${NC}"
echo "────────────────────────────────────────────────────────"

if [[ "$LINUX_OK" == true ]]; then
    ok "Linux binary:    $REPO_DIR/$BIN"
    ok "Linux installer: $REPO_DIR/$DEB"
else
    fail "Linux build failed"
fi

if [[ "$WIN_OK" == true ]]; then
    ok "Windows binary:    $REPO_DIR/$WIN_BIN"
    ok "Windows installer: $REPO_DIR/$WIN_NSIS"
else
    fail "Windows build failed (check prerequisites above)"
fi

echo "────────────────────────────────────────────────────────"
