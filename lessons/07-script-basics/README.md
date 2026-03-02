# Lesson 7: Lock Scripts & Type Scripts

A hands-on CLI application that explores CKB's script system -- the mechanism that makes every cell programmable and every transaction verifiable.

## What You Will Learn

- **Script execution model**: How CKB scripts are validators (not executors) that approve or reject state transitions
- **Lock scripts**: How they enforce ownership and spending conditions, running only on input cells
- **Type scripts**: How they validate cell creation and state transitions, running on both inputs and outputs
- **Script structure**: The three fields -- code_hash, hash_type, and args -- and what each one does
- **hash_type variants**: "data", "data1", "data2" (pinned to exact binary) vs "type" (upgradeable reference)
- **Script groups**: How CKB groups cells with identical scripts for efficient batch execution
- **Cell deps**: How scripts reference their RISC-V binary code stored in regular cells
- **Built-in scripts**: SECP256K1-BLAKE160 (default lock), multisig lock, Nervos DAO, xUDT
- **Execution lifecycle**: The complete flow from transaction submission to script verification

## Prerequisites

- Node.js 18 or later
- Completion of Lessons 1-6 (Cell Model, Transactions, Cell Queries)
- Basic familiarity with TypeScript and async/await

## Project Structure

```
07-script-basics/
  package.json        - Project configuration and dependencies
  tsconfig.json       - TypeScript compiler settings
  src/
    index.ts          - Main CLI application with all demonstrations
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the explorer

```bash
npx tsx src/index.ts
```

The application connects to the CKB public testnet and walks through each concept with real on-chain data.

## Key Concepts

### Scripts Are Validators, Not Executors

Unlike Ethereum smart contracts that execute logic and produce state changes, CKB scripts are pure validators. A transaction proposes a complete state transition (old cells in, new cells out), and scripts simply return 0 (success) or non-zero (failure). If any script fails, the entire transaction is rejected.

### Lock Scripts vs Type Scripts

| Aspect | Lock Script | Type Script |
|--------|------------|-------------|
| Required? | Yes (every cell) | No (optional) |
| Runs on | Input cells only | Input AND output cells |
| Purpose | Authorization (who can spend) | State validation (how cells change) |
| Example | Signature verification | Token supply conservation |

### Script Structure

Every script has three fields:

| Field | Description | Example |
|-------|-------------|---------|
| `code_hash` | Identifies which on-chain program to run | Hash of secp256k1 script |
| `hash_type` | How code_hash references the program | "type", "data", "data1", "data2" |
| `args` | Arguments passed to the script | 20-byte pubkey hash |

### hash_type Comparison

| hash_type | code_hash references | VM Version | Upgradeable? |
|-----------|---------------------|------------|--------------|
| "data" | blake2b(cell_data) | v0 | No (pinned to binary) |
| "data1" | blake2b(cell_data) | v1 | No (pinned to binary) |
| "data2" | blake2b(cell_data) | v2 | No (pinned to binary) |
| "type" | blake2b(type_script) | v2 | Yes (via type script) |

### Script Groups

CKB groups cells with identical scripts (same code_hash + hash_type + args) and runs each script only once per group. This means spending 10 cells from the same address requires only one signature verification, not ten.

### Cell Deps

Script code is stored as data in regular cells. Cell deps in a transaction tell CKB where to find the RISC-V binary for each script. Two dep types exist:
- `code`: The cell's data IS the script binary
- `dep_group`: The cell's data contains a list of OutPoints pointing to code cells

## Common Built-in Scripts

| Script | Role | Purpose |
|--------|------|---------|
| SECP256K1-BLAKE160 | Lock | Default ownership via secp256k1 signature + blake160 hash |
| SECP256K1-BLAKE160-MULTISIG | Lock | M-of-N multisignature with optional time lock |
| Nervos DAO | Type | Built-in savings with interest from secondary issuance |
| xUDT | Type | Fungible token standard with extensible logic |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@ckb-ccc/core` | CKB SDK for blockchain interaction |
| `tsx` | TypeScript execution without compilation |
| `typescript` | TypeScript language support |

## CKB Resources

- **Testnet Explorer**: [pudge.explorer.nervos.org](https://pudge.explorer.nervos.org) -- browse scripts and cells
- **CKB Script Documentation**: [docs.nervos.org](https://docs.nervos.org)
- **CCC SDK**: [github.com/ckb-ecofund/ccc](https://github.com/ckb-ecofund/ccc)

## Troubleshooting

**No cells found**: The demo address may not have cells on testnet. Use the [testnet faucet](https://faucet.nervos.org) to fund it, or update `DEMO_TESTNET_ADDRESS` in `src/index.ts`.

**Connection errors**: The public testnet RPC may be slow at times. The CCC SDK retries automatically. If issues persist, try again after a few minutes.

**Script info not available**: Some known scripts may not be registered on all networks. The application handles these gracefully and continues execution.
