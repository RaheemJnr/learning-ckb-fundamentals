/**
 * ============================================================================
 * Lesson 18: CKB RPC Interface Dashboard
 * ============================================================================
 *
 * In this lesson, you will learn how to:
 *   1. Interact with a CKB node directly via JSON-RPC (no SDK required)
 *   2. Understand the complete set of CKB RPC methods
 *   3. Fetch chain data: headers, blocks, transactions, cells
 *   4. Query cell balances using the indexer API
 *   5. Monitor chain statistics in real time using polling
 *   6. Handle RPC errors and implement retry logic
 *   7. Understand the relationship between the CCC SDK and raw RPC calls
 *
 * This dashboard connects to the CKB Pudge testnet and prints live chain
 * statistics, recent block data, and transaction information.
 *
 * ===========================================================================
 * HOW CKB JSON-RPC WORKS
 * ===========================================================================
 *
 * CKB nodes expose a JSON-RPC 2.0 API. Each request has this shape:
 *
 *   {
 *     "jsonrpc": "2.0",
 *     "id": 1,
 *     "method": "get_tip_header",
 *     "params": []
 *   }
 *
 * Each response has this shape:
 *
 *   {
 *     "jsonrpc": "2.0",
 *     "id": 1,
 *     "result": { ...block header data... }
 *   }
 *
 * Or on error:
 *
 *   {
 *     "jsonrpc": "2.0",
 *     "id": 1,
 *     "error": { "code": -32600, "message": "Invalid Request" }
 *   }
 *
 * All numeric values in CKB RPC responses are hex-encoded strings with
 * a "0x" prefix. This is because JSON numbers cannot represent 64-bit
 * integers accurately (JavaScript's Number type only has 53-bit precision).
 *
 * ===========================================================================
 * TRANSPORTS
 * ===========================================================================
 *
 * CKB RPC supports three transports:
 *
 *   1. HTTP  — Default (port 8114). Request/response. Use for most cases.
 *   2. TCP   — Raw socket. Lower overhead for batch requests.
 *   3. WebSocket — Enables subscriptions. The node pushes new block/transaction
 *                  events to your client without polling.
 *
 * Public RPC endpoints typically only expose HTTP. WebSocket subscriptions
 * require a local node or a specialized provider.
 *
 * ===========================================================================
 */

import {
  CkbRpcClient,
  formatTimestamp,
  hexToBI,
  shannonsToCkb,
  blockNumToHex,
  type Header,
  type Block,
} from "./rpc-client.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Public testnet RPC endpoint.
 *
 * The Pudge testnet is CKB's long-lived public test network.
 * All data here has no real-world value — perfect for experimentation.
 *
 * Alternative endpoints:
 *   - Local node:  "http://localhost:8114"
 *   - Mainnet:     "https://mainnet.ckb.dev"
 */
const TESTNET_RPC_URL = "https://testnet.ckb.dev";

/**
 * Block polling interval in milliseconds.
 * CKB produces a new block roughly every 10 seconds on average.
 * We poll every 5 seconds to catch new blocks quickly.
 */
const POLL_INTERVAL_MS = 5_000;

/**
 * Number of recent blocks to analyze for statistics.
 */
const STATS_WINDOW = 10;

/**
 * A well-known testnet address for demonstrating capacity queries.
 * This is the CKB Foundation's testnet address.
 */
const DEMO_ADDRESS_ARGS = "0x36c329ed630d6ce750712a477543672adab57f4c";

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/** ANSI color codes for terminal output. */
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
} as const;

function color(text: string, ...codes: (keyof typeof COLORS)[]): string {
  const prefix = codes.map((c) => COLORS[c]).join("");
  return `${prefix}${text}${COLORS.reset}`;
}

function printHeader(title: string): void {
  const line = "=".repeat(60);
  console.log();
  console.log(color(line, "cyan"));
  console.log(color(`  ${title}`, "cyan", "bright"));
  console.log(color(line, "cyan"));
}

function printSection(title: string): void {
  console.log();
  console.log(color(`--- ${title} ---`, "yellow", "bright"));
}

function printField(label: string, value: string): void {
  const padded = label.padEnd(28);
  console.log(`  ${color(padded, "dim")} ${value}`);
}

