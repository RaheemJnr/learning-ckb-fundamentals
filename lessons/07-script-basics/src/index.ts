/**
 * ============================================================================
 * Lesson 7: Lock Scripts & Type Scripts
 * ============================================================================
 *
 * This CLI application provides a deep exploration of CKB's script system —
 * the mechanism that makes every cell programmable and every transaction
 * verifiable.
 *
 * What you will learn:
 *   1. How scripts work on CKB (validators, not executors)
 *   2. Lock scripts: how they enforce ownership and spending conditions
 *   3. Type scripts: how they validate cell creation and state transitions
 *   4. Script structure: code_hash, hash_type, and args
 *   5. hash_type variants: "type" vs "data" vs "data1" vs "data2"
 *   6. Script groups: how CKB batches cells with the same script
 *   7. Cell deps: how a script's code is loaded for execution
 *   8. Common built-in scripts (SECP256K1-BLAKE160, multisig)
 *
 * Key Insight — Scripts Are Validators, Not Executors:
 *   Unlike Ethereum's smart contracts, which execute arbitrary logic and
 *   produce state changes, CKB scripts are pure validators. A transaction
 *   proposes a state transition (inputs -> outputs), and scripts simply
 *   return success or failure. If any script returns failure, the entire
 *   transaction is rejected. Scripts do not modify state — they only verify
 *   that the proposed state transition is valid.
 *
 * Prerequisites:
 *   - Node.js 18+ installed
 *   - npm install (to get @ckb-ccc/core, tsx, typescript)
 *   - Familiarity with Lessons 1-6 (Cell Model, Transactions, Cell Queries)
 *
 * Run with:
 *   npx tsx src/index.ts
 *
 * ============================================================================
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================================
// ANSI Colors for Terminal Formatting
// ============================================================================

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/** Print a prominent section header. */
function printSection(title: string): void {
  console.log(`\n${C.bold}${C.cyan}${"=".repeat(60)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${"=".repeat(60)}${C.reset}`);
}

/** Print an informational line with a bullet. */
function printInfo(message: string): void {
  console.log(`  ${C.blue}>${C.reset} ${message}`);
}

/** Print a warning message. */
function printWarning(message: string): void {
  console.log(`  ${C.yellow}! ${message}${C.reset}`);
}

/** Print a concept explanation with indentation. */
function printConcept(message: string): void {
  console.log(`  ${C.dim}${message}${C.reset}`);
}

/** Truncate long hex strings for readability. */
function truncateHex(hex: string, maxLen: number = 24): string {
  if (hex.length <= maxLen) return hex;
  const half = Math.floor((maxLen - 5) / 2);
  return `${hex.slice(0, half + 2)}...${hex.slice(-half)}`;
}

/** Convert shannons to human-readable CKB string. */
function formatCKB(shannons: bigint): string {
  const whole = shannons / 100_000_000n;
  const frac = shannons % 100_000_000n;
  return `${whole}.${frac.toString().padStart(8, "0")} CKB`;
}

/** Format a CKB Script object into readable multi-line output. */
function formatScript(
  script: { codeHash: string; hashType: string; args: string } | null | undefined,
  indent: number = 4
): string {
  if (!script) {
    return `${" ".repeat(indent)}${C.dim}(none)${C.reset}`;
  }
  const pad = " ".repeat(indent);
  return [
    `${pad}${C.bold}code_hash${C.reset}: ${C.cyan}${truncateHex(script.codeHash, 30)}${C.reset}`,
    `${pad}${C.bold}hash_type${C.reset}: ${C.yellow}${script.hashType}${C.reset}`,
    `${pad}${C.bold}args${C.reset}:      ${C.magenta}${truncateHex(script.args, 30)}${C.reset}`,
  ].join("\n");
}

