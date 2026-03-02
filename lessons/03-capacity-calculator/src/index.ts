/**
 * ============================================================================
 * Lesson 03: CKB Capacity Calculator
 * ============================================================================
 *
 * This CLI tool teaches you how capacity works on CKB (Common Knowledge Base).
 *
 * KEY INSIGHT: On CKB, the native token (CKByte) serves a dual purpose:
 *   1. It is the native cryptocurrency used to pay for transactions
 *   2. It represents on-chain storage space: 1 CKByte = 1 byte of storage
 *
 * This means every piece of data stored on CKB must be "backed" by CKBytes.
 * The amount of CKBytes locked in a cell must be >= the total size of that cell
 * in bytes. This is the "capacity" constraint.
 *
 * This program calculates how many CKBytes you need to store different types
 * of data on-chain, and also covers the broader CKB tokenomics model:
 *   - Primary issuance (hard cap of 33.6 billion CKBytes)
 *   - Secondary issuance (1.344 billion CKBytes per year, perpetual)
 *   - Nervos DAO (inflation shelter for long-term holders)
 *
 * Run with: npx tsx src/index.ts
 * ============================================================================
 */

// ============================================================================
// SECTION 1: Constants
// ============================================================================

/**
 * 1 CKByte = 10^8 shannons (the smallest unit, like satoshis in Bitcoin).
 * When we say "61 CKBytes", we mean 61 * 100_000_000 = 6,100,000,000 shannons.
 */
const SHANNONS_PER_CKBYTE = 100_000_000n;

/**
 * The capacity field itself is a 64-bit unsigned integer stored as 8 bytes.
 * Every cell must include this field, so it always contributes 8 bytes to the
 * minimum capacity requirement.
 */
const CAPACITY_FIELD_SIZE = 8;

/**
 * A standard lock script using the default SECP256K1-BLAKE160 scheme:
 *   - code_hash: 32 bytes (the blake2b hash of the lock script code)
 *   - hash_type: 1 byte  (either "type" or "data")
 *   - args:      20 bytes (the blake160 hash of the public key)
 *   Total:       53 bytes
 *
 * This is the most common lock script on CKB, similar to a Bitcoin P2PKH address.
 */
const DEFAULT_LOCK_SCRIPT_SIZE = {
  codeHash: 32,
  hashType: 1,
  args: 20,
  get total() {
    return this.codeHash + this.hashType + this.args; // 53 bytes
  },
};

/**
 * A typical type script has the same structure as a lock script:
 *   - code_hash: 32 bytes
 *   - hash_type: 1 byte
 *   - args:      variable (we use 20 bytes as a common default)
 *   Total:       53 bytes (with 20-byte args)
 *
 * Type scripts are optional. When present, they validate how a cell can be
 * created, updated, or destroyed. Think of them as smart contract rules.
 */
const DEFAULT_TYPE_SCRIPT_SIZE = {
  codeHash: 32,
  hashType: 1,
  args: 20,
  get total() {
    return this.codeHash + this.hashType + this.args; // 53 bytes
  },
};

/**
 * Primary issuance constants.
 * CKB has a Bitcoin-like primary issuance schedule with a hard cap.
 */
const PRIMARY_ISSUANCE = {
  /** The total hard cap of primary issuance: 33.6 billion CKBytes */
  hardCapCKB: 33_600_000_000n,
  /** The initial reward per epoch (approximately 4 hours) in CKBytes */
  initialEpochReward: 1_917_808_219_178n, // shannons per epoch
  /** Halving occurs every 8,760 epochs (approximately every 4 years) */
  halvingIntervalEpochs: 8_760,
  /** An epoch is approximately 4 hours long */
  epochDurationHours: 4,
};

/**
 * Secondary issuance constants.
 * Unlike primary issuance, secondary issuance has no hard cap and continues
 * forever. It serves as "state rent" — a mechanism to ensure that occupying
 * on-chain storage has an ongoing cost.
 */
const SECONDARY_ISSUANCE = {
  /** Fixed at 1.344 billion CKBytes per year, forever */
  annualCKB: 1_344_000_000n,
  /** Per epoch (there are roughly 2,190 epochs per year) */
  perEpochCKB: 613_699n, // approximate CKBytes per epoch
};

