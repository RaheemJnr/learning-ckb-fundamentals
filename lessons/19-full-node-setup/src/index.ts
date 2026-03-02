/**
 * ============================================================================
 * Lesson 19: CKB Full Node Monitor
 * ============================================================================
 *
 * In this lesson, you will learn how to:
 *   1. Connect to a local CKB full node via JSON-RPC
 *   2. Check node synchronization progress
 *   3. Monitor connected peers and P2P network health
 *   4. Check mempool size and transaction queue
 *   5. Verify indexer sync status
 *   6. Watch chain progression in real time
 *   7. Detect if the node is fully synced
 *   8. Handle the case where no local node is running
 *
 * ============================================================================
 * WHY RUN YOUR OWN NODE?
 * ============================================================================
 *
 * Public RPC endpoints (testnet.ckb.dev, mainnet.ckb.dev) are convenient for
 * development, but they have real limitations:
 *
 *   1. RATE LIMITS — Public endpoints throttle requests. Heavy indexer queries
 *      or block syncing will hit limits quickly.
 *
 *   2. RESTRICTED METHODS — Net methods (get_peers, local_node_info) and admin
 *      methods (clear_tx_pool) are disabled on public nodes.
 *
 *   3. TRUST — You are trusting a third party to give you accurate chain data.
 *      A malicious or misconfigured public node could give you wrong data.
 *
 *   4. AVAILABILITY — If the public endpoint goes down, your application fails.
 *      Your own node gives you full control.
 *
 *   5. PRIVACY — Every RPC call reveals your addresses and transaction patterns
 *      to the public endpoint operator.
 *
 * Running your own node eliminates all these problems.
 *
 * ============================================================================
 * WHAT THIS SCRIPT DOES
 * ============================================================================
 *
 * 1. Attempts to connect to a local CKB node at localhost:8114
 * 2. If no local node is found, displays setup instructions and falls back
 *    to showing public testnet data for comparison
 * 3. If a local node is found, displays:
 *    - Node version and chain name
 *    - Sync progress (headers synced, blocks synced)
 *    - Peer connections (inbound vs outbound)
 *    - Mempool statistics
 *    - Indexer sync status
 *    - Live chain monitoring (new block notifications)
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Local node RPC URL.
 * Default CKB RPC port is 8114 (HTTP).
 * The default configuration listens on all interfaces: 0.0.0.0:8114
 */
const LOCAL_NODE_URL = "http://localhost:8114";

/**
 * Public testnet endpoint used as a fallback when no local node is available.
 * This lets the lesson demonstrate something even without a local node.
 */
const PUBLIC_TESTNET_URL = "https://testnet.ckb.dev";

/**
 * How often to poll for new blocks (milliseconds).
 * CKB targets ~10 seconds per block, so 5s polling is reasonably responsive.
 */
const POLL_INTERVAL_MS = 5_000;

/**
 * How long to run the real-time monitoring section (milliseconds).
 */
const MONITOR_DURATION_MS = 30_000;

// ============================================================================
// ANSI COLOR CODES
// ============================================================================

const C = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
} as const;

function c(text: string, ...codes: (keyof typeof C)[]): string {
  return codes.map((k) => C[k]).join("") + text + C.reset;
}

function header(title: string): void {
  const line = "=".repeat(60);
  console.log();
  console.log(c(line, "cyan"));
  console.log(c(`  ${title}`, "cyan", "bright"));
  console.log(c(line, "cyan"));
}

function section(title: string): void {
  console.log();
  console.log(c(`--- ${title} ---`, "yellow", "bright"));
}

function field(label: string, value: string): void {
  console.log(`  ${c(label.padEnd(30), "dim")} ${value}`);
}

function divider(): void {
  console.log(c("  " + "-".repeat(56), "dim"));
}

// ============================================================================
// JSON-RPC CLIENT
// ============================================================================

/**
 * Sends a single JSON-RPC 2.0 request and returns the result.
 *
 * This is a minimal implementation — in production you would use the
 * CkbRpcClient from Lesson 18 which adds retry logic and type safety.
 *
 * @param url - The RPC endpoint URL
 * @param method - The JSON-RPC method name
 * @param params - Method parameters
 * @param timeoutMs - Abort the request after this many milliseconds
 * @throws Error if the request fails or the server returns an error
 */
