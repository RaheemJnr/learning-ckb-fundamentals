# Lesson 08: Your First Lock Script (Rust) — Hash Lock

Write, understand, and interact with a custom CKB lock script that implements hash-based cell locking.

## What You'll Learn

- How on-chain scripts work on CKB (Rust source code compiled to RISC-V binary, deployed as cell data)
- How to write a lock script in Rust using the `ckb-std` library
- How CKB-VM executes scripts and what syscalls are available
- How blake2b hashing works both on-chain (Rust) and off-chain (TypeScript)
- How to deploy a custom script to the CKB network
- How to create cells locked with a custom lock script
- How to unlock (spend) cells by providing the correct witness data
- The full lifecycle of a hash-lock: setup, lock, unlock

## What Is a Hash Lock?

A hash lock is a mechanism where a cell can only be consumed (spent) if the spender provides a **preimage** — a secret value whose cryptographic hash matches a hash stored in the cell's lock script args.

**The concept is simple:**

1. **Lock**: Alice picks a secret value (the preimage), computes its blake2b hash, and creates a cell with that hash in the lock script args.
2. **Unlock**: To spend the cell, someone must provide the original preimage in the transaction witness. The on-chain script hashes the provided preimage and checks that it matches the stored hash.

**Why is this useful?**

- **Atomic swaps**: Two parties on different chains can exchange assets trustlessly using hash locks (HTLCs — Hash Time-Locked Contracts).
- **Payment channels**: Hash locks are a building block for off-chain payment networks.
- **Secret sharing**: A cell can be created that anyone with the secret can claim.
- **Educational**: Hash locks demonstrate the fundamentals of CKB script development without the complexity of signature verification.

## Project Structure

```
08-hash-lock-script/
├── contracts/                 # On-chain code (Rust)
│   └── hash-lock/
│       ├── Cargo.toml         # Rust crate configuration (targets RISC-V)
│       └── src/
│           └── main.rs        # The hash-lock script implementation
├── scripts/                   # Off-chain code (TypeScript)
│   ├── package.json           # Node.js project configuration
│   ├── tsconfig.json          # TypeScript compiler settings
│   └── src/
│       └── index.ts           # Deployment and interaction demonstration
├── Makefile                   # Build and run commands
└── README.md                 # This file
```

## Prerequisites

1. **Previous Lessons**: Complete Lessons 1-7 to understand cells, transactions, scripts, and the CCC SDK.
2. **Node.js 18+**: Required for the TypeScript off-chain code.
3. **Rust Toolchain** (optional): Required only if you want to compile the on-chain script. See "Setting Up the RISC-V Toolchain" below.

## How On-Chain Scripts Work

Understanding the journey from Rust source code to running on CKB:

### 1. Write (Rust)

CKB scripts are written in Rust (or C) using the `ckb-std` library. The script is a `#![no_std]` program — it runs in a bare-metal environment with no operating system, no filesystem, and no network. Instead of `fn main()`, it uses the `entry!()` macro to define the entry point.

The script communicates with CKB-VM through **syscalls** provided by `ckb-std`:
- `load_script()` — Load the currently executing script (to read args)
- `load_witness()` — Load witness data from the transaction
- `load_cell_data()` — Load data from input/output cells
- `load_input()` — Load input cell references

The script returns `0` for success (approve the transaction) or a non-zero error code for failure (reject the transaction).

### 2. Compile (RISC-V)

The Rust code is compiled to the `riscv64imac-unknown-none-elf` target — the RISC-V instruction set used by CKB-VM. The resulting binary is a small, self-contained ELF executable.

```bash
cargo build --release --target riscv64imac-unknown-none-elf
```

### 3. Deploy (On-Chain)

The compiled binary is deployed to CKB by creating a cell whose **data** field contains the binary. This is called a "code cell." There is nothing special about this transaction — it is just a regular CKB transaction that creates a cell with specific data.

### 4. Reference (Lock/Type Script)

