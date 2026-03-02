/**
 * =============================================================================
 * Lesson 2: Transactions & the UTXO Flow
 * =============================================================================
 *
 * In Lesson 1 we learned that CKB stores all state inside "Cells" -- the
 * generalized UTXOs that hold capacity, a lock script, an optional type
 * script, and arbitrary data. But cells are static: they sit on-chain
 * until something *happens* to them.
 *
 * That "something" is a **transaction**.
 *
 * A CKB transaction is the *only* way to change state:
 *   - It **consumes** (destroys) a set of existing cells (inputs).
 *   - It **creates** a set of new cells (outputs).
 *
 * This is the classic "consume-and-create" model inherited from Bitcoin's
 * UTXO design, but CKB extends it with richer cell contents, cell
 * dependencies, and a flexible witness structure.
 *
 * In this lesson you will:
 *   1. Connect to the CKB testnet.
 *   2. Fetch recent transactions from the chain.
 *   3. Decode and display every field of a transaction:
 *      - Inputs   (previous output references + since values)
 *      - Outputs  (new cells: capacity, lock, type, data)
 *      - Cell deps (code cells referenced by scripts)
 *      - Header deps
 *      - Witnesses (signatures / proof data)
 *   4. Calculate the transaction fee.
 *   5. Visualize the input -> output "UTXO flow."
 *
 * Let's get started!
 * =============================================================================
 */

import { ccc } from "@ckb-ccc/core";

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Convert shannons (the smallest CKB unit) to a human-readable CKByte string.
 *
 * 1 CKByte = 100_000_000 shannons  (10^8, like Bitcoin satoshis)
 *
 * We keep four decimal places for clarity.
 */
function shannonsToDisplay(shannons: bigint): string {
  const whole = shannons / 100_000_000n;
  const frac = shannons % 100_000_000n;
  const fracStr = frac.toString().padStart(8, "0").slice(0, 4);
  return `${whole.toLocaleString()}.${fracStr} CKB`;
}

/**
 * Truncate a hex string so it is easier to read in the terminal.
 * Example: "0xabcdef1234567890abcdef" -> "0xabcdef12...cdef"
 */
function truncateHex(hex: string, keep = 8): string {
  if (hex.length <= keep * 2 + 4) return hex;
  return `${hex.slice(0, keep + 2)}...${hex.slice(-keep)}`;
}

/**
 * Print a section divider for CLI readability.
 */
