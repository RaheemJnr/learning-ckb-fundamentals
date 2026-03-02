// ============================================================================
// Lesson 11: Molecule Serialization — TypeScript Demonstration
// ============================================================================
//
// This script walks through molecule serialization from first principles.
// It explains what molecule is, why CKB chose it, and demonstrates encoding
// and decoding at the byte level so you truly understand the format.
//
// Run with: npx tsx src/index.ts
//
// ============================================================================

import {
  bytesToHex,
  hexToBytes,
  writeUint32LE,
  readUint32LE,
  writeUint64LE,
  readUint64LE,
  writeUint128LE,
  readUint128LE,
  packByte32FromString,
  unpackByte32ToString,
  packTokenInfo,
  unpackTokenInfo,
  packFixVec,
  unpackFixVec,
  packDynVec,
  unpackDynVec,
  packTable,
  unpackTable,
  packOption,
  unpackOption,
  packUnion,
  unpackUnion,
  packScript,
  unpackScript,
  hexDump,
  type TokenInfo,
  type ScriptInfo,
} from "./molecule-types.js";

// ============================================================================
// Helper: section printer
// ============================================================================
function section(title: string): void {
  console.log("\n" + "=".repeat(72));
  console.log(`  ${title}`);
  console.log("=".repeat(72) + "\n");
}

function subsection(title: string): void {
  console.log(`\n--- ${title} ---\n`);
}

// ============================================================================
// PART 1: What is Molecule and Why Does CKB Use It?
// ============================================================================

section("PART 1: What is Molecule Serialization?");

console.log(`
Molecule is a BINARY SERIALIZATION FORMAT designed specifically for blockchain
use cases. It was created by the Nervos team for CKB (Common Knowledge Base).

Every piece of data on CKB uses molecule encoding:
  - Cell outputs (capacity, lock script, type script)
  - Scripts (code_hash, hash_type, args)
  - Transactions (inputs, outputs, witnesses)
  - Custom cell data (tokens, NFTs, any application data)

WHY NOT JSON?
  JSON is text-based, human-readable, and familiar — but terrible for blockchains:
  - {"name":"CKB"} = 14 bytes vs molecule: 3 bytes (just "CKB" padded)
  - JSON is NOT canonical: {"a":1,"b":2} and {"b":2,"a":1} are the same data
    but different byte sequences. This breaks hashing!
  - JSON requires full parsing before accessing any field

WHY NOT PROTOBUF?
  Protocol Buffers are closer, but still not ideal:
  - Protobuf includes field tags (numbers) in the encoding — extra overhead
  - Protobuf allows multiple valid encodings for the same data (not canonical)
  - Protobuf does not support true zero-copy access

MOLECULE'S KEY PROPERTIES:
  1. BINARY:     Compact encoding, no wasted bytes on field names or tags
  2. CANONICAL:  Same data ALWAYS produces the same bytes (deterministic)
  3. ZERO-COPY:  Read any field directly from the byte buffer without
                 deserializing the entire structure
  4. SCHEMA:     Types defined in .mol files, code generated for any language
`);

// ============================================================================
// PART 2: Molecule Primitive Types
// ============================================================================

section("PART 2: Molecule Primitive Types");

console.log(`
Molecule has 7 primitive types, divided into two categories:

FIXED-SIZE TYPES (size known at compile time, no length header):
  - byte     : Single unsigned byte (uint8). The atom of molecule.
  - array    : Fixed-length sequence of one type. Example: [byte; 32] for hashes.
  - struct   : Fixed-size composite. All fields must also be fixed-size.

DYNAMIC-SIZE TYPES (size varies, includes length/offset headers):
  - vector   : Variable-length list. FixVec for fixed items, DynVec for dynamic.
  - table    : Like struct but with dynamic fields. Has offset table in header.
  - option   : A value that may be absent (0 bytes) or present.
  - union    : One of several possible types, tagged with a 4-byte ID.
`);

// ============================================================================
// PART 3: Encoding/Decoding by Hand — Byte Layout Demos
// ============================================================================

section("PART 3: Byte-Level Encoding Demos");

// --- 3a: byte and array types ---
subsection("3a: byte and array (Byte32)");

console.log("A single 'byte' is just one unsigned byte:");
const singleByte = new Uint8Array([0x42]);
console.log(`  byte value 0x42 (66 decimal): ${bytesToHex(singleByte)}`);
console.log(`  Size: ${singleByte.length} byte\n`);

