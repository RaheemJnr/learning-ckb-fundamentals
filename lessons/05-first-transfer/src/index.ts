/**
 * ============================================================================
 * Lesson 05: Your First CKB Transfer
 * ============================================================================
 *
 * In this lesson, you will learn how to:
 *   1. Connect to the CKB testnet using the CCC SDK
 *   2. Create a signer from a private key
 *   3. Check your CKB balance
 *   4. Build a CKB transfer transaction
 *   5. Sign and send the transaction
 *   6. Wait for on-chain confirmation
 *
 * This script performs a REAL transfer on the CKB testnet (Pudge).
 * Testnet CKB has no real-world value, so it is safe to experiment with.
 *
 * ===========================================================================
 * WARNING: SECURITY BEST PRACTICES
 * ===========================================================================
 * - NEVER hardcode private keys in production code.
 * - NEVER commit private keys to version control.
 * - NEVER reuse testnet keys on mainnet.
 * - In production, use hardware wallets, environment variables, or
 *   secure key management systems.
 * - The private keys below are for TESTNET DEMONSTRATION ONLY.
 * ===========================================================================
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * TEST-ONLY private key for the SENDER account.
 *
 * This is a well-known test key. NEVER use this on mainnet.
 * Before running, make sure this account has testnet CKB.
 * Get testnet CKB from the faucet: https://faucet.nervos.org/
 *
 * To use your own key:
 *   1. Generate a key pair (e.g., via a wallet or openssl)
 *   2. Replace the value below
 *   3. Fund the address via the testnet faucet
 */
const SENDER_PRIVATE_KEY =
  "0xd6013cd867d286ef84cc300ac6546013837df2b06c9f53c83b4c33c2417f6a07";

/**
 * The RECIPIENT address on testnet.
 *
 * This is a standard CKB testnet address. You can replace it with any
 * valid CKB testnet address. For this demo, we use a second test address.
 *
 * CKB addresses encode the lock script that controls the cells.
 * On testnet, addresses start with "ckt".
 * On mainnet, addresses start with "ckb".
 */
const RECIPIENT_ADDRESS =
  "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2qf8keez2hr7r230dn0dkszfnmzdk3jlcuh53lxu";

/**
 * Amount of CKB to transfer, specified in CKBytes.
 *
 * CKB uses "shannons" as the smallest unit, similar to Bitcoin's satoshis.
 * 1 CKByte = 100,000,000 shannons (10^8)
 *
 * The minimum amount for a transfer is 61 CKBytes, because the recipient
 * needs at least 61 CKBytes to cover the minimum cell capacity
 * (8 bytes capacity + 32 bytes lock code_hash + 1 byte hash_type + 20 bytes args).
 *
 * We will transfer 100 CKBytes in this demo.
 */
const TRANSFER_AMOUNT_CKB = 100n;

// Convert CKB to shannons: 1 CKB = 10^8 shannons
const SHANNONS_PER_CKB = 100_000_000n;
const TRANSFER_AMOUNT_SHANNONS = TRANSFER_AMOUNT_CKB * SHANNONS_PER_CKB;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Formats a bigint shannon value into a human-readable CKB string.
 *
 * On CKB, all capacity/balance values are stored in shannons (the smallest
 * unit). This helper converts shannons to CKB for display purposes.
 *
 * @param shannons - The value in shannons (bigint)
 * @returns A formatted string like "1,234.56789012 CKB"
 */
function formatCkb(shannons: bigint): string {
  const ckb = Number(shannons) / Number(SHANNONS_PER_CKB);
  return `${ckb.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} CKB`;
}