async function rpc<T>(
  url: string,
  method: string,
  params: unknown[] = [],
  timeoutMs: number = 5_000
): Promise<T> {
  // AbortController lets us cancel the fetch after a timeout.
  // This is critical for detecting when no local node is running —
  // without a timeout, the fetch would hang indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (json.error) {
      throw new Error(`RPC ${json.error.code}: ${json.error.message}`);
    }

    return json.result as T;
  } catch (err) {
    clearTimeout(timer);

    // Convert AbortError into a more informative message
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Connection timeout after ${timeoutMs}ms — is the node running?`);
    }

    throw err;
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Sync state as returned by the `sync_state` RPC method.
 *
 * CKB syncing happens in two phases:
 *   1. Header sync: Download and verify block headers (fast, lightweight)
 *   2. Block sync: Download and verify full block data (slower, requires PoW verification)
 *
 * A node is "fully synced" when both best_known_header_number and
 * best_known_block_number equal the network tip.
 */
interface SyncState {
  /** Estimated number of headers on the best chain seen by any peer. */
  best_known_header_number: string;
  /** Estimated hash of the best header. */
  best_known_header_hash: string | null;
  /** Number of orphaned headers not on the main chain. */
  orphan_blocks_count: string;
  /** How many block headers this node has downloaded and verified. */
  headers: string;
  /** How many full block bodies this node has downloaded and verified. */
  blocks: string;
  /** Whether this node is currently downloading headers (fast sync phase). */
  fast_time: string;
  /** Whether this node is currently downloading blocks. */
  normal_time: string;
  /** Low-activity sync time (waiting for new blocks). */
  low_time: string;
  /** The last known block on the main chain this node has fully validated. */
  best_known_block_number: string;
  best_known_block_hash: string | null;
  /** Lowest block number this node is willing to serve to peers. */
  min_chain_work: string;
  unverified_tip_header: string | null;
  unverified_tip_block: string | null;
  tip_hash: string | null;
  tip_number: string | null;
}

/**
 * Local node information from `local_node_info`.
 */
interface LocalNodeInfo {
  active: boolean;
  addresses: Array<{ address: string; score: string }>;
  connections: string;
  node_id: string;
  protocols: Array<{ id: string; name: string; support_versions: string[] }>;
  version: string;
}

/**
 * A connected peer from `get_peers`.
 */
interface RemoteNode {
  version: string;
  node_id: string;
  addresses: Array<{ address: string; score: string }>;
  is_outbound: boolean;
  connected_duration: string;
  protocols: Array<{ id: string; version: string }>;
  sync_state: {
    best_known_header_hash: string | null;
    best_known_header_number: string | null;
    can_fetch_count: string;
    inflight_count: string;
    last_common_header_hash: string | null;
    last_common_header_number: string | null;
    unknown_header_list_size: string;
  } | null;
}

/**
 * Transaction pool info from `get_raw_tx_pool` (non-verbose mode).
 */
interface TxPoolInfo {
  min_fee_rate: string;
  min_rbf_rate: string;
  max_tx_pool_size: string;
  orphan: string;
  pending: string;
  proposed: string;
  total_tx_cycles: string;
  total_tx_size: string;
  tx_size_limit: string;
  last_txs_updated_at: string;
}

/**
 * Blockchain info from `get_blockchain_info`.
 */
interface BlockchainInfo {
  chain: string;
  difficulty: string;
  epoch: string;
  is_initial_block_download: boolean;
  median_time: string;
  alerts: unknown[];
}

/**
 * Block header for monitoring.
 */
interface Header {
  number: string;
  hash: string;
  timestamp: string;
  transactions_root: string;
  epoch: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Converts a hex-encoded uint64 to a decimal BigInt.
 */
function hex2n(hex: string): bigint {
  return BigInt(hex);
}

/**
 * Formats bytes as a human-readable size string.
 */
function formatBytes(bytes: bigint): string {
  if (bytes < 1024n) return `${bytes} B`;
  if (bytes < 1024n * 1024n) return `${(Number(bytes) / 1024).toFixed(1)} KB`;
  if (bytes < 1024n * 1024n * 1024n) {
    return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(Number(bytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Formats a duration in milliseconds as a human-readable string.
 */
function formatDuration(ms: bigint): string {
  const seconds = ms / 1000n;
  if (seconds < 60n) return `${seconds}s`;
  if (seconds < 3600n) return `${seconds / 60n}m ${seconds % 60n}s`;
  if (seconds < 86400n) {
    return `${seconds / 3600n}h ${(seconds % 3600n) / 60n}m`;
  }
  return `${seconds / 86400n}d ${(seconds % 86400n) / 3600n}h`;
}

/**
 * Computes a sync percentage given current and target block numbers.
 * Returns a string like "98.5%" or "100.0% (fully synced)".
 */
function syncPercent(current: bigint, target: bigint): string {
  if (target === 0n) return "0.0%";
  const pct = (Number(current) / Number(target)) * 100;
  if (pct >= 99.99) return c("100.0% (fully synced)", "green", "bright");
  if (pct >= 95) return c(`${pct.toFixed(1)}%`, "yellow");
  return c(`${pct.toFixed(1)}%`, "red");
}

/**
 * Decodes the epoch packed uint64 into a human-readable string.
 * Format: [63:40] epoch_number | [39:16] epoch_index | [15:0] epoch_length
 */
function decodeEpoch(hexEpoch: string): string {
  const v = BigInt(hexEpoch);
  const num = v >> 40n;
  const idx = (v >> 16n) & 0xffffffn;
  const len = v & 0xffffn;
  return `Epoch ${num}, block ${idx}/${len}`;
}

// ============================================================================
// SECTION 1: NODE CONNECTIVITY CHECK
// ============================================================================

/**
 * Attempts to connect to the local CKB node.
 *
 * Returns the local node info if successful, or null if no node is running.
 * Uses a short timeout (3 seconds) so we do not wait long for a dead node.
 */
async function checkLocalNodeConnectivity(): Promise<LocalNodeInfo | null> {
  header("SECTION 1: Local Node Connectivity");

  console.log(`\n  Attempting to connect to: ${c(LOCAL_NODE_URL, "cyan")}`);
  console.log(c("  (Timeout: 3 seconds)", "dim"));
  console.log();

  try {
    const info = await rpc<LocalNodeInfo>(
      LOCAL_NODE_URL,
      "local_node_info",
      [],
      3_000
    );
    console.log(c("  Local node found!", "green", "bright"));
    return info;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(c("  No local node detected.", "yellow"));
    console.log(c(`  Reason: ${msg}`, "dim"));
    return null;
  }
}

// ============================================================================
// SECTION 2: NODE INFORMATION
// ============================================================================

/**
 * Displays detailed local node information.
 *
 * The `local_node_info` method is only available on nodes you control.
 * Public endpoints typically disable it for privacy reasons.
 *
 * @param info - The LocalNodeInfo returned by local_node_info
 */
function showNodeInfo(info: LocalNodeInfo): void {
  header("SECTION 2: Node Information");
  console.log();

  field("Node Active:", info.active ? c("Yes", "green") : c("No", "red"));
  field("Node Version:", c(info.version, "cyan"));
  field(
    "Node ID:",
    c(info.node_id.slice(0, 16) + "...", "dim")
  );
  field(
    "Active Connections:",
    c(hex2n(info.connections).toLocaleString(), "yellow")
  );

  if (info.addresses.length > 0) {
    console.log();
    console.log(c("  Listen Addresses:", "bright"));
    for (const addr of info.addresses.slice(0, 4)) {
      console.log(`    ${c(addr.address, "cyan")}`);
    }
  }

  if (info.protocols.length > 0) {
    console.log();
    console.log(c("  Supported Protocols:", "bright"));
    for (const proto of info.protocols.slice(0, 5)) {
      console.log(
        `    ${c(proto.name.padEnd(20), "dim")} versions: ${proto.support_versions.join(", ")}`
      );
    }
  }
}

// ============================================================================
// SECTION 3: SYNC PROGRESS
// ============================================================================

/**
 * Shows detailed synchronization progress.
 *
 * A CKB node syncs in two phases:
 *
 * PHASE 1 — Header Sync (fast):
 *   Downloads block headers and verifies the proof-of-work chain.
 *   Headers are small (~200 bytes each), so this phase is quick.
 *   The node can determine the canonical chain just from headers.
 *
 * PHASE 2 — Block Sync (slower):
 *   Downloads full block data (transactions, witnesses, etc.) and
 *   executes scripts to verify all state transitions.
 *   Full blocks can be several MB each on busy chains.
 *   On mainnet, initial sync takes days on a fresh node.
 *
 * Both phases run in parallel once enough headers are available.
 *
 * @param url - The RPC URL to query
 */
async function showSyncProgress(url: string): Promise<void> {
  header("SECTION 3: Synchronization Progress");
  console.log();

  // get_blockchain_info gives us a quick is_initial_block_download flag
  const chainInfo = await rpc<BlockchainInfo>(url, "get_blockchain_info");

  field("Chain:", c(chainInfo.chain, "cyan"));
  field(
    "Sync Status:",
    chainInfo.is_initial_block_download
      ? c("SYNCING (initial block download)", "yellow", "bright")
      : c("SYNCED (up to date)", "green", "bright")
  );
  field("Median Block Time:", c(
    new Date(Number(hex2n(chainInfo.median_time))).toISOString(),
    "dim"
  ));
  field("Epoch:", c(decodeEpoch(chainInfo.epoch), "yellow"));

  // sync_state gives us detailed progress numbers
  // This method may not be available on all public endpoints
  try {
    const syncState = await rpc<SyncState>(url, "sync_state", [], 5_000);

    const headersSynced = hex2n(syncState.headers);
    const blocksSynced = hex2n(syncState.blocks);
    const bestKnownHeaders = hex2n(syncState.best_known_header_number);
    const bestKnownBlocks = hex2n(syncState.best_known_block_number);

    console.log();
    console.log(c("  Header Sync:", "bright"));
    field(
      "  Headers Downloaded:",
      c(headersSynced.toLocaleString(), "green")
    );
    field(
      "  Network Best Header:",
      c(bestKnownHeaders.toLocaleString(), "cyan")
    );
    field(
      "  Header Progress:",
      syncPercent(headersSynced, bestKnownHeaders)
    );

    console.log();
    console.log(c("  Block Sync (full validation):", "bright"));
    field(
      "  Blocks Downloaded:",
      c(blocksSynced.toLocaleString(), "green")
    );
    field(
      "  Network Best Block:",
      c(bestKnownBlocks.toLocaleString(), "cyan")
    );
    field(
      "  Block Progress:",
      syncPercent(blocksSynced, bestKnownBlocks)
    );

    if (blocksSynced < bestKnownBlocks) {
      const remaining = bestKnownBlocks - blocksSynced;
      console.log();
      console.log(c(`  ${remaining.toLocaleString()} blocks remaining to sync`, "yellow"));

      // Estimate time remaining based on ~500 blocks/minute (rough estimate)
      // Actual speed depends heavily on hardware and network
      const minutesEstimate = Number(remaining) / 500;
      if (minutesEstimate < 60) {
        console.log(c(`  Estimated time: ~${minutesEstimate.toFixed(0)} minutes`, "dim"));
      } else if (minutesEstimate < 1440) {
        console.log(c(`  Estimated time: ~${(minutesEstimate / 60).toFixed(1)} hours`, "dim"));
      } else {
        console.log(c(`  Estimated time: ~${(minutesEstimate / 1440).toFixed(1)} days`, "dim"));
      }
    }
  } catch (_err) {
    // sync_state not available on all public endpoints
    console.log(c("\n  Detailed sync state not available on this endpoint.", "dim"));
  }
}

// ============================================================================
// SECTION 4: PEER CONNECTIONS
// ============================================================================

/**
 * Shows information about connected P2P peers.
 *
 * CKB uses a P2P network based on the libp2p framework with a custom
 * discovery protocol. Nodes maintain both outbound connections (ones this
 * node initiated) and inbound connections (ones peers initiated to us).
 *
 * Recommended peer counts:
 *   - Minimum: 3 peers (barely functional)
 *   - Normal: 8-12 peers (default maximum)
 *   - More peers = better connectivity and faster block propagation
 *
 * Bootstrap nodes provide the initial connection points for new nodes.
 * After connecting to bootstrap nodes, peer discovery (using a DHT-like
 * protocol) finds more peers automatically.
 *
 * @param url - The RPC URL to query
 */
async function showPeerConnections(url: string): Promise<void> {
  header("SECTION 4: Peer Connections");
  console.log();

  let peers: RemoteNode[];

  try {
    peers = await rpc<RemoteNode[]>(url, "get_peers", [], 5_000);
  } catch (_err) {
    console.log(c("  Peer info not available on this endpoint.", "yellow"));
    console.log(c("  This method requires a local node.", "dim"));
    return;
  }

  const outbound = peers.filter((p) => p.is_outbound);
  const inbound = peers.filter((p) => !p.is_outbound);

  field("Total Peers:", c(`${peers.length}`, peers.length >= 3 ? "green" : "red"));
  field("Outbound:", c(`${outbound.length}`, "cyan"));
  field("Inbound:", c(`${inbound.length}`, "yellow"));

  if (peers.length === 0) {
    console.log();
    console.log(c("  No peers connected yet.", "yellow"));
    console.log(c("  This is normal immediately after starting the node.", "dim"));
    console.log(c("  It may take 1-2 minutes to find peers.", "dim"));
    return;
  }

  console.log();
  console.log(c("  Connected Peers:", "bright"));

  for (const peer of peers.slice(0, 6)) {
    divider();
    const connectedMs = hex2n(peer.connected_duration);
    const direction = peer.is_outbound ? "OUT" : "IN ";
    const version = peer.version.split(" ")[0]; // Extract version number

    field(
      `  [${direction}] Version:`,
      c(version, "cyan")
    );
    field(
      "  Node ID:",
      c(peer.node_id.slice(0, 16) + "...", "dim")
    );
    field(
      "  Connected:",
      c(formatDuration(connectedMs / 1000n) + " ago", "green")
    );

    if (peer.addresses.length > 0) {
      field(
        "  Address:",
        c(peer.addresses[0].address, "dim")
      );
    }

    if (peer.sync_state?.best_known_header_number) {
      field(
        "  Best Header:",
        c(
          `#${hex2n(peer.sync_state.best_known_header_number).toLocaleString()}`,
          "yellow"
        )
      );
    }
  }

  if (peers.length > 6) {
    console.log(c(`\n  ... and ${peers.length - 6} more peers`, "dim"));
  }
}