Other cells reference the deployed script through their lock or type script:
- `code_hash`: blake2b hash of the deployed binary (or of a type script)
- `hash_type`: `"data1"` (hash of binary data) or `"type"` (hash of type script)
- `args`: Arbitrary data passed to the script (in our case, the expected hash)

### 5. Execute (CKB-VM)

When a transaction tries to consume a cell, CKB-VM loads and executes the cell's lock script. The script runs in a sandboxed RISC-V virtual machine with metered execution (cycle counting). If the script returns `0`, the input is authorized for spending.

## The Rust Code Walkthrough

The hash-lock script in `contracts/hash-lock/src/main.rs` does the following:

```
1. Load the script args (expected hash)     → load_script()
2. Validate args length (must be 32 bytes)  → Length check
3. Load the preimage from witness           → load_witness()
4. Validate preimage is not empty           → Length check
5. Compute blake2b_256(preimage)            → blake2b hasher
6. Compare computed hash with expected hash → Byte comparison
7. Return 0 (match) or error code (mismatch)
```

**Error Codes:**
| Code | Name | Meaning |
|------|------|---------|
| 0 | SUCCESS | Preimage matches — transaction approved |
| 5 | ERROR_INVALID_ARGS_LENGTH | Script args is not 32 bytes |
| 6 | ERROR_NO_WITNESS | No witness provided |
| 7 | ERROR_EMPTY_PREIMAGE | Witness is empty (zero bytes) |
| 8 | ERROR_HASH_MISMATCH | blake2b(preimage) does not match expected hash |

## The TypeScript Code Walkthrough

The off-chain script in `scripts/src/index.ts` demonstrates:

1. **Off-chain hashing**: Computing the blake2b-256 hash of a preimage using the CCC SDK, matching the on-chain computation.
2. **Script construction**: Building a CKB Script object with `code_hash`, `hash_type`, and `args`.
3. **Deployment transaction**: How to create a cell containing the compiled binary.
4. **Lock transaction**: How to create a cell locked with the hash-lock script.
5. **Unlock transaction**: How to consume the locked cell by providing the preimage as a witness.
6. **Failed unlock**: What happens when someone provides the wrong preimage.
7. **Cell dependencies**: How transactions reference deployed script code.

## Running the Off-Chain Script

### Install Dependencies

```bash
cd lessons/08-hash-lock-script/scripts
npm install
```

### Run the Demonstration

```bash
npm start
```

Or from the lesson root:

```bash
make install
make run
```

The script will demonstrate hash computation, transaction construction patterns, and the verification logic — all without requiring a compiled binary or running devnet.

## Setting Up the RISC-V Toolchain

To compile the Rust contract and run the full end-to-end flow, you need the CKB RISC-V toolchain.

### Option 1: Using ckb-script-templates (Recommended)

The CKB team provides project templates with pre-configured toolchain setup:

```bash
# Install the CKB script template tool
cargo install ckb-script-templates

# Create a new project (for reference — our lesson already has the code)
ckb-script-templates init my-scripts

# The template includes:
# - Pre-configured Cargo.toml with RISC-V target
# - Makefile for building scripts
# - Test infrastructure
```

### Option 2: Manual Setup

```bash
# 1. Install the RISC-V target
rustup target add riscv64imac-unknown-none-elf

# 2. Build the contract
cd lessons/08-hash-lock-script/contracts/hash-lock
cargo build --release --target riscv64imac-unknown-none-elf

# The binary will be at:
# target/riscv64imac-unknown-none-elf/release/hash-lock
```

### Option 3: Using Capsule (Legacy)

Capsule is the older CKB contract development framework:

```bash
# Install Capsule
cargo install ckb-capsule

# Capsule manages the full lifecycle:
# - Project scaffolding
# - Compilation
# - Testing
# - Deployment
```

## Running the Full End-to-End Flow

To run the complete flow (compile, deploy, lock, unlock), you need a local CKB devnet:

