/**
 * Lesson 17: Advanced Cell Management
 *
 * CKB's Cell Model is analogous to Bitcoin's UTXO model: every unit of value
 * lives in a discrete "cell" (like a coin). Over time, normal usage creates
 * many small cells — a phenomenon called "cell fragmentation." Managing cells
 * efficiently is essential for wallets, dApps, and high-throughput applications.
 *
 * TOPICS COVERED:
 *   1. Cell fragmentation — why it happens and why it matters
 *   2. Cell consolidation — merging many small cells into fewer large ones
 *   3. Cell splitting — breaking a large cell for parallel spending
 *   4. Optimal cell size calculation
 *   5. Dust cells — cells too small to justify spending
 *   6. Cell collection strategies for transaction building
 *   7. Cell reservation for dApps
 *
 * THE CORE TENSION:
 *   - More cells = more parallelism (multiple txs spend different cells)
 *   - Fewer cells = less overhead (fewer inputs in each transaction)
 *   - Too-small cells = dust (spend cost exceeds value recovered)
 *   - Too-large cells = lock-up (all value in one cell = one spendable unit)
 *
 * The right strategy depends on your usage pattern.
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================
// SECTION 1: Understanding Cell Capacity and Overhead
// ============================================================
//
// Every CKB cell occupies chain state. The capacity field measures how
// much state the cell uses, in shannon (1 CKB = 10^8 shannon).
//
// MINIMUM CELL CAPACITY:
// A cell's capacity must be at least as large as the bytes it occupies:
//
//   8 bytes  : capacity field itself
//   53 bytes : lock script (standard secp256k1-blake160)
//              - 32 bytes code_hash
//              - 1 byte hash_type
//              - 20 bytes args (pubkey hash)
//   --------
//   61 bytes minimum for a no-data cell with standard lock
//
// So 61 shannon minimum? No — capacity is measured in CKB (1 CKB = 10^8 shannon),
// but the FORMULA is: capacity (bytes) >= total_cell_size (bytes).
// A cell occupying 61 bytes needs AT LEAST 61 CKB capacity.
//
// With a type script, add type script size:
//   32 bytes : type code_hash
//    1 byte  : type hash_type
//   N bytes  : type args
//
// With data, add the data size.

const SHANNON_PER_CKB = 100_000_000n; // 10^8 shannon per CKB
const BYTES_PER_CKB = 1n;             // 1 CKB = 1 byte of capacity

/**
 * Calculate the minimum capacity (in shannon) for a cell with the given parameters.
 *
 * @param lockArgsLength  - Length of the lock script args in bytes (20 for secp256k1-blake160)
 * @param hasTypeScript   - Whether the cell has a type script
 * @param typeArgsLength  - Length of type script args if hasTypeScript is true
 * @param dataLength      - Length of the cell's data field in bytes
 * @returns Minimum capacity in shannon
 */
function calculateMinimumCapacity(
  lockArgsLength: number,
  hasTypeScript: boolean,
  typeArgsLength: number,
  dataLength: number
): bigint {
  // Cell fixed overhead:
  //   8 bytes: capacity field (u64)
  let size = 8;

  // Lock script size:
  //   32 bytes: code_hash
  //    1 byte:  hash_type
  //   N bytes:  args
  size += 32 + 1 + lockArgsLength;

  // Type script size (optional):
  if (hasTypeScript) {
    size += 32 + 1 + typeArgsLength;
  }

  // Data field:
  size += dataLength;

  // Capacity must equal size in bytes, measured in CKB (1 byte = 1 CKB = 10^8 shannon)
  const minimumCkb = BigInt(size);
  return minimumCkb * SHANNON_PER_CKB;
}

