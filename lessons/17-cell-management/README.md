# Lesson 17: Advanced Cell Management

## Overview

CKB's Cell Model is analogous to Bitcoin's UTXO model: every unit of value lives in a discrete cell. Over time, normal usage creates many small cells — a phenomenon called cell fragmentation. This lesson covers the full spectrum of cell management: understanding capacity requirements, consolidating fragmented cells, splitting large cells for parallelism, handling dust cells, selecting cells for transactions, and reserving cells for dApp operations.

## What You Will Learn

- How cell capacity is calculated (minimum capacity = sum of all field sizes in bytes)
- Why cell fragmentation happens and its performance/fee consequences
- Consolidation strategies: batching small cells into large ones
- Splitting strategies: breaking large cells for parallel transaction submission
- Dust cells: what they are, why they form, and how to sweep them
- Cell selection algorithms (smallest-first, largest-first, best-fit)
- Cell reservation patterns for wallets and dApps
- The "input selection problem" and how it compares to Bitcoin UTXO selection

## Prerequisites

- Completion of Lessons 1-16
- Understanding of the CKB Cell Model (Lesson 1)
- Node.js 18+
- Basic familiarity with BigInt arithmetic in JavaScript/TypeScript

## Project Structure

```
17-cell-management/
├── src/
│   └── index.ts      # TypeScript CLI demonstrating all cell management patterns
├── package.json
├── tsconfig.json
└── README.md
```

## Quick Start

```bash
npm install
npm start
```

## Minimum Cell Capacity

A CKB cell's capacity field must be at least as large as the total bytes the cell occupies on-chain:

```
Field           | Size (bytes)
────────────────┼─────────────
capacity        | 8
lock.code_hash  | 32
lock.hash_type  | 1
lock.args       | variable (20 for secp256k1-blake160)
type.code_hash  | 32 (if type script present)
type.hash_type  | 1  (if type script present)
type.args       | variable (if type script present)
data            | variable
────────────────┼─────────────
MINIMUM         | 61 bytes = 61 CKB (no type, no data)
```

1 byte of occupied size = 1 CKB minimum capacity = 10^8 shannon.

## Cell Fragmentation

Fragmentation occurs when a wallet accumulates many small cells instead of few large ones:

**Causes:**
- Receiving many small payments (each creates a new output cell)
- Change cells from transactions (each tx creates a change cell)
- Token airdrops (one cell per recipient per token type)
- dApp interactions that split cells as part of their protocol

**Consequences:**
- Larger transactions (more inputs = larger serialized tx = higher fees)
- Slower balance queries (more cells to scan via RPC)
- Type script overhead (scripts that iterate inputs are slower with many cells)

## Consolidation

Merge many small cells into fewer large cells:

```
Before: 100 cells × 200 CKB = 20,000 CKB
After:  1 cell × ~19,990 CKB (minus fees)
```

**Batch limit:** CKB transactions have a size limit (~512 KB). Consolidate in batches of 100-200 inputs per transaction.

**Multi-round strategy for 1000+ cells:**
- Round 1: Merge 200 cells → 1 cell (repeat 5 times) = 5 large cells
- Round 2: Merge 5 large cells → 1 final cell
- Total: 6 transactions

## Splitting for Parallelism

CKB's UTXO model allows parallel transaction submission when transactions spend different cells:

```
1 large cell (10,000 CKB)
    -> 5 cells × 2,000 CKB each
    -> 5 parallel transactions possible simultaneously
```

Ethereum's account model serializes all transactions by nonce. CKB has no such constraint — different cells can be spent in different transactions submitted in the same block.

**Use cases:**
- High-frequency trading bots
- dApps serving many users from a shared treasury
- Pre-split token distributions

## Dust Cells

A dust cell is one at or below minimum capacity (61 CKB). All its capacity pays for the cell's structural overhead — none is "free" value.

**Subeconomic dust:** A cell where spending it costs more (in fees) than the excess capacity recovered.

**Cleanup strategy:**
1. Include dust cells as inputs alongside larger cells in regular transactions
2. The larger cell covers the fee; dust capacity is recovered as change
3. Batch 50+ dust cells together to amortize the transaction base fee

## Cell Selection Strategies

| Strategy | How It Works | Best For |
|----------|-------------|---------|
| Smallest first | Pick smallest cells until sum >= target | Reducing fragmentation over time |
| Largest first | Pick largest cells first | Minimizing input count (lower fees) |
| Best fit | Pick cell(s) closest to target value | Minimizing change, avoiding dust |
| Branch and bound | Exhaustive optimal search | Maximum fee efficiency |

## dApp Cell Reservation

**Operational pool:** Maintain 10-20 medium cells (100 CKB each) for fee payments. Each transaction spends one operational cell. Replenish from treasury periodically.

**Protocol cell isolation:** Use a separate lock key for state cells. Mark them with sentinel type scripts. Never include protocol cells in fee-payment input selection.

**Throughput planning:**
```
reserved_cells >= peak_txs_per_block
```

**Important:** Never mix typed cells (xUDT, Spore) with plain CKB cells in fee payment selection. Typed cells trigger their type scripts when spent, adding overhead and constraints.

## Optimal Cell Size

Calculation for a target fee ratio:
```
optimal_capacity > (fee_to_spend / fee_tolerance) + minimum_capacity
```

At 0.1% tolerance: ~71 CKB minimum
At 0.5% tolerance: ~81 CKB minimum
At 1.0% tolerance: ~71 CKB minimum

**Practical guidelines:**
- Below 61 CKB: impossible (below minimum)
- 61-100 CKB: protocol cells only
- 100-500 CKB: small, accept moderate fragmentation
- 500-5000 CKB: medium, good general-purpose size
- 5000+ CKB: large, split for parallel use if needed

## CKB vs Bitcoin UTXO Input Selection

| Property | CKB | Bitcoin |
|----------|-----|---------|
| Minimum unit size | 61 bytes = 61 CKB | Dust threshold in satoshis |
| Fee model | Capacity-based (state rent) | Byte-size-based |
| Script execution overhead | CKB-VM instructions | Script byte size |
| Parallel spending | Natural (UTXO model) | Natural (UTXO model) |
| Fragmentation causes | Same as Bitcoin + typed cell splits | Change + received payments |
| Consolidation timing | Any time (no mempool ordering) | Same |

## Key Concepts

- **Fragmentation**: Having many small cells when fewer large cells would suffice
- **Consolidation**: Merging cells to reduce count and improve fee efficiency
- **Splitting**: Dividing cells to enable parallel transaction submission
- **Dust cell**: A cell at or below minimum capacity with no spendable excess
- **Subeconomic cell**: A cell where the fee to spend exceeds the excess capacity
- **Cell reservation**: Keeping specific cells available for specific operational purposes
- **Input selection problem**: Choosing which cells to spend to satisfy a transaction's capacity needs

## Further Reading

- [CKB Cell Model](https://docs.nervos.org/docs/tech-explanation/cell-model)
- [Bitcoin UTXO Selection (comparison)](https://bitcoin.stackexchange.com/questions/32145/what-is-the-minimum-transaction-fee)
- [CKB Transaction Fee Estimation](https://docs.nervos.org/docs/wallets/transaction-fee)
