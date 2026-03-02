#!/usr/bin/env bash
# =============================================================================
# CKB Full Node Setup Script
# =============================================================================
#
# This script guides you through downloading and configuring a CKB full node.
#
# Usage:
#   bash scripts/setup.sh [testnet|mainnet|dev]
#
# Defaults to testnet if no argument is provided.
#
# What this script does:
#   1. Detects your operating system (macOS or Linux)
#   2. Checks for required tools
#   3. Shows instructions for downloading the CKB binary
#   4. Provides the commands to initialize the node
#   5. Shows basic configuration options
#
# Note: This script shows INSTRUCTIONS rather than auto-installing everything.
# Auto-installing binary software from the internet is a security risk.
# You should verify the checksums of downloaded binaries yourself.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Colors
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
CHAIN="${1:-testnet}"
CKB_VERSION="0.119.0"  # Update to the latest release version
INSTALL_DIR="$HOME/.ckb"
DATA_DIR="$HOME/.ckb/data"

# Validate chain argument
if [[ "$CHAIN" != "testnet" && "$CHAIN" != "mainnet" && "$CHAIN" != "dev" ]]; then
  echo -e "${RED}Error: invalid chain '$CHAIN'. Use: testnet, mainnet, or dev${RESET}"
  exit 1
fi

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------
header() {
  echo
  echo -e "${CYAN}$(printf '=%.0s' {1..60})${RESET}"
  echo -e "${CYAN}${BOLD}  $1${RESET}"
  echo -e "${CYAN}$(printf '=%.0s' {1..60})${RESET}"
}

step() {
  echo
  echo -e "${YELLOW}${BOLD}STEP $1: $2${RESET}"
}

cmd() {
  echo -e "  ${CYAN}$1${RESET}"
}

info() {
  echo -e "  ${DIM}$1${RESET}"
}

ok() {
  echo -e "  ${GREEN}$1${RESET}"
}

warn() {
  echo -e "  ${YELLOW}$1${RESET}"
}

# -----------------------------------------------------------------------------
# Detect OS and architecture
# -----------------------------------------------------------------------------
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin)
      OS_NAME="macOS"
      case "$ARCH" in
        arm64)  PLATFORM="aarch64-apple-darwin" ;;
        x86_64) PLATFORM="x86_64-apple-darwin" ;;
        *)      PLATFORM="unknown-darwin" ;;
      esac
      ;;
    Linux)
      OS_NAME="Linux"
      case "$ARCH" in
        x86_64) PLATFORM="x86_64-unknown-linux-gnu" ;;
        aarch64) PLATFORM="aarch64-unknown-linux-gnu" ;;
        *)      PLATFORM="unknown-linux" ;;
      esac
      ;;
    *)
      OS_NAME="$OS"
      PLATFORM="unknown"
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Check for required tools
# -----------------------------------------------------------------------------
check_tools() {
  local missing=0

  for tool in curl tar; do
    if ! command -v "$tool" &>/dev/null; then
      warn "Missing required tool: $tool"
      missing=1
    else
      ok "Found: $tool"
    fi
  done

  if [[ $missing -ne 0 ]]; then
    echo
    warn "Install missing tools before proceeding."
    if [[ "$OS_NAME" == "macOS" ]]; then
      info "On macOS, use Homebrew: brew install curl"
    else
      info "On Ubuntu/Debian: sudo apt-get install curl tar"
      info "On CentOS/RHEL:   sudo yum install curl tar"
    fi
    return 1
  fi
  return 0
}

# -----------------------------------------------------------------------------
# Check if CKB is already installed
# -----------------------------------------------------------------------------
check_existing_ckb() {
  if command -v ckb &>/dev/null; then
    local existing_version
    existing_version=$(ckb --version 2>/dev/null | head -1 || echo "unknown")
    ok "CKB binary found: $existing_version"
    return 0
  fi

  if [[ -f "$INSTALL_DIR/ckb" ]]; then
    ok "CKB binary found at $INSTALL_DIR/ckb"
    return 0
  fi

  return 1
}

# =============================================================================
# MAIN SCRIPT
# =============================================================================