function printDivider(): void {
  console.log(color("  " + "-".repeat(56), "dim"));
}

// ============================================================================
// EPOCH DECODING
// ============================================================================

/**
 * Decodes a CKB epoch field into human-readable components.
 *
 * The epoch field encodes three values packed into a single uint64:
 *   - epoch number:   bits 63-24  (the epoch count, increases monotonically)
 *   - epoch index:    bits 23-16  (block position within the epoch, 0-based)
 *   - epoch length:   bits 15-0   (total blocks in this epoch)
 *
 * Example: "0x70803e80000000" decodes to epoch 0, block 1000 of 1000,
 * but the exact interpretation depends on the packed format.
 *
 * CKB epochs are analogous to Bitcoin difficulty periods. Each epoch has
 * a fixed number of blocks, and at the end of each epoch the difficulty
 * target is adjusted based on actual block time vs target block time.
 */
function decodeEpoch(epochHex: string): string {
  const epoch = hexToBI(epochHex);
  // Pack format: [63:24] epoch_number | [23:16] epoch_index | [15:0] epoch_length
  const epochNumber = epoch >> 40n;
  const epochIndex = (epoch >> 16n) & 0xffffffn;
  const epochLength = epoch & 0xffffn;
  return `Epoch ${epochNumber}, block ${epochIndex}/${epochLength}`;
}

// ============================================================================
// BLOCK TIME ANALYSIS
// ============================================================================

/**
 * Computes average block time over a window of consecutive blocks.
 *
 * CKB targets an average block time of 10 seconds. This function measures
 * the actual average over the most recent N blocks.
 *
 * @param headers - Array of block headers in ascending order (oldest first)
 * @returns Average block time in seconds
 */
function computeAverageBlockTime(headers: Header[]): number {
  if (headers.length < 2) return 0;

  const oldest = hexToBI(headers[0].timestamp);
  const newest = hexToBI(headers[headers.length - 1].timestamp);
  const spanMs = Number(newest - oldest);
  const spanBlocks = headers.length - 1;

  return spanMs / spanBlocks / 1000;
}

// ============================================================================
// TRANSACTION THROUGHPUT
// ============================================================================

/**
 * Computes total transaction count and average transactions per block
 * across a window of recently fetched blocks.
 *
 * @param blocks - Array of full blocks
 * @returns Statistics object with total and average transaction counts
 */
function computeTxStats(blocks: Block[]): {
  totalTx: number;
  avgTxPerBlock: number;
  maxTxInBlock: number;
} {
  if (blocks.length === 0) {
    return { totalTx: 0, avgTxPerBlock: 0, maxTxInBlock: 0 };
  }

  const txCounts = blocks.map((b) => b.transactions.length);
  const totalTx = txCounts.reduce((a, b) => a + b, 0);
  const avgTxPerBlock = totalTx / blocks.length;
  const maxTxInBlock = Math.max(...txCounts);

  return { totalTx, avgTxPerBlock, maxTxInBlock };
}

// ============================================================================
// SECTION 1: CHAIN TIP
// ============================================================================

/**
 * Demonstrates the `get_tip_header` RPC method.
 *
 * This is the first call most applications make to a CKB node.
 * It returns the header of the most recently committed block.
 *
 * Use cases:
 *   - Check current block height
 *   - Verify node is online and synced
 *   - Get the block hash for subsequent queries
 *   - Monitor chain progression
 */
async function showChainTip(client: CkbRpcClient): Promise<Header> {
  printHeader("SECTION 1: Chain Tip (get_tip_header)");

  console.log(
    "\n  Calling get_tip_header — this returns the most recently committed block header."
  );
  console.log(
    "  The header contains metadata about the block but NOT the transaction data."
  );
  console.log("  To get transaction data, use get_block with the block hash.\n"
  );

  const header = await client.getTipHeader();
  const blockNum = hexToBI(header.number);
  const timestamp = formatTimestamp(header.timestamp);

  printField("Block Number:", color(`${blockNum.toLocaleString()}`, "green"));
  printField("Block Hash:", color(header.hash.slice(0, 20) + "...", "dim"));
  printField("Timestamp:", color(timestamp, "cyan"));
  printField("Epoch:", color(decodeEpoch(header.epoch), "yellow"));
  printField(
    "Difficulty Target:",
    color(`0x${hexToBI(header.compact_target).toString(16)}`, "magenta")
  );
  printField("Parent Hash:", color(header.parent_hash.slice(0, 20) + "...", "dim"));

  return header;
}