// ============================================================================
// SECTION 2: Capacity Calculation Functions
// ============================================================================

/**
 * The core capacity formula for a CKB cell:
 *
 *   Required Capacity (bytes) =
 *       8 (capacity field)
 *     + lock script size (code_hash + hash_type + args)
 *     + [type script size] (optional: code_hash + hash_type + args)
 *     + data size
 *
 * Since 1 CKByte = 1 byte of storage, the number of bytes IS the number
 * of CKBytes required.
 *
 * IMPORTANT: The capacity field stores the total CKBytes available in the cell.
 * This value must be >= the total bytes the cell occupies. If you try to create
 * a cell whose total byte size exceeds its capacity value, the transaction will
 * be rejected by the network.
 */
interface CapacityBreakdown {
  /** The 8-byte capacity field that every cell must have */
  capacityFieldBytes: number;
  /** Size of the lock script in bytes */
  lockScriptBytes: number;
  /** Size of the type script in bytes (0 if no type script) */
  typeScriptBytes: number;
  /** Size of the data field in bytes */
  dataBytes: number;
  /** Total bytes = total CKBytes required */
  totalBytes: number;
  /** Total in shannons (totalBytes * 10^8) */
  totalShannons: bigint;
  /** Human-readable CKByte amount */
  totalCKBytes: number;
}

/**
 * Calculate the capacity (in bytes and CKBytes) required for a cell.
 *
 * @param dataSize      - Number of bytes in the cell's data field
 * @param hasTypeScript - Whether the cell has a type script
 * @param lockArgsSize  - Size of lock script args (default: 20 bytes for SECP256K1-BLAKE160)
 * @param typeArgsSize  - Size of type script args (default: 20 bytes)
 * @returns A detailed breakdown of the capacity requirement
 */
function calculateCapacity(
  dataSize: number,
  hasTypeScript: boolean = false,
  lockArgsSize: number = 20,
  typeArgsSize: number = 20
): CapacityBreakdown {
  // Every cell has the 8-byte capacity field
  const capacityFieldBytes = CAPACITY_FIELD_SIZE;

  // Every cell must have a lock script (it defines ownership)
  // Lock script = 32 (code_hash) + 1 (hash_type) + lockArgsSize (args)
  const lockScriptBytes = 32 + 1 + lockArgsSize;

  // Type script is optional
  // When present: 32 (code_hash) + 1 (hash_type) + typeArgsSize (args)
  const typeScriptBytes = hasTypeScript ? 32 + 1 + typeArgsSize : 0;

  // Data field is the arbitrary data stored in the cell
  const dataBytes = dataSize;

  // Sum it all up
  const totalBytes =
    capacityFieldBytes + lockScriptBytes + typeScriptBytes + dataBytes;

  // Convert to shannons: 1 CKByte = 10^8 shannons
  const totalShannons = BigInt(totalBytes) * SHANNONS_PER_CKBYTE;

  return {
    capacityFieldBytes,
    lockScriptBytes,
    typeScriptBytes,
    dataBytes,
    totalBytes,
    totalShannons,
    totalCKBytes: totalBytes, // 1 byte = 1 CKByte
  };
}

/**
 * Pretty-print a capacity breakdown to the console.
 */
function printBreakdown(label: string, breakdown: CapacityBreakdown): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Capacity field:   ${breakdown.capacityFieldBytes} bytes`);
  console.log(`  Lock script:      ${breakdown.lockScriptBytes} bytes`);
  if (breakdown.typeScriptBytes > 0) {
    console.log(`  Type script:      ${breakdown.typeScriptBytes} bytes`);
  } else {
    console.log(`  Type script:      (none)`);
  }
  console.log(`  Data:             ${breakdown.dataBytes} bytes`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  TOTAL:            ${breakdown.totalBytes} bytes`);
  console.log(
    `  Required:         ${breakdown.totalCKBytes} CKBytes (${breakdown.totalShannons.toLocaleString()} shannons)`
  );
}

// ============================================================================
// SECTION 3: Interactive Examples
// ============================================================================

