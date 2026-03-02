/**
 * Lesson 13: Fungible Tokens with xUDT
 * ======================================
 * This lesson demonstrates how to work with xUDT (extensible User Defined Token),
 * CKB's standard for creating and transferring fungible tokens on-chain.
 *
 * xUDT is defined in RFC-0052:
 *   https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md
 *
 * Key learning objectives:
 *   1. Understand the xUDT cell structure and how tokens are stored
 *   2. Understand token identity: how each token type is uniquely identified
 *   3. Issue a new token by building a genesis transaction
 *   4. Transfer tokens by consuming and recreating token cells
 *   5. Query token balances by searching for cells with a specific type script
 *   6. Compare xUDT's "first-class asset" model to ERC-20's contract storage model
 *
 * How to run:
 *   npm install
 *   npm start
 *
 * Prerequisites:
 *   - Node.js 18+
 *   - Understanding of CKB cell model (Lessons 1-2)
 *   - Understanding of lock scripts and type scripts (Lessons 7-10)
 */

import {
  encodeAmount,
  decodeAmount,
  buildXudtTypeScript,
  buildXudtTypeArgs,
  calculateMinCapacity,
  formatTokenAmount,
  formatCKB,
  truncateHex,
  printXudtCell,
  printUdtComparison,
  verifyTransferBalance,
  filterTokenCells,
  sumTokenAmounts,
  type Script,
  type Cell,
  type XudtCell,
} from "./xudt-helpers.js";

// ---------------------------------------------------------------------------
// SECTION 1: xUDT STANDARD OVERVIEW
// ---------------------------------------------------------------------------

/**
 * Explain the xUDT standard and its place in the CKB ecosystem.
 *
 * CKB has had two token standards:
 *
 *   1. sUDT (Simple UDT, RFC-0025) — released 2020
 *      - Simple 16-byte amount in cell data
 *      - No extension mechanism
 *      - Wide adoption (many existing tokens)
 *
 *   2. xUDT (eXtensible UDT, RFC-0052) — released 2023
 *      - Superset of sUDT: same amount format
 *      - Adds "extension scripts" for custom validation
 *      - Adds "owner mode" for privileged operations
 *      - Backwards compatible (flags=0x00 === sUDT behavior)
 *
 * Real-world xUDT tokens on CKB:
 *   - Stable++ (RUSD): CKB-native stablecoin
 *   - Various bridged assets via RGB++
 *   - DeFi protocol tokens
 */
function explainXudtStandard(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 1: What is xUDT?");
  console.log("=".repeat(72));

  console.log(`
  xUDT stands for "eXtensible User Defined Token". It is CKB's primary
  standard for creating fungible tokens — comparable to ERC-20 on Ethereum,
  but with fundamental architectural differences due to CKB's Cell Model.

  Key insight: In Ethereum, tokens are stored inside a smart contract's
  storage mapping (address → balance). The contract owns the ledger.

  In CKB, tokens are stored DIRECTLY in cells owned by the token holder.
  There is no central contract storage. This is what we mean by
  "first-class assets" — tokens are first-class citizens of the ledger,
  just like native CKB.

  The xUDT type script plays the role of the "rule enforcer":
    - It runs whenever a token cell is consumed or created
    - It verifies that the total token supply is conserved
    - It delegates custom logic to optional "extension scripts"
    - It allows the owner to perform privileged operations (minting, etc.)
  `);

  // Show the xUDT cell structure visually
  console.log("  xUDT Cell Structure:");
  console.log("  " + "─".repeat(60));
  console.log("  │ Field      │ Content                             │ Size   │");
  console.log("  " + "─".repeat(60));
  console.log("  │ capacity   │ CKByte storage fee (Shannon)        │ 8 B    │");
  console.log("  │ data       │ uint128 LE token amount (+ ext data)│ ≥16 B  │");
  console.log("  │ lock       │ owner's lock script (who can spend) │ varies │");
  console.log("  │ type       │ xUDT type script (token identity)   │ varies │");
  console.log("  " + "─".repeat(60));
  console.log(`
  The TYPE SCRIPT is what makes a cell a "token cell". Without a type script,
  a cell is just plain CKB. The type script's complete identity (code_hash +
  hash_type + args) determines WHICH token the cell holds.

  The LOCK SCRIPT determines WHO owns the token. To transfer tokens, the
  current owner must satisfy their lock script (e.g., provide a signature),
  then create new output cells with the recipient's lock script.
  `);
}

// ---------------------------------------------------------------------------
// SECTION 2: TOKEN IDENTITY
// ---------------------------------------------------------------------------

/**
 * Demonstrate how xUDT token identity works.
 *
 * A token type is globally unique because its type script args include:
 *   - The issuer's lock script hash (unique to each issuer's address)
 *   - A flags byte (extension mode)
 *
 * No two issuers can create the same token type (they have different lock hashes).
 * An issuer cannot create two different tokens with the same args (same hash → same token).
 *
 * This is analogous to ERC-20 contract addresses, but cryptographically enforced
 * rather than depending on contract deployment order.
 */
