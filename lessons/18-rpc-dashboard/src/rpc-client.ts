/**
 * ============================================================================
 * CKB JSON-RPC Client
 * ============================================================================
 *
 * A typed wrapper around the CKB JSON-RPC API.
 *
 * The CKB full node exposes a JSON-RPC 2.0 interface over:
 *   - HTTP (default port 8114) — request/response, suitable for most use cases
 *   - TCP socket — raw socket connection, lower overhead
 *   - WebSocket — for subscription-based real-time updates (new_tip_header,
 *     new_tip_block, new_transaction events)
 *
 * This module provides TypeScript interfaces for all major RPC response types
 * and a generic `callRpc` function to make typed calls to any endpoint.
 *
 * Reference: https://github.com/nervosnetwork/ckb/tree/develop/rpc
 * ============================================================================
 */

// ============================================================================
// CORE TYPE DEFINITIONS
// ============================================================================

/**
 * A hex-encoded 256-bit hash string (0x prefix + 64 hex chars).
 * Used for block hashes, transaction hashes, script code_hashes, etc.
 */
export type Hash256 = string;

/**
 * A hex-encoded uint64 value with 0x prefix.
 * CKB uses hex encoding for all numeric fields in JSON-RPC responses
 * because JSON numbers cannot represent 64-bit integers precisely.
 *
 * Example: "0x174876e800" represents 100,000,000,000 (100 CKB in shannons)
 */
export type HexUint64 = string;

/**
 * A hex-encoded byte string with 0x prefix.
 * Used for arbitrary binary data: script args, cell data, witnesses, etc.
 */
export type HexBytes = string;

// ============================================================================
// SCRIPT TYPE
// ============================================================================

/**
 * A CKB Script — the fundamental permission/validation unit.
 *
 * Every cell has a lock_script (required) and optionally a type_script.
 * Scripts are identified by:
 *   - code_hash: blake2b-256 hash of the script binary (hash_type: data/data1/data2)
 *                OR blake2b-256 hash of the type script of the cell containing
 *                the binary (hash_type: type)
 *   - hash_type: "data" | "data1" | "data2" | "type"
 *   - args: arbitrary bytes passed to the script as arguments
 */
export interface Script {
  code_hash: Hash256;
  hash_type: "data" | "data1" | "data2" | "type";
  args: HexBytes;
}

// ============================================================================
// OUTPOINT AND CELL TYPES
// ============================================================================

/**
 * An OutPoint uniquely identifies a cell by the transaction that created it
 * and the index of the output within that transaction.
 *
 * Think of it as a pointer: "the Nth output of transaction TX_HASH".
 */
export interface OutPoint {
  tx_hash: Hash256;
  index: HexUint64;
}

/**
 * A cell output — the declaration of a cell's capacity and lock/type scripts.
 * This does NOT include the cell's data field.
 */
export interface CellOutput {
  /** Capacity in shannons (hex). 1 CKB = 10^8 shannons. */
  capacity: HexUint64;
  /** The lock script controls who can spend this cell. */
  lock: Script;
  /** The type script enforces data validity rules (optional). */
  type: Script | null;
}

/**
 * A live cell — an unspent cell output currently in the cell set.
 * "Live" means it has been created but not yet consumed as a transaction input.
 */
