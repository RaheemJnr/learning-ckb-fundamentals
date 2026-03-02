/**
 * Lesson 16: CKB Composability Patterns
 *
 * CKB's composability model is fundamentally different from Solidity's.
 * In Ethereum, composability means calling one smart contract from another
 * (external calls, delegate calls). In CKB, composability is achieved by
 * combining scripts in a SINGLE TRANSACTION:
 *
 *   - Multiple scripts run in the same transaction validation
 *   - Scripts communicate via shared cell data in the transaction
 *   - No cross-contract calls — all composition happens at the transaction level
 *   - Scripts are independent programs that each see the same transaction
 *
 * OPEN PROTOCOLS:
 * A script deployed once on CKB is a "public good" — anyone can reference it
 * in their transactions without permission, payment, or registration. This is
 * fundamentally different from permissioned composability models.
 *
 * Open protocols on CKB:
 *   - xUDT: The fungible token standard (anyone can create tokens using it)
 *   - Spore: The NFT protocol (anyone can mint NFTs using it)
 *   - Omnilock: The universal lock (any wallet can use it)
 *   - Nervos DAO: The staking protocol (permissionless deposits)
 *
 * This lesson demonstrates:
 *   1. How scripts reference each other via cell deps
 *   2. Token-gated access using xUDT + custom type script composition
 *   3. Multi-script transactions (multiple independent validators)
 *   4. Atomic swap construction using cell constraints
 *   5. Building permissionlessly on top of existing protocols
 */

import { ccc } from "@ckb-ccc/core";

// ============================================================
// SECTION 1: How Scripts Reference Other Scripts via Cell Deps
// ============================================================
//
// In a CKB transaction, `cell_deps` are read-only references to existing cells.
// Their primary use is providing script code: you list the code cells for every
// script that will run during transaction validation.
//
// But cell deps serve a second purpose: scripts can READ the data and scripts
// of cells listed in cell_deps. This enables "script-as-parameter" patterns
// where one script's behavior is configured by referencing another script.
//
// Example: A token-gated access contract might reference an xUDT token's
// type script via cell deps to check whether the spender holds that token.
// The access script doesn't need to know the xUDT binary — it just reads
// the type script fields of cells in its cell deps.

interface ScriptReference {
  codeHash: string;
  hashType: "type" | "data" | "data1" | "data2";
  args: string;
}

interface CellDep {
  outPoint: { txHash: string; index: number };
  depType: "code" | "depGroup";
}

/**
 * Demonstrate how a custom script can reference an existing deployed script
 * (like xUDT) via cell deps. This is the foundational pattern for composability:
 * your script is parameterized by another script's identity.
 *
 * @param xudt - The xUDT type script reference (identifies a specific token type)
 * @param accessScript - Your custom gate-keeper script
 */
function demonstrateScriptReferences(
  xudt: ScriptReference,
  accessScript: ScriptReference
): void {
  console.log("\n=== Script-as-Parameter via Cell Deps ===\n");

  console.log("Pattern: Your script is configured by referencing another script.");
  console.log("The referenced script's code_hash + hash_type uniquely identifies");
  console.log("a specific protocol (e.g., the xUDT token standard).\n");

  console.log("Example: Token-gated content access");
  console.log("");
  console.log("Content cell:");
  console.log("  lock: { standard secp256k1 }");
  console.log("  type: { access_script, args: xUDT_type_hash }");
  //           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //           The args encode WHICH token is required for access.
  //           This is parameterization: the same access script works
  //           for any token — just change the args.
  console.log("  data: [encrypted or plaintext content]");
  console.log("");
  console.log("Access script logic (conceptual Rust):");
  console.log("  1. Read args -> get target token type hash");
  console.log("  2. Scan all input cells for a cell with that type hash");
  console.log("  3. If found AND the spender owns that cell -> allow access");
  console.log("  4. If not found -> reject transaction");
  console.log("");

  // Simulate the args structure for the access gate script
  // The args embed the xUDT type script hash (32 bytes) to specify WHICH
  // token acts as the "key" for the gate.
  const xudtTypeHash = hashScript(xudt); // 32-byte blake2b hash of the script
  console.log("Access script args encoding:");
  console.log(`  args = ${xudtTypeHash}`);
  console.log(`  (this is blake2b-256 of the xUDT type script)`);
  console.log(`  The access gate validates the spender holds tokens of this exact type`);

  console.log("");
  console.log("Cell deps in the transaction:");
  console.log("  [0] Omnilock binary cell (for the input lock script)");
  console.log("  [1] xUDT binary cell     (for the token's type script)");
  console.log("  [2] Access gate binary   (for the content cell's type script)");
  console.log("  Each script runs independently and sees the same transaction.");
}

