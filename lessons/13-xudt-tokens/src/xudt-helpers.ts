/**
 * xudt-helpers.ts
 * ================
 * Helper functions for working with xUDT (extensible User Defined Token) on CKB.
 *
 * xUDT is the standard fungible token protocol on CKB. It is defined in:
 *   RFC-0052: https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md
 *
 * Key concepts:
 *   - Token identity: uniquely determined by the xUDT type script (code_hash + hash_type + args)
 *   - Token amount: stored as a little-endian uint128 in the first 16 bytes of cell data
 *   - Owner: determined by the cell's lock script (first-class asset ownership)
 *   - Extensions: xUDT args can reference additional "extension scripts" for custom validation
 */

// ---------------------------------------------------------------------------
// TYPE DEFINITIONS
// ---------------------------------------------------------------------------

/**
 * Represents a CKB Script (lock or type).
 * Every CKB script has exactly three fields that together determine its identity.
 */
export interface Script {
  /** 32-byte hash identifying which on-chain program to run */
  codeHash: string;
  /** How to interpret codeHash: "data" | "data1" | "data2" | "type" */
  hashType: "data" | "data1" | "data2" | "type";
  /** Arbitrary arguments passed to the script; for xUDT this encodes owner lock hash + flags */
  args: string;
}

/**
 * Represents a CKB OutPoint — a pointer to a specific cell output.
 * Used to reference cells when building transactions.
 */
export interface OutPoint {
  txHash: string;
  index: number;
}

/**
 * Represents a CKB cell — the fundamental storage unit.
 *
 * xUDT token cells have this structure:
 *   - capacity: CKB Shannon to cover storage cost (at least 142 CKBytes for a token cell)
 *   - data:     uint128 LE amount (first 16 bytes) + optional extension data
 *   - lock:     owner's lock script (e.g. secp256k1-blake160)
 *   - type:     xUDT type script (identifies the token and enforces rules)
 */
export interface Cell {
  outPoint: OutPoint;
  capacity: bigint;     // in Shannon (1 CKByte = 100_000_000 Shannon)
  data: string;         // hex-encoded bytes
  lock: Script;
  type?: Script;        // undefined for plain CKB cells; set to xUDT script for token cells
}

/**
 * A decoded xUDT token cell with the amount parsed out.
 */
export interface XudtCell {
  cell: Cell;
  tokenAmount: bigint;  // parsed from cell.data little-endian uint128
}

/**
 * Parameters for issuing (minting) a new xUDT token.
 */
export interface IssueTokenParams {
  /** The issuer's lock script — its hash becomes part of the token type script args */
  issuerLock: Script;
  /** Total initial supply to mint (in the token's smallest unit) */
  initialSupply: bigint;
  /**
   * xUDT flags byte (1 byte, LE uint8):
   *   0x00 = no extension (pure xUDT, same as sUDT)
   *   0x01 = extension by type script hash (lock extension)
   *   0x02 = extension by data hash
   * Most tokens use 0x00 for simplicity.
   */
  flags?: number;
}

/**
 * Parameters for transferring xUDT tokens between addresses.
 */
export interface TransferTokenParams {
  /** The xUDT type script — identifies which token to transfer */
  tokenTypeScript: Script;
  /** Amount to send in token units */
  amount: bigint;
  /** Recipient lock script (defines who can spend the output token cell) */
  recipientLock: Script;
}

// ---------------------------------------------------------------------------
// AMOUNT ENCODING / DECODING
// ---------------------------------------------------------------------------

/**
 * Encode a token amount as a 16-byte little-endian uint128 hex string.
 *
 * xUDT stores amounts as little-endian uint128. This is the same format as
 * sUDT (RFC-0025). Little-endian means the least-significant byte comes first.
 *
 * Example: 1000 tokens (0x3E8) → "e803000000000000 0000000000000000"
 *
 * @param amount - Token amount as a BigInt
 * @returns Hex string (no "0x" prefix) representing 16 bytes LE
 */
