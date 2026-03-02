/**
 * ============================================================================
 * Lesson 22: Token DEX - Helper Functions
 * ============================================================================
 *
 * This file contains the core data structures and helper functions used
 * throughout the DEX demonstration. Each function is documented in detail
 * to explain not just *what* it does but *why* it works this way on CKB.
 *
 * ARCHITECTURE OVERVIEW
 * =====================
 * A DEX (Decentralized Exchange) on CKB uses the "order cell" pattern.
 * An order cell is a live cell on chain that encodes:
 *   - What the maker wants to give  (CKB capacity locked in the cell)
 *   - What the maker wants to receive (token amount encoded in cell data)
 *   - Who placed the order (maker address encoded in cell args)
 *   - Which token is involved (the type script of the token cell)
 *
 * The cell's LOCK SCRIPT is the DEX order lock. Instead of a standard
 * owner signature, it enforces the exchange rules: anyone can unlock this
 * cell as long as they send the correct amount of tokens back to the maker.
 *
 * This is the core insight of UTXO-based DEXes: the "smart contract" logic
 * lives in the lock script, not in a separate contract account.
 * ============================================================================
 */

// ============================================================================
// SECTION 1: Order Cell Data Structures
// ============================================================================

/**
 * Represents the state of a DEX order on chain.
 *
 * On CKB, this data is encoded in the order cell like this:
 *
 *   Cell layout:
 *   ┌─────────────────────────────────────────┐
 *   │ capacity   : u64 (8 bytes)               │  <- CKB the maker is selling
 *   │ lock_script: OrderLock                   │  <- DEX lock with maker addr
 *   │   code_hash: [u8; 32] (32 bytes)         │
 *   │   hash_type: u8 (1 byte)                 │
 *   │   args     : maker_address (20 bytes)    │  <- blake160 of maker pubkey
 *   │             + token_type_hash (32 bytes) │  <- which token to receive
 *   │             + min_token_amount (16 bytes)│  <- minimum tokens to receive
 *   │ type_script: None                        │  <- order cells have no type
 *   │ data       : order_metadata (variable)   │  <- optional extra metadata
 *   └─────────────────────────────────────────┘
 *
 * The lock script's args encode ALL the exchange parameters, so the lock
 * script code itself is stateless and can be shared across all orders.
 * This is a key design principle: parameterize via args, share code.
 */
export interface OrderCell {
  /** Unique identifier for this order (the outpoint: txHash + index) */
  id: string;

  /** Who placed the order - their CKB address */
  makerAddress: string;

  /** Amount of CKB (in shannons) the maker is willing to sell */
  ckbAmount: bigint;

  /** The token type script code hash - identifies which token this order is for */
  tokenTypeHash: string;

  /** Minimum amount of tokens the maker wants to receive */
  minTokenAmount: bigint;

  /** How many tokens this order has already received (for partial fills) */
  filledTokenAmount: bigint;

  /** Current status of the order */
  status: "open" | "partially_filled" | "filled" | "canceled";

  /** Block number when the order was placed */
  createdAtBlock: bigint;
}

/**
 * Parameters needed to create a new order.
 * The maker specifies what they give (CKB) and what they want (tokens).
 */
export interface CreateOrderParams {
  makerAddress: string;
  ckbToSell: bigint;       // In shannons (1 CKB = 100_000_000 shannons)
  tokenTypeHash: string;   // Which token to receive
  minTokensToReceive: bigint;
}

/**
 * Parameters needed to fill (take) an existing order.
 * The taker provides tokens and receives CKB.
 */
export interface FillOrderParams {
  orderId: string;
  takerAddress: string;
  tokenAmountToProvide: bigint;  // Must be >= order's minTokenAmount
}

/**
 * Result of a fill operation, showing what each party received.
 */
export interface FillResult {
  success: boolean;
  makerReceivedTokens: bigint;
  takerReceivedCkb: bigint;
  isPartialFill: boolean;
  remainingCkb: bigint;
}

// ============================================================================
// SECTION 2: Encoding and Decoding Order Data
// ============================================================================

/**
 * Encodes order parameters into the format stored in cell args.
 *
 * WHY ENCODE IN ARGS (not data)?
 * ================================
 * The lock script has access to its own args field at zero cost - no extra
 * syscalls needed. The args are committed to when the cell is created and
 * cannot be changed. Encoding trade parameters here means:
 *   1. The lock script can read them cheaply
 *   2. Anyone scanning the chain can find orders without executing code
 *   3. The parameters are immutable (no bait-and-switch attacks)
 *
 * Encoding format (little-endian):
 *   [0..20]  = maker_blake160 (20 bytes)  - who gets the tokens
 *   [20..52] = token_type_hash (32 bytes) - which token
 *   [52..68] = min_token_amount (16 bytes) - uint128 LE
 *
 * @param order - The order parameters to encode
 * @returns Hex string of the encoded args
 */
