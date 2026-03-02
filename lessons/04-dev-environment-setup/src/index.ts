/**
 * ============================================================================
 * Lesson 4: Setting Up Your Dev Environment
 * ============================================================================
 *
 * Welcome to the first hands-on lesson! In lessons 1-3 you learned about the
 * Cell Model, transaction anatomy, and capacity economics. Now it's time to
 * set up your local environment and verify that everything works.
 *
 * This script performs six key tasks:
 *
 *   1. Checks that required tools are installed (Node.js, npm, etc.)
 *   2. Connects to the CKB public testnet using the CCC SDK
 *   3. Fetches and displays testnet chain information (tip block, epoch, etc.)
 *   4. Generates a test address using CCC's key utilities
 *   5. Checks the balance of that test address (should be 0 for a fresh key)
 *   6. Prints a final verification summary
 *
 * Run this script with:
 *   npm install
 *   npm start
 *
 * Or directly:
 *   npx tsx src/index.ts
 */

import { ccc } from "@ckb-ccc/core";
import { runAllChecks, printCheckResults } from "./setup-check.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * We'll connect to the CKB public testnet (also known as "Pudge" or "Aggron").
 *
 * CKB has three main networks:
 *   - Mainnet (Lina): Production network, real CKBytes
 *   - Testnet (Pudge/Aggron): Public test network, faucet CKBytes
 *   - Devnet: Local network via OffCKB, instant blocks, pre-funded accounts
 *
 * For this lesson we use the public testnet so you can see real chain data
 * without needing to set up a local node.
 */

// ---------------------------------------------------------------------------
// Step 1: Environment Checks
// ---------------------------------------------------------------------------

/**
 * Run local environment verification checks.
 * This delegates to setup-check.ts which tests for Node.js, npm,
 * and optional tools like OffCKB and CKB-CLI.
 */
async function stepEnvironmentChecks(): Promise<boolean> {
  console.log("=".repeat(60));
  console.log("  STEP 1: Checking Local Environment");
  console.log("=".repeat(60));

  const results = await runAllChecks();
  const passed = printCheckResults(results);
  return passed;
}

// ---------------------------------------------------------------------------
// Step 2: Connect to CKB Testnet
// ---------------------------------------------------------------------------

/**
 * Creates a CCC client connected to the CKB public testnet.
 *
 * The CCC SDK (Common Chains Connector) is the recommended TypeScript/JavaScript
 * SDK for CKB development. It provides:
 *   - RPC client for querying chain state
 *   - Transaction building helpers
 *   - Cell collection and indexer integration
 *   - Wallet and signer abstractions
 *
 * `ccc.ClientPublicTestnet()` connects to the public testnet RPC endpoint
 * maintained by the Nervos Foundation. No API key is needed.
 */
async function stepConnectTestnet(): Promise<ccc.Client> {
  console.log("\n" + "=".repeat(60));
  console.log("  STEP 2: Connecting to CKB Testnet");
  console.log("=".repeat(60) + "\n");

  console.log("  Creating CCC client for CKB public testnet...");
  console.log("  (This connects to the Pudge/Aggron testnet)\n");

  // Create the testnet client. Under the hood, CCC will connect to
  // the public testnet RPC endpoint (https://testnet.ckb.dev).
  const client = new ccc.ClientPublicTestnet();

  // Verify connectivity by fetching the genesis block hash.
  // If this call succeeds, we know the RPC connection is working.
  try {
    const genesisBlock = await client.getBlockByNumber(0);

    if (genesisBlock) {
      console.log("  Successfully connected to CKB Testnet!");
      console.log(`  Genesis block hash: ${genesisBlock.header.hash}`);
    } else {
      console.log("  Connected, but genesis block returned null.");
      console.log("  The RPC endpoint may be experiencing issues.");
    }
  } catch (error) {
    console.error("  Failed to connect to CKB Testnet!");
    console.error("  Error:", error instanceof Error ? error.message : error);
    console.error("\n  Possible causes:");
    console.error("    - No internet connection");
    console.error("    - Testnet RPC endpoint is down");
    console.error("    - Firewall blocking outbound HTTPS");
    throw error;
  }

  return client;
}