function demonstrateCapacityCalculation(): void {
  console.log("\n=== Cell Capacity Calculation ===\n");

  // Plain CKB cell (no type, no data)
  const plainMin = calculateMinimumCapacity(20, false, 0, 0);
  console.log("Plain CKB cell (lock only, no data):");
  console.log(`  Size: 8 + 32 + 1 + 20 = 61 bytes`);
  console.log(`  Minimum capacity: ${plainMin / SHANNON_PER_CKB} CKB (${plainMin} shannon)`);

  // xUDT token cell (with 16-byte amount data)
  const xudtMin = calculateMinimumCapacity(20, true, 32, 16);
  console.log("\nxUDT token cell (lock + type + 16 bytes data):");
  console.log(`  Size: 8 + 32 + 1 + 20 + 32 + 1 + 32 + 16 = 142 bytes`);
  console.log(`  Minimum capacity: ${xudtMin / SHANNON_PER_CKB} CKB (${xudtMin} shannon)`);

  // Spore NFT with 1KB content
  const sporeMin = calculateMinimumCapacity(20, true, 32, 1024);
  console.log("\nSpore NFT cell (lock + type + 1024 bytes content):");
  console.log(`  Size: 8 + 53 + 65 + 1024 = 1150 bytes`);
  console.log(`  Minimum capacity: ${sporeMin / SHANNON_PER_CKB} CKB (${sporeMin} shannon)`);

  console.log("\nKey insight: capacity IS the storage fee.");
  console.log("You lock CKB capacity to store data on-chain.");
  console.log("Reclaim it by consuming the cell (data leaves the chain state).");
}

// ============================================================
// SECTION 2: Cell Fragmentation — Why It Happens
// ============================================================
//
// Cell fragmentation occurs when a wallet accumulates many small cells
// instead of a few large ones. Common causes:
//
// 1. RECEIVING MANY SMALL PAYMENTS:
//    Each incoming transaction creates a new output cell. After 100 small
//    payments, you have 100 separate cells each holding a small amount.
//
// 2. CHANGE CELLS FROM TRANSACTIONS:
//    When spending a cell, the leftover goes into a change cell. Multiple
//    transactions create multiple change cells. In a busy wallet, this
//    compounds quickly.
//
// 3. TOKEN DISTRIBUTIONS:
//    Airdrops create one cell per recipient. If you receive many token
//    types, each type lives in its own cell.
//
// 4. dApp INTERACTIONS:
//    Some dApps split cells as part of their protocol. For example, a
//    vesting contract might create one cell per vesting tranche.
//
// EFFECTS OF FRAGMENTATION:
//   - Larger transactions: more inputs = larger tx = higher fees
//   - RPC overhead: querying many cells is slower
//   - CKB-VM overhead: scripts that iterate all inputs are slower with more cells
//   - User experience: balance lookups require scanning many cells

interface SimulatedCell {
  outPoint: { txHash: string; index: number };
  capacity: bigint; // in shannon
  data: string;     // hex data
  label: string;    // human-readable label for this demo
}

function generateFragmentedCells(count: number, baseCapacity: bigint): SimulatedCell[] {
  const cells: SimulatedCell[] = [];
  for (let i = 0; i < count; i++) {
    // Vary cell sizes to simulate realistic fragmentation
    const variation = BigInt(Math.floor(Math.random() * 10) - 5);
    const capacity = baseCapacity + variation * SHANNON_PER_CKB;
    cells.push({
      outPoint: {
        txHash: `0x${i.toString(16).padStart(64, "0")}`,
        index: 0,
      },
      capacity: capacity > 0n ? capacity : baseCapacity,
      data: "0x",
      label: `small-cell-${i}`,
    });
  }
  return cells;
}

function analyzeFragmentation(cells: SimulatedCell[]): void {
  console.log("\n=== Cell Fragmentation Analysis ===\n");

  const totalCapacity = cells.reduce((sum, c) => sum + c.capacity, 0n);
  const avgCapacity = totalCapacity / BigInt(cells.length);
  const minCapacity = cells.reduce(
    (min, c) => (c.capacity < min ? c.capacity : min),
    cells[0].capacity
  );
  const maxCapacity = cells.reduce(
    (max, c) => (c.capacity > max ? c.capacity : max),
    cells[0].capacity
  );

  console.log(`Cell count:        ${cells.length}`);
  console.log(`Total capacity:    ${totalCapacity / SHANNON_PER_CKB} CKB`);
  console.log(`Average per cell:  ${avgCapacity / SHANNON_PER_CKB} CKB`);
  console.log(`Smallest cell:     ${minCapacity / SHANNON_PER_CKB} CKB`);
  console.log(`Largest cell:      ${maxCapacity / SHANNON_PER_CKB} CKB`);

  // Estimate transaction overhead per cell
  // A typical input adds ~44 bytes to a transaction (outpoint 36 + since 8)
  const INPUT_BYTES = 44n;
  // At 1000 shannon per byte (rough estimate)
  const FEE_PER_BYTE = 1000n; // shannon
  const feePerInput = INPUT_BYTES * FEE_PER_BYTE;

  console.log(`\nTransaction cost analysis:`);
  console.log(`  Fee per input (est.): ${feePerInput} shannon = ${feePerInput / SHANNON_PER_CKB} CKB`);

  // How many cells are "dust" (not worth spending individually)?
  const DUST_THRESHOLD = calculateMinimumCapacity(20, false, 0, 0);
  const dustCells = cells.filter((c) => c.capacity <= DUST_THRESHOLD);
  console.log(
    `  Dust cells (≤ ${DUST_THRESHOLD / SHANNON_PER_CKB} CKB): ${dustCells.length}/${cells.length}`
  );

  if (cells.length > 10) {
    console.log(`\nFragmentation is HIGH. Consider consolidation.`);
    console.log(
      `  Spending all ${cells.length} cells in one tx uses ${cells.length * 44} bytes just for inputs.`
    );
  }
}