export function encodeOrderArgs(order: CreateOrderParams): string {
  // In a real implementation, we would:
  // 1. Parse the maker address to extract the blake160 hash (20 bytes)
  // 2. Append the token type hash (32 bytes)
  // 3. Encode the min token amount as uint128 little-endian (16 bytes)
  // Total: 68 bytes of args

  // For this educational demo, we return a descriptive placeholder
  const makerHash = order.makerAddress.slice(0, 42); // Simulate 20-byte hash
  const minAmount = order.minTokensToReceive.toString(16).padStart(32, "0");
  return `0x${makerHash.replace("0x", "")}${order.tokenTypeHash.replace("0x", "")}${minAmount}`;
}

/**
 * Decodes order args back into structured order data.
 * This is what a taker (or indexer) does to read existing orders.
 *
 * @param args - Hex-encoded cell args from an order cell
 * @returns Decoded order parameters
 */
export function decodeOrderArgs(args: string): {
  makerBlake160: string;
  tokenTypeHash: string;
  minTokenAmount: bigint;
} {
  const bytes = args.replace("0x", "");

  // First 40 hex chars = 20 bytes = maker blake160 hash
  const makerBlake160 = "0x" + bytes.slice(0, 40);

  // Next 64 hex chars = 32 bytes = token type hash
  const tokenTypeHash = "0x" + bytes.slice(40, 104);

  // Next 32 hex chars = 16 bytes = uint128 min token amount (little-endian)
  const minTokenAmountHex = bytes.slice(104, 136);
  // Convert from little-endian hex to BigInt
  const minTokenAmount = BigInt("0x" + reverseHex(minTokenAmountHex));

  return { makerBlake160, tokenTypeHash, minTokenAmount };
}

/**
 * Reverses a hex string byte-by-byte (for little-endian conversion).
 *
 * CKB stores multi-byte integers in little-endian format, following the
 * RISC-V convention. To convert a little-endian hex value to a BigInt,
 * we reverse the bytes before parsing.
 *
 * @param hex - Hex string to reverse (must have even length)
 * @returns Reversed hex string
 */
export function reverseHex(hex: string): string {
  const bytes = hex.match(/.{1,2}/g) ?? [];
  return bytes.reverse().join("");
}

// ============================================================================
// SECTION 3: Exchange Rate Calculations
// ============================================================================

/**
 * Calculates the exchange rate for an order.
 *
 * Rate = CKB amount / Token amount
 * This tells you how many CKB you get per token (or must pay per token).
 *
 * WHY BIGINT?
 * ===========
 * Token amounts and CKB amounts are stored as 128-bit unsigned integers
 * on CKB. JavaScript's regular `number` type only has 53 bits of precision
 * (IEEE 754 double), which means values above ~9 quadrillion would lose
 * precision. BigInt handles arbitrary precision integers safely.
 *
 * @param ckbAmount - Amount of CKB in shannons
 * @param tokenAmount - Amount of tokens (in token's smallest unit)
 * @returns Rate as a string with 8 decimal places
 */
export function calculateExchangeRate(
  ckbAmount: bigint,
  tokenAmount: bigint
): string {
  if (tokenAmount === 0n) return "N/A";

  // Multiply by 1e8 first to get 8 decimal places of precision
  const rateScaled = (ckbAmount * 100_000_000n) / tokenAmount;
  const whole = rateScaled / 100_000_000n;
  const fraction = rateScaled % 100_000_000n;

  return `${whole}.${fraction.toString().padStart(8, "0")} shannons/token`;
}

/**
 * Calculates how many CKB a taker receives for providing a given amount of tokens.
 *
 * For a FULL fill: taker provides all the tokens, receives all the CKB.
 * For a PARTIAL fill: taker provides some tokens, receives proportional CKB.
 *
 * PARTIAL FILL MATH
 * =================
 * Given:
 *   - total_ckb  = total CKB in the order
 *   - min_tokens = minimum tokens the maker wants
 *   - provided   = tokens the taker is providing
 *
 * CKB to release = (provided / min_tokens) * total_ckb
 *
 * We use integer math to avoid floating point errors:
 *   ckb_to_release = (provided * total_ckb) / min_tokens
 *
 * The remaining CKB stays locked in a NEW order cell (same terms, less CKB).
 * This is how partial fills work in a UTXO DEX - each fill creates a new
 * "remainder" order cell.
 *
 * @param order - The order being filled
 * @param tokensProvided - How many tokens the taker is sending
 * @returns CKB amount to release to the taker
 */
export function calculateCkbToRelease(
  order: OrderCell,
  tokensProvided: bigint
): bigint {
  if (tokensProvided >= order.minTokenAmount) {
    // Full fill: taker provides enough tokens for the entire order
    return order.ckbAmount;
  }

  // Partial fill: proportional calculation
  // Use multiplication before division to preserve precision
  return (tokensProvided * order.ckbAmount) / order.minTokenAmount;
}

// ============================================================================
// SECTION 4: Order Validation
// ============================================================================