console.log("An 'array Byte32 [byte; 32]' is exactly 32 bytes, no header:");
const hash = hexToBytes(
  "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
);
console.log(`  Byte32 (a hash): ${bytesToHex(hash)}`);
console.log(`  Size: ${hash.length} bytes — always exactly 32, no length prefix\n`);

console.log("A Byte32 from a short string (right-padded with zeros):");
const nameBytes = packByte32FromString("CKB");
console.log(`  "CKB" as Byte32: ${bytesToHex(nameBytes)}`);
console.log(
  `  First 3 bytes are 0x43 0x4b 0x42 (ASCII for C, K, B)`
);
console.log(`  Remaining 29 bytes are all 0x00 (padding)\n`);

const recovered = unpackByte32ToString(nameBytes);
console.log(`  Decoded back: "${recovered}"`);

// --- 3b: struct type ---
subsection("3b: struct (TokenInfo)");

console.log(`A molecule STRUCT is a fixed-size composite type.
All fields must be fixed-size. No headers, no offsets — just concatenated bytes.

Our TokenInfo struct:
  struct TokenInfo {
      name:         Byte32,   // 32 bytes at offset 0
      symbol:       Byte32,   // 32 bytes at offset 32
      decimals:     byte,     //  1 byte  at offset 64
      total_supply: Uint128,  // 16 bytes at offset 65
  }
  TOTAL: 32 + 32 + 1 + 16 = 81 bytes (always exactly 81)
`);

const tokenInfo: TokenInfo = {
  name: "Nervos CKByte",
  symbol: "CKB",
  decimals: 8,
  totalSupply: 33_600_000_000_00000000n, // 33.6 billion with 8 decimals
};

console.log("Encoding TokenInfo:");
console.log(`  name:         "${tokenInfo.name}"`);
console.log(`  symbol:       "${tokenInfo.symbol}"`);
console.log(`  decimals:     ${tokenInfo.decimals}`);
console.log(`  totalSupply:  ${tokenInfo.totalSupply}\n`);

const packed = packTokenInfo(tokenInfo);
console.log(`Serialized (${packed.length} bytes):`);
console.log(
  hexDump(packed, [
    { start: 0, end: 32, label: "name (Byte32) — 'Nervos CKByte' + zero padding" },
    { start: 32, end: 64, label: "symbol (Byte32) — 'CKB' + zero padding" },
    { start: 64, end: 65, label: "decimals (byte) — 0x08 = 8" },
    { start: 65, end: 81, label: "total_supply (Uint128 LE) — 33,600,000,000 * 10^8" },
  ])
);

console.log("\nDecoding back:");
const decoded = unpackTokenInfo(packed);
console.log(`  name:         "${decoded.name}"`);
console.log(`  symbol:       "${decoded.symbol}"`);
console.log(`  decimals:     ${decoded.decimals}`);
console.log(`  totalSupply:  ${decoded.totalSupply}`);
console.log(
  `  Match:        ${JSON.stringify(tokenInfo) === JSON.stringify(decoded) ? "PASS" : "FAIL"}`
);

// --- 3c: FixVec (vector of fixed-size items) ---
subsection("3c: FixVec (vector of fixed-size items)");

console.log(`A FixVec stores a list of fixed-size items.
Format: [4-byte item_count (LE)] [item_0] [item_1] ... [item_n]

Example: vector of 3 single bytes [0x01, 0x02, 0x03]
`);

const byteItems = [
  new Uint8Array([0x01]),
  new Uint8Array([0x02]),
  new Uint8Array([0x03]),
];
const fixVecBytes = packFixVec(byteItems);
console.log(`Serialized FixVec (${fixVecBytes.length} bytes):`);
console.log(`  ${bytesToHex(fixVecBytes)}`);
console.log(`  Breakdown:`);
console.log(`    ${bytesToHex(fixVecBytes.slice(0, 4))}  = item count: ${readUint32LE(fixVecBytes, 0)} (4 bytes LE)`);
console.log(`    ${bytesToHex(fixVecBytes.slice(4, 5))}          = item 0: 0x01`);
console.log(`    ${bytesToHex(fixVecBytes.slice(5, 6))}          = item 1: 0x02`);
console.log(`    ${bytesToHex(fixVecBytes.slice(6, 7))}          = item 2: 0x03`);

