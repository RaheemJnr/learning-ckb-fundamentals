/**
 * Lesson 20: Light Client Development on CKB
 *
 * This file demonstrates the CKB light client protocol and how to build
 * lightweight applications that do NOT require syncing the entire blockchain.
 *
 * =============================================================================
 * WHAT IS A LIGHT CLIENT?
 * =============================================================================
 *
 * A light client (also called an SPV client — Simplified Payment Verification)
 * is a program that participates in a blockchain network WITHOUT downloading
 * and verifying every block. Instead, it:
 *
 *   1. Downloads only block HEADERS (tiny, ~200 bytes each)
 *   2. Asks full nodes for specific pieces of data (cells, transactions)
 *   3. Verifies that data using Merkle proofs included with the response
 *
 * This makes light clients suitable for:
 *   - Mobile wallets (limited storage, battery constraints)
 *   - Browser extensions (cannot store 100+ GB)
 *   - IoT devices (minimal RAM and CPU)
 *   - Any environment where running a full node is impractical
 *
 * =============================================================================
 * CKB's FLYCLIENT-BASED LIGHT CLIENT PROTOCOL
 * =============================================================================
 *
 * CKB implements a protocol inspired by FlyClient (a 2019 academic paper by
 * Benedikt Bunz et al.). The key innovation is LOGARITHMIC header syncing:
 *
 *   Traditional SPV: Download ALL headers from genesis → O(n) headers
 *   FlyClient:       Download O(log n) sampled headers   → exponentially fewer
 *
 * How it works mathematically:
 *   1. The chain is divided into epochs (roughly 4 hours of blocks each)
 *   2. A Merkle Mountain Range (MMR) commitment is embedded in each header,
 *      committing to the difficulty of all previous headers
 *   3. A light client samples headers at logarithmically spaced positions
 *   4. By checking the sampled headers against the MMR commitments, the client
 *      can verify the claimed total proof-of-work with high probability
 *   5. The more headers an attacker fakes, the more headers the sampling
 *      catches — creating a provably secure probabilistic guarantee
 *
 * CKB's NC-Max consensus (an improvement over Bitcoin's Nakamoto Consensus)
 * makes this particularly efficient because:
 *   - Difficulty adjustments happen every epoch (not every 2016 blocks like BTC)
 *   - The MMR structure is natively supported in CKB headers
 *   - Uncles are properly accounted for in difficulty calculations
 *
 * =============================================================================
 * STORAGE COMPARISON
 * =============================================================================
 *
 *   Full node:    Downloads ALL blocks since genesis
 *                 Current CKB mainnet: ~100+ GB and growing
 *                 Syncing time: hours to days
 *
 *   Light client: Downloads ONE current header + O(log n) sampled historical headers
 *                 Storage: ~kilobytes
 *                 Sync time: seconds to minutes
 *
 * This is not a minor improvement — it is a 6+ orders of magnitude reduction.
 *
 * =============================================================================
 * WHAT CAN A LIGHT CLIENT DO?
 * =============================================================================
 *
 *   YES — Light client CAN:
 *     - Verify that a cell CURRENTLY EXISTS (live cell) using Merkle proofs
 *     - Query live cells by lock script (your wallet balance)
 *     - Send transactions to the network
 *     - Verify transaction inclusion proofs
 *     - Monitor cells for changes
 *     - Verify the current blockchain state
 *
 *   NO — Light client CANNOT:
 *     - Serve historical transactions (no full block history)
 *     - Provide complete transaction history for an address
 *     - Validate the full chain state independently (relies on proofs from peers)
 *     - Act as a block producer or full validating node
 *
 * =============================================================================
 * THE CKB LIGHT CLIENT BINARY
 * =============================================================================
 *
 * The Nervos Foundation maintains an official CKB light client binary:
 *   https://github.com/nervosnetwork/ckb-light-client
 *
 * The light client exposes an RPC API on a configurable port (default: 9000).
 * This API is SIMILAR to but NOT IDENTICAL to the full node RPC.
 *
 * Key API differences:
 *   Full node:    /rpc/get_blockchain_info, /rpc/get_block, /rpc/get_cells, ...
 *   Light client: /rpc/get_scripts, /rpc/set_scripts, /rpc/get_cells, ...
 *                 (subset of full node RPC + light-client-specific methods)
 *
 * The light client uses the same JSON-RPC protocol as the full node, so
 * the same client libraries (like @ckb-ccc/core) can connect to it.
 */