/**
 * Simulate computing a script hash (in reality: blake2b-256 of serialized script).
 * For demonstration purposes, returns a fake but realistic-looking hash.
 */
function hashScript(script: ScriptReference): string {
  // Real: blake2b-256(molecule_encoded(code_hash + hash_type + args))
  // Demo: deterministic placeholder based on code_hash
  const code = script.codeHash.slice(2, 10);
  return `0x${code}0000000000000000000000000000000000000000000000000000000000`;
}

// ============================================================
// SECTION 2: Token-Gated Access System
// ============================================================
//
// A token-gated access system has two components:
//
// COMPONENT A — The Token (xUDT)
//   A user must hold at least 1 unit of a specific xUDT token.
//   This proves they have been granted access (by receiving the token).
//
// COMPONENT B — The Content Cell
//   The content cell has a custom type script (the "gate").
//   The gate script runs when the content cell is consumed.
//   It scans the transaction's input cells for the required token.
//   If the token cell is present as an input, the gate allows the spending.
//
// HOW COMPOSABILITY WORKS HERE:
//   The gate type script and the xUDT type script run in the SAME transaction.
//   The gate doesn't call xUDT — they are parallel validators.
//   The gate inspects raw cells: it reads type_script fields from input cells
//   and checks if any cell's type matches the required token type hash.
//   This is pure data inspection, no cross-script calls.

interface ContentCell {
  // The content (e.g., a document hash, an IP address, an access credential)
  data: string;
  // The lock that owns this cell (the content provider)
  ownerLock: ScriptReference;
  // The gate type script, parameterized with the required token type
  gateTypeScript: ScriptReference;
  // Capacity in shannon
  capacity: bigint;
}

interface TokenCell {
  // How many tokens are in this cell
  amount: bigint;
  // The xUDT type script that defines this token
  tokenType: ScriptReference;
  // The lock that owns this token cell
  ownerLock: ScriptReference;
}