/**
 * Example 1: The minimal cell
 *
 * A cell with NO data and NO type script. This is the absolute minimum cell
 * on CKB. It has only:
 *   - 8 bytes for the capacity field
 *   - 53 bytes for the default lock script (32 + 1 + 20)
 *   = 61 bytes = 61 CKBytes
 *
 * This means you need at least 61 CKBytes to create any cell on CKB.
 * At $0.005 per CKByte, that is roughly $0.305 to create a minimal cell.
 */
function example1_MinimalCell(): void {
  console.log("\n\n");
  console.log("*".repeat(60));
  console.log("  EXAMPLE 1: The Minimal Cell");
  console.log("*".repeat(60));
  console.log(
    "\n  Question: What is the absolute minimum CKBytes needed to"
  );
  console.log("  create a cell on CKB?");
  console.log(
    "\n  A cell with no data and no type script still needs space for:"
  );
  console.log("    - The capacity field itself (8 bytes)");
  console.log(
    "    - A lock script to define ownership (53 bytes for default)"
  );

  const breakdown = calculateCapacity(0, false);
  printBreakdown("Minimal Cell (no data, no type script)", breakdown);

  console.log(
    "\n  KEY TAKEAWAY: You need at least 61 CKBytes to create any cell."
  );
  console.log(
    "  This is a fundamental constraint of the CKB storage model."
  );
}

/**
 * Example 2: Storing a 32-byte hash on-chain
 *
 * A common use case: storing a cryptographic hash (like a SHA-256 or Blake2b
 * digest) on-chain. The hash goes into the data field.
 *
 * Capacity = 8 (capacity) + 53 (lock) + 32 (data) = 93 bytes = 93 CKBytes
 */
function example2_HashStorage(): void {
  console.log("\n\n");
  console.log("*".repeat(60));
  console.log("  EXAMPLE 2: Storing a 32-Byte Hash On-Chain");
  console.log("*".repeat(60));
  console.log(
    "\n  Question: How much CKB to store a 32-byte hash (e.g., SHA-256)?"
  );
  console.log("\n  Use case: You want to anchor a document hash on-chain");
  console.log("  for proof-of-existence, timestamping, or verification.");

  const breakdown = calculateCapacity(32, false);
  printBreakdown("Cell with 32-byte hash in data field", breakdown);

  console.log(
    `\n  That is ${breakdown.totalBytes - 61} bytes more than a minimal cell,`
  );
  console.log("  because the 32-byte hash goes into the data field.");
}

/**
 * Example 3: A simple fungible token cell (xUDT)
 *
 * An xUDT (Extensible User Defined Token) cell stores:
 *   - Lock script: 53 bytes (default SECP256K1-BLAKE160)
 *   - Type script: 53 bytes (xUDT type script with 20-byte args)
 *   - Data: 16 bytes (u128 for the token amount)
 *   - Capacity field: 8 bytes
 *   Total: 130 bytes = 130 CKBytes
 *
 * NOTE: In practice, xUDT type script args are typically 32 bytes (owner
 * lock hash), so the actual cost may be 142 CKBytes. We show both below.
 */
function example3_TokenCell(): void {
  console.log("\n\n");
  console.log("*".repeat(60));
  console.log("  EXAMPLE 3: Simple Token Cell (xUDT)");
  console.log("*".repeat(60));
  console.log(
    "\n  Question: How much CKB to hold a fungible token balance?"
  );
  console.log("\n  xUDT tokens store a u128 amount (16 bytes) in cell data.");
  console.log("  They also require a type script to identify the token type.");

  // Standard case: 20-byte type args
  const breakdown20 = calculateCapacity(16, true, 20, 20);
  printBreakdown("Token cell (20-byte type args)", breakdown20);

  // Realistic case: 32-byte type args (owner lock hash)
  const breakdown32 = calculateCapacity(16, true, 20, 32);
  printBreakdown("Token cell (32-byte type args, more common)", breakdown32);

  console.log(
    "\n  KEY TAKEAWAY: Holding any token on CKB requires locking CKBytes"
  );
  console.log(
    "  to pay for the storage. This is fundamentally different from"
  );
  console.log(
    "  Ethereum, where holding ERC-20 tokens does not require ETH"
  );
  console.log("  beyond gas fees for transactions.");
}