const unpackedItems = unpackFixVec(fixVecBytes, 1);
console.log(`\nDecoded ${unpackedItems.length} items: [${unpackedItems.map((i) => bytesToHex(i)).join(", ")}]`);

console.log(`\nEmpty FixVec (0 items):`);
const emptyFixVec = packFixVec([]);
console.log(`  ${bytesToHex(emptyFixVec)} = item count: 0 (just the 4-byte header)`);

console.log(`\nFixVec of Byte32 (32-byte items):`);
const hashVec = packFixVec([
  packByte32FromString("hash_one"),
  packByte32FromString("hash_two"),
]);
console.log(`  Total size: ${hashVec.length} bytes (4 header + 2 * 32 items = 68)`);

// --- 3d: DynVec (vector of variable-size items) ---
subsection("3d: DynVec (vector of variable-size items)");

console.log(`A DynVec stores a list of VARIABLE-size items.
Format: [4-byte total_size] [4-byte offset_0] [4-byte offset_1] ... [item_0] [item_1] ...

The total_size includes itself and all offsets. Each offset tells you where
the corresponding item's data begins. Item sizes are inferred from the gap
between consecutive offsets (or between the last offset and total_size).

Example: DynVec of two byte strings: "hi" and "hello"
`);

// Encode two byte strings as FixVec<byte> first, then wrap in DynVec
const str1 = new TextEncoder().encode("hi");
const str2 = new TextEncoder().encode("hello");
const fixVec1 = packFixVec(Array.from(str1).map((b) => new Uint8Array([b])));
const fixVec2 = packFixVec(Array.from(str2).map((b) => new Uint8Array([b])));

const dynVec = packDynVec([fixVec1, fixVec2]);
console.log(`Serialized DynVec (${dynVec.length} bytes):`);
console.log(`  ${bytesToHex(dynVec)}`);
console.log(`  Breakdown:`);
const totalSize = readUint32LE(dynVec, 0);
const offset0 = readUint32LE(dynVec, 4);
const offset1 = readUint32LE(dynVec, 8);
console.log(`    bytes [0..4]:   total_size = ${totalSize}`);
console.log(`    bytes [4..8]:   offset[0]  = ${offset0} (item 0 starts at byte ${offset0})`);
console.log(`    bytes [8..12]:  offset[1]  = ${offset1} (item 1 starts at byte ${offset1})`);
console.log(`    bytes [${offset0}..${offset1}]:  item 0 = "hi" as FixVec<byte> (${offset1 - offset0} bytes)`);
console.log(`    bytes [${offset1}..${totalSize}]:  item 1 = "hello" as FixVec<byte> (${totalSize - offset1} bytes)`);

const dynItems = unpackDynVec(dynVec);
console.log(`\nDecoded ${dynItems.length} items`);

// --- 3e: Table type ---
subsection("3e: Table (variable-size composite)");

console.log(`A TABLE uses the same binary format as DynVec, but the "items" are
named fields in a fixed schema order. Tables can contain both fixed-size
and variable-size fields.

Example: CKB Script table
  table Script {
      code_hash: Byte32,   // 32 bytes (fixed, but still gets an offset entry)
      hash_type: byte,     // 1 byte
      args:      Bytes,    // variable length
  }
`);

const exampleScript: ScriptInfo = {
  codeHash:
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hashType: 0x01, // type
  args: "0x36c329ed630d6ce750712a477543672adab57f4c",
};

console.log("Encoding a CKB Script:");
console.log(`  code_hash: ${exampleScript.codeHash}`);
console.log(`  hash_type: 0x${exampleScript.hashType.toString(16).padStart(2, "0")} (type)`);
console.log(`  args:      ${exampleScript.args}`);

const scriptBytes = packScript(exampleScript);
console.log(`\nSerialized Script (${scriptBytes.length} bytes):`);
console.log(hexDump(scriptBytes));

const decodedScript = unpackScript(scriptBytes);
console.log("\nDecoded Script:");
console.log(`  code_hash: ${decodedScript.codeHash}`);
console.log(`  hash_type: 0x${decodedScript.hashType.toString(16).padStart(2, "0")}`);
console.log(`  args:      ${decodedScript.args}`);
console.log(
  `  Match:     ${JSON.stringify(exampleScript) === JSON.stringify(decodedScript) ? "PASS" : "FAIL"}`
);