function demonstrateTokenGatedAccess(): void {
  console.log("\n=== Token-Gated Access: Composition Pattern ===\n");

  console.log("Architecture overview:");
  console.log("┌──────────────────────────────────────────────────────────┐");
  console.log("│  Transaction: \"Access Content\"                           │");
  console.log("│                                                            │");
  console.log("│  INPUTS:                    OUTPUTS:                      │");
  console.log("│  ┌─────────────────┐        ┌─────────────────┐          │");
  console.log("│  │ Content Cell    │  ────>  │ Content Cell    │          │");
  console.log("│  │ type: gateScript│        │ (updated/consumed)         │");
  console.log("│  │ data: <content> │        └─────────────────┘          │");
  console.log("│  └─────────────────┘                                      │");
  console.log("│                                                            │");
  console.log("│  ┌─────────────────┐        ┌─────────────────┐          │");
  console.log("│  │ Token Cell      │  ────>  │ Token Cell      │          │");
  console.log("│  │ type: xUDT      │        │ type: xUDT      │          │");
  console.log("│  │ amount: 10      │        │ amount: 10      │          │");
  console.log("│  └─────────────────┘        └─────────────────┘          │");
  console.log("│           ^                                                │");
  console.log("│           │ Gate script checks this input exists          │");
  console.log("└──────────────────────────────────────────────────────────┘");

  console.log("");
  console.log("Key observations:");
  console.log("  1. The gate type script validates the CONTENT cell's transition");
  console.log("  2. The xUDT type script validates the TOKEN cell's conservation");
  console.log("  3. Both scripts run independently in the same transaction");
  console.log("  4. The gate inspects raw transaction data (input cell type scripts)");
  console.log("  5. No function calls between scripts — they share only the transaction");

  console.log("");
  console.log("Gate script logic (pseudo-code):");
  console.log("  fn gate_script_main() {");
  console.log("    let required_token_type = load_script_args()[0..32];");
  console.log("    // required_token_type is the hash of the xUDT type script");
  console.log("    ");
  console.log("    // Scan all inputs (not just our group) for the token");
  console.log("    for each input cell in transaction.inputs {");
  console.log("        if input.type_script_hash == required_token_type {");
  console.log("            return SUCCESS; // Token holder is spending this tx");
  console.log("        }");
  console.log("    }");
  console.log("    return ERROR_ACCESS_DENIED;");
  console.log("  }");

  console.log("");
  console.log("Why the token cannot be stolen during access:");
  console.log("  - The xUDT type script enforces token conservation");
  console.log("  - Total tokens in outputs must equal total tokens in inputs");
  console.log("  - The spender cannot consume the token while accessing content");
  console.log("  - The token is preserved in an output cell (same amount)");
  console.log("  - This is the xUDT type script doing its job — composably");
}

// ============================================================
// SECTION 3: Multiple Scripts in the Same Transaction
// ============================================================
//
// A single CKB transaction can involve many different scripts simultaneously.
// Each script is an independent validator: it runs, checks its cells, and
// returns 0 (success) or non-zero (failure).
//
// Importantly, ALL scripts must return 0 for a transaction to be valid.
// This creates an "AND" relationship: every rule must be satisfied.
//
// This model enables sophisticated protocols without any central coordinator:
//
// Example: DEX swap transaction
//   - Alice's lock script runs (validates Alice's signature for her input)
//   - Bob's lock script runs (validates Bob's signature for his input)
//   - xUDT type script runs for TokenA (validates TokenA conservation)
//   - xUDT type script runs for TokenB (validates TokenB conservation)
//   - AMM pool type script runs (validates swap rate, updates reserves)
//
// Five independent validators, one transaction, one atomic operation.
// No central "DEX contract" that calls into individual token contracts.
// Each script is responsible only for its own invariants.

function demonstrateMultiScriptTransaction(): void {
  console.log("\n=== Multiple Scripts in One Transaction ===\n");

  console.log("All scripts in a transaction run independently and must ALL succeed.");
  console.log("This is a logical AND: if any script fails, the whole transaction fails.");
  console.log("");

  console.log("Example: 3-script transaction (DEX swap)");
  console.log("");
  console.log("Scripts that run:");
  console.log("  Script 1: Lock script for Alice's input cell");
  console.log("            -> Verifies Alice's secp256k1 signature");
  console.log("  Script 2: Lock script for Bob's input cell");
  console.log("            -> Verifies Bob's secp256k1 signature");
  console.log("  Script 3: xUDT type script for TokenA");
  console.log("            -> Verifies total TokenA in == total TokenA out");
  console.log("  Script 4: xUDT type script for TokenB");
  console.log("            -> Verifies total TokenB in == total TokenB out");
  console.log("");

  console.log("Transaction validation outcome:");
  console.log("  Script 1 returns 0 (Alice's sig valid) AND");
  console.log("  Script 2 returns 0 (Bob's sig valid) AND");
  console.log("  Script 3 returns 0 (TokenA conserved) AND");
  console.log("  Script 4 returns 0 (TokenB conserved)");
  console.log("  => Transaction is VALID");
  console.log("");
  console.log("If any script returns non-zero:");
  console.log("  => Transaction is INVALID, rejected by all CKB nodes");
  console.log("");

  console.log("Why this model is powerful:");
  console.log("  1. Scripts don't trust each other — they each verify independently");
  console.log("  2. A new protocol can compose with existing ones without permission");
  console.log("  3. No 'integration code' required — just include the cell deps");
  console.log("  4. Audit surface is per-script, not per-combination");
  console.log("  5. Any combination that passes all validators is automatically valid");
}