// ============================================================
// SECTION 3: Cell Consolidation
// ============================================================
//
// Consolidation merges many small cells into fewer large cells.
//
// CONSOLIDATION TRANSACTION:
//   Inputs:  [many small cells]
//   Outputs: [one or few large cells]
//   Fee:     paid from the small cells' capacity excess
//
// WHEN TO CONSOLIDATE:
//   - Cell count exceeds a threshold (e.g., > 50 cells)
//   - Before a large transaction that needs significant capacity
//   - During off-peak periods (lower fee market competition)
//   - When fee_from_consolidation < capacity_saved_in_future_txs
//
// CONSOLIDATION LIMIT:
// CKB transactions have a size limit (currently ~512 KB serialized).
// Large input counts hit this limit.
// Rule of thumb: consolidate in batches of ~100-200 inputs per tx.
//
// BATCH CONSOLIDATION STRATEGY:
//   If you have 1000 cells, do it in stages:
//   Round 1: Merge 200 cells -> 1 cell. Repeat 5 times. = 5 large cells.
//   Round 2: Merge 5 large cells -> 1 final cell.
//   Total: 6 transactions to consolidate 1000 cells.

const MAX_INPUTS_PER_CONSOLIDATION = 100;
const ESTIMATED_TX_FEE_PER_INPUT = 1000n; // shannon (rough estimate)
const ESTIMATED_TX_BASE_FEE = 1_000_000n; // 0.01 CKB base fee

/**
 * Plan a consolidation strategy for a set of cells.
 *
 * @param cells - Array of cells to consolidate
 * @param targetOutputCount - How many output cells to produce (default: 1)
 * @returns Consolidation plan with batches and estimated fees
 */
function planConsolidation(
  cells: SimulatedCell[],
  targetOutputCount: number = 1
): void {
  console.log("\n=== Cell Consolidation Plan ===\n");
  console.log(`Consolidating ${cells.length} cells into ${targetOutputCount} cell(s)`);

  const batches: SimulatedCell[][] = [];
  for (let i = 0; i < cells.length; i += MAX_INPUTS_PER_CONSOLIDATION) {
    batches.push(cells.slice(i, i + MAX_INPUTS_PER_CONSOLIDATION));
  }

  console.log(`\nBatching strategy (max ${MAX_INPUTS_PER_CONSOLIDATION} inputs per tx):`);

  let totalFee = 0n;
  let intermediateOutputCapacity = 0n;

  batches.forEach((batch, batchIdx) => {
    const batchCapacity = batch.reduce((sum, c) => sum + c.capacity, 0n);
    const estimatedFee =
      ESTIMATED_TX_BASE_FEE + BigInt(batch.length) * ESTIMATED_TX_FEE_PER_INPUT;
    const outputCapacity = batchCapacity - estimatedFee;

    totalFee += estimatedFee;
    intermediateOutputCapacity += outputCapacity;

    console.log(`  Batch ${batchIdx + 1}: ${batch.length} inputs`);
    console.log(`    Input capacity:  ${batchCapacity / SHANNON_PER_CKB} CKB`);
    console.log(`    Estimated fee:   ${estimatedFee / SHANNON_PER_CKB} CKB`);
    console.log(`    Output capacity: ${outputCapacity / SHANNON_PER_CKB} CKB`);
  });

  if (batches.length > 1) {
    // Need a final round to merge intermediate outputs
    const finalFee =
      ESTIMATED_TX_BASE_FEE + BigInt(batches.length) * ESTIMATED_TX_FEE_PER_INPUT;
    totalFee += finalFee;
    console.log(`\n  Final merge: ${batches.length} intermediate cells -> ${targetOutputCount} cell(s)`);
    console.log(`    Estimated fee: ${finalFee / SHANNON_PER_CKB} CKB`);
  }

  const originalTotal = cells.reduce((sum, c) => sum + c.capacity, 0n);
  console.log(`\nSummary:`);
  console.log(`  Original total:  ${originalTotal / SHANNON_PER_CKB} CKB across ${cells.length} cells`);
  console.log(`  Total fees:      ${totalFee / SHANNON_PER_CKB} CKB`);
  console.log(
    `  Final balance:   ${(originalTotal - totalFee) / SHANNON_PER_CKB} CKB in ${targetOutputCount} cell(s)`
  );
  console.log(`  Transactions:    ${batches.length + (batches.length > 1 ? 1 : 0)}`);
}