function demonstrateTokenIdentity(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 2: Token Identity");
  console.log("=".repeat(72));

  console.log(`
  Every xUDT token is uniquely identified by its TYPE SCRIPT:
    { codeHash: <xUDT binary hash>, hashType: "data1", args: <owner lock hash + flags> }

  The args field encodes:
    bytes  0-31: owner's lock script hash (blake2b of serialized lock script)
    byte   32:   flags (0x00 = no extension, 0x01 = type ext, 0x02 = data ext)
    bytes  33+:  optional extension script args (if flags != 0x00)
  `);

  // Simulate two different issuers
  const issuerA_lockHash =
    "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";
  const issuerB_lockHash =
    "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  const tokenA = buildXudtTypeScript(issuerA_lockHash, 0x00);
  const tokenB = buildXudtTypeScript(issuerB_lockHash, 0x00);
  const tokenA_extended = buildXudtTypeScript(issuerA_lockHash, 0x01);

  console.log("  Example: Three distinct token identities\n");

  console.log("  Token A (issued by Alice, no extensions):");
  console.log(`    codeHash: ${truncateHex(tokenA.codeHash)}`);
  console.log(`    hashType: ${tokenA.hashType}`);
  console.log(`    args:     ${truncateHex(tokenA.args)}`);

  console.log("\n  Token B (issued by Bob, no extensions):");
  console.log(`    codeHash: ${truncateHex(tokenB.codeHash)}`);
  console.log(`    hashType: ${tokenB.hashType}`);
  console.log(`    args:     ${truncateHex(tokenB.args)}`);

  console.log("\n  Token A-ext (same Alice, but with type extension):");
  console.log(`    codeHash: ${truncateHex(tokenA_extended.codeHash)}`);
  console.log(`    hashType: ${tokenA_extended.hashType}`);
  console.log(`    args:     ${truncateHex(tokenA_extended.args)}`);

  console.log(`
  Observations:
    - Token A and Token B have different args (different lock hashes),
      so they are DIFFERENT tokens even though they share the same code.
    - Token A and Token A-ext have different args (flags differ),
      so they are also DIFFERENT tokens — even from the same issuer.
    - Token identity is completely determined by { codeHash, hashType, args }.
      Changing any one field creates a different token.
  `);

  // Show args construction
  console.log("  Args construction for Token A:");
  console.log(`    issuer lock hash:  ${truncateHex(issuerA_lockHash, 12)}`);
  console.log(`    flags byte (0x00): 00`);
  console.log(
    `    combined args:     ${truncateHex(tokenA.args)} (33 bytes total)`
  );
}

// ---------------------------------------------------------------------------
// SECTION 3: AMOUNT ENCODING
// ---------------------------------------------------------------------------

/**
 * Show how token amounts are stored in xUDT cells.
 *
 * xUDT stores amounts as LITTLE-ENDIAN uint128 in the first 16 bytes of cell data.
 * This is identical to sUDT's format, ensuring backwards compatibility.
 *
 * Little-endian means the LEAST SIGNIFICANT byte comes first:
 *   Amount 1000 (decimal) = 0x3E8 (hex) stored as: E8 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00
 *
 * uint128 allows amounts up to 340,282,366,920,938,463,463,374,607,431,768,211,455
 * which is far more than any realistic token supply.
 */
function demonstrateAmountEncoding(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 3: Amount Encoding (uint128 Little-Endian)");
  console.log("=".repeat(72));

  console.log(`
  xUDT stores token amounts as uint128 in LITTLE-ENDIAN byte order.
  The amount occupies the FIRST 16 bytes of the cell's data field.

  Little-endian means the byte with the LOWEST address holds the LEAST
  significant bits. This is the native byte order of x86/ARM/RISC-V CPUs,
  making on-chain arithmetic efficient.
  `);

  const examples: Array<[bigint, string]> = [
    [0n, "zero tokens"],
    [1n, "one token (smallest unit)"],
    [1_000n, "one thousand tokens"],
    [1_000_000n, "one million tokens"],
    [1_000_000_000n, "one billion tokens"],
    [100_000_000n, "1.0 token (if 8 decimals, like CKB)"],
    [21_000_000n * 100_000_000n, "21 million tokens with 8 decimals (like Bitcoin supply)"],
    [2n ** 128n - 1n, "maximum uint128 value"],
  ];

  console.log("  Amount encoding examples:");
  console.log("  " + "─".repeat(72));

  for (const [amount, label] of examples) {
    const encoded = encodeAmount(amount);
    const decoded = decodeAmount(encoded);

    // Show first 8 bytes for readability
    const shortHex = encoded.slice(0, 16) + (encoded.length > 16 ? "..." : "");
    console.log(`  ${label}`);
    console.log(`    value:   ${amount.toLocaleString()}`);
    console.log(`    encoded: ${shortHex} (hex LE)`);
    console.log(
      `    decoded: ${decoded.toLocaleString()} ${decoded === amount ? "(matches)" : "(MISMATCH!)"}`
    );
    console.log();
  }

  // Demonstrate extension data after the amount
  console.log(`
  Note: Cell data can contain MORE than 16 bytes. The amount is ALWAYS
  the first 16 bytes. Extension scripts may append their own data after.

  Example: data = <16-byte amount> + <32-byte extension metadata>
  The xUDT script reads only the first 16 bytes for amount verification.
  `);
}

// ---------------------------------------------------------------------------
// SECTION 4: ISSUING TOKENS
// ---------------------------------------------------------------------------

