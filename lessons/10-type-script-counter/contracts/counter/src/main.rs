// ============================================================================
// Lesson 10: Counter Type Script (On-Chain Rust Contract)
// ============================================================================
//
// This is a CKB TYPE SCRIPT written in Rust. It compiles to a RISC-V binary
// that runs inside CKB-VM whenever a transaction involves cells that reference
// this script as their type script.
//
// ============================================================================
// KEY CONCEPT: How Type Scripts Differ from Lock Scripts
// ============================================================================
//
// Lock Script:
//   - Controls WHO can spend (consume) a cell.
//   - Runs ONLY for INPUT cells (cells being consumed).
//   - Analogous to a "lock on a box" — you need the right key to open it.
//   - Example: signature verification, hash preimage check.
//
// Type Script:
//   - Controls WHAT a cell can contain and HOW it can change.
//   - Runs for BOTH INPUT cells AND OUTPUT cells in a transaction.
//   - Analogous to a "rulebook" — defines what states are legal.
//   - Example: token supply rules, counter increment rules, NFT uniqueness.
//
// ============================================================================
// KEY CONCEPT: When Does a Type Script Execute?
// ============================================================================
//
// A type script is executed when ANY cell in the transaction references it.
// CKB groups cells by their type script and runs the script once per group.
//
// The script must examine the transaction and decide if the state transition
// is valid. It returns 0 for success or non-zero for failure.
//
// Three scenarios the type script must handle:
//
// 1. CREATION: Output cells have this type, but no input cells do.
//    The script validates initial state (e.g., counter must start at 0).
//
// 2. UPDATE: Both input and output cells have this type.
//    The script validates the state transition (e.g., counter incremented by 1).
//
// 3. DESTRUCTION: Input cells have this type, but no output cells do.
//    The script decides if destruction is allowed (we allow it here).
//
// ============================================================================
// KEY CONCEPT: Script Groups
// ============================================================================
//
// CKB groups cells by their complete script (code_hash + hash_type + args).
// When iterating with Source::GroupInput or Source::GroupOutput, you only see
// cells that share the EXACT SAME type script as the currently executing one.
//
// This is critical: if two cells have different type script args, they are
// in different groups and validated independently.
//
// ============================================================================

// ============================================================================
// no_std Declaration
// ============================================================================
// CKB scripts run in a bare-metal RISC-V environment with no operating system.
// There is no heap allocator, no file system, no networking — just raw
// computation and CKB-VM syscalls. We must declare `no_std` to tell the Rust
// compiler not to link the standard library.
//
// `no_main` tells the compiler we provide our own entry point (via the
// ckb_std entry! macro) instead of the usual fn main().
// ============================================================================
#![no_std]
#![no_main]

// ============================================================================
// Imports from ckb_std
// ============================================================================
// ckb_std is THE standard library for CKB script development. It provides:
//
// - entry!: Macro that defines the RISC-V entry point for our script.
//
// - error::SysError: Error type for CKB syscall failures. The most important
//   variant is SysError::IndexOutOfBound, which signals "no more items" when
//   iterating through cells.
//
// - high_level: High-level wrappers around CKB syscalls:
//   * load_cell_data(index, source): Load the data field of a cell.
//     The `index` is the position within the group, and `source` determines
//     which group to look in (GroupInput, GroupOutput, etc.).
//
// - ckb_constants::Source: Enum specifying where to look for cells:
//   * Source::Input — all inputs in the transaction
//   * Source::Output — all outputs in the transaction
//   * Source::GroupInput — only inputs with the SAME type script as ours
//   * Source::GroupOutput — only outputs with the SAME type script as ours
//
// GroupInput/GroupOutput are the most useful for type scripts because they
// automatically filter to cells in our script group.
// ============================================================================
use ckb_std::error::SysError;
use ckb_std::high_level::load_cell_data;
use ckb_std::ckb_constants::Source;

// ============================================================================
// Entry Point
// ============================================================================
// The entry! macro sets up the RISC-V entry point and calls our main function.
// CKB-VM will execute this when the script is invoked.
//
// The function must return a Result<(), i8>:
//   - Ok(()) means the script APPROVES the transaction (exit code 0).
//   - Err(code) means the script REJECTS the transaction (non-zero exit code).
//
// If ANY script in a transaction returns an error, the ENTIRE transaction
// is rejected. This is how CKB enforces its validation rules.
// ============================================================================
ckb_std::entry!(main);

// ============================================================================
// Error Codes
// ============================================================================
// We define meaningful error codes so that when the script rejects a
// transaction, the off-chain code (and developers debugging) can understand
// WHY it was rejected.
//
// CKB convention: error codes are small negative integers (i8 range).
// Code 0 is reserved for success. Positive codes are used by CKB-VM itself.
// Script authors typically use negative codes or small positive codes > 0.
// ============================================================================