// ============================================================================
// SECTION 2: BLOCK DATA
// ============================================================================

/**
 * Demonstrates `get_block_by_number` and `get_block` RPC methods.
 *
 * These methods return full block data including all transactions.
 *
 * The `verbosity` parameter controls the response size:
 *   - verbosity=0: Serialized binary (smallest, for archiving/relaying)
 *   - verbosity=1: JSON with tx hashes only (medium)
 *   - verbosity=2: Full JSON with all transaction data (largest)
 *
 * @param client - The RPC client
 * @param blockNumber - The block number to fetch (bigint)
 */
async function showBlockData(
  client: CkbRpcClient,
  blockNumber: bigint
): Promise<Block> {
  printHeader("SECTION 2: Block Data (get_block_by_number)");

  console.log(`\n  Fetching block #${blockNumber.toLocaleString()} with full transaction data.`);
  console.log("  Note: CKB RPC requires block numbers in hex format.\n");

  const hexNum = blockNumToHex(Number(blockNumber));
  const block = await client.getBlockByNumber(hexNum, 2);

  const txCount = block.transactions.length;

  // The first transaction in every block is always the "cellbase" transaction.
  // This is the block reward transaction — it creates new CKB out of thin air
  // and pays the block producer (miner). It has no inputs (unlike a regular
  // transaction which must reference existing cells).
  const cellbase = block.transactions[0];
  const isCellbaseOnly = txCount === 1;

  printField("Block Hash:", color(block.header.hash.slice(0, 20) + "...", "dim"));
  printField("Transactions:", color(`${txCount}`, "green"));
  printField(
    "Content:",
    isCellbaseOnly
      ? color("Cellbase only (no user transactions)", "dim")
      : color(`Cellbase + ${txCount - 1} user transaction(s)`, "cyan")
  );
  printField("Proposals:", color(`${block.proposals.length}`, "yellow"));
  printField("Uncle blocks:", color(`${block.uncles.length}`, "magenta"));

  console.log();
  console.log(color("  Cellbase transaction:", "bright"));
  printField(
    "  Tx Hash:",
    color(cellbase.hash.slice(0, 20) + "...", "dim")
  );
  printField("  Inputs:", color(`${cellbase.transaction.inputs.length} (no cells — creates CKB)`, "dim"));
  printField("  Outputs:", color(`${cellbase.transaction.outputs.length}`, "green"));

  if (cellbase.transaction.outputs.length > 0) {
    const reward = cellbase.transaction.outputs[0];
    printField(
      "  Block Reward:",
      color(shannonsToCkb(reward.capacity), "yellow")
    );
  }

  if (txCount > 1) {
    console.log();
    console.log(color("  User transactions:", "bright"));
    for (let i = 1; i < Math.min(txCount, 4); i++) {
      const tx = block.transactions[i];
      printDivider();
      printField(`  Tx #${i} Hash:`, color(tx.hash.slice(0, 20) + "...", "dim"));
      printField(`  Tx #${i} Inputs:`, color(`${tx.transaction.inputs.length}`, "cyan"));
      printField(`  Tx #${i} Outputs:`, color(`${tx.transaction.outputs.length}`, "green"));
      printField(`  Tx #${i} Witnesses:`, color(`${tx.transaction.witnesses.length}`, "yellow"));
    }
    if (txCount > 4) {
      console.log(color(`  ... and ${txCount - 4} more transactions`, "dim"));
    }
  }

  return block;
}

// ============================================================================
// SECTION 3: TRANSACTION DETAILS
// ============================================================================

/**
 * Demonstrates `get_transaction` RPC method.
 *
 * This method fetches a transaction by its hash from either:
 *   - The mempool (pending/proposed) — for recently submitted transactions
 *   - The blockchain (committed) — for confirmed transactions
 *
 * The response includes the full transaction structure AND status information.
 *
 * @param client - The RPC client
 * @param txHash - Transaction hash to look up
 */
