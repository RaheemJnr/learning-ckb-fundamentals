/**
 * ============================================================================
 * Lesson 9: CKB Error Code Reference Guide
 * ============================================================================
 *
 * A comprehensive reference of error codes you may encounter when developing
 * and debugging CKB scripts. This guide covers:
 *
 *   1. CKB-VM syscall error codes (negative, returned by the VM itself)
 *   2. CKB transaction verification error codes (from the node)
 *   3. Well-known script error codes (from ecosystem scripts)
 *   4. Custom script error code best practices
 *
 * Run with:
 *   npx tsx src/error-guide.ts
 *
 * ============================================================================
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface ErrorEntry {
  code: number;
  name: string;
  description: string;
  commonCauses: string[];
  howToFix: string[];
}

interface ScriptErrorEntry {
  code: number;
  script: string;
  name: string;
  description: string;
  commonCauses: string[];
  howToFix: string[];
}

// ============================================================================
// CKB-VM Syscall Error Codes (Negative Numbers)
// ============================================================================

/**
 * These error codes are returned by the CKB-VM when a syscall fails.
 * They appear as the script exit code in transaction verification errors.
 * These are NOT defined by your script — they come from the VM itself.
 */
const VM_SYSCALL_ERRORS: ErrorEntry[] = [
  {
    code: -1,
    name: "INDEX_OUT_OF_BOUND",
    description:
      "A syscall attempted to access an index that does not exist in the " +
      "transaction. This is the most common VM error and usually indicates " +
      "that your script is trying to load data at a position beyond what " +
      "the transaction provides.",
    commonCauses: [
      "Loading witness at index N when the transaction has fewer than N+1 witnesses",
      "Loading input or output at an index beyond the transaction's count",
      "Loading cell_dep at an index that does not exist",
      "Loop counter goes one past the last valid index (off-by-one)",
      "Using Source::Input when you should use Source::GroupInput (or vice versa)",
    ],
    howToFix: [
      "Check that the witness/input/output index matches what the transaction actually has",
      "Use load_witness(0, Source::GroupInput) for the current script group's witness",
      "Add bounds checking before accessing indexed items",
      "Print the index value with ckb_debug! to see what index is being used",
    ],
  },
  {
    code: -2,
    name: "ITEM_MISSING",
    description:
      "The item at the given index exists, but the specific field requested " +
      "is not present. This typically happens when trying to access an " +
      "optional field (like type script) that was not set.",
    commonCauses: [
      "Loading the type script of a cell that has no type script (type is optional)",
      "Loading the lock field from WitnessArgs when it was set to None",
      "Requesting a field from a molecule structure that allows optional values",
    ],
    howToFix: [
      "Check if the field exists before trying to load it",
      "Use the high-level API which returns Option types for optional fields",
      "Ensure your transaction includes the expected type scripts on cells that need them",
    ],
  },
  {
    code: -3,
    name: "SLICE_OUT_OF_BOUND",
    description:
      "A partial load syscall (with offset and length) tried to read " +
      "beyond the end of the available data.",
    commonCauses: [
      "Specifying offset + length > total data size in a partial load syscall",
      "Reading a fixed number of bytes from data that is shorter than expected",
      "Incorrect size calculation when reading sub-slices of cell data or witness",
    ],
    howToFix: [
      "First load the full data to check its length, then read the slice",
      "Use the high-level load functions which handle sizes automatically",
      "Add a length check before performing partial loads",
    ],
  },
  {
    code: -4,
    name: "WRONG_FORMAT",
    description:
      "Data could not be parsed in the expected molecule format. Molecule " +
      "is CKB's serialization format, and this error means the raw bytes " +
      "do not match the expected schema.",
    commonCauses: [
      "Witness data is not valid WitnessArgs molecule encoding",
      "Trying to parse Script or CellOutput from corrupted or differently-formatted data",
      "Using the wrong molecule schema version for deserialization",
      "Raw bytes were hand-constructed incorrectly",
    ],
    howToFix: [
      "Verify that witness data is properly molecule-encoded WitnessArgs",
      "Use the CCC SDK or molecule codegen to ensure correct encoding",
      "Print the raw hex of the data to inspect its structure",
      "Compare the data length with the expected molecule header values",
    ],
  },
  {
    code: -5,
    name: "UNKNOWN_SYSCALL",
    description:
      "The script invoked a syscall number that CKB-VM does not recognize. " +
      "This usually means the script binary was compiled for a different " +
      "version of CKB.",
    commonCauses: [
      "Script compiled with a newer version of ckb-std that uses syscalls not available on the target chain",
      "Corrupted script binary",
      "Wrong compilation target (not riscv64imac-unknown-none-elf)",
    ],
    howToFix: [
      "Ensure ckb-std version matches the target CKB node version",
      "Recompile the script with the correct target triple",
      "Verify the binary was not corrupted during deployment",
    ],
  },
  {
    code: -6,
    name: "UNALIGNED_SYSCALL",
    description:
      "A syscall was called with unaligned memory addresses. The CKB-VM " +
      "requires certain memory accesses to be aligned to word boundaries.",
    commonCauses: [
      "Low-level memory manipulation with incorrect alignment",
      "Custom allocator that does not maintain proper alignment",
      "Casting between pointer types with different alignment requirements",
    ],
    howToFix: [
      "Use the default_alloc!() macro from ckb-std for memory allocation",
      "Avoid unsafe pointer casts that change alignment",
      "Use ckb-std high-level APIs instead of raw syscalls",
    ],
  },
  {
    code: -7,
    name: "MAX_VMS_SPAWNED",
    description:
      "The maximum number of spawned VMs has been reached. CKB 2023 (Meepo) " +
      "introduced the spawn syscall which allows scripts to start child VMs, " +
      "but there is a limit to prevent resource exhaustion.",
    commonCauses: [
      "Recursive spawning without proper termination conditions",
      "Spawning too many child scripts in a single transaction",
    ],
    howToFix: [
      "Reduce the number of spawn calls",
      "Restructure script logic to avoid deep spawn chains",
      "Check spawn count before each spawn call",
    ],
  },
  {
    code: -8,
    name: "MAX_FDS_CREATED",
    description:
      "The maximum number of file descriptors for pipe communication " +
      "between spawned VMs has been reached.",
    commonCauses: [
      "Creating too many pipes for inter-VM communication",
      "Not closing file descriptors after use",
    ],
    howToFix: [
      "Close pipe file descriptors when they are no longer needed",
      "Minimize the number of concurrent pipes",
    ],
  },
];