// ============================================================
// SECTION 4: Cell Splitting for Parallel Spending
// ============================================================
//
// Splitting breaks a large cell into multiple smaller cells.
// This enables PARALLEL TRANSACTION SUBMISSION.
//
// WHY PARALLELISM MATTERS:
// CKB's UTXO model means two transactions can be submitted simultaneously
// as long as they spend different cells (no "double spend" conflict).
//
// In Ethereum's account model, all transactions from one account are
// serialized by nonce — you cannot send two txs in parallel without
// careful nonce management.
//
// In CKB:
//   - Give Bob 3 cells worth 1000 CKB each
//   - Bob can submit 3 transactions in parallel, each spending one cell
//   - The transactions don't conflict because they spend different cells
//   - This is natural and doesn't require any special protocol
//
// USE CASES:
//   - High-frequency trading bots that submit many txs per block
//   - dApps that serve many users from the same "treasury" address
//   - Token distribution: pre-split into recipient-sized cells
//   - State channels: each channel needs its own cell
//
// OPTIMAL SPLIT SIZE:
//   split_size = total_capacity / desired_parallelism
//   split_size must be > minimum cell capacity (61 CKB for plain cells)
//   split_size should leave enough for fees (each cell spent pays its own fee)

/**
 * Plan a cell split for a given parallelism target.
 *
 * @param sourceCell        - The large cell to split
 * @param targetCellCount   - How many output cells to produce
 * @param capacityPerOutput - How many shannon each output should have (if null: auto-calculate)
 */
function planCellSplit(
  sourceCell: SimulatedCell,
  targetCellCount: number,
  capacityPerOutput?: bigint
): void {
  console.log("\n=== Cell Splitting Plan ===\n");
  console.log(`Source cell: ${sourceCell.capacity / SHANNON_PER_CKB} CKB`);
  console.log(`Target: ${targetCellCount} cells`);

  const splitFee = ESTIMATED_TX_BASE_FEE + ESTIMATED_TX_FEE_PER_INPUT; // 1 input
  const availableAfterFee = sourceCell.capacity - splitFee;
  const MINIMUM_CELL = calculateMinimumCapacity(20, false, 0, 0);

  if (capacityPerOutput === undefined) {
    // Auto-calculate: distribute evenly
    capacityPerOutput = availableAfterFee / BigInt(targetCellCount);
  }

  if (capacityPerOutput < MINIMUM_CELL) {
    console.log(
      `ERROR: Calculated split size ${capacityPerOutput / SHANNON_PER_CKB} CKB is below minimum ${MINIMUM_CELL / SHANNON_PER_CKB} CKB`
    );
    console.log(`Maximum parallelism for this cell: ${availableAfterFee / MINIMUM_CELL} cells`);
    return;
  }

  const totalOutput = capacityPerOutput * BigInt(targetCellCount);
  const change = availableAfterFee - totalOutput;

  console.log(`\nSplit transaction:`);
  console.log(`  1 input  -> ${sourceCell.capacity / SHANNON_PER_CKB} CKB`);
  console.log(`  Split fee: ${splitFee / SHANNON_PER_CKB} CKB`);
  console.log(`  ${targetCellCount} outputs x ${capacityPerOutput / SHANNON_PER_CKB} CKB`);
  if (change > 0n) {
    console.log(
      `  Change cell: ${change / SHANNON_PER_CKB} CKB (leftover after even split)`
    );
  }

  console.log(`\nParallelism benefit:`);
  console.log(`  Before: 1 cell (1 tx at a time from this address)`);
  console.log(`  After:  ${targetCellCount} cells (${targetCellCount} parallel txs possible)`);
  console.log(`  Useful for: high-frequency bots, multi-user dApps, pre-signed payments`);
}