/**
 * Validates that an order can be created with the given parameters.
 *
 * MINIMUM CAPACITY REQUIREMENTS
 * ==============================
 * Every cell needs enough CKB to cover its storage cost:
 *   - capacity field:     8 bytes
 *   - lock script:       ~65 bytes (DEX lock with 68-byte args)
 *   - type script:        0 bytes (order cells have no type script)
 *   - data field:         0-32 bytes (minimal metadata)
 *   Minimum:             ~141 bytes = 141 CKB = 14,100,000,000 shannons
 *
 * In practice, the DEX protocol reserves some CKB as the "order cell rent"
 * to ensure the remainder order cell (for partial fills) can always exist.
 *
 * @param params - Parameters of the order to validate
 * @returns Validation result with any error messages
 */
export function validateOrderParams(params: CreateOrderParams): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const SHANNONS_PER_CKB = 100_000_000n;

  // Minimum: 200 CKB to cover cell storage + partial fill remainder
  const MIN_ORDER_CKB = 200n * SHANNONS_PER_CKB;

  if (params.ckbToSell < MIN_ORDER_CKB) {
    errors.push(
      `Order must sell at least 200 CKB (got ${params.ckbToSell / SHANNONS_PER_CKB} CKB). ` +
        `This covers the cell storage cost for both the order and any remainder cell.`
    );
  }

  if (params.minTokensToReceive <= 0n) {
    errors.push(
      `Must specify a positive token amount to receive (got ${params.minTokensToReceive})`
    );
  }

  if (!params.tokenTypeHash.startsWith("0x") || params.tokenTypeHash.length !== 66) {
    errors.push(
      `Token type hash must be a 32-byte hex string starting with 0x (got "${params.tokenTypeHash}")`
    );
  }

  if (!params.makerAddress) {
    errors.push("Maker address is required");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates that a fill operation satisfies the order's requirements.
 *
 * THE LOCK SCRIPT DOES THIS ON-CHAIN
 * ====================================
 * In the actual DEX, this validation is enforced by the order cell's lock
 * script running on CKB-VM. The lock script checks:
 *   1. The transaction has an output cell sending >= minTokenAmount tokens to maker
 *   2. The taker receives the proportional CKB from the order cell
 *   3. Any remaining CKB stays in a new order cell with identical args
 *
 * If ANY of these conditions fail, the transaction is rejected by all nodes.
 * This is the "atomic" guarantee: the exchange either happens completely
 * (per the rules), or not at all.
 *
 * @param order - The order being filled
 * @param tokensProvided - Amount of tokens the taker is providing
 * @returns Validation result
 */
export function validateFillParams(
  order: OrderCell,
  tokensProvided: bigint
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (order.status === "filled") {
    errors.push("Order is already completely filled");
  }

  if (order.status === "canceled") {
    errors.push("Order has been canceled by the maker");
  }

  if (tokensProvided <= 0n) {
    errors.push("Must provide a positive amount of tokens");
  }

  // For partial fills, check that the provided amount is a meaningful fraction
  // Most DEX protocols set a minimum fill size to prevent dust attacks
  const MIN_FILL_RATIO_DENOMINATOR = 100n; // At least 1% of the order
  const minFillAmount = order.minTokenAmount / MIN_FILL_RATIO_DENOMINATOR;
  if (tokensProvided < minFillAmount && tokensProvided < order.minTokenAmount) {
    errors.push(
      `Fill amount too small. Minimum fill is ${minFillAmount} tokens (1% of order). ` +
        `This prevents dust attacks that would leave tiny remainder cells on-chain.`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// SECTION 5: Display Utilities
// ============================================================================

/** Converts shannons (raw CKB units) to a human-readable CKB string */
export function formatCkb(shannons: bigint): string {
  const ckb = shannons / 100_000_000n;
  const remainder = shannons % 100_000_000n;
  if (remainder === 0n) {
    return `${ckb} CKB`;
  }
  return `${ckb}.${remainder.toString().padStart(8, "0").replace(/0+$/, "")} CKB`;
}

/** Formats a token amount with the given decimal places */
export function formatToken(amount: bigint, decimals: number = 8, symbol: string = "TOKEN"): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) {
    return `${whole} ${symbol}`;
  }
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")} ${symbol}`;
}

/** Prints a formatted order summary to the console */
export function printOrder(order: OrderCell): void {
  const statusEmoji = {
    open: "[OPEN]",
    partially_filled: "[PARTIAL]",
    filled: "[FILLED]",
    canceled: "[CANCELED]",
  }[order.status];

  console.log(`  Order ${order.id.slice(0, 16)}...`);
  console.log(`    Status:    ${statusEmoji} ${order.status}`);
  console.log(`    Maker:     ${order.makerAddress}`);
  console.log(`    Selling:   ${formatCkb(order.ckbAmount)}`);
  console.log(`    Wants:     ${formatToken(order.minTokenAmount)} of token ${order.tokenTypeHash.slice(0, 14)}...`);
  console.log(`    Filled:    ${formatToken(order.filledTokenAmount)}`);
  console.log(
    `    Rate:      ${calculateExchangeRate(order.ckbAmount, order.minTokenAmount)}`
  );
  console.log(`    Created:   Block #${order.createdAtBlock}`);
}