/**
 * Demonstrate the token issuance process.
 *
 * Issuing xUDT tokens means creating the FIRST cells that carry the token.
 * This is called the "genesis" of the token.
 *
 * The issuance process:
 *   1. Choose a lock script (your address) → compute its hash → this is the token ID
 *   2. Build the xUDT type script using that lock hash
 *   3. Create output cells with:
 *      - capacity: enough CKBytes to store the cell
 *      - data: the initial token amount (uint128 LE)
 *      - lock: the recipient's lock script (can be your own or others')
 *      - type: the xUDT type script you just built
 *   4. The xUDT script allows creation when NO input cells have this type script
 *      (this is "owner mode" — the issuer can create new tokens freely)
 *
 * Important: xUDT DOES NOT enforce a maximum supply by default!
 * The issuer can always mint more tokens (owner mode bypasses conservation).
 * To enforce a fixed supply, you need an extension script.
 */
function demonstrateTokenIssuance(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 4: Issuing (Minting) Tokens");
  console.log("=".repeat(72));

  console.log(`
  Token issuance creates the first cells carrying a new token type.
  The issuer's lock script hash becomes the permanent token identifier.

  Issuance transaction structure:

    INPUTS:                          OUTPUTS:
    ┌─────────────────────┐          ┌─────────────────────────────────┐
    │ Plain CKB cell      │ ──────►  │ Token cell (alice's lock)       │
    │ (alice's CKB)       │          │   capacity: 200 CKB             │
    │ capacity: 1000 CKB  │          │   data:     1,000,000 tokens    │
    │ lock:     alice     │          │   lock:     alice               │
    │ type:     none      │          │   type:     xUDT (alice's hash) │
    └─────────────────────┘          ├─────────────────────────────────┤
                                     │ Change cell (alice's CKB)       │
                                     │   capacity: 800 CKB             │
                                     │   data:     (empty)             │
                                     │   lock:     alice               │
                                     │   type:     none                │
                                     └─────────────────────────────────┘

  The xUDT type script sees:
    - GroupInputs:  0 cells with this type script (no tokens consumed)
    - GroupOutputs: 1 cell with this type script (1,000,000 tokens created)

  Since there are no input token cells, the script enters "owner mode".
  In owner mode, the script checks that the ISSUER's lock script is satisfied
  (i.e., alice's signature is in the transaction witnesses). If so, it allows
  any amount to be minted. This is how the issuer retains minting authority.
  `);

  // Show the issuance parameters
  const issuerLockHash =
    "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";
  const initialSupply = 1_000_000n * 100_000_000n; // 1 million tokens, 8 decimals

  const typeScript = buildXudtTypeScript(issuerLockHash, 0x00);
  const encodedAmount = encodeAmount(initialSupply);
  const minCapacity = calculateMinCapacity(20, 33, 16);

  console.log("  Issuance parameters (simulated):");
  console.log(`    issuer lock hash:  ${truncateHex(issuerLockHash)}`);
  console.log(`    initial supply:    ${formatTokenAmount(initialSupply, 8, "TOKEN")}`);
  console.log(`    flags:             0x00 (no extensions)`);
  console.log();
  console.log("  Resulting xUDT type script:");
  console.log(`    codeHash:  ${truncateHex(typeScript.codeHash)}`);
  console.log(`    hashType:  ${typeScript.hashType}`);
  console.log(`    args:      ${truncateHex(typeScript.args)}`);
  console.log();
  console.log("  Token cell data field:");
  console.log(`    hex:       ${encodedAmount}`);
  console.log(`    meaning:   ${initialSupply.toLocaleString()} (smallest units)`);
  console.log(`    display:   ${formatTokenAmount(initialSupply, 8, "TOKEN")}`);
  console.log();
  console.log("  Minimum capacity for this token cell:");
  console.log(`    ${formatCKB(minCapacity)} (storage fee, not spendable)`);

  console.log(`
  Key insight: The CKByte capacity in the token cell is NOT the token value.
  It is a storage deposit that will be returned when the cell is consumed.
  The token VALUE is encoded in the data field as a uint128 number.
  `);

  // Show what happens during second minting (owner mode again)
  console.log("  Minting more tokens (owner exercises minting authority):");
  console.log(`
    As long as the issuer's lock script is satisfied in the transaction,
    they can create additional token cells with ANY amount. There is no
    protocol-level supply cap — that requires an extension script.

    Extension script example: A "max supply" extension that checks
    sum(all existing token cells) + mint_amount <= MAX_SUPPLY
    This requires reading all live token cells during validation, which
    is expensive but possible via CKB's cell collection syscall.
  `);
}

// ---------------------------------------------------------------------------
// SECTION 5: TRANSFERRING TOKENS
// ---------------------------------------------------------------------------

/**
 * Demonstrate the token transfer process.
 *
 * Transferring xUDT tokens means:
 *   1. Consume the sender's token cells (they must satisfy their lock script)
 *   2. Create new token cells with the SAME type script but the recipient's lock
 *   3. The xUDT type script verifies: sum(inputs) == sum(outputs)
 *   4. Any "change" token amount goes back to sender in a separate output
 *
 * This is the fundamental conservation rule of xUDT.
 * It is analogous to how CKByte capacity must balance in every transaction.
 */
