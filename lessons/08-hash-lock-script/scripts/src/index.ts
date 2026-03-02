/**
 * ============================================================================
 * Lesson 08: Hash Lock Script — Off-Chain Interaction (TypeScript)
 * ============================================================================
 *
 * This script demonstrates the complete lifecycle of interacting with a
 * custom hash-lock script on CKB:
 *
 *   1. Understanding the hash-lock concept
 *   2. Computing blake2b hashes off-chain (matching on-chain behavior)
 *   3. Deploying the compiled script binary to the chain
 *   4. Creating cells locked with the hash-lock script
 *   5. Unlocking (spending) cells by providing the preimage as a witness
 *
 * IMPORTANT NOTES:
 *
 *   - Steps involving actual on-chain transactions require a running CKB
 *     devnet with the compiled hash-lock binary deployed. Since we cannot
 *     compile the RISC-V binary without the full CKB toolchain, some
 *     operations below are DEMONSTRATED conceptually with detailed
 *     explanations of what each step does.
 *
 *   - The blake2b hashing and transaction construction are REAL and
 *     functional — they use the CCC SDK exactly as you would in production.
 *
 *   - To run the full flow end-to-end, you would:
 *     a. Install the CKB RISC-V toolchain (capsule or ckb-script-templates)
 *     b. Compile the Rust contract to a RISC-V binary
 *     c. Start a local CKB devnet (ckb init --chain dev && ckb run)
 *     d. Deploy the binary and run this script against the devnet
 *
 * ============================================================================
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * TEST-ONLY private key for the deployer/sender account.
 *
 * This key is used on the local devnet or testnet only.
 * NEVER use this key (or any hardcoded key) on mainnet.
 *
 * On a devnet, this account is typically pre-funded with CKB
 * via the genesis block configuration.
 */
const DEPLOYER_PRIVATE_KEY =
  "0xd6013cd867d286ef84cc300ac6546013837df2b06c9f53c83b4c33c2417f6a07";

/**
 * The secret preimage for our hash lock demonstration.
 *
 * In a real-world scenario, this would be a cryptographically random
 * value. For educational purposes, we use a human-readable string.
 *
 * The PREIMAGE is the SECRET that locks and unlocks the cell.
 * Anyone who knows this preimage can spend the hash-locked cell.
 */
const SECRET_PREIMAGE = "ckb-hash-lock-lesson-08-secret";

// ============================================================================
// BLAKE2B HASHING (Off-Chain)
// ============================================================================

/**
 * CKB's blake2b personalization string.
 *
 * This MUST match the personalization used in the on-chain Rust script.
 * If we use a different personalization, the off-chain hash will not
 * match the on-chain hash, and the lock will never unlock.
 *
 * The personalization is a domain separation string — it ensures that
 * blake2b hashes computed for CKB are distinct from blake2b hashes
 * computed for other applications (even with the same input data).
 */
const CKB_BLAKE2B_PERSONALIZATION = new Uint8Array(
  Array.from("ckb-default-hash").map((c) => c.charCodeAt(0))
);

/**
 * Computes the CKB-standard blake2b-256 hash of the given data.
 *
 * This function mirrors the on-chain blake2b_256() function in our
 * Rust script. It uses:
 *   - Output length: 32 bytes (256 bits)
 *   - Personalization: "ckb-default-hash"
 *
 * The CCC SDK provides a built-in blake2b hasher that is configured
 * with CKB's personalization, so we use that.
 *
 * @param data - The bytes to hash
 * @returns The 32-byte blake2b-256 hash as a hex string
 */
function ckbBlake2b256(data: Uint8Array): string {
  // The CCC SDK provides a hashCkb utility that computes the blake2b hash
  // with CKB's standard personalization ("ckb-default-hash").
  //
  // Under the hood, this:
  //   1. Creates a blake2b instance with personalization = "ckb-default-hash"
  //   2. Feeds the input data
  //   3. Returns the 32-byte hash as a hex string prefixed with "0x"
  const hasher = new ccc.HasherCkb();
  hasher.update(data);
  return hasher.digest();
}

