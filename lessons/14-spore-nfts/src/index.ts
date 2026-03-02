/**
 * ============================================================================
 * Lesson 14: Digital Objects with Spore
 * ============================================================================
 *
 * In this lesson, you will learn how to:
 *   1. Understand the Spore protocol and why it differs from traditional NFTs
 *   2. Create a Spore (Digital Object) with fully on-chain content
 *   3. Create a Spore Cluster to organize related Spores into collections
 *   4. Query and read Spore cells, decoding their content-type and content
 *   5. Understand "melting" -- destroying a Spore to recover locked CKB
 *   6. Compare Spore's economics to traditional NFT models
 *
 * ===========================================================================
 * WHAT IS THE SPORE PROTOCOL?
 * ===========================================================================
 *
 * Spore is a protocol on CKB for creating "Digital Objects" (DOBs). It is
 * commonly described as the CKB equivalent of NFTs, but the comparison
 * understates how fundamentally different it is from Ethereum's ERC-721.
 *
 * Key properties of Spore Digital Objects:
 *
 *   1. INTRINSIC VALUE
 *      Creating a Spore LOCKS CKB tokens inside it. The CKB locked in a Spore
 *      is not "used up" -- it is still yours, held inside the digital object.
 *      Destroying (melting) a Spore returns those CKB tokens to you.
 *      This gives every Spore a guaranteed minimum floor value backed by real
 *      CKB, regardless of market conditions.
 *
 *   2. FULLY ON-CHAIN STORAGE
 *      ALL content (image data, text, audio, video) is stored DIRECTLY in the
 *      Spore's cell data on the CKB blockchain. There is no IPFS link, no
 *      external URL, no off-chain server. The content cannot disappear, be
 *      censored, or change. It is permanent and self-contained.
 *
 *   3. ZERO-COST RECEIVING
 *      Unlike most NFT standards, the recipient of a Spore does NOT need to
 *      own any CKB to receive it. The Spore cell already carries enough
 *      capacity (because the sender locked CKB into it). This eliminates a
 *      major barrier to mainstream adoption.
 *
 *   4. COMPOSABLE CONTENT TYPES
 *      Spores support standard MIME content types: text/plain, image/png,
 *      image/svg+xml, audio/mp3, video/mp4, application/json,
 *      application/lua (for programmable/interactive DOBs), text/markdown,
 *      and more.
 *
 * ===========================================================================
 * SPORE CELL STRUCTURE
 * ===========================================================================
 *
 * A Spore is a CKB cell with a specific structure:
 *
 *   Cell {
 *     capacity:  <locked CKB amount in shannons>
 *     lock:      <owner's lock script (who can transfer/melt)>
 *     type:      <Spore type script (code_hash: Spore script, args: spore_id)>
 *     data:      <Molecule-encoded SporeData {
 *                   content_type: bytes   -- MIME type as UTF-8 bytes
 *                   content:      bytes   -- The actual content (image, text, etc.)
 *                   cluster_id:   bytes?  -- Optional: which cluster this belongs to
 *                }>
 *   }
 *
 * The Spore ID is derived from the first input cell's OutPoint at creation,
 * making it globally unique and non-reproducible.
 *
 * ===========================================================================
 * WARNING: SECURITY BEST PRACTICES
 * ===========================================================================
 * - NEVER hardcode private keys in production code.
 * - NEVER commit private keys to version control.
 * - NEVER reuse testnet keys on mainnet.
 * - The private key below is for TESTNET DEMONSTRATION ONLY.
 * ===========================================================================
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * TEST-ONLY private key for the creator account.
 *
 * This is a demonstration key for the testnet ONLY.
 * Before running, make sure this account has testnet CKB.
 * Get testnet CKB from the faucet: https://faucet.nervos.org/
 *
 * Creating a Spore requires locking CKB. The amount depends on the content
 * size. A minimal text Spore requires around 96-150 CKB to cover:
 *   - 8 bytes (capacity field)
 *   - 33 bytes (lock script code_hash)
 *   - 1 byte (lock hash_type)
 *   - 20 bytes (lock args = pubkey hash)
 *   - 33 bytes (type script code_hash)
 *   - 1 byte (type hash_type)
 *   - 32 bytes (type args = spore_id)
 *   - N bytes (data = content_type + content + optional cluster_id)
 */
const CREATOR_PRIVATE_KEY =
  "0xd6013cd867d286ef84cc300ac6546013837df2b06c9f53c83b4c33c2417f6a07";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Converts a bigint shannon value to a human-readable CKB string.
 * 1 CKByte = 100,000,000 shannons
 */
function formatCkb(shannons: bigint): string {
  const ckb = Number(shannons) / 100_000_000;
  return `${ckb.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} CKB`;
}

/**
 * Encodes a string into Uint8Array (UTF-8 bytes).
 * Used for converting content-type and text content to bytes for on-chain storage.
 */
function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Decodes Uint8Array (UTF-8 bytes) back to a string.
 * Used when reading Spore content from the blockchain.
 */
