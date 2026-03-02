/**
 * ============================================================================
 * Lesson 10: Your First Type Script — Counter Interaction Demo
 * ============================================================================
 *
 * This TypeScript file demonstrates how to interact with a COUNTER TYPE SCRIPT
 * on the Nervos CKB blockchain. It is a conceptual walkthrough that explains
 * each step of creating, updating, and (optionally) destroying cells governed
 * by a custom type script.
 *
 * ============================================================================
 * IMPORTANT: Conceptual vs. Executable Code
 * ============================================================================
 *
 * This file is heavily commented and structured as a learning guide. Some
 * operations (like deploying a compiled RISC-V binary or signing transactions
 * with a real private key) require a full local CKB dev environment and
 * compiled contract binary. Where actual execution is not possible in this
 * standalone demo, we mark those sections as CONCEPTUAL and explain what
 * would happen in a real deployment.
 *
 * The executable portions connect to the CKB testnet and demonstrate real
 * RPC calls, address parsing, and cell querying — the same patterns you
 * will use in production.
 *
 * ============================================================================
 * What You Will Learn:
 * ============================================================================
 *
 *   1. What type scripts are and why they matter
 *   2. How to reference a deployed type script in a cell
 *   3. How to create a cell with a counter type script (initial value = 0)
 *   4. How to increment the counter (consume old cell, create new cell)
 *   5. What happens when you try an invalid update (e.g., skip a number)
 *   6. How to destroy a counter cell (reclaim capacity)
 *
 * Prerequisites:
 *   - Node.js 18+ installed
 *   - npm install (to get @ckb-ccc/core, tsx, typescript)
 *   - Understanding of CKB cells, transactions, and lock scripts (Lessons 1-9)
 *
 * Run with:
 *   npx tsx src/index.ts
 *
 * ============================================================================
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================================
// Helper: Print Section Headers
// ============================================================================
function printSection(title: string): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}\n`);
}

function printInfo(msg: string): void {
  console.log(`  [INFO] ${msg}`);
}

function printConcept(msg: string): void {
  console.log(`  [CONCEPT] ${msg}`);
}

function printStep(step: number, msg: string): void {
  console.log(`\n  --- Step ${step}: ${msg} ---\n`);
}

// ============================================================================
// Helper: Encode a counter value as 8 bytes (u64 little-endian)
// ============================================================================
// Our on-chain Rust type script stores the counter as a u64 in little-endian
// byte order. This helper creates the hex-encoded data that matches.
//
// Example:
//   counterToHex(0)  => "0x0000000000000000"
//   counterToHex(1)  => "0x0100000000000000"
//   counterToHex(42) => "0x2a00000000000000"
//   counterToHex(256) => "0x0001000000000000"
//
// Why little-endian?
//   - RISC-V (CKB-VM's architecture) is little-endian.
//   - u64::from_le_bytes in Rust expects this byte order.
//   - It is the natural representation for the target platform.
// ============================================================================
function counterToHex(value: number): string {
  // Create an 8-byte buffer and write the value as a 64-bit little-endian integer.
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);

  // DataView.setBigUint64(offset, value, littleEndian)
  // The third parameter `true` means little-endian byte order.
  view.setBigUint64(0, BigInt(value), true);

  // Convert the buffer to a hex string prefixed with "0x"
  const bytes = new Uint8Array(buffer);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return "0x" + hex;
}

// ============================================================================
// Helper: Decode a hex-encoded counter value back to a number
// ============================================================================
function hexToCounter(hex: string): number {
  // Remove "0x" prefix
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;

  // Parse pairs of hex characters into bytes
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }

  // Read as a 64-bit little-endian unsigned integer
  const view = new DataView(bytes.buffer);
  return Number(view.getBigUint64(0, true));
}

// ============================================================================
// Main Application
// ============================================================================
async function main(): Promise<void> {
  printSection("Lesson 10: Your First Type Script (Counter)");

  console.log("  This lesson demonstrates how type scripts work on CKB by");
  console.log("  walking through a counter pattern: a cell whose data can");
  console.log("  only be incremented by 1 per transaction.\n");

  // ==========================================================================
  // Step 1: Connect to CKB Testnet
  // ==========================================================================
  // We connect to the public testnet to demonstrate real RPC interactions.
  // In a full workflow, you would connect to a local devnet where you have
  // full control and can deploy your own scripts.
  // ==========================================================================

  printStep(1, "Connect to CKB Testnet");

  const client = new ccc.ClientPublicTestnet();
  const tip = await client.getTip();
  printInfo(`Connected to CKB testnet. Current block: #${tip}`);

  // ==========================================================================
  // Step 2: Understand the Counter Type Script Reference
  // ==========================================================================
  // To use a type script, you need to reference the compiled RISC-V binary
  // that has been deployed on-chain. The reference consists of:
  //
  //   - code_hash: A blake2b hash that identifies the script code.
  //   - hash_type: How code_hash is resolved:
  //       * "type" — code_hash matches the TYPE SCRIPT HASH of the cell
  //         containing the code. (Recommended: survives code cell upgrades.)
  //       * "data1" — code_hash matches the DATA HASH of the cell containing
  //         the code. (Pinned to exact binary.)
  //   - args: Arguments passed to the script. For our counter, this could
  //     be empty or contain an owner pubkey hash for access control.
  //
  // In this lesson, we use a placeholder code_hash since the counter script
  // has not been deployed to the public testnet. In a real workflow, you
  // would:
  //   1. Compile the Rust contract: cargo build --target riscv64imac-unknown-none-elf
  //   2. Deploy the binary to a cell on-chain
  //   3. Use that cell's type hash or data hash as the code_hash
  // ==========================================================================

  printStep(2, "Define the Counter Type Script");

  // CONCEPTUAL: This would be the real code_hash after deployment.
  // For demonstration, we use a well-known placeholder.
  const COUNTER_CODE_HASH =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

  printConcept("In a real deployment, you would:");
  printConcept("  1. Compile: cargo build --release --target riscv64imac-unknown-none-elf");
  printConcept("  2. Deploy the binary to a cell on testnet/devnet");
  printConcept("  3. Record the deployed cell's type script hash");
  printConcept(`  4. Use that hash as code_hash (placeholder: ${COUNTER_CODE_HASH.slice(0, 20)}...)`);
  console.log("");

  // Construct the type script object.
  // This is what you would set as the `type` field on a cell.
  const counterTypeScript = ccc.Script.from({
    codeHash: COUNTER_CODE_HASH,
    hashType: "type",
    args: "0x", // No extra args for this simple counter
  });

  printInfo("Counter type script:");
  printInfo(`  code_hash: ${counterTypeScript.codeHash.slice(0, 20)}...`);
  printInfo(`  hash_type: ${counterTypeScript.hashType}`);
  printInfo(`  args:      ${counterTypeScript.args}`);

  // ==========================================================================
  // Step 3: Create a Counter Cell (Initialize to 0)
  // ==========================================================================
  // Creating a counter cell means building a transaction with:
  //
  //   INPUTS:
  //     - One or more cells owned by us (to provide CKB capacity)
  //
  //   OUTPUTS:
  //     - A new cell with:
  //         * lock: our lock script (so we can update/destroy it later)
  //         * type: the counter type script (enforces counter rules)
  //         * data: 0x0000000000000000 (counter = 0, u64 little-endian)
  //         * capacity: enough to cover the cell size (61 + 8 = 69 CKB min)
  //     - A change cell returning leftover capacity to us
  //
  // When this transaction is submitted, CKB-VM will execute the counter
  // type script for the output cell. The script will:
  //   1. See 0 inputs in GroupInput (no existing counter cells being consumed)
  //   2. See 1 output in GroupOutput (the new counter cell)
  //   3. Recognize this as CREATION
  //   4. Verify that the output data is 0 -> SUCCESS
  //
  // If we tried to create a cell with data = 1 (or any non-zero value),
  // the type script would reject the transaction with error code 6
  // (ERROR_COUNTER_NOT_ZERO_ON_CREATION).
  // ==========================================================================

  printStep(3, "Create a Counter Cell (value = 0)");

  // Demonstrate the data encoding
  const initialData = counterToHex(0);
  printInfo(`Counter value: 0`);
  printInfo(`Encoded as u64 LE hex: ${initialData}`);
  printInfo(`Decoded back: ${hexToCounter(initialData)}`);
  console.log("");

  // Show what the transaction would look like
  printConcept("Transaction to CREATE a counter cell:");
  printConcept("");
  printConcept("  INPUTS:");
  printConcept("    [0] A cell we own (provides capacity for the new counter cell)");
  printConcept("        lock: <our secp256k1 lock script>");
  printConcept("        type: none");
  printConcept("        data: 0x");
  printConcept("");
  printConcept("  OUTPUTS:");
  printConcept("    [0] The new counter cell");
  printConcept("        lock: <our secp256k1 lock script>");
  printConcept(`        type: counter type script (code_hash: ${COUNTER_CODE_HASH.slice(0, 16)}...)`);
  printConcept(`        data: ${initialData}  (counter = 0)`);
  printConcept("        capacity: 69 CKB (61 base + 8 bytes data)");
  printConcept("");
  printConcept("    [1] Change cell (leftover capacity returned to us)");
  printConcept("        lock: <our secp256k1 lock script>");
  printConcept("        type: none");
  printConcept("        data: 0x");
  console.log("");

  // The actual code to build this transaction with CCC would be:
  printConcept("Code to build the creation transaction:");
  console.log("");
  console.log(`    // Build the output cell`);
  console.log(`    const counterCell = ccc.Cell.from({`);
  console.log(`      cellOutput: {`);
  console.log(`        capacity: ccc.fixedPointFrom("69"),  // 69 CKB`);
  console.log(`        lock: senderLockScript,`);
  console.log(`        type: counterTypeScript,`);
  console.log(`      },`);
  console.log(`      outputData: "${initialData}",  // counter = 0`);
  console.log(`    });`);
  console.log("");

  // ==========================================================================
  // Step 4: Increment the Counter (0 -> 1)
  // ==========================================================================
  // Incrementing the counter means building a transaction that:
  //   1. CONSUMES the current counter cell (as an input)
  //   2. CREATES a new counter cell (as an output) with data = old_data + 1
  //
  // This is a fundamental pattern in CKB: you cannot "modify" a cell in place.
  // Instead, you consume the old cell and create a new one with updated data.
  // The type script verifies that this state transition is valid.
  //
  // When this transaction is submitted, CKB-VM will execute the counter
  // type script. The script will:
  //   1. See 1 input in GroupInput (the old counter cell, data = 0)
  //   2. See 1 output in GroupOutput (the new counter cell, data = 1)
  //   3. Recognize this as UPDATE
  //   4. Verify that output_data (1) == input_data (0) + 1 -> SUCCESS
  // ==========================================================================

  printStep(4, "Increment the Counter (0 -> 1)");

  const oldData = counterToHex(0);
  const newData = counterToHex(1);

  printInfo(`Old counter value: ${hexToCounter(oldData)} (hex: ${oldData})`);
  printInfo(`New counter value: ${hexToCounter(newData)} (hex: ${newData})`);
  printInfo(`Difference: ${hexToCounter(newData) - hexToCounter(oldData)} (must be exactly 1)`);
  console.log("");

  printConcept("Transaction to INCREMENT the counter (0 -> 1):");
  printConcept("");
  printConcept("  INPUTS:");
  printConcept("    [0] The existing counter cell (will be consumed / 'killed')");
  printConcept("        lock: <our secp256k1 lock script>");
  printConcept(`        type: counter type script`);
  printConcept(`        data: ${oldData}  (counter = 0)`);
  printConcept("");
  printConcept("  OUTPUTS:");
  printConcept("    [0] The new counter cell (replaces the old one)");
  printConcept("        lock: <our secp256k1 lock script>");
  printConcept(`        type: counter type script  (SAME type script as input)`);
  printConcept(`        data: ${newData}  (counter = 1)`);
  printConcept("        capacity: 69 CKB");
  printConcept("");
  printConcept("  The type script sees:");
  printConcept("    GroupInput[0].data  = 0  (old value)");
  printConcept("    GroupOutput[0].data = 1  (new value)");
  printConcept("    1 == 0 + 1? YES -> Transaction is VALID");
  console.log("");

  // The actual code to build this transaction with CCC:
  printConcept("Code to build the increment transaction:");
  console.log("");
  console.log(`    // Find the existing counter cell on-chain`);
  console.log(`    // (You would know its outPoint from the creation tx)`);
  console.log(`    const existingCell = await client.getCellLive(counterOutPoint, true);`);
  console.log("");
  console.log(`    // Read the current counter value`);
  console.log(`    const currentValue = hexToCounter(existingCell.outputData);`);
  console.log(`    const nextValue = currentValue + 1;`);
  console.log("");
  console.log(`    // Build transaction: consume old cell, create new cell`);
  console.log(`    const tx = ccc.Transaction.from({`);
  console.log(`      inputs: [{ previousOutput: counterOutPoint }],`);
  console.log(`      outputs: [{`);
  console.log(`        capacity: existingCell.cellOutput.capacity,`);
  console.log(`        lock: existingCell.cellOutput.lock,`);
  console.log(`        type: existingCell.cellOutput.type,  // Keep same type script`);
  console.log(`      }],`);
  console.log(`      outputsData: [counterToHex(nextValue)],  // Incremented data`);
  console.log(`    });`);
  console.log("");

  // ==========================================================================
  // Step 5: What Happens with an Invalid Update?
  // ==========================================================================
  // Let's see what happens if someone tries to cheat by skipping a number
  // (e.g., going from 0 directly to 5) or decrementing.
  //
  // The type script will REJECT these transactions because:
  //   output_data != input_data + 1
  //
  // This is the power of type scripts: they enforce rules at the consensus
  // level. No matter who submits the transaction, invalid state transitions
  // are impossible.
  // ==========================================================================

  printStep(5, "Invalid Updates (Rejected by Type Script)");

  printInfo("Let's see what happens with invalid state transitions:\n");

  // Case A: Try to skip from 0 to 5
  const skipData = counterToHex(5);
  console.log(`  INVALID Case A: Skip from 0 to 5`);
  console.log(`    Input data:  ${oldData}  (counter = 0)`);
  console.log(`    Output data: ${skipData}  (counter = 5)`);
  console.log(`    Check: 5 == 0 + 1?  NO -> ERROR_COUNTER_NOT_INCREMENTED (code 8)`);
  console.log(`    Result: Transaction REJECTED by all nodes\n`);

  // Case B: Try to decrement from 1 to 0
  const decrementInput = counterToHex(1);
  const decrementOutput = counterToHex(0);
  console.log(`  INVALID Case B: Decrement from 1 to 0`);
  console.log(`    Input data:  ${decrementInput}  (counter = 1)`);
  console.log(`    Output data: ${decrementOutput}  (counter = 0)`);
  console.log(`    Check: 0 == 1 + 1?  NO -> ERROR_COUNTER_NOT_INCREMENTED (code 8)`);
  console.log(`    Result: Transaction REJECTED by all nodes\n`);

  // Case C: Try to keep the same value
  const sameInput = counterToHex(3);
  const sameOutput = counterToHex(3);
  console.log(`  INVALID Case C: Keep same value (3 to 3)`);
  console.log(`    Input data:  ${sameInput}  (counter = 3)`);
  console.log(`    Output data: ${sameOutput}  (counter = 3)`);
  console.log(`    Check: 3 == 3 + 1?  NO -> ERROR_COUNTER_NOT_INCREMENTED (code 8)`);
  console.log(`    Result: Transaction REJECTED by all nodes\n`);

  // Case D: Try to create with non-zero initial value
  const badInitial = counterToHex(42);
  console.log(`  INVALID Case D: Create counter starting at 42`);
  console.log(`    No inputs with counter type script (this is a creation)`);
  console.log(`    Output data: ${badInitial}  (counter = 42)`);
  console.log(`    Check: creation requires counter == 0. 42 != 0`);
  console.log(`    ERROR_COUNTER_NOT_ZERO_ON_CREATION (code 6)`);
  console.log(`    Result: Transaction REJECTED by all nodes\n`);

  // Case E: Try to create with wrong data length
  console.log(`  INVALID Case E: Create counter with wrong data size`);
  console.log(`    Output data: 0x00000000  (only 4 bytes, need 8)`);
  console.log(`    ERROR_INVALID_DATA_LENGTH (code 5)`);
  console.log(`    Result: Transaction REJECTED by all nodes\n`);

  // ==========================================================================
  // Step 6: Destroy a Counter Cell
  // ==========================================================================
  // To destroy a counter cell, you consume it as an input but do NOT create
  // any output with the same type script. The capacity from the consumed
  // cell is returned to you as a plain CKB cell (no type script).
  //
  // The type script will:
  //   1. See 1 input in GroupInput (the counter cell being destroyed)
  //   2. See 0 outputs in GroupOutput (no replacement)
  //   3. Recognize this as DESTRUCTION
  //   4. Allow it unconditionally -> SUCCESS
  // ==========================================================================

  printStep(6, "Destroy a Counter Cell");

  printConcept("Transaction to DESTROY a counter cell:");
  printConcept("");
  printConcept("  INPUTS:");
  printConcept("    [0] The counter cell to destroy");
  printConcept("        lock: <our secp256k1 lock script>");
  printConcept(`        type: counter type script`);
  printConcept(`        data: ${counterToHex(7)}  (counter = 7, for example)`);
  printConcept("");
  printConcept("  OUTPUTS:");
  printConcept("    [0] Plain CKB cell (capacity reclaimed, no type script)");
  printConcept("        lock: <our secp256k1 lock script>");
  printConcept("        type: none  <-- NO counter type script on any output");
  printConcept("        data: 0x");
  printConcept("");
  printConcept("  The type script sees:");
  printConcept("    GroupInput count  = 1  (counter cell being consumed)");
  printConcept("    GroupOutput count = 0  (no replacement)");
  printConcept("    This is DESTRUCTION -> allowed unconditionally");
  printConcept("    Result: Transaction VALID");
  console.log("");

  // ==========================================================================
  // Step 7: Demonstrate Data Encoding/Decoding
  // ==========================================================================
  // Let's verify our encoding/decoding helpers work correctly for various
  // counter values. This is the same encoding the on-chain Rust script uses.
  // ==========================================================================

  printStep(7, "Counter Data Encoding/Decoding Verification");

  const testValues = [0, 1, 2, 42, 100, 255, 256, 1000, 65535, 1_000_000];
  printInfo("Verifying u64 little-endian encoding for various counter values:\n");

  for (const value of testValues) {
    const encoded = counterToHex(value);
    const decoded = hexToCounter(encoded);
    const match = decoded === value ? "OK" : "MISMATCH!";
    console.log(
      `    ${String(value).padStart(10)} -> ${encoded} -> ${String(decoded).padStart(10)}  [${match}]`
    );
  }

  // ==========================================================================
  // Step 8: Query for Counter Cells on Testnet (Conceptual)
  // ==========================================================================
  // In a real application, you would search for your counter cells using
  // the CKB indexer. You would query by type script to find all cells
  // governed by your counter contract.
  // ==========================================================================

  printStep(8, "Querying Counter Cells (Pattern)");

  printConcept("To find your counter cells on-chain, use the CCC SDK:");
  console.log("");
  console.log(`    // Find all live counter cells (regardless of owner)`);
  console.log(`    for await (const cell of client.findCellsByType(counterTypeScript, true)) {`);
  console.log(`      const value = hexToCounter(cell.outputData);`);
  console.log(`      console.log(\`Counter cell at \${cell.outPoint.txHash}: value = \${value}\`);`);
  console.log(`    }`);
  console.log("");
  console.log(`    // Find counter cells owned by a specific address`);
  console.log(`    for await (const cell of client.findCellsByLock(myLock, counterTypeScript, true)) {`);
  console.log(`      const value = hexToCounter(cell.outputData);`);
  console.log(`      console.log(\`My counter: \${value}\`);`);
  console.log(`    }`);
  console.log("");

  // ==========================================================================
  // Step 9: Real-World Applications of Type Scripts
  // ==========================================================================

  printStep(9, "Real-World Applications of Type Scripts");

  printInfo("The counter is a simple example, but type scripts power many");
  printInfo("real-world applications on CKB:\n");

  console.log("    1. xUDT (Extensible User Defined Tokens)");
  console.log("       Type script ensures: total input tokens == total output tokens");
  console.log("       (conservation of supply, like conservation of energy)\n");

  console.log("    2. Spore Protocol (NFTs)");
  console.log("       Type script ensures: each NFT has a unique ID and");
  console.log("       immutable content (cannot be duplicated or altered)\n");

  console.log("    3. Nervos DAO");
  console.log("       Type script enforces: deposit/withdrawal rules,");
  console.log("       compensation calculation, and lock periods\n");

  console.log("    4. AMM DEX (Automated Market Maker)");
  console.log("       Type script enforces: constant product formula (x*y=k),");
  console.log("       preventing invalid trades that would drain liquidity\n");

  console.log("    5. State Channels");
  console.log("       Type script enforces: correct state transitions in");
  console.log("       off-chain payment channels with on-chain settlement\n");

  // ==========================================================================
  // Summary
  // ==========================================================================

  printSection("Summary");

  printInfo("In this lesson, you learned:\n");
  console.log("  1. TYPE SCRIPTS validate WHAT a cell can contain and how it changes.");
  console.log("     They run for BOTH inputs AND outputs in a transaction.\n");
  console.log("  2. The COUNTER PATTERN is a state machine enforced by a type script:");
  console.log("     - Create: data must be 0");
  console.log("     - Update: new data must equal old data + 1");
  console.log("     - Destroy: always allowed\n");
  console.log("  3. TYPE SCRIPTS vs LOCK SCRIPTS:");
  console.log("     - Lock = WHO can modify (authorization)");
  console.log("     - Type = WHAT modifications are valid (data integrity)\n");
  console.log("  4. CKB cells are IMMUTABLE — to update, you consume the old cell");
  console.log("     and create a new one. The type script validates the transition.\n");
  console.log("  5. Type scripts enforce rules at the CONSENSUS LEVEL —");
  console.log("     invalid state transitions are rejected by ALL nodes.\n");
  console.log("  6. SCRIPT GROUPS: CKB groups cells by their complete type script");
  console.log("     and runs the script once per group, not once per cell.\n");

  console.log(`\n${"=".repeat(70)}\n`);
}

// ============================================================================
// Run the application
// ============================================================================
main().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
