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

# ── Frontend build (shared by both targets) ───────────────────────────────────
log "Building frontend…"
npm run build

# ── Linux .deb ────────────────────────────────────────────────────────────────
log "Building Linux (deb)…"
LINUX_OK=false
if npm run tauri:build:linux 2>&1; then
    DEB="$(find src-tauri/target/release/bundle/deb -name '*.deb' 2>/dev/null | head -1)"
    BIN="src-tauri/target/release/ingwestream"
    LINUX_OK=true
fi

# ── Windows exe + NSIS installer (cross-compile via cargo-xwin) ───────────────
log "Building Windows (exe + nsis)…"
WIN_OK=false

missing=()
command -v clang-cl  &>/dev/null || missing+=("clang-cl  (sudo apt-get install -y clang)")
command -v llvm-rc   &>/dev/null || missing+=("llvm-rc   (sudo apt-get install -y llvm)")
command -v makensis  &>/dev/null || missing+=("makensis  (sudo apt-get install -y nsis)")
command -v cargo-xwin &>/dev/null || missing+=("cargo-xwin (cargo install cargo-xwin)")

if [[ ${#missing[@]} -gt 0 ]]; then
    for dep in "${missing[@]}"; do
        fail "Missing: $dep"
    done
else
    export CC_x86_64_pc_windows_msvc=clang-cl
    export CXX_x86_64_pc_windows_msvc=clang-cl

    if npm run tauri:build:win 2>&1 | grep -v 'warning 5202'; then
        WIN_BIN="src-tauri/target/x86_64-pc-windows-msvc/release/ingwestream.exe"
        WIN_NSIS="$(find src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis -name '*.exe' 2>/dev/null | head -1)"
        WIN_OK=true
    fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Build summary${NC}"
echo "────────────────────────────────────────────────────────"

if [[ "$LINUX_OK" == true ]]; then
    ok "Linux binary:    $REPO_DIR/$BIN"
    [[ -n "${DEB:-}" ]] && ok "Linux installer: $REPO_DIR/$DEB"
else
    fail "Linux build failed"
fi

if [[ "$WIN_OK" == true ]]; then
    ok "Windows binary:    $REPO_DIR/$WIN_BIN"
    [[ -n "${WIN_NSIS:-}" ]] && ok "Windows installer: $REPO_DIR/$WIN_NSIS"
else
    fail "Windows build failed (check prerequisites above)"
fi

echo "────────────────────────────────────────────────────────"