/** Print a separator line. */
function separator(char: string = "-", length: number = 60): void {
  console.log(`  ${C.dim}${char.repeat(length)}${C.reset}`);
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * A well-known CKB testnet faucet address.
 *
 * This address uses the default SECP256K1-BLAKE160 lock script, making it
 * perfect for demonstrating how lock scripts work. The address typically has
 * many live cells on testnet.
 */
const DEMO_TESTNET_ADDRESS =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqfkcv98jy3q3fhn84n7s6r7c0kpqtsx56salqyeg";

// ============================================================================
// Main Application
// ============================================================================

async function main(): Promise<void> {
  console.log("\n");
  printSection("Lesson 7: Lock Scripts & Type Scripts");
  console.log(
    "\n  A deep dive into CKB's script system — the engine that makes\n" +
    "  every cell programmable and every transaction verifiable.\n"
  );

  // ==========================================================================
  // Step 1: Connect to CKB Testnet
  // ==========================================================================
  //
  // As in previous lessons, we start by establishing a connection to the
  // CKB public testnet. This gives us access to real on-chain data
  // including live cells, transactions, and script deployments.
  // ==========================================================================

  printSection("Step 1: Connect to CKB Testnet");

  const client = new ccc.ClientPublicTestnet();
  const tip = await client.getTip();
  printInfo(`Connected to CKB testnet. Current tip: block #${tip}`);
  console.log("");

  // ==========================================================================
  // Step 2: Explore the Default Lock Script (SECP256K1-BLAKE160)
  // ==========================================================================
  //
  // WHAT IS A LOCK SCRIPT?
  //
  // Every cell in CKB must have a lock script. The lock script determines
  // who can SPEND (consume) the cell. When someone tries to use a cell as
  // a transaction input, CKB's VM runs the cell's lock script. If the
  // script returns 0 (success), the spending is allowed. If it returns
  // any non-zero value or errors out, the transaction is rejected.
  //
  // IMPORTANT: Lock scripts run ONLY on input cells. They are NOT executed
  // for output cells. This makes sense — you need to prove you have
  // permission to spend existing cells, but you do not need permission to
  // create new cells (that's the type script's job).
  //
  // THE DEFAULT LOCK SCRIPT: SECP256K1-BLAKE160
  //
  // The most common lock script on CKB is "secp256k1-blake160". It works
  // like a Bitcoin signature verification:
  //   1. The `args` field contains a 20-byte blake160 hash of a public key
  //   2. The transaction witness must contain a valid secp256k1 signature
  //   3. The script verifies: sign(tx_hash, private_key) matches the pubkey
  //
  // This is analogous to Bitcoin's P2PKH (Pay-to-Public-Key-Hash).
  //
  // THE THREE FIELDS OF A SCRIPT:
  //
  //   code_hash: A 32-byte hash that identifies which on-chain program to
  //              run. This is NOT the lock hash — it points to the script
  //              code itself (the RISC-V binary deployed on-chain).
  //
  //   hash_type: Determines how code_hash references the script code.
  //              More on this in Step 6.
  //
  //   args:      Arbitrary bytes passed to the script as arguments.
  //              For SECP256K1-BLAKE160, this is the pubkey hash.
  //              For multisig, this encodes the M-of-N configuration.
  //              Each script defines its own args format.
  //
  // ==========================================================================

  printSection("Step 2: The Default Lock Script (SECP256K1-BLAKE160)");

  // Decode a CKB address to reveal the lock script it encodes.
  // Every CKB address is simply a lock script serialized in a specific format.
  const address = await ccc.Address.fromString(DEMO_TESTNET_ADDRESS, client);
  const lockScript = address.script;

  printInfo("Every CKB address encodes a lock script.");
  printInfo(`Address: ${DEMO_TESTNET_ADDRESS.slice(0, 40)}...`);
  printInfo("Decoded lock script:");
  console.log(formatScript(lockScript as any, 6));
  console.log("");

  // Now let's fetch a real cell that uses this lock script and examine it
  printInfo("Fetching a live cell that uses this lock script...\n");

  let sampleCell: ccc.Cell | undefined;
  for await (const cell of client.findCellsByLock(lockScript, undefined, true, "desc", 1)) {
    sampleCell = cell;
    break;
  }

  if (sampleCell) {
    const op = sampleCell.outPoint;
    printInfo(`Found cell: ${truncateHex(op.txHash)}:${op.index}`);
    printInfo(`Capacity: ${formatCKB(sampleCell.cellOutput.capacity)}`);
    printInfo("Lock script on this cell:");
    console.log(formatScript(sampleCell.cellOutput.lock as any, 6));
    console.log("");

    // Explain the fields
    printInfo("How this lock script works:");
    printConcept("  1. code_hash identifies the SECP256K1-BLAKE160 program deployed on-chain");
    printConcept("  2. hash_type 'type' means code_hash refers to the type script hash of the");
    printConcept("     cell containing the code (more on this in Step 6)");
    printConcept("  3. args contains the 20-byte blake160 hash of the owner's public key");
    printConcept("  4. To spend this cell, you must provide a valid secp256k1 signature");
    printConcept("     in the transaction witness that matches this pubkey hash");
  } else {
    printWarning("No cells found for this address. The testnet faucet may be empty.");
  }

  console.log("");

  // ==========================================================================
  // Step 3: Explore Cells with Type Scripts
  // ==========================================================================
  //
  // WHAT IS A TYPE SCRIPT?
  //
  // A type script is OPTIONAL. While lock scripts protect ownership, type
  // scripts validate STATE TRANSITIONS. A type script defines rules for
  // how a cell can be created, modified, or destroyed.
  //
  // CRITICAL DIFFERENCE: EXECUTION TIMING
  //
  //   Lock scripts: Run ONLY on input cells (when spending/consuming)
  //   Type scripts: Run on BOTH input cells AND output cells
  //
  // This means:
  //   - When you CREATE a cell (output with type script): type script runs
  //     to validate the creation is valid
  //   - When you CONSUME a cell (input with type script): type script runs
  //     to validate the destruction/transformation is valid
  //   - When you SPEND a cell (input with lock script): lock script runs
  //     to validate you have permission
  //
  // COMMON USE CASES FOR TYPE SCRIPTS:
  //
  //   - UDT (User Defined Tokens): Ensure token supply is conserved
  //     (input amount == output amount, unless minting/burning)
  //   - NFTs (Spore Protocol): Validate NFT creation rules, immutability
  //   - Nervos DAO: Enforce deposit/withdrawal rules and interest calculation
  //   - Custom state machines: Any state transition logic you can imagine
  //
  // ==========================================================================

  printSection("Step 3: Exploring Type Scripts");
  printInfo("Type scripts validate how cells are created and consumed.");
  printInfo("They run on BOTH inputs AND outputs (unlike lock scripts).\n");

  // Let's find cells that have type scripts
  printInfo("Searching for cells with type scripts...\n");

  let typedCellCount = 0;
  const typedCells: ccc.Cell[] = [];

  for await (const cell of client.findCellsByLock(lockScript, undefined, true, "desc", 20)) {
    if (cell.cellOutput.type) {
      typedCells.push(cell);
      typedCellCount++;
      if (typedCellCount >= 3) break; // Collect up to 3 for display
    }
  }

  if (typedCells.length > 0) {
    for (let i = 0; i < typedCells.length; i++) {
      const cell = typedCells[i];
      const op = cell.outPoint;
      console.log(`  ${C.bold}${C.green}--- Typed Cell #${i + 1} ---${C.reset}`);
      console.log(`    OutPoint: ${truncateHex(op.txHash)}:${op.index}`);
      console.log(`    Capacity: ${C.green}${formatCKB(cell.cellOutput.capacity)}${C.reset}`);
      console.log(`    Lock Script:`);
      console.log(formatScript(cell.cellOutput.lock as any, 6));
      console.log(`    Type Script:`);
      console.log(formatScript(cell.cellOutput.type as any, 6));

      const dataLen = cell.outputData ? (cell.outputData.length - 2) / 2 : 0;
      console.log(`    Data: ${dataLen} bytes${dataLen > 0 ? ` (${truncateHex(cell.outputData, 20)})` : " (empty)"}`);
      console.log("");
    }

    printInfo("Each of these cells has a type script that validates its lifecycle.");
    printInfo("The type script runs when the cell is created (output) AND consumed (input).");
  } else {
    printInfo("No typed cells found for this address. Searching for Nervos DAO cells instead...\n");

    // Fall back to searching for Nervos DAO cells, which always have type scripts
    try {
      const daoInfo = await client.getKnownScript(ccc.KnownScript.NervosDao);
      const daoType = ccc.Script.from({
        codeHash: daoInfo.codeHash,
        hashType: daoInfo.hashType,
        args: "0x",
      });

      printInfo("Nervos DAO type script:");
      console.log(formatScript(daoType as any, 6));
      console.log("");

      let daoCount = 0;
      for await (const cell of client.findCellsByType(daoType, true, "desc", 3)) {
        daoCount++;
        const op = cell.outPoint;
        console.log(
          `  DAO Cell #${daoCount}: ${truncateHex(op.txHash)}:${op.index} | ` +
          `${C.green}${formatCKB(cell.cellOutput.capacity)}${C.reset}`
        );
      }

      if (daoCount === 0) {
        printInfo("No Nervos DAO cells found on testnet at this time.");
      }
    } catch (err) {
      printWarning(`Could not query Nervos DAO: ${err}`);
    }
  }

  console.log("");

  // ==========================================================================
  // Step 4: Script Groups — How CKB Batches Script Execution
  // ==========================================================================
  //
  // WHAT ARE SCRIPT GROUPS?
  //
  // When a transaction has multiple cells that use the SAME script (same
  // code_hash + hash_type + args), CKB does NOT run the script once per
  // cell. Instead, it groups all cells with identical scripts into a
  // "script group" and runs the script ONCE for the entire group.
  //
  // This is a critical optimization:
  //   - A transaction spending 10 cells from the same address only runs
  //     the lock script ONCE, not 10 times
  //   - The script receives indices of ALL cells in its group, so it can
  //     inspect all of them in a single execution
  //
  // HOW SCRIPT GROUPS WORK:
  //
  //   1. CKB collects all input/output cells
  //   2. Groups cells by their script (code_hash + hash_type + args)
  //   3. For each unique lock script on inputs: run once, passing all
  //      input indices that share this lock script
  //   4. For each unique type script on inputs AND outputs: run once,
  //      passing all input+output indices that share this type script
  //
  // WHY THIS MATTERS:
  //
  //   - Performance: Fewer script executions = faster verification
  //   - Batching: Scripts can validate properties across multiple cells
  //     (e.g., "total UDT input amount == total UDT output amount")
  //   - Gas efficiency: In CKB's cycles model, grouped execution is cheaper
  //
  // ==========================================================================

  printSection("Step 4: Script Groups");
  printInfo("CKB groups cells with identical scripts and runs each script once.\n");

  // Demonstrate by fetching multiple cells with the same lock script
  const groupCells: ccc.Cell[] = [];
  for await (const cell of client.findCellsByLock(lockScript, undefined, true, "desc", 5)) {
    groupCells.push(cell);
  }

  if (groupCells.length >= 2) {
    printInfo(`Found ${groupCells.length} cells with the same lock script.`);
    printInfo("In a transaction spending all of these, CKB would:");
    console.log("");

    // Check which cells share the exact same lock script
    const lockHash = groupCells[0].cellOutput.lock.hash();
    printInfo(`Lock script hash: ${C.cyan}${truncateHex(lockHash, 30)}${C.reset}`);
    console.log("");

    for (let i = 0; i < groupCells.length; i++) {
      const cell = groupCells[i];
      const cellLockHash = cell.cellOutput.lock.hash();
      const same = cellLockHash === lockHash;
      console.log(
        `    Cell #${i}: ${truncateHex(cell.outPoint.txHash, 16)}:${cell.outPoint.index} | ` +
        `Lock hash: ${truncateHex(cellLockHash, 16)} | ` +
        `${same ? C.green + "SAME GROUP" + C.reset : C.yellow + "DIFFERENT GROUP" + C.reset}`
      );
    }

    console.log("");
    printInfo("All cells with the same lock script hash form ONE script group.");
    printInfo("The SECP256K1-BLAKE160 lock script runs ONCE for the entire group.");
    printInfo("It verifies ONE signature that covers the entire transaction.");
    console.log("");

    // Show type script groups too
    const typeGroups = new Map<string, number>();
    for (const cell of groupCells) {
      if (cell.cellOutput.type) {
        const typeHash = cell.cellOutput.type.hash();
        typeGroups.set(typeHash, (typeGroups.get(typeHash) || 0) + 1);
      }
    }

    if (typeGroups.size > 0) {
      printInfo("Type script groups found:");
      for (const [hash, count] of typeGroups) {
        console.log(`    Type hash: ${truncateHex(hash, 20)} - ${count} cell(s) in group`);
      }
    } else {
      printInfo("No type script groups in these cells (they are plain CKB cells).");
    }
  } else {
    printInfo("Not enough cells found to demonstrate grouping.");
    printInfo("Script groups combine cells with identical scripts into one execution.");
  }

  console.log("");

  // Show a conceptual diagram of script groups
  printInfo("Conceptual diagram of script groups in a transaction:");
  console.log("");
  console.log(`    ${C.bold}Transaction Inputs:${C.reset}`);
  console.log(`    ${C.dim}+-------+    +-------+    +-------+${C.reset}`);
  console.log(`    ${C.dim}|Cell A |    |Cell B |    |Cell C |${C.reset}`);
  console.log(`    ${C.dim}|Lock: X|    |Lock: X|    |Lock: Y|${C.reset}`);
  console.log(`    ${C.dim}|Type: T|    |Type: -|    |Type: T|${C.reset}`);
  console.log(`    ${C.dim}+-------+    +-------+    +-------+${C.reset}`);
  console.log("");
  console.log(`    ${C.bold}Script Groups Formed:${C.reset}`);
  console.log(`    ${C.green}Lock Group 1:${C.reset} Lock X  -> runs once for [Cell A, Cell B]`);
  console.log(`    ${C.yellow}Lock Group 2:${C.reset} Lock Y  -> runs once for [Cell C]`);
  console.log(`    ${C.cyan}Type Group 1:${C.reset} Type T  -> runs once for [Cell A, Cell C] + matching outputs`);
  console.log("");

  // ==========================================================================
  // Step 5: Cell Deps — How Scripts Reference Their Code
  // ==========================================================================
  //
  // WHAT ARE CELL DEPS (CELL DEPENDENCIES)?
  //
  // A script's code_hash identifies WHICH program to run, but CKB needs
  // to know WHERE to find the actual RISC-V binary code. This is where
  // cell deps come in.
  //
  // Cell deps are references to cells whose data contains the script code.
  // When you build a transaction, you must include cell deps for every
  // script that will be executed. The CKB VM loads the code from these
  // cells at runtime.
  //
  // TWO TYPES OF CELL DEPS:
  //
  //   1. dep_type: "code"
  //      - The referenced cell's data IS the script code (RISC-V binary)
  //      - Simple and direct: one cell dep = one script binary
  //
  //   2. dep_type: "dep_group"
  //      - The referenced cell's data contains a LIST of OutPoints
  //      - Each OutPoint references another cell whose data is script code
  //      - This is a convenience for bundling multiple related scripts
  //      - The SECP256K1-BLAKE160 lock uses a dep_group that bundles both
  //        the secp256k1 library and the blake160 lock script
  //
  // WHY CELL DEPS MATTER:
  //
  //   - Scripts are just data stored in cells — they are not "deployed"
  //     to a special location. Any cell can contain script code.
  //   - This means scripts can be upgraded by deploying new cells with
  //     updated code (if hash_type allows it — see Step 6).
  //   - Cell deps must reference LIVE cells. If the dep cell is consumed,
  //     transactions referencing it will fail.
  //
  // ==========================================================================

  printSection("Step 5: Cell Deps — Loading Script Code");
  printInfo("Scripts are stored as data in regular cells.");
  printInfo("Cell deps tell CKB where to find the code for each script.\n");

  // Fetch the known script info for SECP256K1-BLAKE160 to show its cell dep
  try {
    const secp256k1Info = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);

    printInfo("SECP256K1-BLAKE160 script deployment info:");
    console.log(`    code_hash: ${C.cyan}${truncateHex(secp256k1Info.codeHash, 30)}${C.reset}`);
    console.log(`    hash_type: ${C.yellow}${secp256k1Info.hashType}${C.reset}`);
    console.log("");

    // The cell dep tells us which cell contains the code
    if (secp256k1Info.cellDeps && secp256k1Info.cellDeps.length > 0) {
      printInfo("Cell deps required for this script:");
      for (let i = 0; i < secp256k1Info.cellDeps.length; i++) {
        const dep = secp256k1Info.cellDeps[i];
        console.log(`    ${C.bold}Cell Dep #${i + 1}:${C.reset}`);
        console.log(`      tx_hash:  ${C.cyan}${truncateHex(dep.cellDep.outPoint.txHash, 30)}${C.reset}`);
        console.log(`      index:    ${dep.cellDep.outPoint.index}`);
        console.log(`      dep_type: ${C.yellow}${dep.cellDep.depType}${C.reset}`);
        console.log("");
      }

      printInfo("The 'depGroup' dep_type means this cell contains a list of OutPoints,");
      printInfo("each pointing to a cell with part of the script code.");
    } else {
      printInfo("Cell dep info not directly available from KnownScript.");
      printInfo("In practice, the CCC SDK resolves cell deps automatically when");
      printInfo("building transactions.");
    }
  } catch (err) {
    printWarning(`Could not fetch SECP256K1 script info: ${err}`);
  }

  console.log("");

  // Also show the Nervos DAO cell dep for comparison
  try {
    const daoInfo = await client.getKnownScript(ccc.KnownScript.NervosDao);

    printInfo("Nervos DAO script deployment info:");
    console.log(`    code_hash: ${C.cyan}${truncateHex(daoInfo.codeHash, 30)}${C.reset}`);
    console.log(`    hash_type: ${C.yellow}${daoInfo.hashType}${C.reset}`);

    if (daoInfo.cellDeps && daoInfo.cellDeps.length > 0) {
      for (const dep of daoInfo.cellDeps) {
        console.log(`    cell_dep:  ${C.cyan}${truncateHex(dep.cellDep.outPoint.txHash, 20)}${C.reset}:${dep.cellDep.outPoint.index} (${dep.cellDep.depType})`);
      }
    }
    console.log("");
  } catch (err) {
    // Nervos DAO info not available — that's okay
  }

  // Explain the relationship visually
  printInfo("How cell deps connect scripts to code:");
  console.log("");
  console.log(`    ${C.bold}Transaction${C.reset}`);
  console.log(`    +---------------------------+`);
  console.log(`    | cell_deps:                |`);
  console.log(`    |   - OutPoint(0xabc..:0)   |-----> ${C.green}Cell with RISC-V binary${C.reset}`);
  console.log(`    |                           |       (the actual script code)`);
  console.log(`    | inputs:                   |`);
  console.log(`    |   - Cell with lock script |`);
  console.log(`    |     code_hash: 0x9bd7..   |-----> matches hash of code in dep cell`);
  console.log(`    +---------------------------+`);
  console.log("");
  printInfo("The CKB VM matches code_hash to the code in cell_deps,");
  printInfo("loads the RISC-V binary, and executes it in a sandboxed VM.");
  console.log("");

  // ==========================================================================
  // Step 6: hash_type Explained — "type" vs "data" vs "data1" vs "data2"
  // ==========================================================================
  //
  // The hash_type field determines HOW the code_hash references the
  // script's actual code. This is one of the most nuanced concepts in CKB.
  //
  // OPTION 1: hash_type = "data" (CKB v1 data hash)
  //
  //   code_hash = blake2b_hash(cell_data)
  //
  //   The code_hash is the blake2b hash of the cell's DATA field that
  //   contains the script binary. CKB searches cell_deps for a cell
  //   whose data hashes to this exact value.
  //
  //   Pros: Immutable — the code is pinned to a specific binary.
  //         If the binary changes even 1 byte, the hash changes.
  //   Cons: Upgrading the script requires everyone to update their
  //         code_hash to point to the new binary.
  //
  //   Uses CKB VM version 0 (original CKB-VM).
  //
  // OPTION 2: hash_type = "data1" (CKB v1 data hash, VM version 1)
  //
  //   Same as "data" but uses CKB-VM version 1 (with bug fixes and
  //   additional syscalls introduced in the Mirana hard fork).
  //
  // OPTION 3: hash_type = "data2" (CKB v2 data hash, VM version 2)
  //
  //   Same as "data"/"data1" but uses CKB-VM version 2 (introduced
  //   in the CKB2023 hard fork with spawn syscall support and other
  //   enhancements).
  //
  // OPTION 4: hash_type = "type" (type script hash reference)
  //
  //   code_hash = blake2b_hash(type_script_of_code_cell)
  //
  //   Instead of hashing the data, the code_hash matches the HASH of
  //   the TYPE SCRIPT on the cell that contains the code. CKB searches
  //   cell_deps for a cell whose type script hashes to this value.
  //
  //   Pros: The type script acts as a stable "contract ID". The actual
  //         binary can be upgraded (deployed to a new cell) as long as
  //         the new cell has the same type script. This enables script
  //         upgrades without changing the code_hash everywhere.
  //   Cons: Trust — you must trust whoever controls the type script
  //         not to deploy malicious code.
  //
  //   Uses CKB-VM version 2 (latest).
  //
  // PRACTICAL GUIDANCE:
  //   - Use "data2" when you want your script pinned to an exact binary
  //     (maximum security, no upgrade path without migration)
  //   - Use "type" when you want upgradeable scripts or stable references
  //     (most common for system scripts like SECP256K1-BLAKE160)
  //   - "data" and "data1" are legacy; new scripts should use "data2" or "type"
  //
  // ==========================================================================

  printSection("Step 6: hash_type Explained");
  printInfo("The hash_type field controls how code_hash finds the script binary.\n");

  // Display a comparison table
  console.log(`    ${C.bold}hash_type    | code_hash references         | VM Version | Upgradeable?${C.reset}`);
  separator("-", 76);
  console.log(`    ${C.yellow}"data"${C.reset}       | blake2b(cell_data)           | VM v0      | No  (pinned)`);
  console.log(`    ${C.yellow}"data1"${C.reset}      | blake2b(cell_data)           | VM v1      | No  (pinned)`);
  console.log(`    ${C.yellow}"data2"${C.reset}      | blake2b(cell_data)           | VM v2      | No  (pinned)`);
  console.log(`    ${C.yellow}"type"${C.reset}       | blake2b(type_script_of_cell) | VM v2      | Yes (via type script)`);
  console.log("");

  // Show real examples from the chain
  printInfo("Real examples from CKB testnet:");
  console.log("");

  try {
    const secp256k1Info = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
    console.log(`    ${C.bold}SECP256K1-BLAKE160 (default lock):${C.reset}`);
    console.log(`      hash_type: ${C.yellow}${secp256k1Info.hashType}${C.reset}`);
    console.log(`      This means the code_hash is the hash of the TYPE SCRIPT`);
    console.log(`      on the cell containing the script binary.`);
    console.log(`      The binary can be upgraded without changing every address.`);
    console.log("");
  } catch (_) {
    // skip
  }

  // Explain with a concrete analogy
  printInfo("Analogy:");
  printConcept('  hash_type "data" is like referencing a book by its SHA checksum.');
  printConcept("  If even one letter changes, the reference breaks.");
  printConcept("");
  printConcept('  hash_type "type" is like referencing a book by its ISBN.');
  printConcept("  The ISBN stays the same even if the publisher releases a new edition.");
  printConcept("  But you must trust the publisher not to change the content maliciously.");
  console.log("");

  // ==========================================================================
  // Step 7: Common Built-in Scripts
  // ==========================================================================
  //
  // CKB comes with several pre-deployed scripts that are used by most
  // applications. Understanding these is essential for working with CKB.
  //
  // 1. SECP256K1-BLAKE160 (default lock)
  //    - The most common lock script
  //    - Verifies a secp256k1 signature against a blake160 pubkey hash
  //    - args: 20-byte blake160(pubkey)
  //    - Used by standard CKB addresses
  //
  // 2. SECP256K1-BLAKE160-MULTISIG (multisig lock)
  //    - M-of-N multisignature lock script
  //    - args encode: reserved(1) + require_first_n(1) + threshold(1) +
  //      pubkey_count(1) + blake160(pubkey1) + blake160(pubkey2) + ...
  //    - Supports time-locked transactions via since field
  //
  // 3. NERVOS DAO (type script)
  //    - Built-in "savings account" for CKB holders
  //    - Validates deposit and withdrawal state transitions
  //    - Calculates and enforces interest from secondary issuance
  //
  // 4. xUDT / SUDT (type scripts)
  //    - User Defined Token standards
  //    - Validates that token supply is conserved in transactions
  //
  // ==========================================================================

  printSection("Step 7: Common Built-in Scripts");
  printInfo("CKB includes several pre-deployed system scripts.\n");

  // Fetch and display known scripts
  const knownScripts: Array<{ name: string; key: ccc.KnownScript; role: string }> = [
    { name: "SECP256K1-BLAKE160", key: ccc.KnownScript.Secp256k1Blake160, role: "Lock (default ownership)" },
    { name: "SECP256K1-BLAKE160-MULTISIG", key: ccc.KnownScript.Secp256k1Blake160Multisig, role: "Lock (M-of-N multisig)" },
    { name: "Nervos DAO", key: ccc.KnownScript.NervosDao, role: "Type (deposit/withdrawal)" },
  ];

  for (const { name, key, role } of knownScripts) {
    try {
      const info = await client.getKnownScript(key);
      console.log(`  ${C.bold}${C.green}${name}${C.reset} — ${role}`);
      console.log(`    code_hash: ${C.cyan}${truncateHex(info.codeHash, 30)}${C.reset}`);
      console.log(`    hash_type: ${C.yellow}${info.hashType}${C.reset}`);
      console.log("");
    } catch (err) {
      console.log(`  ${C.bold}${name}${C.reset} — ${C.dim}(not available on this network)${C.reset}`);
      console.log("");
    }
  }

  // Attempt to show xUDT as well
  try {
    const xudtInfo = await client.getKnownScript(ccc.KnownScript.XUdt);
    console.log(`  ${C.bold}${C.green}xUDT${C.reset} — Type (fungible token standard)`);
    console.log(`    code_hash: ${C.cyan}${truncateHex(xudtInfo.codeHash, 30)}${C.reset}`);
    console.log(`    hash_type: ${C.yellow}${xudtInfo.hashType}${C.reset}`);
    console.log("");
  } catch (_) {
    // xUDT may not be in KnownScript
  }

  // ==========================================================================
  // Step 8: Script Execution Lifecycle
  // ==========================================================================
  //
  // Let's trace the full lifecycle of how scripts execute when a
  // transaction is verified. This brings together all the concepts
  // from this lesson.
  //
  // THE COMPLETE FLOW:
  //
  //   1. A transaction is submitted with: inputs, outputs, cell_deps, witnesses
  //
  //   2. CKB resolves all inputs to their live cells (fetches lock, type, data)
  //
  //   3. CKB resolves all cell_deps to load available script code
  //
  //   4. Script grouping:
  //      a. Group all INPUT lock scripts by (code_hash, hash_type, args)
  //      b. Group all INPUT + OUTPUT type scripts by (code_hash, hash_type, args)
  //
  //   5. For each lock script group:
  //      a. Find the matching code in cell_deps (by code_hash + hash_type)
  //      b. Load the RISC-V binary into CKB-VM
  //      c. Execute with: script group info, tx data, witnesses
  //      d. If return != 0 -> REJECT transaction
  //
  //   6. For each type script group:
  //      a. Find the matching code in cell_deps
  //      b. Load the RISC-V binary into CKB-VM
  //      c. Execute with: script group info (both input and output indices),
  //         tx data, witnesses
  //      d. If return != 0 -> REJECT transaction
  //
  //   7. If ALL scripts return 0 -> transaction is VALID
  //
  //   8. Valid transaction: inputs become dead cells, outputs become live cells
  //
  // ==========================================================================

  printSection("Step 8: Script Execution Lifecycle");
  printInfo("Tracing how scripts execute during transaction verification.\n");

  console.log(`    ${C.bold}Transaction Verification Flow:${C.reset}`);
  console.log("");
  console.log(`    1. ${C.cyan}RESOLVE${C.reset}    Transaction submitted`);
  console.log(`       |          Resolve inputs -> fetch live cells`);
  console.log(`       |          Resolve cell_deps -> load script code`);
  console.log(`       v`);
  console.log(`    2. ${C.cyan}GROUP${C.reset}      Group cells by script identity`);
  console.log(`       |          Lock scripts: group input cells`);
  console.log(`       |          Type scripts: group input + output cells`);
  console.log(`       v`);
  console.log(`    3. ${C.green}EXECUTE${C.reset}    For each lock script group:`);
  console.log(`       |            Load RISC-V binary from cell_deps`);
  console.log(`       |            Run in CKB-VM sandbox`);
  console.log(`       |            Must return 0 (success)`);
  console.log(`       v`);
  console.log(`    4. ${C.green}EXECUTE${C.reset}    For each type script group:`);
  console.log(`       |            Load RISC-V binary from cell_deps`);
  console.log(`       |            Run in CKB-VM sandbox`);
  console.log(`       |            Sees both input AND output cells`);
  console.log(`       |            Must return 0 (success)`);
  console.log(`       v`);
  console.log(`    5. ${C.yellow}VERIFY${C.reset}     ALL scripts returned 0?`);
  console.log(`       |            Yes -> Transaction is ${C.green}VALID${C.reset}`);
  console.log(`       |            No  -> Transaction is ${C.red}REJECTED${C.reset}`);
  console.log(`       v`);
  console.log(`    6. ${C.green}COMMIT${C.reset}     Inputs become DEAD cells`);
  console.log(`                   Outputs become LIVE cells`);
  console.log("");

  // ==========================================================================
  // Step 9: Putting It All Together — Live Demo
  // ==========================================================================
  //
  // Let's fetch a real transaction and trace how its scripts would be
  // grouped and executed. This demonstrates all concepts in action.
  // ==========================================================================

  printSection("Step 9: Analyzing a Real Transaction's Scripts");
  printInfo("Fetching a recent transaction to analyze its script structure...\n");

  // Find a transaction that involves our demo address
  if (sampleCell) {
    try {
      // Get the transaction that created our sample cell
      const txHash = sampleCell.outPoint.txHash;
      const txWithStatus = await client.getTransaction(txHash);

      if (txWithStatus && txWithStatus.transaction) {
        const tx = txWithStatus.transaction;
        printInfo(`Transaction: ${truncateHex(txHash, 30)}`);
        printInfo(`Status: ${txWithStatus.status}`);
        console.log("");

        // Analyze inputs (lock scripts that would run)
        printInfo(`${C.bold}Inputs (${tx.inputs.length}):${C.reset} Lock scripts run on these`);
        const inputLockGroups = new Map<string, number>();
        const inputTypeGroups = new Map<string, number>();

        for (let i = 0; i < tx.inputs.length; i++) {
          const input = tx.inputs[i];
          console.log(`    Input #${i}: ${truncateHex(input.previousOutput.txHash, 20)}:${input.previousOutput.index}`);

          // We can't resolve the input cells directly without another RPC call,
          // but we can show the structure
        }
        console.log("");

        // Analyze outputs (type scripts that would run)
        printInfo(`${C.bold}Outputs (${tx.outputs.length}):${C.reset} Type scripts run on these`);
        const outputTypeGroups = new Map<string, { hash: string; count: number }>();

        for (let i = 0; i < tx.outputs.length; i++) {
          const output = tx.outputs[i];
          const hasType = !!output.type;
          console.log(
            `    Output #${i}: ${C.green}${formatCKB(output.capacity)}${C.reset} | ` +
            `Type: ${hasType ? C.cyan + "yes" + C.reset : C.dim + "none" + C.reset}`
          );

          if (output.type) {
            const typeHash = output.type.hash();
            const existing = outputTypeGroups.get(typeHash);
            if (existing) {
              existing.count++;
            } else {
              outputTypeGroups.set(typeHash, { hash: typeHash, count: 1 });
            }
          }
        }
        console.log("");

        // Analyze cell deps
        printInfo(`${C.bold}Cell Deps (${tx.cellDeps.length}):${C.reset} Where script code is loaded from`);
        for (let i = 0; i < tx.cellDeps.length; i++) {
          const dep = tx.cellDeps[i];
          console.log(
            `    Dep #${i}: ${truncateHex(dep.outPoint.txHash, 20)}:${dep.outPoint.index} | ` +
            `dep_type: ${C.yellow}${dep.depType}${C.reset}`
          );
        }
        console.log("");

        // Analyze witnesses
        printInfo(`${C.bold}Witnesses (${tx.witnesses.length}):${C.reset} Contain signatures and proof data`);
        for (let i = 0; i < tx.witnesses.length; i++) {
          const witness = tx.witnesses[i];
          const byteLen = witness ? (witness.length - 2) / 2 : 0;
          console.log(`    Witness #${i}: ${byteLen} bytes`);
        }
        console.log("");

        if (outputTypeGroups.size > 0) {
          printInfo("Type script groups in outputs:");
          for (const [hash, info] of outputTypeGroups) {
            console.log(`    Type hash: ${truncateHex(hash, 20)} -> ${info.count} output(s)`);
          }
          console.log("");
        }
      }
    } catch (err) {
      printWarning(`Could not fetch transaction details: ${err}`);
    }
  } else {
    printInfo("Skipping transaction analysis (no sample cell available).");
  }

  // ==========================================================================
  // Summary
  // ==========================================================================

  printSection("Summary");
  console.log("");
  printInfo("In this lesson, you learned:");
  console.log("");
  printInfo(`  1. ${C.bold}Scripts are validators${C.reset} - they approve or reject, never modify state`);
  printInfo(`  2. ${C.bold}Lock scripts${C.reset} protect ownership (run on inputs only)`);
  printInfo(`  3. ${C.bold}Type scripts${C.reset} validate state transitions (run on inputs AND outputs)`);
  printInfo(`  4. ${C.bold}Script structure${C.reset}: code_hash + hash_type + args`);
  printInfo(`  5. ${C.bold}hash_type${C.reset}: "data"/"data1"/"data2" (pinned) vs "type" (upgradeable)`);
  printInfo(`  6. ${C.bold}Script groups${C.reset} batch cells with identical scripts for efficient execution`);
  printInfo(`  7. ${C.bold}Cell deps${C.reset} tell CKB where to find the script's RISC-V binary`);
  printInfo(`  8. ${C.bold}Built-in scripts${C.reset}: SECP256K1-BLAKE160, multisig, Nervos DAO`);
  console.log("");
  printInfo("Key takeaways:");
  printInfo("  - CKB's script model is fundamentally different from Ethereum's");
  printInfo("  - Scripts validate proposed state transitions, not execute logic");
  printInfo("  - Lock scripts = authorization; Type scripts = state validation");
  printInfo("  - Script code lives in regular cells, referenced via cell deps");
  printInfo("  - hash_type determines if scripts are pinned or upgradeable");
  console.log("");
  separator("=", 60);
  console.log("");
}

// ============================================================================
// Run the application
// ============================================================================

main().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