function demonstrateTokenTransfer(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 5: Transferring Tokens");
  console.log("=".repeat(72));

  console.log(`
  Token transfers consume input token cells and create output token cells.
  The xUDT type script enforces: sum(inputs) == sum(outputs).

  Transfer transaction structure (Alice sends 300 tokens to Bob):

    INPUTS:                          OUTPUTS:
    ┌─────────────────────┐          ┌─────────────────────────────────┐
    │ Alice's token cell  │ ──────►  │ Bob's token cell                │
    │   capacity: 200 CKB │          │   capacity: 200 CKB             │
    │   data: 1,000,000 T │          │   data: 300,000,000 (smallest)  │
    │   lock: alice       │          │   lock: bob                     │
    │   type: TOKEN_A     │          │   type: TOKEN_A (same!)         │
    ├─────────────────────┤          ├─────────────────────────────────┤
    │ Alice's CKB cell    │          │ Alice's token change            │
    │   (for fees)        │ ──────►  │   capacity: 200 CKB             │
    │   capacity: 100 CKB │          │   data: 700,000,000 (smallest)  │
    │   lock: alice       │          │   lock: alice                   │
    │   type: none        │          │   type: TOKEN_A (same!)         │
    └─────────────────────┘          ├─────────────────────────────────┤
                                     │ Alice's CKB change              │
                                     │   capacity: ~99.99 CKB          │
                                     │   lock: alice                   │
                                     │   type: none                    │
                                     └─────────────────────────────────┘

  xUDT script validates:
    GroupInputs:  [1,000,000,000 smallest units] (alice's token cell)
    GroupOutputs: [300,000,000 + 700,000,000] = [1,000,000,000 smallest units]
    Conservation check: 1,000,000,000 == 1,000,000,000 ✓
  `);

  // Simulate balance verification
  const aliceLockHash =
    "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";
  const typeScript = buildXudtTypeScript(aliceLockHash, 0x00);

  // Alice has 1,000,000 tokens with 8 decimals = 100,000,000,000,000 smallest units
  // Actually let's use simpler numbers for clarity
  const aliceTokenAmount = 1_000_000_000n; // representing 10 tokens with 8 decimals

  const aliceCell: XudtCell = {
    cell: {
      outPoint: { txHash: "0x" + "aa".repeat(32), index: 0 },
      capacity: 200n * 100_000_000n, // 200 CKB in Shannon
      data: "0x" + encodeAmount(aliceTokenAmount),
      lock: {
        codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
        hashType: "type",
        args: "0x" + aliceLockHash.slice(0, 40), // 20-byte pubkey hash
      },
      type: typeScript,
    },
    tokenAmount: aliceTokenAmount,
  };

  const sendAmount = 300_000_000n; // sending 3 tokens
  const changeAmount = aliceTokenAmount - sendAmount; // 7 tokens change

  console.log("  Transfer simulation (Alice → Bob, 3 tokens out of 10):\n");
  console.log("  Alice's input token cell:");
  printXudtCell(aliceCell, 8, "TOKEN");

  console.log("\n  Proposed outputs:");
  console.log(`    Output 1 (Bob receives): ${formatTokenAmount(sendAmount, 8, "TOKEN")}`);
  console.log(`    Output 2 (Alice change): ${formatTokenAmount(changeAmount, 8, "TOKEN")}`);

  const balanceCheck = verifyTransferBalance([aliceCell], [sendAmount, changeAmount]);
  console.log("\n  Balance verification:");
  console.log(
    `    Input total:  ${formatTokenAmount(balanceCheck.inputTotal, 8, "TOKEN")}`
  );
  console.log(
    `    Output total: ${formatTokenAmount(balanceCheck.outputTotal, 8, "TOKEN")}`
  );
  console.log(
    `    Balanced:     ${balanceCheck.balanced ? "YES (transaction is valid)" : "NO (would be rejected)"}`
  );

  console.log(`
  Critical rules for valid token transfers:
    1. Input and output type scripts must be IDENTICAL (same token)
    2. sum(input amounts) MUST equal sum(output amounts)
    3. The sender's lock script must be satisfied (their signature required)
    4. Each output cell must have enough capacity for its size

  If rule 2 is violated, the xUDT script returns a non-zero exit code,
  and the CKB node rejects the transaction.
  `);
}

// ---------------------------------------------------------------------------
// SECTION 6: QUERYING TOKEN BALANCES
// ---------------------------------------------------------------------------

/**
 * Demonstrate how to check token balances.
 *
 * In xUDT's model, a "balance" is not a single number in a database.
 * It is the SUM of amounts across ALL cells that:
 *   1. Have the specific xUDT type script (identifies the token)
 *   2. Have the specific lock script (identifies the owner)
 *
 * This requires querying the CKB node's cell index for live cells matching
 * both criteria. The CKB RPC and indexer services support this query.
 *
 * The CCC SDK provides cell collection with type script filters,
 * making balance queries straightforward.
 */
