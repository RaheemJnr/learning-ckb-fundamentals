// ============================================================================
// molecule-types.ts — Hand-coded Molecule Helpers for TypeScript
// ============================================================================
//
// This module provides helper functions for encoding and decoding molecule
// data structures in TypeScript. In a real project, you would typically use
// a code generator (like @ckb-lumos/molecule or moleculec-es) to generate
// these from .mol schema files. Here, we implement them by hand so you can
// see exactly how molecule's binary format works at the byte level.
//
// Molecule binary format rules:
//   - All multi-byte integers are LITTLE-ENDIAN
//   - Structs/Arrays: no header, just concatenated fixed-size fields
//   - Vectors (FixVec): 4-byte item count + items
//   - Vectors (DynVec): 4-byte total size + 4-byte offsets per item + items
//   - Tables: 4-byte total size + 4-byte offset per field + field data
//   - Options: empty (0 bytes) for None, raw value for Some
//   - Unions: 4-byte item_id + value
//
// ============================================================================

// ============================================================================
// Low-level Utilities
// ============================================================================

/**
 * Convert a Uint8Array to a hex string prefixed with "0x".
 *
 * Example: bytesToHex(new Uint8Array([0xab, 0xcd])) => "0xabcd"
 */
export function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Convert a "0x"-prefixed hex string to a Uint8Array.
 *
 * Example: hexToBytes("0xabcd") => Uint8Array([0xab, 0xcd])
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Write a 32-bit unsigned integer in LITTLE-ENDIAN format into 4 bytes.
 *
 * Molecule uses little-endian exclusively for all multi-byte numbers.
 * This is important — CKB-VM runs on RISC-V which is also little-endian,
 * so there is no byte-swapping overhead.
 */
export function writeUint32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >> 8) & 0xff;
  buf[2] = (value >> 16) & 0xff;
  buf[3] = (value >> 24) & 0xff;
  return buf;
}

/**
 * Read a 32-bit unsigned integer from 4 bytes in LITTLE-ENDIAN format.
 */
export function readUint32LE(bytes: Uint8Array, offset: number = 0): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0; // >>> 0 ensures unsigned interpretation
}

/**
 * Write a 64-bit unsigned integer in LITTLE-ENDIAN format into 8 bytes.
 * Uses BigInt because JavaScript numbers lose precision above 2^53.
 */
export function writeUint64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }
  return buf;
}

/**
 * Read a 64-bit unsigned integer from 8 bytes in LITTLE-ENDIAN format.
 */
export function readUint64LE(bytes: Uint8Array, offset: number = 0): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

/**
 * Write a 128-bit unsigned integer in LITTLE-ENDIAN format into 16 bytes.
 * Used for UDT token balances and total supply values.
 */
export function writeUint128LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    buf[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }
  return buf;
}

/**
 * Read a 128-bit unsigned integer from 16 bytes in LITTLE-ENDIAN format.
 */