// ============================================================
// SECTION 5: Dust Cells and Cleanup
// ============================================================
//
// A "dust cell" is one where the capacity is so close to the minimum
// that the fee to spend it (or the value recovered) is negligible.
//
// DUST THRESHOLD:
// Typically defined as a cell whose capacity is less than or equal to
// the minimum required capacity (61 CKB for plain cells). Such a cell
// cannot hold any "excess" capacity — all its CKB is locked into
// the structural cost of the cell itself.
//
// SUBECONOMIC DUST:
// A more practical threshold: a cell where fee_to_spend > excess_capacity
// In that case, spending the cell costs more than you get back.
//
// WHERE DUST COMES FROM:
//   1. Minimum-capacity cells created intentionally (e.g., NFT cells that
//      must exist but the user doesn't want to lock more CKB)
//   2. Rounding errors in fee calculations
//   3. Protocol outputs where the script requires exactly minimum capacity
//
// HANDLING DUST:
//   1. Include dust cells as inputs in OTHER transactions to "sweep" them up
//      (you pay the dust cell's inclusion cost but get its capacity back)
//   2. Accept that tiny amounts may never be practical to recover
//   3. Design protocols to avoid creating subeconomic cells
//   4. Use ACP mode so that consolidation can happen without owner involvement

const DUST_THRESHOLD_CKB = 61n; // minimum cell size in CKB

/**
 * Classify cells into "valuable" and "dust" categories and suggest cleanup strategy.
 */
function analyzeDustCells(cells: SimulatedCell[]): void {
  console.log("\n=== Dust Cell Analysis ===\n");

  const dustThreshold = DUST_THRESHOLD_CKB * SHANNON_PER_CKB;
  // Subeconomic: cell where spending it costs more than we recover
  const spendCost = ESTIMATED_TX_BASE_FEE + ESTIMATED_TX_FEE_PER_INPUT;
  const subeconomicThreshold = dustThreshold + spendCost;

  const dustCells = cells.filter((c) => c.capacity <= dustThreshold);
  const subeconomicCells = cells.filter(
    (c) => c.capacity > dustThreshold && c.capacity <= subeconomicThreshold
  );
  const valuableCells = cells.filter((c) => c.capacity > subeconomicThreshold);

  console.log(`Cell classification:`);
  console.log(
    `  Dust cells         (≤ ${dustThreshold / SHANNON_PER_CKB} CKB): ${dustCells.length} cells`
  );
  console.log(
    `  Subeconomic cells  (≤ ${subeconomicThreshold / SHANNON_PER_CKB} CKB): ${subeconomicCells.length} cells`
  );
  console.log(`  Valuable cells     (> ${subeconomicThreshold / SHANNON_PER_CKB} CKB): ${valuableCells.length} cells`);

  if (dustCells.length > 0) {
    const dustTotal = dustCells.reduce((sum, c) => sum + c.capacity, 0n);
    console.log(
      `\n  ${dustCells.length} dust cells hold ${dustTotal / SHANNON_PER_CKB} CKB total.`
    );
    console.log(`  Strategy: Batch these with other inputs in normal transactions.`);
    console.log(`  Include up to 10-20 dust inputs per tx alongside a larger input.`);
    console.log(`  The larger input covers the fee; you reclaim dust capacity as change.`);
  }

  if (subeconomicCells.length > 0) {
    console.log(`\n  ${subeconomicCells.length} subeconomic cells.`);
    console.log(`  Spending one alone costs ${spendCost / SHANNON_PER_CKB} CKB but yields little excess.`);
    console.log(`  Best strategy: batch 50+ subeconomic cells in one tx.`);
    console.log(`  Combined, the excess capacity exceeds the fee cost.`);
  }
}

