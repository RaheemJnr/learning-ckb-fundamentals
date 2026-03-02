/**
 * utils.ts — Helper functions for formatting and displaying cell information.
 *
 * This module provides reusable formatting utilities used throughout the
 * Cell Explorer CLI application. These helpers convert raw blockchain data
 * (large numbers, hex strings, script objects) into human-readable output.
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================================
// Constants
// ============================================================================

/**
 * 1 CKByte = 10^8 shannons (the smallest unit of CKB, like satoshis in Bitcoin).
 * We use this constant to convert between shannons and CKBytes for display.
 */
const SHANNONS_PER_CKB = 100_000_000n;

/**
 * ANSI color codes for terminal output formatting.
 * These make the CLI output easier to scan visually.
 */
const COLORS = {
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
// Capacity / CKByte Formatting
// ============================================================================

/**
 * Converts a capacity value in shannons to a human-readable CKByte string.
 *
 * CKB uses "shannons" as its smallest unit (like satoshis in Bitcoin).
 * 1 CKByte = 100,000,000 shannons (10^8).
 *
 * @param shannons - The capacity in shannons (bigint or number).
 * @returns A formatted string like "142.50000000 CKB".
 *
 * @example
 * formatCKB(14250000000n) // => "142.50000000 CKB"
 * formatCKB(6100000000n)  // => "61.00000000 CKB"
 */
export function formatCKB(shannons: bigint | number): string {
  const value = BigInt(shannons);
  const whole = value / SHANNONS_PER_CKB;
  const fractional = value % SHANNONS_PER_CKB;

  // Pad the fractional part to always show 8 decimal places
  const fractionalStr = fractional.toString().padStart(8, "0");
  return `${whole}.${fractionalStr} CKB`;
}

/**
 * Formats a shannons value as a compact string (fewer decimals for readability).
 *
 * @param shannons - The capacity in shannons.
 * @returns A compact string like "142.5 CKB".
 */
export function formatCKBCompact(shannons: bigint | number): string {
  const value = BigInt(shannons);
  const whole = value / SHANNONS_PER_CKB;
  const fractional = value % SHANNONS_PER_CKB;

  if (fractional === 0n) {
    return `${whole} CKB`;
  }

  // Remove trailing zeros for a compact display
  const fractionalStr = fractional.toString().padStart(8, "0").replace(/0+$/, "");
  return `${whole}.${fractionalStr} CKB`;
}

// ============================================================================
// Hex / Data Formatting
// ============================================================================

/**
 * Truncates a hex string to a readable length for terminal display.
 * Long hashes and data values can clutter the output — this keeps it tidy.
 *
 * @param hex - The full hex string (e.g., a 66-character tx hash).
 * @param maxLength - Maximum display length (default 20 chars + ellipsis).
 * @returns A truncated string like "0x1234abcd...ef56".
 */
export function truncateHex(hex: string, maxLength: number = 20): string {
  if (hex.length <= maxLength) return hex;
  const prefix = hex.slice(0, maxLength / 2 + 2); // keep "0x" + some chars
  const suffix = hex.slice(-maxLength / 2 + 2);
  return `${prefix}...${suffix}`;
}

/**
 * Formats a data field for display, showing the length and a preview.
 *
 * @param data - The hex-encoded output data from a cell.
 * @returns A descriptive string about the data contents.
 */
export function formatData(data: string): string {
  if (!data || data === "0x") {
    return `${COLORS.dim}(empty)${COLORS.reset}`;
  }

  // Each hex character after "0x" represents half a byte
  const byteLength = (data.length - 2) / 2;
  const preview = truncateHex(data, 30);
  return `${byteLength} bytes — ${preview}`;
}

// ============================================================================
// Script Formatting
// ============================================================================

/**
 * Formats a CKB Script object into a readable multi-line string.
 *
 * A Script on CKB has three fields:
 *   - codeHash: identifies which on-chain program to run
 *   - hashType: how the codeHash references the program ("type" | "data" | "data1" | "data2")
 *   - args: arguments passed to the script
 *
 * @param script - A CKB Script object or null/undefined.
 * @param indent - Number of spaces for indentation (default 4).
 * @returns A formatted multi-line string.
 */
export function formatScript(
  script: { codeHash: string; hashType: string; args: string } | null | undefined,
  indent: number = 4
): string {
  if (!script) {
    return `${" ".repeat(indent)}${COLORS.dim}(none)${COLORS.reset}`;
  }

  const pad = " ".repeat(indent);
  return [
    `${pad}code_hash: ${COLORS.cyan}${truncateHex(script.codeHash, 28)}${COLORS.reset}`,
    `${pad}hash_type: ${COLORS.yellow}${script.hashType}${COLORS.reset}`,
    `${pad}args:      ${COLORS.magenta}${truncateHex(script.args, 28)}${COLORS.reset}`,
  ].join("\n");
}

// ============================================================================
// Cell Display
// ============================================================================

/**
 * Prints a single cell's detailed information to the console.
 *
 * This is the main display function for showing a cell found by the explorer.
 * It formats all four cell fields plus the OutPoint reference.
 *
 * @param cell - A CKB Cell object from the CCC SDK.
 * @param index - The sequential number for display.
 */
export function printCell(cell: ccc.Cell, index: number): void {
  const capacity = cell.cellOutput.capacity;
  const lockScript = cell.cellOutput.lock;
  const typeScript = cell.cellOutput.type;
  const data = cell.outputData;
  const outPoint = cell.outPoint;

  console.log(
    `\n${COLORS.bold}${COLORS.green}--- Cell #${index + 1} ---${COLORS.reset}`
  );

  // OutPoint: the unique reference to this cell (txHash:index)
  console.log(
    `  ${COLORS.bold}OutPoint:${COLORS.reset} ${truncateHex(outPoint.txHash, 24)}:${outPoint.index}`
  );

  // Capacity: both the CKByte value and the maximum storage size
  console.log(
    `  ${COLORS.bold}Capacity:${COLORS.reset} ${COLORS.green}${formatCKB(capacity)}${COLORS.reset} (${capacity.toString()} shannons)`
  );

  // Lock Script: determines ownership
  console.log(`  ${COLORS.bold}Lock Script:${COLORS.reset}`);
  console.log(formatScript(lockScript as any));

  // Type Script: optional validation rules
  console.log(`  ${COLORS.bold}Type Script:${COLORS.reset}`);
  console.log(formatScript(typeScript as any));

  // Data: arbitrary bytes stored in the cell
  console.log(
    `  ${COLORS.bold}Data:${COLORS.reset} ${formatData(data)}`
  );
}

/**
 * Prints a compact one-line summary of a cell (useful for list views).
 *
 * @param cell - A CKB Cell object.
 * @param index - The sequential number for display.
 */
export function printCellCompact(cell: ccc.Cell, index: number): void {
  const capacity = formatCKBCompact(cell.cellOutput.capacity);
  const hasType = cell.cellOutput.type ? "T" : "-";
  const hasData = cell.outputData && cell.outputData !== "0x" ? "D" : "-";
  const txHash = truncateHex(cell.outPoint.txHash, 16);

  console.log(
    `  ${COLORS.dim}${String(index + 1).padStart(3, " ")}.${COLORS.reset} ` +
    `${txHash}:${cell.outPoint.index} | ` +
    `${COLORS.green}${capacity.padEnd(20)}${COLORS.reset} | ` +
    `[${hasType}${hasData}]`
  );
}

// ============================================================================
// Statistics Display
// ============================================================================

/**
 * Prints collection statistics after iterating through cells.
 *
 * @param stats - An object with aggregated statistics.
 */
export function printStats(stats: {
  totalCells: number;
  totalCapacity: bigint;
  cellsWithType: number;
  cellsWithData: number;
  minCapacity: bigint;
  maxCapacity: bigint;
}): void {
  console.log(
    `\n${COLORS.bold}${COLORS.blue}========== Collection Statistics ==========${COLORS.reset}`
  );
  console.log(`  Total cells found:    ${COLORS.bold}${stats.totalCells}${COLORS.reset}`);
  console.log(`  Total capacity:       ${COLORS.green}${formatCKB(stats.totalCapacity)}${COLORS.reset}`);
  console.log(`  Cells with type script: ${stats.cellsWithType} (${percentage(stats.cellsWithType, stats.totalCells)})`);
  console.log(`  Cells with data:      ${stats.cellsWithData} (${percentage(stats.cellsWithData, stats.totalCells)})`);

  if (stats.totalCells > 0) {
    console.log(`  Min capacity:         ${COLORS.yellow}${formatCKB(stats.minCapacity)}${COLORS.reset}`);
    console.log(`  Max capacity:         ${COLORS.yellow}${formatCKB(stats.maxCapacity)}${COLORS.reset}`);
    const avgCapacity = stats.totalCapacity / BigInt(stats.totalCells);
    console.log(`  Avg capacity:         ${COLORS.yellow}${formatCKB(avgCapacity)}${COLORS.reset}`);
  }

  console.log(
    `${COLORS.bold}${COLORS.blue}===========================================${COLORS.reset}\n`
  );
}

// ============================================================================
// Section Headers
// ============================================================================

/**
 * Prints a prominent section header for organizing CLI output.
 *
 * @param title - The section title to display.
 */
export function printSection(title: string): void {
  console.log(
    `\n${COLORS.bold}${COLORS.cyan}${"=".repeat(50)}${COLORS.reset}`
  );
  console.log(
    `${COLORS.bold}${COLORS.cyan}  ${title}${COLORS.reset}`
  );
  console.log(
    `${COLORS.bold}${COLORS.cyan}${"=".repeat(50)}${COLORS.reset}`
  );
}

/**
 * Prints an informational message with a bullet point.
 *
 * @param message - The message to display.
 */
export function printInfo(message: string): void {
  console.log(`  ${COLORS.blue}>${COLORS.reset} ${message}`);
}

/**
 * Prints a warning message.
 *
 * @param message - The warning message to display.
 */
export function printWarning(message: string): void {
  console.log(`  ${COLORS.yellow}! ${message}${COLORS.reset}`);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculates a percentage string for display.
 *
 * @param part - The numerator.
 * @param total - The denominator.
 * @returns A string like "45.2%".
 */
function percentage(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

/**
 * Classifies a cell into a human-readable type based on its scripts and data.
 *
 * Cell types on CKB include:
 *   - "Plain CKB": no type script and no data — just holds CKBytes
 *   - "UDT Cell": has a type script matching known UDT patterns and 16+ bytes of data
 *   - "NFT / Spore Cell": has a type script with data (non-UDT pattern)
 *   - "Script Cell": has a type script but empty data (likely a governance or reference cell)
 *   - "Data Cell": no type script but stores data in the data field
 *
 * @param cell - A CKB Cell object.
 * @returns A string describing the cell's likely type.
 */
export function classifyCell(cell: ccc.Cell): string {
  const hasType = !!cell.cellOutput.type;
  const hasData = cell.outputData !== undefined && cell.outputData !== "0x";
  const dataByteLength = hasData ? (cell.outputData.length - 2) / 2 : 0;

  if (!hasType && !hasData) {
    return `${COLORS.green}Plain CKB${COLORS.reset}`;
  }

  if (!hasType && hasData) {
    return `${COLORS.magenta}Data Cell${COLORS.reset}`;
  }

  if (hasType && hasData) {
    // UDT cells typically store a 128-bit (16-byte) little-endian balance
    if (dataByteLength === 16) {
      return `${COLORS.yellow}UDT Cell (likely)${COLORS.reset}`;
    }
    // Cells with type script and arbitrary data could be NFTs, Spore, etc.
    return `${COLORS.cyan}Typed Data Cell${COLORS.reset}`;
  }

  // hasType && !hasData
  return `${COLORS.blue}Script Cell (no data)${COLORS.reset}`;
}

/**
 * Creates a separator line for visual grouping in terminal output.
 *
 * @param char - The character to use (default "-").
 * @param length - The line length (default 50).
 */
export function separator(char: string = "-", length: number = 50): void {
  console.log(`${COLORS.dim}${char.repeat(length)}${COLORS.reset}`);
}