// ============================================================
// SECTION 4: Atomic Swaps via Composable Cell Constraints
// ============================================================
//
// An atomic swap ensures that two parties exchange assets in a single
// transaction that either fully succeeds or fully fails — no partial execution.
//
// In CKB, atomic swaps are natural because a transaction is atomic by design.
// Unlike Ethereum where you need HTLCs (hash time lock contracts) or complex
// escrow logic for cross-chain atomicity, CKB's transaction model gives you
// intra-chain atomicity for free.
//
// HOW A SIMPLE ATOMIC SWAP WORKS:
//
// Alice wants to give Bob 100 USDC (xUDT) in exchange for 1 BTC-on-CKB (xUDT).
//
// STEP 1: Alice creates an "offer cell"
//   lock: htlc_lock { required_recipient: Bob's pubkey hash }
//   type: xUDT { token: USDC }
//   data: 100 USDC amount
//
// STEP 2: Bob spends the offer cell and simultaneously provides his BTC
//   Inputs:
//     - Alice's USDC offer cell (100 USDC)
//     - Bob's BTC cell (1 BTC)
//   Outputs:
//     - Alice receives 1 BTC
//     - Bob receives 100 USDC
//
// ATOMICITY: If the transaction goes through, BOTH transfers happen.
// If it fails, NEITHER happens. There is no "half swap" state.
//
// MORE SOPHISTICATED: Hash Time Lock Contracts (HTLC)
// For cross-chain swaps (CKB <-> Bitcoin), HTLCs use a secret preimage.
// Alice locks funds with: "Bob can claim if he reveals preimage of hash H"
// Bob locks funds with: "Alice can claim if she reveals the same preimage"
// Alice reveals the preimage on CKB -> Bob sees it -> uses it on Bitcoin.
// Both swaps succeed or the timeouts return funds to their owners.

function demonstrateAtomicSwap(): void {
  console.log("\n=== Atomic Swaps via Cell Constraints ===\n");

  console.log("Atomic swap: two transfers in one transaction, fully atomic.");
  console.log("");

  console.log("Simple on-chain swap (Alice's USDC for Bob's BTC-on-CKB):");
  console.log("");
  console.log("Transaction structure:");
  console.log("  INPUTS:");
  console.log("    Cell A: Alice's 100 USDC (type: xUDT/USDC, lock: Alice's key)");
  console.log("    Cell B: Bob's 1 BTC-CKB  (type: xUDT/BTC,  lock: Bob's key)");
  console.log("");
  console.log("  OUTPUTS:");
  console.log("    Cell C: Bob's  100 USDC  (type: xUDT/USDC, lock: Bob's key)");
  console.log("    Cell D: Alice's 1 BTC-CKB (type: xUDT/BTC,  lock: Alice's key)");
  console.log("");
  console.log("Scripts that run:");
  console.log("  1. Alice's lock script -> checks Alice's signature (in inputs)");
  console.log("  2. Bob's lock script   -> checks Bob's signature   (in inputs)");
  console.log("  3. USDC type script    -> checks 100 USDC in == 100 USDC out");
  console.log("  4. BTC type script     -> checks 1 BTC in   == 1 BTC out");
  console.log("");
  console.log("This transaction can ONLY be submitted if both Alice and Bob sign it.");
  console.log("Both must agree on the exact outputs — meaning the swap rate is fixed.");
  console.log("Either the full swap happens, or nothing happens. Atomic by design.");

  console.log("");
  console.log("Advanced: Partial-fill offer cells");
  console.log("  An offer cell sits on-chain holding Alice's tokens.");
  console.log("  It has a custom type script encoding the swap rate.");
  console.log("  Anyone can fill the offer (partial or full) without Alice's signature.");
  console.log("  The type script validates: filler gives correct amount, gets correct amount.");
  console.log("  This is how on-chain limit order books work on CKB.");

  console.log("");
  console.log("Cross-chain HTLC flow:");
  console.log("  1. Alice locks USDC on CKB with: 'Bob can claim if he knows preimage(H)'");
  console.log("  2. Bob locks BTC on Bitcoin with: 'Alice can claim if she knows preimage(H)'");
  console.log("  3. Alice reveals preimage on CKB -> gets her BTC");
  console.log("  4. Bob sees the preimage on-chain -> uses it on Bitcoin -> gets his USDC");
  console.log("  5. If time expires: funds return to original owners automatically");
}

