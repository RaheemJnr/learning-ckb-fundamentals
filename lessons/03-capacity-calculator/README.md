# Lesson 03: CKB Capacity Calculator & Tokenomics

## Overview

This project is a CLI-based capacity calculator that teaches you the economics of CKB storage and the broader tokenomics model. You will learn how CKBytes serve a dual purpose as both a native cryptocurrency and a unit of on-chain storage, how to calculate the exact CKByte cost for storing any data on-chain, and how CKB's issuance and Nervos DAO mechanisms work together to create a sustainable economic model.

## What You Will Learn

1. **CKByte Dual Purpose** - 1 CKByte = 1 byte of on-chain storage
2. **Capacity Calculation** - The formula for determining how many CKBytes a cell requires
3. **Minimum Cell Capacity** - Why 61 CKBytes is the minimum for any cell
4. **Primary Issuance** - The 33.6 billion hard cap with Bitcoin-like halving
5. **Secondary Issuance** - The perpetual 1.344 billion CKBytes/year as state rent
6. **Nervos DAO** - How depositors are shielded from inflation
7. **Economic Comparison** - CKB capacity model vs Ethereum gas model

## Prerequisites

- Completion of Lesson 01 (Cell Model Explorer) and Lesson 02 (Transaction Anatomy)
- Node.js v18+ installed
- Basic TypeScript/JavaScript knowledge

## Project Structure

```
03-capacity-calculator/
  package.json        # Project dependencies and scripts
  tsconfig.json       # TypeScript configuration
  src/
    index.ts          # Main CLI calculator (heavily commented)
  README.md           # This file
```

## Getting Started

### Install Dependencies

```bash
cd lessons/03-capacity-calculator
npm install
```

### Run the Calculator

```bash
npm start
# or directly:
npx tsx src/index.ts
```

## Key Concepts

### The Capacity Formula

Every CKB cell must satisfy this constraint:

```
capacity_value >= total_cell_size_in_bytes
```

Where `total_cell_size_in_bytes` is calculated as:

```
Total = 8 (capacity field)
      + lock_script_size (code_hash: 32 + hash_type: 1 + args: variable)
      + type_script_size (optional: code_hash: 32 + hash_type: 1 + args: variable)
      + data_size
```

### Minimum Cell: 61 CKBytes

A cell with no data and no type script (using the default SECP256K1-BLAKE160 lock):

- Capacity field: 8 bytes
- Lock script: 32 (code_hash) + 1 (hash_type) + 20 (args) = 53 bytes
- **Total: 61 bytes = 61 CKBytes**

### Issuance Model

| Issuance Type | Amount | Schedule | Purpose |
|---|---|---|---|
| Primary | 33.6B CKB total | Halves every ~4 years | Miner block rewards |
| Secondary | 1.344B CKB/year | Perpetual (never stops) | State rent + DAO compensation |

### Nervos DAO

Deposit CKBytes in the Nervos DAO to receive a proportional share of secondary issuance, effectively canceling out inflation for holders who do not occupy state.

## Examples in the Calculator

1. **Minimal Cell** - 61 CKBytes (the absolute minimum)
2. **32-Byte Hash Storage** - 93 CKBytes (for anchoring a hash on-chain)
3. **Token Cell (xUDT)** - 130-142 CKBytes (for holding fungible tokens)
4. **1 KB Data Cell** - 1,085+ CKBytes (for storing larger data blobs)
5. **Nervos DAO Deposit** - 122 CKBytes (minimum DAO deposit cell)

## Related Resources

- [CKB Tokenomics RFC](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0015-ckb-cryptoeconomics/0015-ckb-cryptoeconomics.md)
- [Nervos DAO RFC](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0023-dao-deposit-withdraw/0023-dao-deposit-withdraw.md)
- [CKB Cell Model Documentation](https://docs.nervos.org/docs/tech-explanation/cell-model)
- [CCC SDK](https://github.com/nickliu-ckb/ccc)

## What's Next

In Lesson 04, you will set up your local CKB development environment with devnet, the CCC SDK, and essential tooling.