import { ccc } from "@ckb-ccc/core";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Light client RPC endpoint.
 *
 * By default, the CKB light client binary listens on port 9000.
 * You can change this in the light client's ckb-light-client.toml config file.
 *
 * For comparison, the full node RPC is on port 8114 (mainnet) or 8114 (testnet).
 */
const LIGHT_CLIENT_RPC_URL = "http://localhost:9000";

/**
 * CKB Testnet full node for comparison queries.
 *
 * We use a public testnet node to demonstrate what a FULL node can do
 * that the light client cannot.
 */
const TESTNET_FULL_NODE_URL = "https://testnet.ckb.dev/rpc";

// =============================================================================
// RPC HELPER: Direct JSON-RPC calls
// =============================================================================

/**
 * Makes a raw JSON-RPC call to any CKB node (full node or light client).
 *
 * CKB uses the standard JSON-RPC 2.0 protocol over HTTP POST.
 * Both full nodes and light clients speak the same wire format.
 *
 * @param url     - The RPC endpoint URL
 * @param method  - The RPC method name (e.g., "get_tip_header")
 * @param params  - Array of parameters for the method
 * @returns       The JSON-RPC result field
 */
async function rpcCall(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { result?: unknown; error?: { message: string } };

  if (json.error) {
    throw new Error(`RPC error: ${json.error.message}`);
  }

  return json.result;
}

// =============================================================================
// DEMONSTRATION 1: Connect to light client and get chain info
// =============================================================================

/**
 * Demonstrates connecting to the CKB light client and getting the current
 * blockchain tip header.
 *
 * The light client knows the CURRENT best header because it:
 *   1. Connected to multiple full nodes when it started
 *   2. Downloaded headers using FlyClient's logarithmic sampling
 *   3. Verified the sampled headers against each other's MMR commitments
 *   4. Selected the chain with the most accumulated proof-of-work
 *
 * This process took seconds/minutes — not hours like a full sync.
 */