// ============================================================================
// CKB Node Transaction Verification Errors
// ============================================================================

/**
 * These error codes are returned by the CKB node's RPC when a transaction
 * fails various validation stages. They appear in the RPC error response.
 */
const NODE_VERIFICATION_ERRORS: ErrorEntry[] = [
  {
    code: -301,
    name: "TransactionFailedToResolve",
    description:
      "The CKB node could not resolve all the cells referenced by the " +
      "transaction. This means an input or cell_dep points to a cell " +
      "that does not exist or has already been consumed.",
    commonCauses: [
      "An input cell has already been spent (consumed by another transaction)",
      "A cell_dep references an OutPoint that does not exist on-chain",
      "The transaction references a cell that was created in a block that was orphaned",
      "Using stale cell data — the cell was consumed between the time you queried it and submitted the tx",
    ],
    howToFix: [
      "Re-query the cells to get fresh, live cells for your transaction inputs",
      "Verify all cell_dep OutPoints exist on-chain before submitting",
      "Implement retry logic that rebuilds the transaction with fresh cells",
      "Check the indexer for the most up-to-date cell status",
    ],
  },
  {
    code: -302,
    name: "TransactionFailedToVerify",
    description:
      "One of the scripts in the transaction returned a non-zero exit code. " +
      "The error message will include which script failed and its exit code. " +
      "This is the most common error during script development.",
    commonCauses: [
      "Lock script rejected the transaction (invalid signature, wrong preimage, etc.)",
      "Type script validation failed (invalid state transition, unauthorized operation)",
      "Script binary was not found in cell_deps",
      "Script args do not match expected format",
    ],
    howToFix: [
      "Parse the error message to find which script failed (Inputs[N].Lock or Inputs[N].Type)",
      "Check the exit code against your script's error code definitions",
      "Use CKB-Debugger to reproduce and debug the failure locally",
      "Verify the witness data is correctly formatted for the failing script",
    ],
  },
  {
    code: -303,
    name: "PoolRejectedDuplicatedTransaction",
    description: "A transaction with the same hash is already in the transaction pool.",
    commonCauses: [
      "Submitting the same transaction twice",
      "Client-side retry logic without checking if the first submission succeeded",
    ],
    howToFix: [
      "Check if the transaction is already in the pool before resubmitting",
      "Use the transaction hash to query its status before retrying",
    ],
  },
  {
    code: -304,
    name: "PoolIsFull",
    description: "The transaction pool has reached its capacity limit.",
    commonCauses: [
      "Network congestion — too many pending transactions",
      "Transaction fee is too low to compete for pool space",
    ],
    howToFix: [
      "Increase the transaction fee to prioritize your transaction",
      "Wait and retry when the pool has more space",
      "Try submitting to a different CKB node",
    ],
  },
  {
    code: -311,
    name: "PoolRejectedMalformedTransaction",
    description:
      "The transaction structure is invalid. It fails basic format checks " +
      "before any script verification occurs.",
    commonCauses: [
      "Output capacity is less than the minimum required by the cell's data and scripts",
      "Total output capacity exceeds total input capacity (not enough to cover fees)",
      "Since (a relative time lock field) value is invalid",
      "Cell_dep references are duplicated",
      "The transaction exceeds the maximum size limit",
    ],
    howToFix: [
      "Ensure every output cell has enough capacity for its data + scripts (use CCC's calculateFee)",
      "Verify total inputs >= total outputs + fee",
      "Check for duplicate cell_dep entries",
      "Validate the transaction structure before submitting",
    ],
  },
  {
    code: -312,
    name: "PoolRejectedDuplicatedOutputs",
    description: "The transaction creates output cells that conflict with existing live cells.",
    commonCauses: [
      "Using a type script that enforces uniqueness, and the output conflicts with an existing cell",
    ],
    howToFix: [
      "Ensure your transaction's outputs do not duplicate existing unique cells",
    ],
  },
];