function demonstrateBalanceQuery(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 6: Querying Token Balances");
  console.log("=".repeat(72));

  console.log(`
  In CKB's cell model, there is no central "balance sheet". To check
  someone's token balance, you must:

    1. Know the xUDT type script (identifies the token)
    2. Know the owner's lock script (identifies the owner)
    3. Query for all LIVE cells matching both scripts
    4. Sum the uint128 amounts from their data fields

  This is fundamentally different from ERC-20, where you call:
    balanceOf(address) → returns a single uint256 from contract storage

  CKB's approach has trade-offs:
    Advantage: No central contract can freeze your tokens or be hacked
    Advantage: Token cells are owned directly in your wallet's UTXO set
    Disadvantage: Balance queries require scanning the UTXO set (indexer)
    Disadvantage: More complex wallet implementations

  The CCC SDK handles this complexity with CellCollector.
  `);

  // Simulate multiple token cells for one owner
  const ownerLockHash =
    "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";
  const tokenTypeScript = buildXudtTypeScript(ownerLockHash, 0x00);

  const ownerLock: Script = {
    codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    hashType: "type",
    args: "0x" + ownerLockHash.slice(0, 40),
  };

  // Simulate finding multiple token cells (wallet may have received tokens in separate txs)
  const simulatedCells: XudtCell[] = [
    {
      cell: {
        outPoint: { txHash: "0x" + "11".repeat(32), index: 0 },
        capacity: 200n * 100_000_000n,
        data: "0x" + encodeAmount(500_000_000n),
        lock: ownerLock,
        type: tokenTypeScript,
      },
      tokenAmount: 500_000_000n,
    },
    {
      cell: {
        outPoint: { txHash: "0x" + "22".repeat(32), index: 1 },
        capacity: 200n * 100_000_000n,
        data: "0x" + encodeAmount(250_000_000n),
        lock: ownerLock,
        type: tokenTypeScript,
      },
      tokenAmount: 250_000_000n,
    },
    {
      cell: {
        outPoint: { txHash: "0x" + "33".repeat(32), index: 0 },
        capacity: 200n * 100_000_000n,
        data: "0x" + encodeAmount(750_000_000n),
        lock: ownerLock,
        type: tokenTypeScript,
      },
      tokenAmount: 750_000_000n,
    },
  ];

  console.log("  Simulated balance query results:");
  console.log(
    `  Searching for: TOKEN_A cells owned by ${truncateHex(ownerLockHash)}`
  );
  console.log(`  Found ${simulatedCells.length} token cells:\n`);

  for (const cell of simulatedCells) {
    printXudtCell(cell, 8, "TOKEN");
    console.log();
  }

  const totalBalance = sumTokenAmounts(simulatedCells);
  console.log("  " + "─".repeat(50));
  console.log(`  Total balance: ${formatTokenAmount(totalBalance, 8, "TOKEN")}`);
  console.log(`  Raw total:     ${totalBalance.toLocaleString()} (smallest units)`);

  // Show CCC SDK code for real balance query
  console.log(`
  CCC SDK code to query real balances (requires funded testnet account):

    import { ccc } from "@ckb-ccc/core";

    async function getTokenBalance(
      client: ccc.Client,
      ownerAddress: string,
      tokenTypeScript: ccc.Script
    ): Promise<bigint> {
      // Parse the owner's address into lock script
      const ownerLock = (await ccc.Address.fromString(ownerAddress, client)).script;

      // Collect all cells matching both lock AND type scripts
      let totalAmount = 0n;
      for await (const cell of client.findCells({
        script: ownerLock,
        scriptType: "lock",
        filter: {
          script: tokenTypeScript,
          scriptType: "type",
        },
      })) {
        // Decode the uint128 LE amount from the first 16 bytes of data
        if (cell.outputData && cell.outputData.length >= 34) { // "0x" + 32 hex chars
          const amount = decodeAmount(cell.outputData);
          totalAmount += amount;
        }
      }

      return totalAmount;
    }
  `);
}

// ---------------------------------------------------------------------------
// SECTION 7: xUDT EXTENSION SCRIPTS
// ---------------------------------------------------------------------------

/**
 * Explain xUDT's extension mechanism.
 *
 * The "x" in xUDT stands for "extensible". The extension mechanism allows
 * token issuers to attach custom validation logic that runs alongside the
 * base xUDT conservation check.
 *
 * Extension scripts are identified in the xUDT type args:
 *   byte 32 (flags):
 *     0x00 = no extension (pure conservation check)
 *     0x01 = extension by type hash (look for cell with this type script)
 *     0x02 = extension by data hash (look for cell with this code hash in data)
 *
 * Extension use cases:
 *   - Fixed supply: enforce a maximum mint amount
 *   - Whitelist: only allow transfers between KYC-verified addresses
 *   - Vesting: lock tokens until a certain block height
 *   - Governance: require multi-sig for large transfers
 *   - Regulatory compliance: freeze specific addresses
 */