// ============================================================================
// SECTION 5: MEMPOOL STATUS
// ============================================================================

/**
 * Shows the current state of the transaction mempool.
 *
 * The CKB mempool holds transactions waiting to be included in a block.
 * It is divided into two queues:
 *
 *   pending — transactions received but not yet proposed for inclusion
 *   proposed — transactions whose short IDs appeared in a proposal zone
 *              (these are in Phase 1 of the 2-phase commit system)
 *
 * Miners select from the pending pool to fill proposal zones, then include
 * proposed transactions in subsequent blocks.
 *
 * Fee rate is measured in shannons per 1000 bytes (shannons/KB).
 * The minimum fee rate is a node policy setting in ckb.toml.
 *
 * @param url - The RPC URL to query
 */
async function showMempoolStatus(url: string): Promise<void> {
  header("SECTION 5: Mempool (Transaction Pool) Status");
  console.log();

  try {
    // get_raw_tx_pool with "false" returns summary statistics only
    // With "true" it returns the full list of transaction IDs (can be very large)
    const poolInfo = await rpc<TxPoolInfo>(url, "get_raw_tx_pool", ["false"]);

    const pendingCount = hex2n(poolInfo.pending);
    const proposedCount = hex2n(poolInfo.proposed);
    const totalSize = hex2n(poolInfo.total_tx_size);
    const totalCycles = hex2n(poolInfo.total_tx_cycles);
    const minFeeRate = hex2n(poolInfo.min_fee_rate);

    field(
      "Pending Transactions:",
      c(pendingCount.toLocaleString(), "yellow")
    );
    field(
      "Proposed Transactions:",
      c(proposedCount.toLocaleString(), "cyan")
    );
    field(
      "Orphan Transactions:",
      c(hex2n(poolInfo.orphan).toLocaleString(), "red")
    );
    divider();
    field(
      "Total Pool Size:",
      c(formatBytes(totalSize), "green")
    );
    field(
      "Max Pool Size:",
      c(formatBytes(hex2n(poolInfo.max_tx_pool_size)), "dim")
    );
    field(
      "Total Cycles:",
      c(totalCycles.toLocaleString(), "magenta")
    );
    divider();
    field(
      "Min Fee Rate:",
      c(`${minFeeRate.toLocaleString()} shannons/KB`, "yellow")
    );
    field(
      "Min RBF Fee Rate:",
      c(`${hex2n(poolInfo.min_rbf_rate).toLocaleString()} shannons/KB`, "dim")
    );

    const lastUpdate = new Date(
      Number(hex2n(poolInfo.last_txs_updated_at))
    ).toISOString();
    field("Last Updated:", c(lastUpdate, "dim"));

    if (pendingCount === 0n && proposedCount === 0n) {
      console.log();
      console.log(c("  Mempool is empty — chain is idle or all txs confirmed.", "dim"));
    }
  } catch (err) {
    console.log(c("  Mempool info not available.", "yellow"));
  }
}