// ============================================================================
// Well-Known Script Error Codes
// ============================================================================

/**
 * Error codes from well-known scripts in the CKB ecosystem.
 * These are the most commonly encountered script-level errors.
 */
const WELL_KNOWN_SCRIPT_ERRORS: ScriptErrorEntry[] = [
  // --- secp256k1-blake160 (default lock) ---
  {
    code: 1,
    script: "secp256k1-blake160 (default lock)",
    name: "ERROR_ARGUMENTS_LEN",
    description: "The script args are not exactly 20 bytes. The default lock expects a 20-byte blake160 hash of the public key.",
    commonCauses: [
      "Script args contain the full 32-byte blake2b hash instead of the 20-byte blake160 truncation",
      "Empty args or args of wrong length",
    ],
    howToFix: [
      "Use blake160 (first 20 bytes of blake2b hash) of the public key as the args",
      "Verify the address encoding matches the expected args length",
    ],
  },
  {
    code: 2,
    script: "secp256k1-blake160 (default lock)",
    name: "ERROR_ENCODING",
    description: "The witness at the matching index could not be decoded as a WitnessArgs molecule structure.",
    commonCauses: [
      "Raw witness bytes are not valid molecule encoding",
      "Witness was constructed manually without proper molecule serialization",
      "Witness contains data in a different format than WitnessArgs",
    ],
    howToFix: [
      "Use the CCC SDK or molecule codegen to construct proper WitnessArgs",
      "Ensure the witness is molecule-encoded, not raw bytes",
      "Check the witness hex against the expected WitnessArgs format",
    ],
  },
  {
    code: 3,
    script: "secp256k1-blake160 (default lock)",
    name: "ERROR_WITNESS_SIZE",
    description: "The lock field in WitnessArgs is not exactly 65 bytes (the size of a secp256k1 recoverable signature).",
    commonCauses: [
      "Signature was not serialized correctly (wrong format)",
      "Lock field contains extra or insufficient bytes",
      "Using a different signature scheme's output size",
    ],
    howToFix: [
      "Ensure the signature is exactly 65 bytes: 64 bytes signature + 1 byte recovery id",
      "Use the CCC SDK's signing functions which handle serialization",
    ],
  },
  {
    code: 4,
    script: "secp256k1-blake160 (default lock)",
    name: "ERROR_PUBKEY_BLAKE160_HASH",
    description: "The public key recovered from the signature does not match the blake160 hash in the script args.",
    commonCauses: [
      "Signing with the wrong private key",
      "The message being signed does not match what the script computes",
      "Incorrect witness layout — the script hashes a different message than expected",
    ],
    howToFix: [
      "Verify you are signing with the private key that corresponds to the address",
      "Ensure the transaction hash (message) is computed correctly",
      "Check that the WitnessArgs lock field is zeroed before computing the signing message",
    ],
  },
  {
    code: 5,
    script: "secp256k1-blake160 (default lock)",
    name: "ERROR_VERIFICATION",
    description: "The secp256k1 signature verification itself failed. The signature is not valid for any public key on the given message.",
    commonCauses: [
      "Corrupted signature bytes",
      "Signing a different message than the transaction hash",
      "Using a different elliptic curve or signature algorithm",
    ],
    howToFix: [
      "Regenerate the signature using the correct private key and message",
      "Use CCC SDK functions which handle the signing protocol correctly",
      "Verify the signature independently before submitting the transaction",
    ],
  },

  // --- Nervos DAO ---
  {
    code: -14,
    script: "Nervos DAO (type script)",
    name: "ERROR_INCORRECT_CAPACITY",
    description: "The deposit or withdrawal amount does not match the expected compensation calculation.",
    commonCauses: [
      "Incorrect interest calculation for withdrawal",
      "Output capacity does not account for the DAO compensation",
    ],
    howToFix: [
      "Use the CCC SDK's DAO helper functions to calculate the correct withdrawal amount",
      "Verify the deposit block header and withdrawal block header are included in header_deps",
    ],
  },

  // --- xUDT (extensible User Defined Token) ---
  {
    code: 1,
    script: "xUDT (type script)",
    name: "ERROR_AMOUNT",
    description: "The total input UDT amount does not match the total output UDT amount. Tokens would be created or destroyed illegally.",
    commonCauses: [
      "Token amounts in cell data do not balance between inputs and outputs",
      "Incorrect little-endian encoding of the u128 amount in cell data",
      "Missing a change cell for remaining tokens",
    ],
    howToFix: [
      "Ensure sum of input token amounts equals sum of output token amounts (unless owner mode)",
      "Verify the first 16 bytes of cell data are the correct little-endian u128 amount",
      "Include a change cell to receive leftover tokens",
    ],
  },
];

