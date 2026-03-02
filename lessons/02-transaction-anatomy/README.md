# Lesson 02: Transaction Anatomy

Explore the full structure of CKB transactions by fetching and dissecting real transactions from the CKB testnet.

## What You'll Learn

- How CKB transactions are structured (inputs, outputs, cell deps, header deps, witnesses)
- The consume-and-create model: input cells are destroyed, output cells are created
- How cell dependencies link scripts to their on-chain code
- How witnesses carry signatures and proof data
- How transaction fees are calculated (sum of inputs - sum of outputs)
- The full transaction lifecycle from construction to commitment

## Prerequisites

- Completed Lesson 1 (Cell Model Explorer)
- Node.js 18+ installed
- Basic TypeScript knowledge

## Quick Start

```bash
# Install dependencies
npm install

# Run the explorer
npm start

# Or run in watch mode for development
npm run dev
```

## What the Code Does

1. Connects to the CKB public testnet (Pudge)
2. Fetches the latest block and scans backwards for user transactions
3. For each transaction found, displays:
   - **Cell Dependencies**: Which on-chain cells contain the script code
   - **Header Dependencies**: Which block headers scripts need access to
   - **Inputs**: Which existing cells are being consumed, with their full details
   - **Outputs**: Which new cells are being created, with capacity and scripts
   - **Witnesses**: Signature and proof data
   - **Fee Calculation**: The difference between input and output capacities
   - **UTXO Flow Diagram**: A visual showing the consume-and-create pattern

## Transaction Structure Overview

```
┌──────────────────────────────────────────────┐
│               CKB Transaction                │
├──────────────────────────────────────────────┤
│  cell_deps[]     - referenced code/data      │
│  header_deps[]   - referenced block headers  │
│  inputs[]        - cells being consumed      │
│  outputs[]       - new cells being created   │
│  outputs_data[]  - data for each output      │
│  witnesses[]     - proofs (signatures, etc.) │
└──────────────────────────────────────────────┘
```

## Key Concepts

### Inputs and Outputs

Every CKB transaction consumes a set of input cells and creates a set of output cells. This is the fundamental state transition mechanism -- there is no "update in place." If you want to change a cell's data, you consume the old cell and create a new cell with updated contents.

### Cell Dependencies

Cells store only the *hash* of their script code. The actual executable binary lives in a separate cell on-chain. Cell deps tell the CKB-VM where to find these code cells so it can load and run the scripts during validation.

### Witnesses

Witnesses hold proof data, most commonly digital signatures. They are NOT part of the transaction hash (tx_hash), which prevents a circular dependency: you compute the hash first, sign it, then attach the signature as a witness.

### Fees

There is no "gas" on CKB. The transaction fee is simply:

```
fee = sum(input capacities) - sum(output capacities)
```

Miners collect this difference as their reward for including the transaction.

## Project Structure

```
02-transaction-anatomy/
  package.json       - Project config and dependencies
  tsconfig.json      - TypeScript configuration
  src/
    index.ts         - Main CLI application (heavily commented)
  README.md          - This file
```

## Next Steps

After understanding transaction anatomy, proceed to Lesson 3 to learn about capacity calculations and how CKB's state rent model works.