// --- 3f: Option type ---
subsection("3f: Option (optional value)");

console.log(`An Option is either:
  - EMPTY (0 bytes) = None / absent
  - The raw inner value = Some / present

There is no tag byte. The reader must know from context whether the bytes
represent an option or a required field.
`);

const someValue = packOption(new Uint8Array([0x42, 0x43]));
const noneValue = packOption(null);

console.log(`Some([0x42, 0x43]): ${bytesToHex(someValue)} (${someValue.length} bytes)`);
console.log(`None:               ${bytesToHex(noneValue)} (${noneValue.length} bytes — empty!)`);

const unpSome = unpackOption(someValue);
const unpNone = unpackOption(noneValue);
console.log(`\nDecoded Some: ${unpSome ? bytesToHex(unpSome) : "null"}`);
console.log(`Decoded None: ${unpNone ? bytesToHex(unpNone) : "null"}`);

// --- 3g: Union type ---
subsection("3g: Union (tagged union / sum type)");

console.log(`A Union holds one of several possible types, identified by a 4-byte tag.
Format: [4-byte item_id (LE)] [value bytes]

The item_id is the 0-based index of the type in the union declaration.
Example:
  union TokenAction {
      TransferRecord,   // item_id = 0
      TokenMetadata,    // item_id = 1
      Bytes,            // item_id = 2 (burn)
  }
`);

// Simulate a "burn" action (item_id = 2, value = some bytes)
const burnData = new TextEncoder().encode("burn 100 tokens");
const burnFixVec = packFixVec(Array.from(burnData).map((b) => new Uint8Array([b])));
const burnUnion = packUnion(2, burnFixVec);

console.log(`Burn action union (${burnUnion.length} bytes):`);
console.log(`  ${bytesToHex(burnUnion)}`);
console.log(`  item_id bytes: ${bytesToHex(burnUnion.slice(0, 4))} = ${readUint32LE(burnUnion, 0)} (Bytes variant)`);
console.log(`  value:         ${burnUnion.length - 4} bytes of data`);

const unpUnion = unpackUnion(burnUnion);
console.log(`\nDecoded union: item_id=${unpUnion.itemId}, value size=${unpUnion.value.length} bytes`);

// ============================================================================
// PART 4: Molecule vs JSON vs Protobuf — Comparison
// ============================================================================

section("PART 4: Format Comparison — Molecule vs JSON vs Protobuf");

console.log(`Let's encode the same data in different formats and compare:

Data: { name: "CKB", symbol: "CKB", decimals: 8, totalSupply: 33600000000 }
`);

// JSON encoding
const jsonStr = JSON.stringify({
  name: "CKB",
  symbol: "CKB",
  decimals: 8,
  totalSupply: "3360000000000000000", // Must be string in JSON (no BigInt)
});
const jsonBytes = new TextEncoder().encode(jsonStr);

// Molecule encoding (our TokenInfo struct)
const moleculeBytes = packTokenInfo({
  name: "CKB",
  symbol: "CKB",
  decimals: 8,
  totalSupply: 3_360_000_000_00000000n,
});

console.log(`JSON:     ${jsonStr}`);
console.log(`  Size: ${jsonBytes.length} bytes`);
console.log(`  Canonical: NO — key order can vary, whitespace can differ`);
console.log(`  Zero-copy: NO — must parse entire string to access any field`);
console.log(`  Schema:    NO — schema is implicit, not enforced\n`);

console.log(`Molecule: ${bytesToHex(moleculeBytes)}`);
console.log(`  Size: ${moleculeBytes.length} bytes`);
console.log(`  Canonical: YES — same data always produces same bytes`);
console.log(`  Zero-copy: YES — access decimals with data[64], no parsing needed`);
console.log(`  Schema:    YES — defined in .mol files, enforced by generated code\n`);

console.log(`Protobuf (hypothetical for same data):`);
console.log(`  Size: ~30-40 bytes (field tags add overhead)`);
console.log(`  Canonical: NO — field order not guaranteed, varint encoding varies`);
console.log(`  Zero-copy: PARTIAL — some implementations support lazy access`);
console.log(`  Schema:    YES — defined in .proto files\n`);