// ============================================================================
// Display Functions
// ============================================================================

function printHeader(title: string): void {
  const line = "=".repeat(65);
  console.log(`\n  ${line}`);
  console.log(`  ${title}`);
  console.log(`  ${line}\n`);
}

function printSubHeader(title: string): void {
  const line = "-".repeat(55);
  console.log(`\n  ${line}`);
  console.log(`  ${title}`);
  console.log(`  ${line}\n`);
}

function printErrorEntry(entry: ErrorEntry): void {
  console.log(`  [Exit Code ${entry.code}] ${entry.name}`);
  console.log(`  ${"~".repeat(40)}`);
  console.log(`  ${entry.description}`);
  console.log("");
  console.log("  Common causes:");
  for (const cause of entry.commonCauses) {
    console.log(`    - ${cause}`);
  }
  console.log("");
  console.log("  How to fix:");
  for (const fix of entry.howToFix) {
    console.log(`    - ${fix}`);
  }
  console.log("");
}

function printScriptErrorEntry(entry: ScriptErrorEntry): void {
  console.log(`  [Exit Code ${entry.code}] ${entry.name}  (${entry.script})`);
  console.log(`  ${"~".repeat(50)}`);
  console.log(`  ${entry.description}`);
  console.log("");
  console.log("  Common causes:");
  for (const cause of entry.commonCauses) {
    console.log(`    - ${cause}`);
  }
  console.log("");
  console.log("  How to fix:");
  for (const fix of entry.howToFix) {
    console.log(`    - ${fix}`);
  }
  console.log("");
}