function divider(title: string): void {
  const line = "=".repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

/**
 * Print a sub-section divider.
 */
function subDivider(title: string): void {
  console.log(`\n  --- ${title} ${"─".repeat(Math.max(0, 55 - title.length))}`);
}

// ---------------------------------------------------------------------------
// Core: Fetch and display a transaction
// ---------------------------------------------------------------------------

/**
 * Fetch the full transaction by its hash and display its anatomy.
 *
 * CKB transactions contain five top-level arrays:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │               CKB Transaction                │
 *   ├──────────────────────────────────────────────┤
 *   │  cell_deps[]   - referenced code / data      │
 *   │  header_deps[] - referenced block headers     │
 *   │  inputs[]      - cells being consumed         │
 *   │  outputs[]     - new cells being created      │
 *   │  outputs_data[] - data for each output cell   │
 *   │  witnesses[]   - proofs (signatures, etc.)    │
 *   └──────────────────────────────────────────────┘
 *
 * When the transaction is accepted:
 *   - Every input cell is marked as "dead" (consumed / spent).
 *   - Every output cell becomes a new "live" cell on-chain.
 *   - The total capacity of inputs must be >= total capacity of outputs.
 *   - The difference (inputs - outputs) is the **miner fee**.
 */
async function displayTransaction(
  client: ccc.Client,
  txHash: string
): Promise<void> {
  divider(`Transaction: ${truncateHex(txHash)}`);
  console.log(`  Full hash: ${txHash}`);

  // -----------------------------------------------------------------------
  // Step 1: Fetch the transaction from the node
  // -----------------------------------------------------------------------
  // The RPC method `getTransaction` returns the transaction along with its
  // on-chain status (pending / proposed / committed).
  const txWithStatus = await client.getTransaction(txHash);

  if (!txWithStatus || !txWithStatus.transaction) {
    console.log("  Transaction not found on the node.");
    return;
  }

  const tx = txWithStatus.transaction;

  // -----------------------------------------------------------------------
  // Step 2: Display CELL DEPS
  // -----------------------------------------------------------------------
  /**
   * Cell dependencies (cell_deps) tell the CKB-VM which on-chain cells
   * contain the *compiled scripts* that inputs and outputs reference.
   *
   * Each cell dep is an OutPoint (tx_hash + index) plus a "dep type":
   *   - "code"       -- the cell's data IS the script binary.
   *   - "dep_group"  -- the cell's data is a *list* of OutPoints, each of
   *                     which is itself a code cell. This is a convenient
   *                     way to bundle multiple dependencies.
   *
   * Why are cell deps needed?
   * Because CKB cells only store a *hash* of the script code (code_hash).
   * The actual executable code lives in a separate cell; cell_deps point
   * to that cell so the VM can load the code at validation time.
   */
  subDivider("Cell Dependencies");
  if (tx.cellDeps.length === 0) {
    console.log("    (none)");
  }
  for (let i = 0; i < tx.cellDeps.length; i++) {
    const dep = tx.cellDeps[i];
    console.log(`    [${i}] OutPoint: ${truncateHex(dep.outPoint.txHash)}:${dep.outPoint.index}`);
    console.log(`        Dep type: ${dep.depType}`);
  }

  // -----------------------------------------------------------------------
  // Step 3: Display HEADER DEPS
  // -----------------------------------------------------------------------
  /**
   * Header dependencies (header_deps) allow scripts to read data from
   * specific block headers during execution. This is used, for example,
   * by the Nervos DAO to calculate interest based on the epoch at which
   * a deposit was made.
   *
   * Each entry is simply a block hash.
   */
  subDivider("Header Dependencies");
  if (tx.headerDeps.length === 0) {
    console.log("    (none)");
  }
  for (let i = 0; i < tx.headerDeps.length; i++) {
    console.log(`    [${i}] Block hash: ${truncateHex(tx.headerDeps[i])}`);
  }

  // -----------------------------------------------------------------------
  // Step 4: Display INPUTS
  // -----------------------------------------------------------------------
  /**
   * Inputs reference existing live cells that this transaction will
   * consume (destroy). Each input contains:
   *
   *   - previousOutput (OutPoint): the tx_hash + index that identifies
   *     the cell to be consumed. An OutPoint says "take output #index
   *     from the transaction with hash tx_hash."
   *
   *   - since: a constraint on *when* this input can be consumed. It
   *     encodes time-lock conditions (by epoch, block number, or
   *     timestamp). A since value of 0x0 means "no restriction."
   *
   * We'll also try to look up the actual cell that each input points to,
   * so we can show its capacity and scripts.
   */
  subDivider("Inputs (cells being consumed)");
  let totalInputCapacity = 0n;

  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    console.log(`    [${i}] Previous OutPoint: ${truncateHex(input.previousOutput.txHash)}:${input.previousOutput.index}`);
    console.log(`        Since: ${input.since}`);

    // Try to resolve the actual cell contents by fetching the
    // transaction that created this cell.
    try {
      const prevTxResponse = await client.getTransaction(input.previousOutput.txHash);
      if (prevTxResponse?.transaction) {
        const prevTx = prevTxResponse.transaction;
        const idx = Number(input.previousOutput.index);
        if (idx < prevTx.outputs.length) {
          const prevOutput = prevTx.outputs[idx];
          const capacity = prevOutput.capacity;
          totalInputCapacity += capacity;
          console.log(`        Capacity: ${shannonsToDisplay(capacity)} (${capacity.toString()} shannons)`);
          console.log(`        Lock: code_hash=${truncateHex(prevOutput.lock.codeHash)}`);
          console.log(`              hash_type=${prevOutput.lock.hashType}, args=${truncateHex(prevOutput.lock.args)}`);
          if (prevOutput.type) {
            console.log(`        Type: code_hash=${truncateHex(prevOutput.type.codeHash)}`);
            console.log(`              hash_type=${prevOutput.type.hashType}, args=${truncateHex(prevOutput.type.args)}`);
          } else {
            console.log(`        Type: (none)`);
          }
          // Show data from the previous tx's outputs_data
          if (idx < prevTx.outputsData.length) {
            const data = prevTx.outputsData[idx];
            const dataDisplay = data === "0x" ? "(empty)" : truncateHex(data, 16);
            console.log(`        Data: ${dataDisplay}`);
          }
        }
      }
    } catch {
      console.log(`        (Could not resolve input cell details)`);
    }
  }

  // -----------------------------------------------------------------------
  // Step 5: Display OUTPUTS
  // -----------------------------------------------------------------------
  /**
   * Outputs are the NEW cells that this transaction creates. Each output
   * defines:
   *   - capacity: How many CKBytes (in shannons) the new cell holds.
   *               Remember: capacity >= occupied bytes of the cell.
   *   - lock: The lock script (ownership) of the new cell.
   *   - type: The optional type script (validation rules) of the new cell.
   *
   * The outputs_data array runs in parallel: outputs_data[i] is the data
   * stored in outputs[i].
   *
   * When this transaction is committed, these output cells become live
   * cells on-chain, each identified by the OutPoint (this_tx_hash, i).
   */
  subDivider("Outputs (new cells created)");
  let totalOutputCapacity = 0n;

  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    const capacity = output.capacity;
    totalOutputCapacity += capacity;

    console.log(`    [${i}] Capacity: ${shannonsToDisplay(capacity)} (${capacity.toString()} shannons)`);
    console.log(`        Lock: code_hash=${truncateHex(output.lock.codeHash)}`);
    console.log(`              hash_type=${output.lock.hashType}, args=${truncateHex(output.lock.args)}`);
    if (output.type) {
      console.log(`        Type: code_hash=${truncateHex(output.type.codeHash)}`);
      console.log(`              hash_type=${output.type.hashType}, args=${truncateHex(output.type.args)}`);
    } else {
      console.log(`        Type: (none)`);
    }

    // Show output data
    if (i < tx.outputsData.length) {
      const data = tx.outputsData[i];
      const dataDisplay = data === "0x" ? "(empty)" : truncateHex(data, 16);
      console.log(`        Data: ${dataDisplay}`);
    }
  }

  // -----------------------------------------------------------------------
  // Step 6: Display WITNESSES
  // -----------------------------------------------------------------------
  /**
   * Witnesses provide proof data -- most commonly, digital signatures.
   *
   * The witnesses array is loosely parallel to the inputs array:
   *   - witnesses[i] typically holds the signature that satisfies
   *     inputs[i]'s lock script.
   *   - Additional witness entries can carry extra data for type scripts
   *     or other purposes.
   *
   * The first witness in a "script group" (all inputs sharing the same
   * lock script) contains a WitnessArgs structure:
   *   - lock:       signature bytes
   *   - input_type: data for the type script of inputs
   *   - output_type: data for the type script of outputs
   *
   * Witnesses are NOT part of the transaction hash (tx_hash). The tx_hash
   * is computed from everything *except* witnesses. This is important:
   *   - You first compute the tx_hash.
   *   - Then you sign the tx_hash to produce the witness.
   *   - Then you attach the witness to the transaction before submitting.
   */
  subDivider("Witnesses");
  if (tx.witnesses.length === 0) {
    console.log("    (none)");
  }
  for (let i = 0; i < tx.witnesses.length; i++) {
    const witness = tx.witnesses[i];
    const display = witness === "0x" ? "(empty)" : truncateHex(witness, 20);
    const size = witness === "0x" ? 0 : (witness.length - 2) / 2;
    console.log(`    [${i}] ${display}`);
    console.log(`        Size: ${size} bytes`);
  }

  // -----------------------------------------------------------------------
  // Step 7: Calculate and display the TRANSACTION FEE
  // -----------------------------------------------------------------------
  /**
   * CKB transaction fees work differently from Ethereum:
   *
   *   fee = sum(input capacities) - sum(output capacities)
   *
   * There is no "gas" or "gas price." The fee is simply the leftover
   * capacity that isn't assigned to any output cell. Miners collect this
   * difference as their reward.
   *
   * This is identical to how Bitcoin transaction fees work.
   *
   * Note: If we couldn't resolve some input cells (e.g., the node pruned
   * them), the calculated fee may be inaccurate. We handle that below.
   */
  subDivider("Fee Calculation");
  if (totalInputCapacity > 0n) {
    const fee = totalInputCapacity - totalOutputCapacity;
    console.log(`    Total input capacity:  ${shannonsToDisplay(totalInputCapacity)}`);
    console.log(`    Total output capacity: ${shannonsToDisplay(totalOutputCapacity)}`);
    console.log(`    Transaction fee:       ${shannonsToDisplay(fee)} (${fee.toString()} shannons)`);
  } else {
    console.log(`    Total output capacity: ${shannonsToDisplay(totalOutputCapacity)}`);
    console.log(`    (Could not calculate fee -- input cells could not be resolved.`);
    console.log(`     This happens for cellbase/coinbase transactions or if the`);
    console.log(`     referenced transactions are unavailable.)`);
  }

  // -----------------------------------------------------------------------
  // Step 8: Visualize the UTXO FLOW
  // -----------------------------------------------------------------------
  /**
   * The UTXO flow shows the fundamental state transition:
   *
   *   Input Cells (consumed/destroyed)
   *       |
   *       v
   *   [ Transaction ]
   *       |
   *       v
   *   Output Cells (created)
   *
   * This is the heart of CKB's state model. There is no "update in place"
   * like in Ethereum. If you want to change a cell, you must consume the
   * old one and create a new one with the updated state.
   */
  subDivider("UTXO Flow Visualization");

  console.log("");
  console.log("    ┌─────────────────────────────────────────────────────────┐");
  console.log("    │                    CONSUMED CELLS (Inputs)              │");
  console.log("    │                                                         │");
  for (let i = 0; i < tx.inputs.length; i++) {
    const ref = `${truncateHex(tx.inputs[i].previousOutput.txHash, 6)}:${tx.inputs[i].previousOutput.index}`;
    console.log(`    │   [Input ${i}] OutPoint ${ref.padEnd(30)}      │`);
  }
  console.log("    │                                                         │");
  console.log("    └────────────────────────────┬────────────────────────────┘");
  console.log("                                 │");
  console.log("                                 ▼");
  console.log("                       ┌─────────────────┐");
  console.log(`                       │   Transaction    │`);
  console.log(`                       │  ${truncateHex(txHash, 6).padEnd(15)} │`);
  console.log("                       └────────┬────────┘");
  console.log("                                │");
  console.log("                                ▼");
  console.log("    ┌─────────────────────────────────────────────────────────┐");
  console.log("    │                    CREATED CELLS (Outputs)              │");
  console.log("    │                                                         │");
  for (let i = 0; i < tx.outputs.length; i++) {
    const cap = shannonsToDisplay(tx.outputs[i].capacity);
    console.log(`    │   [Output ${i}] ${cap.padEnd(25)} ${tx.outputs[i].type ? "w/ type" : "       "}       │`);
  }
  console.log("    │                                                         │");
  console.log("    └─────────────────────────────────────────────────────────┘");
  console.log("");
}

