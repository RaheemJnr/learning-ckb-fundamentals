# ============================================================================
# Lesson 08: Hash Lock Script — Build Commands
# ============================================================================
#
# This Makefile provides commands for building and running both the
# on-chain Rust contract and the off-chain TypeScript interaction code.
#
# PREREQUISITES:
#
#   For the Rust contract (on-chain):
#     - Rust toolchain (rustup, cargo)
#     - CKB RISC-V target: riscv64imac-unknown-none-elf
#     - Install via: rustup target add riscv64imac-unknown-none-elf
#     - Or use ckb-script-templates for full toolchain setup
#
#   For the TypeScript scripts (off-chain):
#     - Node.js 18+
#     - npm
#
# ============================================================================

# Default target: show available commands
.PHONY: help
help:
	@echo "============================================================"
	@echo "  Lesson 08: Hash Lock Script — Build Commands"
	@echo "============================================================"
	@echo ""
	@echo "  Rust Contract (On-Chain):"
	@echo "    make build-contract    Build the hash-lock Rust contract"
	@echo "    make clean-contract    Clean Rust build artifacts"
	@echo "    make check-contract    Check contract code (no build)"
	@echo ""
	@echo "  TypeScript Scripts (Off-Chain):"
	@echo "    make install           Install TypeScript dependencies"
	@echo "    make run               Run the off-chain interaction script"
	@echo "    make dev               Run with watch mode (auto-reload)"
	@echo ""
	@echo "  Combined:"
	@echo "    make all               Build contract + install TS deps"
	@echo "    make clean             Clean all build artifacts"
	@echo ""
	@echo "  NOTE: Building the Rust contract requires the CKB RISC-V"
	@echo "  toolchain. See README.md for setup instructions."
	@echo ""

# ============================================================================
# Rust Contract Targets
# ============================================================================

# Build the hash-lock contract for the RISC-V target.
#
# This compiles the Rust code to a RISC-V binary that can run inside CKB-VM.
# The --target flag specifies the RISC-V architecture used by CKB.
#
# The resulting binary will be at:
#   contracts/hash-lock/target/riscv64imac-unknown-none-elf/release/hash-lock
#
# NOTE: This requires the riscv64imac-unknown-none-elf target to be installed:
#   rustup target add riscv64imac-unknown-none-elf
.PHONY: build-contract
build-contract:
	@echo "Building hash-lock contract for CKB RISC-V target..."
	cd contracts/hash-lock && \
		cargo build --release --target riscv64imac-unknown-none-elf
	@echo ""
	@echo "Build complete! Binary at:"
	@echo "  contracts/hash-lock/target/riscv64imac-unknown-none-elf/release/hash-lock"

# Check the Rust contract code without building.
# Useful for quick syntax/type checking during development.
.PHONY: check-contract
check-contract:
	@echo "Checking hash-lock contract..."
	cd contracts/hash-lock && \
		cargo check --target riscv64imac-unknown-none-elf
	@echo "Check passed!"

# Clean Rust build artifacts.
.PHONY: clean-contract
clean-contract:
	@echo "Cleaning Rust build artifacts..."
	cd contracts/hash-lock && cargo clean
	@echo "Clean complete."

# ============================================================================
# TypeScript Script Targets
# ============================================================================

# Install TypeScript dependencies for the off-chain scripts.
.PHONY: install
install:
	@echo "Installing TypeScript dependencies..."
	cd scripts && npm install
	@echo "Install complete."

# Run the off-chain interaction script.
# This demonstrates hash computation, transaction construction, etc.
.PHONY: run
run:
	@echo "Running hash-lock interaction script..."
	cd scripts && npx tsx src/index.ts

# Run the off-chain script in watch mode.
# The script will automatically re-run when source files change.
.PHONY: dev
dev:
	cd scripts && npx tsx --watch src/index.ts

# ============================================================================
# Combined Targets
# ============================================================================

# Build everything: contract + TypeScript dependencies.
.PHONY: all
all: build-contract install
	@echo ""
	@echo "All components built successfully!"
	@echo "Run 'make run' to execute the off-chain script."

# Clean all build artifacts.
.PHONY: clean
clean: clean-contract
	@echo "Cleaning TypeScript artifacts..."
	rm -rf scripts/node_modules scripts/dist
	@echo "All clean."