// ============================================================================
// Main: Print the Complete Error Guide
// ============================================================================

function main(): void {
  console.log("\n");
  console.log("  =============================================================");
  console.log("  CKB Error Code Reference Guide");
  console.log("  =============================================================");
  console.log("\n  A comprehensive reference for debugging CKB script errors.\n");

  // -----------------------------------------------------------------------
  // Section 1: VM Syscall Errors
  // -----------------------------------------------------------------------

  printHeader("Section 1: CKB-VM Syscall Error Codes");
  console.log("  These error codes are returned by the CKB virtual machine when");
  console.log("  a syscall fails. They are always NEGATIVE numbers and indicate");
  console.log("  problems at the infrastructure level, not in your script logic.\n");

  for (const entry of VM_SYSCALL_ERRORS) {
    printErrorEntry(entry);
  }

  // -----------------------------------------------------------------------
  // Section 2: Node Verification Errors
  // -----------------------------------------------------------------------

  printHeader("Section 2: CKB Node Transaction Verification Errors");
  console.log("  These error codes appear in the CKB RPC error response when a");
  console.log("  transaction fails validation. They indicate which stage of");
  console.log("  verification the transaction failed at.\n");

  for (const entry of NODE_VERIFICATION_ERRORS) {
    printErrorEntry(entry);
  }

  // -----------------------------------------------------------------------
  // Section 3: Well-Known Script Errors
  // -----------------------------------------------------------------------

  printHeader("Section 3: Well-Known Script Error Codes");
  console.log("  These are error codes defined by commonly-used CKB scripts.");
  console.log("  Your own scripts can define any error codes you like, but");
  console.log("  understanding these helps when working with standard scripts.\n");

  printSubHeader("secp256k1-blake160 (Default Lock Script)");
  for (const entry of WELL_KNOWN_SCRIPT_ERRORS.filter(e => e.script.includes("secp256k1"))) {
    printScriptErrorEntry(entry);
  }

  printSubHeader("Nervos DAO (Built-in Type Script)");
  for (const entry of WELL_KNOWN_SCRIPT_ERRORS.filter(e => e.script.includes("DAO"))) {
    printScriptErrorEntry(entry);
  }

  printSubHeader("xUDT (Extensible User Defined Token)");
  for (const entry of WELL_KNOWN_SCRIPT_ERRORS.filter(e => e.script.includes("xUDT"))) {
    printScriptErrorEntry(entry);
  }

  // -----------------------------------------------------------------------
  // Section 4: Best Practices for Custom Error Codes
  // -----------------------------------------------------------------------

  printHeader("Section 4: Best Practices for Custom Error Codes");

  console.log("  When writing your own CKB scripts, follow these conventions:\n");
  console.log("  1. ALWAYS use non-zero exit codes for errors");
  console.log("     - Return 0 ONLY for success");
  console.log("     - Never return 0 on an error path (this is Bug #4 in buggy-lock)\n");
  console.log("  2. USE DISTINCT codes for each failure mode");
  console.log("     - Do not reuse the same error code for different errors");
  console.log("     - This makes debugging much faster\n");
  console.log("  3. DOCUMENT your error codes");
  console.log("     - Define named constants (e.g., const ERROR_ARGS_TOO_SHORT: i8 = 1)");
  console.log("     - Add comments explaining what each code means");
  console.log("     - Publish the error code table in your script's documentation\n");
  console.log("  4. USE SMALL positive numbers (1-127)");
  console.log("     - CKB script exit codes are i8 (signed 8-bit integer)");
  console.log("     - Valid range is -128 to 127");
  console.log("     - Negative values are reserved for VM errors");
  console.log("     - Stick to 1-127 for your own error codes\n");
  console.log("  5. GROUP related errors");
  console.log("     - 1-9: Input validation errors (bad args, bad witness format)");
  console.log("     - 10-19: Authentication errors (wrong key, bad signature)");
  console.log("     - 20-29: State transition errors (invalid data change)");
  console.log("     - 30+: Application-specific errors\n");

  console.log("  Example error code definitions in Rust:\n");
  console.log("    // Input validation");
  console.log("    const ERROR_ARGS_LEN: i8 = 1;");
  console.log("    const ERROR_WITNESS_MISSING: i8 = 2;");
  console.log("    const ERROR_WITNESS_FORMAT: i8 = 3;");
  console.log("    ");
  console.log("    // Authentication");
  console.log("    const ERROR_PUBKEY_HASH: i8 = 10;");
  console.log("    const ERROR_SIGNATURE_INVALID: i8 = 11;");
  console.log("    ");
  console.log("    // State transitions");
  console.log("    const ERROR_AMOUNT_OVERFLOW: i8 = 20;");
  console.log("    const ERROR_AMOUNT_MISMATCH: i8 = 21;\n");

  // -----------------------------------------------------------------------
  // Quick Reference Table
  // -----------------------------------------------------------------------

  printHeader("Quick Reference: Error Code Lookup Table");

  console.log("  VM Errors (Infrastructure):");
  console.log("  +---------+----------------------+-----------------------------------------+");
  console.log("  |  Code   |  Name                |  Most Likely Cause                      |");
  console.log("  +---------+----------------------+-----------------------------------------+");
  console.log("  |   -1    |  INDEX_OUT_OF_BOUND  |  Wrong witness/input/output index       |");
  console.log("  |   -2    |  ITEM_MISSING        |  Accessing optional field that is None  |");
  console.log("  |   -3    |  SLICE_OUT_OF_BOUND  |  Reading past end of data               |");
  console.log("  |   -4    |  WRONG_FORMAT        |  Bad molecule encoding in witness       |");
  console.log("  |   -5    |  UNKNOWN_SYSCALL     |  Script built for wrong CKB version     |");
  console.log("  |   -6    |  UNALIGNED_SYSCALL   |  Memory alignment issue                 |");
  console.log("  |   -7    |  MAX_VMS_SPAWNED     |  Too many child VMs spawned             |");
  console.log("  |   -8    |  MAX_FDS_CREATED     |  Too many pipe file descriptors         |");
  console.log("  +---------+----------------------+-----------------------------------------+");
  console.log("");

  console.log("  Node Errors (Transaction Level):");
  console.log("  +---------+-----------------------------------+----------------------------+");
  console.log("  |  Code   |  Name                             |  Most Likely Cause         |");
  console.log("  +---------+-----------------------------------+----------------------------+");
  console.log("  |  -301   |  TransactionFailedToResolve       |  Input cell already spent  |");
  console.log("  |  -302   |  TransactionFailedToVerify        |  Script returned non-zero  |");
  console.log("  |  -303   |  PoolRejectedDuplicatedTx         |  Same tx already in pool   |");
  console.log("  |  -304   |  PoolIsFull                       |  Pool at capacity          |");
  console.log("  |  -311   |  PoolRejectedMalformedTx          |  Invalid tx structure      |");
  console.log("  |  -312   |  PoolRejectedDuplicatedOutputs    |  Conflicting unique cells  |");
  console.log("  +---------+-----------------------------------+----------------------------+");
  console.log("");

  console.log("  =============================================================");
  console.log("  End of Error Code Reference Guide");
  console.log("  =============================================================\n");
}

// ============================================================================
// Run
// ============================================================================

main();