async function demonstrateLightClientConnection(): Promise<void> {
  console.log("\n=== DEMONSTRATION 1: Light Client Connection ===\n");

  console.log(`Connecting to light client at: ${LIGHT_CLIENT_RPC_URL}`);
  console.log("(If this fails, see README.md for how to run the light client binary)\n");

  try {
    // get_tip_header works on BOTH full nodes and light clients
    // The response format is identical
    const tipHeader = await rpcCall(LIGHT_CLIENT_RPC_URL, "get_tip_header");

    const header = tipHeader as {
      number: string;
      timestamp: string;
      epoch: string;
      compact_target: string;
      dao: string;
    };

    const blockNumber = parseInt(header.number, 16);
    const timestamp = new Date(parseInt(header.timestamp, 16));
    const epochInfo = header.epoch;

    console.log("Connected to light client successfully!");
    console.log(`  Current block height:  ${blockNumber.toLocaleString()}`);
    console.log(`  Block timestamp:       ${timestamp.toISOString()}`);
    console.log(`  Current epoch:         ${epochInfo} (hex)`);
    console.log(`  Compact target (diff): ${header.compact_target}`);

    // The DAO field in the header encodes total CKB issued, locked, etc.
    // Even the light client has access to this aggregate state.
    console.log(`  DAO field:             ${header.dao}`);

    console.log("\nKey insight: The light client knows this header WITHOUT");
    console.log("downloading all previous blocks. It verified this header");
    console.log("using FlyClient's logarithmic sampling protocol.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`Light client not available: ${msg}`);
    console.log("\nRunning in DEMO MODE — showing what the output would look like.");
    console.log("Follow README.md to install and run the light client binary.\n");

    // Show mock output so the lesson is educational even without the binary
    console.log("=== DEMO MODE OUTPUT ===");
    console.log("Connected to light client successfully!");
    console.log("  Current block height:  14,523,881");
    console.log("  Block timestamp:       2025-06-15T14:32:17.000Z");
    console.log("  Current epoch:         0x6a0004000000000b (hex)");
    console.log("  Compact target (diff): 0x1d020f52");
    console.log("  DAO field:             0x...");
  }
}

// =============================================================================
// DEMONSTRATION 2: Light client vs full node API comparison
// =============================================================================

/**
 * Compares the API surface of a light client versus a full node.
 *
 * The most important difference: the light client uses SET SCRIPTS to register
 * which scripts you care about, then indexes only those scripts' cells.
 * A full node has ALL cells and can answer any query immediately.
 */
async function demonstrateApiDifferences(): Promise<void> {
  console.log("\n=== DEMONSTRATION 2: Light Client vs Full Node API ===\n");

  // ------------------------------------------------------------------
  // FULL NODE query: get_blockchain_info
  // Available on full nodes ONLY. Light clients do not maintain full
  // blockchain metadata like chain name, median time, epoch statistics.
  // ------------------------------------------------------------------
  console.log("Query: get_blockchain_info");
  console.log("  Full node:    Supported (has complete chain history)");
  console.log("  Light client: NOT supported (no full chain history)\n");

  // ------------------------------------------------------------------
  // FULL NODE query: get_block
  // Full nodes store every block. Light clients only have sampled headers.
  // Asking a light client for block #1000 would fail — it never downloaded it.
  // ------------------------------------------------------------------
  console.log("Query: get_block (by hash or number)");
  console.log("  Full node:    Supported (stores all blocks)");
  console.log("  Light client: NOT supported (only stores sampled headers)\n");

  // ------------------------------------------------------------------
  // SHARED query: get_tip_header
  // Both know the current best header. This is the ONE header the
  // light client has verified with full confidence.
  // ------------------------------------------------------------------
  console.log("Query: get_tip_header");
  console.log("  Full node:    Supported");
  console.log("  Light client: Supported (this is the primary header it tracks)\n");

  // ------------------------------------------------------------------
  // SHARED query: get_cells (cell searching)
  // Both can search for live cells by lock script, type script, or data hash.
  // The light client can do this for SCRIPTS IT IS TRACKING.
  // The full node can do this for ANY script.
  // ------------------------------------------------------------------
  console.log("Query: get_cells (search live cells by script)");
  console.log("  Full node:    Supported for any script at any time");
  console.log("  Light client: Supported ONLY for scripts registered via set_scripts\n");

  // ------------------------------------------------------------------
  // LIGHT CLIENT ONLY: set_scripts
  // This is a light-client-specific method. You tell the light client
  // WHICH script hashes you want it to watch. The light client then
  // syncs only the data relevant to those scripts.
  //
  // This is the fundamental difference in usage pattern:
  //   Full node:    query anything, anytime
  //   Light client: declare what you care about, wait for sync, then query
  // ------------------------------------------------------------------
  console.log("Method: set_scripts (register scripts to watch)");
  console.log("  Full node:    NOT available (not needed — has everything)");
  console.log("  Light client: REQUIRED before querying cells\n");

  // ------------------------------------------------------------------
  // SHARED: send_transaction
  // Both can broadcast transactions to the network.
  // The light client validates basic structure but NOT full execution —
  // it relies on the receiving full nodes to do final validation.
  // ------------------------------------------------------------------
  console.log("Method: send_transaction");
  console.log("  Full node:    Supported (validates and broadcasts)");
  console.log("  Light client: Supported (broadcasts to connected peers)\n");

  console.log("KEY TAKEAWAY: The light client API is a SUBSET of the full node API.");
  console.log("For basic wallet operations (check balance, send, receive), the");
  console.log("light client provides everything you need.");
}

// =============================================================================
// DEMONSTRATION 3: Registering scripts with the light client
// =============================================================================

/**
 * Demonstrates the set_scripts method — the core of light client usage.
 *
 * Before a light client can tell you your balance, you must register your
 * lock script with it. The light client then:
 *   1. Asks connected full nodes for all cells matching this script
 *   2. Requests Merkle proofs verifying those cells exist in the chain
 *   3. Verifies the proofs against the block headers it has sampled
 *   4. Maintains a local index of your live cells
 *
 * This is the "pay attention to" model vs the full node's "I have everything" model.
 */
async function demonstrateScriptRegistration(): Promise<void> {
  console.log("\n=== DEMONSTRATION 3: Registering Scripts with Light Client ===\n");

  // Example: A typical CKB secp256k1-blake160 lock script
  // In a real wallet, this would be derived from the user's private key
  const exampleLockScript = {
    code_hash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    hash_type: "type",
    args: "0x36c329ed630d6ce750712a477543672adab57f4c", // Example address args
  };

  console.log("Registering a lock script with the light client:");
  console.log(`  code_hash: ${exampleLockScript.code_hash}`);
  console.log(`  hash_type: ${exampleLockScript.hash_type}`);
  console.log(`  args:      ${exampleLockScript.args}`);
  console.log();

  // The set_scripts RPC method takes an array of script objects with
  // an optional block_number to start syncing from.
  // Setting block_number to a recent block makes syncing much faster
  // if you know the wallet was created after a certain block.
  const setScriptsPayload = [
    {
      script: exampleLockScript,
      script_type: "lock",
      // block_number: "0x0" means sync from genesis (slowest but most complete)
      // For a new wallet, use the current block number to skip history
      block_number: "0x0",
    },
  ];

  console.log("RPC call: set_scripts");
  console.log("Payload:", JSON.stringify(setScriptsPayload, null, 2));

  try {
    await rpcCall(LIGHT_CLIENT_RPC_URL, "set_scripts", [setScriptsPayload]);
    console.log("\nScript registered successfully!");
    console.log("The light client will now sync cells for this lock script.");
    console.log("After sync completes, get_cells will return live cells for this script.");
  } catch (_error) {
    console.log("\n[Demo mode] In a real setup, this would register the script.");
    console.log("After calling set_scripts, the light client:");
    console.log("  1. Contacts full nodes to find cells matching this script");
    console.log("  2. Requests Merkle inclusion proofs for those cells");
    console.log("  3. Verifies proofs against the sampled block headers");
    console.log("  4. Builds a local index you can query with get_cells");
  }

  // Show how to CHECK which scripts are currently registered
  console.log("\nTo check registered scripts: call get_scripts");
  console.log("RPC call: get_scripts");
  try {
    const scripts = await rpcCall(LIGHT_CLIENT_RPC_URL, "get_scripts");
    console.log("Currently registered scripts:", JSON.stringify(scripts, null, 2));
  } catch (_error) {
    console.log("[Demo mode] Returns list of all registered scripts with their sync status");
  }
}

// =============================================================================
// DEMONSTRATION 4: Verifying cell existence via Merkle proof
// =============================================================================

/**
 * Shows how the light client verifies cell existence using Merkle proofs.
 *
 * When you ask the light client "does this cell exist?", the protocol:
 *   1. Retrieves the cell's block header (sampled during FlyClient sync)
 *   2. Retrieves a Merkle proof of the cell's inclusion in the transactions_root
 *   3. Computes the hash path from the cell up to the merkle root
 *   4. Compares with the transactions_root in the verified block header
 *
 * This is CRYPTOGRAPHICALLY SOUND: if the header is valid (verified by FlyClient),
 * and the Merkle proof is valid (verified hash by hash), then the cell exists.
 *
 * You get ~99.99% confidence with O(log n) header downloads instead of O(n).
 *
 * NOTE: CKB's get_transaction_proof RPC method is available on full nodes.
 * The light client achieves similar verification internally when returning cells.
 */
async function demonstrateCellVerification(): Promise<void> {
  console.log("\n=== DEMONSTRATION 4: Cell Existence Verification ===\n");

  console.log("How the light client verifies a cell exists:\n");

  console.log("Step 1: FlyClient header sampling (done at startup)");
  console.log("  - Light client samples log2(n) headers from the chain's history");
  console.log("  - Each sampled header includes an MMR commitment to all previous headers");
  console.log("  - Verifying the MMR commitment chain proves the difficulty work was done");
  console.log("  - With 100,000 blocks, only ~17 headers need to be sampled");
  console.log();

  console.log("Step 2: Request cell data with Merkle proof");
  console.log("  - Ask a full node: 'give me this cell AND a proof it's in the chain'");
  console.log("  - Full node responds with: cell data + Merkle proof path");
  console.log("  - Proof is a sequence of sibling hashes from cell → block_root");
  console.log();

  console.log("Step 3: Verify the Merkle proof locally");
  console.log("  - Hash the cell data to get the leaf hash");
  console.log("  - Walk up the Merkle tree using sibling hashes from the proof");
  console.log("  - Compare the computed root with the transactions_root in the header");
  console.log("  - If they match, the cell is provably in the block");
  console.log();

  console.log("Step 4: Verify the block header itself");
  console.log("  - The header was verified as part of the FlyClient sampling chain");
  console.log("  - Therefore: if Merkle proof valid AND header valid → cell exists");
  console.log();

  // Demonstrate the Merkle proof RPC on the testnet full node
  // (light client performs this internally, but we can see the proof structure
  //  by querying a full node directly)
  console.log("Fetching a real Merkle proof from the testnet full node...");
  console.log(`(Connecting to: ${TESTNET_FULL_NODE_URL})\n`);

  try {
    // Get a real transaction from the testnet to demonstrate proof structure
    const tip = await rpcCall(TESTNET_FULL_NODE_URL, "get_tip_block_number");
    const tipNumber = parseInt(tip as string, 16);

    // Get a recent block
    const blockHash = await rpcCall(TESTNET_FULL_NODE_URL, "get_block_hash", [
      "0x" + (tipNumber - 5).toString(16),
    ]);

    const block = await rpcCall(TESTNET_FULL_NODE_URL, "get_block", [blockHash as string]);
    const blockData = block as {
      transactions: Array<{ hash: string }>;
      header: { transactions_root: string };
    };

    if (blockData.transactions && blockData.transactions.length > 0) {
      const txHash = blockData.transactions[0].hash;
      console.log(`Block: ${blockHash as string}`);
      console.log(`Transactions root: ${blockData.header.transactions_root}`);
      console.log(`Proving transaction: ${txHash}`);

      // Get the Merkle proof for this transaction
      const proof = await rpcCall(TESTNET_FULL_NODE_URL, "get_transaction_proof", [
        [txHash],
        blockHash as string,
      ]);

      const proofData = proof as {
        witnesses_root: string;
        proof: { indices: string[]; lemmas: string[] };
      };
      console.log(`\nMerkle proof structure:`);
      console.log(`  Witnesses root: ${proofData.witnesses_root}`);
      console.log(`  Proof indices:  ${proofData.proof.indices.join(", ")}`);
      console.log(
        `  Proof lemmas:   ${proofData.proof.lemmas.length} sibling hashes (the path from leaf to root)`
      );
      console.log("\nThe light client uses exactly this kind of proof internally.");
      console.log("It verifies the proof against the transactions_root in the block header.");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`Could not connect to testnet: ${msg}`);
    console.log("\n[Demo mode] A Merkle proof looks like:");
    console.log("  witnesses_root: 0x3d4e2f...  (root of witness data Merkle tree)");
    console.log("  proof.indices:  [0]           (position of our tx in the block)");
    console.log("  proof.lemmas:   [0x1a2b..., 0x3c4d..., 0x5e6f...]");
    console.log("  (each lemma is a sibling hash needed to walk up the tree to the root)");
  }
}

// =============================================================================
// DEMONSTRATION 5: Block header sampling (FlyClient logarithmic sync)
// =============================================================================

/**
 * Illustrates the logarithmic header sampling approach.
 *
 * FlyClient does not download headers at regular intervals. Instead, it uses
 * a sampling strategy based on difficulty-weighted random sampling:
 *
 *   - Recent blocks: more densely sampled (recent history more important)
 *   - Old blocks: more sparsely sampled (logarithmic spacing)
 *   - Total headers: O(log n) where n is the chain height
 *
 * This gives probabilistic but very high confidence security:
 *   If an attacker tries to fake a chain of 1,000,000 blocks, they would need
 *   to fake ~20 specific block headers that our samples land on — much harder
 *   than faking any one block.
 */
async function demonstrateHeaderSampling(): Promise<void> {
  console.log("\n=== DEMONSTRATION 5: FlyClient Header Sampling ===\n");

  // Compute what logarithmic sampling would look like for various chain heights
  function computeSamplePoints(chainHeight: number, sampleCount: number): number[] {
    // Simplified: evenly log-spaced sample points
    // Real FlyClient uses difficulty-weighted sampling, but this illustrates the concept
    const points: number[] = [];
    const logTotal = Math.log2(chainHeight);

    for (let i = 0; i <= sampleCount; i++) {
      const logPos = (i / sampleCount) * logTotal;
      const blockNum = Math.round(Math.pow(2, logPos)) - 1;
      if (blockNum >= 0 && blockNum < chainHeight) {
        points.push(Math.min(blockNum, chainHeight - 1));
      }
    }

    // Always include the tip
    if (points[points.length - 1] !== chainHeight - 1) {
      points.push(chainHeight - 1);
    }

    return [...new Set(points)].sort((a, b) => a - b);
  }

  const scenarios = [
    { height: 1_000, label: "1,000 blocks" },
    { height: 100_000, label: "100,000 blocks" },
    { height: 10_000_000, label: "10,000,000 blocks" },
    { height: 14_000_000, label: "14,000,000 blocks (CKB mainnet ~now)" },
  ];

  const SAMPLE_COUNT = 20; // Approximate number of headers a light client downloads

  console.log(`Logarithmic header sampling with ~${SAMPLE_COUNT} sample points:\n`);
  console.log("Chain Height        Headers Needed  Space Saved  Sample Points (block numbers)");
  console.log("───────────────────────────────────────────────────────────────────────────────");

  for (const scenario of scenarios) {
    const samples = computeSamplePoints(scenario.height, SAMPLE_COUNT);
    const percentSaved = (((scenario.height - samples.length) / scenario.height) * 100).toFixed(4);

    // Show first 5 sample points to illustrate the logarithmic spacing
    const preview = samples
      .slice(0, 5)
      .map((n) => n.toLocaleString())
      .join(", ");
    const more = samples.length > 5 ? ` ... (${samples.length} total)` : "";

    console.log(
      `${scenario.label.padEnd(20)}${samples.length.toString().padEnd(16)}${(percentSaved + "%").padEnd(13)}${preview}${more}`
    );
  }

  console.log();
  console.log("Key observation: As the chain grows by 10x, the number of");
  console.log("headers only grows by ~3.3 (log base 10). This is what");
  console.log("'logarithmic complexity' means in practice.");
  console.log();
  console.log("Contrast with traditional SPV:");
  console.log("  14,000,000 blocks × 200 bytes/header = 2.8 GB of headers alone");
  console.log("  FlyClient:  ~20-40 headers            = ~8 KB total");
  console.log("  Improvement: >350,000x less data");
}

// =============================================================================
// DEMONSTRATION 6: Storage requirements comparison
// =============================================================================

/**
 * Shows the concrete storage requirements at different levels of participation.
 *
 * Understanding these numbers helps developers choose the right approach for
 * their use case.
 */
async function demonstrateStorageComparison(): Promise<void> {
  console.log("\n=== DEMONSTRATION 6: Storage Requirements ===\n");

  // Approximate sizes based on CKB mainnet (as of 2025)
  const storageData = [
    {
      mode: "Archive Full Node",
      storage: "300+ GB",
      description: "Stores all blocks, all historical states, all transaction data",
      useCase: "Block explorers, analytics, history providers",
    },
    {
      mode: "Pruned Full Node",
      storage: "100+ GB",
      description: "Full validation but prunes spent cells and old state",
      useCase: "Miners, validators, ecosystem infrastructure",
    },
    {
      mode: "Light Client",
      storage: "< 1 MB",
      description:
        "Current header + sampled historical headers + registered script cell index",
      useCase: "Mobile wallets, browser extensions, dApps",
    },
    {
      mode: "Stateless Client",
      storage: "~0 (stateless)",
      description: "Verifies individual proofs on-demand, stores nothing",
      useCase: "One-time verification, embedded systems",
    },
  ];

  console.log(
    "Storage Mode          Disk Usage    Description"
  );
  console.log(
    "─────────────────────────────────────────────────────────────────────────────"
  );

  for (const item of storageData) {
    console.log(`\n${item.mode}`);
    console.log(`  Storage:    ${item.storage}`);
    console.log(`  Model:      ${item.description}`);
    console.log(`  Best for:   ${item.useCase}`);
  }

  console.log("\n─────────────────────────────────────────────────────────────────────────────");
  console.log("\nFor a mobile wallet developer, the choice is clear:");
  console.log("  Full node:    100 GB — impossible on a phone");
  console.log("  Light client: < 1 MB  — trivial even on low-end devices");
  console.log();
  console.log("The light client achieves this while still providing:");
  console.log("  - Cryptographically verified balance information");
  console.log("  - Trustless cell existence verification");
  console.log("  - Full transaction sending capability");
}

// =============================================================================
// DEMONSTRATION 7: Querying live cells via light client
// =============================================================================

/**
 * Shows how to query live cells through the light client using @ckb-ccc/core.
 *
 * The @ckb-ccc/core library abstracts over both full node and light client
 * connections. You point it at the right URL and the API is the same.
 *
 * The light client MUST have the script registered via set_scripts first.
 * Then get_cells returns cells with the same format as a full node.
 */
async function demonstrateLiveCellQuery(): Promise<void> {
  console.log("\n=== DEMONSTRATION 7: Querying Live Cells ===\n");

  // Create a CCC client pointing at the testnet full node
  // (In production with a light client, you would use the light client URL)
  const client = new ccc.ClientPublicTestnet();

  // Example address from testnet (a well-known testnet faucet address)
  const exampleAddress = "ckt1qzda0cr08m85hc8jlnfp3gogn6uz1id2j5j3jlk6r40ydj29qhjqxkth8k6s4qn8skgakhmsnfmntm2m8r0k"; // example

  console.log("Querying live cells for an example testnet address...");
  console.log(`Address: ${exampleAddress}\n`);

  try {
    // Parse the address to get the lock script
    const address = await ccc.Address.fromString(exampleAddress, client);
    const lockScript = address.script;

    console.log("Lock script:");
    console.log(`  code_hash: ${lockScript.codeHash}`);
    console.log(`  hash_type: ${lockScript.hashType}`);
    console.log(`  args:      ${lockScript.args}`);
    console.log();

    // Collect cells (same API works for both full node and light client)
    const cells: ccc.Cell[] = [];
    let totalCapacity = 0n;
    let cellCount = 0;

    for await (const cell of client.findCells({
      script: lockScript,
      scriptType: "lock",
      scriptSearchMode: "exact",
    })) {
      cells.push(cell);
      totalCapacity += cell.cellOutput.capacity;
      cellCount++;

      if (cellCount <= 3) {
        console.log(`Cell ${cellCount}:`);
        console.log(`  OutPoint:  ${cell.outPoint.txHash} : ${cell.outPoint.index}`);
        console.log(`  Capacity:  ${(cell.cellOutput.capacity / 100_000_000n).toString()} CKB`);
        console.log(
          `  Data size: ${cell.outputData ? (cell.outputData.length - 2) / 2 : 0} bytes`
        );
        if (cell.cellOutput.type) {
          console.log(`  Has type script: yes (token/NFT cell)`);
        }
        console.log();
      }

      // Limit to first 10 for the demo
      if (cellCount >= 10) break;
    }

    if (cellCount === 0) {
      console.log("No cells found for this address (it may be empty on testnet).");
      console.log("The API would work the same way for any funded address.");
    } else {
      console.log(`Total cells found: ${cellCount}`);
      console.log(`Total capacity:    ${(totalCapacity / 100_000_000n).toString()} CKB`);
    }

    console.log("\nNote: With a light client, this query works ONLY if:");
    console.log("  1. You called set_scripts with this lock script first");
    console.log("  2. The light client has finished syncing for this script");
    console.log("  3. The sync started at or before the block when cells were created");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`Query failed: ${msg}`);
    console.log("\n[Demo mode] In production, get_cells returns:");
    console.log("  - All live (unspent) cells matching the registered lock script");
    console.log("  - The same structure as querying a full node");
    console.log("  - Includes capacity, type script, and data for each cell");
  }
}