async function showTransactionDetails(
  client: CkbRpcClient,
  txHash: string
): Promise<void> {
  printHeader("SECTION 3: Transaction Details (get_transaction)");

  console.log(`\n  Looking up transaction: ${txHash.slice(0, 20)}...`);
  console.log(
    "  A transaction hash uniquely identifies a transaction on CKB.\n"
  );

  const result = await client.getTransaction(txHash);

  if (!result || !result.transaction) {
    console.log(color("  Transaction not found.", "red"));
    return;
  }

  const tx = result.transaction;
  const status = result.tx_status;

  printField("Status:", color(status.status.toUpperCase(), "green"));
  printField(
    "Block:",
    status.block_number
      ? color(`#${hexToBI(status.block_number).toLocaleString()}`, "cyan")
      : color("not yet committed", "yellow")
  );
  printField(
    "Block Hash:",
    status.block_hash
      ? color(status.block_hash.slice(0, 20) + "...", "dim")
      : color("N/A", "dim")
  );
  printField(
    "Cycles Used:",
    result.cycles
      ? color(hexToBI(result.cycles).toLocaleString(), "magenta")
      : color("unknown", "dim")
  );

  console.log();
  console.log(color("  Transaction Structure:", "bright"));
  printField("  Version:", color(hexToBI(tx.version).toString(), "dim"));
  printField("  Inputs:", color(`${tx.inputs.length}`, "cyan"));
  printField("  Outputs:", color(`${tx.outputs.length}`, "green"));
  printField("  Cell Deps:", color(`${tx.cell_deps.length}`, "yellow"));
  printField("  Witnesses:", color(`${tx.witnesses.length}`, "magenta"));
  printField("  Header Deps:", color(`${tx.header_deps.length}`, "dim"));

  console.log();
  console.log(color("  Output Capacities:", "bright"));
  let totalOutput = 0n;
  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    const cap = hexToBI(output.capacity);
    totalOutput += cap;
    printField(
      `  Output #${i}:`,
      color(shannonsToCkb(output.capacity), "yellow")
    );
  }
  printField(
    "  Total Output:",
    color(shannonsToCkb("0x" + totalOutput.toString(16)), "green", "bright")
  );
}

// ============================================================================
// SECTION 4: CELL CAPACITY QUERY (INDEXER)
// ============================================================================

/**
 * Demonstrates `get_cells_capacity` RPC method (indexer API).
 *
 * The indexer is a component built into modern CKB nodes that maintains
 * an index of cells grouped by lock script and type script. This allows
 * efficient queries like "give me the total CKB balance of this address"
 * without scanning the entire UTXO set.
 *
 * The `get_cells_capacity` method accepts a "search key" specifying which
 * script to query. It returns the SUM of all matching live cell capacities.
 *
 * This is exactly how CKB wallets compute balances.
 *
 * @param client - The RPC client
 */
async function showCellsCapacity(client: CkbRpcClient): Promise<void> {
  printHeader("SECTION 4: Cell Balance Query (get_cells_capacity)");

  console.log("\n  Querying total CKB held by a secp256k1 lock script.");
  console.log("  This demonstrates the indexer API for wallet balance lookups.");
  console.log(
    "  The indexer sums all live cells matching the given lock script.\n"
  );

  /**
   * The secp256k1/blake160 lock script is the standard CKB address type.
   * It requires a secp256k1 signature and blake160 hash of the public key.
   *
   * This code_hash is the mainnet/testnet deployment of the secp256k1 script.
   * The args field contains the blake160 hash of the public key (20 bytes).
   */
  const searchKey = {
    script: {
      // secp256k1/blake160 lock script code hash (deployed on testnet)
      code_hash:
        "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hash_type: "type" as const,
      args: DEMO_ADDRESS_ARGS,
    },
    script_type: "lock" as const,
  };

  try {
    const capacityResult = await client.getCellsCapacity(searchKey);
    const capacityShannons = hexToBI(capacityResult.capacity);

    printField(
      "Address Args:",
      color(DEMO_ADDRESS_ARGS.slice(0, 14) + "...", "dim")
    );
    printField(
      "Total Balance:",
      color(shannonsToCkb(capacityResult.capacity), "green", "bright")
    );
    printField(
      "In Shannons:",
      color(capacityShannons.toLocaleString(), "dim")
    );
    printField(
      "At Block:",
      color(
        `#${hexToBI(capacityResult.block_number).toLocaleString()}`,
        "cyan"
      )
    );
    printField(
      "Block Hash:",
      color(capacityResult.block_hash.slice(0, 20) + "...", "dim")
    );

    console.log();
    console.log(
      color(
        "  Note: This is the balance snapshot at the referenced block.",
        "dim"
      )
    );
    console.log(
      color(
        "  Transactions in later blocks may have changed the balance.",
        "dim"
      )
    );
  } catch (err) {
    // The indexer may not be enabled on all public RPC endpoints.
    // Fall back gracefully with instructions.
    console.log(
      color(
        "  Note: Indexer API not available on this endpoint or script args not found.",
        "yellow"
      )
    );
    console.log(color("  To use the indexer:", "dim"));
    console.log(color("    1. Run a local CKB node", "dim"));
    console.log(color("    2. Enable [indexer] in ckb.toml", "dim"));
    console.log(color("    3. Wait for the indexer to catch up", "dim"));
  }
}

