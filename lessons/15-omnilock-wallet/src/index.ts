/**
 * Lesson 15: Omnilock - The Universal Lock Script
 *
 * Omnilock is a lock script developed by the CKB community that supports
 * multiple authentication methods in a single, unified interface. Instead
 * of deploying a separate lock script for every wallet type (CKB, Ethereum,
 * Bitcoin, etc.), Omnilock provides ONE on-chain program that understands
 * many different signature formats.
 *
 * WHY OMNILOCK?
 * =============
 * CKB's native lock (secp256k1-blake160) works well for CKB-native wallets,
 * but the ecosystem needs to support users coming from other chains. Someone
 * with only a MetaMask wallet should be able to hold and spend CKB assets
 * without generating a separate CKB keypair.
 *
 * Omnilock solves this by:
 *   1. Supporting multiple authentication modes (one flag byte selects the mode)
 *   2. Adding optional features: Anyone-Can-Pay, time locks, supply-limit locks
 *   3. Being upgradeable via its hash_type 'type' deployment
 *
 * REAL-WORLD USAGE:
 *   - JoyID wallet uses Omnilock with a WebAuthn mode (passkeys)
 *   - Portal Wallet bridged Ethereum users to CKB via the Ethereum mode
 *   - Any dApp wanting to support MetaMask users uses Omnilock
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================
// SECTION 1: The Auth Byte Structure
// ============================================================
//
// Omnilock's args field has a precise binary layout:
//
//   [0]        : 1 byte  - Auth flag (selects authentication mode)
//   [1..20]    : 20 bytes - Auth content (pubkey hash, script hash, etc.)
//   [21]       : 1 byte  - Optional "omnilockFlags" for ACP / time-lock / etc.
//   [22..]     : optional further config depending on flags
//
// The first 21 bytes (flag + 20 content bytes) are called the "auth bytes".
//
// Auth flag values:
//   0x00 - secp256k1-blake160  (standard CKB key, same as native lock)
//   0x01 - Ethereum            (MetaMask / eth_sign compatible)
//   0x02 - EOS                 (EOS account signatures)
//   0x03 - Tron                (Tron account signatures)
//   0x04 - Bitcoin             (Bitcoin P2PKH compatible)
//   0x05 - Dogecoin            (Dogecoin P2PKH compatible)
//   0x06 - CKB Multi-sig       (M-of-N threshold signatures)
//   0x07 - LOCK_SCRIPT         (delegate auth to another lock script)
//   0xFC - Exec                (verify via exec syscall)
//   0xFD - Dynamic Linking     (verify via dynamic linking)
//   0xFE - Owner Lock          (use owner's existing lock for auth)

/**
 * Encode the Omnilock args bytes for a given authentication mode.
 *
 * @param authFlag   - The 1-byte flag selecting the auth mode (e.g. 0x00, 0x01, 0x06)
 * @param authContent - 20 bytes of auth-specific content (pubkey hash, multisig hash, etc.)
 * @param omnilockFlags - Optional 1-byte flags for ACP / time lock features
 * @returns Hex string of the assembled args
 */