// ============================================================================
// SECTION 6: INDEXER STATUS
// ============================================================================

/**
 * Shows the CKB indexer sync status.
 *
 * The CKB indexer is a separate subsystem built into modern CKB nodes
 * (enabled via [indexer] in ckb.toml). It maintains an index of cells
 * organized by lock script and type script, enabling efficient queries.
 *
 * The indexer processes blocks independently from the main chain sync.
 * When you first enable the indexer on an existing node, it needs to
 * re-process all historical blocks, which takes time.
 *
 * After the indexer is fully caught up:
 *   - get_cells queries work correctly
 *   - get_cells_capacity gives accurate balances
 *   - get_transactions queries return complete results
 *
 * During indexer catch-up:
 *   - Queries return partial/outdated results
 *   - Balance queries may show 0 or incorrect values
 *
 * @param url - The RPC URL to query
 */
async function showIndexerStatus(url: string): Promise<void> {
  header("SECTION 6: Indexer Status");
  console.log();

  try {
    const indexerTip = await rpc<{
      block_hash: string;
      block_number: string;
    }>(url, "get_indexer_tip");

    const chainTipHeader = await rpc<Header>(url, "get_tip_header");
    const chainTip = hex2n(chainTipHeader.number);
    const indexerBlock = hex2n(indexerTip.block_number);
    const behindBy = chainTip - indexerBlock;

    field("Indexer Enabled:", c("Yes", "green"));
    field(
      "Indexer Block:",
      c(`#${indexerBlock.toLocaleString()}`, "green")
    );
    field(
      "Chain Tip:",
      c(`#${chainTip.toLocaleString()}`, "cyan")
    );
    field(
      "Behind by:",
      behindBy <= 5n
        ? c(`${behindBy} blocks (fully caught up)`, "green")
        : c(`${behindBy.toLocaleString()} blocks`, "yellow")
    );
    field(
      "Indexer Hash:",
      c(indexerTip.block_hash.slice(0, 20) + "...", "dim")
    );

    if (behindBy > 5n) {
      console.log();
      console.log(c("  The indexer is catching up. Cell queries may be incomplete.", "yellow"));
      console.log(c("  Wait for the indexer to reach the chain tip before querying.", "dim"));
    }
  } catch (_err) {
    console.log(c("  Indexer not enabled on this node.", "yellow"));
    console.log();
    console.log(c("  To enable the indexer, add to ckb.toml:", "dim"));
    console.log(c("  [indexer]", "cyan"));
    console.log(c("  # indexer is enabled automatically in CKB 0.101+", "dim"));
    console.log();
    console.log(c("  Then restart the node and wait for indexer catch-up.", "dim"));
  }
}