export function encodeAmount(amount: bigint): string {
  if (amount < 0n) {
    throw new Error("Token amount cannot be negative");
  }
  if (amount > 2n ** 128n - 1n) {
    throw new Error("Token amount exceeds uint128 maximum");
  }

  // Build 16 bytes little-endian
  const bytes = new Uint8Array(16);
  let remaining = amount;
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Decode a token amount from a 16-byte little-endian uint128 hex string.
 *
 * The cell data field may be longer than 16 bytes if the xUDT extension
 * stores additional data. We always read the first 16 bytes as the amount.
 *
 * @param hexData - Hex string of cell data (without "0x" prefix)
 * @returns Token amount as BigInt
 */
export function decodeAmount(hexData: string): bigint {
  // Strip optional "0x" prefix
  const data = hexData.startsWith("0x") ? hexData.slice(2) : hexData;

  if (data.length < 32) {
    throw new Error(
      `Cell data too short to contain a uint128 amount: got ${data.length / 2} bytes, need 16`
    );
  }

  // Read first 16 bytes as little-endian uint128
  let amount = 0n;
  for (let i = 0; i < 16; i++) {
    const byte = BigInt(parseInt(data.slice(i * 2, i * 2 + 2), 16));
    amount |= byte << BigInt(i * 8);
  }

  return amount;
}

// ---------------------------------------------------------------------------
// TOKEN TYPE SCRIPT CONSTRUCTION
// ---------------------------------------------------------------------------

/**
 * Build the xUDT type script args for a new token.
 *
 * xUDT type script args layout:
 *   [0..32)  = owner lock script hash (blake2b of the serialized lock script)
 *   [32]     = flags byte (uint8):
 *                0x00 = no extension
 *                0x01 = extension scripts referenced by type hash
 *                0x02 = extension scripts referenced by data hash
 *   [33..)   = optional extension script args (if flags != 0x00)
 *
 * The owner lock hash is what makes each token type globally unique.
 * Even if two issuers deploy the same xUDT code, their tokens have different
 * type scripts because their lock hashes differ.
 *
 * @param ownerLockHash - 32-byte blake2b hash of the issuer's lock script (hex, no "0x")
 * @param flags - Extension flags byte (default 0x00)
 * @param extensionArgs - Optional additional args for extension scripts
 * @returns Complete args string (hex, no "0x") for the xUDT type script
 */
export function buildXudtTypeArgs(
  ownerLockHash: string,
  flags: number = 0x00,
  extensionArgs: string = ""
): string {
  const lockHash = ownerLockHash.startsWith("0x")
    ? ownerLockHash.slice(2)
    : ownerLockHash;

  if (lockHash.length !== 64) {
    throw new Error(
      `Owner lock hash must be 32 bytes (64 hex chars), got ${lockHash.length / 2} bytes`
    );
  }

  const flagsByte = flags.toString(16).padStart(2, "0");
  return lockHash + flagsByte + extensionArgs;
}

/**
 * Build a complete xUDT type script object.
 *
 * The xUDT script is deployed on CKB mainnet and testnet with known code hashes.
 * Using hash_type "type" means we reference the deployment by its stable type script,
 * allowing future upgrades without breaking existing tokens.
 *
 * Testnet xUDT code hash (hash_type: "data1"):
 *   0x50bd8d6680b8b9cf98b73f3c08faf8b9a21c7a8d425eb81f62c5b2c2c9bef4cd
 *
 * @param ownerLockHash - 32-byte blake2b hash of issuer's lock script (hex)
 * @param flags - Extension flags (default 0x00)
 * @returns A Script object representing the xUDT type script
 */
export function buildXudtTypeScript(
  ownerLockHash: string,
  flags: number = 0x00
): Script {
  // xUDT code hash on CKB testnet (Pudge testnet)
  // This is the hash of the xUDT script binary stored in a live cell on testnet.
  const XUDT_CODE_HASH =
    "0x50bd8d6680b8b9cf98b73f3c08faf8b9a21c7a8d425eb81f62c5b2c2c9bef4cd";

  return {
    codeHash: XUDT_CODE_HASH,
    hashType: "data1", // data1 = VM v1, pinned to exact binary
    args: "0x" + buildXudtTypeArgs(ownerLockHash, flags),
  };
}

// ---------------------------------------------------------------------------
// CAPACITY CALCULATION
// ---------------------------------------------------------------------------

/**
 * Calculate the minimum CKByte capacity required for an xUDT token cell.
 *
 * CKB requires every cell to have enough capacity to store its own data.
 * The formula is:
 *   capacity >= (lock_size + type_size + data_size + 8) bytes × 10^8 Shannon
 *
 * Where:
 *   8 bytes   = capacity field itself
 *   lock_size = serialized lock script size (code_hash=32 + hash_type=1 + args length + 4 overhead)
 *   type_size = serialized type script size (same structure as lock)
 *   data_size = 16 bytes for uint128 amount
 *
 * For a typical secp256k1-blake160 lock (args = 20 bytes) and xUDT type (args = 33 bytes):
 *   lock  = 32 + 1 + 20 + 4 = 57 bytes
 *   type  = 32 + 1 + 33 + 4 = 70 bytes
 *   data  = 16 bytes
 *   total = 57 + 70 + 16 + 8 = 151 bytes → 151 CKBytes minimum
 *
 * We use 200 CKBytes as a safe default with extra headroom.
 *
 * @param lockArgsLength - Length of lock script args in bytes (default 20 for secp256k1-blake160)
 * @param typeArgsLength - Length of type script args in bytes (default 33 for xUDT)
 * @param dataLength - Length of cell data in bytes (default 16 for uint128 amount)
 * @returns Minimum capacity in Shannon (BigInt)
 */
export function calculateMinCapacity(
  lockArgsLength: number = 20,
  typeArgsLength: number = 33,
  dataLength: number = 16
): bigint {
  const CKB = 100_000_000n; // 1 CKByte = 10^8 Shannon

  // Each script field overhead: 4 bytes molecule header
  const SCRIPT_OVERHEAD = 4;
  // code_hash (32) + hash_type (1) = 33 fixed bytes per script
  const SCRIPT_FIXED = 33;

  const lockSize = SCRIPT_FIXED + SCRIPT_OVERHEAD + lockArgsLength;
  const typeSize = SCRIPT_FIXED + SCRIPT_OVERHEAD + typeArgsLength;
  const capacityFieldSize = 8; // uint64 stored as 8 bytes in the cell

  const totalBytes = lockSize + typeSize + dataLength + capacityFieldSize;

  return BigInt(totalBytes) * CKB;
}

// ---------------------------------------------------------------------------
// BALANCE CALCULATION
// ---------------------------------------------------------------------------

/**
 * Sum the token amounts across a list of xUDT cells.
 *
 * Used to check balances and verify that input amounts >= output amounts
 * (with any excess going back to the sender as change).
 *
 * In xUDT, conservation is enforced by the type script:
 *   sum(input token amounts) >= sum(output token amounts)
 * Any excess simply disappears — there is no "overflow" because tokens
 * can only be destroyed by the owner (who controls the lock script).
 *
 * @param cells - Array of decoded xUDT cells
 * @returns Total token amount as BigInt
 */
export function sumTokenAmounts(cells: XudtCell[]): bigint {
  return cells.reduce((acc, cell) => acc + cell.tokenAmount, 0n);
}

/**
 * Filter cells to find only those matching a specific xUDT type script.
 *
 * Token identity is determined by the COMPLETE type script:
 *   { codeHash, hashType, args }
 * Two cells have the same token type only if all three fields match exactly.
 *
 * @param cells - All cells to search through
 * @param typeScript - The xUDT type script identifying the target token
 * @returns Only cells that carry this specific token
 */
export function filterTokenCells(cells: Cell[], typeScript: Script): Cell[] {
  return cells.filter(
    (cell) =>
      cell.type !== undefined &&
      cell.type.codeHash.toLowerCase() === typeScript.codeHash.toLowerCase() &&
      cell.type.hashType === typeScript.hashType &&
      cell.type.args.toLowerCase() === typeScript.args.toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// TRANSACTION BALANCE VERIFICATION
// ---------------------------------------------------------------------------

/**
 * Verify that a token transfer transaction is balanced.
 *
 * xUDT's on-chain validation ensures:
 *   sum(input token amounts) == sum(output token amounts)
 *
 * This off-chain check catches errors before broadcasting to the network,
 * saving time and transaction fees.
 *
 * @param inputCells - Token cells being consumed
 * @param outputAmounts - Array of output token amounts (one per output cell)
 * @returns { balanced: boolean, inputTotal: bigint, outputTotal: bigint, difference: bigint }
 */
export function verifyTransferBalance(
  inputCells: XudtCell[],
  outputAmounts: bigint[]
): {
  balanced: boolean;
  inputTotal: bigint;
  outputTotal: bigint;
  difference: bigint;
} {
  const inputTotal = sumTokenAmounts(inputCells);
  const outputTotal = outputAmounts.reduce((acc, amt) => acc + amt, 0n);
  const difference = inputTotal - outputTotal;

  return {
    balanced: difference === 0n,
    inputTotal,
    outputTotal,
    difference,
  };
}

// ---------------------------------------------------------------------------
// DISPLAY UTILITIES
// ---------------------------------------------------------------------------

/**
 * Format a token amount with optional decimal places for display.
 *
 * Unlike ERC-20 where decimals are stored in the contract, xUDT has no
 * built-in decimal concept. Decimals are purely a UI/UX convention.
 * Off-chain tools (wallets, explorers) look up the token's metadata
 * (often stored in a separate on-chain registry or off-chain database)
 * to determine how many decimals to display.
 *
 * @param amount - Raw token amount in smallest units
 * @param decimals - Number of decimal places (default 8, like CKB itself)
 * @param symbol - Token symbol for display (optional)
 * @returns Human-readable amount string
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number = 8,
  symbol: string = "TOKEN"
): string {
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  const fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, ""); // trim trailing zeros

  const display =
    fractionalStr.length > 0
      ? `${integerPart}.${fractionalStr}`
      : `${integerPart}`;

  return `${display} ${symbol}`;
}

/**
 * Format CKByte capacity from Shannon for display.
 *
 * @param shannon - Amount in Shannon (1 CKByte = 100,000,000 Shannon)
 * @returns Human-readable CKByte string
 */
export function formatCKB(shannon: bigint): string {
  const ckb = shannon / 100_000_000n;
  const remainder = shannon % 100_000_000n;
  if (remainder === 0n) {
    return `${ckb} CKB`;
  }
  const decimalStr = remainder.toString().padStart(8, "0").replace(/0+$/, "");
  return `${ckb}.${decimalStr} CKB`;
}

/**
 * Truncate a hex string for display (show first and last N characters).
 *
 * @param hex - Full hex string (with or without "0x" prefix)
 * @param chars - Number of characters to show on each side (default 8)
 * @returns Truncated string like "0x1234...abcd"
 */
export function truncateHex(hex: string, chars: number = 8): string {
  const h = hex.startsWith("0x") ? hex : "0x" + hex;
  if (h.length <= chars * 2 + 2) return h;
  return `${h.slice(0, chars + 2)}...${h.slice(-chars)}`;
}

/**
 * Print a formatted summary of an xUDT cell for debugging/display.
 *
 * @param xudtCell - Decoded xUDT cell to display
 * @param decimals - Token decimals for amount display
 * @param symbol - Token symbol
 */
export function printXudtCell(
  xudtCell: XudtCell,
  decimals: number = 8,
  symbol: string = "TOKEN"
): void {
  const { cell, tokenAmount } = xudtCell;
  console.log("  xUDT Cell:");
  console.log(
    `    outPoint:    ${truncateHex(cell.outPoint.txHash)}:${cell.outPoint.index}`
  );
  console.log(`    capacity:    ${formatCKB(cell.capacity)}`);
  console.log(
    `    tokenAmount: ${formatTokenAmount(tokenAmount, decimals, symbol)}`
  );
  console.log(`    lock:        ${truncateHex(cell.lock.args)} (owner)`);
  if (cell.type) {
    console.log(`    type.args:   ${truncateHex(cell.type.args)} (token ID)`);
  }
}

// ---------------------------------------------------------------------------
// xUDT vs sUDT COMPARISON UTILITIES
// ---------------------------------------------------------------------------

/**
 * Print a side-by-side comparison of xUDT and sUDT standards.
 *
 * sUDT (Simple UDT, RFC-0025) was the first CKB token standard.
 * xUDT (Extensible UDT, RFC-0052) is the evolution that adds:
 *   1. Extension scripts: custom validation logic without forking the token
 *   2. Owner mode: special privileges for the token owner during operations
 *   3. Compatibility: xUDT is a superset of sUDT (flags=0x00 behaves identically)
 */
export function printUdtComparison(): void {
  console.log("\n  sUDT vs xUDT Comparison:");
  console.log("  " + "=".repeat(70));
  const rows = [
    ["Feature", "sUDT (RFC-0025)", "xUDT (RFC-0052)"],
    ["---", "---", "---"],
    ["Type args", "owner lock hash (32 bytes)", "lock hash + flags + ext args"],
    ["Extension scripts", "Not supported", "Supported (flags byte)"],
    ["Owner mode", "No", "Yes (owner can bypass ext scripts)"],
    ["Backwards compat", "N/A", "flags=0x00 behaves like sUDT"],
    ["Amount format", "uint128 LE (16 bytes)", "uint128 LE (16 bytes) [same]"],
    ["Conservation rule", "sum(in) == sum(out)", "sum(in) == sum(out) [same]"],
    ["Use case", "Simple tokens", "Tokens needing custom logic"],
  ];

  for (const row of rows) {
    if (row[0] === "---") {
      console.log("  " + "-".repeat(70));
      continue;
    }
    console.log(
      `  ${row[0].padEnd(22)} ${row[1].padEnd(26)} ${row[2]}`
    );
  }
  console.log("  " + "=".repeat(70));
}