// =============================================================================
// DEMONSTRATION 8: Use case summary for light clients
// =============================================================================

/**
 * Summarizes the real-world use cases for light clients.
 */
function demonstrateUseCases(): void {
  console.log("\n=== DEMONSTRATION 8: Light Client Use Cases ===\n");

  const useCases = [
    {
      category: "Mobile Wallets",
      examples: ["Android/iOS CKB wallets", "MetaMask-style browser wallets"],
      why: "Phones cannot store 100+ GB. Light clients enable real self-custody on mobile.",
      tradeoff: "Must register scripts in advance; history queries limited",
    },
    {
      category: "Browser Extensions",
      examples: ["Chrome/Firefox wallet extensions", "Web-based dApp connectors"],
      why: "Browsers have strict storage limits. Light clients fit easily.",
      tradeoff: "Cannot serve as an archive node; depends on full node peers",
    },
    {
      category: "dApp Frontends",
      examples: ["DeFi interfaces", "NFT marketplaces", "Gaming frontends"],
      why: "Users don't run full nodes. Light client enables trustless data verification.",
      tradeoff: "Requires set_scripts before first use; slight sync delay",
    },
    {
      category: "IoT Devices",
      examples: ["Smart contracts for supply chain", "Device payment channels"],
      why: "Embedded devices have KB to MB of storage, not GB.",
      tradeoff: "Very limited query capabilities; only pre-registered scripts",
    },
    {
      category: "Low-bandwidth Environments",
      examples: ["Developing country deployments", "Satellite internet connections"],
      why: "Sync in minutes over slow connections vs days for full node.",
      tradeoff: "Must trust proof of work sampling security assumption",
    },
  ];

  for (const useCase of useCases) {
    console.log(`${useCase.category}`);
    console.log(`  Examples:  ${useCase.examples.join(", ")}`);
    console.log(`  Why:       ${useCase.why}`);
    console.log(`  Tradeoff:  ${useCase.tradeoff}`);
    console.log();
  }

  console.log("WHEN TO USE A FULL NODE INSTEAD:");
  console.log("  - Block explorers (need historical data)");
  console.log("  - Transaction history providers");
  console.log("  - Mining pools");
  console.log("  - Analytics and research");
  console.log("  - Any application needing data for ARBITRARY scripts on the fly");
}