echo
echo -e "${CYAN}${BOLD}  CKB Full Node Setup Guide${RESET}"
echo -e "${CYAN}  Chain: ${YELLOW}${CHAIN}${RESET}"
echo -e "${CYAN}  Target CKB version: ${YELLOW}v${CKB_VERSION}${RESET}"
echo -e "${CYAN}  Install directory: ${YELLOW}${INSTALL_DIR}${RESET}"

header "Platform Detection"
detect_platform
echo
ok "OS: $OS_NAME"
ok "Architecture: $ARCH"
ok "Platform string: $PLATFORM"

header "Tool Check"
echo
if ! check_tools; then
  echo
  echo -e "${RED}Please install the missing tools and run this script again.${RESET}"
  exit 1
fi

# =============================================================================
header "Step 1: Download CKB Binary"
# =============================================================================
echo

if check_existing_ckb; then
  ok "CKB is already installed — skipping download step."
  echo
  info "To update, download the latest release and replace the binary."
else
  echo -e "  CKB releases are at: ${CYAN}https://github.com/nervosnetwork/ckb/releases${RESET}"
  echo
  info "Download URL for your platform:"

  DOWNLOAD_BASE="https://github.com/nervosnetwork/ckb/releases/download"
  TARBALL="ckb_v${CKB_VERSION}_${PLATFORM}.tar.gz"
  DOWNLOAD_URL="${DOWNLOAD_BASE}/v${CKB_VERSION}/${TARBALL}"

  echo
  cmd "# Download the CKB binary"
  cmd "curl -LO ${DOWNLOAD_URL}"
  echo
  cmd "# Verify the checksum (IMPORTANT — do this before running)"
  cmd "# Download the checksum file from the same release page"
  cmd "curl -LO ${DOWNLOAD_BASE}/v${CKB_VERSION}/${TARBALL}.sha256"
  cmd "sha256sum --check ${TARBALL}.sha256"
  echo
  cmd "# Extract the archive"
  cmd "mkdir -p ${INSTALL_DIR}"
  cmd "tar -xzf ${TARBALL} -C ${INSTALL_DIR} --strip-components=1"
  echo
  cmd "# Add to your PATH (add this to ~/.bashrc or ~/.zshrc)"
  cmd "export PATH=\"\$PATH:${INSTALL_DIR}\""
  echo

  warn "SECURITY NOTE: Always verify the SHA256 checksum before running"
  warn "any downloaded binary. The official checksums are published on"
  warn "the GitHub releases page alongside the download files."
  echo

  # Offer to perform the download automatically
  echo -e "  ${YELLOW}Download CKB v${CKB_VERSION} now? [y/N]${RESET}"
  read -r response
  if [[ "$response" =~ ^[Yy]$ ]]; then
    echo
    info "Downloading ${TARBALL}..."
    mkdir -p "$INSTALL_DIR"
    curl -L --progress-bar -o "/tmp/${TARBALL}" "$DOWNLOAD_URL" || {
      warn "Download failed. Please download manually from the URL above."
    }

    if [[ -f "/tmp/${TARBALL}" ]]; then
      info "Extracting to ${INSTALL_DIR}..."
      tar -xzf "/tmp/${TARBALL}" -C "$INSTALL_DIR" --strip-components=1
      rm "/tmp/${TARBALL}"
      ok "CKB extracted to ${INSTALL_DIR}"
      ok "Add ${INSTALL_DIR} to your PATH to use the 'ckb' command."
    fi
  fi
fi

# =============================================================================
header "Step 2: Initialize Node Configuration"
# =============================================================================
echo
echo "  This creates the configuration directory and default config files."
echo "  Run this in the directory where you want to store chain data."
echo

cmd "# Create and enter your CKB data directory"
cmd "mkdir -p ${DATA_DIR}/${CHAIN}"
cmd "cd ${DATA_DIR}/${CHAIN}"
echo

case "$CHAIN" in
  testnet)
    cmd "# Initialize testnet node"
    cmd "ckb init --chain testnet"
    echo
    info "Testnet is CKB Pudge — the long-running public test network."
    info "Testnet CKB has no real value. Good for learning and development."
    info "Expected sync time: 1-4 hours on modern hardware."
    ;;
  mainnet)
    cmd "# Initialize mainnet node"
    cmd "ckb init --chain mainnet"
    echo
    info "Mainnet is the real CKB blockchain."
    info "Expected sync time: 12-48 hours on modern hardware."
    info "Storage required: 500+ GB"
    ;;
  dev)
    cmd "# Initialize devnet (local development chain)"
    cmd "ckb init --chain dev"
    echo
    info "Devnet produces blocks on demand (no real PoW)."
    info "Perfect for smart contract development and testing."
    info "All data is local — no connection to the public network."
    ;;