console.log(`Summary:`);
console.log(`  +------------+------+-------+-----------+-----------+--------+`);
console.log(`  | Format     | Size | Canon | Zero-copy | Schema    | Speed  |`);
console.log(`  +------------+------+-------+-----------+-----------+--------+`);
console.log(`  | JSON       | ${String(jsonBytes.length).padStart(3)}B | No    | No        | Implicit  | Slow   |`);
console.log(`  | Protobuf   | ~35B | No    | Partial   | .proto    | Fast   |`);
console.log(`  | Molecule   | ${String(moleculeBytes.length).padStart(3)}B | Yes   | Yes       | .mol      | Fastest|`);
console.log(`  +------------+------+-------+-----------+-----------+--------+`);

console.log(`
Note: Molecule's fixed-size types (struct, array) have NO overhead at all.
The 81-byte TokenInfo struct is pure data — no headers, no padding waste.
For CKB's constrained on-chain environment, this compactness matters greatly.
`);

// ============================================================================
// PART 5: CKB's Built-in Molecule Types
// ============================================================================

section("PART 5: CKB's Built-in Molecule Types");

console.log(`CKB defines its core data structures using molecule in 'blockchain.mol'.
Here are the most important types you will encounter:

SCRIPT — Identifies an on-chain program and its arguments.
  table Script {
      code_hash: Byte32,   // 32-byte hash identifying the script code
      hash_type: byte,     // How to interpret code_hash
      args:      Bytes,    // Arguments passed to the script
  }
  Used in: every cell's lock script and optional type script.

CELL OUTPUT — The "envelope" of a cell (without the data payload).
  table CellOutput {
      capacity: Uint64,    // Cell capacity in shannons (1 CKB = 10^8 shannons)
      lock:     Script,    // Lock script (determines who can spend)
      type_:    ScriptOpt, // Optional type script (determines cell type)
  }
  Used in: transaction outputs.

CELL INPUT — A reference to an existing cell to consume.
  struct CellInput {
      since:           Uint64,   // Time-lock condition
      previous_output: OutPoint, // Which cell to consume (tx_hash + index)
  }
  Used in: transaction inputs.

OUT POINT — Identifies a specific cell by its creating transaction.
  struct OutPoint {
      tx_hash: Byte32,  // Transaction hash that created the cell
      index:   Uint32,  // Output index within that transaction
  }

RAW TRANSACTION — The unsigned transaction content.
  table RawTransaction {
      version:      Uint32,       // Always 0 currently
      cell_deps:    CellDepVec,   // Script code dependencies
      header_deps:  Byte32Vec,    // Block header dependencies
      inputs:       CellInputVec, // Cells being consumed
      outputs:      CellOutputVec,// Cells being created
      outputs_data: BytesVec,     // Data for each output cell
  }

TRANSACTION — A signed transaction.
  table Transaction {
      raw:       RawTransaction,  // The unsigned content
      witnesses: BytesVec,        // Signatures and other proofs
  }
`);

// Demonstrate encoding a Script
subsection("Encoding a Real CKB Script");

const secp256k1Script: ScriptInfo = {
  codeHash:
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hashType: 0x01, // type
  args: "0x36c329ed630d6ce750712a477543672adab57f4c", // 20-byte lock args
};

console.log("Secp256k1-blake160 lock script (the default CKB lock):");
console.log(`  code_hash: ${secp256k1Script.codeHash}`);
console.log(`  hash_type: 0x01 (type) — code_hash identifies a type_id, not data hash`);
console.log(`  args:      ${secp256k1Script.args} (20-byte blake160 of public key)`);

const secp256k1Bytes = packScript(secp256k1Script);
console.log(`\nMolecule encoding (${secp256k1Bytes.length} bytes):`);
console.log(hexDump(secp256k1Bytes));

// Show the table header structure
const tableTotal = readUint32LE(secp256k1Bytes, 0);
const fieldOffset0 = readUint32LE(secp256k1Bytes, 4);
const fieldOffset1 = readUint32LE(secp256k1Bytes, 8);
const fieldOffset2 = readUint32LE(secp256k1Bytes, 12);