export interface LiveCell {
  data: {
    /** The cell's data field as hex bytes. */
    content: HexBytes;
    /** blake2b-256 hash of the data content. */
    hash: Hash256;
  } | null;
  output: CellOutput;
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * A cell dependency — a live cell the transaction reads but does not consume.
 *
 * Cell deps are used to reference:
 *   - Script code cells: the RISC-V binary for scripts used in this transaction
 *   - Data cells: cells that scripts read for reference data (e.g., price oracles)
 *
 * dep_type:
 *   - "code": the cell itself is the script binary
 *   - "dep_group": the cell contains a list of OutPoints pointing to code cells
 *                  (used to bundle multiple scripts in one dep_group cell)
 */
export interface CellDep {
  out_point: OutPoint;
  dep_type: "code" | "dep_group";
}

/**
 * A transaction input — a reference to a live cell being consumed.
 *
 * The `since` field implements relative/absolute time locks:
 *   - "0x0" means no time lock
 *   - Other values encode block number or timestamp constraints
 */
export interface Input {
  previous_output: OutPoint;
  /** Time lock for this specific input (hex uint64). */
  since: HexUint64;
}

/**
 * A full CKB transaction as returned by the RPC.
 *
 * Transaction structure:
 *   - version: always 0 currently
 *   - cell_deps: live cells referenced (not consumed) by this transaction
 *   - header_deps: block headers referenced by scripts in this transaction
 *   - inputs: cells being consumed
 *   - outputs: new cells being created
 *   - outputs_data: data for each output cell (parallel array with outputs)
 *   - witnesses: off-chain data (signatures, proofs) used by lock scripts
 */
export interface Transaction {
  version: HexUint64;
  cell_deps: CellDep[];
  header_deps: Hash256[];
  inputs: Input[];
  outputs: CellOutput[];
  outputs_data: HexBytes[];
  witnesses: HexBytes[];
}

/**
 * A transaction with its computed hash, as stored in a block.
 */
export interface TransactionWithHash {
  hash: Hash256;
  transaction: Transaction;
}

/**
 * The full result of `get_transaction`, including:
 *   - transaction: the transaction data
 *   - cycles: compute cycles used (null for transactions not yet committed)
 *   - time_added_to_pool: when it entered the mempool (ms timestamp, null if on-chain)
 *   - min_replace_fee: minimum fee to replace this transaction (null if on-chain)
 *   - tx_status: current status information
 */
export interface TransactionResult {
  transaction: Transaction | null;
  cycles: HexUint64 | null;
  time_added_to_pool: HexUint64 | null;
  min_replace_fee: HexUint64 | null;
  tx_status: {
    block_hash: Hash256 | null;
    block_number: HexUint64 | null;
    /** "pending" | "proposed" | "committed" | "unknown" | "rejected" */
    status: string;
    reason: string | null;
    time_added_to_pool: HexUint64 | null;
  };
}

// ============================================================================
// BLOCK TYPES
// ============================================================================

/**
 * A block header containing chain metadata.
 *
 * Key fields:
 *   - number: block height (hex)
 *   - timestamp: Unix timestamp in milliseconds (hex) — CKB uses millisecond precision
 *   - transactions_root: merkle root of all transactions in this block
 *   - proposals_hash: hash of the proposal zone (2-phase commit system)
 *   - compact_target: proof-of-work difficulty target
 *   - nonce: PoW nonce
 *   - epoch: epoch number and index encoded together
 *   - parent_hash: hash of the previous block
 */
export interface Header {
  compact_target: HexUint64;
  dao: HexBytes;
  epoch: HexUint64;
  extra_hash: Hash256;
  hash: Hash256;
  nonce: string;
  number: HexUint64;
  parent_hash: Hash256;
  proposals_hash: Hash256;
  timestamp: HexUint64;
  transactions_root: Hash256;
  version: HexUint64;
}

/**
 * A full block: header + transactions + uncle headers + proposals.
 *
 * The "uncle" concept in CKB: uncle blocks are valid blocks that were not
 * included in the main chain (orphaned blocks). CKB references them to
 * reward miners and improve chain security metrics.
 */
export interface Block {
  header: Header;
  transactions: TransactionWithHash[];
  uncles: UncleBlock[];
  proposals: string[];
  extension: HexBytes | null;
}

/** An uncle block (orphaned block referenced in the main chain). */
export interface UncleBlock {
  header: Header;
  proposals: string[];
}

// ============================================================================
// CAPACITY AND INDEXER TYPES
// ============================================================================

/**
 * Result of `get_cells_capacity` — the total CKB capacity (in shannons)
 * held by all live cells matching a given lock script.
 *
 * This is used to calculate the balance of an address without fetching
 * individual cells. Very efficient for balance checks.
 */
export interface CellsCapacity {
  /** Total capacity in shannons (hex). Divide by 10^8 for CKB. */
  capacity: HexUint64;
  /** The block hash at which this snapshot was taken. */
  block_hash: Hash256;
  /** The block number at which this snapshot was taken (hex). */
  block_number: HexUint64;
}

// ============================================================================
// NODE INFO TYPES
// ============================================================================

/**
 * Information about a connected peer node.
 * Returned by `get_peers`.
 */
export interface RemoteNode {
  /** The node's version string (e.g., "0.117.0 (v0.117.0 2024-...") */
  version: string;
  /** The node's public key (hex). */
  node_id: string;
  /** Network addresses this peer is reachable at. */
  addresses: Array<{
    address: string;
    score: HexUint64;
  }>;
  /** Whether the connection was initiated by us (true) or by the peer (false). */
  is_outbound: boolean;
  /** Milliseconds since we connected to this peer. */
  connected_duration: HexUint64;
  /** Protocols this peer supports. */
  protocols: Array<{
    id: HexUint64;
    version: string;
  }>;
}

/**
 * Information about the local CKB node.
 * Returned by `local_node_info`.
 */
export interface LocalNodeInfo {
  /** Whether the node is currently active. */
  active: boolean;
  /** Network addresses this node is reachable at. */
  addresses: Array<{
    address: string;
    score: HexUint64;
  }>;
  /** The chain spec name: "ckb", "ckb_testnet", "ckb_dev", or custom. */
  connections: HexUint64;
  /** The node's public key. */
  node_id: string;
  /** Supported protocols. */
  protocols: Array<{
    id: HexUint64;
    name: string;
    support_versions: string[];
  }>;
  /** Node software version string. */
  version: string;
}

// ============================================================================
// SEARCH KEY TYPE (for indexer queries)
// ============================================================================

/**
 * Search key for indexer-based cell queries (`get_cells`, `get_transactions`).
 *
 * The CKB indexer allows querying cells by lock script, type script, or both.
 * This enables efficient wallet balance lookups, token queries, etc.
 *
 * script_type: "lock" | "type" — which script field to filter on
 * filter: optional additional filters (e.g., only cells with a certain type script)
 * with_data: whether to include cell data in results (increases response size)
 */
export interface SearchKey {
  script: Script;
  script_type: "lock" | "type";
  filter?: {
    script?: Script;
    script_len_range?: [HexUint64, HexUint64];
    output_data_len_range?: [HexUint64, HexUint64];
    output_capacity_range?: [HexUint64, HexUint64];
    block_range?: [HexUint64, HexUint64];
  };
  with_data?: boolean;
}

// ============================================================================
// JSON-RPC TRANSPORT
// ============================================================================

/**
 * A JSON-RPC 2.0 request object.
 */
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}