// ============================================================
// SECTION 6: Cell Collection Strategies
// ============================================================
//
// When building a transaction that needs N CKB of input capacity,
// which cells do you pick from your available set?
//
// STRATEGIES (analogous to Bitcoin UTXO selection):
//
// 1. SMALLEST FIRST (minimize fragmentation):
//    Pick the smallest cells that sum to >= required amount.
//    Pros: Uses up small cells, reduces fragmentation over time.
//    Cons: More inputs per transaction (higher fee).
//
// 2. LARGEST FIRST (minimize inputs):
//    Pick the largest cells first, stop when you have enough.
//    Pros: Fewer inputs = smaller tx = lower fee.
//    Cons: Leave many small cells, increases fragmentation.
//
// 3. BEST FIT (minimize change):
//    Find the single cell closest to the required amount.
//    Pros: Minimal change cell, sometimes zero change.
//    Cons: May leave cells that are hard to use later.
//
// 4. BRANCH AND BOUND (optimal):
//    Exhaustive search for exact match or minimal change.
//    Pros: Optimal fee in many cases.
//    Cons: Computationally expensive for large cell sets.
//
// 5. PRIVACY-CONSCIOUS:
//    Never combine cells from different addresses in the same transaction.
//    Pick cells that don't reveal relationships between wallets.
//    Pros: Better transaction graph privacy.
//    Cons: May result in higher fees.
//
// CKB SPECIFIC CONSIDERATION:
// Cells with TYPE SCRIPTS are subject to their type script's rules when spent.
// Mixing typed cells (e.g., xUDT cells) with plain CKB cells in a consolidation
// may trigger the type script and require additional constraints.
// Best practice: consolidate plain CKB cells separately from typed cells.

type SelectionStrategy = "smallest_first" | "largest_first" | "best_fit";

/**
 * Simulate cell selection for a transaction requiring a target amount.
 *
 * @param availableCells - Pool of cells to select from
 * @param targetCapacity - Capacity needed in shannon
 * @param strategy       - Selection algorithm
 * @returns Selected cells and change amount
 */
function selectCells(
  availableCells: SimulatedCell[],
  targetCapacity: bigint,
  strategy: SelectionStrategy
): { selected: SimulatedCell[]; change: bigint; totalInputs: bigint } {
  let sortedCells: SimulatedCell[];

  switch (strategy) {
    case "smallest_first":
      sortedCells = [...availableCells].sort((a, b) =>
        a.capacity < b.capacity ? -1 : a.capacity > b.capacity ? 1 : 0
      );
      break;
    case "largest_first":
      sortedCells = [...availableCells].sort((a, b) =>
        b.capacity < a.capacity ? -1 : b.capacity > a.capacity ? 1 : 0
      );
      break;
    case "best_fit":
      // Sort by distance to target (ascending)
      sortedCells = [...availableCells].sort((a, b) => {
        const distA =
          a.capacity >= targetCapacity
            ? a.capacity - targetCapacity
            : targetCapacity - a.capacity;
        const distB =
          b.capacity >= targetCapacity
            ? b.capacity - targetCapacity
            : targetCapacity - b.capacity;
        return distA < distB ? -1 : distA > distB ? 1 : 0;
      });
      break;
  }

  const selected: SimulatedCell[] = [];
  let accumulated = 0n;

  for (const cell of sortedCells) {
    if (accumulated >= targetCapacity) break;
    selected.push(cell);
    accumulated += cell.capacity;
  }

  const estimatedFee =
    ESTIMATED_TX_BASE_FEE + BigInt(selected.length) * ESTIMATED_TX_FEE_PER_INPUT;
  const change = accumulated - targetCapacity - estimatedFee;

  return { selected, change, totalInputs: accumulated };
}

function compareSelectionStrategies(
  availableCells: SimulatedCell[],
  targetCapacity: bigint
): void {
  console.log("\n=== Cell Selection Strategy Comparison ===\n");
  console.log(`Selecting cells for a ${targetCapacity / SHANNON_PER_CKB} CKB transaction`);
  console.log(`Available: ${availableCells.length} cells\n`);

  const strategies: SelectionStrategy[] = [
    "smallest_first",
    "largest_first",
    "best_fit",
  ];

  strategies.forEach((strategy) => {
    const { selected, change, totalInputs } = selectCells(
      availableCells,
      targetCapacity,
      strategy
    );
    const fee =
      ESTIMATED_TX_BASE_FEE + BigInt(selected.length) * ESTIMATED_TX_FEE_PER_INPUT;

    console.log(`Strategy: ${strategy}`);
    console.log(`  Inputs selected:  ${selected.length}`);
    console.log(`  Total input cap:  ${totalInputs / SHANNON_PER_CKB} CKB`);
    console.log(`  Estimated fee:    ${fee / SHANNON_PER_CKB} CKB`);
    console.log(
      `  Change amount:    ${change > 0n ? change / SHANNON_PER_CKB : 0n} CKB`
    );
    console.log(
      `  Remaining cells:  ${availableCells.length - selected.length}`
    );
    console.log("");
  });
}