/// The cell data is not exactly 8 bytes (we store the counter as a u64).
const ERROR_INVALID_DATA_LENGTH: i8 = 5;

/// On creation, the counter must be initialized to 0.
const ERROR_COUNTER_NOT_ZERO_ON_CREATION: i8 = 6;

/// On update, there must be exactly one input and one output in the group.
/// (Our simple counter allows only 1-to-1 transitions.)
const ERROR_INVALID_CELL_COUNT: i8 = 7;

/// On update, the output counter must equal input counter + 1.
const ERROR_COUNTER_NOT_INCREMENTED: i8 = 8;

// ============================================================================
// Main Validation Logic
// ============================================================================
fn main() -> Result<(), i8> {
    // ========================================================================
    // Step 1: Count inputs and outputs in our script group
    // ========================================================================
    // We iterate through GroupInput and GroupOutput to determine which
    // scenario we are in: creation, update, or destruction.
    //
    // The pattern: try to load cell data at increasing indices until we get
    // SysError::IndexOutOfBound, which means "no more cells in this group."
    //
    // This is a standard CKB pattern for counting cells in a group.
    // ========================================================================

    let input_count = count_cells_in_group(Source::GroupInput);
    let output_count = count_cells_in_group(Source::GroupOutput);

    // ========================================================================
    // Step 2: Determine the scenario and validate accordingly
    // ========================================================================
    //
    // The three scenarios:
    //
    //   input_count == 0, output_count > 0  =>  CREATION
    //     New counter cells are being created. Each must start at 0.
    //
    //   input_count > 0, output_count > 0   =>  UPDATE
    //     Existing counter cells are being consumed and new ones created.
    //     We enforce that output_data = input_data + 1.
    //
    //   input_count > 0, output_count == 0  =>  DESTRUCTION
    //     Counter cells are being consumed with no replacement.
    //     We allow this unconditionally (the owner can destroy their counter).
    //
    //   input_count == 0, output_count == 0 =>  IMPOSSIBLE
    //     The script would not be invoked if no cells reference it.
    //
    // ========================================================================

    match (input_count, output_count) {
        // ------------------------------------------------------------------
        // CREATION: No inputs with this type, but outputs exist.
        // This means new counter cells are being minted.
        // ------------------------------------------------------------------
        (0, _output_count) => {
            // Validate every new counter cell starts at 0.
            // We iterate through all outputs in our group.
            for i in 0..output_count {
                let data = load_cell_data(i, Source::GroupOutput)
                    .map_err(|_| ERROR_INVALID_DATA_LENGTH)?;

                // The counter is stored as a u64 (8 bytes, little-endian).
                // We enforce exactly 8 bytes of data.
                let counter = parse_counter(&data)?;

                // On creation, the counter MUST be 0.
                // This prevents someone from creating a counter at an
                // arbitrary value, which would break the state machine.
                if counter != 0 {
                    return Err(ERROR_COUNTER_NOT_ZERO_ON_CREATION);
                }
            }
            Ok(())
        }

        // ------------------------------------------------------------------
        // UPDATE: Both inputs and outputs exist with this type.
        // The counter must be incremented by exactly 1.
        // ------------------------------------------------------------------
        (_input_count, _output_count) if input_count > 0 && output_count > 0 => {
            // For simplicity, we enforce a 1-to-1 mapping:
            // exactly one input counter cell and one output counter cell.
            //
            // A more advanced version could support batch updates or
            // multiple independent counters, but that adds complexity
            // beyond the scope of this lesson.
            if input_count != 1 || output_count != 1 {
                return Err(ERROR_INVALID_CELL_COUNT);
            }

            // Load the input counter value (the "old" state).
            let input_data = load_cell_data(0, Source::GroupInput)
                .map_err(|_| ERROR_INVALID_DATA_LENGTH)?;
            let input_counter = parse_counter(&input_data)?;

            // Load the output counter value (the "new" state).
            let output_data = load_cell_data(0, Source::GroupOutput)
                .map_err(|_| ERROR_INVALID_DATA_LENGTH)?;
            let output_counter = parse_counter(&output_data)?;

            // ============================================================
            // THE CORE RULE: output must equal input + 1
            // ============================================================
            // This is the heart of our state machine. The type script
            // enforces that the counter can ONLY increase by 1 per
            // transaction. No skipping, no decrementing, no resetting.
            //
            // This guarantee holds regardless of who submits the
            // transaction — the lock script handles authorization, but
            // the type script enforces the data integrity rule.
            //
            // Think of it this way:
            //   - Lock script = "Only Alice can modify this cell"
            //   - Type script = "The counter can only go up by 1"
            //
            // Together they ensure: "Only Alice can increment the counter,
            // and she can only increment it by 1 at a time."
            // ============================================================
            if output_counter != input_counter + 1 {
                return Err(ERROR_COUNTER_NOT_INCREMENTED);
            }

            Ok(())
        }

        // ------------------------------------------------------------------
        // DESTRUCTION: Inputs exist but no outputs with this type.
        // The counter cells are being consumed without replacement.
        // ------------------------------------------------------------------
        (_input_count, 0) => {
            // We allow destruction unconditionally.
            //
            // Design choice: Some type scripts may want to prevent
            // destruction (e.g., a governance token that should never
            // be burned). In that case, you would return an error here.
            //
            // For our counter, destruction is fine — the owner can
            // choose to stop counting and reclaim their CKB capacity.
            Ok(())
        }

        // ------------------------------------------------------------------
        // IMPOSSIBLE: Should never happen, but handle defensively.
        // ------------------------------------------------------------------
        _ => Ok(()),
    }
}