// ---------------------------------------------------------------------------
// Main: Connect to testnet and explore transactions
// ---------------------------------------------------------------------------

/**
 * Our main function:
 *   1. Creates a CKB testnet client.
 *   2. Fetches the tip (latest) block.
 *   3. Iterates through recent blocks to find ones with transactions.
 *   4. Displays the anatomy of each transaction found.
 *
 * This demonstrates the full transaction lifecycle on a live chain:
 *
 *   Construction  ->  Signing  ->  Submission  ->  Pending Pool
 *        ->  Proposed  ->  Committed (in a block)
 *
 * We are looking at the final stage: committed transactions in blocks.
 */
async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║        Lesson 2: Transactions & the UTXO Flow                  ║");
  console.log("║        Exploring CKB Transaction Anatomy on Testnet            ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  // -------------------------------------------------------------------------
  // Step 1: Connect to the CKB testnet
  // -------------------------------------------------------------------------
  /**
   * We use the CCC (Common Chains Connector) library to interact with
   * CKB. `ClientPublicTestnet` connects to a public testnet RPC node.
   *
   * The testnet (called "Pudge") is a fully functional CKB network used
   * for development and testing. It uses test CKBytes with no real value.
   */
  console.log("\nConnecting to CKB testnet...");
  const client = new ccc.ClientPublicTestnet();

  // -------------------------------------------------------------------------
  // Step 2: Get the latest block number (the "tip")
  // -------------------------------------------------------------------------
  /**
   * The "tip" is the highest block in the chain. We'll scan backwards
   * from here to find blocks that contain user transactions (beyond just
   * the coinbase/cellbase transaction).
   */
  const tipHeader = await client.getTipHeader();
  const tipNumber = Number(tipHeader.number);
  console.log(`Connected! Current tip block: #${tipNumber}`);

  // -------------------------------------------------------------------------
  // Step 3: Scan recent blocks for transactions
  // -------------------------------------------------------------------------
  /**
   * Each CKB block contains at least one transaction: the cellbase
   * (coinbase) transaction at index 0, which rewards the miner. We want
   * to find blocks that also contain user-submitted transactions.
   *
   * We'll scan backwards from the tip, looking at up to 20 blocks, and
   * display up to 3 interesting transactions.
   */
  console.log("\nScanning recent blocks for transactions...\n");

  let transactionsDisplayed = 0;
  const maxTransactionsToDisplay = 3;
  const maxBlocksToScan = 50;

  for (
    let blockNum = tipNumber;
    blockNum > tipNumber - maxBlocksToScan && transactionsDisplayed < maxTransactionsToDisplay;
    blockNum--
  ) {
    // Fetch the block by its number. We pack the number into the format
    // the RPC expects.
    const block = await client.getBlockByNumber(blockNum);

    if (!block || !block.transactions) {
      continue;
    }

    /**
     * block.transactions[0] is always the cellbase transaction.
     *
     * A cellbase transaction is special:
     *   - It has exactly one input with a "null" previous output
     *     (since it creates new CKB from nothing, like mining).
     *   - Its outputs distribute the block reward + fees to the miner.
     *   - It has no cell_deps, header_deps, or meaningful witnesses.
     *
     * We skip the cellbase and look at user transactions (index >= 1).
     */
    for (let txIdx = 1; txIdx < block.transactions.length && transactionsDisplayed < maxTransactionsToDisplay; txIdx++) {
      const tx = block.transactions[txIdx];

      // Compute or retrieve the transaction hash.
      // In CKB, the tx_hash is the hash of the raw transaction
      // (everything except witnesses).
      const txHash = tx.hash();

      console.log(`\n  Found in block #${blockNum}, tx index ${txIdx}`);
      await displayTransaction(client, txHash);
      transactionsDisplayed++;
    }
  }

  if (transactionsDisplayed === 0) {
    console.log("  No user transactions found in recent blocks.");
    console.log("  The testnet may have low activity right now.");
    console.log("  Try again later, or use the CKB faucet to generate activity!");

    // As a fallback, let's display the cellbase transaction from the tip
    // block so the student can still see a transaction structure.
    console.log("\n  Showing the cellbase (coinbase) transaction from the tip block instead...");
    const tipBlock = await client.getBlockByNumber(tipNumber);
    if (tipBlock && tipBlock.transactions.length > 0) {
      const cellbaseTx = tipBlock.transactions[0];
      const cellbaseHash = cellbaseTx.hash();
      await displayTransaction(client, cellbaseHash);
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  divider("Summary: CKB Transaction Lifecycle");

  console.log(`
  A CKB transaction goes through these stages:

  1. CONSTRUCTION
     The sender builds the transaction off-chain:
     - Selects input cells to consume (must have enough capacity).
     - Defines output cells to create.
     - Adds cell_deps pointing to the script code cells.
     - Sets header_deps if scripts need block header data.

  2. SIGNING
     The sender signs the transaction hash and places the signature
     in the witnesses array. The tx_hash covers everything EXCEPT
     witnesses, preventing a circular dependency.

  3. SUBMISSION
     The signed transaction is sent to a CKB node via RPC
     (send_transaction). The node does preliminary validation.

  4. PENDING (Mempool)
     The transaction waits in the mempool (transaction pool). Miners
     can see it and choose to include it in a block.

  5. PROPOSED
     A miner includes the transaction in a block's "proposal zone."
     This is CKB's two-step confirmation process (NC-Max consensus):
     the tx is proposed first, then committed in a later block.

  6. COMMITTED
     The transaction is included in a block's commitment zone.
     The input cells are now dead; the output cells are now live.
     The state transition is finalized.

  Key takeaways:
  - Transactions CONSUME input cells and CREATE output cells.
  - The fee = sum(input capacities) - sum(output capacities).
  - Cell deps link scripts to their on-chain code.
  - Witnesses carry signatures and other proof data.
  - There is no in-place mutation. All state changes are consume-and-create.
  `);

  console.log("Done! Try modifying this script to explore specific transactions.");
  console.log("You can paste any testnet tx hash into the displayTransaction() function.\n");
}

// Run the main function
main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