/**
 * Example 4: Storing 1 KB of arbitrary data on-chain
 *
 * If you want to store a larger piece of data (e.g., a small JSON document,
 * an SVG image, or a configuration blob), you need significantly more CKBytes.
 *
 * 1 KB = 1024 bytes of data
 * Total = 8 + 53 + 1024 = 1085 bytes = 1,085 CKBytes (without type script)
 * Total = 8 + 53 + 53 + 1024 = 1138 bytes = 1,138 CKBytes (with type script)
 */
function example4_OneKBData(): void {
  console.log("\n\n");
  console.log("*".repeat(60));
  console.log("  EXAMPLE 4: Storing 1 KB of Data On-Chain");
  console.log("*".repeat(60));
  console.log(
    "\n  Question: How much CKB to store 1 KB of arbitrary data?"
  );
  console.log("\n  Use case: Storing a small JSON config, SVG image, or");
  console.log("  any binary blob directly in a cell's data field.");

  const withoutType = calculateCapacity(1024, false);
  printBreakdown("1 KB data cell (no type script)", withoutType);

  const withType = calculateCapacity(1024, true);
  printBreakdown("1 KB data cell (with type script)", withType);

  console.log(
    "\n  COMPARISON: To store 1 KB of data permanently on Ethereum,"
  );
  console.log(
    "  you would pay a one-time gas fee (which can be very high during"
  );
  console.log(
    "  congestion). On CKB, you lock 1,085+ CKBytes for the duration"
  );
  console.log(
    "  the data is on-chain. When you no longer need the data, you can"
  );
  console.log("  destroy the cell and recover ALL of your CKBytes.");
}

/**
 * Example 5: A Nervos DAO deposit cell
 *
 * The Nervos DAO is a special smart contract on CKB. When you deposit CKBytes
 * into the DAO, you receive interest from the secondary issuance. A DAO
 * deposit cell looks like:
 *   - Lock script: 53 bytes (your lock, default SECP256K1-BLAKE160)
 *   - Type script: 53 bytes (Nervos DAO type script)
 *   - Data: 8 bytes (deposit block number, u64)
 *   - Capacity field: 8 bytes
 *   Total: 122 bytes = 122 CKBytes minimum to make a DAO deposit
 */
function example5_NervosDAOCell(): void {
  console.log("\n\n");
  console.log("*".repeat(60));
  console.log("  EXAMPLE 5: Nervos DAO Deposit Cell");
  console.log("*".repeat(60));
  console.log(
    "\n  The Nervos DAO lets you lock CKBytes to earn interest from"
  );
  console.log("  secondary issuance, effectively shielding you from inflation.");

  // DAO deposit stores 8 bytes of data (the deposit block number as u64)
  // The DAO type script args are 0 bytes (uses a well-known code_hash)
  // But the type script itself still has code_hash (32) + hash_type (1) = 33 bytes
  const breakdown = calculateCapacity(8, true, 20, 0);
  printBreakdown("Nervos DAO deposit cell", breakdown);

  console.log(
    "\n  Note: The DAO type script has no args (0 bytes), just the code_hash"
  );
  console.log(
    "  and hash_type. The 8 bytes of data store the deposit block number."
  );
}

// ============================================================================
// SECTION 4: CKB Tokenomics
// ============================================================================

/**
 * Display a comprehensive overview of CKB tokenomics:
 *   1. Primary issuance (capped, halving)
 *   2. Secondary issuance (perpetual, state rent)
 *   3. Nervos DAO (inflation shelter)
 */