// ============================================================================
// SECTION 7: CHAIN PROGRESSION MONITOR
// ============================================================================

/**
 * Monitors the chain for new blocks over a set duration.
 *
 * This demonstrates what a real monitoring tool would do:
 *   1. Establish the current tip
 *   2. Poll regularly for new blocks
 *   3. Display block stats when new blocks arrive
 *
 * For a local node, block arrivals are nearly instant (sub-second latency).
 * For a public endpoint, you also see the block at approximately real time,
 * but with some additional propagation and HTTP overhead.
 *
 * A production monitoring tool would:
 *   - Alert if no new block arrives for > 3x the expected block time
 *   - Alert if block time variance is too high (may indicate fork)
 *   - Track mempool size trends for fee estimation
 *   - Monitor peer count for connectivity issues
 *
 * @param url - The RPC URL to query
 */
async function monitorChainProgression(url: string): Promise<void> {
  header("SECTION 7: Real-Time Chain Monitor");

  console.log(`\n  Monitoring for ${MONITOR_DURATION_MS / 1000} seconds.`);
  console.log(`  Polling every ${POLL_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.\n`);

  const tipHeader = await rpc<Header>(url, "get_tip_header");
  let lastBlock = hex2n(tipHeader.number);
  let lastTimestamp = hex2n(tipHeader.timestamp);
  const startTime = Date.now();
  let blockCount = 0;

  console.log(
    c(
      `  Watching from block #${lastBlock.toLocaleString()}`,
      "cyan"
    )
  );
  console.log();

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

      try {
        const tip = await rpc<Header>(url, "get_tip_header");
        const current = hex2n(tip.number);
        const ts = hex2n(tip.timestamp);

        if (current > lastBlock) {
          const newBlocks = current - lastBlock;
          const blockTimeMs = Number(ts - lastTimestamp) / Number(newBlocks);

          blockCount += Number(newBlocks);
          lastBlock = current;
          lastTimestamp = ts;

          const timeStr = new Date(Number(ts)).toISOString().slice(11, 23);

          console.log(
            `  [${elapsed}s] ` +
            c(`Block #${current.toLocaleString()}`, "green", "bright") +
            ` | ${timeStr} UTC` +
            ` | block time: ${(blockTimeMs / 1000).toFixed(1)}s` +
            (newBlocks > 1n ? c(` (+${newBlocks} new)`, "yellow") : "")
          );
        } else {
          process.stdout.write(
            `\r  [${elapsed}s] ` +
            c(`Watching... tip: #${current.toLocaleString()}`, "dim") +
            `   `
          );
        }
      } catch (_err) {
        process.stdout.write(`\r  [${elapsed}s] ${c("Connection error — retrying...", "yellow")}   `);
      }

      if (Date.now() - startTime >= MONITOR_DURATION_MS) {
        clearInterval(interval);
        console.log("\n");
        console.log(
          c(
            `  Saw ${blockCount} new block${blockCount !== 1 ? "s" : ""} in ${MONITOR_DURATION_MS / 1000}s.`,
            "cyan"
          )
        );
        resolve();
      }
    }, POLL_INTERVAL_MS);
  });
}