function buildOmnilockArgs(
  authFlag: number,
  authContent: Uint8Array,
  omnilockFlags?: number
): string {
  if (authContent.length !== 20) {
    throw new Error(
      `authContent must be exactly 20 bytes, got ${authContent.length}`
    );
  }

  // Start with flag byte + 20 content bytes = 21 bytes minimum
  const parts: number[] = [authFlag, ...authContent];

  // Append the omnilock flags byte if any features are requested
  if (omnilockFlags !== undefined) {
    parts.push(omnilockFlags);
  }

  const bytes = new Uint8Array(parts);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// SECTION 2: Omnilock Deployment Info (Testnet)
// ============================================================
//
// Omnilock is deployed as a shared, immutable on-chain binary.
// All wallets reference this same deployment via cell deps.
// Using hash_type 'type' means the reference is stable even if
// the binary is upgraded to a new cell (the type script identity stays).

const OMNILOCK_TESTNET = {
  // The code_hash of the Omnilock type script (used for hash_type 'type')
  codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb",
  hashType: "type" as const,
  // The cell dep pointing to the deployed Omnilock binary on testnet
  cellDep: {
    outPoint: {
      txHash: "0x3d4af230dc95b2d958edc95676e5e2de02dd48cdaa07a5be11ee4bfe9d2a2660",
      index: 0,
    },
    depType: "depGroup" as const,
  },
};

// ============================================================
// SECTION 3: Mode 0x00 — secp256k1-blake160 Auth
// ============================================================
//
// This is the default CKB authentication mode. It is identical in
// behaviour to the native secp256k1-blake160 lock script, but wrapped
// inside Omnilock so that ACP / time-lock extensions are available.
//
// auth content = blake160(compressed_pubkey)
//   where blake160(data) = first 20 bytes of blake2b-256(data)
//
// A wallet using this mode can be identified by:
//   - Omnilock code_hash in its lock script
//   - args[0] == 0x00

function describeMode0x00(pubkeyHash: Uint8Array): void {
  console.log("\n=== Mode 0x00: secp256k1-blake160 (CKB Native) ===");
  console.log(
    "This mode behaves like the standard CKB lock script but adds Omnilock features."
  );
  console.log("The auth content is the 20-byte blake160 hash of your secp256k1 pubkey.");

  const args = buildOmnilockArgs(0x00, pubkeyHash);
  console.log(`Omnilock args (mode 0x00): ${args}`);
  console.log(`  Byte 0 (flag): 0x00  => secp256k1-blake160 mode`);
  console.log(`  Bytes 1-20   : blake160 of owner's public key`);

  // The lock script for this cell would look like:
  const lockScript = {
    codeHash: OMNILOCK_TESTNET.codeHash,
    hashType: OMNILOCK_TESTNET.hashType,
    args: args,
  };
  console.log("Lock script:", JSON.stringify(lockScript, null, 2));
}

// ============================================================
// SECTION 4: Mode 0x01 — Ethereum Auth
// ============================================================
//
// This mode verifies an Ethereum personal_sign signature. MetaMask and
// other Ethereum wallets use this format when you call eth_sign or
// personal_sign. The message is prefixed with:
//   "\x19Ethereum Signed Message:\n" + len(message)
//
// auth content = keccak160(uncompressed_pubkey)
//   where keccak160 = last 20 bytes of keccak256(pubkey_without_prefix)
//   This is exactly the Ethereum address format!
//
// So the auth content IS the Ethereum address (all 20 bytes).
//
// This is how Portal Wallet and early JoyID implementations worked:
// your Ethereum wallet address directly controls CKB assets.

function describeMode0x01(ethereumAddress: string): void {
  console.log("\n=== Mode 0x01: Ethereum-Compatible Auth ===");
  console.log(
    "This mode accepts Ethereum personal_sign signatures from MetaMask."
  );
  console.log("The auth content is the 20-byte Ethereum address (keccak160 of pubkey).");
  console.log(
    "This is how cross-chain wallets bridge ETH users to CKB without new keypairs."
  );

  // Parse the Ethereum address into 20 bytes
  const addressHex = ethereumAddress.startsWith("0x")
    ? ethereumAddress.slice(2)
    : ethereumAddress;
  const addressBytes = new Uint8Array(
    addressHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  );

  const args = buildOmnilockArgs(0x01, addressBytes);
  console.log(`Omnilock args (mode 0x01): ${args}`);
  console.log(`  Byte 0 (flag): 0x01  => Ethereum auth mode`);
  console.log(`  Bytes 1-20   : Ethereum address = ${ethereumAddress}`);

  console.log("");
  console.log("When spending a cell with this lock:");
  console.log("  1. The transaction hash is formatted as an Ethereum personal_sign message");
  console.log("  2. The user signs with MetaMask (or any Ethereum wallet)");
  console.log("  3. Omnilock recovers the signer's address from the signature");
  console.log("  4. It checks that recovered address == auth content");
}

// ============================================================
// SECTION 5: Mode 0x06 — M-of-N Multisig
// ============================================================
//
// Omnilock mode 0x06 supports threshold (M-of-N) multisig natively.
// The auth content is the blake160 hash of a serialized multisig script.
//
// The multisig script bytes are structured as:
//   Byte 0: reserved (0x00)
//   Byte 1: require_first_n (must include sigs from first N signers)
//   Byte 2: threshold (M — minimum signatures required)
//   Byte 3: pubkeys_count (N — total possible signers)
//   Bytes 4+: pubkeys (20 bytes each, blake160 of each signer's pubkey)
//
// auth content = blake160( multisig_script_bytes )
//
// The witness must contain all required signatures + the multisig script.

function buildMultisigScript(
  threshold: number,
  pubkeyHashes: Uint8Array[],
  requireFirstN: number = 0
): Uint8Array {
  // Validate parameters
  if (threshold > pubkeyHashes.length) {
    throw new Error(
      `Threshold ${threshold} cannot exceed number of keys ${pubkeyHashes.length}`
    );
  }
  if (pubkeyHashes.some((pk) => pk.length !== 20)) {
    throw new Error("Each pubkey hash must be exactly 20 bytes");
  }

  // Build the multisig script bytes
  const header = new Uint8Array([
    0x00,                    // reserved byte
    requireFirstN,          // require_first_n
    threshold,              // M (minimum required)
    pubkeyHashes.length,    // N (total signers)
  ]);

  // Concatenate header + all 20-byte pubkey hashes
  const total = header.length + pubkeyHashes.length * 20;
  const result = new Uint8Array(total);
  result.set(header, 0);
  pubkeyHashes.forEach((pk, i) => result.set(pk, 4 + i * 20));

  return result;
}

function describeMode0x06(
  threshold: number,
  signerPubkeyHashes: Uint8Array[]
): void {
  console.log("\n=== Mode 0x06: M-of-N Multisig ===");
  console.log(
    `This mode requires ${threshold}-of-${signerPubkeyHashes.length} signatures.`
  );
  console.log("The multisig configuration is hashed and stored as the auth content.");

  const multisigScript = buildMultisigScript(threshold, signerPubkeyHashes);
  console.log(`Multisig script bytes (${multisigScript.length} bytes):`);
  console.log(
    "  [0]   reserved = 0x00"
  );
  console.log(
    `  [1]   require_first_n = 0 (no order requirement)`
  );
  console.log(
    `  [2]   threshold = ${threshold} (need ${threshold} sigs)`
  );
  console.log(
    `  [3]   pubkeys_count = ${signerPubkeyHashes.length} (${signerPubkeyHashes.length} total signers)`
  );
  signerPubkeyHashes.forEach((pk, i) => {
    const hex = "0x" + Array.from(pk).map((b) => b.toString(16).padStart(2, "0")).join("");
    console.log(`  [${4 + i * 20}..${4 + (i + 1) * 20 - 1}] signer ${i + 1}: ${hex}`);
  });

  // Simulate blake160 hash (in production, use actual blake2b)
  // For demo purposes we use a placeholder
  const placeholderHash = new Uint8Array(20).fill(0xab);
  const args = buildOmnilockArgs(0x06, placeholderHash);
  console.log(`\nOmnilock args (mode 0x06): ${args}`);
  console.log(`  Byte 0 (flag): 0x06 => multisig mode`);
  console.log(`  Bytes 1-20   : blake160(multisig_script_bytes)`);

  console.log("");
  console.log("To spend a multisig cell:");
  console.log("  1. Each required signer produces a signature over the tx hash");
  console.log("  2. The witness contains all signatures + the full multisig script");
  console.log("  3. Omnilock hashes the provided script, checks it matches args[1..20]");
  console.log("  4. It verifies each signature against its corresponding pubkey");
}

// ============================================================
// SECTION 6: Anyone-Can-Pay (ACP) Mode
// ============================================================
//
// The omnilock_flags byte (args[21]) controls optional Omnilock features.
// Bit 0 (value 0x01) enables Anyone-Can-Pay mode.
//
// ACP CONCEPT:
// In normal CKB, spending a cell requires the owner's signature. The owner
// must be online and willing to sign for every incoming payment. This creates
// poor UX: you can't just "send CKB to an address" unless the recipient has
// set up their cell first.
//
// ACP flips this: a cell with ACP enabled can RECEIVE CKB or tokens from
// ANYONE without the owner signing. The lock script allows spending (to add
// more funds to a new output) as long as:
//   1. The output cell has the same lock as the input cell
//   2. The output has at least as much CKB (or UDT) as the input
//   3. Optionally, a minimum increment is enforced
//
// MINIMUM AMOUNT CONFIG:
// Additional bytes in args configure the minimum payment amount:
//   args[22]: minimum CKB amount exponent (0 means no minimum)
//   args[23]: minimum UDT amount exponent (0 means no minimum)
//
// The actual minimum = 10^exponent CKB shannon or UDT smallest unit.
// Using an exponent (not raw amount) saves space and prevents dust attacks.

/**
 * Build Omnilock args for an ACP-enabled cell.
 *
 * @param authFlag      - Auth mode (0x00, 0x01, etc.)
 * @param authContent   - 20 bytes for the auth mode
 * @param minCkbExp     - Minimum CKB increment exponent (0 = no minimum)
 * @param minUdtExp     - Minimum UDT increment exponent (0 = no minimum)
 */
function buildAcpOmnilockArgs(
  authFlag: number,
  authContent: Uint8Array,
  minCkbExp: number = 0,
  minUdtExp: number = 0
): string {
  if (authContent.length !== 20) {
    throw new Error("authContent must be 20 bytes");
  }

  const ACP_FLAG = 0x01; // Bit 0 = Anyone-Can-Pay enabled

  // args = flag(1) + content(20) + omnilockFlags(1) + minCkbExp(1) + minUdtExp(1)
  const parts: number[] = [authFlag, ...authContent, ACP_FLAG, minCkbExp, minUdtExp];
  const bytes = new Uint8Array(parts);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function describeAcpMode(pubkeyHash: Uint8Array): void {
  console.log("\n=== Anyone-Can-Pay (ACP) Mode ===");
  console.log(
    "ACP cells can receive CKB or tokens WITHOUT the owner's signature."
  );
  console.log("Anyone can top-up an ACP cell — great for payment addresses.\n");

  // No minimum: any amount of CKB can be added
  const argsNoMin = buildAcpOmnilockArgs(0x00, pubkeyHash, 0, 0);
  console.log("ACP with no minimum (any amount accepted):");
  console.log(`  args: ${argsNoMin}`);
  console.log("  args[21] = 0x01 => ACP enabled");
  console.log("  args[22] = 0x00 => no minimum CKB increment");
  console.log("  args[23] = 0x00 => no minimum UDT increment");

  // Minimum 100 CKB (10^2 shannon = 100 shannon; but more practically
  // the exponent applies to shannon, so 10^10 = 10 CKB)
  const argsMin100 = buildAcpOmnilockArgs(0x00, pubkeyHash, 10, 0);
  console.log("\nACP with minimum 10 CKB increment (exponent=10 => 10^10 shannon = 10 CKB):");
  console.log(`  args: ${argsMin100}`);
  console.log("  args[21] = 0x01 => ACP enabled");
  console.log("  args[22] = 0x0A => min CKB = 10^10 shannon = 10 CKB");
  console.log("  args[23] = 0x00 => no minimum UDT increment");

  console.log("\nHow ACP receiving works in a transaction:");
  console.log("  INPUT:  [ACP cell, capacity=100 CKB, lock=owner_omnilock_acp]");
  console.log("  OUTPUT: [ACP cell, capacity=110 CKB, lock=owner_omnilock_acp]  <- same lock");
  console.log("  (no signature from owner required — the 10 CKB difference is the payment)");
}

// ============================================================
// SECTION 7: Time-Lock Mode
// ============================================================
//
// Bit 1 of omnilockFlags (value 0x02) enables time locks.
// When set, additional bytes in args specify the earliest time
// at which the cell can be spent.
//
// Two kinds of time locks (mirrors CKB's since field types):
//   - Block-number lock: cell cannot be spent before block N
//   - Timestamp lock:    cell cannot be spent before Unix timestamp T
//   - Epoch lock:        cell cannot be spent before epoch E
//
// The time-lock config follows the same encoding as CKB's `since` field.
//
// Use cases:
//   - Vesting schedules: team tokens locked until a specific date
//   - Bonds: funds locked for a fixed period
//   - Time-delayed inheritance: estate distributed after N years
//   - Dispute resolution: challenge period before finalising a state
//
// Combining flags: ACP + time-lock = time-locked donation address
//   Anyone can donate, but owner cannot withdraw until the lock expires.

function describeTimeLock(): void {
  console.log("\n=== Time-Lock Mode (omnilockFlags bit 1) ===");
  console.log("Time-locked cells cannot be spent before a specified block/time.\n");

  const TIME_LOCK_FLAG = 0x02; // Bit 1 of omnilockFlags
  const ACP_PLUS_TIMELOCK = 0x03; // Bits 0+1: both ACP and time-lock

  console.log("omnilockFlags values:");
  console.log(`  0x00 => no extensions (standard Omnilock)`);
  console.log(`  0x01 => ACP only`);
  console.log(`  0x${TIME_LOCK_FLAG.toString(16).padStart(2, "0")} => time-lock only`);
  console.log(`  0x${ACP_PLUS_TIMELOCK.toString(16).padStart(2, "0")} => ACP + time-lock`);

  console.log("\nTime-lock value is stored as a CKB 'since' value (8 bytes):");
  console.log("  Bits 63-62: type (00=block, 01=epoch, 10=timestamp)");
  console.log("  Bit 63: relative(1) or absolute(0)");
  console.log("  Bits 47-0: the actual block/epoch/timestamp value");

  console.log("\nExample: lock until block 1,000,000");
  console.log("  since = 0x0000000000F42400 (absolute block height)");
  console.log("  Cell cannot be spent until the chain reaches block 1,000,000");
}

// ============================================================
// SECTION 8: Cross-Chain Auth Implications
// ============================================================
//
// Omnilock's Ethereum mode has profound cross-chain implications:
//
// 1. No new keypair needed:
//    A user with only MetaMask can receive and spend CKB assets immediately.
//    Their existing Ethereum private key works on CKB via Omnilock mode 0x01.
//
// 2. Message format compatibility:
//    Ethereum's personal_sign prepends "\x19Ethereum Signed Message:\n32"
//    before the 32-byte payload. Omnilock knows this and adjusts the
//    expected signature format.
//
// 3. Address derivation:
//    CKB address for an Ethereum user:
//      CKB address = encode(Omnilock{codeHash, hashType:type, args:[0x01, ethAddress]})
//    The displayed address is a CKB bech32 address, but it is controlled
//    by the Ethereum key pair.
//
// 4. Security model:
//    The security is equivalent to Ethereum's secp256k1 signing. The CKB
//    full node cannot tell the difference between a native CKB tx and a
//    cross-chain one — both are just RISC-V scripts that return 0 or error.
//
// 5. Gas abstraction:
//    Users can pay CKB transaction fees from their cross-chain controlled cells.
//    This creates a seamless experience: ETH users can use CKB dApps without
//    ever explicitly managing a CKB-native wallet.

function describeCrossChainImplications(): void {
  console.log("\n=== Cross-Chain Auth Implications ===");
  console.log("Omnilock allows existing Web3 wallets to control CKB assets natively.\n");

  console.log("Ethereum user flow:");
  console.log("  1. User has MetaMask with address 0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
  console.log("  2. Someone builds Omnilock args: 0x01 + <eth_address_bytes>");
  console.log("  3. That generates a CKB address the ETH user controls");
  console.log("  4. dApps ask MetaMask to sign the CKB tx hash as a personal_sign message");
  console.log("  5. The signature is placed in the CKB transaction witness");
  console.log("  6. CKB nodes run Omnilock, recover the ETH address, verify it matches args");
  console.log("  7. Transaction succeeds — ETH key just spent a CKB cell!");
  console.log("");
  console.log("JoyID (WebAuthn mode):");
  console.log("  JoyID uses Omnilock with a special WebAuthn/passkey auth mode.");
  console.log("  Users authenticate with Face ID or Touch ID — no seed phrase needed.");
  console.log("  The passkey signature is verified by Omnilock on-chain.");
  console.log("  This is only possible because CKB-VM can run any RISC-V code,");
  console.log("  including elliptic curve operations over different curves (P-256 for WebAuthn).");
}

// ============================================================
// SECTION 9: Building an Omnilock Address
// ============================================================
//
// A CKB address is just an encoding of a lock script.
// With ccc (CKB Components Collection), you can build addresses
// for any Omnilock mode without low-level byte manipulation.
//
// The ccc library has high-level helpers for Omnilock, but it is
// important to understand the underlying byte structure.

async function demonstrateOmnilockAddress(): Promise<void> {
  console.log("\n=== Building Omnilock Addresses with ccc ===");

  // Connect to CKB testnet
  const client = new ccc.ClientPublicTestnet();

  console.log("Connected to CKB testnet via ccc.ClientPublicTestnet()");
  console.log("");

  // Example: construct a Mode 0x00 address manually
  // In a real app, you would derive pubkeyHash from the user's keypair.
  // Here we use a well-known testnet example key hash for illustration.
  const examplePubkeyHash = new Uint8Array([
    0x36, 0xc3, 0x29, 0x68, 0x88, 0x66, 0x14, 0xf1,
    0x45, 0x96, 0x0a, 0x28, 0xd1, 0xb4, 0xe4, 0x96,
    0x54, 0x7c, 0xe3, 0x9e,
  ]);

  console.log("Mode 0x00 (secp256k1-blake160) Omnilock:");
  describeMode0x00(examplePubkeyHash);

  const exampleEthAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
  console.log("");
  describeMode0x01(exampleEthAddress);

  const signer1 = new Uint8Array(20).fill(0x11);
  const signer2 = new Uint8Array(20).fill(0x22);
  const signer3 = new Uint8Array(20).fill(0x33);
  describeMode0x06(2, [signer1, signer2, signer3]);

  describeAcpMode(examplePubkeyHash);
  describeTimeLock();
  describeCrossChainImplications();

  // Disconnect cleanly
  client.destroy();
}

// ============================================================
// SECTION 10: Summary Table
// ============================================================

function printSummaryTable(): void {
  console.log("\n=== Omnilock Auth Modes Summary ===\n");
  console.log(
    "Flag | Mode                    | Auth Content          | Real-World Usage"
  );
  console.log(
    "-----+-------------------------+-----------------------+--------------------------------"
  );
  console.log(
    "0x00 | secp256k1-blake160      | blake160(secp256k1pk) | CKB-native wallets"
  );
  console.log(
    "0x01 | Ethereum                | keccak160(ethpk)      | MetaMask, Portal Wallet"
  );
  console.log(
    "0x02 | EOS                     | EOS account hash      | EOS-ecosystem wallets"
  );
  console.log(
    "0x03 | Tron                    | Tron address bytes    | Tron wallets"
  );
  console.log(
    "0x04 | Bitcoin                 | Bitcoin P2PKH hash    | Bitcoin wallets"
  );
  console.log(
    "0x05 | Dogecoin                | Dogecoin address hash | Dogecoin wallets"
  );
  console.log(
    "0x06 | CKB multisig            | blake160(multisig_s.) | M-of-N treasury / DAO"
  );
  console.log(
    "0x07 | Lock script delegate    | blake160(lock_script) | Script-based auth"
  );
  console.log(
    "0xFE | Owner lock              | blake160(owner_lock)  | Advanced composability"
  );
  console.log("");
  console.log("Optional flags (args[21] bitmask):");
  console.log("  0x01 => Anyone-Can-Pay (ACP): receive without owner signature");
  console.log("  0x02 => Time-lock: cell unspendable before a given block/time");
  console.log("  0x03 => Both ACP and time-lock simultaneously");
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function main(): Promise<void> {
  console.log("======================================================");
  console.log("  Lesson 15: Omnilock - The Universal Lock Script");
  console.log("======================================================");
  console.log("");
  console.log("Omnilock is a single on-chain script that supports multiple");
  console.log("authentication methods via a 1-byte auth flag in its args.");
  console.log("");
  console.log("Key insight: Instead of deploying separate lock scripts for");
  console.log("each wallet type, ONE Omnilock script handles them all.");
  console.log("This reduces deployment cost and simplifies dApp development.");

  try {
    await demonstrateOmnilockAddress();
    printSummaryTable();
  } catch (err) {
    console.error("Error during demonstration:", err);
    process.exit(1);
  }

  console.log("\n======================================================");
  console.log("  End of Lesson 15");
  console.log("======================================================");
  console.log("");
  console.log("Key takeaways:");
  console.log("  1. Omnilock args[0] is the auth flag (selects signature type)");
  console.log("  2. Omnilock args[1..20] is the auth content (pubkey hash, etc.)");
  console.log("  3. Omnilock args[21] is omnilockFlags (ACP, time-lock bits)");
  console.log("  4. ACP lets cells receive funds without the owner's signature");
  console.log("  5. Time locks use the same encoding as CKB's 'since' field");
  console.log("  6. Ethereum mode: your ETH address works directly on CKB");
  console.log("  7. JoyID uses Omnilock to enable passkey/biometric auth");
}

main();