function demonstrateExtensionScripts(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 7: xUDT Extension Scripts");
  console.log("=".repeat(72));

  console.log(`
  The "eXtensible" part of xUDT: custom validation logic via extension scripts.

  Without extensions (flags=0x00):
    xUDT only checks: sum(inputs) == sum(outputs)
    The owner can mint freely. No supply cap. No transfer restrictions.

  With extensions (flags=0x01 or 0x02):
    xUDT checks conservation AND invokes the extension script(s).
    Extension scripts can enforce arbitrary additional rules.

  How extension scripts work:
    1. The xUDT type args contain: [lock_hash][flags][ext_script_hash]
    2. When a transaction involves token cells, xUDT loads the extension script
    3. The extension script runs and can read the transaction context
    4. Both the conservation check AND the extension check must pass

  Extension script lifecycle:
    ┌──────────────────────────────────────────────┐
    │  xUDT type script runs                       │
    │    1. Check owner mode OR conservation        │
    │    2. If flags != 0x00:                       │
    │       a. Find the extension script binary     │
    │       b. Execute extension script             │
    │       c. Extension must return 0 (success)    │
    │    3. Return 0 (success) if all checks pass   │
    └──────────────────────────────────────────────┘

  Owner mode bypass:
    If the token OWNER's lock script is satisfied in the transaction,
    the extension scripts are SKIPPED. This allows the issuer to:
    - Mint new tokens
    - Freeze/unfreeze the token
    - Upgrade extension scripts
    The trade-off: users must trust the issuer's behavior.
  `);

  console.log("  Example extension scripts:\n");

  const extensions = [
    {
      name: "MaxSupply",
      description: "Enforce a hard cap on total token supply",
      logic: `
        fn validate_max_supply(inputs: Vec<Cell>, outputs: Vec<Cell>) -> bool {
          let max_supply: u128 = 21_000_000 * 10u128.pow(8);
          let output_total: u128 = outputs.iter().map(|c| read_amount(c)).sum();
          let input_total: u128 = inputs.iter().map(|c| read_amount(c)).sum();
          // Only new mints (output > input) need to be checked
          if output_total > input_total {
            // Must not exceed max supply (simplified; real impl queries all cells)
            output_total <= max_supply
          } else {
            true // burns are always allowed
          }
        }`,
    },
    {
      name: "Whitelist",
      description: "Only allow transfers between approved addresses",
      logic: `
        fn validate_whitelist(outputs: Vec<Cell>, approved_hashes: Vec<[u8;32]>) -> bool {
          // Every output token cell's lock hash must be in the approved list
          outputs.iter().all(|cell| {
            let lock_hash = blake2b(serialize(cell.lock));
            approved_hashes.contains(&lock_hash)
          })
        }`,
    },
  ];

  for (const ext of extensions) {
    console.log(`  Extension: ${ext.name}`);
    console.log(`  Purpose:   ${ext.description}`);
    console.log(`  Pseudo-code:${ext.logic}`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// SECTION 8: xUDT vs ERC-20 COMPARISON
// ---------------------------------------------------------------------------

/**
 * Compare xUDT's "first-class asset" model to ERC-20's contract storage model.
 *
 * This is one of the most important conceptual differences between CKB and Ethereum.
 *
 * ERC-20 model:
 *   - A smart contract maintains a mapping: address → uint256 balance
 *   - "Owning" tokens means having a non-zero entry in this mapping
 *   - Transferring requires calling the contract: contract.transfer(to, amount)
 *   - The contract can freeze/blacklist/rug users (it has full control)
 *   - A contract bug can destroy all tokens (shared state)
 *
 * xUDT (first-class asset) model:
 *   - Each user holds their own cells containing their token amount
 *   - "Owning" tokens means having cells in your UTXO set with a type script
 *   - Transferring requires consuming your cells and creating new ones
 *   - No contract can freeze your cells (you hold the lock script key)
 *   - A bug in someone else's token doesn't affect your cells
 */
function compareXudtToERC20(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 8: xUDT vs ERC-20 — First-Class Assets vs Contract Storage");
  console.log("=".repeat(72));

  console.log(`
  The fundamental difference: WHERE token balances live.

  ERC-20 (Ethereum):
    ┌─────────────────────────────────────────┐
    │ MyToken Contract (address: 0xABC...)    │
    │   storage:                              │
    │     balances[Alice] = 1000              │
    │     balances[Bob]   = 500               │
    │     balances[Carol] = 250               │
    │   functions:                            │
    │     transfer(to, amount) → modifies map │
    │     approve(spender, amount)            │
    │     transferFrom(from, to, amount)      │
    └─────────────────────────────────────────┘

  The contract HOLDS everyone's balances in a single shared data structure.
  Alice cannot spend her tokens without going through the contract.

  xUDT (CKB):
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ Alice's Cell    │  │ Bob's Cell      │  │ Carol's Cell    │
    │   capacity: 200 │  │   capacity: 200 │  │   capacity: 200 │
    │   data: 1000    │  │   data: 500     │  │   data: 250     │
    │   lock: Alice   │  │   lock: Bob     │  │   lock: Carol   │
    │   type: TOKEN_A │  │   type: TOKEN_A │  │   type: TOKEN_A │
    └─────────────────┘  └─────────────────┘  └─────────────────┘

  Each user's token balance is in THEIR OWN CELLS in the UTXO set.
  Alice owns her cell directly. No contract mediates the transfer.
  `);

  // Print comparison table
  console.log("  " + "=".repeat(72));
  console.log("  Comparison: xUDT vs ERC-20");
  console.log("  " + "=".repeat(72));

  const comparisons: Array<[string, string, string]> = [
    ["Aspect", "xUDT (CKB)", "ERC-20 (Ethereum)"],
    ["Balance storage", "UTXO cells (user-owned)", "Contract mapping (contract-owned)"],
    ["Transfer model", "Consume + create cells", "Contract state update"],
    ["Token freezing", "Not possible (owner holds key)", "Contract can blacklist"],
    ["Contract bug risk", "Each user's cells are independent", "All balances at risk"],
    ["Privacy", "Aggregated from multiple cells", "Single contract lookup"],
    ["Composability", "Cell deps (read-only refs)", "External contract calls"],
    ["Parallelism", "Parallel cell consumption", "Sequential state writes"],
    ["Custom logic", "Extension scripts (optional)", "Inherited in contract"],
    ["Wallet complexity", "Must collect/merge cells", "Single balance call"],
    ["Gas model", "CKByte capacity (storage)", "Gas per computation"],
    ["Reentrancy risk", "Not applicable (no callbacks)", "Classic vulnerability"],
    ["Upgradability", "Extension script replacement", "Proxy pattern or new deploy"],
    ["Standards", "RFC-0052 (open spec)", "EIP-20 (open spec)"],
  ];

  for (const [aspect, xudt, erc20] of comparisons) {
    if (aspect === "Aspect") {
      console.log(
        `  ${"Aspect".padEnd(22)} ${"xUDT (CKB)".padEnd(35)} ERC-20 (Ethereum)`
      );
      console.log("  " + "─".repeat(72));
      continue;
    }
    console.log(`  ${aspect.padEnd(22)} ${xudt.padEnd(35)} ${erc20}`);
  }
  console.log("  " + "=".repeat(72));

  console.log(`
  When to prefer xUDT's model:
    - You need self-sovereign asset ownership (no admin key risk)
    - You want deterministic, parallelizable transactions
    - You are building with RGB++ for Bitcoin-anchored assets
    - You need tokens that work with CKB's native capacity accounting

  When ERC-20 might be simpler:
    - You need a simple "balanceOf" lookup (no UTXO scanning)
    - Your users expect Ethereum-style wallet UX
    - Your token logic requires complex shared state
  `);
}

// ---------------------------------------------------------------------------
// SECTION 9: LIVE NETWORK DEMONSTRATION (CCC SDK)
// ---------------------------------------------------------------------------

/**
 * Show how to use the CCC SDK to work with xUDT on the testnet.
 *
 * This section demonstrates the code patterns without requiring a live
 * testnet connection (to keep the demo runnable offline). The patterns
 * shown here work directly against the CKB Pudge testnet.
 *
 * To use with real testnet:
 *   1. Get testnet CKB from the faucet: https://faucet.nervos.org
 *   2. Set TESTNET_PRIVATE_KEY environment variable
 *   3. Uncomment the live code sections
 */
async function demonstrateCCCSDKUsage(): Promise<void> {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 9: Using CCC SDK for xUDT Operations");
  console.log("=".repeat(72));

  console.log(`
  The CCC (Common Chain Connector) SDK abstracts CKB transaction building.
  It handles cell collection, capacity management, and signing.

  Install:
    npm install @ckb-ccc/core

  Core patterns for xUDT:
  `);

  // Show the SDK initialization pattern
  console.log("  1. Initialize client and signer:");
  console.log(`
    import { ccc } from "@ckb-ccc/core";

    // Connect to testnet (Pudge)
    const client = new ccc.ClientPublicTestnet();

    // Create signer from private key (for demonstration only — use hardware wallet in production)
    const privateKey = process.env.TESTNET_PRIVATE_KEY!;
    const signer = new ccc.SignerCkbPrivateKey(client, privateKey);

    // Get your address
    const address = await signer.getRecommendedAddressObj();
    const lockScript = address.script;
    console.log("Address:", await signer.getRecommendedAddress());
  `);

  // Show token issuance pattern
  console.log("  2. Issue a new xUDT token:");
  console.log(`
    async function issueToken(signer: ccc.Signer, supply: bigint): Promise<string> {
      // Get issuer's lock script
      const issuerLock = (await signer.getRecommendedAddressObj()).script;

      // Compute the lock hash — this becomes the token's identity
      const lockHash = issuerLock.hash();

      // Build the xUDT type script for this token
      const xudtTypeScript = new ccc.Script(
        "0x50bd8d6680b8b9cf98b73f3c08faf8b9a21c7a8d425eb81f62c5b2c2c9bef4cd", // xUDT code hash (testnet)
        "data1",
        lockHash + "00" // lock hash + flags byte (0x00 = no extension)
      );

      // Build the transaction
      const tx = ccc.Transaction.from({
        outputs: [{
          capacity: 20000000000n, // 200 CKB in Shannon
          lock: issuerLock,
          type: xudtTypeScript,
        }],
        outputsData: [
          ccc.numLeToBytes(supply, 16) // uint128 LE encoding
        ],
      });

      // Add cell deps for xUDT script
      await tx.addCellDeps(signer.client, xudtTypeScript);

      // Complete: collect input cells, add change, compute fee
      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, 1000); // 1000 shannons/byte fee rate

      // Sign and broadcast
      const txHash = await signer.sendTransaction(tx);
      console.log("Token issued! Transaction:", txHash);
      return txHash;
    }
  `);

  // Show token transfer pattern
  console.log("  3. Transfer xUDT tokens:");
  console.log(`
    async function transferToken(
      signer: ccc.Signer,
      tokenTypeScript: ccc.Script,
      recipientAddress: string,
      amount: bigint
    ): Promise<string> {
      const client = signer.client;

      // Collect sender's token cells
      const senderLock = (await signer.getRecommendedAddressObj()).script;
      let collectedAmount = 0n;
      const tokenInputs: ccc.Cell[] = [];

      for await (const cell of client.findCells({
        script: senderLock,
        scriptType: "lock",
        filter: { script: tokenTypeScript, scriptType: "type" },
      })) {
        tokenInputs.push(cell);
        collectedAmount += ccc.numLeFromBytes(ccc.bytesFrom(cell.outputData));
        if (collectedAmount >= amount) break;
      }

      if (collectedAmount < amount) {
        throw new Error(\`Insufficient token balance: \${collectedAmount} < \${amount}\`);
      }

      // Parse recipient address
      const recipientLock = (await ccc.Address.fromString(recipientAddress, client)).script;

      // Build outputs
      const outputs: ccc.CellOutput[] = [
        // To recipient
        {
          capacity: 20000000000n, // 200 CKB (recipient must have enough for storage)
          lock: recipientLock,
          type: tokenTypeScript,
        },
      ];
      const outputsData = [ccc.numLeToBytes(amount, 16)];

      // Add change if needed
      const changeAmount = collectedAmount - amount;
      if (changeAmount > 0n) {
        outputs.push({
          capacity: 20000000000n, // 200 CKB for change cell
          lock: senderLock,
          type: tokenTypeScript,
        });
        outputsData.push(ccc.numLeToBytes(changeAmount, 16));
      }

      const tx = ccc.Transaction.from({ outputs, outputsData });

      // Add the collected token cells as inputs
      tx.inputs.push(...tokenInputs.map(cell =>
        ccc.CellInput.from({ previousOutput: cell.outPoint })
      ));

      // Add cell deps for xUDT and lock scripts
      await tx.addCellDeps(client, tokenTypeScript);
      await tx.addCellDeps(client, senderLock);

      // Complete CKByte inputs and fee
      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, 1000);

      const txHash = await signer.sendTransaction(tx);
      console.log("Transfer complete! Transaction:", txHash);
      return txHash;
    }
  `);

  console.log(`
  Note: The above code requires a funded testnet account. To get testnet
  CKB, visit: https://faucet.nervos.org

  The patterns shown are the same ones used by real xUDT wallets and DEXes
  on CKB mainnet, including:
    - JoyID wallet (xUDT support)
    - CKBull wallet
    - Stable++ protocol (RUSD stablecoin)
    - Omiga inscription protocol
  `);
}

// ---------------------------------------------------------------------------
// SECTION 10: SUMMARY
// ---------------------------------------------------------------------------

function printSummary(): void {
  console.log("\n" + "=".repeat(72));
  console.log("  SECTION 10: Summary");
  console.log("=".repeat(72));

  console.log(`
  You have explored xUDT — CKB's extensible fungible token standard.

  Key takeaways:

  1. CELL STRUCTURE
     Each xUDT token cell contains:
       - capacity:  CKByte storage deposit (returned on consumption)
       - data:      uint128 LE amount (first 16 bytes)
       - lock:      owner's lock script (who can spend)
       - type:      xUDT type script (which token, and conservation rules)

  2. TOKEN IDENTITY
     A token is uniquely identified by its complete type script:
       { codeHash, hashType, args: [lock_hash][flags][ext_args] }
     The owner's lock hash in args makes each token globally unique.

  3. CONSERVATION RULE
     The xUDT script enforces: sum(input amounts) == sum(output amounts)
     Violations cause the transaction to be rejected by CKB nodes.
     Owner mode allows the issuer to mint freely (bypasses conservation).

  4. FIRST-CLASS ASSETS
     Token cells live in the UTXO set, owned directly by users.
     No central contract mediates transfers. No admin can freeze your tokens.
     This is the "first-class asset" model — tokens are as native as CKB itself.

  5. EXTENSIONS
     The flags byte in type args enables custom validation scripts:
       0x00 = pure conservation (like sUDT)
       0x01 = extension by type hash
       0x02 = extension by data hash
     Extensions enable: supply caps, whitelists, vesting schedules, etc.

  6. xUDT vs ERC-20
     xUDT: each user owns their cells — no central storage, no freeze risk
     ERC-20: contract owns all balances — simpler queries, higher trust risk

  Next steps:
    - Lesson 14: Non-Fungible Tokens with Spore Protocol
    - Lesson 15: OmniLock for multi-chain wallet support
    - Lesson 22: Building a Token DEX using xUDT cells
  `);

  // Final comparison
  printUdtComparison();
}

// ---------------------------------------------------------------------------
// MAIN ENTRY POINT
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=".repeat(72));
  console.log("  Lesson 13: Fungible Tokens with xUDT");
  console.log("  CKB Learning Fundamentals");
  console.log("=".repeat(72));
  console.log(`
  This lesson covers the xUDT (eXtensible User Defined Token) standard
  for creating and managing fungible tokens on CKB.

  We will explore:
    1. What xUDT is and how it fits into CKB's design
    2. Token identity and the type script structure
    3. Amount encoding (uint128 little-endian)
    4. Issuing (minting) a new token
    5. Transferring tokens between addresses
    6. Querying token balances
    7. Extension scripts for custom validation logic
    8. First-class assets: xUDT vs ERC-20
    9. Using the CCC SDK for xUDT operations
  `);

  // Run all sections sequentially
  explainXudtStandard();
  demonstrateTokenIdentity();
  demonstrateAmountEncoding();
  demonstrateTokenIssuance();
  demonstrateTokenTransfer();
  demonstrateBalanceQuery();
  demonstrateExtensionScripts();
  compareXudtToERC20();
  await demonstrateCCCSDKUsage();
  printSummary();

  console.log("\n" + "=".repeat(72));
  console.log("  End of Lesson 13: Fungible Tokens with xUDT");
  console.log("=".repeat(72));
}

main().catch((error) => {
  console.error("Error running lesson:", error);
  process.exit(1);
});