// ============================================================
// SECTION 5: Open Protocols — Permission-Free Composability
// ============================================================
//
// An "open protocol" in CKB is a script deployed once that anyone can use
// without asking permission. The script's code hash is its public identity —
// anyone who knows it can reference it in a cell dep and use it.
//
// Compare to Solidity:
//   - Ethereum has "open protocols" too (like Uniswap, OpenZeppelin)
//   - But Solidity composability works via function calls (ABIs)
//   - If the contract owner adds access control, it blocks composability
//   - Upgradeable contracts can change behavior after you've integrated
//
// CKB open protocols:
//   - A script binary is content-addressed (code_hash = hash of binary)
//   - hash_type 'data' pins to exact binary: it can NEVER change behavior
//   - hash_type 'type' allows upgrades, but the upgrade path is transparent
//   - No owner can block you from using a deployed script binary
//   - No function call interface needed — cell data is the interface
//
// Practical implication: if Spore NFT protocol is deployed, ANYONE can:
//   - Mint Spore NFTs (by including Spore code hash in outputs' type scripts)
//   - Build marketplaces that list Spore NFTs (by reading cell type fields)
//   - Extend Spore with custom logic (by adding their own type script alongside)
//   - Fork Spore by deploying a modified binary with a different code hash
//   None of these require permission from the Spore team.

function demonstrateOpenProtocols(): void {
  console.log("\n=== Open Protocols: Permission-Free Building ===\n");

  console.log("Once a script is deployed on CKB, it is permanently accessible to anyone.");
  console.log("No permission, no API keys, no registration — just use the code_hash.\n");

  console.log("Examples of open protocols and how you build on them:");
  console.log("");

  console.log("1. Building on xUDT (fungible tokens):");
  console.log("   - Use xUDT code_hash in output type scripts to create tokens");
  console.log("   - Your token IS an xUDT token — wallets already support it");
  console.log("   - Build a staking contract that accepts any xUDT token");
  console.log("   - Build a DEX that pairs any two xUDT tokens");
  console.log("   - xUDT team cannot prevent any of this");
  console.log("");

  console.log("2. Building on Spore (NFTs):");
  console.log("   - Use Spore code_hash to mint NFTs with immutable content");
  console.log("   - Build a marketplace that reads Spore type scripts");
  console.log("   - Create 'extension cells' that reference Spore NFTs");
  console.log("   - All metadata is on-chain; no centralized server needed");
  console.log("");

  console.log("3. Layering custom logic on existing protocols:");
  console.log("   - Scenario: Add rental logic on top of Spore NFTs");
  console.log("   - Create a 'rental wrapper' type script");
  console.log("   - Rental cells reference the NFT they are renting");
  console.log("   - Rental script validates time periods and payment");
  console.log("   - The underlying Spore NFT script still runs unchanged");
  console.log("   - Composability via cell references, not contract calls");

  console.log("");
  console.log("The 'open protocol' guarantee:");
  console.log("  hash_type 'data' : code_hash = blake2b(binary)");
  console.log("    The exact binary is fixed forever. Any node can verify");
  console.log("    the code cell contains the expected binary. Immutable.");
  console.log("");
  console.log("  hash_type 'type' : code_hash = blake2b(type_script_of_code_cell)");
  console.log("    The type script acts as a stable identifier.");
  console.log("    The binary CAN be updated, but the type_script identity");
  console.log("    persists. Upgradeable, but transparent and verifiable.");
}