/**
 * Converts a UTF-8 string to a Uint8Array.
 *
 * CKB operates on raw bytes, not strings. When we use a string as
 * a preimage, we must first convert it to bytes. The encoding matters —
 * the same string encoded differently (UTF-8 vs UTF-16) produces
 * different bytes and therefore different hashes.
 *
 * We use UTF-8 encoding, which is the standard for CKB.
 */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts a hex string (with 0x prefix) to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to a hex string with 0x prefix.
 */
function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// ============================================================================
// HELPER: Format CKB amounts
// ============================================================================

const SHANNONS_PER_CKB = 100_000_000n;

function formatCkb(shannons: bigint): string {
  const ckb = Number(shannons) / Number(SHANNONS_PER_CKB);
  return `${ckb.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} CKB`;
}

// ============================================================================
// MAIN: HASH LOCK LIFECYCLE DEMONSTRATION
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(72));
  console.log("  Lesson 08: Hash Lock Script — Off-Chain Interaction");
  console.log("=".repeat(72));
  console.log();

  // ==========================================================================
  // PHASE 1: Off-Chain Hash Computation
  // ==========================================================================
  //
  // Before we interact with the blockchain at all, let us compute the
  // blake2b hash of our secret preimage. This hash will be stored in
  // the script args when we create a hash-locked cell.
  // ==========================================================================

  console.log("-".repeat(72));
  console.log("  PHASE 1: Computing the Hash Lock Off-Chain");
  console.log("-".repeat(72));
  console.log();

  // Convert the secret preimage string to bytes
  const preimageBytes = stringToBytes(SECRET_PREIMAGE);
  console.log(`  Secret preimage (string): "${SECRET_PREIMAGE}"`);
  console.log(`  Secret preimage (hex):    ${bytesToHex(preimageBytes)}`);
  console.log(`  Preimage length:          ${preimageBytes.length} bytes`);
  console.log();

  // Compute the blake2b-256 hash
  //
  // This hash will be stored in the lock script args. Anyone who wants
  // to spend the cell must provide a value that hashes to this same hash.
  const preimageHash = ckbBlake2b256(preimageBytes);
  console.log(`  blake2b-256 hash:         ${preimageHash}`);
  console.log(`  Hash length:              32 bytes (256 bits)`);
  console.log();
  console.log("  This hash will be stored in the lock script args.");
  console.log("  Anyone with the preimage can unlock the cell.");
  console.log();

  // Verify the hash is deterministic
  const verificationHash = ckbBlake2b256(preimageBytes);
  console.log(
    `  Verification (same input → same output): ${preimageHash === verificationHash ? "PASS" : "FAIL"}`
  );

  // Show that different input produces different hash
  const differentPreimage = stringToBytes("wrong-preimage");
  const differentHash = ckbBlake2b256(differentPreimage);
  console.log(
    `  Different input → different hash:         ${preimageHash !== differentHash ? "PASS" : "FAIL"}`
  );
  console.log(`    Wrong preimage hash: ${differentHash}`);
  console.log();

  // ==========================================================================
  // PHASE 2: Connect to CKB and Set Up Signer
  // ==========================================================================

  console.log("-".repeat(72));
  console.log("  PHASE 2: Connecting to CKB Network");
  console.log("-".repeat(72));
  console.log();

  // Connect to the CKB testnet.
  //
  // For a full end-to-end flow with a custom script, you would
  // connect to a local devnet instead:
  //   const client = new ccc.Client("http://localhost:8114");
  //
  // We use testnet here to demonstrate the CCC SDK patterns.
  const client = new ccc.ClientPublicTestnet();
  console.log("  Connected to CKB Testnet (Pudge)");

  // Create a signer from the deployer private key
  const signer = new ccc.SignerCkbPrivateKey(client, DEPLOYER_PRIVATE_KEY);
  const deployerAddress = await signer.getInternalAddress();
  console.log(`  Deployer address: ${deployerAddress}`);

  // Check the deployer's balance
  const balance = await signer.getBalance();
  console.log(`  Deployer balance: ${formatCkb(balance)}`);
  console.log();

  // ==========================================================================
  // PHASE 3: Script Deployment (Conceptual Walkthrough)
  // ==========================================================================
  //
  // To use a custom script on CKB, you must first deploy the compiled
  // RISC-V binary to the chain. Here is how it works:
  //
  // 1. COMPILE: Use the CKB RISC-V toolchain to compile main.rs into
  //    a RISC-V ELF binary (the actual executable that runs in CKB-VM).
  //
  // 2. DEPLOY: Create a cell on-chain whose DATA field contains the
  //    compiled binary. This cell is called a "code cell."
  //
  // 3. REFERENCE: Other cells reference this code cell through their
  //    lock script's code_hash and hash_type:
  //
  //    - hash_type = "data1":
  //      code_hash = blake2b(binary_data)
  //      The VM loads the code from any cell whose data hashes to code_hash.
  //
  //    - hash_type = "type":
  //      code_hash = blake2b(type_script_of_code_cell)
  //      The VM loads the code from a cell whose type script hashes to
  //      code_hash. This allows upgrading the script by replacing the
  //      code cell while keeping the same type script.
  //
  // ==========================================================================

  console.log("-".repeat(72));
  console.log("  PHASE 3: Script Deployment (Conceptual)");
  console.log("-".repeat(72));
  console.log();

  // In a real deployment, you would read the compiled binary:
  //
  //   import { readFileSync } from "fs";
  //   const scriptBinary = readFileSync("../../contracts/hash-lock/build/release/hash-lock");
  //
  // For this demonstration, we use a placeholder to show the process.
  console.log("  Step 3a: Reading compiled RISC-V binary");
  console.log("    (Requires CKB RISC-V toolchain — see README for setup)");
  console.log();
  console.log("    In a real deployment:");
  console.log(
    '    const binary = readFileSync("contracts/hash-lock/build/release/hash-lock");'
  );
  console.log();

  // Compute the code_hash of the script binary
  //
  // The code_hash uniquely identifies the script. When a cell's lock script
  // has this code_hash and hash_type = "data1", CKB-VM will load and execute
  // the binary from the code cell whose data hashes to this value.
  console.log("  Step 3b: Computing code_hash of the binary");
  console.log("    code_hash = blake2b_256(script_binary)");
  console.log();

  // Create a deployment transaction
  //
  // The deployment transaction creates a cell whose data field contains
  // the compiled script binary. This is just a regular CKB transaction —
  // there is nothing special about "deploying" a script. You are simply
  // creating a cell that holds the binary as data.
  console.log("  Step 3c: Creating deployment transaction");
  console.log("    The deployment transaction:");
  console.log("      Input:  A cell owned by the deployer (for CKB capacity)");
  console.log("      Output: A new cell with:");
  console.log("        - data: <the compiled RISC-V binary>");
  console.log(
    "        - capacity: enough CKB to cover the binary size + cell overhead"
  );
  console.log("        - lock: deployer's lock script (so deployer owns it)");
  console.log("        - type: (optional) a type script for upgradeability");
  console.log();

  // Here is what the actual deployment code would look like:
  console.log("  Step 3d: Deployment code example:");
  console.log("    ```");
  console.log("    const deployTx = ccc.Transaction.from({");
  console.log("      outputs: [{");
  console.log("        lock: deployerLockScript,");
  console.log("      }],");
  console.log("      outputsData: [scriptBinaryHex],");
  console.log("    });");
  console.log("    await deployTx.completeFeeBy(signer);");
  console.log("    await signer.signTransaction(deployTx);");
  console.log("    const deployTxHash = await client.sendTransaction(deployTx);");
  console.log("    ```");
  console.log();

  // After deployment, we know the code cell's outPoint (txHash + index)
  // and can compute the code_hash from the binary data.
  console.log("  Step 3e: After deployment, record:");
  console.log("    - Deploy tx hash: 0x<deploy_tx_hash>");
  console.log("    - Code cell outPoint: { txHash: 0x..., index: 0 }");
  console.log("    - code_hash: blake2b_256(binary) = 0x<code_hash>");
  console.log();

  // ==========================================================================
  // PHASE 4: Creating a Hash-Locked Cell
  // ==========================================================================
  //
  // Now we create a cell whose lock script uses our hash-lock.
  // The cell's lock script is:
  //   {
  //     code_hash: <hash of the deployed script binary>,
  //     hash_type: "data1",
  //     args: <blake2b-256 hash of the preimage>
  //   }
  //
  // This cell can ONLY be consumed by a transaction that provides the
  // correct preimage in its witness data.
  // ==========================================================================

  console.log("-".repeat(72));
  console.log("  PHASE 4: Creating a Hash-Locked Cell (Conceptual)");
  console.log("-".repeat(72));
  console.log();

  // Construct the hash-lock script
  //
  // This is the lock script that will guard the cell. It references our
  // deployed hash-lock binary via code_hash and stores the expected hash
  // in args.
  const PLACEHOLDER_CODE_HASH =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

  console.log("  Step 4a: Constructing the hash-lock script");
  console.log("    {");
  console.log(`      code_hash: "${PLACEHOLDER_CODE_HASH}",`);
  console.log('      hash_type: "data1",');
  console.log(`      args: "${preimageHash}"`);
  console.log("    }");
  console.log();
  console.log("    - code_hash: identifies which script code to execute");
  console.log('    - hash_type "data1": means code_hash = hash of the binary data');
  console.log("    - args: the 32-byte blake2b hash of our secret preimage");
  console.log();

  // Build the transaction that creates the hash-locked cell
  //
  // This is a conceptual demonstration of what the transaction looks like.
  // In a real implementation with a deployed script, this would be actual
  // executable code.

  console.log("  Step 4b: Building the creation transaction");
  console.log();

  // Here is what the code would look like:
  console.log("    Code:");
  console.log("    ```");
  console.log("    // Build the hash-lock script object");
  console.log("    const hashLockScript = ccc.Script.from({");
  console.log(`      codeHash: "${PLACEHOLDER_CODE_HASH}",`);
  console.log('      hashType: "data1",');
  console.log(`      args: "${preimageHash}",`);
  console.log("    });");
  console.log();
  console.log("    // Create a transaction with a hash-locked output");
  console.log("    const lockTx = ccc.Transaction.from({");
  console.log("      outputs: [{");
  console.log("        lock: hashLockScript, // <-- Our custom hash lock!");
  console.log("      }],");
  console.log('      outputsData: ["0x"],   // No cell data needed');
  console.log("    });");
  console.log();
  console.log("    // Set the capacity (how much CKB to lock)");
  console.log("    const lockAmount = 200n * 100_000_000n; // 200 CKB");
  console.log("    lockTx.outputs[0].capacity = lockAmount;");
  console.log();
  console.log("    // Complete the transaction (add inputs, change, fee)");
  console.log("    await lockTx.completeFeeBy(signer);");
  console.log("    await signer.signTransaction(lockTx);");
  console.log("    const lockTxHash = await client.sendTransaction(lockTx);");
  console.log("    ```");
  console.log();

  console.log("  Step 4c: After confirmation, the cell exists on-chain:");
  console.log("    {");
  console.log("      capacity: 200 CKB,");
  console.log("      lock: {");
  console.log("        code_hash: <hash-lock code hash>,");
  console.log('        hash_type: "data1",');
  console.log(`        args: ${preimageHash}`);
  console.log("      },");
  console.log("      type: null,");
  console.log("      data: 0x");
  console.log("    }");
  console.log();
  console.log("  This cell is now LOCKED. It can only be consumed by someone");
  console.log(`  who knows the preimage: "${SECRET_PREIMAGE}"`);
  console.log();

  // ==========================================================================
  // PHASE 5: Unlocking (Spending) the Hash-Locked Cell
  // ==========================================================================
  //
  // To spend the hash-locked cell, we must:
  //   1. Reference it as an input in a new transaction
  //   2. Provide the preimage in the witness (so the on-chain script can verify it)
  //   3. Create output cell(s) for the unlocked CKB
  //
  // When CKB processes this transaction:
  //   a. CKB sees the input cell has a hash-lock lock script
  //   b. CKB loads and executes the hash-lock binary in CKB-VM
  //   c. The script loads args (expected hash) and witness (preimage)
  //   d. The script computes blake2b(preimage) and compares to expected hash
  //   e. If they match: script returns 0 (success), input is consumed
  //   f. If they don't match: script returns non-zero, transaction rejected
  // ==========================================================================

  console.log("-".repeat(72));
  console.log("  PHASE 5: Unlocking the Hash-Locked Cell (Conceptual)");
  console.log("-".repeat(72));
  console.log();

  console.log("  Step 5a: Preparing the unlock transaction");
  console.log();
  console.log("    To unlock, we provide the preimage as witness data.");
  console.log(`    Preimage: "${SECRET_PREIMAGE}"`);
  console.log(`    Preimage (hex): ${bytesToHex(preimageBytes)}`);
  console.log();

  // The unlock transaction
  console.log("  Step 5b: Building the unlock transaction");
  console.log();
  console.log("    Code:");
  console.log("    ```");
  console.log("    // Create the unlock transaction");
  console.log("    const unlockTx = ccc.Transaction.from({");
  console.log("      inputs: [{");
  console.log("        previousOutput: {");
  console.log("          txHash: lockTxHash,  // The tx that created the locked cell");
  console.log("          index: 0,            // Output index of the locked cell");
  console.log("        },");
  console.log("      }],");
  console.log("      outputs: [{");
  console.log("        lock: recipientLockScript, // Where to send the unlocked CKB");
  console.log("      }],");
  console.log('      outputsData: ["0x"],');
  console.log("    });");
  console.log();
  console.log("    // Set the witness to the preimage");
  console.log("    // The on-chain script will read this witness and verify the hash");
  console.log(
    '    const preimageHex = "0x" + Buffer.from(preimage).toString("hex");'
  );
  console.log("    unlockTx.witnesses[0] = preimageHex;");
  console.log();
  console.log("    // Set output capacity (locked amount minus fee)");
  console.log(
    "    unlockTx.outputs[0].capacity = 200n * 100_000_000n - fee;"
  );
  console.log();
  console.log("    // Send the transaction");
  console.log("    // Note: We do NOT need to sign with a private key!");
  console.log("    // The hash-lock script only checks the preimage, not a signature.");
  console.log("    const unlockTxHash = await client.sendTransaction(unlockTx);");
  console.log("    ```");
  console.log();

  console.log("  Step 5c: What happens on-chain during verification:");
  console.log();
  console.log("    1. CKB loads the hash-lock script binary into CKB-VM");
  console.log("    2. Script calls load_script() to get args (expected hash)");
  console.log(`       Expected hash: ${preimageHash}`);
  console.log("    3. Script calls load_witness(0, GroupInput) to get the preimage");
  console.log(`       Preimage bytes: ${bytesToHex(preimageBytes)}`);
  console.log("    4. Script computes blake2b_256(preimage)");

  // Actually compute the hash to show the verification
  const computedHash = ckbBlake2b256(preimageBytes);
  console.log(`       Computed hash:  ${computedHash}`);

  console.log("    5. Script compares computed hash with expected hash");
  console.log(
    `       Match: ${computedHash === preimageHash ? "YES -> Return 0 (SUCCESS)" : "NO -> Return 8 (ERROR_HASH_MISMATCH)"}`
  );
  console.log("    6. Transaction is APPROVED -- cell is consumed");
  console.log();

  // ==========================================================================
  // PHASE 6: Demonstrating a Failed Unlock Attempt
  // ==========================================================================
  //
  // What happens if someone tries to unlock the cell with the wrong preimage?
  // ==========================================================================

  console.log("-".repeat(72));
  console.log("  PHASE 6: Failed Unlock Attempt (Wrong Preimage)");
  console.log("-".repeat(72));
  console.log();

  const wrongPreimage = "this-is-not-the-secret";
  const wrongPreimageBytes = stringToBytes(wrongPreimage);
  const wrongHash = ckbBlake2b256(wrongPreimageBytes);

  console.log(`  Wrong preimage: "${wrongPreimage}"`);
  console.log(`  Wrong preimage (hex): ${bytesToHex(wrongPreimageBytes)}`);
  console.log(`  blake2b(wrong):  ${wrongHash}`);
  console.log(`  Expected hash:   ${preimageHash}`);
  console.log(`  Match: ${wrongHash === preimageHash ? "YES" : "NO -> ERROR_HASH_MISMATCH (error code 8)"}`);
  console.log();
  console.log("  The on-chain script would return error code 8,");
  console.log("  and CKB would reject the entire transaction.");
  console.log();
  console.log("  This is the security of the hash lock: without knowing the");
  console.log("  preimage, it is computationally infeasible to find a value");
  console.log("  that produces the correct hash. Blake2b is a cryptographic");
  console.log("  hash function — it is one-way and collision-resistant.");
  console.log();

  // ==========================================================================
  // PHASE 7: Understanding Cell Dependencies
  // ==========================================================================
  //
  // When a transaction uses a custom script, CKB needs to know where to
  // find the script's code. This is specified through "cell deps" in the
  // transaction.
  // ==========================================================================

  console.log("-".repeat(72));
  console.log("  PHASE 7: Understanding Cell Dependencies");
  console.log("-".repeat(72));
  console.log();

  console.log("  When a transaction references our hash-lock script, it must");
  console.log("  include a cell_dep pointing to the deployed code cell.");
  console.log();
  console.log("  Cell deps tell CKB: 'To execute this script, load the code");
  console.log("  from THIS cell.'");
  console.log();
  console.log("  Transaction structure with cell deps:");
  console.log("    {");
  console.log("      cell_deps: [");
  console.log("        {");
  console.log("          out_point: {");
  console.log("            tx_hash: <deploy_tx_hash>,");
  console.log("            index: 0");
  console.log("          },");
  console.log('          dep_type: "code"  // Load code directly from this cell');
  console.log("        }");
  console.log("      ],");
  console.log("      inputs: [ <the hash-locked cell> ],");
  console.log("      outputs: [ <where to send the unlocked CKB> ],");
  console.log("      witnesses: [ <the preimage> ]");
  console.log("    }");
  console.log();
  console.log('  dep_type can be:');
  console.log('    - "code": The cell data IS the script binary');
  console.log('    - "dep_group": The cell data is a list of out_points to');
  console.log("      multiple cells (used to bundle related dependencies)");
  console.log();

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  console.log("=".repeat(72));
  console.log("  Summary");
  console.log("=".repeat(72));
  console.log();
  console.log("  Hash Lock Lifecycle:");
  console.log();
  console.log("  1. SETUP (off-chain):");
  console.log("     - Choose a secret preimage");
  console.log("     - Compute hash = blake2b_256(preimage)");
  console.log();
  console.log("  2. DEPLOY (on-chain):");
  console.log("     - Compile Rust script to RISC-V binary");
  console.log("     - Deploy binary to a cell on CKB");
  console.log("     - Record the code_hash");
  console.log();
  console.log("  3. LOCK (on-chain):");
  console.log("     - Create a cell with lock script = hash-lock");
  console.log("     - Script args = blake2b hash of the preimage");
  console.log("     - The cell is now locked");
  console.log();
  console.log("  4. UNLOCK (on-chain):");
  console.log("     - Provide preimage in the transaction witness");
  console.log("     - On-chain script verifies blake2b(preimage) == args");
  console.log("     - If match: cell is consumed (CKB is freed)");
  console.log("     - If no match: transaction rejected");
  console.log();
  console.log("  Key Takeaways:");
  console.log();
  console.log("  - CKB scripts are Rust programs compiled to RISC-V");
  console.log("  - Scripts run in CKB-VM, a sandboxed virtual machine");
  console.log("  - Scripts use syscalls (load_script, load_witness) to read tx data");
  console.log("  - Lock scripts return 0 (success) or non-zero (failure)");
  console.log("  - Script code is deployed as cell data on-chain");
  console.log("  - Transactions reference script code via cell_deps");
  console.log("  - Hash locks enable trustless exchanges without identity");
  console.log();
}

// Run the main function
main().catch((error: unknown) => {
  console.error("\nError occurred:");
  if (error instanceof Error) {
    console.error("  Message:", error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