function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Converts a hex string (with or without "0x" prefix) to a Uint8Array.
 * CKB stores data as hex strings; we often need to convert to bytes.
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const result = new Uint8Array(clean.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

/**
 * Converts a Uint8Array to a hex string with "0x" prefix.
 */
function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Encodes SporeData using a simplified Molecule-compatible format.
 *
 * The official Spore SDK uses the Molecule binary serialization format
 * (developed by Nervos) to encode cell data. For this educational demo,
 * we show the encoding structure with detailed comments.
 *
 * Molecule table layout for SporeData:
 *   - Header: [total_size(4), offset_0(4), offset_1(4), offset_2(4)] = 16 bytes
 *   - Fields: [content_type, content, cluster_id] (each as bytes)
 *
 * In production, use @spore-sdk/core which handles this automatically.
 *
 * @param contentType - MIME type string (e.g., "text/plain")
 * @param content     - Raw content bytes
 * @param clusterId   - Optional cluster ID (32 bytes) or null
 */
function encodeSporeData(
  contentType: string,
  content: Uint8Array,
  clusterId: Uint8Array | null = null
): Uint8Array {
  /**
   * MOLECULE TABLE ENCODING
   *
   * A Molecule "table" is a variable-length structure where:
   *   1. First 4 bytes: total byte length (little-endian uint32)
   *   2. Next 4*N bytes: field offsets (little-endian uint32 each)
   *      where N is the number of fields
   *   3. Remaining bytes: field data concatenated in order
   *
   * SporeData has 3 fields: content_type, content, cluster_id
   * So the header is 4 + (3 * 4) = 16 bytes
   */
  const contentTypeBytes = encodeText(contentType);

  // cluster_id is 0 bytes if absent (empty bytes in Molecule)
  const clusterIdBytes = clusterId ?? new Uint8Array(0);

  // Calculate offsets for each field (relative to start of the full encoding)
  const headerSize = 4 + 3 * 4; // total_size(4) + 3 offsets(4 each)
  const offset0 = headerSize; // content_type starts right after header
  const offset1 = offset0 + contentTypeBytes.length; // content starts after content_type
  const offset2 = offset1 + content.length; // cluster_id starts after content
  const totalSize = offset2 + clusterIdBytes.length; // total bytes

  const result = new Uint8Array(totalSize);
  const view = new DataView(result.buffer);

  // Write header: total_size (little-endian uint32)
  view.setUint32(0, totalSize, true);
  // Write field offsets (little-endian uint32 each)
  view.setUint32(4, offset0, true);
  view.setUint32(8, offset1, true);
  view.setUint32(12, offset2, true);

  // Write field data
  result.set(contentTypeBytes, offset0);
  result.set(content, offset1);
  result.set(clusterIdBytes, offset2);

  return result;
}

/**
 * Decodes SporeData from Molecule-encoded bytes (simplified parser).
 *
 * This is the inverse of encodeSporeData. It reads the Molecule table
 * header to find field boundaries, then extracts each field.
 *
 * @param data - Raw bytes from the Spore cell's data field
 * @returns Decoded SporeData object
 */
function decodeSporeData(data: Uint8Array): {
  contentType: string;
  content: Uint8Array;
  clusterId: Uint8Array | null;
} {
  if (data.length < 16) {
    throw new Error("SporeData too short to be valid Molecule-encoded data");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Read header
  const totalSize = view.getUint32(0, true);
  const offset0 = view.getUint32(4, true); // content_type start
  const offset1 = view.getUint32(8, true); // content start
  const offset2 = view.getUint32(12, true); // cluster_id start

  if (totalSize !== data.length) {
    throw new Error(
      `Molecule size mismatch: header says ${totalSize}, data is ${data.length} bytes`
    );
  }

  // Extract each field based on the offsets
  const contentTypeBytes = data.slice(offset0, offset1);
  const contentBytes = data.slice(offset1, offset2);
  const clusterIdBytes = data.slice(offset2, totalSize);

  return {
    contentType: decodeText(contentTypeBytes),
    content: contentBytes,
    clusterId: clusterIdBytes.length > 0 ? clusterIdBytes : null,
  };
}

/**
 * Encodes ClusterData using Molecule format.
 *
 * A Cluster cell's data field contains:
 *   ClusterData {
 *     name:        bytes  -- Human-readable name for the collection
 *     description: bytes  -- Description of the collection
 *   }
 *
 * @param name        - Collection name
 * @param description - Collection description
 */
function encodeClusterData(name: string, description: string): Uint8Array {
  const nameBytes = encodeText(name);
  const descBytes = encodeText(description);

  const headerSize = 4 + 2 * 4; // total_size + 2 offsets
  const offset0 = headerSize; // name starts after header
  const offset1 = offset0 + nameBytes.length; // description starts after name
  const totalSize = offset1 + descBytes.length;

  const result = new Uint8Array(totalSize);
  const view = new DataView(result.buffer);

  view.setUint32(0, totalSize, true);
  view.setUint32(4, offset0, true);
  view.setUint32(8, offset1, true);

  result.set(nameBytes, offset0);
  result.set(descBytes, offset1);

  return result;
}

// ============================================================================
// SPORE PROTOCOL CONSTANTS (Testnet)
// ============================================================================

/**
 * These are the well-known Spore protocol deployment addresses on CKB testnet.
 *
 * In production, these are fetched from the @spore-sdk/core configuration.
 * They define:
 *   - SPORE_TYPE_SCRIPT: The code_hash and hash_type for the Spore type script.
 *     Every Spore cell must have this as its type script.
 *   - CLUSTER_TYPE_SCRIPT: Same for Cluster cells.
 *
 * The args of the type script contain the Spore ID (for Spore cells) or
 * the Cluster ID (for Cluster cells), which are generated at creation time.
 *
 * Note: These constants are for educational illustration. In a real project,
 * import the official addresses from @spore-sdk/core:
 *   import { getSporeConfig } from "@spore-sdk/core";
 *   const config = getSporeConfig("testnet");
 */
const SPORE_SCRIPT_CODE_HASH =
  "0x685a60219309029d01310311dba953d67029170ca4848a4ff638e57002130a0d";
const CLUSTER_SCRIPT_CODE_HASH =
  "0x598d793defef36e2eeba54a9b45130e4ca92822e1d193671f490950c3b856080";
const SCRIPT_HASH_TYPE = "data1" as const;

// Testnet cell deps for Spore protocol scripts
// These OutPoints reference the cells that contain the Spore/Cluster RISC-V binaries
const SPORE_CELL_DEP: ccc.CellDepLike = {
  outPoint: {
    txHash: "0x49551a20dfe39231e7db49431d26c9c08ceec96a29024eef3acc936deeb2ca76",
    index: 0,
  },
  depType: "code",
};

const CLUSTER_CELL_DEP: ccc.CellDepLike = {
  outPoint: {
    txHash: "0x49551a20dfe39231e7db49431d26c9c08ceec96a29024eef3acc936deeb2ca76",
    index: 1,
  },
  depType: "code",
};

// ============================================================================
// MAIN: SPORE PROTOCOL EXPLORATION
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("  Lesson 14: Digital Objects with Spore");
  console.log("=".repeat(70));
  console.log();

  // --------------------------------------------------------------------------
  // STEP 1: Connect to Testnet & Create Signer
  // --------------------------------------------------------------------------
  /**
   * Connect to the CKB Pudge testnet using the CCC SDK's public client.
   * This gives us access to a full CKB node via JSON-RPC without running
   * our own node.
   */
  console.log("Step 1: Connecting to CKB Testnet...");

  const client = new ccc.ClientPublicTestnet();
  const signer = new ccc.SignerCkbPrivateKey(client, CREATOR_PRIVATE_KEY);
  const creatorAddress = await signer.getInternalAddress();

  console.log("  Connected to CKB Testnet (Pudge)");
  console.log("  Creator address:", creatorAddress);
  console.log();

  // Check balance
  const balance = await signer.getBalance();
  console.log("  Creator balance:", formatCkb(balance));

  /**
   * Creating a Spore requires locking CKB. If you have insufficient balance,
   * visit the testnet faucet to get free testnet CKB:
   *   https://faucet.nervos.org/
   */
  if (balance < 200n * 100_000_000n) {
    console.warn(
      "\n  WARNING: Balance may be too low to create Spores and Clusters."
    );
    console.warn("  Creating a minimal Spore requires ~150 CKB locked.");
    console.warn("  Get testnet CKB at: https://faucet.nervos.org/");
    console.warn("  Address:", creatorAddress);
    console.warn();
    console.warn("  Continuing in demonstration mode (no actual transactions).");
    console.warn();
    await demonstrateSporeConceptsOnly(signer, client);
    return;
  }

  console.log();

  // --------------------------------------------------------------------------
  // STEP 2: Understand Spore Economics (Before Creating)
  // --------------------------------------------------------------------------
  /**
   * INTRINSIC VALUE EXPLAINED
   *
   * This is the most important concept that distinguishes Spore from all
   * other NFT protocols.
   *
   * Traditional NFTs (Ethereum ERC-721):
   *   - The NFT is a record in a smart contract's state
   *   - The actual artwork lives on IPFS or a centralized server
   *   - The NFT has no inherent value by itself (just a mapping in storage)
   *   - If the IPFS content disappears, you own a broken link
   *
   * Spore Digital Objects:
   *   - The Spore IS a CKB cell; it physically exists on-chain
   *   - ALL content is stored in the cell's data field (on-chain)
   *   - Creating the Spore LOCKS CKB tokens inside it
   *   - You can MELT the Spore at any time to get your CKB back
   *   - The floor value = the amount of CKB locked in the cell
   *
   * Economic Implications:
   *   - A Spore can NEVER be worth less than its locked CKB value
   *   - Content cannot be lost, censored, or altered
   *   - The CKB inside is always yours (you can get it back)
   *   - Larger content requires more CKB to be locked
   *
   * CKB Capacity Formula:
   *   minimum_capacity = 8 (capacity field)
   *                    + 32 (lock code_hash)
   *                    + 1  (lock hash_type)
   *                    + 20 (lock args = pubkey hash)
   *                    + 32 (type code_hash)
   *                    + 1  (type hash_type)
   *                    + 32 (type args = spore_id)
   *                    + len(data) (content_type + content + encoding overhead)
   */
  console.log("Step 2: Understanding Spore Economics");
  console.log("  ".padEnd(70, "-"));
  console.log();
  console.log("  Traditional NFT (ERC-721):                  Spore Digital Object:");
  console.log("  - NFT is a contract storage entry          - Spore is a real on-chain cell");
  console.log("  - Content on IPFS or centralized server    - ALL content stored on-chain");
  console.log("  - No inherent floor value                  - Backed by locked CKB tokens");
  console.log("  - Content can disappear or change          - Content is permanent, immutable");
  console.log("  - Recipient needs ETH for gas              - Recipient needs NO CKB");
  console.log("  - Destroying NFT burns it forever          - Melting Spore returns your CKB");
  console.log();

  // Calculate what a simple text Spore would cost
  const EXAMPLE_TEXT = "Hello from CKB! This Spore is a fully on-chain digital object.";
  const exampleContentType = "text/plain";
  const exampleData = encodeSporeData(
    exampleContentType,
    encodeText(EXAMPLE_TEXT)
  );

  // Cell base capacity (fields without data): 8 + 32 + 1 + 20 + 32 + 1 + 32 = 126 bytes
  const cellBaseBytes = 126n;
  const dataSizeBytes = BigInt(exampleData.length);
  const minimumCapacityShannons = (cellBaseBytes + dataSizeBytes) * 100_000_000n;

  console.log(`  Example text content: "${EXAMPLE_TEXT}"`);
  console.log(`  Encoded data size: ${exampleData.length} bytes`);
  console.log(
    `  Minimum CKB to lock: ${formatCkb(minimumCapacityShannons)}`
  );
  console.log(`  (${cellBaseBytes} base bytes + ${dataSizeBytes} data bytes = ${cellBaseBytes + dataSizeBytes} total)`);
  console.log();

  // --------------------------------------------------------------------------
  // STEP 3: Create a Spore Cluster (Collection)
  // --------------------------------------------------------------------------
  /**
   * SPORE CLUSTERS
   *
   * A Cluster is a CKB cell that represents a collection or grouping of Spores.
   * Think of it like a folder, album, or collection name for related Spores.
   *
   * Cluster cell structure:
   *   Cell {
   *     capacity:  <minimum to cover cell size>
   *     lock:      <creator's lock script>
   *     type:      <Cluster type script { code_hash: CLUSTER_SCRIPT, args: cluster_id }>
   *     data:      <Molecule-encoded ClusterData { name: bytes, description: bytes }>
   *   }
   *
   * Once created, a Spore can reference a Cluster's ID in its cluster_id field.
   * The Cluster type script then validates that the Spore's cluster_id is correct.
   *
   * Creating a Cluster is a separate transaction from creating a Spore.
   * You create the Cluster first, then reference its ID when creating Spores.
   *
   * WHY CLUSTERS?
   *   - Organize related digital objects (e.g., all cards in a game set)
   *   - Enable collection-level metadata (name, description)
   *   - Allow marketplace categorization and discovery
   *   - Support creator identity: all your Spores can share a cluster
   */
  console.log("Step 3: Creating a Spore Cluster (Collection)");
  console.log("  ".padEnd(70, "-"));
  console.log();
  console.log("  A Cluster groups related Spores into a named collection.");
  console.log("  We will create a cluster called 'CKB Learning Series'.");
  console.log();

  // Get creator's lock script
  const creatorLock = (await ccc.Address.fromString(creatorAddress, client)).script;

  // We need a cell to use as input to derive the Cluster ID
  // The Cluster ID is derived from the first input cell's OutPoint
  // Find a suitable input cell
  let clusterInputCell: ccc.Cell | null = null;
  for await (const cell of client.findCellsByLock(creatorLock, undefined, true)) {
    clusterInputCell = cell;
    break;
  }

  if (!clusterInputCell) {
    console.error(
      "  ERROR: No live cells found. Fund your testnet address first."
    );
    console.error("  Faucet: https://faucet.nervos.org/");
    console.error("  Address:", creatorAddress);
    await demonstrateSporeConceptsOnly(signer, client);
    return;
  }

  // The Cluster ID is the hash of the first input's OutPoint
  // This ensures uniqueness: no two Clusters can have the same ID
  const clusterOutPoint = clusterInputCell.outPoint;
  const clusterId = await computeTypeId(clusterOutPoint);

  console.log("  Cluster ID (derived from first input OutPoint):");
  console.log("  ", bytesToHex(clusterId));
  console.log();

  // Encode the Cluster data (name + description)
  const clusterName = "CKB Learning Series";
  const clusterDescription =
    "A collection of educational Spore Digital Objects demonstrating the CKB Spore protocol.";
  const clusterData = encodeClusterData(clusterName, clusterDescription);

  console.log("  Cluster name:       ", clusterName);
  console.log("  Cluster description:", clusterDescription);
  console.log("  Encoded data size:  ", clusterData.length, "bytes");
  console.log();

  // Build the Cluster output cell
  const clusterCapacityBytes =
    BigInt(8 + 32 + 1 + 20 + 32 + 1 + 32 + clusterData.length);
  const clusterCapacityShannons = clusterCapacityBytes * 100_000_000n;

  const clusterOutput: ccc.CellOutputLike = {
    capacity: clusterCapacityShannons,
    lock: creatorLock,
    type: {
      codeHash: CLUSTER_SCRIPT_CODE_HASH,
      hashType: SCRIPT_HASH_TYPE,
      args: bytesToHex(clusterId),
    },
  };

  console.log(
    "  Required CKB to lock in Cluster:",
    formatCkb(clusterCapacityShannons)
  );
  console.log();

  // Build the Cluster creation transaction
  const clusterTx = ccc.Transaction.from({
    cellDeps: [CLUSTER_CELL_DEP],
    inputs: [{ previousOutput: clusterOutPoint }],
    outputs: [clusterOutput],
    outputsData: [bytesToHex(clusterData)],
  });

  // Complete the transaction: add more inputs to cover capacity + fee
  try {
    await clusterTx.completeFeeBy(signer);
    await signer.signTransaction(clusterTx);
    const clusterTxHash = await client.sendTransaction(clusterTx);

    console.log("  Cluster creation transaction sent!");
    console.log("  Transaction hash:", clusterTxHash);
    console.log(
      "  Explorer: https://pudge.explorer.nervos.org/transaction/" + clusterTxHash
    );
    console.log();

    // Wait briefly before creating the Spore (the cluster needs to be in mempool)
    await new Promise((r) => setTimeout(r, 3000));

    // --------------------------------------------------------------------------
    // STEP 4: Create a Spore with Text Content
    // --------------------------------------------------------------------------
    /**
     * Now we create the actual Spore Digital Object.
     *
     * The Spore cell contains:
     *   - lock: creator's lock script (the owner; can transfer or melt)
     *   - type: Spore type script with unique Spore ID as args
     *   - data: Molecule-encoded SporeData {
     *       content_type: "text/plain"
     *       content:      <UTF-8 bytes of our message>
     *       cluster_id:   <the Cluster ID we just created>
     *     }
     *
     * The Spore type script performs these checks when creating a Spore:
     *   1. The Spore ID must equal the TypeID derived from the first input
     *   2. The cluster_id (if present) must reference a live Cluster cell
     *   3. The content_type must be non-empty
     *   4. The content must be non-empty
     *
     * When TRANSFERRING a Spore, the type script checks:
     *   1. The Spore's data (content_type, content, cluster_id) is unchanged
     *   2. Only the lock script (owner) changes
     *
     * When MELTING (destroying) a Spore, the type script checks:
     *   1. The creator's lock script is in the transaction's inputs
     *      (only the original creator can melt their Spores)
     *
     * SUPPORTED CONTENT TYPES:
     *   - text/plain        -- Plain text messages, poems, etc.
     *   - text/markdown     -- Rich text with Markdown formatting
     *   - image/png         -- PNG images (stored as raw bytes)
     *   - image/jpeg        -- JPEG images
     *   - image/svg+xml     -- SVG vector graphics (text-based)
     *   - image/gif         -- Animated GIFs
     *   - audio/mp3         -- Audio files
     *   - video/mp4         -- Video files
     *   - application/json  -- JSON-structured data
     *   - application/lua   -- Lua scripts (for interactive/programmable DOBs!)
     *   - model/obj         -- 3D object files
     */
    console.log("Step 4: Creating a Spore with Text Content");
    console.log("  ".padEnd(70, "-"));
    console.log();

    // The text content stored fully on-chain
    const sporeText =
      "Hello from the CKB blockchain! This text is stored 100% on-chain " +
      "in a Spore Digital Object. Unlike IPFS-linked NFTs, this content " +
      "cannot be lost, censored, or altered. The CKB locked here is mine " +
      "to reclaim by melting this Spore. Created at block: " +
      (await client.getTipBlockNumber()).toString();

    console.log("  Content-Type: text/plain");
    console.log("  Content preview:", sporeText.slice(0, 60) + "...");
    console.log("  Total content length:", sporeText.length, "characters");
    console.log();

    // Encode the SporeData: content_type + content + cluster_id
    const sporeData = encodeSporeData(
      "text/plain",
      encodeText(sporeText),
      clusterId // Link this Spore to our newly created Cluster
    );

    console.log("  Encoded SporeData size:", sporeData.length, "bytes");

    // Find an input cell for the Spore creation (to derive the Spore ID)
    let sporeInputCell: ccc.Cell | null = null;
    for await (const cell of client.findCellsByLock(creatorLock, undefined, true)) {
      sporeInputCell = cell;
      break;
    }

    if (!sporeInputCell) {
      console.error("  ERROR: No live cells found after cluster creation.");
      return;
    }

    // Derive the Spore ID (same mechanism as Cluster ID)
    const sporeOutPoint = sporeInputCell.outPoint;
    const sporeId = await computeTypeId(sporeOutPoint);

    console.log("  Spore ID:", bytesToHex(sporeId));
    console.log();

    // Calculate minimum capacity for the Spore cell
    const sporeCapacityBytes = BigInt(8 + 32 + 1 + 20 + 32 + 1 + 32 + sporeData.length);
    const sporeCapacityShannons = sporeCapacityBytes * 100_000_000n;

    console.log(
      "  CKB to lock in Spore:",
      formatCkb(sporeCapacityShannons)
    );
    console.log(
      "  (This CKB is yours to recover by melting the Spore later)"
    );
    console.log();

    // Build the Spore output cell
    const sporeOutput: ccc.CellOutputLike = {
      capacity: sporeCapacityShannons,
      lock: creatorLock,
      type: {
        codeHash: SPORE_SCRIPT_CODE_HASH,
        hashType: SCRIPT_HASH_TYPE,
        args: bytesToHex(sporeId),
      },
    };

    // Build the Spore creation transaction
    // The transaction must also include the Cluster cell as a cell dep
    // so the Spore script can verify the cluster_id is valid
    const sporeTx = ccc.Transaction.from({
      cellDeps: [
        SPORE_CELL_DEP,
        CLUSTER_CELL_DEP,
        // Include the Cluster cell as a cell dep for cluster_id verification
        {
          outPoint: {
            txHash: clusterTxHash,
            index: 0,
          },
          depType: "code",
        },
      ],
      inputs: [{ previousOutput: sporeOutPoint }],
      outputs: [sporeOutput],
      outputsData: [bytesToHex(sporeData)],
    });

    await sporeTx.completeFeeBy(signer);
    await signer.signTransaction(sporeTx);
    const sporeTxHash = await client.sendTransaction(sporeTx);

    console.log("  Spore creation transaction sent!");
    console.log("  Transaction hash:", sporeTxHash);
    console.log(
      "  Explorer: https://pudge.explorer.nervos.org/transaction/" + sporeTxHash
    );
    console.log();

    // --------------------------------------------------------------------------
    // STEP 5: Reading and Querying the Spore
    // --------------------------------------------------------------------------
    /**
     * Now let's demonstrate how to read a Spore from the blockchain.
     *
     * To find a Spore, you can:
     *   a) Query by the Spore type script (filter by code_hash + args)
     *   b) Fetch the transaction that created it and look at the outputs
     *   c) Use the @spore-sdk/core helper functions
     *
     * Once you have the Spore cell, you:
     *   1. Read the type script args to get the Spore ID
     *   2. Read the data field (hex-encoded bytes)
     *   3. Decode the Molecule-encoded SporeData
     *   4. Parse content-type and content based on the MIME type
     */
    console.log("Step 5: Reading and Querying the Spore");
    console.log("  ".padEnd(70, "-"));
    console.log();
    console.log("  Waiting for transaction to be visible...");
    await new Promise((r) => setTimeout(r, 5000));

    // Query the Spore by its type script
    const sporeTypeScript: ccc.ScriptLike = {
      codeHash: SPORE_SCRIPT_CODE_HASH,
      hashType: SCRIPT_HASH_TYPE,
      args: bytesToHex(sporeId),
    };

    let foundSpore: ccc.Cell | null = null;
    for await (const cell of client.findCellsByType(sporeTypeScript, undefined, true)) {
      foundSpore = cell;
      break;
    }

    if (foundSpore) {
      console.log("  Spore found on-chain!");
      console.log();
      console.log("  Cell Details:");
      console.log("    OutPoint:", foundSpore.outPoint.txHash, "#", foundSpore.outPoint.index);
      console.log("    Capacity:", formatCkb(foundSpore.cellOutput.capacity));
      console.log("    Lock:", foundSpore.cellOutput.lock.codeHash.slice(0, 18) + "...");
      console.log("    Type args (Spore ID):", foundSpore.cellOutput.type?.args);
      console.log();

      // Decode the SporeData from the cell's hex-encoded data
      const rawData = hexToBytes(foundSpore.outputData);
      const decoded = decodeSporeData(rawData);

      console.log("  Decoded SporeData:");
      console.log("    content-type:", decoded.contentType);
      console.log("    content length:", decoded.content.length, "bytes");
      if (decoded.clusterId) {
        console.log(
          "    cluster_id:",
          bytesToHex(decoded.clusterId)
        );
      }
      console.log();

      // Display the content based on content-type
      if (decoded.contentType.startsWith("text/")) {
        const textContent = decodeText(decoded.content);
        console.log("  Decoded text content:");
        console.log("  " + "─".repeat(60));
        // Wrap long lines for display
        const words = textContent.split(" ");
        let line = "  ";
        for (const word of words) {
          if (line.length + word.length > 68) {
            console.log(line);
            line = "  " + word + " ";
          } else {
            line += word + " ";
          }
        }
        if (line.trim()) console.log(line);
        console.log("  " + "─".repeat(60));
      } else if (decoded.contentType.startsWith("image/")) {
        console.log(
          "  Image data:",
          decoded.content.length,
          "bytes (" + decoded.contentType + ")"
        );
        console.log(
          "  (Binary image data would be rendered by a Spore-aware application)"
        );
      } else {
        console.log(
          "  Content:",
          decoded.content.length,
          "bytes (" + decoded.contentType + ")"
        );
      }

      console.log();
    } else {
      console.log(
        "  Spore not yet indexed. It will appear at:",
        "https://pudge.explorer.nervos.org/transaction/" + sporeTxHash
      );
      console.log();
    }

    // --------------------------------------------------------------------------
    // STEP 6: Understanding Melting (Spore Destruction)
    // --------------------------------------------------------------------------
    /**
     * MELTING A SPORE
     *
     * "Melting" is the Spore protocol's term for destroying a Spore cell.
     * When you melt a Spore:
     *   1. The Spore cell is consumed as a transaction input
     *   2. No new Spore cell is created as output
     *   3. The CKB that was locked inside the Spore is returned to you
     *   4. The content is permanently gone from the live cell set
     *
     * The Spore type script enforces that only the original CREATOR can melt
     * a Spore. Even if the Spore has been transferred to another address,
     * the creator's lock hash is encoded into the Spore at creation time,
     * and only a transaction including the creator's cell can melt it.
     *
     * This is different from "burning" in most NFT standards, where burning
     * simply means sending to a 0x000...0 address and the locked ETH/tokens
     * are gone forever. With Spore melting, you ALWAYS get your CKB back.
     *
     * MELT TRANSACTION STRUCTURE:
     *   Inputs:  [Spore cell]              <- the Spore being destroyed
     *   Outputs: [Cell for creator]        <- receives the unlocked CKB
     *
     * Code (not run here to preserve the Spore for demonstration):
     *
     *   const meltTx = ccc.Transaction.from({
     *     cellDeps: [SPORE_CELL_DEP],
     *     inputs: [{ previousOutput: sporeOutPoint }],  // the Spore
     *     outputs: [{
     *       capacity: sporeCapacityShannons - FEE,      // CKB returned
     *       lock: creatorLock,                          // back to creator
     *     }],
     *   });
     *   await meltTx.completeFeeBy(signer);
     *   await signer.signTransaction(meltTx);
     *   const meltTxHash = await client.sendTransaction(meltTx);
     *
     * After melting, the Spore is gone. The content no longer exists in any
     * live cell. The CKB is unlocked and can be used for other purposes.
     */
    console.log("Step 6: Melting (Destroying) a Spore -- Concept");
    console.log("  ".padEnd(70, "-"));
    console.log();
    console.log("  We will NOT melt the Spore we just created (to preserve it).");
    console.log("  But here is what melting does:");
    console.log();
    console.log("  MELT TRANSACTION:");
    console.log("    Input:  [Spore cell] -- consumes the Spore forever");
    console.log("    Output: [Creator cell] -- receives the unlocked CKB");
    console.log();
    console.log("  After melting:");
    console.log("    - The Spore content is gone from the live cell set");
    console.log("    - The CKB returns to the creator's wallet");
    console.log(
      "    - Floor value guarantee: creator always recovers " +
      formatCkb(sporeCapacityShannons)
    );
    console.log();
    console.log(
      "  The creator's 'floor value' for this Spore:",
      formatCkb(sporeCapacityShannons)
    );
    console.log(
      "  (Regardless of what happens in the NFT market, the CKB is always there)"
    );
    console.log();

  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("  Transaction failed:", err.message);
      console.log();
      console.log("  Falling back to demonstration mode (no actual transactions).");
      console.log();
    }
    await demonstrateSporeConceptsOnly(signer, client);
    return;
  }

  // --------------------------------------------------------------------------
  // STEP 7: Spore vs Traditional NFT Comparison
  // --------------------------------------------------------------------------
  await displayComparisonTable();

  // --------------------------------------------------------------------------
  // STEP 8: Real-World Use Cases
  // --------------------------------------------------------------------------
  displayUseCases();

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  displaySummary();
}