/**
 * Pauses execution for the given number of milliseconds.
 * Used to wait between polling for transaction confirmation.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN: YOUR FIRST CKB TRANSFER
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("  Lesson 05: Your First CKB Transfer");
  console.log("=".repeat(70));
  console.log();

  // --------------------------------------------------------------------------
  // STEP 1: Connect to CKB Testnet
  // --------------------------------------------------------------------------
  /**
   * The CCC SDK provides a convenient ClientPublicTestnet class that
   * connects to the CKB Pudge testnet via public RPC nodes.
   *
   * The client handles all JSON-RPC communication with the CKB node,
   * including querying cells, submitting transactions, and checking
   * transaction status.
   *
   * Available client options:
   *   - ClientPublicTestnet: connects to the public testnet (Pudge)
   *   - ClientPublicMainnet: connects to the public mainnet (Mirana)
   *   - Client: connect to a custom RPC endpoint
   */
  console.log("Step 1: Connecting to CKB Testnet...");
  const client = new ccc.ClientPublicTestnet();
  console.log("  Connected to CKB Testnet (Pudge)");
  console.log();

  // --------------------------------------------------------------------------
  // STEP 2: Create a Signer from Private Key
  // --------------------------------------------------------------------------
  /**
   * A "Signer" in the CCC SDK represents an entity that can sign transactions.
   * There are different types of signers:
   *
   *   - SignerCkbPrivateKey: Signs using a raw CKB private key (secp256k1).
   *     This is the simplest approach, suitable for testing and scripts.
   *
   *   - SignerCkbPublicKey: Signs using a public key (requires external signing).
   *
   *   - Other signer types for hardware wallets, multi-sig, etc.
   *
   * Here, we use SignerCkbPrivateKey for simplicity. In production, you
   * would NEVER embed a private key in your source code. Instead, you
   * would use environment variables, a keystore file, or a hardware wallet.
   *
   * The signer derives the CKB address from the private key automatically.
   * Under the hood, it:
   *   1. Derives the secp256k1 public key from the private key
   *   2. Hashes the public key (blake160) to get the lock args
   *   3. Constructs a lock script using the default secp256k1-blake160 code hash
   *   4. Encodes the lock script as a CKB address
   */
  console.log("Step 2: Creating signer from private key...");
  console.log("  WARNING: This uses a TEST-ONLY private key.");
  console.log("  NEVER use hardcoded keys in production!");
  console.log();

  const signer = new ccc.SignerCkbPrivateKey(client, SENDER_PRIVATE_KEY);

  /**
   * Retrieve the sender's addresses. CKB supports multiple address formats:
   *   - The "internal address" is derived directly from the signer's lock script
   *   - Different signers may produce different address types
   *
   * We'll use getInternalAddress() which returns the address in the
   * standard CKB address format (Bech32 encoded).
   */
  const senderAddress = await signer.getInternalAddress();
  console.log("  Sender address:", senderAddress);
  console.log();

  // --------------------------------------------------------------------------
  // STEP 3: Check Balance Before Transfer
  // --------------------------------------------------------------------------
  /**
   * Before sending a transfer, we should check that the sender has
   * enough CKB to cover:
   *   1. The transfer amount
   *   2. The minimum cell capacity for the change output (61 CKB)
   *   3. The transaction fee
   *
   * The getBalance() method returns the total balance in shannons by
   * summing the capacity of all live cells owned by the signer's
   * lock script.
   *
   * "Live cells" are unspent cells -- cells that exist on-chain and
   * have not been consumed by any confirmed transaction.
   */
  console.log("Step 3: Checking sender balance...");

  const balanceBefore = await signer.getBalance();
  console.log("  Sender balance:", formatCkb(balanceBefore));
  console.log("  Transfer amount:", formatCkb(TRANSFER_AMOUNT_SHANNONS));

  // Verify sufficient balance
  if (balanceBefore < TRANSFER_AMOUNT_SHANNONS) {
    console.error(
      "\n  ERROR: Insufficient balance! You need at least",
      formatCkb(TRANSFER_AMOUNT_SHANNONS)
    );
    console.error(
      "  Fund your testnet address via: https://faucet.nervos.org/"
    );
    console.error("  Your address:", senderAddress);
    process.exit(1);
  }

  console.log("  Sufficient balance confirmed.");
  console.log();

  // --------------------------------------------------------------------------
  // STEP 4: Build the Transfer Transaction
  // --------------------------------------------------------------------------
  /**
   * Now we build the actual transfer transaction. In CKB, a transaction
   * consumes existing cells (inputs) and creates new cells (outputs).
   *
   * For a simple CKB transfer, the transaction structure is:
   *
   *   Inputs:  One or more of the sender's cells (consumed/destroyed)
   *   Outputs: [
   *     Cell for the recipient (with the transfer amount as capacity),
   *     Change cell back to the sender (remaining capacity minus fees)
   *   ]
   *
   * The CCC SDK's `Transaction.from` and `transferTo` methods handle
   * most of the complexity:
   *   - Selecting which input cells to consume (coin selection)
   *   - Calculating the change amount
   *   - Setting up proper lock scripts on outputs
   *   - Computing the transaction fee
   *
   * Let's walk through the process step by step.
   */
  console.log("Step 4: Building transfer transaction...");

  /**
   * First, parse the recipient's address into an Address object.
   *
   * A CKB address encodes a lock script. When we "send CKB to an address",
   * we are really creating a new cell whose lock script matches that address.
   * The recipient can then spend that cell because they control the
   * corresponding private key.
   */
  const recipientAddress = await ccc.Address.fromString(
    RECIPIENT_ADDRESS,
    client
  );

  /**
   * Create a new empty transaction.
   *
   * ccc.Transaction.from({}) initializes a transaction with empty inputs,
   * outputs, and witnesses. We will populate it using helper methods.
   */
  const tx = ccc.Transaction.from({});

  /**
   * Use the transferTo method to add a transfer output to the transaction.
   *
   * transferTo() adds an output cell to the transaction:
   *   - The output's lock script is set to match the recipient's address
   *   - The output's capacity is set to the transfer amount
   *   - No type script or data (this is a simple CKB transfer)
   *
   * Under the hood, this creates an output like:
   *   {
   *     capacity: TRANSFER_AMOUNT_SHANNONS,
   *     lock: <recipient's lock script>,
   *     type: null,
   *     data: "0x"
   *   }
   */
  tx.addOutput(
    {
      lock: recipientAddress.script,
    },
    "0x"
  );

  /**
   * Set the capacity of the output we just added.
   *
   * We must explicitly set the output capacity to the transfer amount.
   * The output index is 0 because it is the first (and so far only) output.
   */
  if (tx.outputs[0]) {
    tx.outputs[0].capacity = TRANSFER_AMOUNT_SHANNONS;
  }

  console.log("  Recipient:", RECIPIENT_ADDRESS);
  console.log("  Amount:", formatCkb(TRANSFER_AMOUNT_SHANNONS));
  console.log();

  // --------------------------------------------------------------------------
  // STEP 5: Complete the Transaction (Inputs, Change, Fee)
  // --------------------------------------------------------------------------
  /**
   * Now we need to complete the transaction by:
   *   1. Selecting input cells from the sender's live cells
   *   2. Adding a change output back to the sender
   *   3. Calculating and including the transaction fee
   *
   * The CCC SDK's `completeFeeBy` method does all of this automatically:
   *   - It selects enough input cells to cover the outputs + fee
   *   - It adds a change output for any leftover capacity
   *   - It estimates the transaction size and calculates the appropriate fee
   *
   * The fee is calculated based on the transaction's serialized size:
   *   fee = transaction_size_in_bytes * fee_rate (shannons per byte)
   *
   * The default fee rate is 1000 shannons per kilobyte, which is the
   * minimum fee rate accepted by most CKB nodes.
   */
  console.log("Step 5: Completing transaction (selecting inputs, fee)...");

  await tx.completeFeeBy(signer);

  /**
   * At this point, the transaction is fully constructed:
   *   - Inputs: cells from the sender, providing enough capacity
   *   - Outputs[0]: the transfer to the recipient
   *   - Outputs[1]: change back to the sender (if any)
   *   - The fee is implicitly the difference between total input
   *     capacity and total output capacity
   *
   * Let's inspect the transaction structure:
   */
  console.log("  Transaction built successfully!");
  console.log(`  Inputs:  ${tx.inputs.length} cell(s)`);
  console.log(`  Outputs: ${tx.outputs.length} cell(s)`);

  // Display each output
  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    if (output) {
      console.log(`    Output[${i}]: ${formatCkb(output.capacity)}`);
    }
  }

  /**
   * Calculate the transaction fee.
   *
   * Fee = Total Input Capacity - Total Output Capacity
   *
   * In CKB (like Bitcoin), the fee is NOT an explicit field in the
   * transaction. Instead, it is the difference between what goes in
   * and what comes out. Miners collect this difference as their reward.
   */
  let totalInputCapacity = 0n;
  for (const input of tx.inputs) {
    if (input.cellOutput) {
      totalInputCapacity += input.cellOutput.capacity;
    }
  }

  let totalOutputCapacity = 0n;
  for (const output of tx.outputs) {
    totalOutputCapacity += output.capacity;
  }

  const fee = totalInputCapacity - totalOutputCapacity;
  if (totalInputCapacity > 0n) {
    console.log(`  Fee: ${formatCkb(fee)} (${fee.toString()} shannons)`);
  }
  console.log();

  // --------------------------------------------------------------------------
  // STEP 6: Sign the Transaction
  // --------------------------------------------------------------------------
  /**
   * Before a transaction can be submitted to the network, it must be signed.
   *
   * Signing serves two purposes:
   *   1. AUTHORIZATION: It proves that the sender owns the input cells
   *      (i.e., they know the private key corresponding to the lock script)
   *   2. INTEGRITY: It ensures the transaction has not been tampered with
   *      after signing
   *
   * How CKB transaction signing works:
   *   1. The transaction is serialized (using the Molecule serialization format)
   *   2. A hash of the serialized transaction is computed (blake2b-256)
   *   3. The hash is signed using the sender's private key (secp256k1)
   *   4. The signature is placed in the transaction's "witnesses" field
   *
   * Each input cell's lock script will be executed during verification.
   * The default secp256k1-blake160 lock script:
   *   - Extracts the signature from the witness
   *   - Recovers the public key from the signature
   *   - Hashes the public key (blake160)
   *   - Compares the hash to the lock args
   *   - If they match, the input is authorized for spending
   *
   * The CCC SDK's signer.signTransaction() handles all of this complexity.
   */
  console.log("Step 6: Signing the transaction...");

  await signer.signTransaction(tx);

  console.log("  Transaction signed successfully!");
  console.log(
    `  Witnesses: ${tx.witnesses.length} (contains the signature)`
  );
  console.log();

  // --------------------------------------------------------------------------
  // STEP 7: Send the Transaction
  // --------------------------------------------------------------------------
  /**
   * Now we submit the signed transaction to the CKB network.
   *
   * When we call sendTransaction(), the CCC SDK:
   *   1. Serializes the transaction to the Molecule binary format
   *   2. Sends it to a CKB node via the JSON-RPC `send_transaction` method
   *   3. The node validates the transaction locally:
   *      - Checks that all inputs exist and are live (not already spent)
   *      - Executes all lock scripts to verify authorization
   *      - Executes all type scripts (if any) to verify state transitions
   *      - Checks that total input capacity >= total output capacity
   *   4. If valid, the node adds it to the transaction pool (mempool)
   *   5. The node broadcasts the transaction to its peers
   *   6. Returns the transaction hash (a unique identifier)
   *
   * The transaction hash is computed BEFORE the transaction is confirmed
   * in a block. It serves as a receipt that you can use to track the
   * transaction's status.
   *
   * IMPORTANT: At this point the transaction is NOT yet confirmed.
   * It is in the mempool waiting to be included in a block by a miner.
   */
  console.log("Step 7: Sending transaction to the network...");

  const txHash = await client.sendTransaction(tx);

  console.log("  Transaction sent!");
  console.log("  Transaction hash:", txHash);
  console.log(
    "  Explorer URL:",
    `https://pudge.explorer.nervos.org/transaction/${txHash}`
  );
  console.log();

  // --------------------------------------------------------------------------
  // STEP 8: Wait for Confirmation
  // --------------------------------------------------------------------------
  /**
   * After submitting, we wait for the transaction to be confirmed.
   *
   * A transaction is "confirmed" when it is included in a block that
   * has been added to the blockchain. In CKB:
   *
   *   - Block time is approximately 8-12 seconds on average
   *   - 1 confirmation means included in a block
   *   - More confirmations = more security (harder to reverse)
   *   - For testnet, 1 confirmation is usually sufficient
   *   - For mainnet with significant value, wait for 10-24 confirmations
   *
   * We poll the node using getTransaction() to check the status:
   *   - "pending": still in the mempool
   *   - "proposed": proposed for inclusion in the next block
   *   - "committed": confirmed in a block (success!)
   *
   * We use a simple polling loop with a timeout. In production, you
   * might use WebSocket subscriptions or a more sophisticated approach.
   */
  console.log("Step 8: Waiting for confirmation...");
  console.log("  (This may take 10-60 seconds on testnet)");

  const MAX_WAIT_MS = 120_000; // 2 minutes maximum wait
  const POLL_INTERVAL_MS = 3_000; // Check every 3 seconds
  const startTime = Date.now();
  let confirmed = false;

  while (Date.now() - startTime < MAX_WAIT_MS) {
    /**
     * getTransaction() returns the transaction along with its status.
     * The status field tells us where the transaction is in its lifecycle.
     */
    const txResponse = await client.getTransaction(txHash);

    if (txResponse && txResponse.status === "committed") {
      confirmed = true;
      console.log("  Transaction CONFIRMED!");
      if (txResponse.blockHash) {
        console.log("  Block hash:", txResponse.blockHash);
      }
      break;
    }

    // Show progress
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const status = txResponse?.status ?? "unknown";
    process.stdout.write(
      `\r  Status: ${status} (${elapsed}s elapsed)...      `
    );

    await sleep(POLL_INTERVAL_MS);
  }

  console.log(); // New line after progress indicator

  if (!confirmed) {
    console.log(
      "  WARNING: Transaction not confirmed within timeout."
    );
    console.log("  It may still be confirmed later. Check the explorer:");
    console.log(
      `  https://pudge.explorer.nervos.org/transaction/${txHash}`
    );
    console.log();
  }

  // --------------------------------------------------------------------------
  // STEP 9: Check Balance After Transfer
  // --------------------------------------------------------------------------
  /**
   * Finally, let's verify the transfer by checking the sender's balance
   * after the transaction.
   *
   * The balance should have decreased by approximately:
   *   transfer_amount + transaction_fee
   *
   * Note: There may be a small delay before the balance updates, since
   * the node needs to process the new block and update its index.
   */
  console.log("Step 9: Checking balance after transfer...");

  // Small delay to let the indexer catch up
  await sleep(2_000);

  const balanceAfter = await signer.getBalance();

  console.log("  Balance before:", formatCkb(balanceBefore));
  console.log("  Balance after: ", formatCkb(balanceAfter));
  console.log(
    "  Difference:    ",
    formatCkb(balanceBefore - balanceAfter)
  );
  console.log(
    "  (Difference includes transfer amount + transaction fee)"
  );
  console.log();

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("=".repeat(70));
  console.log("  Transfer Complete!");
  console.log("=".repeat(70));
  console.log();
  console.log("  What happened:");
  console.log("    1. Connected to CKB testnet");
  console.log("    2. Created a signer from a private key");
  console.log(`    3. Verified sender had ${formatCkb(balanceBefore)}`);
  console.log(
    `    4. Built a transaction to send ${formatCkb(TRANSFER_AMOUNT_SHANNONS)}`
  );
  console.log("    5. Signed the transaction with the sender's private key");
  console.log("    6. Submitted the transaction to the network");
  console.log("    7. Waited for on-chain confirmation");
  console.log(`    8. Confirmed new balance: ${formatCkb(balanceAfter)}`);
  console.log();
  console.log("  Key takeaways:");
  console.log("    - CKB transactions consume cells (inputs) and create new cells (outputs)");
  console.log("    - The fee is the difference between input and output capacity");
  console.log("    - Transactions must be signed to prove ownership of inputs");
  console.log("    - After submission, you wait for block confirmation");
  console.log("    - NEVER hardcode private keys in production applications!");
  console.log();
}

// Run the main function and handle errors
main().catch((error: unknown) => {
  console.error("\nError occurred:");
  if (error instanceof Error) {
    console.error("  Message:", error.message);
    // Provide helpful error messages for common issues
    if (error.message.includes("Resolve")) {
      console.error("\n  This usually means the sender has no cells (no CKB).");
      console.error("  Get testnet CKB from: https://faucet.nervos.org/");
    }
    if (error.message.includes("PoolRejected")) {
      console.error(
        "\n  The transaction was rejected by the mempool."
      );
      console.error("  Common causes:");
      console.error("    - Insufficient balance");
      console.error("    - Cells already spent (double spend)");
      console.error("    - Invalid transaction structure");
    }
  } else {
    console.error(error);
  }
  process.exit(1);
});