/**
 * A JSON-RPC 2.0 response — either a result or an error.
 */
interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * A custom error class for JSON-RPC errors.
 * Preserves the error code and message from the RPC response.
 */
export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(`RPC Error ${code}: ${message}`);
    this.name = "RpcError";
  }
}

// ============================================================================
// MAIN RPC CLIENT CLASS
// ============================================================================

/**
 * A typed JSON-RPC 2.0 client for the CKB node API.
 *
 * Usage:
 *   const client = new CkbRpcClient("https://testnet.ckb.dev");
 *   const header = await client.getTipHeader();
 *
 * The client uses fetch() for all requests, which is available natively
 * in Node.js 18+ and all modern browsers.
 */
export class CkbRpcClient {
  private requestId = 0;

  /**
   * @param url - The HTTP URL of the CKB RPC endpoint.
   *              Examples:
   *                - Testnet public: "https://testnet.ckb.dev"
   *                - Local node:     "http://localhost:8114"
   *                - Mainnet public: "https://mainnet.ckb.dev"
   */
  constructor(private readonly url: string) {}

  /**
   * Sends a JSON-RPC 2.0 request and returns the typed result.
   *
   * @param method - The RPC method name (e.g., "get_tip_header")
   * @param params - Array of parameters to pass to the method
   * @returns The result field of the JSON-RPC response
   * @throws RpcError if the server returns an error object
   * @throws Error if the network request fails
   */
  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: ++this.requestId,
      method,
      params,
    };

    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `HTTP error: ${response.status} ${response.statusText}`
      );
    }

    const json: JsonRpcResponse<T> = await response.json();

    if (json.error) {
      throw new RpcError(json.error.code, json.error.message, json.error.data);
    }

    return json.result as T;
  }

  // ==========================================================================
  // CHAIN METHODS
  // ==========================================================================

  /**
   * Returns the header of the current chain tip (the most recent committed block).
   *
   * The tip header tells you:
   *   - The current block height (number)
   *   - The current timestamp
   *   - The current difficulty target
   *   - The hash to use for subsequent lookups
   *
   * This is the most commonly used RPC call for monitoring sync progress.
   */
  async getTipHeader(): Promise<Header> {
    return this.call<Header>("get_tip_header");
  }

  /**
   * Returns the block number of the current chain tip.
   *
   * This is a lighter-weight alternative to getTipHeader() if you only
   * need the block number (returns hex string).
   */
  async getTipBlockNumber(): Promise<HexUint64> {
    return this.call<HexUint64>("get_tip_block_number");
  }

  /**
   * Returns a full block by its hash.
   *
   * @param hash - The block hash (hex string)
   * @param verbosity - Response verbosity level:
   *   - 0: serialized binary (hex) — most compact
   *   - 1: JSON with transaction hashes only (default) — lighter weight
   *   - 2: JSON with full transaction data — largest response
   */
  async getBlock(hash: Hash256, verbosity: 0 | 1 | 2 = 2): Promise<Block> {
    return this.call<Block>("get_block", [hash, `0x${verbosity}`]);
  }

  /**
   * Returns a full block by its block number (height).
   *
   * @param blockNumber - Block height as a hex string (e.g., "0x100")
   * @param verbosity - Same verbosity options as getBlock()
   *
   * Note: CKB uses hex encoding for all numeric parameters. Pass "0x0" for
   * the genesis block, "0x1" for the first block, etc.
   */
  async getBlockByNumber(
    blockNumber: HexUint64,
    verbosity: 0 | 1 | 2 = 2
  ): Promise<Block> {
    return this.call<Block>("get_block_by_number", [
      blockNumber,
      `0x${verbosity}`,
    ]);
  }

  /**
   * Returns a block header by its hash (without the transaction data).
   * More efficient than getBlock() when you only need header metadata.
   */
  async getHeader(hash: Hash256): Promise<Header> {
    return this.call<Header>("get_header", [hash]);
  }

  /**
   * Returns a block header by its block number.
   * More efficient than getBlockByNumber() when you only need header metadata.
   */
  async getHeaderByNumber(blockNumber: HexUint64): Promise<Header> {
    return this.call<Header>("get_header_by_number", [blockNumber]);
  }

  /**
   * Returns the current blockchain info including chain name, median time,
   * isInitialBlockDownload flag, epoch, and difficulty.
   *
   * The `is_initial_block_download` field tells you if the node is still
   * syncing — it is true during initial sync and false once caught up.
   */
  async getBlockchainInfo(): Promise<{
    chain: string;
    median_time: HexUint64;
    epoch: HexUint64;
    difficulty: string;
    is_initial_block_download: boolean;
    alerts: unknown[];
  }> {
    return this.call("get_blockchain_info");
  }

  // ==========================================================================
  // TRANSACTION METHODS
  // ==========================================================================

  /**
   * Returns transaction details by transaction hash.
   *
   * Returns null if the transaction is not found (neither in mempool nor on-chain).
   *
   * The TransactionResult.tx_status.status field will be:
   *   - "pending":   in the mempool, not yet proposed
   *   - "proposed":  in a proposal zone of a recent block
   *   - "committed": confirmed on-chain (included in a block)
   *   - "rejected":  rejected from the mempool
   *   - "unknown":   not found
   *
   * @param txHash - The transaction hash (hex string with 0x prefix)
   * @param verbosity - 1 (default) for full JSON, 0 for serialized hex
   */
  async getTransaction(
    txHash: Hash256,
    verbosity: 0 | 1 = 1
  ): Promise<TransactionResult | null> {
    return this.call<TransactionResult | null>("get_transaction", [
      txHash,
      `0x${verbosity}`,
    ]);
  }

  // ==========================================================================
  // CELL METHODS
  // ==========================================================================

  /**
   * Returns a live cell by its OutPoint.
   *
   * "Live" means the cell exists in the current UTXO set — it has been
   * created by a transaction output but not yet consumed as an input.
   *
   * Returns a LiveCell object. If the cell does not exist or has already
   * been spent, the status will be "dead" or "unknown".
   *
   * @param outPoint - The OutPoint identifying the cell
   * @param withData - Whether to include the cell's data field in the response
   *
   * The return type includes a status field:
   *   - "live":    cell exists and is unspent
   *   - "dead":    cell was spent (consumed as input)
   *   - "unknown": cell not found (may not exist or node not fully synced)
   */
  async getLiveCell(
    outPoint: OutPoint,
    withData: boolean = true
  ): Promise<{ cell: LiveCell; status: "live" | "dead" | "unknown" }> {
    return this.call("get_live_cell", [outPoint, withData]);
  }

  /**
   * Returns the total capacity (in shannons) held by all live cells matching
   * a given lock script.
   *
   * This is the most efficient way to check an address balance because
   * the node computes the sum server-side — you do not need to fetch
   * individual cells.
   *
   * Requires the CKB indexer to be enabled on the node.
   *
   * @param searchKey - The lock script to query (or type script for token balances)
   */
  async getCellsCapacity(searchKey: SearchKey): Promise<CellsCapacity> {
    return this.call<CellsCapacity>("get_cells_capacity", [searchKey]);
  }

  // ==========================================================================
  // POOL (MEMPOOL) METHODS
  // ==========================================================================

  /**
   * Returns current mempool statistics.
   *
   * The CKB transaction pool (txpool) holds pending and proposed transactions.
   * This gives you:
   *   - total_tx_size: bytes of all transactions
   *   - total_tx_cycles: compute cycles required
   *   - min_fee_rate: minimum fee per 1000 bytes accepted
   *   - last_txs_updated_at: timestamp of last mempool change
   */
  async getTxPoolInfo(): Promise<{
    min_fee_rate: HexUint64;
    min_rbf_rate: HexUint64;
    max_tx_pool_size: HexUint64;
    orphan: HexUint64;
    pending: HexUint64;
    proposed: HexUint64;
    total_tx_cycles: HexUint64;
    total_tx_size: HexUint64;
    tx_size_limit: HexUint64;
    last_txs_updated_at: HexUint64;
  }> {
    return this.call("get_raw_tx_pool", ["false"]);
  }

  // ==========================================================================
  // NET METHODS (local node only)
  // ==========================================================================

  /**
   * Returns information about the local CKB node.
   *
   * NOTE: This method only works on a locally-running CKB node.
   * Public RPC endpoints typically disable this for privacy/security reasons.
   *
   * Useful for:
   *   - Checking which chain the node is on
   *   - Verifying the node version
   *   - Counting active connections
   */
  async getLocalNodeInfo(): Promise<LocalNodeInfo> {
    return this.call<LocalNodeInfo>("local_node_info");
  }

  /**
   * Returns a list of currently connected peer nodes.
   *
   * NOTE: This method only works on a locally-running CKB node.
   * Public RPC endpoints typically disable this.
   *
   * Useful for monitoring P2P network health and peer connectivity.
   */
  async getPeers(): Promise<RemoteNode[]> {
    return this.call<RemoteNode[]>("get_peers");
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Converts a hex-encoded uint64 string (with 0x prefix) to a JavaScript BigInt.
 *
 * CKB uses hex strings for all uint64 values in JSON-RPC responses
 * because JSON numbers cannot safely represent 64-bit integers.
 *
 * @param hex - A hex string like "0x174876e800"
 * @returns The corresponding BigInt value
 */
export function hexToBI(hex: HexUint64): bigint {
  return BigInt(hex);
}

/**
 * Converts a BigInt to a hex-encoded uint64 string (with 0x prefix).
 * Used when building RPC request parameters.
 */
export function biToHex(value: bigint): HexUint64 {
  return `0x${value.toString(16)}`;
}

/**
 * Converts a decimal block number to the hex string format required by RPC methods.
 *
 * @param blockNumber - A decimal block number (e.g., 1000)
 * @returns Hex string like "0x3e8"
 */
export function blockNumToHex(blockNumber: number): HexUint64 {
  return `0x${blockNumber.toString(16)}`;
}

/**
 * Formats a hex-encoded millisecond timestamp as a human-readable date string.
 *
 * CKB block timestamps are Unix timestamps in MILLISECONDS (not seconds),
 * stored as hex uint64.
 *
 * @param hexMs - Timestamp in milliseconds (hex string with 0x prefix)
 * @returns ISO date string
 */
export function formatTimestamp(hexMs: HexUint64): string {
  const ms = Number(hexToBI(hexMs));
  return new Date(ms).toISOString();
}

/**
 * Converts shannons (hex) to CKB (decimal string, 8 decimal places).
 *
 * CKB uses shannons as its smallest unit: 1 CKB = 100,000,000 shannons.
 *
 * @param hexShannons - Capacity in shannons (hex uint64)
 * @returns Formatted string like "100.00000000 CKB"
 */
export function shannonsToCkb(hexShannons: HexUint64): string {
  const shannons = hexToBI(hexShannons);
  const ckb = Number(shannons) / 1e8;
  return `${ckb.toFixed(8)} CKB`;
}