function showTokenomicsOverview(): void {
  console.log("\n\n");
  console.log("#".repeat(60));
  console.log("  CKB TOKENOMICS OVERVIEW");
  console.log("#".repeat(60));

  // ── Primary Issuance ──────────────────────────────────────────
  console.log("\n");
  console.log("=".repeat(60));
  console.log("  1. PRIMARY ISSUANCE (Miners' Base Reward)");
  console.log("=".repeat(60));
  console.log(`
  Primary issuance is the base reward given to miners for producing
  blocks. It follows a Bitcoin-like halving schedule:

    Hard Cap:           33,600,000,000 CKBytes (33.6 billion)
    Initial Reward:     ~4,608,000,000 CKBytes per year (first epoch period)
    Halving Interval:   Every 8,760 epochs (~4 years)
    Epoch Duration:     ~4 hours (1,800 blocks per epoch target)

  Halving Schedule:
  ──────────────────────────────────────────────────────────────
  Period    Years         Annual Issuance        Cumulative
  ──────────────────────────────────────────────────────────────
    1      0 - 4         ~4,608,000,000 CKB     ~18,432,000,000
    2      4 - 8         ~2,304,000,000 CKB     ~27,648,000,000
    3      8 - 12        ~1,152,000,000 CKB     ~32,256,000,000
    4      12 - 16       ~576,000,000 CKB       ~34,560,000,000*
    ...    ...           (approaches cap)       ~33,600,000,000
  ──────────────────────────────────────────────────────────────
  * Slightly exceeds cap because table shows rounded approximations.
    Actual issuance stops precisely at 33.6B.

  The primary issuance rewards miners for securing the network.
  As it halves, miners increasingly rely on transaction fees and
  secondary issuance to sustain operations.`);

  // ── Secondary Issuance ────────────────────────────────────────
  console.log("\n");
  console.log("=".repeat(60));
  console.log("  2. SECONDARY ISSUANCE (State Rent Proxy)");
  console.log("=".repeat(60));
  console.log(`
  Secondary issuance is a FIXED amount of new CKBytes created every
  year. Unlike primary issuance, it NEVER halves and NEVER stops.

    Annual Amount:  1,344,000,000 CKBytes (1.344 billion per year)
    Duration:       Perpetual (no end date, no cap)

  The secondary issuance is distributed based on how CKBytes are used:

    1. CKBytes OCCUPYING state (locked in cells storing data):
       -> Their share of secondary issuance goes to MINERS
       -> This acts as implicit "state rent" paid to miners
       -> You pay for on-chain storage over time through inflation

    2. CKBytes DEPOSITED in Nervos DAO:
       -> Their share of secondary issuance goes to the DAO depositors
       -> This exactly compensates for the inflation, making DAO
          depositors immune to secondary issuance dilution

    3. CKBytes that are LIQUID (not in cells, not in DAO):
       -> Their share of secondary issuance goes to the TREASURY
       -> (Currently the treasury fund is burned until governance
          decides otherwise)

  ECONOMIC INSIGHT:
  ──────────────────────────────────────────────────────────────
  If you store data on-chain, you are effectively paying state rent
  through dilution from secondary issuance. If you deposit in the
  Nervos DAO, you are shielded from this dilution. This creates a
  market-based mechanism for pricing on-chain storage.
  ──────────────────────────────────────────────────────────────`);

  // ── Nervos DAO ────────────────────────────────────────────────
  console.log("\n");
  console.log("=".repeat(60));
  console.log("  3. NERVOS DAO (Inflation Shelter)");
  console.log("=".repeat(60));
  console.log(`
  The Nervos DAO is a special system contract deployed on CKB at
  genesis. It allows CKByte holders to deposit their tokens and
  receive compensation from secondary issuance.

  How it works:
    1. DEPOSIT: Lock your CKBytes in the Nervos DAO
    2. WAIT:    A minimum lock period of ~180 epochs (~30 days)
    3. WITHDRAW: Get back your CKBytes + earned compensation

  Compensation calculation (simplified):
  ──────────────────────────────────────────────────────────────
  The DAO tracks a cumulative "AR" (Accumulated Rate) value that
  increases with each epoch based on secondary issuance.

    Compensation = deposited_amount * (AR_withdraw / AR_deposit - 1)

  Where:
    AR_deposit  = Accumulated Rate at the epoch you deposited
    AR_withdraw = Accumulated Rate at the epoch you withdraw

  The AR grows proportionally to secondary issuance, so your
  compensation exactly offsets the inflation from new CKBytes.
  ──────────────────────────────────────────────────────────────

  Example:
    Deposit:  100,000 CKBytes
    AR at deposit:  1.0200
    AR at withdraw: 1.0350  (after ~6 months)

    Compensation = 100,000 * (1.0350 / 1.0200 - 1)
                 = 100,000 * 0.01471
                 = ~1,471 CKBytes earned

  This mechanism ensures that long-term CKByte holders who are NOT
  using their tokens for storage can avoid dilution entirely.`);
}

