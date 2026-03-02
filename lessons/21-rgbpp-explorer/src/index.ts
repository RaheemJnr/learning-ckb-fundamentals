/**
 * Lesson 21: RGB++ Protocol — Bitcoin & CKB Interoperability Explorer
 *
 * This file explores the RGB++ protocol, which creates a cryptographic binding
 * between Bitcoin UTXOs and CKB Cells, enabling smart contracts and DeFi
 * on Bitcoin WITHOUT bridges or wrapped assets.
 *
 * =============================================================================
 * BACKGROUND: WHAT IS RGB?
 * =============================================================================
 *
 * RGB is a protocol originally developed for the Lightning Network ecosystem.
 * It allows assets to be defined off-chain and "attached" to Bitcoin UTXOs
 * using client-side validation — meaning the asset rules are validated by
 * the parties involved, not by all Bitcoin nodes.
 *
 * The core idea of original RGB:
 *   - A Bitcoin UTXO "points" to off-chain asset state
 *   - Spending that UTXO "transfers" the asset
 *   - All validation happens locally, not on-chain
 *
 * LIMITATION of original RGB:
 *   - No global verifiability (others can't easily verify asset state)
 *   - No smart contract logic (Bitcoin's script is too limited)
 *   - Complex client-side data management
 *   - No composability between different assets/protocols
 *
 * =============================================================================
 * WHAT IS RGB++?
 * =============================================================================
 *
 * RGB++ extends the RGB concept by replacing "off-chain client-side validation"
 * with "on-chain CKB Cell validation." Instead of keeping asset state private,
 * RGB++ makes it public and verifiable on CKB while maintaining Bitcoin's
 * security guarantees.
 *
 * The key innovation: ISOMORPHIC BINDING
 *
 *   Bitcoin UTXO  ←───────────────────→  CKB Cell
 *   (txid + vout)          |              (RGB++ lock script)
 *                          |
 *              These two are cryptographically
 *              bound together as a single unit.
 *              Spending the UTXO means updating the Cell.
 *              Neither can move independently.
 *
 * "Isomorphic" means "same shape" — the Bitcoin transaction structure
 * mirrors the CKB transaction structure. For every Bitcoin UTXO input,
 * there is a corresponding CKB Cell input. For every Bitcoin UTXO output,
 * there is a corresponding CKB Cell output.
 *
 * =============================================================================
 * WHY CKB? (NOT ETH OR ANOTHER CHAIN)
 * =============================================================================
 *
 * CKB was chosen for RGB++ for several reasons:
 *
 * 1. CELL MODEL COMPATIBILITY:
 *    CKB's UTXO-like Cell model isomorphically maps to Bitcoin's UTXO model.
 *    Both use "consume old output, create new output" semantics.
 *    Ethereum's account model is fundamentally incompatible.
 *
 * 2. PROOF-OF-WORK SECURITY:
 *    CKB uses PoW (NC-Max), not PoS. This means CKB and Bitcoin share
 *    the same security model — economic security through energy expenditure.
 *    For a Bitcoin-native protocol, this alignment matters philosophically.
 *
 * 3. PROGRAMMABILITY:
 *    CKB's lock scripts and type scripts provide full Turing-complete
 *    programmability (via CKB-VM) that Bitcoin's Script lacks.
 *    DeFi logic, complex ownership rules, and token standards all run on CKB.
 *
 * 4. TRUSTLESS DESIGN:
 *    CKB's cell model makes the binding verifiable on-chain — anyone can
 *    inspect the RGB++ lock scripts and see which Bitcoin UTXO they reference.
 *    This is global verifiability, not client-side only.
 *
 * =============================================================================
 * THE RGB++ LOCK SCRIPT
 * =============================================================================
 *
 * Every RGB++ cell has a specific lock script that encodes the Bitcoin UTXO binding:
 *
 * RGB++ Lock Script structure:
 *   {
 *     code_hash: <RGB++ lock script code hash>,
 *     hash_type: "type",
 *     args: <bitcoin_tx_id_bytes_LE> + <bitcoin_vout_u32_LE>
 *           // 32 bytes for txid (reversed byte order, as Bitcoin uses LE internally)
 *           // 4 bytes for output index
 *           // Total args: 36 bytes
 *   }
 *
 * The args encode exactly one Bitcoin UTXO: the transaction hash and output index.
 * This makes the binding verifiable: if you know the Bitcoin UTXO, you can
 * compute what the RGB++ lock script args should be and find the CKB cell.
 *
 * The lock script's validation logic:
 *   - When the CKB cell is spent, the RGB++ lock checks that the corresponding
 *     Bitcoin UTXO was also spent in a Bitcoin transaction that commits to this
 *     CKB transaction (via OP_RETURN).
 *   - This ensures both chains move together — you cannot update the CKB side
 *     without also spending the Bitcoin UTXO.
 *
 * =============================================================================
 * DUAL-CHAIN TRANSACTION VERIFICATION
 * =============================================================================
 *
 * An RGB++ transfer requires transactions on BOTH Bitcoin and CKB:
 *
 * Bitcoin side:
 *   Input:  UTXO_A (the one currently binding the RGB++ asset)
 *   Output: UTXO_B (the new UTXO that will bind the asset after transfer)
 *   Output: OP_RETURN <hash(CKB_transaction)>  ← commits to CKB tx
 *
 * CKB side:
 *   Input:  Cell with RGB++ lock args = UTXO_A
 *   Output: Cell with RGB++ lock args = UTXO_B
 *
 * The connection:
 *   1. The Bitcoin transaction spends UTXO_A and creates UTXO_B
 *   2. The Bitcoin transaction embeds a hash of the CKB transaction in OP_RETURN
 *   3. The CKB transaction updates the cell from (binding UTXO_A) to (binding UTXO_B)
 *   4. The RGB++ lock verifies that the Bitcoin transaction's OP_RETURN matches
 *
 * Neither side is valid without the other:
 *   - The CKB transaction is only valid if the Bitcoin transaction exists
 *   - The Bitcoin transaction without the matching CKB transaction is "incomplete"
 *     (the asset state would be in limbo)
 *
 * This is NOT a bridge. There are no custodians, no multisig federations,
 * no wrapped tokens. The asset is simultaneously on Bitcoin (as a UTXO binding)
 * and on CKB (as the actual asset state). Bitcoin provides settlement security.
 * CKB provides programmability.
 *
 * =============================================================================
 * THE "LEAP" OPERATION
 * =============================================================================
 *
 * "Leap" moves an RGB++ asset from Bitcoin L1 to CKB L1 (or vice versa).
 *
 * Leap to CKB (from Bitcoin-bound to CKB-native):
 *   1. Create a Bitcoin transaction spending the binding UTXO
 *      Output: OP_RETURN <special_leap_marker + ckb_address>
 *   2. Create a CKB transaction that:
 *      - Spends the RGB++ cell (with Bitcoin UTXO binding)
 *      - Creates a NEW CKB cell with a regular CKB lock (not RGB++ lock)
 *      - The new cell is now purely CKB-native
 *   3. The RGB++ lock validates that the Bitcoin transaction allows the leap
 *
 * After leap to CKB: the asset is now a regular CKB cell. It can be used in
 * CKB DeFi protocols, payment channels (Fiber Network), or other CKB-native apps
 * WITHOUT requiring any Bitcoin transaction.
 *
 * Leap back to Bitcoin: reverses the process, creating a new Bitcoin UTXO
 * binding and removing the pure CKB cell.
 *
 * =============================================================================
 * THE FIBER NETWORK
 * =============================================================================
 *
 * The Fiber Network is CKB's Layer 2 payment channel network — analogous to
 * Bitcoin's Lightning Network but for CKB and RGB++ assets.
 *
 * Key points:
 *   - Payment channels for CKB and RGB++ tokens
 *   - After a "leap" to CKB, assets can enter Fiber channels
 *   - Sub-second finality for off-chain payments
 *   - Settles disputes on CKB L1
 *   - Cross-network atomic swaps possible (RGB++ assets ↔ native CKB)
 *
 * This creates a full DeFi stack:
 *   Bitcoin (security) → RGB++ (programmability) → Fiber Network (speed)
 */