console.log(`\nTable header breakdown:`);
console.log(`  total_size:  ${tableTotal} bytes`);
console.log(`  offset[0]:   ${fieldOffset0} (code_hash starts at byte ${fieldOffset0})`);
console.log(`  offset[1]:   ${fieldOffset1} (hash_type starts at byte ${fieldOffset1})`);
console.log(`  offset[2]:   ${fieldOffset2} (args starts at byte ${fieldOffset2})`);
console.log(`  3 fields => header = 4 (total) + 3*4 (offsets) = 16 bytes`);

// ============================================================================
// PART 6: Working with Molecule in JavaScript/TypeScript
// ============================================================================

section("PART 6: Working with Molecule in TypeScript");

console.log(`In a real CKB project, you have several options for molecule in TypeScript:

1. HAND-CODED HELPERS (what we did in this lesson)
   - Full control, great for learning
   - Tedious for large schemas
   - Used in: molecule-types.ts in this project

2. @ckb-lumos/codec (Lumos SDK)
   - Provides molecule codec utilities
   - Can define codecs programmatically in TypeScript
   - Popular in the CKB ecosystem

3. @ckb-ccc/core (CCC SDK)
   - Includes built-in molecule types for CKB core structures
   - Script, CellOutput, Transaction, etc. are handled automatically
   - Best choice for most application development

4. moleculec-es (molecule compiler for JavaScript)
   - Generates TypeScript/JavaScript code from .mol schemas
   - Use when you have custom molecule types
   - Run: moleculec-es -i your_schema.mol -o generated.ts

TYPICAL WORKFLOW:
  1. Define your types in a .mol schema file
  2. Generate TypeScript code with moleculec-es (or use hand-coded helpers)
  3. Use the CCC SDK for CKB built-in types (Script, CellOutput, etc.)
  4. Encode your custom data before storing it in cells
  5. Decode molecule data when reading cells from the chain
`);

// Demonstrate a complete encode-decode cycle
subsection("Complete Encode-Decode Cycle");

console.log("Step 1: Define the data we want to store in a cell:");
const myToken: TokenInfo = {
  name: "Molecule Demo Token",
  symbol: "MDT",
  decimals: 18,
  totalSupply: 1_000_000_000_000_000_000_000_000n, // 1 million tokens with 18 decimals
};
console.log(`  ${JSON.stringify(myToken, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`);

console.log("Step 2: Encode to molecule bytes:");
const encoded = packTokenInfo(myToken);
console.log(`  Hex: ${bytesToHex(encoded)}`);
console.log(`  Size: ${encoded.length} bytes\n`);

console.log("Step 3: This byte array would be stored as cell data on CKB.");
console.log("        When building a transaction, you set it as the output data.\n");

console.log("Step 4: Read the cell data back and decode:");
const decodedToken = unpackTokenInfo(encoded);
console.log(`  name:        "${decodedToken.name}"`);
console.log(`  symbol:      "${decodedToken.symbol}"`);
console.log(`  decimals:    ${decodedToken.decimals}`);
console.log(`  totalSupply: ${decodedToken.totalSupply}\n`);

console.log("Step 5: Verify the roundtrip:");
console.log(`  name match:         ${myToken.name === decodedToken.name}`);
console.log(`  symbol match:       ${myToken.symbol === decodedToken.symbol}`);
console.log(`  decimals match:     ${myToken.decimals === decodedToken.decimals}`);
console.log(`  totalSupply match:  ${myToken.totalSupply === decodedToken.totalSupply}`);

// ============================================================================
// PART 7: Zero-Copy Access Demonstration
// ============================================================================

section("PART 7: Zero-Copy Access — The Key Advantage");

console.log(`The term "zero-copy" means you can read a field directly from the raw
byte buffer WITHOUT deserializing the entire structure. This is critical
for on-chain scripts where every CPU cycle counts.

For STRUCTS, zero-copy is trivial: each field is at a known, fixed offset.
For TABLES, you read the offset from the header, then jump directly to the field.

Let's demonstrate with our TokenInfo struct:
`);

const data = packTokenInfo({
  name: "Zero Copy Token",
  symbol: "ZCT",
  decimals: 6,
  totalSupply: 42_000_000_000000n,
});

console.log(`Raw encoded data: ${bytesToHex(data)}\n`);

// Zero-copy access — read fields directly from known offsets
console.log("Zero-copy field access (no deserialization needed):");
console.log(`  data[64]      = decimals = ${data[64]}`);