export function readUint128LE(bytes: Uint8Array, offset: number = 0): bigint {
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

// ============================================================================
// Byte32 — Fixed 32-byte Array
// ============================================================================
// Molecule: array Byte32 [byte; 32];
// Binary: exactly 32 bytes, no header

/**
 * Create a Byte32 from a hex string. Pads with zeros or truncates to 32 bytes.
 */
export function packByte32(hex: string): Uint8Array {
  const bytes = hexToBytes(hex);
  const result = new Uint8Array(32);
  result.set(bytes.slice(0, 32));
  return result;
}

/**
 * Create a Byte32 from a UTF-8 string. Right-pads with zeros to fill 32 bytes.
 * Used for the name and symbol fields in our TokenInfo struct.
 */
export function packByte32FromString(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  const result = new Uint8Array(32);
  result.set(encoded.slice(0, 32)); // Truncate if longer than 32 bytes
  return result;
}

/**
 * Read a Byte32 and convert to a trimmed UTF-8 string (strips trailing zeros).
 */
export function unpackByte32ToString(bytes: Uint8Array, offset: number = 0): string {
  const slice = bytes.slice(offset, offset + 32);
  // Find the last non-zero byte to trim padding
  let end = 32;
  while (end > 0 && slice[end - 1] === 0) end--;
  const decoder = new TextDecoder();
  return decoder.decode(slice.slice(0, end));
}

// ============================================================================
// TokenInfo — Fixed-size Struct (81 bytes)
// ============================================================================
// Molecule schema:
//   struct TokenInfo {
//       name:         Byte32,   // bytes 0..32
//       symbol:       Byte32,   // bytes 32..64
//       decimals:     byte,     // byte 64
//       total_supply: Uint128,  // bytes 65..81
//   }
//
// Total size: 32 + 32 + 1 + 16 = 81 bytes. No header, no offsets.

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

/**
 * Serialize a TokenInfo to its molecule binary representation.
 *
 * The encoding is straightforward: just concatenate the fields in order.
 * No length prefix, no offset table — structs are always the same size.
 */
export function packTokenInfo(info: TokenInfo): Uint8Array {
  const buf = new Uint8Array(81);

  // Field 1: name (Byte32) — bytes 0..32
  const nameBytes = packByte32FromString(info.name);
  buf.set(nameBytes, 0);

  // Field 2: symbol (Byte32) — bytes 32..64
  const symbolBytes = packByte32FromString(info.symbol);
  buf.set(symbolBytes, 32);

  // Field 3: decimals (byte) — byte 64
  buf[64] = info.decimals;

  // Field 4: total_supply (Uint128) — bytes 65..81
  const supplyBytes = writeUint128LE(info.totalSupply);
  buf.set(supplyBytes, 65);

  return buf;
}

/**
 * Deserialize a TokenInfo from its molecule binary representation.
 *
 * This is "zero-copy" style: we read directly from known offsets.
 * No parsing of headers or offset tables needed for structs.
 */
export function unpackTokenInfo(data: Uint8Array): TokenInfo {
  if (data.length !== 81) {
    throw new Error(
      `Invalid TokenInfo data: expected 81 bytes, got ${data.length}`
    );
  }

  return {
    name: unpackByte32ToString(data, 0),
    symbol: unpackByte32ToString(data, 32),
    decimals: data[64],
    totalSupply: readUint128LE(data, 65),
  };
}

// ============================================================================
// FixVec — Fixed-size Item Vector
// ============================================================================
// Format: [4-byte item_count (LE)] [item_0] [item_1] ... [item_n]
//
// Used when each item has a known, fixed size (byte, array, struct).
// The header stores the NUMBER OF ITEMS (not total byte length).

/**
 * Pack a list of fixed-size items into a FixVec.
 *
 * @param items - Array of Uint8Arrays, each the same size
 * @returns The molecule FixVec encoding
 */
export function packFixVec(items: Uint8Array[]): Uint8Array {
  // Validate all items are the same size
  if (items.length > 0) {
    const itemSize = items[0].length;
    for (const item of items) {
      if (item.length !== itemSize) {
        throw new Error(
          `FixVec items must all have the same size. Expected ${itemSize}, got ${item.length}`
        );
      }
    }
  }

  // Calculate total size: 4 bytes for count + all items
  const itemCount = items.length;
  const totalItemBytes = items.reduce((sum, item) => sum + item.length, 0);
  const buf = new Uint8Array(4 + totalItemBytes);

  // Write the item count as a 4-byte little-endian integer
  buf.set(writeUint32LE(itemCount), 0);

  // Write each item sequentially after the count
  let offset = 4;
  for (const item of items) {
    buf.set(item, offset);
    offset += item.length;
  }

  return buf;
}

/**
 * Unpack a FixVec into its individual items.
 *
 * @param data - The raw molecule FixVec bytes
 * @param itemSize - The fixed size of each item in bytes
 * @returns Array of Uint8Arrays, one per item
 */
export function unpackFixVec(data: Uint8Array, itemSize: number): Uint8Array[] {
  if (data.length < 4) {
    throw new Error("FixVec too short: missing item count header");
  }

  const itemCount = readUint32LE(data, 0);
  const expectedLength = 4 + itemCount * itemSize;

  if (data.length !== expectedLength) {
    throw new Error(
      `FixVec size mismatch: expected ${expectedLength} bytes for ${itemCount} items of size ${itemSize}, got ${data.length}`
    );
  }

  const items: Uint8Array[] = [];
  for (let i = 0; i < itemCount; i++) {
    const start = 4 + i * itemSize;
    items.push(data.slice(start, start + itemSize));
  }

  return items;
}

// ============================================================================
// DynVec — Dynamic-size Item Vector
// ============================================================================
// Format: [4-byte total_size (LE)] [4-byte offset_0] [4-byte offset_1] ...
//         [item_0 bytes] [item_1 bytes] ...
//
// Used when items have variable sizes (vectors, tables).
// The header stores the TOTAL BYTE SIZE (including itself and offsets).
// Each offset tells you where the corresponding item starts.
// Item sizes are inferred from the difference between consecutive offsets.

/**
 * Pack a list of variable-size items into a DynVec.
 */
export function packDynVec(items: Uint8Array[]): Uint8Array {
  if (items.length === 0) {
    // Empty DynVec is just the total size header (4 bytes) with value 4
    return writeUint32LE(4);
  }

  // Calculate total size:
  // 4 (total_size) + 4 * items.length (offsets) + sum of item sizes
  const headerSize = 4 + 4 * items.length;
  const dataSize = items.reduce((sum, item) => sum + item.length, 0);
  const totalSize = headerSize + dataSize;

  const buf = new Uint8Array(totalSize);

  // Write total size
  buf.set(writeUint32LE(totalSize), 0);

  // Write offsets (each offset points to where the item data starts)
  let dataOffset = headerSize;
  for (let i = 0; i < items.length; i++) {
    buf.set(writeUint32LE(dataOffset), 4 + i * 4);
    dataOffset += items[i].length;
  }

  // Write item data
  dataOffset = headerSize;
  for (const item of items) {
    buf.set(item, dataOffset);
    dataOffset += item.length;
  }

  return buf;
}

/**
 * Unpack a DynVec into its individual items.
 */
export function unpackDynVec(data: Uint8Array): Uint8Array[] {
  if (data.length < 4) {
    throw new Error("DynVec too short: missing total size header");
  }

  const totalSize = readUint32LE(data, 0);

  if (totalSize === 4) {
    // Empty DynVec
    return [];
  }

  if (data.length < totalSize) {
    throw new Error(
      `DynVec data too short: header says ${totalSize} bytes, got ${data.length}`
    );
  }

  // Read the first offset to determine the number of items
  const firstOffset = readUint32LE(data, 4);
  const itemCount = (firstOffset - 4) / 4;

  // Read all offsets
  const offsets: number[] = [];
  for (let i = 0; i < itemCount; i++) {
    offsets.push(readUint32LE(data, 4 + i * 4));
  }

  // Extract items using offset pairs
  const items: Uint8Array[] = [];
  for (let i = 0; i < itemCount; i++) {
    const start = offsets[i];
    const end = i < itemCount - 1 ? offsets[i + 1] : totalSize;
    items.push(data.slice(start, end));
  }

  return items;
}

// ============================================================================
// Table — Variable-size Composite
// ============================================================================
// Format is identical to DynVec: [total_size] [offsets...] [field_data...]
// The difference is semantic: tables have named fields, while DynVec has
// indexed items. In binary representation they are the same.

/**
 * Pack fields into a molecule Table.
 *
 * @param fields - Array of field values as Uint8Arrays, in schema order
 * @returns The molecule Table encoding
 */
export function packTable(fields: Uint8Array[]): Uint8Array {
  // Tables use exactly the same binary format as DynVec
  return packDynVec(fields);
}

/**
 * Unpack a molecule Table into its fields.
 *
 * @param data - The raw molecule Table bytes
 * @returns Array of Uint8Arrays, one per field, in schema order
 */
export function unpackTable(data: Uint8Array): Uint8Array[] {
  return unpackDynVec(data);
}

// ============================================================================
// Option — Optional Value
// ============================================================================
// Format: empty (0 bytes) for None, or the raw inner value for Some.
// There is no tag byte — the presence/absence is determined by the length.

/**
 * Pack an optional value. Returns empty Uint8Array for null/undefined.
 */
export function packOption(value: Uint8Array | null | undefined): Uint8Array {
  if (value === null || value === undefined) {
    return new Uint8Array(0);
  }
  return value;
}

/**
 * Unpack an optional value. Returns null if the data is empty.
 */
export function unpackOption(data: Uint8Array): Uint8Array | null {
  if (data.length === 0) {
    return null;
  }
  return data;
}

// ============================================================================
// Union — Tagged Union (Sum Type)
// ============================================================================
// Format: [4-byte item_id (LE)] [value bytes]
// The item_id corresponds to the index of the type in the union declaration.

/**
 * Pack a union value with its type tag.
 *
 * @param itemId - The variant index (0, 1, 2, ...)
 * @param value - The variant's value
 * @returns The molecule Union encoding
 */
export function packUnion(itemId: number, value: Uint8Array): Uint8Array {
  const buf = new Uint8Array(4 + value.length);
  buf.set(writeUint32LE(itemId), 0);
  buf.set(value, 4);
  return buf;
}

/**
 * Unpack a union into its type tag and value.
 */
export function unpackUnion(data: Uint8Array): { itemId: number; value: Uint8Array } {
  if (data.length < 4) {
    throw new Error("Union too short: missing item_id header");
  }
  const itemId = readUint32LE(data, 0);
  const value = data.slice(4);
  return { itemId, value };
}

// ============================================================================
// Script — CKB Built-in Type (molecule Table)
// ============================================================================
// This is CKB's most important molecule type. Every cell has at least one
// Script (the lock script), and optionally a second (the type script).
//
// table Script {
//     code_hash: Byte32,   // 32 bytes
//     hash_type: byte,     // 1 byte
//     args:      Bytes,    // variable length (FixVec of bytes)
// }

export interface ScriptInfo {
  codeHash: string; // 0x-prefixed 32-byte hex
  hashType: number; // 0x00=data, 0x01=type, 0x02=data1, 0x04=data2
  args: string; // 0x-prefixed hex
}

/**
 * Serialize a CKB Script into molecule Table format.
 */
export function packScript(script: ScriptInfo): Uint8Array {
  // Field 1: code_hash (Byte32) — fixed 32 bytes
  const codeHash = hexToBytes(script.codeHash);
  if (codeHash.length !== 32) {
    throw new Error(`code_hash must be 32 bytes, got ${codeHash.length}`);
  }

  // Field 2: hash_type (byte) — fixed 1 byte
  const hashType = new Uint8Array([script.hashType]);

  // Field 3: args (Bytes = FixVec<byte>) — variable length
  // Bytes is a FixVec of single bytes: [4-byte count] [byte_0] [byte_1] ...
  const argsData = hexToBytes(script.args);
  const argsVec = packFixVec(
    Array.from(argsData).map((b) => new Uint8Array([b]))
  );

  // Pack all fields into a Table
  return packTable([codeHash, hashType, argsVec]);
}

/**
 * Deserialize a CKB Script from molecule Table format.
 */
export function unpackScript(data: Uint8Array): ScriptInfo {
  const fields = unpackTable(data);
  if (fields.length < 3) {
    throw new Error(`Script table must have 3 fields, got ${fields.length}`);
  }

  // Field 0: code_hash (Byte32)
  const codeHash = bytesToHex(fields[0]);

  // Field 1: hash_type (byte)
  const hashType = fields[1][0];

  // Field 2: args (FixVec<byte>)
  const argsItems = unpackFixVec(fields[2], 1);
  const argsBytes = new Uint8Array(argsItems.map((item) => item[0]));
  const args = bytesToHex(argsBytes);

  return { codeHash, hashType, args };
}

// ============================================================================
// Visualization Helpers
// ============================================================================

/**
 * Format a byte array into a visual hex dump showing the byte layout.
 * Useful for understanding molecule's binary structure.
 */
export function hexDump(
  data: Uint8Array,
  annotations?: Array<{ start: number; end: number; label: string }>
): string {
  const lines: string[] = [];
  const bytesPerLine = 16;

  for (let i = 0; i < data.length; i += bytesPerLine) {
    const slice = data.slice(i, Math.min(i + bytesPerLine, data.length));
    const offset = i.toString(16).padStart(4, "0");
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`${offset}: ${hex.padEnd(47)} |${ascii}|`);
  }

  // Add annotations if provided
  if (annotations && annotations.length > 0) {
    lines.push("");
    lines.push("Field layout:");
    for (const ann of annotations) {
      lines.push(
        `  [${ann.start.toString().padStart(3)}..${ann.end.toString().padStart(3)}] ${ann.label}`
      );
    }
  }

  return lines.join("\n");
}