// ============================================================================
// HELPER: Compute TypeID (Spore/Cluster ID derivation)
// ============================================================================

/**
 * Computes a TypeID-like identifier from an OutPoint.
 *
 * Spore and Cluster IDs are derived from the first input cell's OutPoint
 * using the same mechanism as CKB's TypeID system.
 *
 * The derivation: blake2b( tx_hash || le_uint64(output_index) || 0x...typeID )
 *
 * In practice, this is computed by the Spore type script itself during
 * transaction validation. The @spore-sdk/core handles this automatically.
 * This simplified version uses the OutPoint fields for demonstration.
 *
 * @param outPoint - The first input's OutPoint
 * @returns 32-byte Spore/Cluster ID
 */
async function computeTypeId(outPoint: ccc.OutPoint): Promise<Uint8Array> {
  // For demonstration: construct a pseudo-ID from the outPoint
  // In real usage, the Spore SDK computes this correctly using blake2b
  const txHashBytes = hexToBytes(outPoint.txHash);
  const indexBytes = new Uint8Array(4);
  const indexView = new DataView(indexBytes.buffer);
  indexView.setUint32(0, Number(outPoint.index), true);

  // Concatenate txHash + index for the ID seed
  const seed = new Uint8Array(txHashBytes.length + indexBytes.length);
  seed.set(txHashBytes, 0);
  seed.set(indexBytes, txHashBytes.length);

  // Use a simple hash approximation for demonstration
  // Production code uses: ccc.hashCkb(seed) or blake2b256
  const hashResult = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hashResult[i] = seed[i % seed.length] ^ (i * 0x13) ^ 0xab;
  }

  return hashResult;
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// DEMONSTRATION MODE (when balance is insufficient for real transactions)
// ============================================================================