// ============================================================================
// SECTION 5: Ethereum Gas vs CKB Capacity Comparison
// ============================================================================

/**
 * Compare the economic models of Ethereum (gas) and CKB (capacity/state rent).
 */
function showEconomicComparison(): void {
  console.log("\n\n");
  console.log("#".repeat(60));
  console.log("  ECONOMIC MODEL: CKB vs ETHEREUM");
  console.log("#".repeat(60));
  console.log(`
  Feature           Ethereum Gas Model           CKB Capacity Model
  ───────────────── ──────────────────────────── ──────────────────────────────
  Payment           One-time gas fee per tx      Lock CKBytes proportional to
                                                 storage used on-chain

  Storage cost      Pay gas once to store data   Lock CKBytes for the duration
                    Data persists forever for    data is on-chain; recover them
                    free after initial write     when data is removed

  State bloat       Major problem: state grows   Incentivized cleanup: removing
                    indefinitely, no incentive   data unlocks your CKBytes
                    to clean up old data

  Ongoing cost      None after initial gas       Implicit state rent via
                                                 secondary issuance dilution

  Token utility     ETH = gas fees + staking     CKByte = storage right +
                                                 native token + DAO yield

  Inflation         ETH is deflationary after    Primary issuance halves;
  model             EIP-1559 (base fee burned)   secondary issuance is perpetual
                                                 but offset by DAO

  Who pays for      All ETH holders (through     Only those occupying state
  state growth?     increased node requirements)  (through secondary issuance)

  KEY INSIGHT:
  ──────────────────────────────────────────────────────────────
  CKB's model makes on-chain storage a SCARCE RESOURCE with an
  ongoing cost. This prevents state bloat (a major problem for
  Ethereum) because users have economic incentive to free up
  storage when they no longer need it.

  On Ethereum, once you store data on-chain, it costs nothing to
  keep it there forever, even if nobody ever reads it again. The
  cost of maintaining that state falls on all node operators.

  On CKB, storing data means locking CKBytes. Those locked CKBytes
  experience dilution from secondary issuance (state rent). If you
  free the storage, you get your CKBytes back. This creates a
  natural market for on-chain storage.
  ──────────────────────────────────────────────────────────────`);
}

// ============================================================================
// SECTION 6: Nervos DAO Compensation Calculator
// ============================================================================

/**
 * Calculate the approximate Nervos DAO compensation for a given deposit.
 *
 * This is a simplified model. The actual DAO uses the on-chain AR (Accumulated
 * Rate) value which is updated each epoch. We simulate it here for educational
 * purposes.
 *
 * @param depositCKB - Amount of CKBytes to deposit
 * @param durationDays - How long to keep the deposit (in days)
 * @param totalCirculatingCKB - Total circulating supply (for calculating rate)
 * @param totalOccupiedCKB - CKBytes currently occupying state (in cells)
 * @param totalDAODepositCKB - CKBytes currently in the DAO
 * @returns Estimated compensation in CKBytes
 */
function calculateDAOCompensation(
  depositCKB: bigint,
  durationDays: number,
  totalCirculatingCKB: bigint = 44_000_000_000n, // approximate current supply
  totalOccupiedCKB: bigint = 10_000_000_000n, // approximate state occupation
  totalDAODepositCKB: bigint = 6_000_000_000n // approximate DAO deposits
): {
  depositCKB: bigint;
  durationDays: number;
  annualSecondaryIssuance: bigint;
  daoSharePercent: number;
  estimatedAnnualYield: number;
  estimatedCompensationCKB: number;
} {
  /**
   * Secondary issuance distribution:
   * The DAO depositors receive a share proportional to:
   *   (totalDAODepositCKB / totalCirculatingCKB) * annualSecondaryIssuance
   *
   * Your personal share is then:
   *   (yourDeposit / totalDAODepositCKB) * daoShare
   */
  const annualSecondaryIssuance = SECONDARY_ISSUANCE.annualCKB;

  // DAO's share of secondary issuance (proportion of supply in DAO)
  const daoShareRatio =
    Number(totalDAODepositCKB) / Number(totalCirculatingCKB);
  const daoAnnualCKB = Number(annualSecondaryIssuance) * daoShareRatio;

  // Your personal yield
  const yourShareRatio = Number(depositCKB) / Number(totalDAODepositCKB);
  const yourAnnualCKB = daoAnnualCKB * yourShareRatio;

  // Prorate for the actual duration
  const yourCompensation = yourAnnualCKB * (durationDays / 365);

  // APY
  const estimatedAnnualYield = (yourAnnualCKB / Number(depositCKB)) * 100;

  return {
    depositCKB,
    durationDays,
    annualSecondaryIssuance,
    daoSharePercent: daoShareRatio * 100,
    estimatedAnnualYield,
    estimatedCompensationCKB: Math.round(yourCompensation),
  };
}