```bash
# 1. Install CKB
# Download from: https://github.com/nervosnetwork/ckb/releases

# 2. Initialize a devnet
ckb init --chain dev -C /tmp/ckb-devnet

# 3. Start the devnet
ckb run -C /tmp/ckb-devnet

# 4. Start the miner (in a separate terminal)
ckb miner -C /tmp/ckb-devnet

# 5. Build the contract
make build-contract

# 6. Install TypeScript dependencies
make install

# 7. Update scripts/src/index.ts to:
#    - Connect to localhost:8114 (devnet)
#    - Read the compiled binary
#    - Execute actual transactions

# 8. Run the script
make run
```

## Expected Output (Off-Chain Demonstration)

```
========================================================================
  Lesson 08: Hash Lock Script — Off-Chain Interaction
========================================================================

------------------------------------------------------------------------
  PHASE 1: Computing the Hash Lock Off-Chain
------------------------------------------------------------------------

  Secret preimage (string): "ckb-hash-lock-lesson-08-secret"
  Secret preimage (hex):    0x636b622d686173682d6c6f636b2d6c6573736f6e2d30382d736563726574
  Preimage length:          30 bytes

  blake2b-256 hash:         0x<32-byte-hash>
  Hash length:              32 bytes (256 bits)

  This hash will be stored in the lock script args.
  Anyone with the preimage can unlock the cell.

  Verification (same input -> same output): PASS
  Different input -> different hash:         PASS

  ...

  [Phases 2-7 show connection, deployment, locking, unlocking, and error handling]
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Lock Script** | The script that controls who can spend a cell. Returns 0 for success. |
| **Hash Lock** | A lock that requires a preimage whose hash matches the script args. |
| **Preimage** | The secret value that, when hashed, produces the expected hash. |
| **blake2b-256** | CKB's standard hash function (with "ckb-default-hash" personalization). |
| **CKB-VM** | The RISC-V virtual machine that executes on-chain scripts. |
| **ckb-std** | The Rust standard library for CKB script development. |
| **Syscalls** | Functions that let scripts read transaction data (load_script, load_witness). |
| **Code Cell** | A cell whose data contains a compiled script binary. |
| **code_hash** | A hash that identifies which script code to execute. |
| **hash_type** | How to interpret code_hash ("data1" = hash of data, "type" = hash of type script). |
| **Cell Deps** | Transaction field that tells CKB where to find script code. |
| **Witnesses** | Transaction field for proofs, signatures, or other script-specific data. |

## Troubleshooting

### RISC-V Compilation Errors

If `cargo build --target riscv64imac-unknown-none-elf` fails:
- Ensure you have added the target: `rustup target add riscv64imac-unknown-none-elf`
- Check that `ckb-std` version in `Cargo.toml` is compatible with your Rust version
- Try using the nightly toolchain: `rustup default nightly`

### TypeScript Script Errors

- Run `npm install` in the `scripts/` directory first
- Ensure Node.js 18+ is installed
- The off-chain script does not require a running CKB node for the demonstration

### Understanding Error Codes

When a transaction is rejected, the CKB node will report the exit code of the failing script. Use the error code table above to diagnose the issue.

## Security Considerations

- **Preimage secrecy**: Anyone who learns the preimage can spend the hash-locked cell. Keep the preimage secret until you want the cell to be spent.
- **Hash function**: The security of the hash lock depends entirely on the cryptographic strength of blake2b. It is computationally infeasible to find a preimage given only the hash.
- **Empty preimage**: Our script explicitly rejects empty preimages. The blake2b hash of empty input is a known constant, so accepting it would be insecure.
- **No replay protection**: This simple hash lock does not prevent the preimage from being observed once revealed. In production, combine with time locks or signature verification.

## Next Steps

After completing this lesson, you are ready to:
- Debug CKB scripts using the CKB debugger (Lesson 9)
- Build type scripts for state validation (Lesson 10)
- Explore more complex script patterns like multi-sig and time locks