/**
 * Demonstrates Spore concepts using existing testnet data without
 * sending any transactions. Useful for learning even without test CKB.
 */
async function demonstrateSporeConceptsOnly(
  signer: ccc.SignerCkbPrivateKey,
  client: ccc.ClientPublicTestnet
): Promise<void> {
  console.log("=".repeat(70));
  console.log("  DEMONSTRATION MODE (Concepts Only)");
  console.log("=".repeat(70));
  console.log();

  // Show what SporeData encoding looks like
  console.log("Step A: SporeData Encoding (Molecule Format)");
  console.log("  ".padEnd(70, "-"));
  console.log();

  const textContent = "This is a sample text Spore stored fully on-chain!";
  const contentType = "text/plain";
  const encoded = encodeSporeData(contentType, encodeText(textContent));

  console.log("  Content-Type:", contentType);
  console.log("  Content:", textContent);
  console.log();
  console.log("  Molecule-encoded bytes (", encoded.length, "bytes):");
  console.log("  " + bytesToHex(encoded).slice(0, 66) + "...");
  console.log();
  console.log("  Molecule Table Header:");
  const view = new DataView(encoded.buffer);
  console.log("    Total size:        ", view.getUint32(0, true), "bytes");
  console.log("    content_type starts at offset:", view.getUint32(4, true));
  console.log("    content starts at offset:     ", view.getUint32(8, true));
  console.log("    cluster_id starts at offset:  ", view.getUint32(12, true));
  console.log();

  // Decode it back
  const decoded = decodeSporeData(encoded);
  console.log("  Round-trip decode:");
  console.log("    content-type:", decoded.contentType);
  console.log("    content:     ", decodeText(decoded.content));
  console.log("    cluster_id:   null (not set)");
  console.log();

  // Show ClusterData encoding
  console.log("Step B: ClusterData Encoding");
  console.log("  ".padEnd(70, "-"));
  console.log();

  const clusterName = "My Digital Art Collection";
  const clusterDesc = "A curated collection of on-chain digital art on CKB.";
  const clusterData = encodeClusterData(clusterName, clusterDesc);

  console.log("  Cluster name:       ", clusterName);
  console.log("  Cluster description:", clusterDesc);
  console.log("  Encoded size:       ", clusterData.length, "bytes");
  console.log();

  // Show capacity calculations for different content types
  console.log("Step C: Capacity Requirements for Different Content Types");
  console.log("  ".padEnd(70, "-"));
  console.log();

  const examples = [
    { type: "text/plain", content: "Hello, World!", size: 13 },
    { type: "text/plain", content: "A 1000-character text message", size: 1000 },
    { type: "image/svg+xml", content: "<svg>simple SVG</svg>", size: 500 },
    { type: "image/png", content: "A small 64x64 PNG icon", size: 5_000 },
    { type: "image/png", content: "A full 1024x768 PNG image", size: 500_000 },
    { type: "application/json", content: '{"traits":{"rarity":"rare"}}', size: 200 },
    { type: "application/lua", content: "Interactive Lua DOB script", size: 2_000 },
  ];

  const BASE_BYTES = 8 + 32 + 1 + 20 + 32 + 1 + 32; // 126 bytes
  const OVERHEAD = 16; // Molecule table header overhead

  console.log(
    "  Content Type".padEnd(22) +
    "Example Size".padEnd(16) +
    "Min CKB Locked"
  );
  console.log("  " + "─".repeat(58));

  for (const ex of examples) {
    const totalBytes = BASE_BYTES + OVERHEAD + ex.type.length + ex.size;
    const ckb = totalBytes / 100_000_000;
    const ckbFormatted = ckb.toFixed(8) + " CKB";
    console.log(
      "  " +
      ex.type.padEnd(22) +
      (ex.size.toLocaleString() + " bytes").padEnd(16) +
      ckbFormatted
    );
  }

  console.log();
  console.log("  Key insight: Larger content requires more locked CKB.");
  console.log("  But ALL of that CKB is recoverable by melting the Spore!");
  console.log();

  // Show existing Spore cells on testnet (read-only)
  console.log("Step D: Querying Existing Spore Cells on Testnet");
  console.log("  ".padEnd(70, "-"));
  console.log();
  console.log("  Searching for Spore cells (type script code_hash match)...");

  const sporeTypeSearch: ccc.ScriptLike = {
    codeHash: SPORE_SCRIPT_CODE_HASH,
    hashType: SCRIPT_HASH_TYPE,
    args: "0x",
  };

  let sporeCount = 0;
  try {
    for await (const cell of client.findCellsByType(sporeTypeSearch, undefined, true)) {
      if (sporeCount === 0) {
        console.log("  Found Spore cells on testnet!");
        console.log();
      }
      sporeCount++;

      if (sporeCount <= 3) {
        console.log(`  Spore #${sporeCount}:`);
        console.log(
          "    OutPoint: ",
          cell.outPoint.txHash.slice(0, 20) + "..."
        );
        console.log("    Capacity: ", formatCkb(cell.cellOutput.capacity));
        console.log(
          "    Spore ID: ",
          cell.cellOutput.type?.args?.slice(0, 20) + "..."
        );

        // Try to decode the SporeData
        try {
          const rawData = hexToBytes(cell.outputData);
          if (rawData.length >= 16) {
            const decoded = decodeSporeData(rawData);
            console.log("    Content-Type:", decoded.contentType);
            if (decoded.contentType.startsWith("text/")) {
              const text = decodeText(decoded.content);
              const preview = text.slice(0, 50);
              console.log(
                "    Content:     ",
                preview + (text.length > 50 ? "..." : "")
              );
            } else {
              console.log(
                "    Content:     ",
                decoded.content.length + " bytes of binary data"
              );
            }
          }
        } catch {
          console.log("    Content:      (unable to decode)");
        }
        console.log();
      }

      if (sporeCount >= 5) break;
    }

    if (sporeCount === 0) {
      console.log("  No Spore cells found in current query window.");
      console.log("  Try the Spore explorer: https://a-simple-demo.spore.pro/");
    } else {
      console.log(`  Found ${sporeCount} Spore cells (showing first 3).`);
    }
  } catch {
    console.log(
      "  Could not query Spore cells (network may be slow or script prefix not indexed)."
    );
  }

  console.log();

  // Comparison table and use cases
  await displayComparisonTable();
  displayUseCases();
  displaySummary();
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

async function displayComparisonTable(): Promise<void> {
  console.log("Step 7: Spore vs Traditional NFTs -- Detailed Comparison");
  console.log("  ".padEnd(70, "-"));
  console.log();

  const rows = [
    ["Feature", "Spore (CKB)", "ERC-721 (Ethereum)"],
    ["─".repeat(24), "─".repeat(22), "─".repeat(20)],
    ["Content storage", "100% on-chain (cell data)", "Usually IPFS or HTTP"],
    ["Content permanence", "Permanent (on-chain)", "Depends on IPFS/server"],
    ["Floor value", "Locked CKB (always yours)", "None (pure market price)"],
    ["Destruction", "Melt: get CKB back", "Burn: value gone"],
    ["Receive w/o funds", "Yes (cell is self-funded)", "No (need ETH for gas)"],
    ["Content mutability", "Immutable by protocol", "Mutable if URL changes"],
    ["Storage cost", "Locked CKB (recovered)", "Gas paid + IPFS fees"],
    ["Content types", "MIME (any type)", "Usually just metadata URI"],
    ["Collections", "Clusters (on-chain)", "Contract-level grouping"],
    ["Interactive DOBs", "Lua scripting support", "Not natively supported"],
    ["Interoperability", "CKB cell composability", "OpenSea/standard markets"],
    ["Verification", "On-chain script rules", "Off-chain IPFS hash"],
  ];

  for (const [feature, spore, erc721] of rows) {
    console.log(
      "  " +
      feature.padEnd(24) +
      spore.padEnd(26) +
      erc721
    );
  }

  console.log();
}

function displayUseCases(): void {
  console.log("Step 8: Real-World Use Cases for Spore Digital Objects");
  console.log("  ".padEnd(70, "-"));
  console.log();

  console.log("  1. .bit DOMAIN NAMES");
  console.log("     .bit domain names are implemented as Spore DOBs.");
  console.log("     Each domain is a Spore with JSON data containing the domain info.");
  console.log("     Transferring the domain = transferring the Spore cell.");
  console.log();

  console.log("  2. GAMING ASSETS");
  console.log("     Game items (swords, armor, characters) as Spores.");
  console.log("     JSON content-type stores item stats and metadata.");
  console.log("     Lua content-type enables interactive/programmable items.");
  console.log("     Trading items = transferring Spore cells between players.");
  console.log();

  console.log("  3. DIGITAL CERTIFICATES");
  console.log("     Academic degrees, certifications, and credentials.");
  console.log("     The certificate content is permanently on-chain.");
  console.log("     Cannot be revoked by the issuer (lock script protection).");
  console.log("     Cannot be faked (Spore type script validates creation).");
  console.log();

  console.log("  4. ON-CHAIN DIGITAL ART");
  console.log("     SVG images or pixel art stored directly on-chain.");
  console.log("     Artists lock CKB proportional to artwork file size.");
  console.log("     Collectors can verify the complete artwork is on-chain.");
  console.log("     No IPFS dependency means the art exists as long as CKB exists.");
  console.log();

  console.log("  5. PROGRAMMABLE DOBs (application/lua)");
  console.log("     Spores with Lua scripts as content create interactive objects.");
  console.log("     The DOB's behavior is defined by the Lua program, fully on-chain.");
  console.log("     Example: an on-chain pet that 'evolves' based on transaction history.");
  console.log();

  console.log("  6. MUSIC AND AUDIO");
  console.log("     Musicians can store short audio clips directly on CKB.");
  console.log("     Fans own the actual audio bytes, not just a playlist link.");
  console.log("     The music exists forever as long as CKB blockchain exists.");
  console.log();
}

function displaySummary(): void {
  console.log("=".repeat(70));
  console.log("  Lesson 14 Complete: Digital Objects with Spore");
  console.log("=".repeat(70));
  console.log();
  console.log("  Key Takeaways:");
  console.log();
  console.log(
    "  1. INTRINSIC VALUE: Spores lock CKB tokens. Melting always returns them."
  );
  console.log(
    "     This gives every Spore a guaranteed minimum floor value."
  );
  console.log();
  console.log(
    "  2. FULLY ON-CHAIN: ALL content lives in cell data. No IPFS. No servers."
  );
  console.log(
    "     Content is as permanent as the CKB blockchain itself."
  );
  console.log();
  console.log(
    "  3. ZERO-COST RECEIVING: Recipients need NO CKB to receive a Spore."
  );
  console.log(
    "     The Spore cell already contains enough capacity."
  );
  console.log();
  console.log(
    "  4. CLUSTERS: Organize related Spores into named collections."
  );
  console.log(
    "     Cluster cells are separate on-chain objects with name/description."
  );
  console.log();
  console.log(
    "  5. CONTENT TYPES: MIME types (text/plain, image/png, application/lua)"
  );
  console.log(
    "     enable diverse digital objects -- art, games, certificates, and more."
  );
  console.log();
  console.log(
    "  6. MOLECULE ENCODING: SporeData uses Molecule binary serialization,"
  );
  console.log(
    "     CKB's standard format for structured on-chain data."
  );
  console.log();
  console.log("  Resources:");
  console.log("    - Spore SDK: https://github.com/sporeprotocol/spore-sdk");
  console.log("    - Spore Demo: https://a-simple-demo.spore.pro/");
  console.log("    - Spore Docs: https://docs.spore.pro/");
  console.log("    - CKB Explorer (Testnet): https://pudge.explorer.nervos.org/");
  console.log();
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch((error: unknown) => {
  console.error("\nError occurred:");
  if (error instanceof Error) {
    console.error("  Message:", error.message);

    if (error.message.includes("Resolve") || error.message.includes("no live")) {
      console.error("\n  This usually means the account has no CKB cells.");
      console.error("  Get testnet CKB from: https://faucet.nervos.org/");
    }

    if (error.message.includes("PoolRejected")) {
      console.error("\n  The transaction was rejected by the mempool.");
      console.error("  Common causes:");
      console.error("    - Insufficient balance to cover capacity + fee");
      console.error("    - Invalid Spore data encoding");
      console.error("    - Cluster ID does not exist on-chain");
      console.error("    - Spore script validation failure");
    }

    if (error.message.includes("cluster")) {
      console.error("\n  Cluster-related error.");
      console.error("  Make sure the Cluster transaction is confirmed before");
      console.error("  creating Spores that reference it.");
    }
  } else {
    console.error(error);
  }
  process.exit(1);
});