/**
 * Display Nervos DAO compensation examples.
 */
function showDAOExamples(): void {
  console.log("\n\n");
  console.log("#".repeat(60));
  console.log("  NERVOS DAO COMPENSATION CALCULATOR");
  console.log("#".repeat(60));

  const scenarios = [
    { deposit: 100_000n, days: 30, label: "100,000 CKB for 30 days" },
    { deposit: 100_000n, days: 180, label: "100,000 CKB for 180 days" },
    { deposit: 100_000n, days: 365, label: "100,000 CKB for 1 year" },
    { deposit: 1_000_000n, days: 365, label: "1,000,000 CKB for 1 year" },
    { deposit: 10_000_000n, days: 365, label: "10,000,000 CKB for 1 year" },
  ];

  console.log(`
  NOTE: These calculations use approximate current network values:
    Total circulating supply:  ~44,000,000,000 CKBytes
    CKBytes occupying state:   ~10,000,000,000 CKBytes
    CKBytes in Nervos DAO:     ~6,000,000,000 CKBytes
    Annual secondary issuance: 1,344,000,000 CKBytes
  `);

  for (const scenario of scenarios) {
    const result = calculateDAOCompensation(scenario.deposit, scenario.days);
    console.log(`  ${"─".repeat(56)}`);
    console.log(`  Scenario: ${scenario.label}`);
    console.log(
      `    DAO share of secondary issuance: ${result.daoSharePercent.toFixed(2)}%`
    );
    console.log(
      `    Estimated annual yield:          ~${result.estimatedAnnualYield.toFixed(2)}%`
    );
    console.log(
      `    Estimated compensation:          ~${result.estimatedCompensationCKB.toLocaleString()} CKBytes`
    );
  }

  console.log(`\n  ${"─".repeat(56)}`);
  console.log(`
  IMPORTANT CAVEATS:
    - Actual yields depend on real-time network state
    - The AR (Accumulated Rate) changes every epoch
    - Minimum lock period is ~180 epochs (~30 days)
    - Withdrawal requires a 2-step process (begin withdrawal, then finalize)
    - These are estimates for educational purposes only
  `);
}

// ============================================================================
// SECTION 7: Custom Capacity Calculator
// ============================================================================

/**
 * Show a table of capacity requirements for various data sizes.
 */
function showCapacityTable(): void {
  console.log("\n\n");
  console.log("#".repeat(60));
  console.log("  CAPACITY REQUIREMENTS TABLE");
  console.log("#".repeat(60));

  const sizes = [
    { bytes: 0, label: "Empty cell (minimal)" },
    { bytes: 4, label: "u32 value" },
    { bytes: 8, label: "u64 value" },
    { bytes: 16, label: "u128 value (token amount)" },
    { bytes: 20, label: "Blake160 hash (20 bytes)" },
    { bytes: 32, label: "Blake2b / SHA-256 hash" },
    { bytes: 64, label: "Ed25519 signature" },
    { bytes: 128, label: "Small config (128 bytes)" },
    { bytes: 256, label: "Small document (256 bytes)" },
    { bytes: 512, label: "Medium data (512 bytes)" },
    { bytes: 1024, label: "1 KB of data" },
    { bytes: 4096, label: "4 KB of data" },
    { bytes: 10240, label: "10 KB of data" },
  ];

  console.log(
    "\n  Without type script (data storage only):"
  );
  console.log(
    `  ${"Data Size".padEnd(35)} ${"Total Bytes".padEnd(14)} CKBytes Required`
  );
  console.log(`  ${"─".repeat(65)}`);

  for (const size of sizes) {
    const breakdown = calculateCapacity(size.bytes, false);
    console.log(
      `  ${size.label.padEnd(35)} ${String(breakdown.totalBytes).padEnd(14)} ${breakdown.totalCKBytes.toLocaleString()} CKBytes`
    );
  }

  console.log(
    "\n  With type script (smart contract cell):"
  );
  console.log(
    `  ${"Data Size".padEnd(35)} ${"Total Bytes".padEnd(14)} CKBytes Required`
  );
  console.log(`  ${"─".repeat(65)}`);

  for (const size of sizes) {
    const breakdown = calculateCapacity(size.bytes, true);
    console.log(
      `  ${size.label.padEnd(35)} ${String(breakdown.totalBytes).padEnd(14)} ${breakdown.totalCKBytes.toLocaleString()} CKBytes`
    );
  }
}