// ============================================================
// SECTION 6: Comparing CKB and Solidity Composability
// ============================================================
//
// Both CKB and Ethereum enable composability, but via completely different models.

function compareWithSolidity(): void {
  console.log("\n=== CKB vs Solidity Composability ===\n");

  console.log("Solidity model (Ethereum):");
  console.log("  - Contracts call each other via CALL / DELEGATECALL opcodes");
  console.log("  - Composability = function calling across contract boundaries");
  console.log("  - ABI defines the interface for external callers");
  console.log("  - State is modified synchronously during execution");
  console.log("  - Re-entrancy attacks possible if not guarded");
  console.log("  - Upgradeability can silently change behavior for existing callers");
  console.log("  - Permissioned composability: contracts can add access modifiers");
  console.log("");

  console.log("CKB model:");
  console.log("  - No cross-script calls. Zero. Scripts cannot call each other.");
  console.log("  - Composability = multiple scripts validating the same transaction");
  console.log("  - 'Interface' = cell data layout (encoded with Molecule or raw bytes)");
  console.log("  - State is proposed by the transaction, validated by scripts");
  console.log("  - Re-entrancy is impossible by design (no calls, no side effects)");
  console.log("  - hash_type 'data' gives truly immutable behavior guarantees");
  console.log("  - Permissionless: deployed binaries cannot be access-controlled");
  console.log("");

  console.log("Practical consequences:");
  console.log("  Solidity: To compose A + B, B must expose a public function.");
  console.log("  CKB:      To compose A + B, just include both in the same transaction.");
  console.log("");
  console.log("  Solidity: Flash loans require a special callback interface.");
  console.log("  CKB:      Atomic multi-step operations are natural transaction structure.");
  console.log("");
  console.log("  Solidity: Oracle attacks can manipulate in-flight contract state.");
  console.log("  CKB:      All state is committed before scripts run. No manipulation.");
  console.log("");
  console.log("  Solidity: Auditing a DeFi protocol requires tracing all possible calls.");
  console.log("  CKB:      Each script has bounded, deterministic behavior to audit.");
}

// ============================================================
// SECTION 7: Building a Complete Composable dApp Design
// ============================================================
//
// Let's design a subscription protocol that composes multiple existing primitives:
//
// PROTOCOL: "Content Club"
//   - Content providers mint access tokens (xUDT)
//   - Subscribers buy these tokens from a DEX or directly
//   - Content cells use a gate type script (checks token possession)
//   - Subscribers can read content by including their token in transactions
//   - Token issuance is controlled by the content provider's lock script
//   - Subscriptions expire (tokens have a time-limited type script)
//
// This protocol uses (composes):
//   1. xUDT (token issuance and transfer)
//   2. Omnilock (wallet auth for content providers and subscribers)
//   3. Custom gate type script (access control)
//   4. A custom time-limited token type script (subscription expiry)
//
// None of these require permission from xUDT or Omnilock teams.
// The protocol is deployed as two new cells (gate script + time-limited script).
// It leverages existing audited code for the hard parts.

