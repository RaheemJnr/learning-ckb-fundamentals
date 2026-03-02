/**
 * ============================================================================
 * Lesson 1: Cell Model Explorer
 * ============================================================================
 *
 * Welcome to your first CKB lesson! In this program, we will:
 *
 *   1. Connect to the CKB Testnet (called "Pudge")
 *   2. Fetch live cells from the blockchain
 *   3. Display each cell's structure in a readable format
 *   4. Explain what every field means
 *
 * WHAT IS A CELL?
 * ---------------
 * A "cell" is the fundamental unit of state in Nervos CKB. Think of it
 * like a box in a warehouse:
 *   - The box has a SIZE LIMIT (capacity)
 *   - The box has a LOCK on it (lock script — who can open it)
 *   - The box may have RULES about what goes inside (type script — optional)
 *   - The box holds STUFF inside it (data)
 *
 * Every piece of data on the CKB blockchain lives inside a cell.
 * Tokens, NFTs, smart contract state, even the smart contract code itself —
 * it all lives in cells.
 *
 * HOW DOES THIS DIFFER FROM ETHEREUM?
 * ------------------------------------
 * Ethereum uses an "account model" where state is stored in contract
 * accounts. CKB uses a "cell model" (a generalized UTXO model) where
 * state is stored in individual cells, similar to how Bitcoin stores
 * value in UTXOs. But CKB cells are far more powerful than Bitcoin UTXOs
 * because they can hold arbitrary data and have programmable scripts.
 *
 * RUNNING THIS PROGRAM:
 * ---------------------
 *   npm install
 *   npm start
 *
 * ============================================================================
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * This is a well-known lock script code hash on CKB.
 * It corresponds to the default "SECP256K1-BLAKE160" lock, which is the
 * most common lock script on CKB — analogous to how most Bitcoin addresses
 * use P2PKH or P2WPKH.
 *
 * The SECP256K1-BLAKE160 lock checks that a transaction is signed with
 * the private key corresponding to the public key hash stored in "args".
 *
 * Think of it like this:
 *   code_hash = "which lock program to use" (SECP256K1-BLAKE160)
 *   hash_type = "how to find that program" (by type hash)
 *   args      = "the public key hash of the owner"
 */
const SECP256K1_BLAKE160_CODE_HASH =
  "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";

/**
 * We'll use the CKB testnet faucet address's lock args to find some cells.
 * This is a well-known address on testnet that always has cells because
 * people request testnet CKB from the faucet.
 *
 * In CKB, an "address" is just a human-readable encoding of a lock script.
 * The lock args below correspond to a testnet address.
 */
const TESTNET_GENESIS_LOCK_ARGS =
  "0xe2fa82e70b062c8644b80ad7ecf6e015e5f352f6";

/**
 * How many cells we want to fetch and display.
 * We keep this small so the output is readable.
 */
const MAX_CELLS_TO_DISPLAY = 5;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert shannons (the smallest CKB unit) to CKBytes.
 *
 * Just like Bitcoin has "satoshis" (1 BTC = 100,000,000 satoshis),
 * CKB has "shannons" (1 CKByte = 100,000,000 shannons).
 *
 * Named after Claude Shannon, the father of information theory.
 *
 * @param shannons - The amount in shannons (as a bigint)
 * @returns A formatted string showing the CKByte amount
 */
function shannonsToCKB(shannons: bigint): string {
  // 1 CKByte = 10^8 shannons
  const wholeCKB = shannons / 100_000_000n;
  const remainder = shannons % 100_000_000n;

  // Format with up to 8 decimal places, trimming trailing zeros
  if (remainder === 0n) {
    return `${wholeCKB.toLocaleString()} CKB`;
  }
  const decimal = remainder.toString().padStart(8, "0").replace(/0+$/, "");
  return `${wholeCKB.toLocaleString()}.${decimal} CKB`;
}

/**
 * Truncate a hex string for display purposes.
 * Full hex strings like code hashes are 66 characters long (0x + 64 hex chars).
 * This makes them easier to read in the terminal.
 *
 * @param hex - The full hex string
 * @param chars - How many characters to show from each end (default: 10)
 * @returns A truncated string like "0x9bd7e06f3e...bbda3cce8"
 */