const supplySlice = data.slice(65, 81);
const supply = readUint128LE(supplySlice, 0);
console.log(`  data[65..81]  = total_supply = ${supply}`);

const nameSlice = data.slice(0, 32);
const name = unpackByte32ToString(nameSlice);
console.log(`  data[0..32]   = name = "${name}"`);

const symbolSlice = data.slice(32, 64);
const symbol = unpackByte32ToString(symbolSlice);
console.log(`  data[32..64]  = symbol = "${symbol}"`);

console.log(`
In an on-chain CKB script (Rust), this looks like:
  let decimals = cell_data[64];                   // Just one byte read!
  let supply = u128::from_le_bytes(cell_data[65..81]);  // Direct slice!

No allocation. No parsing. No iteration. Just pointer arithmetic.
This is why molecule is so well-suited for blockchain virtual machines.
`);

// ============================================================================
// PART 8: Common Patterns and Gotchas
// ============================================================================

section("PART 8: Common Patterns and Gotchas");

console.log(`1. LITTLE-ENDIAN EVERYWHERE
   All multi-byte integers in molecule are little-endian. This matches CKB-VM
   (RISC-V), so on-chain scripts can read values without byte-swapping.
   BUT: if you are used to big-endian (network byte order), watch out!
`);

const num = 0x01020304;
const leBytes = writeUint32LE(num);
console.log(`   Number: 0x01020304`);
console.log(`   Little-endian bytes: ${bytesToHex(leBytes)} (least significant byte first)`);
console.log(`   Read back: 0x${readUint32LE(leBytes).toString(16).padStart(8, "0")}\n`);

console.log(`2. STRUCT vs TABLE
   Use STRUCT when all fields are fixed-size. It is more efficient (no headers).
   Use TABLE when you need variable-length fields or future extensibility.

   Struct: [field1][field2][field3]           — just concatenated bytes
   Table:  [total_size][off0][off1][off2][f0][f1][f2]  — has offset header
`);

console.log(`3. EMPTY VECTORS
   FixVec with 0 items: 0x00000000 (4 bytes — just the zero count)
   DynVec with 0 items: 0x04000000 (4 bytes — total_size = 4, the header itself)
`);

const emptyFix = packFixVec([]);
const emptyDyn = packDynVec([]);
console.log(`   Empty FixVec: ${bytesToHex(emptyFix)}`);
console.log(`   Empty DynVec: ${bytesToHex(emptyDyn)}\n`);

console.log(`4. OPTION ENCODING
   None = 0 bytes (empty). Some(x) = just the raw bytes of x.
   There is NO tag byte. The reader infers presence from the length.
   In tables, an option field's length is determined by its offset range.
`);

console.log(`5. CANONICAL ENCODING
   The same data ALWAYS produces the same byte sequence. This is crucial
   because CKB hashes molecule-encoded data for transaction IDs, script
   hashes, etc. If encoding were not deterministic, the same transaction
   could produce different hashes — breaking the blockchain's integrity.
`);

console.log(`6. SCHEMA EVOLUTION WITH TABLES
   You can ADD new fields to the END of a table without breaking old readers.
   Old readers simply ignore the extra fields (they only read offsets they know).
   You CANNOT remove or reorder existing fields — that would break everything.
`);

// ============================================================================
// Summary
// ============================================================================

section("Summary");

console.log(`Molecule serialization is the foundation of CKB's data layer.

KEY TAKEAWAYS:

  - Molecule is a BINARY format: compact, canonical, zero-copy
  - 7 primitive types: byte, array, struct, vector, table, option, union
  - FIXED types (byte, array, struct) have NO headers — pure data
  - DYNAMIC types (vector, table, option, union) include size/offset headers
  - All integers are LITTLE-ENDIAN
  - CKB's core types (Script, CellOutput, Transaction) all use molecule
  - Schemas defined in .mol files, code generated for Rust/C/JS
  - Zero-copy access = read any field without parsing the whole structure
  - Canonical encoding = same data always produces same bytes (critical for hashing)

NEXT STEPS:
  - Study the schemas/custom.mol file to see molecule schema syntax
  - Examine the Rust contract in contracts/molecule-demo/ to see on-chain usage
  - Look at blockchain.mol in the CKB source for the full set of built-in types
  - Try modifying TokenInfo and observe how the byte layout changes
`);

console.log("Lesson 11 complete!\n");