// ============================================================
// SECTION 7: Cell Reservation for dApps
// ============================================================
//
// dApps often need to "reserve" cells for specific purposes:
//
// 1. OPERATIONAL CELLS:
//    Cells held in reserve to pay for transaction fees.
//    A dApp's hot wallet needs enough operational cells to submit txs
//    continuously. If all capacity is in one huge cell, splitting it
//    every time wastes fees.
//    Strategy: maintain a pool of N medium-sized cells (e.g., 100 CKB each)
//    for operations.
//
// 2. PROTOCOL CELLS:
//    Some scripts require specific cells to exist (e.g., a global config
//    cell, a state cell, a liquidity pool cell). These cells must not be
//    accidentally spent in fee payments.
//    Strategy: use a separate key for protocol cells vs. operational cells.
//    Mark protocol cells with special type scripts so they're
//    distinguishable from plain CKB cells.
//
// 3. USER-FACING CELLS:
//    Cells that represent user positions (deposits, NFTs, subscriptions).
//    These must be individually identifiable and not merged.
//    Strategy: use type scripts with unique IDs (e.g., Spore NFT IDs).
//
// 4. LIQUIDITY RESERVE:
//    A dApp that processes many txs/block needs enough unlocked capacity
//    to cover all expected transactions before the next settlement.
//    Strategy: maintain a rolling reserve based on peak throughput needs.

function demonstrateCellReservation(): void {
  console.log("\n=== Cell Reservation Patterns for dApps ===\n");

  console.log("1. Operational Cell Pool");
  console.log("   Problem: Need to submit many transactions quickly.");
  console.log("   Solution: Maintain 10-20 cells of 100 CKB each.");
  console.log("   Each tx spends one operational cell as a fee source.");
  console.log("   Replenish the pool periodically from the main treasury.");
  console.log("");

  console.log("2. Protocol State Cell Protection");
  console.log("   Problem: Critical state cells must not be swept as fees.");
  console.log("   Solution:");
  console.log("     a) Use a dedicated lock key for protocol cells");
  console.log("     b) Mark cells with a 'sentinel' type script");
  console.log("     c) Query cells by type script to find protocol cells");
  console.log("     d) Never include protocol cells in fee-payer input selection");
  console.log("");

  console.log("3. Throughput Planning");
  console.log("   Formula: reserved_cells >= peak_txs_per_block");
  console.log("   If your dApp handles 50 user operations per block,");
  console.log("   you need at least 50 operational cells ready at all times.");
  console.log("   Each block: replenish consumed cells from treasury (consolidate).");
  console.log("");

  console.log("4. CKB-Specific: Type Script Cell Isolation");
  console.log("   Typed cells (xUDT, Spore) have DIFFERENT fee economics.");
  console.log("   Spending a typed cell triggers its type script (uses more gas).");
  console.log("   Never mix typed cells with plain CKB in fee-payment selections.");
  console.log("   Use plain CKB cells for fee payments, typed cells for their purpose.");
}

// ============================================================
// SECTION 8: Optimal Cell Size Calculation
// ============================================================
//
// What is the "right" size for a cell?
// The answer depends on how often the cell is spent and what it's used for.
//
// TOO SMALL:
//   - Higher fee ratio (fee/value is large)
//   - Multiple inputs needed for transactions, increasing tx size
//   - Dust risk
//
// TOO LARGE:
//   - Single cell = single spendable unit = no parallelism
//   - If stolen, you lose more
//   - May be over-qualified (extra capacity locked unnecessarily)
//
// OPTIMAL SIZE CALCULATION:
//   Target: fee_to_spend / cell_value < fee_tolerance (e.g., 0.1%)
//   fee_to_spend ≈ ESTIMATED_TX_BASE_FEE + ESTIMATED_TX_FEE_PER_INPUT
//   cell_value = capacity - minimum_capacity
//   => capacity > (fee_to_spend / fee_tolerance) + minimum_capacity
//
//   With defaults:
//   fee_to_spend = 1,000,000 + 1,000 = 1,001,000 shannon
//   fee_tolerance = 0.001 (0.1%)
//   optimal_capacity >= (1,001,000 / 0.001) + 6,100,000,000
//               = 1,001,000,000 + 6,100,000,000
//               = 7,101,000,000 shannon ≈ 71 CKB
//
//   So cells below ~71 CKB have > 0.1% fee ratio — consider them "small".
//   Cells above ~500 CKB are "medium" and have good fee efficiency.
//   Cells above ~5000 CKB are "large" and should be split for parallelism.