function truncateHex(hex: string, chars: number = 10): string {
  if (hex.length <= chars * 2 + 2) return hex; // Already short enough
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

/**
 * Display a separator line in the terminal for readability.
 */
function separator(): void {
  console.log("─".repeat(70));
}

/**
 * Display a script (lock or type) in a readable format.
 *
 * A CKB Script has three fields:
 *   - codeHash: A 32-byte hash that identifies WHICH program to run.
 *               This is like saying "use the SECP256K1 signature checker"
 *               or "use the xUDT token validator".
 *
 *   - hashType: How the codeHash is used to locate the program on-chain.
 *               - "type" means: find a cell whose TYPE SCRIPT hash matches codeHash
 *               - "data" means: find a cell whose DATA hash matches codeHash
 *               - "data1" / "data2": versioned variants of "data"
 *
 *   - args: Arbitrary bytes passed to the script as arguments.
 *           For a lock script, this is usually the owner's public key hash.
 *           For a type script, this could be any configuration data.
 *
 * @param label - "Lock Script" or "Type Script"
 * @param script - The CKB script object, or null/undefined if absent
 */
function displayScript(
  label: string,
  script: ccc.ScriptLike | null | undefined
): void {
  if (!script) {
    console.log(`  ${label}: (none)`);
    console.log(`    -> This cell has no ${label.toLowerCase()}.`);
    if (label.includes("Type")) {
      console.log(
        `    -> This means the cell holds only native CKB, with no special rules.`
      );
    }
    return;
  }

  console.log(`  ${label}:`);

  // Extract the fields. The CCC SDK uses camelCase property names.
  const codeHash = String(script.codeHash);
  const hashType = String(script.hashType);
  const args = String(script.args);

  console.log(`    code_hash: ${truncateHex(codeHash)}`);
  console.log(`      -> Identifies WHICH program validates this cell`);
  console.log(`    hash_type: ${hashType}`);
  console.log(`      -> How the runtime locates the program on-chain`);
  console.log(`    args:      ${truncateHex(args)}`);
  console.log(
    `      -> Arguments passed to the program (e.g., owner's public key hash)`
  );

  // Provide extra context for common scripts
  if (codeHash === SECP256K1_BLAKE160_CODE_HASH) {
    console.log(
      `    [INFO] This is the default SECP256K1-BLAKE160 lock script.`
    );
    console.log(
      `           It verifies a secp256k1 signature against the blake160 hash in args.`
    );
  }
}

/**
 * Calculate the minimum capacity a cell would need.
 *
 * IMPORTANT CONCEPT: In CKB, "capacity" serves DUAL PURPOSES:
 *   1. It is the cell's CKByte value (like a Bitcoin UTXO's value)
 *   2. It is the MAXIMUM number of bytes the cell can occupy on-chain
 *
 * This means: 1 CKByte = 1 byte of on-chain storage space.
 *
 * A cell's total serialized size MUST be <= its capacity value.
 * This prevents blockchain bloat because you need to "pay" for storage.
 *
 * The minimum capacity calculation:
 *   - 8 bytes: the capacity field itself (a uint64)
 *   - Lock script: 32 (code_hash) + 1 (hash_type) + len(args)
 *   - Type script: 32 (code_hash) + 1 (hash_type) + len(args), if present
 *   - Data: len(data)
 *
 * For a typical cell with no type script, no data, and 20-byte lock args:
 *   8 + 32 + 1 + 20 = 61 bytes = 61 CKBytes minimum
 *
 * @param dataLength - Number of bytes in the data field
 * @param lockArgsLength - Number of bytes in the lock script args
 * @param typeScript - Whether the cell has a type script
 * @param typeArgsLength - Number of bytes in the type script args (if present)
 * @returns The minimum capacity in shannons
 */
function calculateMinCapacity(
  dataLength: number,
  lockArgsLength: number = 20,
  typeScript: boolean = false,
  typeArgsLength: number = 20
): bigint {
  // Start with the capacity field itself: 8 bytes (uint64)
  let bytes = 8;

  // Lock script is ALWAYS required:
  //   32 bytes for code_hash + 1 byte for hash_type + variable args
  bytes += 32 + 1 + lockArgsLength;

  // Type script is optional:
  //   If present, same structure: 32 + 1 + args length
  if (typeScript) {
    bytes += 32 + 1 + typeArgsLength;
  }

  // Data field: each byte of data costs 1 byte of capacity
  bytes += dataLength;

  // Convert bytes to shannons: 1 byte = 1 CKByte = 10^8 shannons
  return BigInt(bytes) * 100_000_000n;
}

// ============================================================================
// MAIN: EXPLORE CELLS ON CKB TESTNET
// ============================================================================

async function main(): Promise<void> {
  console.log("============================================================");
  console.log("  LESSON 1: Cell Model Explorer");
  console.log("  Exploring live cells on CKB Testnet (Pudge)");
  console.log("============================================================");
  console.log();

  // -----------------------------------------------------------------------
  // STEP 1: Connect to CKB Testnet
  // -----------------------------------------------------------------------
  // The CCC SDK provides a convenient client for the public testnet.
  // Under the hood, this connects to a CKB testnet RPC node.
  // "ClientPublicTestnet" is a pre-configured client — no setup needed!
  // For mainnet, you would use "ClientPublicMainnet" instead.
  console.log("[Step 1] Connecting to CKB Testnet...");
  const client = new ccc.ClientPublicTestnet();
  console.log("  Connected successfully!");
  console.log();

  // -----------------------------------------------------------------------
  // STEP 2: Get some basic chain info
  // -----------------------------------------------------------------------
  // Let's fetch the current tip (latest block) to confirm we're connected.
  console.log("[Step 2] Fetching chain info...");
  try {
    const tip = await client.getTip();
    console.log(`  Current block height: ${tip.toLocaleString()}`);
    console.log("  (This is the latest block number on testnet)");
  } catch (error) {
    console.log(
      "  Could not fetch tip. This is okay — we'll proceed with cell queries."
    );
  }
  console.log();

  // -----------------------------------------------------------------------
  // STEP 3: Build a lock script to search for cells
  // -----------------------------------------------------------------------
  // To find cells on-chain, we search by lock script. This is like saying:
  // "Show me all the boxes that have this particular lock on them."
  //
  // We're using the default SECP256K1-BLAKE160 lock with a known testnet
  // address's args. This will find cells belonging to that address.
  console.log("[Step 3] Building lock script for cell search...");

  const lockScript: ccc.ScriptLike = {
    codeHash: SECP256K1_BLAKE160_CODE_HASH,
    hashType: "type",
    args: TESTNET_GENESIS_LOCK_ARGS,
  };

  console.log("  Lock script to search for:");
  console.log(`    code_hash: ${truncateHex(SECP256K1_BLAKE160_CODE_HASH)}`);
  console.log(`    hash_type: type`);
  console.log(`    args:      ${TESTNET_GENESIS_LOCK_ARGS}`);
  console.log();

  // -----------------------------------------------------------------------
  // STEP 4: Query live cells from the chain
  // -----------------------------------------------------------------------
  // "Live cells" are cells that exist on-chain and have NOT been consumed
  // (spent) yet. Think of them as unspent transaction outputs (UTXOs) in
  // Bitcoin.
  //
  // When a transaction "spends" a cell, that cell is consumed (destroyed)
  // and new cells are created as outputs. This is the "consume and create"
  // pattern that is central to the Cell Model.
  //
  // The CCC SDK provides `findCellsByLock()` which returns an async
  // iterator over all live cells matching the given lock script.
  console.log("[Step 4] Querying live cells...");
  console.log(
    `  (Searching for up to ${MAX_CELLS_TO_DISPLAY} cells with the specified lock script)`
  );
  console.log();

  let cellCount = 0;
  let cellsWithTypeScript = 0;
  let cellsWithoutTypeScript = 0;
  let totalCapacity = 0n;

  /** We'll store cells so we can do a summary at the end. */
  const fetchedCells: {
    capacity: bigint;
    dataHex: string;
    lockScript: ccc.ScriptLike;
    typeScript: ccc.ScriptLike | null;
  }[] = [];

  try {
    // findCellsByLock returns an async generator. We iterate over it with
    // a for-await-of loop. Each yielded item is a "Cell" object.
    for await (const cell of client.findCellsByLock(
      lockScript,
      undefined, // type script filter: undefined means "any"
      true // withData: include the cell's data field
    )) {
      cellCount++;

      // ===================================================================
      // ANATOMY OF A CELL
      // ===================================================================
      // Every cell has two main parts:
      //
      // 1. CellOutput: The "metadata" of the cell
      //    - capacity: How many shannons (and max bytes) this cell holds
      //    - lock: The lock script (who owns it)
      //    - type: The type script (what rules apply), can be null
      //
      // 2. OutputData: The raw data stored in the cell (as bytes)
      //    - This can be anything: token amounts, NFT content, code, etc.
      //    - For a plain CKB cell (no type script), data is usually empty.

      const capacity = cell.cellOutput.capacity;
      const dataHex = ccc.hexFrom(cell.outputData);
      const lock = cell.cellOutput.lock;
      const type = cell.cellOutput.type;

      // Track stats
      totalCapacity += capacity;
      if (type) {
        cellsWithTypeScript++;
      } else {
        cellsWithoutTypeScript++;
      }

      // Store for later summary
      fetchedCells.push({
        capacity,
        dataHex,
        lockScript: lock,
        typeScript: type ?? null,
      });

      // ===================================================================
      // DISPLAY THE CELL
      // ===================================================================
      separator();
      console.log(`  CELL #${cellCount}`);
      separator();

      // --- Capacity ---
      console.log(`  Capacity: ${shannonsToCKB(capacity)}`);
      console.log(`    -> Raw: ${capacity.toString()} shannons`);
      console.log(
        `    -> This cell holds ${shannonsToCKB(capacity)} and can store`
      );
      console.log(
        `       up to ${(capacity / 100_000_000n).toString()} bytes on-chain.`
      );
      console.log();

      // --- Data ---
      const dataLength = cell.outputData.length;
      if (dataLength === 0 || dataHex === "0x") {
        console.log(`  Data: (empty)`);
        console.log(
          `    -> This cell stores no extra data, just native CKByte value.`
        );
      } else {
        const displayData =
          dataHex.length > 66 ? dataHex.slice(0, 66) + "..." : dataHex;
        console.log(`  Data: ${displayData}`);
        console.log(`    -> ${dataLength} bytes of data stored in this cell.`);
      }
      console.log();

      // --- Lock Script ---
      displayScript("Lock Script", lock);
      console.log();

      // --- Type Script ---
      displayScript("Type Script", type);
      console.log();

      // Stop after we've shown enough cells
      if (cellCount >= MAX_CELLS_TO_DISPLAY) {
        break;
      }
    }
  } catch (error) {
    console.error("Error fetching cells:", error);
    console.log();
    console.log("Troubleshooting tips:");
    console.log("  - Make sure you have internet access");
    console.log("  - The testnet RPC endpoint might be temporarily down");
    console.log("  - Try again in a few moments");
    console.log();
  }

  // -----------------------------------------------------------------------
  // STEP 5: Summary and Key Takeaways
  // -----------------------------------------------------------------------
  console.log();
  separator();
  console.log("  SUMMARY");
  separator();

  if (cellCount === 0) {
    console.log("  No cells were found. This could mean:");
    console.log("    - The address has no live cells on testnet");
    console.log("    - The RPC endpoint is experiencing issues");
    console.log("    - The testnet was recently reset");
  } else {
    console.log(`  Total cells examined: ${cellCount}`);
    console.log(`  Total capacity:       ${shannonsToCKB(totalCapacity)}`);
    console.log(`  Cells WITH type script:    ${cellsWithTypeScript}`);
    console.log(`  Cells WITHOUT type script: ${cellsWithoutTypeScript}`);
  }

  console.log();

  // -----------------------------------------------------------------------
  // STEP 6: Minimum Capacity Examples
  // -----------------------------------------------------------------------
  separator();
  console.log("  MINIMUM CAPACITY EXAMPLES");
  separator();
  console.log();
  console.log("  Every cell needs a minimum amount of CKBytes to exist,");
  console.log("  because capacity = maximum on-chain size in bytes.");
  console.log();

  // Example 1: Bare minimum cell (no type, no data)
  const minBasic = calculateMinCapacity(0, 20, false);
  console.log("  1. Basic cell (no type script, no data):");
  console.log("     8 (capacity) + 32 (lock code_hash) + 1 (hash_type) + 20 (lock args)");
  console.log(`     = 61 bytes = ${shannonsToCKB(minBasic)}`);
  console.log();

  // Example 2: Cell with type script but no data
  const minWithType = calculateMinCapacity(0, 20, true, 20);
  console.log("  2. Cell with type script (no data):");
  console.log("     61 + 32 (type code_hash) + 1 (hash_type) + 20 (type args)");
  console.log(`     = 114 bytes = ${shannonsToCKB(minWithType)}`);
  console.log();

  // Example 3: Cell with type script and 32 bytes of data (e.g., UDT amount)
  const minWithData = calculateMinCapacity(32, 20, true, 20);
  console.log("  3. Cell with type script + 32 bytes of data (e.g., token balance):");
  console.log("     114 + 32 (data)");
  console.log(`     = 146 bytes = ${shannonsToCKB(minWithData)}`);
  console.log();

  // -----------------------------------------------------------------------
  // STEP 7: CKB Cell vs Bitcoin UTXO vs Ethereum Account
  // -----------------------------------------------------------------------
  separator();
  console.log("  COMPARISON: CKB Cell vs Bitcoin UTXO vs Ethereum Account");
  separator();
  console.log();
  console.log(
    "  ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐"
  );
  console.log(
    "  │    Feature        │    CKB Cell      │  Bitcoin UTXO    │ Ethereum Account │"
  );
  console.log(
    "  ├──────────────────┼──────────────────┼──────────────────┼──────────────────┤"
  );
  console.log(
    "  │ Stores value?    │ Yes (capacity)   │ Yes (satoshis)   │ Yes (balance)    │"
  );
  console.log(
    "  │ Stores data?     │ Yes (arbitrary)  │ Limited (OP_RET) │ Yes (storage)    │"
  );
  console.log(
    "  │ Programmable?    │ Yes (lock+type)  │ Limited (Script) │ Yes (EVM code)   │"
  );
  console.log(
    "  │ Model            │ Generalized UTXO │ UTXO             │ Account          │"
  );
  console.log(
    "  │ Parallelism      │ Natural (UTXO)   │ Natural (UTXO)   │ Sequential       │"
  );
  console.log(
    "  │ State location   │ In cells         │ In UTXOs         │ In contract      │"
  );
  console.log(
    "  └──────────────────┴──────────────────┴──────────────────┴──────────────────┘"
  );
  console.log();

  // -----------------------------------------------------------------------
  // KEY CONCEPTS RECAP
  // -----------------------------------------------------------------------
  separator();
  console.log("  KEY CONCEPTS TO REMEMBER");
  separator();
  console.log();
  console.log("  1. CELLS are the fundamental unit of state in CKB.");
  console.log("     Everything on CKB lives in a cell.");
  console.log();
  console.log("  2. Every cell has 4 FIELDS:");
  console.log("     - capacity: CKByte value AND max storage size");
  console.log("     - data:     arbitrary bytes stored in the cell");
  console.log("     - lock:     script controlling WHO can spend the cell");
  console.log("     - type:     optional script controlling WHAT the cell can do");
  console.log();
  console.log("  3. CAPACITY has a dual purpose:");
  console.log("     - It IS the cell's CKByte value (like satoshis in Bitcoin)");
  console.log("     - It LIMITS how much on-chain space the cell can use");
  console.log("     - 1 CKByte = 1 byte of on-chain storage");
  console.log();
  console.log("  4. Cells are CONSUMED and CREATED (never mutated in place).");
  console.log('     To "update" data, you destroy the old cell and create a new one.');
  console.log("     This is the consume-and-create pattern.");
  console.log();
  console.log("  5. CKB is BITCOIN-ISOMORPHIC:");
  console.log("     CKB's Cell Model generalizes Bitcoin's UTXO model.");
  console.log("     If you understand UTXOs, you're halfway to understanding Cells.");
  console.log();

  separator();
  console.log("  End of Lesson 1. Next up: Transaction Anatomy!");
  separator();

  // Clean up the client connection
  // The CCC client manages connections internally, but it's good practice
  // to note that in a long-running application you should handle cleanup.
  console.log();
  console.log("Done! Thank you for exploring the CKB Cell Model.");
}

// ============================================================================
// RUN THE PROGRAM
// ============================================================================
// We call main() and handle any unhandled errors gracefully.
// The `.catch()` ensures that if something goes wrong, we get a helpful
// error message instead of a cryptic crash.
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