// ============================================================================
// SECTION 5: LIVE CELL CHECK
// ============================================================================

/**
 * Demonstrates `get_live_cell` RPC method.
 *
 * This method checks whether a specific cell (identified by tx_hash + index)
 * is currently "live" (unspent) or "dead" (already consumed as an input).
 *
 * The concept of "live cells" is fundamental to CKB:
 *   - The entire state of CKB is the set of live cells
 *   - A transaction consumes live cells (inputs) and creates new live cells (outputs)
 *   - Once a cell is consumed, it becomes "dead" and cannot be spent again
 *   - This prevents double-spending at the protocol level
 *
 * Use cases for get_live_cell:
 *   - Verify a cell still exists before including it in a transaction
 *   - Check if a payment was already spent
 *   - Inspect cell data and scripts without fetching the full block
 *
 * @param client - The RPC client
 * @param txHash - Transaction hash where the cell was created
 * @param index - The output index within that transaction
 */
async function showLiveCell(
  client: CkbRpcClient,
  txHash: string,
  index: number
): Promise<void> {
  printHeader("SECTION 5: Live Cell Check (get_live_cell)");

  console.log(
    `\n  Checking if cell ${txHash.slice(0, 16)}... output #${index} is live.`
  );
  console.log(
    "  A 'live' cell is unspent. A 'dead' cell was consumed as an input.\n"
  );

  try {
    const result = await client.getLiveCell(
      { tx_hash: txHash, index: `0x${index.toString(16)}` },
      true // request data field
    );

    printField(
      "Status:",
      result.status === "live"
        ? color("LIVE (unspent)", "green")
        : result.status === "dead"
        ? color("DEAD (already spent)", "red")
        : color("UNKNOWN (not found)", "yellow")
    );

    if (result.status === "live" && result.cell) {
      printField(
        "Capacity:",
        color(shannonsToCkb(result.cell.output.capacity), "yellow")
      );
      printField(
        "Lock Hash Type:",
        color(result.cell.output.lock.hash_type, "cyan")
      );
      printField(
        "Lock Code Hash:",
        color(result.cell.output.lock.code_hash.slice(0, 20) + "...", "dim")
      );
      printField(
        "Type Script:",
        result.cell.output.type
          ? color("present", "green")
          : color("none", "dim")
      );

      if (result.cell.data) {
        const dataLen = (result.cell.data.content.length - 2) / 2;
        printField(
          "Data Length:",
          color(`${dataLen} bytes`, dataLen > 0 ? "cyan" : "dim")
        );
      }
    }
  } catch (err) {
    console.log(color("  Could not check cell status (may be pending).", "yellow"));
  }
}

// ============================================================================
// SECTION 6: CHAIN STATISTICS
// ============================================================================

/**
 * Computes and displays chain statistics over a window of recent blocks.
 *
 * This demonstrates:
 *   - Fetching multiple blocks in parallel using Promise.all
 *   - Computing block time averages
 *   - Transaction throughput analysis
 *   - Capacity issuance tracking
 *
 * @param client - The RPC client
 * @param tipHeader - The most recent block header
 */
