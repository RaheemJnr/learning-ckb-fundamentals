# Lesson 9: Debugging CKB Scripts

## Overview

Debugging CKB scripts is fundamentally different from debugging traditional applications. CKB scripts run inside a deterministic RISC-V virtual machine (CKB-VM) with no network access, no filesystem, and no standard output. When something goes wrong, you get an exit code — and that is all.

This lesson teaches you the tools, techniques, and methodology for finding and fixing bugs in CKB on-chain scripts. You will work with an intentionally buggy lock script containing 4 common mistakes, learn to use CKB-Debugger, and build a mental model for systematic debugging.

## What You Will Learn

1. **Error Code Interpretation**: Distinguish between VM-level errors (negative codes from CKB-VM) and script-level errors (positive codes from your script)
2. **CKB-Debugger**: Install and use the debugger to run scripts locally against mock transactions
3. **ckb_debug! Macro**: Add print-style debugging to scripts that outputs to stderr under the debugger
4. **Debugging Methodology**: A 5-step process — Read the Error, Reproduce Locally, Add Debug Prints, Isolate the Bug, Fix and Verify
5. **Common Bug Patterns**: Off-by-one errors, wrong indices, incorrect comparison lengths, missing error returns
6. **Testing Strategies**: Positive tests, negative tests, boundary tests, and index tests

## Prerequisites

- Completion of Lesson 7 (Script Basics) and Lesson 8 (Hash Lock Script)
- Node.js 18+ installed
- Rust toolchain (for reading and modifying the script source code)
- Basic familiarity with CKB transaction structure

## Project Structure

```
09-script-debugging/
├── contracts/
│   ├── buggy-lock/              # Intentionally buggy lock script
│   │   ├── Cargo.toml
│   │   └── src/main.rs          # 4 bugs to find and fix
│   └── fixed-lock/              # Corrected version with explanations
│       ├── Cargo.toml
│       └── src/main.rs          # Each fix annotated with comments
├── scripts/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # Main debugging walkthrough
│       └── error-guide.ts       # Complete CKB error code reference
└── README.md                    # This file
```

## Getting Started

### 1. Install Dependencies

```bash
cd scripts
npm install
```

### 2. Run the Debugging Walkthrough

```bash
npm start
# or: npx tsx src/index.ts
```

This walks through:
- CKB-VM error codes and what they mean
- The 5-step debugging methodology
- CKB-Debugger command reference
- How to read error output from failed transactions
- The ckb_debug! macro for print debugging
- A walkthrough of all 4 bugs in the buggy-lock script
- Testing strategies for CKB scripts

### 3. Run the Error Code Reference

```bash
npm run errors
# or: npx tsx src/error-guide.ts
```

This prints a comprehensive reference of:
- VM syscall error codes (-1 through -8)
- Node transaction verification errors (-301 through -312)
- Well-known script error codes (secp256k1-blake160, Nervos DAO, xUDT)
- Best practices for defining custom error codes

### 4. Study the Buggy Lock Script

Open `contracts/buggy-lock/src/main.rs` and try to find all 4 bugs:

| Bug | Category | Hint |
|-----|----------|------|
| #1 | Off-by-one | Look at how args are sliced |
| #2 | Wrong index | Look at the witness loading |
| #3 | Wrong length | Look at the comparison loop |
| #4 | Missing return | Look at what happens when the hash does not match |

### 5. Check Your Answers

Open `contracts/fixed-lock/src/main.rs` to see the corrected version with detailed comments explaining each fix.

## Installing CKB-Debugger

CKB-Debugger is a command-line tool for running CKB scripts locally against mock transactions.

### From Cargo (Rust)

```bash
cargo install ckb-debugger
```

### From GitHub Releases

Download a prebuilt binary from:
https://github.com/nervosnetwork/ckb-standalone-debugger/releases

### Basic Usage

```bash
# Run a lock script from a mock transaction
ckb-debugger \
  --tx-file tx.json \
  --script-group-type lock \
  --cell-index 0

# Run with a local debug build of the script
ckb-debugger \
  --tx-file tx.json \
  --script-group-type lock \
  --cell-index 0 \
  --bin ./target/riscv64imac-unknown-none-elf/debug/my-lock-script

# Run with debug output enabled
ckb-debugger \
  --tx-file tx.json \
  --script-group-type lock \
  --cell-index 0 \
  --bin ./build/debug/my-script \
  --max-cycles 70000000
```

## The 4 Bugs — Quick Summary

### Bug #1: Off-by-one in Args Reading

**Buggy:** `let expected_hash = &args[1..BLAKE2B_HASH_LEN + 1];`
**Fixed:** `let expected_hash = &args[0..BLAKE2B_HASH_LEN];`

The buggy version starts reading at index 1 instead of 0, skipping the first byte and reading one byte past the intended range.

### Bug #2: Wrong Witness Index

**Buggy:** `load_witness(1, Source::Input)`
**Fixed:** `load_witness(0, Source::Input)`

The buggy version loads the witness at index 1, but the first input's witness is at index 0.

### Bug #3: Incorrect Hash Comparison Length

**Buggy:** `let compare_len = 20;`
**Fixed:** `let compare_len = BLAKE2B_HASH_LEN; // 32`

The buggy version only compares 20 of 32 bytes, reducing hash security from 256 bits to 160 bits.

### Bug #4: Missing Error Code Return

**Buggy:** Returns `0` (success) even when the hash does not match
**Fixed:** Returns `ERROR_HASH_MISMATCH` (3) when the hash comparison fails

The buggy version always returns success, making it an "anyone can spend" lock.

## Debugging Methodology

1. **Read the Error** — Identify the failing script and its exit code
2. **Reproduce Locally** — Dump the transaction to JSON, run with CKB-Debugger
3. **Add Debug Prints** — Insert `ckb_debug!()` calls at key decision points
4. **Isolate the Bug** — Narrow down to the specific line causing the issue
5. **Fix and Verify** — Apply the fix, test both success and failure cases

## Common Error Codes Quick Reference

| Code | Name | Most Likely Cause |
|------|------|-------------------|
| -1 | INDEX_OUT_OF_BOUND | Wrong witness/input/output index |
| -2 | ITEM_MISSING | Accessing optional field that is None |
| -3 | SLICE_OUT_OF_BOUND | Reading past end of data |
| -4 | WRONG_FORMAT | Bad molecule encoding in witness |
| -5 | UNKNOWN_SYSCALL | Script built for wrong CKB version |
| -302 | TransactionFailedToVerify | Script returned non-zero exit code |

## Key Takeaways

- Always test failure cases, not just the happy path
- CKB-Debugger is essential for local script development and debugging
- Use distinct error codes for every failure mode in your scripts
- `ckb_debug!` is low-cost and invaluable for tracing execution
- Determinism is a feature: the same inputs always produce the same output
- The most dangerous bugs are the ones where the script succeeds when it should fail