function demonstrateComposableDAppDesign(): void {
  console.log("\n=== Composable dApp Design: Content Club ===\n");

  console.log("Design: A subscription content platform using composable primitives\n");

  console.log("Components used:");
  console.log("  [EXISTING] xUDT binary    -> standard token accounting");
  console.log("  [EXISTING] Omnilock binary -> wallet authentication");
  console.log("  [NEW]      gate type script -> token-gated content access");
  console.log("  [NEW]      expiry type script -> token expiry logic");
  console.log("");

  console.log("Cell types in the protocol:");
  console.log("");

  console.log("  1. Subscription Token Cell:");
  console.log("     lock: subscriber's Omnilock");
  console.log("     type: expiry_type_script { expires_at: block_N }");
  console.log("     data: xUDT amount bytes (1 token = 1 subscription unit)");
  console.log("     (Note: expiry_type_script wraps xUDT logic + adds expiry check)");
  console.log("");

  console.log("  2. Content Cell:");
  console.log("     lock: content_provider's Omnilock");
  console.log("     type: gate_type_script { required_token: expiry_type_hash }");
  console.log("     data: content_hash or encrypted_content");
  console.log("");

  console.log("  3. Token Issuance Cell (controlled by provider):");
  console.log("     lock: content_provider's Omnilock");
  console.log("     type: expiry_type_script { expires_at: 0 } // issuer has no expiry");
  console.log("     data: max_supply and current_supply");
  console.log("");

  console.log("Reading content flow:");
  console.log("  1. Subscriber builds tx with:");
  console.log("     - Content cell as input");
  console.log("     - Their subscription token cell as input");
  console.log("  2. Scripts that run:");
  console.log("     - Content provider's lock -> checks provider's sig (for their outputs)");
  console.log("     - Subscriber's Omnilock -> checks subscriber's sig");
  console.log("     - Gate type script -> finds the token in inputs, checks not expired");
  console.log("     - Expiry type script -> validates token is still within expiry block");
  console.log("  3. If all pass: content cell is spent (decrypted/consumed), subscriber gets change");
  console.log("");

  console.log("Key insight: The protocol team only wrote TWO new scripts.");
  console.log("All the hard work (wallet auth, token accounting) is reused from");
  console.log("existing audited protocols. This reduces risk and time-to-market.");
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function main(): Promise<void> {
  console.log("======================================================");
  console.log("  Lesson 16: CKB Composability Patterns");
  console.log("======================================================");
  console.log("");
  console.log("CKB composability: multiple independent scripts validating");
  console.log("the same transaction. No cross-contract calls — all composition");
  console.log("happens at the transaction layer via shared cell data.");

  // Connect to testnet for context (we demonstrate patterns conceptually)
  const client = new ccc.ClientPublicTestnet();
  console.log("\nConnected to CKB testnet (used for context and verification).");

  // Example script references (testnet deployments)
  const xudtScript: ScriptReference = {
    codeHash: "0x50bd8d6680b8b9cf98b1b62d7e34bad526898bab3b5ee0f18bd06e9b0bef79c4",
    hashType: "data1",
    args: "0x",
  };

  const accessGateScript: ScriptReference = {
    codeHash: "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
    hashType: "type",
    args: hashScript(xudtScript), // parameterized with xUDT type hash
  };

  demonstrateScriptReferences(xudtScript, accessGateScript);
  demonstrateTokenGatedAccess();
  demonstrateMultiScriptTransaction();
  demonstrateAtomicSwap();
  demonstrateOpenProtocols();
  compareWithSolidity();
  demonstrateComposableDAppDesign();

  client.destroy();

  console.log("\n======================================================");
  console.log("  End of Lesson 16");
  console.log("======================================================");
  console.log("");
  console.log("Key takeaways:");
  console.log("  1. CKB composability = multiple scripts in the same transaction");
  console.log("  2. Scripts do NOT call each other — they share only the transaction");
  console.log("  3. Cell deps allow a script to reference another script's identity");
  console.log("  4. Open protocols are accessible to anyone with the code_hash");
  console.log("  5. Atomic swaps are natural in CKB — no HTLCs needed for on-chain swaps");
  console.log("  6. Token-gated access is a 2-script composition (xUDT + gate)");
  console.log("  7. Composing existing protocols reduces audit surface for new dApps");
  console.log("  8. hash_type 'data' guarantees immutable binary behavior forever");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