async function showChainStatistics(
  client: CkbRpcClient,
  tipHeader: Header
): Promise<void> {
  printHeader("SECTION 6: Chain Statistics");

  const tipNum = hexToBI(tipHeader.number);
  const windowStart = tipNum > BigInt(STATS_WINDOW)
    ? tipNum - BigInt(STATS_WINDOW)
    : 0n;

  console.log(
    `\n  Analyzing blocks #${windowStart.toLocaleString()} through #${tipNum.toLocaleString()}.`
  );
  console.log("  Fetching block headers in parallel for efficiency...\n");

  // Fetch all block headers in the window in parallel.
  // Using Promise.all allows the Node.js event loop to send all requests
  // concurrently rather than waiting for each one sequentially.
  const headerPromises: Promise<Header>[] = [];
  for (let i = windowStart; i <= tipNum; i++) {
    headerPromises.push(client.getHeaderByNumber(`0x${i.toString(16)}`));
  }
  const headers = await Promise.all(headerPromises);

  // Compute average block time
  const avgBlockTimeSec = computeAverageBlockTime(headers);

  // Fetch full blocks for transaction statistics (parallel)
  console.log("  Fetching full block data for transaction analysis...\n");
  const blockPromises = headers
    .slice(-5) // Only fetch last 5 blocks to avoid too much data
    .map((h) => client.getBlock(h.hash, 2));
  const blocks = await Promise.all(blockPromises);

  const txStats = computeTxStats(blocks);

  // Compute total issuance from cellbase outputs in the window
  let totalIssuance = 0n;
  for (const block of blocks) {
    if (block.transactions.length > 0) {
      const cellbase = block.transactions[0].transaction;
      for (const output of cellbase.outputs) {
        totalIssuance += hexToBI(output.capacity);
      }
    }
  }

  printField(
    "Analysis Window:",
    color(`${STATS_WINDOW} blocks`, "cyan")
  );
  printField(
    "Avg Block Time:",
    color(`${avgBlockTimeSec.toFixed(2)} seconds`, "green")
  );
  printField(
    "Target Block Time:",
    color("10.0 seconds", "dim")
  );

  const isOnTarget = Math.abs(avgBlockTimeSec - 10) < 3;
  printField(
    "Block Time Health:",
    isOnTarget
      ? color("Normal", "green")
      : color("Deviation detected", "yellow")
  );

  printDivider();

  printField(
    "Total Txs (last 5 blocks):",
    color(`${txStats.totalTx}`, "cyan")
  );
  printField(
    "Avg Txs Per Block:",
    color(txStats.avgTxPerBlock.toFixed(1), "yellow")
  );
  printField(
    "Max Txs In One Block:",
    color(`${txStats.maxTxInBlock}`, "magenta")
  );

  printDivider();

  printField(
    "Total CKB Issued (last 5 blocks):",
    color(shannonsToCkb("0x" + totalIssuance.toString(16)), "green")
  );

  // The blockchain info endpoint provides additional summary data
  const chainInfo = await client.getBlockchainInfo();
  printField(
    "Chain Name:",
    color(chainInfo.chain, "cyan")
  );
  printField(
    "Syncing:",
    chainInfo.is_initial_block_download
      ? color("YES — initial block download in progress", "yellow")
      : color("No — node is fully synced", "green")
  );
  printField(
    "Median Time:",
    color(formatTimestamp(chainInfo.median_time), "dim")
  );
}

// ============================================================================
// SECTION 7: MEMPOOL STATUS
// ============================================================================

/**
 * Demonstrates the mempool (txpool) RPC methods.
 *
 * The CKB mempool holds transactions that have been submitted but not yet
 * included in a block. There are two stages:
 *
 *   1. "Pending" — transaction is in the pool, not yet proposed
 *   2. "Proposed" — transaction has been included in a proposal zone of a
 *                   recent block (CKB's 2-phase commit system)
 *
 * CKB uses a 2-phase commit system for transaction finalization:
 *   - Phase 1: A transaction hash appears in a block's proposal zone
 *   - Phase 2: After a short delay (typically 2-10 blocks), the full
 *              transaction data must appear in a block to be committed
 *
 * This design allows block producers to propose transactions they know about
 * while other miners propagate the full data, reducing wasted work.
 *
 * @param client - The RPC client
 */