// ============================================================================
// SETUP INSTRUCTIONS (when no local node is running)
// ============================================================================

/**
 * Displays setup instructions when no local CKB node is detected.
 *
 * This function provides a helpful guide rather than just failing.
 * It demonstrates the graceful fallback pattern.
 */
function showSetupInstructions(): void {
  section("How to Run Your Own CKB Node");

  console.log();
  console.log(c("  STEP 1: Download CKB", "bright"));
  console.log();
  console.log("  Visit: https://github.com/nervosnetwork/ckb/releases");
  console.log("  Download the latest release for your platform.");
  console.log("  Or use the setup script included in this lesson:");
  console.log(c("    bash scripts/setup.sh", "cyan"));

  console.log();
  console.log(c("  STEP 2: Initialize the node configuration", "bright"));
  console.log();
  console.log("  For testnet (recommended for learning):");
  console.log(c("    ckb init --chain testnet", "cyan"));
  console.log();
  console.log("  For mainnet:");
  console.log(c("    ckb init --chain mainnet", "cyan"));
  console.log();
  console.log("  For local devnet (instant blocks, no real CKB):");
  console.log(c("    ckb init --chain dev", "cyan"));

  console.log();
  console.log(c("  STEP 3: Start the node", "bright"));
  console.log();
  console.log(c("    ckb run", "cyan"));
  console.log();
  console.log("  The node will start syncing. Watch the logs for:");
  console.log(c('    "CKB info CKB Sync started"', "dim"));
  console.log(c('    "CKB info best=... median-time=..."', "dim"));

  console.log();
  console.log(c("  STEP 4: Wait for sync to complete", "bright"));
  console.log();
  console.log("  Testnet sync: 1-4 hours depending on hardware");
  console.log("  Mainnet sync: 12-48 hours depending on hardware");
  console.log();
  console.log("  Monitor sync progress:");
  console.log(c("    curl -X POST http://localhost:8114 \\", "cyan"));
  console.log(c('      -H "Content-Type: application/json" \\', "cyan"));
  console.log(c("      -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sync_state\",\"params\":[]}'", "cyan"));

  console.log();
  console.log(c("  HARDWARE REQUIREMENTS", "yellow", "bright"));
  console.log();
  console.log("  Minimum:");
  console.log("    CPU: 2 cores (x86_64)");
  console.log("    RAM: 4 GB");
  console.log("    Storage: 100 GB SSD (testnet), 500 GB+ SSD (mainnet)");
  console.log("    Network: 5 Mbps stable connection");
  console.log();
  console.log("  Recommended:");
  console.log("    CPU: 4+ cores");
  console.log("    RAM: 8 GB+");
  console.log("    Storage: 1 TB NVMe SSD (for fast initial sync)");
  console.log("    Network: 20+ Mbps");

  console.log();
  console.log(c("  ALTERNATIVE: Use OffCKB for development", "bright"));
  console.log();
  console.log("  OffCKB provides an instant-on local devnet:");
  console.log(c("    npx @offckb/cli@latest start", "cyan"));
  console.log("  - Produces blocks instantly (no real PoW)");
  console.log("  - Pre-funded test accounts");
  console.log("  - Includes all system scripts");
  console.log("  - Perfect for contract development and testing");
  console.log("  - RPC at http://localhost:8114 (same as a real node)");
}