// ============================================================================
// Helper: Parse Counter from Cell Data
// ============================================================================
// CKB cell data is just raw bytes — there is no built-in serialization format.
// We choose to store the counter as a u64 in little-endian byte order.
//
// Why u64?
//   - 8 bytes is compact (minimizes capacity cost).
//   - u64 supports counts up to 18,446,744,073,709,551,615 — more than enough.
//   - Little-endian matches RISC-V's native byte order.
//
// Why exactly 8 bytes?
//   - Strict length checking prevents accidental misuse.
//   - If someone creates a cell with wrong-sized data, the type script rejects
//     the transaction immediately, providing a clear error.
// ============================================================================
fn parse_counter(data: &[u8]) -> Result<u64, i8> {
    // Ensure the data is exactly 8 bytes (size of a u64).
    if data.len() != 8 {
        return Err(ERROR_INVALID_DATA_LENGTH);
    }

    // Convert 8 bytes from little-endian to a u64.
    // We use try_into to convert the slice to a fixed-size array.
    let bytes: [u8; 8] = data
        .try_into()
        .map_err(|_| ERROR_INVALID_DATA_LENGTH)?;

    Ok(u64::from_le_bytes(bytes))
}

// ============================================================================
// Helper: Count Cells in a Script Group
// ============================================================================
// This function counts how many cells exist in a given source (GroupInput
// or GroupOutput) for the currently executing script group.
//
// The pattern:
//   1. Start at index 0.
//   2. Try to load cell data at that index.
//   3. If successful, increment the count and try the next index.
//   4. If we get IndexOutOfBound, we have counted all cells.
//
// This is the idiomatic way to count cells in CKB scripts because there
// is no direct "get count" syscall. The IndexOutOfBound error is the
// standard signal that there are no more items at that index.
//
// Performance note: load_cell_data loads the full data into memory. For
// counting purposes, a more efficient approach would be to use
// `ckb_std::high_level::load_cell(index, source)` which loads only the
// cell metadata (capacity, lock, type) without the data field. However,
// for clarity in this lesson, we use load_cell_data since we will need
// the data anyway for validation.
// ============================================================================
fn count_cells_in_group(source: Source) -> usize {
    let mut count = 0;
    loop {
        // Try to load cell data at the current index.
        // We don't care about the actual data here — we just want to know
        // if a cell exists at this index.
        match load_cell_data(count, source) {
            Ok(_) => {
                // Cell exists at this index. Keep counting.
                count += 1;
            }
            Err(SysError::IndexOutOfBound) => {
                // No cell at this index — we have reached the end.
                // This is NOT an error condition; it is the normal way
                // to detect "no more cells" in CKB.
                break;
            }
            Err(_) => {
                // Some other unexpected error. In production, you might
                // want to handle this differently, but for our counter
                // script, we just stop counting.
                break;
            }
        }
    }
    count
}

// ============================================================================
// Summary of the Counter Type Script State Machine
// ============================================================================
//
//   +----------+     CREATE      +-----------+     UPDATE      +-----------+
//   |          | --------------> | counter=0 | --------------> | counter=1 |
//   | (no cell)|                 +-----------+                 +-----------+
//   +----------+                      |                             |
//                                     |  DESTROY                    |  UPDATE
//                                     v                             v
//                                +----------+                 +-----------+
//                                | (no cell)|                 | counter=2 |
//                                +----------+                 +-----------+
//                                                                  |
//                                                                  |  ...
//                                                                  v
//                                                             +-----------+
//                                                             | counter=N |
//                                                             +-----------+
//                                                                  |
//                                                                  | DESTROY
//                                                                  v
//                                                             +----------+
//                                                             | (no cell)|
//                                                             +----------+
//
// The type script guarantees:
//   - Every counter starts at 0.
//   - Every update increments by exactly 1.
//   - Destruction is always allowed.
//   - No skipping values, no decrementing, no resetting.
//
// This is enforced at the consensus level — even a malicious miner cannot
// create an invalid state transition because all nodes verify the type script.
// ============================================================================