async function showMempoolStatus(client: CkbRpcClient): Promise<void> {
  printHeader("SECTION 7: Mempool Status (get_raw_tx_pool)");

  console.log("\n  The mempool holds unconfirmed transactions.");
  console.log("  CKB uses a 2-phase commit: propose first, then commit.\n");

  try {
    const poolInfo = await client.getTxPoolInfo();

    printField(
      "Pending Txs:",
      color(hexToBI(poolInfo.pending).toLocaleString(), "yellow")
    );
    printField(
      "Proposed Txs:",
      color(hexToBI(poolInfo.proposed).toLocaleString(), "cyan")
    );
    printField(
      "Orphan Txs:",
      color(hexToBI(poolInfo.orphan).toLocaleString(), "red")
    );
    printField(
      "Total Pool Size:",
      color(
        `${(Number(hexToBI(poolInfo.total_tx_size)) / 1024).toFixed(2)} KB`,
        "green"
      )
    );
    printField(
      "Total Cycles:",
      color(hexToBI(poolInfo.total_tx_cycles).toLocaleString(), "magenta")
    );
    printField(
      "Min Fee Rate:",
      color(
        `${hexToBI(poolInfo.min_fee_rate).toLocaleString()} shannons/KB`,
        "yellow"
      )
    );
  } catch (err) {
    console.log(color("  Mempool info not available on this endpoint.", "yellow"));
  }
}

// ============================================================================
// SECTION 8: BLOCK SUBSCRIPTION (POLLING)
// ============================================================================

/**
 * Implements a simple real-time block subscription using polling.
 *
 * True WebSocket subscriptions require a local node with WebSocket enabled.
 * This polling approach works with any HTTP RPC endpoint.
 *
 * The polling loop:
 *   1. Fetches the current tip block number
 *   2. Compares it to the last known tip
 *   3. If new blocks were produced, fetches and displays them
 *   4. Waits POLL_INTERVAL_MS before repeating
 *
 * For production applications, consider WebSocket subscriptions instead:
 *   - ws://localhost:8114 (local node with WebSocket enabled)
 *   - Subscribe to "new_tip_header" for block headers
 *   - Subscribe to "new_transaction" for mempool events
 *
 * @param client - The RPC client
 * @param durationMs - How long to poll before stopping
 */
async function runBlockSubscription(
  client: CkbRpcClient,
  durationMs: number = 30_000
): Promise<void> {
  printHeader("SECTION 8: Real-Time Block Monitoring (Polling)");

  console.log("\n  Monitoring for new blocks using polling.");
  console.log(`  Will run for ${durationMs / 1000} seconds.`);
  console.log(`  Polling interval: ${POLL_INTERVAL_MS / 1000} seconds.`);
  console.log("  (Press Ctrl+C to stop early)\n");

  console.log(color("  Note: True WebSocket subscriptions require a local node.", "dim"));
  console.log(color("  See README.md for WebSocket subscription code.", "dim"));
  console.log();

  const tipHeader = await client.getTipHeader();
  let lastKnownBlock = hexToBI(tipHeader.number);
  let pollCount = 0;
  const startTime = Date.now();

  console.log(
    color(
      `  Starting at block #${lastKnownBlock.toLocaleString()}`,
      "cyan"
    )
  );

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      pollCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

      try {
        const currentTip = await client.getTipHeader();
        const currentBlock = hexToBI(currentTip.number);

        if (currentBlock > lastKnownBlock) {
          const newBlocks = currentBlock - lastKnownBlock;
          process.stdout.write(
            `\r  [${elapsed}s] ` +
            color(`NEW: Block #${currentBlock.toLocaleString()}`, "green", "bright") +
            ` (+${newBlocks} block${newBlocks > 1n ? "s" : ""})` +
            ` | ${formatTimestamp(currentTip.timestamp)}   `
          );
          lastKnownBlock = currentBlock;
        } else {
          process.stdout.write(
            `\r  [${elapsed}s] ` +
            color(`Poll #${pollCount}: No new blocks`, "dim") +
            ` | tip: #${currentBlock.toLocaleString()}   `
          );
        }
      } catch (err) {
        process.stdout.write(`\r  [${elapsed}s] Poll #${pollCount}: Error - retrying...   `);
      }

      if (Date.now() - startTime >= durationMs) {
        clearInterval(interval);
        console.log("\n");
        console.log(color("  Monitoring complete.", "green"));
        resolve();
      }
    }, POLL_INTERVAL_MS);
  });
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Main dashboard function — orchestrates all sections.
 *
 * This dashboard demonstrates the full CKB RPC API through a series
 * of sections, each focused on a different aspect of the chain.
 */