// ============================================================================
// FALLBACK: PUBLIC TESTNET DATA
// ============================================================================

/**
 * When no local node is available, demonstrates the same monitoring
 * capabilities using the public testnet endpoint.
 *
 * This shows users what they can expect once their local node is running.
 */
async function showPublicTestnetFallback(): Promise<void> {
  section("Demonstrating With Public Testnet (Fallback Mode)");

  console.log();
  console.log(c("  Using public testnet endpoint for demonstration.", "yellow"));
  console.log(c(`  Endpoint: ${PUBLIC_TESTNET_URL}`, "dim"));
  console.log();

  try {
    const chainInfo = await rpc<BlockchainInfo>(
      PUBLIC_TESTNET_URL,
      "get_blockchain_info"
    );
    const tip = await rpc<Header>(PUBLIC_TESTNET_URL, "get_tip_header");

    console.log(c("  Public Testnet Status:", "bright"));
    field("  Chain:", c(chainInfo.chain, "cyan"));
    field("  Block Height:", c(`#${hex2n(tip.number).toLocaleString()}`, "green"));
    field(
      "  Last Block Time:",
      c(new Date(Number(hex2n(tip.timestamp))).toISOString(), "yellow")
    );
    field("  Epoch:", c(decodeEpoch(chainInfo.epoch), "dim"));
    field(
      "  Network Synced:",
      chainInfo.is_initial_block_download
        ? c("Syncing...", "yellow")
        : c("Yes", "green")
    );

    console.log();
    console.log(c("  Run the monitoring sections once your local node is ready.", "dim"));
  } catch (err) {
    console.log(c("  Could not reach public testnet either.", "red"));
    console.log(c("  Check your internet connection.", "dim"));
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Main function: detect whether a local node is running, then display
 * monitoring information accordingly.
 *
 * The tool is designed to be useful in both states:
 *   - WITH a local node: full monitoring dashboard
 *   - WITHOUT a local node: setup instructions + public testnet preview
 */
async function main(): Promise<void> {
  console.clear();

  console.log(c(
    "  ╔══════════════════════════════════════════════════════════╗",
    "cyan"
  ));
  console.log(c(
    "  ║        LESSON 19: CKB FULL NODE MONITOR                 ║",
    "cyan", "bright"
  ));
  console.log(c(
    "  ╚══════════════════════════════════════════════════════════╝",
    "cyan"
  ));
  console.log();
  console.log(`  Local Node: ${c(LOCAL_NODE_URL, "cyan")}`);
  console.log(`  Started:    ${c(new Date().toISOString(), "dim")}`);

  // ---- SECTION 1: Check if local node is running ----
  const localNodeInfo = await checkLocalNodeConnectivity();

  if (localNodeInfo) {
    // ============================================================
    // LOCAL NODE FOUND — Full monitoring dashboard
    // ============================================================
    const nodeUrl = LOCAL_NODE_URL;

    // ---- SECTION 2: Node information ----
    showNodeInfo(localNodeInfo);

    // ---- SECTION 3: Sync progress ----
    await showSyncProgress(nodeUrl);

    // ---- SECTION 4: Peer connections ----
    await showPeerConnections(nodeUrl);

    // ---- SECTION 5: Mempool status ----
    await showMempoolStatus(nodeUrl);

    // ---- SECTION 6: Indexer status ----
    await showIndexerStatus(nodeUrl);

    // ---- SECTION 7: Real-time chain monitor ----
    await monitorChainProgression(nodeUrl);
  } else {
    // ============================================================
    // NO LOCAL NODE — Show instructions + public testnet fallback
    // ============================================================
    showSetupInstructions();
    await showPublicTestnetFallback();

    // Still show monitoring with public testnet so the lesson is useful
    // even without a local node installed
    console.log();
    console.log(c(
      "\n  Demonstrating chain monitoring with public testnet...",
      "yellow"
    ));
    await showSyncProgress(PUBLIC_TESTNET_URL);
    await showMempoolStatus(PUBLIC_TESTNET_URL);
    await monitorChainProgression(PUBLIC_TESTNET_URL);
  }

  // ---- SUMMARY ----
  header("SUMMARY");
  console.log();

  if (localNodeInfo) {
    console.log(c("  Your local CKB node is running successfully!", "green", "bright"));
    console.log();
    console.log("  Your node is:");
    console.log(`  ${c("-", "cyan")} Contributing to blockchain decentralization`);
    console.log(`  ${c("-", "cyan")} Independently verifying all transactions`);
    console.log(`  ${c("-", "cyan")} Serving as a trusted RPC endpoint for your apps`);
    console.log(`  ${c("-", "cyan")} Participating in the P2P gossip network`);
  } else {
    console.log(c("  Set up a local node to unlock full RPC capabilities:", "yellow"));
    console.log();
    console.log("  With a local node you can:");
    console.log(`  ${c("-", "cyan")} Use local_node_info and get_peers`);
    console.log(`  ${c("-", "cyan")} Clear the mempool for testing`);
    console.log(`  ${c("-", "cyan")} Use WebSocket subscriptions`);
    console.log(`  ${c("-", "cyan")} Make unlimited RPC requests without rate limits`);
    console.log(`  ${c("-", "cyan")} Verify the chain independently`);
  }

  console.log();
  console.log(c("  Next: Lesson 20 — Light Client Application", "green", "bright"));
  console.log();
}

// Run the monitor
main().catch((err) => {
  console.error(c("\n  Fatal error:", "red"), err.message);
  process.exit(1);
});