function calculateOptimalCellSize(feeTolerance: number = 0.001): bigint {
  const feeToSpend = ESTIMATED_TX_BASE_FEE + ESTIMATED_TX_FEE_PER_INPUT;
  const minimumCapacity = calculateMinimumCapacity(20, false, 0, 0);
  // optimal_value >= feeToSpend / feeTolerance
  const optimalValue = BigInt(Math.ceil(Number(feeToSpend) / feeTolerance));
  return optimalValue + minimumCapacity;
}

function demonstrateOptimalCellSize(): void {
  console.log("\n=== Optimal Cell Size Analysis ===\n");

  const tolerances = [0.001, 0.005, 0.01]; // 0.1%, 0.5%, 1%

  tolerances.forEach((tol) => {
    const optimal = calculateOptimalCellSize(tol);
    console.log(
      `Fee tolerance ${(tol * 100).toFixed(1)}%: optimal cell size >= ${optimal / SHANNON_PER_CKB} CKB`
    );
  });

  console.log("\nCell size categories:");
  console.log("  < 61 CKB  : Below minimum — invalid (cannot exist)");
  console.log("  61-100 CKB: Minimum range — acceptable for protocol cells");
  console.log("  100-500 CKB: Small — usable but creates moderate fragmentation");
  console.log("  500-5000 CKB: Medium — good balance of efficiency and flexibility");
  console.log("  5000+ CKB: Large — excellent fee efficiency, split for parallelism");

  console.log("\nWallet recommendations:");
  console.log("  Target cell size: 500-2000 CKB for general use");
  console.log("  Split large cells (>10000 CKB) if parallel spending is needed");
  console.log("  Consolidate when cell count exceeds 20-50 cells");
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function main(): Promise<void> {
  console.log("======================================================");
  console.log("  Lesson 17: Advanced Cell Management");
  console.log("======================================================");
  console.log("");
  console.log("CKB cells are like UTXOs in Bitcoin: discrete objects holding value.");
  console.log("Managing them well is key to efficient wallet and dApp operation.");

  const client = new ccc.ClientPublicTestnet();
  console.log("\nConnected to CKB testnet.");

  // Run all demonstrations
  demonstrateCapacityCalculation();

  // Generate sample fragmented cell set for demonstrations
  const fragmentedCells = generateFragmentedCells(50, 200n * SHANNON_PER_CKB);
  analyzeFragmentation(fragmentedCells);

  planConsolidation(fragmentedCells, 1);

  const largeCell: SimulatedCell = {
    outPoint: { txHash: "0x" + "aa".repeat(32), index: 0 },
    capacity: 10000n * SHANNON_PER_CKB,
    data: "0x",
    label: "large-cell",
  };
  planCellSplit(largeCell, 5);

  analyzeDustCells([
    ...generateFragmentedCells(5, 61n * SHANNON_PER_CKB),   // dust
    ...generateFragmentedCells(5, 65n * SHANNON_PER_CKB),   // barely above dust
    ...generateFragmentedCells(10, 200n * SHANNON_PER_CKB), // normal
  ]);

  const mixedCells = [
    ...generateFragmentedCells(15, 100n * SHANNON_PER_CKB),
    ...generateFragmentedCells(5, 1000n * SHANNON_PER_CKB),
    ...generateFragmentedCells(3, 5000n * SHANNON_PER_CKB),
  ];
  compareSelectionStrategies(mixedCells, 300n * SHANNON_PER_CKB);

  demonstrateCellReservation();
  demonstrateOptimalCellSize();

  client.destroy();

  console.log("\n======================================================");
  console.log("  End of Lesson 17");
  console.log("======================================================");
  console.log("");
  console.log("Key takeaways:");
  console.log("  1. Minimum cell capacity = sum of all field sizes in bytes (as CKB)");
  console.log("  2. Fragmentation = many small cells = higher per-transaction overhead");
  console.log("  3. Consolidation = batch merge small cells into large ones");
  console.log("  4. Splitting = break large cells for parallel spending capability");
  console.log("  5. Dust cells = those at or below minimum capacity (no excess value)");
  console.log("  6. Cell selection strategy affects fee efficiency and fragmentation");
  console.log("  7. dApps should isolate operational cells from protocol state cells");
  console.log("  8. Optimal cell size depends on fee tolerance and usage frequency");
  console.log("  9. Never mix typed cells (xUDT, Spore) with plain CKB in fee selection");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