async function main(): Promise<void> {
  console.clear();

  console.log(color(
    "  ╔══════════════════════════════════════════════════════════╗",
    "cyan"
  ));
  console.log(color(
    "  ║         LESSON 18: CKB RPC INTERFACE DASHBOARD          ║",
    "cyan", "bright"
  ));
  console.log(color(
    "  ╚══════════════════════════════════════════════════════════╝",
    "cyan"
  ));
  console.log();
  console.log(`  RPC Endpoint: ${color(TESTNET_RPC_URL, "cyan")}`);
  console.log(`  Network:      ${color("CKB Pudge Testnet", "yellow")}`);
  console.log(`  Started:      ${color(new Date().toISOString(), "dim")}`);

  // Create the RPC client
  // All communication goes through this single client instance.
  // Each method call sends one JSON-RPC POST request to TESTNET_RPC_URL.
  const client = new CkbRpcClient(TESTNET_RPC_URL);

  // ---- SECTION 1: Chain Tip ----
  // This is always the first call — establish current chain state.
  const tipHeader = await showChainTip(client);
  const tipBlockNum = hexToBI(tipHeader.number);

  // ---- SECTION 2: Block Data ----
  // Fetch a specific recent block with full transaction data.
  const recentBlock = await showBlockData(client, tipBlockNum);

  // ---- SECTION 3: Transaction Details ----
  // Look up the cellbase transaction from the block we just fetched.
  // This always exists and gives us a real transaction hash to demonstrate.
  if (recentBlock.transactions.length > 0) {
    const txHash = recentBlock.transactions[0].hash;
    await showTransactionDetails(client, txHash);
  }

  // ---- SECTION 4: Cell Balance Query ----
  await showCellsCapacity(client);

  // ---- SECTION 5: Live Cell Check ----
  // Check the first output of the cellbase transaction
  if (recentBlock.transactions.length > 0) {
    const cellbaseTxHash = recentBlock.transactions[0].hash;
    await showLiveCell(client, cellbaseTxHash, 0);
  }

  // ---- SECTION 6: Chain Statistics ----
  await showChainStatistics(client, tipHeader);

  // ---- SECTION 7: Mempool Status ----
  await showMempoolStatus(client);

  // ---- SECTION 8: Block Subscription ----
  // Monitor for new blocks for 20 seconds.
  // Reduce duration to avoid long waits during development.
  await runBlockSubscription(client, 20_000);

  // ---- SUMMARY ----
  printHeader("SUMMARY");
  console.log();
  console.log("  You have learned how to use the CKB JSON-RPC interface:");
  console.log();
  console.log(`  ${color("1.", "cyan")} get_tip_header      — current chain state`);
  console.log(`  ${color("2.", "cyan")} get_block_by_number — full block data`);
  console.log(`  ${color("3.", "cyan")} get_transaction     — transaction lookup`);
  console.log(`  ${color("4.", "cyan")} get_cells_capacity  — wallet balance query`);
  console.log(`  ${color("5.", "cyan")} get_live_cell       — cell status check`);
  console.log(`  ${color("6.", "cyan")} get_blockchain_info — chain metadata`);
  console.log(`  ${color("7.", "cyan")} get_raw_tx_pool     — mempool status`);
  console.log();
  console.log(color("  Next: Lesson 19 — Running a Full Node", "green", "bright"));
  console.log();
}

// Run the dashboard
main().catch((err) => {
  console.error(color("\n  Fatal error:", "red"), err.message);
  if (err.stack) {
    console.error(color(err.stack, "dim"));
  }
  process.exit(1);
});