// ---------------------------------------------------------------------------
// Step 3: Display Chain Information
// ---------------------------------------------------------------------------

/**
 * Fetches and displays information about the current state of the testnet.
 *
 * Key concepts:
 *   - Tip block: The most recent block in the chain
 *   - Epoch: CKB divides time into epochs (~4 hours on mainnet).
 *            Each epoch adjusts difficulty to target a consistent block time.
 *   - Block number: The height of the chain (how many blocks since genesis)
 *
 * This step demonstrates how to use CCC's RPC methods to query chain state.
 */
async function stepDisplayChainInfo(client: ccc.Client): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("  STEP 3: Testnet Chain Information");
  console.log("=".repeat(60) + "\n");

  try {
    // getTip() returns the header of the most recent block.
    // This is the fastest way to check the current chain height.
    const tip = await client.getTip();

    console.log("  Current Chain State:");
    console.log("  --------------------");
    console.log(`  Tip block number : ${tip}`);

    // Fetch the tip block header for more details.
    // The header contains the epoch, timestamp, and other metadata.
    const tipHeader = await client.getHeaderByNumber(tip);

    if (tipHeader) {
      // CKB timestamps are in milliseconds since Unix epoch.
      const timestamp = Number(tipHeader.timestamp);
      const date = new Date(timestamp);

      console.log(`  Tip block hash   : ${tipHeader.hash}`);
      console.log(`  Timestamp        : ${date.toISOString()}`);
      console.log(`  Epoch            : ${tipHeader.epoch}`);
      console.log(`  Compact target   : ${tipHeader.compactTarget}`);

      // Calculate how long ago the tip block was produced.
      // This gives a rough idea of chain liveness.
      const ageSeconds = Math.floor((Date.now() - timestamp) / 1000);
      if (ageSeconds < 120) {
        console.log(`  Block age        : ${ageSeconds} seconds ago (chain is live)`);
      } else {
        const ageMinutes = Math.floor(ageSeconds / 60);
        console.log(`  Block age        : ~${ageMinutes} minutes ago`);
      }
    }

    // Also fetch the current blockchain info using a lower-level RPC call.
    // This provides additional details about chain sync status.
    console.log("\n  Network Info:");
    console.log("  --------------------");
    console.log("  Network          : CKB Public Testnet (Pudge/Aggron)");
    console.log(`  Chain height     : ${tip} blocks`);
    console.log("  RPC Status       : Connected");
  } catch (error) {
    console.error("  Failed to fetch chain information!");
    console.error("  Error:", error instanceof Error ? error.message : error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Step 4: Create a Test Address
// ---------------------------------------------------------------------------

/**
 * Generates a random private key and derives a CKB testnet address from it.
 *
 * CKB addresses encode a lock script. The most common lock script is
 * the SECP256K1-Blake160 lock, which requires a signature from the
 * corresponding private key to spend cells.
 *
 * Address format:
 *   - Mainnet addresses start with "ckb1..."
 *   - Testnet addresses start with "ckt1..."
 *
 * IMPORTANT: This is a throwaway test key. Never use a key generated
 * this way for real funds. For production wallets, use proper key
 * management with hardware wallets or secure key storage.
 */
async function stepCreateTestAddress(client: ccc.Client): Promise<string> {
  console.log("\n" + "=".repeat(60));
  console.log("  STEP 4: Creating a Test Address");
  console.log("=".repeat(60) + "\n");

  // Generate a random 32-byte private key.
  // In production, you'd use a cryptographically secure source and
  // store the key safely. Here we just need a throwaway key for testing.
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);

  // Convert to hex string (CKB private keys are 32-byte hex strings).
  const privateKey = "0x" + Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  console.log("  Generated random private key (DO NOT use for real funds!)");
  console.log(`  Private key: ${privateKey.slice(0, 10)}...${privateKey.slice(-6)} (truncated for safety)\n`);

  // Create a signer from the private key.
  // A signer combines the private key with a client connection so it
  // can derive addresses and sign transactions for a specific network.
  const signer = new ccc.SignerCkbPrivateKey(client, privateKey);

  // Get the recommended address for this signer.
  // For testnet, this will be a "ckt1..." address.
  // The address encodes the SECP256K1-Blake160 lock script hash.
  const addresses = await signer.getAddresses();
  const address = addresses[0];

  console.log("  Test Address Details:");
  console.log("  --------------------");
  console.log(`  Address          : ${address}`);
  console.log(`  Network          : Testnet (ckt1... prefix)`);
  console.log(`  Lock script      : SECP256K1-Blake160 (default)`);

  // Explain what the address means.
  console.log("\n  What does this address represent?");
  console.log("  - It encodes a lock script that requires YOUR private key to unlock.");
  console.log("  - Anyone can send CKBytes to this address.");
  console.log("  - Only the holder of the private key can spend cells locked to it.");
  console.log("  - The 'ckt1' prefix indicates this is a testnet address.");

  return address;
}

// ---------------------------------------------------------------------------
// Step 5: Check Balance
// ---------------------------------------------------------------------------

/**
 * Queries the balance of the given address on the testnet.
 *
 * A "balance" in CKB is the sum of capacity across all live (unspent) cells
 * owned by the address's lock script. This is analogous to summing UTXOs
 * in Bitcoin.
 *
 * For a freshly generated address, the balance will be 0. To get test CKBytes,
 * you can use the CKB testnet faucet at:
 *   https://faucet.nervos.org/
 *
 * CKB amounts are denominated in "shannons" (1 CKB = 10^8 shannons),
 * similar to Bitcoin's satoshis.
 */
async function stepCheckBalance(
  client: ccc.Client,
  address: string
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("  STEP 5: Checking Address Balance");
  console.log("=".repeat(60) + "\n");

  try {
    // Parse the address back into a lock script.
    // CCC can convert between addresses and scripts.
    const lockScript = await ccc.Address.fromString(address, client).then(
      (addr) => addr.script
    );

    console.log("  Lock script (decoded from address):");
    console.log(`    Code hash : ${lockScript.codeHash}`);
    console.log(`    Hash type : ${lockScript.hashType}`);
    console.log(`    Args      : ${lockScript.args}`);

    // Count cells and sum capacity by iterating over live cells.
    // `findCellsByLock` returns an async iterator over all unspent cells
    // that match the given lock script.
    let totalCapacity = BigInt(0);
    let cellCount = 0;

    for await (const cell of client.findCellsByLock(lockScript)) {
      totalCapacity += cell.cellOutput.capacity;
      cellCount++;
    }

    // Convert shannons to CKBytes for display.
    // 1 CKByte = 100,000,000 shannons (10^8)
    const ckbAmount = Number(totalCapacity) / 1e8;

    console.log("\n  Balance:");
    console.log("  --------------------");
    console.log(`  Live cells       : ${cellCount}`);
    console.log(`  Total capacity   : ${totalCapacity.toString()} shannons`);
    console.log(`  Total CKBytes    : ${ckbAmount.toFixed(8)} CKB`);

    if (cellCount === 0) {
      console.log("\n  This is a fresh address with no cells (expected!).");
      console.log("  To get test CKBytes, visit the faucet:");
      console.log("  https://faucet.nervos.org/");
      console.log("  Paste your address and request testnet CKB.");
    }
  } catch (error) {
    console.error("  Failed to check balance!");
    console.error("  Error:", error instanceof Error ? error.message : error);
    // Don't re-throw — balance check failure shouldn't block the summary.
  }
}

// ---------------------------------------------------------------------------
// Step 6: Verification Summary
// ---------------------------------------------------------------------------

/**
 * Prints a final summary of all verification steps.
 *
 * This gives the student a clear picture of what's working and what
 * still needs attention before moving on to the next lesson.
 */
function stepSummary(checks: {
  envReady: boolean;
  connected: boolean;
  chainInfo: boolean;
  addressCreated: boolean;
  balanceChecked: boolean;
}): void {
  console.log("\n" + "=".repeat(60));
  console.log("  STEP 6: Setup Verification Summary");
  console.log("=".repeat(60) + "\n");

  const items = [
    { label: "Local environment tools", ok: checks.envReady },
    { label: "CKB testnet connectivity", ok: checks.connected },
    { label: "Chain info retrieval", ok: checks.chainInfo },
    { label: "Test address generation", ok: checks.addressCreated },
    { label: "Balance query", ok: checks.balanceChecked },
  ];

  for (const item of items) {
    const icon = item.ok ? "[PASS]" : "[FAIL]";
    console.log(`  ${icon} ${item.label}`);
  }

  const allPassed = items.every((i) => i.ok);

  console.log("\n" + "-".repeat(60));

  if (allPassed) {
    console.log("\n  All checks passed! Your environment is ready.");
    console.log("  You can now proceed to Lesson 5: Your First CKB Transfer.\n");
    console.log("  Next steps:");
    console.log("    1. Visit https://faucet.nervos.org/ to get testnet CKB");
    console.log("    2. Explore the code in this lesson's src/ directory");
    console.log("    3. Try modifying the script to query different data");
    console.log("    4. Move on to Lesson 5 when ready!\n");
  } else {
    console.log("\n  Some checks failed. Please review the output above");
    console.log("  and fix any issues before continuing.\n");
    console.log("  Common fixes:");
    console.log("    - Install Node.js >= 18 from https://nodejs.org/");
    console.log("    - Check your internet connection for testnet access");
    console.log("    - Run 'npm install' if you see module errors\n");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Main entry point — orchestrates all verification steps in sequence.
 *
 * Each step is wrapped in a try/catch so that a failure in one step
 * doesn't prevent the remaining steps from running. The final summary
 * reports which steps passed and which failed.
 */
async function main(): Promise<void> {
  console.log("\n");
  console.log("  ************************************************************");
  console.log("  *                                                          *");
  console.log("  *     Lesson 4: Setting Up Your Dev Environment            *");
  console.log("  *     ─────────────────────────────────────────            *");
  console.log("  *     Verifying tools, connectivity, and SDK setup         *");
  console.log("  *                                                          *");
  console.log("  ************************************************************");
  console.log("\n");

  // Track which steps succeed for the final summary.
  const status = {
    envReady: false,
    connected: false,
    chainInfo: false,
    addressCreated: false,
    balanceChecked: false,
  };

  // ── Step 1: Environment checks ──────────────────────────────────────
  try {
    status.envReady = await stepEnvironmentChecks();
  } catch (err) {
    console.error("  Environment check encountered an error:", err);
  }

  // ── Step 2: Connect to testnet ──────────────────────────────────────
  let client: ccc.Client | null = null;
  try {
    client = await stepConnectTestnet();
    status.connected = true;
  } catch {
    console.error("\n  Skipping remaining network steps due to connection failure.\n");
  }

  // ── Step 3: Chain information ───────────────────────────────────────
  if (client) {
    try {
      await stepDisplayChainInfo(client);
      status.chainInfo = true;
    } catch {
      console.error("\n  Could not retrieve chain info.\n");
    }
  }

  // ── Step 4: Create test address ─────────────────────────────────────
  let testAddress: string | null = null;
  if (client) {
    try {
      testAddress = await stepCreateTestAddress(client);
      status.addressCreated = true;
    } catch (err) {
      console.error("\n  Could not create test address:", err);
    }
  }

  // ── Step 5: Check balance ───────────────────────────────────────────
  if (client && testAddress) {
    try {
      await stepCheckBalance(client, testAddress);
      status.balanceChecked = true;
    } catch {
      console.error("\n  Could not check balance.\n");
    }
  }

  // ── Step 6: Summary ─────────────────────────────────────────────────
  stepSummary(status);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