// =============================================================================
// MAIN: Run all demonstrations
// =============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("  LESSON 20: LIGHT CLIENT DEVELOPMENT ON CKB");
  console.log("=".repeat(70));

  console.log(`
CKB's light client implements a FlyClient-based protocol that allows
devices to participate in the CKB network with only ~kilobytes of storage,
compared to 100+ GB for a full node. This makes CKB accessible to mobile
wallets, browser extensions, and IoT devices.
`);

  // Run all demonstrations sequentially
  await demonstrateLightClientConnection();
  await demonstrateApiDifferences();
  await demonstrateScriptRegistration();
  await demonstrateCellVerification();
  await demonstrateHeaderSampling();
  await demonstrateStorageComparison();
  await demonstrateLiveCellQuery();
  demonstrateUseCases();

  console.log("\n" + "=".repeat(70));
  console.log("  LESSON 20 COMPLETE");
  console.log("=".repeat(70));
  console.log(`
Summary:
  - Light clients use FlyClient's logarithmic header sampling (O(log n))
  - Storage drops from 100+ GB to < 1 MB
  - Use set_scripts to register which lock scripts you care about
  - Use get_cells to query live cells for registered scripts
  - Send transactions via send_transaction (same API as full node)
  - Perfect for: mobile wallets, browser extensions, IoT, dApps

Next: Lesson 21 — RGB++ Protocol: Bitcoin-CKB interoperability
`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
