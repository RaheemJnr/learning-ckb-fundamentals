# Lesson 01: Cell Model Explorer

Explore the fundamental building block of Nervos CKB: the **Cell**. This program connects to the CKB Testnet, fetches live cells, and displays their structure in a readable, educational format.

## What You'll Learn

- What a CKB cell is and why it matters
- The 4 fields of every cell: **capacity**, **data**, **lock script**, and **type script**
- How capacity works as both value and storage limit
- The difference between cells with and without type scripts
- How CKB's Cell Model compares to Bitcoin's UTXO Model and Ethereum's Account Model
- How to use the CCC SDK (`@ckb-ccc/core`) to query the CKB blockchain

## Prerequisites

- **Node.js** v18 or later installed on your machine
- **npm** (comes with Node.js)
- Basic understanding of blockchain concepts (blocks, transactions, addresses)
- No CKB-specific knowledge required — this is the first lesson!

## How to Run

```bash
# 1. Install dependencies
npm install

# 2. Run the explorer
npm start

# Or, for development mode with auto-reload:
npm run dev
```

## Expected Output

When you run the program, you'll see:

1. **Connection info** — Confirms we're connected to CKB Testnet and shows the current block height.

2. **Live cells** — Up to 5 cells displayed with full details:
   - **Capacity**: How many CKBytes the cell holds (and its max storage size).
   - **Data**: The raw hex data stored in the cell (often empty for plain CKB cells).
   - **Lock Script**: The script that controls who can spend this cell (code_hash, hash_type, args).
   - **Type Script**: The optional script that defines validation rules (or "none" if absent).

3. **Summary** — Total cells found, total capacity, and how many have type scripts.

4. **Minimum Capacity Examples** — Shows how to calculate the minimum CKBytes needed for different cell configurations.

5. **Comparison Table** — Side-by-side comparison of CKB Cells, Bitcoin UTXOs, and Ethereum Accounts.

6. **Key Concepts Recap** — A quick review of everything you learned.

## Key Concepts

### The Cell Model

A cell is like a "box" on the blockchain. Every piece of data on CKB lives inside a cell.

```
┌─────────────────────────────────────────────────┐
│                    CELL                          │
│                                                  │
│  capacity:  500 CKB (= max 500 bytes on-chain) │
│  data:      0x48656c6c6f (arbitrary bytes)       │
│  lock:      { codeHash, hashType, args }         │
│  type:      { codeHash, hashType, args } | null  │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Capacity = Value + Storage Limit

Unlike other blockchains, CKB ties the token value directly to storage space:
- **1 CKByte = 1 byte** of on-chain storage
- A cell's capacity must be >= its total serialized size
- This prevents blockchain bloat and creates a natural "state rent" mechanism

### Lock Script = Ownership

The lock script determines who can spend (consume) a cell. The most common lock script uses SECP256K1 signatures, similar to Bitcoin.

### Type Script = Validation Rules

The type script is optional. When present, it enforces rules about how the cell can be created, updated, or destroyed. This is how tokens (xUDT), NFTs (Spore), and other programmable assets work.

### Consume and Create

Cells are never modified in place. To "update" a cell, a transaction consumes (destroys) the old cell and creates a new one with the updated data. This is the UTXO pattern, generalized.

## Project Structure

```
01-cell-model-explorer/
  package.json        # Dependencies and scripts
  tsconfig.json       # TypeScript configuration
  README.md           # This file
  src/
    index.ts          # Main program (heavily commented)
```

## Troubleshooting

- **"Cannot find module '@ckb-ccc/core'"** — Run `npm install` first.
- **"Connection refused" or timeouts** — The testnet RPC endpoint might be temporarily down. Try again in a few minutes.
- **No cells found** — The testnet address we query might have been drained. The program still explains all concepts even with zero cells.

## Next Lesson

In **Lesson 2: Transaction Anatomy**, you'll learn how transactions consume and create cells to form state transitions on CKB.
