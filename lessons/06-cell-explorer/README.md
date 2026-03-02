# Lesson 6: Exploring Cells with CCC

A hands-on CLI application for querying, filtering, and analyzing on-chain cells on the CKB (Nervos Common Knowledge Base) blockchain using the CCC SDK.

## What You Will Learn

- **Cell querying fundamentals**: How CKB indexes cells and how to search for them
- **Lock script queries**: Find all cells owned by a specific address
- **Type script queries**: Find all cells governed by a specific smart contract (e.g., Nervos DAO)
- **Capacity filtering**: Search for cells within a specific CKByte value range
- **Data pattern matching**: Find cells by their stored data (prefix, exact, or partial match)
- **Live vs dead cells**: Understand the lifecycle of cells in CKB's UTXO-like model
- **Cell classification**: Identify different types of cells (plain CKB, UDT, NFT, etc.)
- **Pagination**: Handle large result sets with cursor-based pagination
- **Statistics collection**: Aggregate data while iterating through cell collections

## Prerequisites

- Node.js 18 or later
- Basic understanding of CKB's Cell Model (see Lesson 1)
- Familiarity with TypeScript and async/await patterns

## Project Structure

```
06-cell-explorer/
  package.json        - Project configuration and dependencies
  tsconfig.json       - TypeScript compiler settings
  src/
    index.ts          - Main CLI application with all demonstrations
    utils.ts          - Helper functions for formatting output
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

The application will connect to the CKB public testnet and demonstrate various cell query techniques using a well-known testnet address.

## Key Concepts

### Cells and the CKB Indexer

CKB maintains an indexer that tracks all **live cells** (cells that exist in the current blockchain state). The indexer allows efficient queries by:

- **Lock script**: Find cells owned by a specific address/lock
- **Type script**: Find cells governed by a specific smart contract
- **Filters**: Narrow results by capacity range, data patterns, script length, etc.

### Live vs Dead Cells

| Status | Meaning | Queryable? |
|--------|---------|------------|
| **Live** | Created but not yet consumed | Yes - returned by indexer queries |
| **Dead** | Has been consumed as a transaction input | No - only in blockchain history |

### Cell Types

The explorer classifies cells based on their scripts and data:

| Classification | Lock Script | Type Script | Data | Example |
|---------------|-------------|-------------|------|---------|
| Plain CKB | Yes | No | Empty | Simple CKB holding |
| UDT Cell | Yes | Yes | 16 bytes | Token balance cell |
| Typed Data Cell | Yes | Yes | Non-empty | NFT, Spore, etc. |
| Data Cell | Yes | No | Non-empty | Arbitrary data storage |
| Script Cell | Yes | Yes | Empty | Governance/reference |

### CCC SDK Query Methods

| Method | Use Case |
|--------|----------|
| `findCellsByLock(lock, type?)` | Find cells by owner (lock script) |
| `findCellsByType(type)` | Find cells by contract (type script) |
| `findCells(searchKey)` | Advanced query with all filter options |
| `findCellsPaged(key, order, limit, cursor)` | Manual pagination |
| `getBalanceSingle(lock)` | Efficient total balance calculation |
| `getCellLive(outPoint)` | Check if a specific cell is still live |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@ckb-ccc/core` | CKB SDK for blockchain interaction |
| `tsx` | TypeScript execution without compilation |
| `typescript` | TypeScript language support |

## CKB Testnet Resources

- **Testnet Faucet**: [faucet.nervos.org](https://faucet.nervos.org) - Get free testnet CKB
- **CKB Explorer (Testnet)**: [pudge.explorer.nervos.org](https://pudge.explorer.nervos.org) - Browse testnet cells and transactions
- **CCC SDK Documentation**: [github.com/ckb-ecofund/ccc](https://github.com/ckb-ecofund/ccc)

## Troubleshooting

**No cells found**: The demo address may not have cells on testnet. Use the testnet faucet to send CKB to the address, or modify `DEMO_TESTNET_ADDRESS` in `src/index.ts` to use your own testnet address.

**Connection errors**: The public testnet RPC may occasionally be slow. The CCC SDK handles retries automatically, but if issues persist, try again after a few minutes.

**Timeout errors**: Querying cells on addresses with thousands of cells can be slow. The `MAX_CELLS_PER_QUERY` constant limits results to keep the demo responsive.