import { ccc } from "@ckb-ccc/core";

// =============================================================================
// CONSTANTS: RGB++ Protocol Parameters
// =============================================================================

/**
 * RGB++ lock script code hash on CKB testnet.
 *
 * This is the hash of the deployed RGB++ lock script binary.
 * Any cell with this code_hash in its lock script is an RGB++ cell.
 *
 * The code_hash is stable — it is derived from the lock script binary,
 * which is immutable once deployed.
 *
 * Note: These are approximate values for educational purposes.
 * Check the official RGB++ documentation for the current production values.
 */
const RGBPP_LOCK_CODE_HASH_TESTNET =
  "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cabb2c8f8b6b6f64d1e65";

/**
 * CKB testnet RPC endpoint.
 */
const TESTNET_RPC_URL = "https://testnet.ckb.dev/rpc";

// =============================================================================
// HELPER: Raw JSON-RPC call
// =============================================================================

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(TESTNET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  const json = (await response.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

// =============================================================================
// HELPER: Format RGB++ lock script args (Bitcoin UTXO → args bytes)
// =============================================================================

/**
 * Converts a Bitcoin UTXO (txid + vout) to RGB++ lock script args.
 *
 * The encoding:
 *   - Bitcoin txid is 32 bytes, but Bitcoin uses internal byte order (reversed)
 *     compared to the human-readable display order. RGB++ stores it in the
 *     same internal byte order Bitcoin uses (little-endian internally).
 *   - vout is a uint32 in little-endian encoding (4 bytes)
 *   - Total: 36 bytes
 *
 * @param txid - Bitcoin transaction ID in human-readable hex (big-endian display)
 * @param vout - Bitcoin output index (0-based)
 * @returns hex-encoded 36-byte args string
 */
function buildRgbppLockArgs(txid: string, vout: number): string {
  // Remove 0x prefix if present
  const cleanTxid = txid.replace("0x", "");

  // Bitcoin txid display order is reversed from internal byte order
  // We need to reverse the bytes for the RGB++ encoding
  const txidBytes = Buffer.from(cleanTxid, "hex");
  const reversedTxid = Buffer.from(txidBytes).reverse();

  // vout as uint32 little-endian (4 bytes)
  const voutBuffer = Buffer.allocUnsafe(4);
  voutBuffer.writeUInt32LE(vout, 0);

  // Concatenate: reversed txid (32 bytes) + vout LE (4 bytes) = 36 bytes
  const args = Buffer.concat([reversedTxid, voutBuffer]);
  return "0x" + args.toString("hex");
}

/**
 * Parses RGB++ lock script args back to human-readable Bitcoin UTXO reference.
 *
 * @param args - hex-encoded 36-byte args from an RGB++ lock script
 * @returns object with txid (display format) and vout
 */
function parseRgbppLockArgs(args: string): { txid: string; vout: number } {
  const cleanArgs = args.replace("0x", "");

  if (cleanArgs.length !== 72) {
    // 36 bytes = 72 hex chars
    throw new Error(`Invalid RGB++ args length: expected 72 hex chars, got ${cleanArgs.length}`);
  }

  // First 32 bytes (64 hex chars) = reversed txid
  const reversedTxidBytes = Buffer.from(cleanArgs.slice(0, 64), "hex");
  const txidBytes = Buffer.from(reversedTxidBytes).reverse();
  const txid = txidBytes.toString("hex");

  // Last 4 bytes (8 hex chars) = vout as uint32 LE
  const voutBuffer = Buffer.from(cleanArgs.slice(64, 72), "hex");
  const vout = voutBuffer.readUInt32LE(0);

  return { txid, vout };
}

// =============================================================================
// DEMONSTRATION 1: Explain the isomorphic binding concept
// =============================================================================

/**
 * Demonstrates the isomorphic mapping between Bitcoin UTXOs and CKB Cells.
 *
 * "Isomorphic" means "same structure." The Bitcoin transaction model and the
 * CKB cell model are both UTXO-like:
 *
 *   Bitcoin:  Consume old UTXOs → Create new UTXOs
 *   CKB:      Consume old Cells → Create new Cells
 *
 * RGB++ exploits this structural similarity to create a one-to-one mapping.
 */
function demonstrateIsomorphicBinding(): void {
  console.log("\n=== DEMONSTRATION 1: Isomorphic Binding ===\n");

  console.log("The RGB++ protocol works because Bitcoin and CKB share the same");
  console.log("fundamental transaction model: consume old outputs, create new outputs.\n");

  console.log("BITCOIN TRANSACTION:");
  console.log("  Inputs:                         Outputs:");
  console.log("  ┌─────────────────┐            ┌─────────────────┐");
  console.log("  │ UTXO_A          │            │ UTXO_B (new)    │");
  console.log("  │ txid: abc123    │ ────────→  │ txid: def456    │");
  console.log("  │ vout: 0         │            │ vout: 0         │");
  console.log("  └─────────────────┘            └─────────────────┘");
  console.log("                                 ┌─────────────────┐");
  console.log("                                 │ OP_RETURN       │");
  console.log("                                 │ hash(CKB_tx)    │ ← commitment");
  console.log("                                 └─────────────────┘\n");

  console.log("CKB TRANSACTION (mirroring the Bitcoin transaction above):");
  console.log("  Inputs:                         Outputs:");
  console.log("  ┌─────────────────┐            ┌─────────────────┐");
  console.log("  │ RGB++ Cell A    │            │ RGB++ Cell B    │");
  console.log("  │ lock.args:      │ ────────→  │ lock.args:      │");
  console.log("  │  UTXO_A ref     │            │  UTXO_B ref     │");
  console.log("  └─────────────────┘            └─────────────────┘\n");

  console.log("The binding:");
  console.log("  Bitcoin UTXO_A  ←→  CKB Cell A  (same asset, two representations)");
  console.log("  Bitcoin UTXO_B  ←→  CKB Cell B  (same asset after transfer)\n");

  console.log("Spending UTXO_A on Bitcoin = updating Cell A on CKB.");
  console.log("Neither can move without the other. This is the isomorphic binding.");
  console.log();

  // Show concrete example of the args encoding
  const exampleTxid = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const exampleVout = 0;
  const encodedArgs = buildRgbppLockArgs(exampleTxid, exampleVout);

  console.log("CONCRETE EXAMPLE — RGB++ lock script for Bitcoin UTXO:");
  console.log(`  Bitcoin UTXO: ${exampleTxid}:${exampleVout}`);
  console.log(`  RGB++ lock args (36 bytes): ${encodedArgs}`);
  console.log("  Breakdown:");
  console.log(`    Bytes 0-31:  Reversed txid = ${encodedArgs.slice(2, 66)}`);
  console.log(`    Bytes 32-35: vout as uint32 LE = ${encodedArgs.slice(66)}`);

  // Verify round-trip parsing
  const parsed = parseRgbppLockArgs(encodedArgs);
  console.log(`\n  Parsed back: txid=${parsed.txid}, vout=${parsed.vout}`);
  console.log(`  Round-trip correct: ${parsed.txid === exampleTxid && parsed.vout === exampleVout}`);
}

// =============================================================================
// DEMONSTRATION 2: RGB++ lock script structure
// =============================================================================

/**
 * Shows the complete structure of an RGB++ lock script.
 *
 * The lock script is the on-chain mechanism that enforces the isomorphic binding.
 * Understanding its structure is key to understanding how RGB++ works.
 */
function demonstrateRgbppLockStructure(): void {
  console.log("\n=== DEMONSTRATION 2: RGB++ Lock Script Structure ===\n");

  console.log("Every RGB++ asset on CKB lives in a cell with this lock script:\n");

  const exampleRgbppLock = {
    code_hash: RGBPP_LOCK_CODE_HASH_TESTNET,
    hash_type: "type",
    args: buildRgbppLockArgs(
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      1
    ),
  };

  console.log("Example RGB++ Lock Script:");
  console.log("  {");
  console.log(`    code_hash: "${exampleRgbppLock.code_hash}",`);
  console.log(`    hash_type: "${exampleRgbppLock.hash_type}",`);
  console.log(`    args: "${exampleRgbppLock.args}"`);
  console.log("  }\n");

  console.log("Fields explained:");
  console.log("  code_hash:  The hash of the deployed RGB++ lock script binary.");
  console.log("              Any cell with this code_hash IS an RGB++ cell.");
  console.log("              The code implements the dual-chain validation logic.\n");

  console.log('  hash_type:  "type" means code_hash is the hash of a cell that');
  console.log("              contains the lock script binary. This enables the");
  console.log("              code to be upgraded (the cell's type script controls");
  console.log("              upgrade permissions).\n");

  console.log("  args:       36 bytes encoding the Bitcoin UTXO this cell is bound to.");
  console.log("              Bytes 0-31: Bitcoin txid (reversed byte order)");
  console.log("              Bytes 32-35: Bitcoin vout as uint32 little-endian");
  console.log("              These args are SET when the cell is created and");
  console.log("              CHANGE with each transfer (to the new UTXO binding).\n");

  console.log("When the RGB++ lock executes (when the cell is being spent):");
  console.log("  1. Read args → extract the bound Bitcoin UTXO");
  console.log("  2. Verify that Bitcoin UTXO was spent in a valid Bitcoin tx");
  console.log("  3. Verify the Bitcoin tx's OP_RETURN contains hash(this CKB tx)");
  console.log("  4. Verify the CKB output has the correct new binding (next UTXO)");
  console.log("  5. If all checks pass → approve the CKB transaction");
}

// =============================================================================
// DEMONSTRATION 3: Finding RGB++ cells on CKB testnet
// =============================================================================

/**
 * Queries the CKB testnet to find actual RGB++ cells.
 *
 * We use the CKB indexer (or CCC's findCells) to search for cells
 * that have the RGB++ lock script as their lock.
 *
 * This demonstrates:
 *   - How to identify RGB++ cells programmatically
 *   - How to decode the Bitcoin UTXO from the lock script args
 *   - What data is stored in RGB++ cells (the asset state)
 */
async function demonstrateRgbppCellQuery(): Promise<void> {
  console.log("\n=== DEMONSTRATION 3: Finding RGB++ Cells on CKB Testnet ===\n");

  const client = new ccc.ClientPublicTestnet();

  console.log("Searching for RGB++ cells on CKB testnet...");
  console.log(`Using RGB++ lock code_hash: ${RGBPP_LOCK_CODE_HASH_TESTNET}\n`);

  // The RGB++ lock script has a fixed code_hash but variable args (the UTXO binding).
  // To find ALL RGB++ cells, we search with an empty args prefix (prefix search).
  const rgbppLockScript = ccc.Script.from({
    codeHash: RGBPP_LOCK_CODE_HASH_TESTNET,
    hashType: "type",
    args: "0x", // Empty args = match any args (prefix search mode)
  });

  const foundCells: Array<{
    outPoint: string;
    capacity: bigint;
    btcTxid: string;
    btcVout: number;
    hasTypeScript: boolean;
    dataSize: number;
  }> = [];

  try {
    let count = 0;

    for await (const cell of client.findCells({
      script: rgbppLockScript,
      scriptType: "lock",
      scriptSearchMode: "prefix", // Match any args starting with our prefix (empty = all)
    })) {
      const args = cell.cellOutput.lock.args;

      // Try to parse the Bitcoin UTXO from args
      let btcInfo = { txid: "unknown", vout: 0 };
      try {
        if (args && args.length >= 74) {
          // 0x + 72 hex chars = 36 bytes
          btcInfo = parseRgbppLockArgs(args);
        }
      } catch {
        // Args might not match expected format on testnet
      }

      foundCells.push({
        outPoint: `${cell.outPoint.txHash}:${cell.outPoint.index}`,
        capacity: cell.cellOutput.capacity,
        btcTxid: btcInfo.txid,
        btcVout: btcInfo.vout,
        hasTypeScript: !!cell.cellOutput.type,
        dataSize: cell.outputData ? (cell.outputData.length - 2) / 2 : 0,
      });

      count++;
      if (count >= 5) break; // Limit output for the lesson
    }

    if (foundCells.length === 0) {
      console.log("No RGB++ cells found with the current code_hash on testnet.");
      console.log("The testnet code_hash may differ from the value hardcoded in this lesson.");
      console.log("Check the official RGB++ documentation for the current testnet deployment.\n");
      demonstrateMockRgbppCells();
    } else {
      console.log(`Found ${foundCells.length} RGB++ cells:\n`);
      for (const cell of foundCells) {
        console.log(`Cell: ${cell.outPoint}`);
        console.log(`  Capacity:       ${(cell.capacity / 100_000_000n).toString()} CKB`);
        console.log(`  Bitcoin UTXO:   ${cell.btcTxid}:${cell.btcVout}`);
        console.log(`  Has type script: ${cell.hasTypeScript} (${cell.hasTypeScript ? "carries a token/NFT" : "capacity-only cell"})`);
        console.log(`  Data size:      ${cell.dataSize} bytes`);
        console.log();
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`Query failed: ${msg}`);
    console.log("\n[Demo mode] Showing what RGB++ cells look like:\n");
    demonstrateMockRgbppCells();
  }
}

/**
 * Shows what RGB++ cells look like when the testnet query doesn't return results.
 */
function demonstrateMockRgbppCells(): void {
  const mockCells = [
    {
      outPoint: "0x7a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b:0",
      capacity: 14400000000n, // 144 CKB
      btcTxid: "a94f5374fce5edbc8e2a8697c15331677e6ebf0b00000000000000000000000b",
      btcVout: 0,
      hasTypeScript: true,
      dataSize: 16,
      assetType: "RGB++ xUDT token",
    },
    {
      outPoint: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef:1",
      capacity: 20100000000n, // 201 CKB
      btcTxid: "b3f2a1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2",
      btcVout: 2,
      hasTypeScript: true,
      dataSize: 32,
      assetType: "RGB++ Spore NFT",
    },
    {
      outPoint: "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210:0",
      capacity: 6100000000n, // 61 CKB
      btcTxid: "c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
      btcVout: 0,
      hasTypeScript: false,
      dataSize: 0,
      assetType: "RGB++ capacity-only (no asset, just BTC UTXO binding)",
    },
  ];

  console.log("Example RGB++ cells (mock data for illustration):\n");
  for (const cell of mockCells) {
    console.log(`Cell: ${cell.outPoint}`);
    console.log(`  Capacity:        ${(cell.capacity / 100_000_000n).toString()} CKB`);
    console.log(`  Bitcoin UTXO:    ${cell.btcTxid.slice(0, 16)}...${cell.btcTxid.slice(-8)}:${cell.btcVout}`);
    console.log(`  Asset type:      ${cell.assetType}`);
    console.log(`  Type script:     ${cell.hasTypeScript ? "Present (defines the asset standard)" : "Absent"}`);
    console.log(`  Data size:       ${cell.dataSize} bytes (asset-specific data)`);
    console.log();
  }

  console.log("Note on data stored in RGB++ cells:");
  console.log("  - The lock script encodes the Bitcoin UTXO binding (36 bytes in args)");
  console.log("  - The type script (if present) encodes the asset standard (xUDT, Spore, etc.)");
  console.log("  - The cell data stores asset-specific information (token amount, NFT content)");
  console.log("  - The capacity stores enough CKB to cover the cell's on-chain footprint");
}

// =============================================================================
// DEMONSTRATION 4: Dual-chain transaction flow
// =============================================================================

/**
 * Walks through a complete RGB++ transfer, explaining both the Bitcoin
 * and CKB sides of the transaction.
 */
function demonstrateDualChainTransfer(): void {
  console.log("\n=== DEMONSTRATION 4: Dual-Chain Transfer Flow ===\n");

  console.log("Scenario: Alice wants to send 100 RGB++ tokens to Bob.\n");

  console.log("BEFORE THE TRANSFER:");
  console.log("  Alice has:");
  console.log("    Bitcoin: UTXO_Alice (txid: aaa...000, vout: 0) — her 100 RGB++ tokens");
  console.log("    CKB:     RGB++ Cell with lock.args = encode(aaa...000, 0)");
  console.log("             Cell data: 100 tokens (encoded by xUDT type script)");
  console.log();

  console.log("STEP 1: Build the CKB transaction");
  console.log("  Input:  RGB++ Cell (lock.args = encode(UTXO_Alice))");
  console.log("          Type script: xUDT, args: token_id");
  console.log("  Output: RGB++ Cell for Bob");
  console.log("          Lock args: encode(UTXO_Bob)  ← Bob's new Bitcoin UTXO");
  console.log("          Cell data: 100 tokens");
  console.log("  (We know UTXO_Bob in advance because we pre-planned both transactions)");
  console.log();

  console.log("STEP 2: Compute the CKB transaction hash");
  console.log("  ckbTxHash = blake2b256(serialized_ckb_transaction)");
  console.log("            = 0xdeadbeef...  (example)");
  console.log();

  console.log("STEP 3: Build the Bitcoin transaction");
  console.log("  Input:  UTXO_Alice (spending Alice's Bitcoin UTXO)");
  console.log("  Output: UTXO_Bob (creating Bob's new Bitcoin UTXO, ~dust amount)");
  console.log("  Output: OP_RETURN <commitment_to_ckb_tx>");
  console.log("          where commitment = hash(type || ckbTxHash)");
  console.log("          This embeds the CKB transaction reference in Bitcoin permanently");
  console.log();

  console.log("STEP 4: Submit Bitcoin transaction");
  console.log("  The Bitcoin transaction is submitted and confirmed.");
  console.log("  Bitcoin's proof-of-work now secures this state transition.");
  console.log();

  console.log("STEP 5: Submit CKB transaction");
  console.log("  The CKB transaction is submitted with a proof of the Bitcoin tx.");
  console.log("  The RGB++ lock script verifies:");
  console.log("    a) UTXO_Alice was spent in the Bitcoin transaction");
  console.log("    b) Bitcoin tx's OP_RETURN = commitment_to_this_ckb_tx");
  console.log("    c) CKB output's lock.args = encode(UTXO_Bob)");
  console.log("    d) Token amounts balance (xUDT type script check)");
  console.log("  If ALL checks pass → transaction accepted");
  console.log();

  console.log("AFTER THE TRANSFER:");
  console.log("  Bob has:");
  console.log("    Bitcoin: UTXO_Bob (txid: bbb...000, vout: 0)");
  console.log("    CKB:     RGB++ Cell with lock.args = encode(bbb...000, 0)");
  console.log("             Cell data: 100 tokens");
  console.log();

  console.log("Security properties achieved:");
  console.log("  - Bitcoin's PoW secures the ownership transition");
  console.log("  - CKB's smart contracts enforce the token rules");
  console.log("  - No custodian, no bridge, no wrapped asset");
  console.log("  - Fully verifiable by anyone on either chain");
}

// =============================================================================
// DEMONSTRATION 5: The Leap operation
// =============================================================================

/**
 * Demonstrates the "leap" operation — moving an RGB++ asset from Bitcoin L1
 * binding to CKB L1 native ownership.
 *
 * After a leap, the asset is a regular CKB cell with no Bitcoin UTXO binding.
 * This allows the asset to be used in CKB-native DeFi without Bitcoin transactions.
 */
function demonstrateLeapOperation(): void {
  console.log("\n=== DEMONSTRATION 5: The Leap Operation ===\n");

  console.log("RGB++ assets can be 'leaped' between two states:\n");

  console.log("STATE A: Bitcoin-bound (RGB++ lock)");
  console.log("  Ownership determined by: who controls the Bitcoin UTXO");
  console.log("  Transfers require:        Bitcoin + CKB transaction pair");
  console.log("  Smart contracts run on:   CKB");
  console.log("  Settlement on:            Bitcoin L1\n");

  console.log("STATE B: CKB-native (regular CKB lock like secp256k1-blake160)");
  console.log("  Ownership determined by: who controls the CKB private key");
  console.log("  Transfers require:        CKB transaction only");
  console.log("  Smart contracts run on:   CKB");
  console.log("  Settlement on:            CKB L1\n");

  console.log("LEAPING FROM BITCOIN-BOUND TO CKB-NATIVE (Leap to CKB):");
  console.log();
  console.log("  Bitcoin transaction:");
  console.log("    Input:  UTXO_old (Alice's binding UTXO)");
  console.log("    Output: OP_RETURN <leap_marker + ckb_recipient_address>");
  console.log("    (No new Bitcoin UTXO output — the asset leaves Bitcoin)");
  console.log();
  console.log("  CKB transaction:");
  console.log("    Input:  RGB++ Cell (lock: RGB++ lock, args: encode(UTXO_old))");
  console.log("    Output: Regular CKB Cell (lock: secp256k1-blake160, args: Alice_ckb_addr)");
  console.log("    (Output uses a standard CKB lock — no RGB++ lock)");
  console.log();
  console.log("  After leap: asset is a regular CKB cell. Bitcoin is not involved.");
  console.log("  The asset can now flow through:");
  console.log("    - CKB DeFi protocols (DEX, lending, AMMs)");
  console.log("    - Fiber Network payment channels");
  console.log("    - Any CKB-native application");
  console.log();

  console.log("LEAPING BACK FROM CKB-NATIVE TO BITCOIN-BOUND (Leap to BTC):");
  console.log();
  console.log("  CKB transaction:");
  console.log("    Input:  Regular CKB Cell (secp256k1-blake160 lock)");
  console.log("    Output: RGB++ Cell (RGB++ lock, args: encode(new_UTXO))");
  console.log("    (A new Bitcoin UTXO reference is pre-planned and encoded)");
  console.log();
  console.log("  Bitcoin transaction:");
  console.log("    Output: new_UTXO (creating the binding UTXO on Bitcoin)");
  console.log("    Output: OP_RETURN <reverse_leap_commitment>");
  console.log();
  console.log("  After leap: asset is back under Bitcoin UTXO control.");
  console.log("  Can be transferred using standard RGB++ dual-chain transfers.");
  console.log();

  console.log("WHY LEAP IS IMPORTANT:");
  console.log("  - DeFi without Bitcoin transactions: Once on CKB, no BTC fees per trade");
  console.log("  - Fiber Network access: CKB-native assets can enter payment channels");
  console.log("  - Interoperability: Assets can move between the two security models");
  console.log("  - No permanent commitment: Users choose where their asset lives");
}

// =============================================================================
// DEMONSTRATION 6: RGB++ vs Traditional Bridges
// =============================================================================

/**
 * Compares RGB++ with traditional cross-chain bridge approaches.
 *
 * This is one of the most important distinctions to understand:
 * RGB++ is NOT a bridge — it is an isomorphic binding.
 */
function demonstrateVsBridges(): void {
  console.log("\n=== DEMONSTRATION 6: RGB++ vs Traditional Bridges ===\n");

  console.log("TRADITIONAL BRIDGES (e.g., WBTC on Ethereum):");
  console.log("  1. User sends BTC to a custodian (BitGo, multisig, etc.)");
  console.log("  2. Custodian mints WBTC on Ethereum (ERC-20 token)");
  console.log("  3. WBTC represents BTC, but is NOT BTC");
  console.log("  4. To get BTC back, user burns WBTC and custodian releases BTC");
  console.log();
  console.log("  RISKS:");
  console.log("    - Custodian can be hacked (billions lost in bridge hacks)");
  console.log("    - Custodian can freeze or seize assets");
  console.log("    - WBTC is not BTC — it's a new asset with new risks");
  console.log("    - Regulatory risk: custodian can be ordered to blacklist addresses");
  console.log("    - Bridge contract bugs can drain all locked assets");
  console.log();

  console.log("RGB++ (NOT A BRIDGE):");
  console.log("  1. User creates a Bitcoin transaction spending their UTXO");
  console.log("  2. The same user creates a matching CKB transaction");
  console.log("  3. The CKB cell IS the asset — not a representation of it");
  console.log("  4. No custodian involved at any step");
  console.log("  5. Bitcoin UTXO and CKB cell are cryptographically linked");
  console.log("  6. Either chain can verify the other's state");
  console.log();
  console.log("  PROPERTIES:");
  console.log("    - No custodian: nothing to hack or seize");
  console.log("    - No wrapped token: the asset is the asset");
  console.log("    - Trustless: anyone can verify the binding on both chains");
  console.log("    - No single point of failure");
  console.log("    - Bitcoin's PoW security is preserved, not bypassed");
  console.log();

  const comparison = [
    { property: "Custodian required", bridge: "Yes", rgbpp: "No" },
    { property: "Hack risk", bridge: "High (bridges frequently hacked)", rgbpp: "Low (no central custody)" },
    { property: "Asset type", bridge: "Wrapped token (not the original)", rgbpp: "Original asset" },
    { property: "Bitcoin security", bridge: "Not preserved", rgbpp: "Preserved (same UTXO model)" },
    { property: "Regulatory risk", bridge: "High (custodian can freeze)", rgbpp: "Low (no custodian)" },
    { property: "Smart contracts", bridge: "Yes (Ethereum)", rgbpp: "Yes (CKB)" },
  ];

  console.log("  COMPARISON TABLE:");
  console.log(`  ${"Property".padEnd(25)} ${"Traditional Bridge".padEnd(35)} RGB++`);
  console.log("  " + "─".repeat(80));
  for (const row of comparison) {
    console.log(`  ${row.property.padEnd(25)} ${row.bridge.padEnd(35)} ${row.rgbpp}`);
  }
}

// =============================================================================
// DEMONSTRATION 7: Real RGB++ ecosystem stats
// =============================================================================

/**
 * Shows real-world RGB++ ecosystem data from Q2 2025.
 */
async function demonstrateRgbppEcosystem(): Promise<void> {
  console.log("\n=== DEMONSTRATION 7: RGB++ Ecosystem (Real-World Data) ===\n");

  console.log("RGB++ has seen significant real-world adoption. As of Q2 2025:\n");

  const ecosystemStats = [
    {
      metric: "New RGB++ assets launched in Q2 2025",
      value: "623 assets",
      source: "CKB ecosystem reports",
    },
    {
      metric: "Notable protocol using RGB++",
      value: "Stable++ (stablecoin protocol)",
      source: "Stable++ documentation",
    },
    {
      metric: "Fiber Network channels",
      value: "Active (exact number varies)",
      source: "Fiber Network explorer",
    },
    {
      metric: "Asset types supported",
      value: "xUDT tokens, Spore NFTs, custom types",
      source: "RGB++ specification",
    },
  ];

  for (const stat of ecosystemStats) {
    console.log(`  ${stat.metric}:`);
    console.log(`    Value:  ${stat.value}`);
    console.log(`    Source: ${stat.source}`);
    console.log();
  }

  // Try to get current testnet block info to show the chain is live
  try {
    const tip = await rpcCall("get_tip_header");
    const header = tip as { number: string; timestamp: string };
    const blockNum = parseInt(header.number, 16);
    const timestamp = new Date(parseInt(header.timestamp, 16));

    console.log("  Live testnet data:");
    console.log(`    Current block: ${blockNum.toLocaleString()}`);
    console.log(`    Timestamp:     ${timestamp.toISOString()}`);
    console.log();
  } catch {
    console.log("  (Testnet query skipped — no connection)");
  }

  console.log("Use cases powered by RGB++:");
  const useCases = [
    "Bitcoin-native DeFi (trading, lending, AMMs) without bridges",
    "Tokenized Bitcoin assets (tokens backed by BTC UTXOs)",
    "Bitcoin programmability without modifying Bitcoin",
    "Cross-chain atomic swaps (RGB++ assets ↔ native BTC)",
    "Fiber Network payment channels for RGB++ tokens",
    "NFTs anchored to Bitcoin UTXOs",
    "Stablecoins using Bitcoin PoW for settlement security",
  ];

  for (const useCase of useCases) {
    console.log(`  - ${useCase}`);
  }
}

// =============================================================================
// DEMONSTRATION 8: How to detect RGB++ transactions programmatically
// =============================================================================

/**
 * Shows how to programmatically detect and decode RGB++ transactions
 * from the CKB blockchain.
 *
 * This is useful for building RGB++ explorers, analytics tools, or wallets.
 */
async function demonstrateRgbppDetection(): Promise<void> {
  console.log("\n=== DEMONSTRATION 8: Detecting RGB++ Transactions ===\n");

  console.log("How to find RGB++ transactions in the CKB chain:\n");

  console.log("Method 1: Search by lock script code_hash");
  console.log("  - Query cells with code_hash = RGBPP_LOCK_CODE_HASH");
  console.log("  - Any live cell with this code_hash is an RGB++ cell");
  console.log("  - The args tell you which Bitcoin UTXO it is bound to");
  console.log();

  console.log("Method 2: Monitor transactions");
  console.log("  - Subscribe to new CKB blocks");
  console.log("  - For each transaction, check if any input/output cells");
  console.log("    have the RGB++ lock code_hash");
  console.log("  - RGB++ transactions will have matching Bitcoin transactions");
  console.log();

  console.log("Method 3: Query by Bitcoin UTXO");
  console.log("  - Given a Bitcoin UTXO (txid + vout)");
  console.log("  - Compute the expected RGB++ lock args");
  console.log("  - Query CKB for a live cell with those exact args");
  console.log("  - If found, this is the current CKB state for that Bitcoin UTXO");
  console.log();

  // Demonstrate Method 3 with a specific example
  const exampleBtcTxid = "a94f5374fce5edbc8e2a8697c15331677e6ebf0b00000000000000000000000b";
  const exampleBtcVout = 0;
  const lockArgs = buildRgbppLockArgs(exampleBtcTxid, exampleBtcVout);

  console.log("Example: Finding the CKB cell for a specific Bitcoin UTXO\n");
  console.log(`  Bitcoin UTXO: ${exampleBtcTxid}:${exampleBtcVout}`);
  console.log(`  Computed lock args: ${lockArgs}`);
  console.log();

  const client = new ccc.ClientPublicTestnet();

  try {
    const exactLockScript = ccc.Script.from({
      codeHash: RGBPP_LOCK_CODE_HASH_TESTNET,
      hashType: "type",
      args: lockArgs,
    });

    const cells: ccc.Cell[] = [];
    for await (const cell of client.findCells({
      script: exactLockScript,
      scriptType: "lock",
      scriptSearchMode: "exact",
    })) {
      cells.push(cell);
      if (cells.length >= 3) break;
    }

    if (cells.length === 0) {
      console.log("  No CKB cell found for this Bitcoin UTXO.");
      console.log("  This is expected — the example UTXO is not real.");
      console.log("  For a real RGB++ UTXO, this query would return the bound cell.");
    } else {
      console.log(`  Found ${cells.length} cell(s) bound to this Bitcoin UTXO:`);
      for (const cell of cells) {
        console.log(`    OutPoint: ${cell.outPoint.txHash}:${cell.outPoint.index}`);
        console.log(`    Capacity: ${(cell.cellOutput.capacity / 100_000_000n).toString()} CKB`);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  Query failed: ${msg}`);
    console.log("  In a working setup, this would search for the exact RGB++ cell.");
  }

  console.log();
  console.log("TypeScript helper to find RGB++ cell by Bitcoin UTXO:");
  console.log(`
  async function findRgbppCell(btcTxid: string, btcVout: number, client: ccc.Client) {
    const lockArgs = buildRgbppLockArgs(btcTxid, btcVout);
    const lockScript = ccc.Script.from({
      codeHash: RGBPP_LOCK_CODE_HASH,
      hashType: "type",
      args: lockArgs,
    });

    const cells: ccc.Cell[] = [];
    for await (const cell of client.findCells({
      script: lockScript,
      scriptType: "lock",
      scriptSearchMode: "exact",
    })) {
      cells.push(cell);
    }
    return cells;
  }
  `);
}

// =============================================================================
// MAIN: Run all demonstrations
// =============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("  LESSON 21: RGB++ PROTOCOL — BITCOIN & CKB INTEROPERABILITY");
  console.log("=".repeat(70));

  console.log(`
RGB++ is a protocol that creates cryptographic bindings between Bitcoin UTXOs
and CKB Cells, enabling smart contracts and DeFi on Bitcoin without bridges,
custodians, or wrapped tokens. This lesson explores how it works in depth.
`);

  demonstrateIsomorphicBinding();
  demonstrateRgbppLockStructure();
  await demonstrateRgbppCellQuery();
  demonstrateDualChainTransfer();
  demonstrateLeapOperation();
  demonstrateVsBridges();
  await demonstrateRgbppEcosystem();
  await demonstrateRgbppDetection();

  console.log("\n" + "=".repeat(70));
  console.log("  LESSON 21 COMPLETE");
  console.log("=".repeat(70));
  console.log(`
Summary:
  - RGB++ creates isomorphic bindings: Bitcoin UTXO ↔ CKB Cell
  - The RGB++ lock script args encode the Bitcoin UTXO (36 bytes)
  - Every RGB++ transfer requires transactions on BOTH chains
  - Bitcoin provides settlement security; CKB provides programmability
  - "Leap" moves assets between Bitcoin-bound and CKB-native ownership
  - NO custodian, NO bridge, NO wrapped tokens — purely cryptographic
  - Fiber Network provides L2 payment channels for RGB++ assets
  - 623+ new assets launched in Q2 2025; Stable++ uses it in production

Congratulations on completing the RGB++ lesson!
Next: Lesson 22 — Building a Token DEX on CKB
`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
