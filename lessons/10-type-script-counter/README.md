# Lesson 10: Your First Type Script — Counter

## Overview

In this lesson, you will build your first **type script** on CKB: a counter that can only be incremented by 1 per transaction. This is the simplest meaningful state machine you can implement on-chain, and it demonstrates the core concepts that power every CKB application — from tokens to NFTs to DEXes.

You will learn:

- What type scripts are and how they differ from lock scripts
- How to write a type script in Rust using `ckb_std`
- How type scripts enforce state transition rules
- How to create, update, and destroy cells governed by a type script
- How to interact with type script cells from off-chain TypeScript code

## Prerequisites

- Completion of Lessons 1-9 (Cell Model, Transactions, Scripts, Lock Scripts, Debugging)
- Rust toolchain installed (`rustup`)
- Node.js 18+ installed
- Basic familiarity with Rust (no_std) and TypeScript

## Project Structure

```
10-type-script-counter/
├── contracts/
│   └── counter/
│       ├── Cargo.toml           # Rust crate configuration
│       └── src/
│           └── main.rs          # On-chain counter type script (Rust)
├── scripts/
│   ├── package.json             # Node.js dependencies
│   ├── tsconfig.json            # TypeScript configuration
│   └── src/
│       └── index.ts             # Off-chain interaction demo (TypeScript)
└── README.md                    # This file
```

## The Counter State Machine

The counter type script enforces three rules:

| Scenario | Condition | Rule |
|----------|-----------|------|
| **Creation** | No inputs with this type, outputs exist | Data must be `0` |
| **Update** | Both inputs and outputs have this type | Output data = Input data + 1 |
| **Destruction** | Inputs have this type, no outputs | Always allowed |

```
CREATE         UPDATE         UPDATE         UPDATE         DESTROY
  |              |              |              |              |
  v              v              v              v              v
[0] ---------> [1] ---------> [2] ---------> [3] ---------> (gone)
```

## Type Scripts vs Lock Scripts

| Aspect | Lock Script | Type Script |
|--------|-------------|-------------|
| **Purpose** | WHO can spend a cell | WHAT a cell can contain |
| **Runs when** | Cell is consumed (input only) | Cell appears in inputs OR outputs |
| **Required?** | Yes (every cell must have one) | No (optional on cells) |
| **Example** | Signature verification | Token supply conservation |
| **Analogy** | Lock on a door | Rulebook for what is inside |

## On-Chain Contract (Rust)

The Rust contract at `contracts/counter/src/main.rs` implements the counter logic:

1. **Counts cells** in `GroupInput` and `GroupOutput` (cells with the same type script)
2. **Determines the scenario** (creation, update, or destruction)
3. **Validates the state transition** according to the rules above

Key functions:
- `parse_counter(data)` — Converts 8 bytes (u64 little-endian) to a counter value
- `count_cells_in_group(source)` — Counts cells using the `IndexOutOfBound` pattern
- `main()` — The entry point that implements the state machine logic

### Building the Contract

```bash
# Install the RISC-V target (one-time setup)
rustup target add riscv64imac-unknown-none-elf

# Build the contract
cd contracts/counter
cargo build --release --target riscv64imac-unknown-none-elf
```

The compiled binary will be at `target/riscv64imac-unknown-none-elf/release/counter`.

### Error Codes

| Code | Name | Meaning |
|------|------|---------|
| 5 | `ERROR_INVALID_DATA_LENGTH` | Cell data is not exactly 8 bytes |
| 6 | `ERROR_COUNTER_NOT_ZERO_ON_CREATION` | New counter not initialized to 0 |
| 7 | `ERROR_INVALID_CELL_COUNT` | Update must be exactly 1 input -> 1 output |
| 8 | `ERROR_COUNTER_NOT_INCREMENTED` | Output counter != input counter + 1 |

## Off-Chain Interaction (TypeScript)

The TypeScript demo at `scripts/src/index.ts` walks through:

1. Connecting to the CKB testnet
2. Understanding how type scripts are referenced (code_hash, hash_type, args)
3. Building a creation transaction (counter = 0)
4. Building an increment transaction (counter + 1)
5. What happens with invalid updates (skipping, decrementing, wrong initial value)
6. Destroying a counter cell (reclaiming capacity)
7. Data encoding/decoding (u64 little-endian)
8. Querying counter cells on-chain

### Running the Demo

```bash
cd scripts
npm install
npx tsx src/index.ts
```

The demo connects to the CKB public testnet for RPC operations and prints a detailed walkthrough of all counter operations.

## Key Concepts

### Script Groups

CKB groups cells by their complete script (code_hash + hash_type + args). The type script runs once per group, not once per cell. When you use `Source::GroupInput` or `Source::GroupOutput`, you only see cells in your group.

### Cell Data as State

CKB cells store arbitrary bytes in their `data` field. The type script defines the meaning of that data and the rules for how it can change. In our counter:
- Data = 8 bytes (u64 little-endian)
- Meaning = the current counter value
- Rule = can only increase by 1

### Immutable Cells

CKB cells cannot be modified in place. To "update" a cell, you consume it (kill it) and create a new one with the updated data. The type script validates that this transition is legal.

### Capacity Requirements

A counter cell requires at least 69 CKB of capacity:
- 61 CKB base (8 bytes capacity + 32 bytes code_hash + 1 byte hash_type + 20 bytes args for lock script + type script overhead)
- 8 CKB for the counter data (8 bytes)

## Real-World Applications

The counter is a teaching example, but the same pattern powers:

- **xUDT Tokens**: Type script ensures total supply is conserved across inputs and outputs
- **Spore NFTs**: Type script ensures uniqueness and content immutability
- **Nervos DAO**: Type script enforces deposit/withdrawal rules and compensation
- **AMM DEXes**: Type script enforces the constant product formula (x * y = k)

## Further Reading

- [CKB Type Script Documentation](https://docs.nervos.org/docs/script/type-script)
- [ckb-std API Reference](https://docs.rs/ckb-std)
- [CKB Script Programming (Xuejie)](https://xuejie.space/2019_07_05_introduction_to_ckb_script_programming_type_id/)
- [RFC: CKB Transaction Structure](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md)

## What's Next

In Lesson 11, you will learn about **Molecule Serialization** — the binary encoding format used for structured data in CKB scripts. Molecule is to CKB what Protobuf is to gRPC: a compact, schema-driven serialization format optimized for on-chain verification.