esac

echo
info "After init, your directory will contain:"
info "  ckb.toml         — Main node configuration"
info "  ckb-miner.toml   — Mining configuration (for devnet)"
info "  specs/           — Chain specification files"
info "  data/            — Blockchain data (created on first run)"

# =============================================================================
header "Step 3: Review Key Configuration (ckb.toml)"
# =============================================================================
echo
echo "  Key settings in ckb.toml:"
echo

echo -e "  ${BOLD}[rpc] section — RPC server settings${RESET}"
cmd "  listen_address = \"0.0.0.0:8114\"  # Listen on all interfaces"
cmd "  # To restrict to localhost only:"
cmd "  listen_address = \"127.0.0.1:8114\""
echo

echo -e "  ${BOLD}[network] section — P2P network settings${RESET}"
cmd "  listen_addresses = [\"/ip4/0.0.0.0/tcp/8115\"]"
cmd "  max_peers = 8"
cmd "  max_outbound_peers = 8"
echo

echo -e "  ${BOLD}[store] section — Data storage settings${RESET}"
cmd "  path = \"data\""
cmd "  # For pruned mode (less disk space, cannot serve old blocks to peers):"
cmd "  # block_cache_size = 0"
echo

echo -e "  ${BOLD}[indexer] — Enable the cell indexer (required for wallets/DApps)${RESET}"
cmd "  [indexer]"
cmd "  # Automatically enabled in CKB 0.101+"
cmd "  # The indexer processes historical blocks on first start."
echo

echo -e "  ${BOLD}WebSocket RPC (for subscriptions)${RESET}"
cmd "  [rpc]"
cmd "  tcp_listen_address = \"127.0.0.1:18114\""
echo

# =============================================================================
header "Step 4: Start the Node"
# =============================================================================
echo

cmd "cd ${DATA_DIR}/${CHAIN}"
cmd "ckb run"
echo
info "Or run in the background:"
cmd "ckb run >> ckb.log 2>&1 &"
echo
info "To check sync progress:"
cmd "curl -s -X POST http://localhost:8114 \\"
cmd "  -H 'Content-Type: application/json' \\"
cmd "  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sync_state\",\"params\":[]}'"
echo
info "Or use this lesson's monitoring tool:"
cmd "npm start"

# =============================================================================
header "Step 5: Useful Commands"
# =============================================================================
echo

echo -e "  ${BOLD}Check node version:${RESET}"
cmd "ckb --version"
echo

echo -e "  ${BOLD}Check current block height:${RESET}"
cmd "curl -s -X POST http://localhost:8114 \\"
cmd "  -H 'Content-Type: application/json' \\"
cmd "  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"get_tip_block_number\",\"params\":[]}' \\"
cmd "  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(int(d[\"result\"],16))'"
echo

echo -e "  ${BOLD}Check peer count:${RESET}"
cmd "curl -s -X POST http://localhost:8114 \\"
cmd "  -H 'Content-Type: application/json' \\"
cmd "  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"local_node_info\",\"params\":[]}' \\"
cmd "  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(\"Connections:\", int(d[\"result\"][\"connections\"],16))'"
echo

echo -e "  ${BOLD}Stop the node:${RESET}"
cmd "kill \$(lsof -t -i:8114)  # macOS/Linux"
echo

# =============================================================================
header "Alternative: OffCKB (Instant Local Devnet)"
# =============================================================================
echo
echo "  For development and testing, OffCKB provides an instant-on"
echo "  local devnet with pre-deployed system scripts:"
echo
cmd "npx @offckb/cli@latest start"
echo
info "OffCKB features:"
info "  - No downloading or syncing required"
info "  - Produces blocks instantly (on demand)"
info "  - Pre-funded test accounts"
info "  - All system scripts pre-deployed"
info "  - Compatible RPC endpoint at http://localhost:8114"
info "  - Perfect for DApp development and testing"
echo
ok "Setup guide complete!"
echo
info "Run 'npm start' in this lesson directory to monitor your node."
echo