// ============================================================================
// SECTION 8: Main Execution
// ============================================================================

/**
 * Main function that runs all examples and displays the full lesson content.
 */
function main(): void {
  console.log("\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log(
    "║" +
      "  Lesson 03: CKB Capacity Calculator & Tokenomics".padEnd(58) +
      "║"
  );
  console.log(
    "║" +
      "  Understanding CKByte economics and storage costs".padEnd(58) +
      "║"
  );
  console.log("╚" + "═".repeat(58) + "╝");

  console.log(`
  Welcome! In this lesson, you will learn:
    1. How CKBytes serve as both currency AND storage units
    2. The capacity formula for calculating cell costs
    3. Primary issuance (hard cap, halving schedule)
    4. Secondary issuance (perpetual state rent)
    5. The Nervos DAO as an inflation shelter
    6. How CKB's economic model compares to Ethereum's gas model
  `);

  // ── Capacity Calculation Examples ─────────────────────────────
  console.log("\n");
  console.log("█".repeat(60));
  console.log("  PART 1: CAPACITY CALCULATION EXAMPLES");
  console.log("█".repeat(60));

  example1_MinimalCell();
  example2_HashStorage();
  example3_TokenCell();
  example4_OneKBData();
  example5_NervosDAOCell();

  // ── Capacity Table ────────────────────────────────────────────
  showCapacityTable();

  // ── Tokenomics Overview ───────────────────────────────────────
  console.log("\n\n");
  console.log("█".repeat(60));
  console.log("  PART 2: CKB TOKENOMICS");
  console.log("█".repeat(60));

  showTokenomicsOverview();

  // ── Economic Comparison ───────────────────────────────────────
  showEconomicComparison();

  // ── Nervos DAO Calculator ─────────────────────────────────────
  console.log("\n\n");
  console.log("█".repeat(60));
  console.log("  PART 3: NERVOS DAO COMPENSATION");
  console.log("█".repeat(60));

  showDAOExamples();

  // ── Summary ───────────────────────────────────────────────────
  console.log("\n\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log(
    "║" + "  SUMMARY".padEnd(58) + "║"
  );
  console.log("╚" + "═".repeat(58) + "╝");
  console.log(`
  Key takeaways from this lesson:

  1. DUAL PURPOSE: CKByte = native token + storage right (1 CKB = 1 byte)

  2. MINIMUM CELL: 61 CKBytes (8 capacity + 53 lock script)

  3. CAPACITY FORMULA:
     Total = capacity_field(8) + lock_script + [type_script] + data

  4. PRIMARY ISSUANCE: 33.6B hard cap with Bitcoin-like halving (~4 yr)

  5. SECONDARY ISSUANCE: 1.344B CKBytes/year, distributed as:
     - State occupiers' share -> miners (state rent)
     - DAO depositors' share -> DAO depositors (inflation shelter)
     - Liquid share -> treasury (currently burned)

  6. NERVOS DAO: Deposit CKBytes to earn secondary issuance compensation,
     effectively making you immune to inflation.

  7. VS ETHEREUM: CKB makes storage an ongoing cost (rent via inflation),
     while Ethereum charges a one-time gas fee with no state cleanup
     incentive.

  Next lesson: Dev Environment Setup - set up your local CKB development
  environment with devnet, CCC SDK, and essential tooling.
  `);
}

// Run the program
main();
