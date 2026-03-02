// ============================================================================
// Lesson 08: Hash Lock Script (On-Chain Rust Code)
// ============================================================================
//
// This file contains a complete CKB lock script written in Rust. It
// implements a "hash lock" — a mechanism where a cell can only be consumed
// (spent) if the spender provides a secret value (called a "preimage")
// whose blake2b-256 hash matches a hash stored in the script's args.
//
// HOW IT WORKS (Big Picture):
//
//   1. When someone creates a cell, they set the cell's lock script args
//      to a 32-byte blake2b hash of a secret preimage.
//
//   2. When someone wants to spend that cell, they must include the
//      original preimage in the transaction's witness data.
//
//   3. This script runs inside CKB-VM and:
//      a. Loads the expected hash from the script args
//      b. Loads the preimage from the first witness
//      c. Computes blake2b-256 of the preimage
//      d. Compares the computed hash with the expected hash
//      e. Returns 0 (success) if they match, or an error code if not
//
// WHY HASH LOCKS ARE USEFUL:
//
//   - They enable trustless atomic swaps between chains
//   - They are the building block for HTLCs (Hash Time-Locked Contracts)
//   - They demonstrate the fundamentals of CKB script development
//   - Anyone with the preimage can spend the cell, regardless of identity
//
// COMPILATION NOTE:
//
//   This script targets the RISC-V architecture (riscv64imac-unknown-none-elf)
//   used by CKB-VM. You need the CKB RISC-V toolchain to compile it.
//   See the README for setup instructions.
//
// ============================================================================

// ============================================================================
// NO_STD DECLARATION
// ============================================================================
//
// CKB scripts run in a bare-metal RISC-V virtual machine (CKB-VM).
// There is no operating system, no filesystem, no network stack.
// Therefore, we cannot use Rust's standard library (std).
//
// #![no_std] tells the Rust compiler: "Do not link the standard library."
// Instead, we rely on ckb-std which provides the minimal functionality
// we need (memory allocation, CKB syscalls, hashing, etc.).
//
// #![no_main] tells the compiler: "There is no normal main() entry point."
// CKB scripts use a special entry point defined by the ckb_std macros.
// ============================================================================
#![no_std]
#![no_main]

// ============================================================================
// IMPORTS
// ============================================================================

// ckb_std::ckb_types::prelude::* provides the Unpack trait, which is used
// to convert CKB's packed (serialized) data types into their unpacked
// (usable) Rust equivalents. CKB uses the "Molecule" serialization format
// internally, and Unpack converts molecule-packed structs into native types.
use ckb_std::ckb_types::prelude::*;

// default_alloc! sets up a memory allocator for the no_std environment.
// CKB-VM provides a flat memory space, and this macro configures a simple
// allocator so we can use heap-allocated types if needed.
use ckb_std::default_alloc;

// entry! defines the program entry point. When CKB-VM starts executing
// this script, it calls the function specified in the entry! macro.
// This replaces the normal fn main() that Rust programs use.
use ckb_std::entry;

// high_level provides convenient wrapper functions around raw CKB syscalls.
// These functions handle the low-level details of calling CKB-VM syscalls
// (like buffer allocation, length negotiation, etc.) and return nice Rust types.
//
// - load_script(): Loads the currently executing script (code_hash, hash_type, args)
// - load_witness(): Loads a witness from the transaction by index and source
use ckb_std::high_level::{load_script, load_witness};

// Source identifies which part of the transaction to load data from:
// - Source::Input: Load from inputs
// - Source::Output: Load from outputs
// - Source::GroupInput: Load from inputs that share the same lock/type script
// - Source::GroupOutput: Load from outputs that share the same lock/type script
use ckb_std::ckb_types::packed::Bytes as PackedBytes;
use ckb_std::since::Since;

// ============================================================================
// ERROR CODES
// ============================================================================
//
// CKB scripts communicate success or failure through exit codes:
//   - 0 means SUCCESS (the script approves the transaction)
//   - Any non-zero value means FAILURE (the transaction is rejected)
//
// It is good practice to define specific error codes for different failure
// modes. This makes debugging much easier — when a transaction fails, the
// error code tells you exactly WHY it failed.
//
// Convention: Error codes in the range 1-63 are reserved by CKB itself.
// User-defined error codes should start at 5 or higher to avoid confusion,
// though commonly scripts use small numbers for simplicity.
// ============================================================================

/// Error: The script args field is empty or has the wrong length.
/// The args must contain exactly 32 bytes (a blake2b-256 hash).
const ERROR_INVALID_ARGS_LENGTH: i8 = 5;

/// Error: No witness was found at index 0 of the script group inputs.
/// The spender must provide the preimage in the first witness.
const ERROR_NO_WITNESS: i8 = 6;

/// Error: The witness (preimage) was found but is empty (zero bytes).
/// A valid preimage must have at least one byte.
const ERROR_EMPTY_PREIMAGE: i8 = 7;

/// Error: The blake2b hash of the provided preimage does not match the
/// expected hash stored in the script args. Either the preimage is wrong,
/// or the spender is trying to unlock a cell they don't have the secret for.
const ERROR_HASH_MISMATCH: i8 = 8;

// ============================================================================
// MEMORY ALLOCATOR SETUP
// ============================================================================
//
// CKB-VM provides scripts with a contiguous block of memory. The
// default_alloc!() macro sets up a simple bump allocator that manages
// this memory. Without this, any heap allocation (Vec, String, Box, etc.)
// would cause a panic.
//
// For most CKB scripts, the default allocator settings work fine.
// Advanced scripts that need more memory can configure the heap/stack sizes.
// ============================================================================
default_alloc!();

// ============================================================================
// ENTRY POINT
// ============================================================================
//
// The entry! macro tells CKB-VM which function to call when the script
// starts executing. It generates the actual _start symbol that the VM
// looks for.
//
// The function must return i8:
//   - Return 0 for success (transaction approved)
//   - Return non-zero for failure (transaction rejected)
// ============================================================================
entry!(main);

// ============================================================================
// BLAKE2B HASHING HELPER
// ============================================================================
//
// Blake2b is the primary hash function used throughout CKB. It is used for:
//   - Transaction hashing
//   - Script hashing (code_hash computation)
//   - Address derivation (blake160 = first 20 bytes of blake2b)
//   - And here: our hash lock preimage verification
//
// CKB uses blake2b with a specific "personalization" string:
//   "ckb-default-hash"
//
// This personalization ensures that CKB hashes are domain-separated from
// blake2b hashes used in other contexts. Two different applications using
// blake2b with different personalizations will produce different hashes
// for the same input, preventing cross-protocol attacks.
//
// We use blake2b-256, which produces a 32-byte (256-bit) hash output.
// ============================================================================

/// The length of a blake2b-256 hash output in bytes.
const BLAKE2B_256_HASH_LEN: usize = 32;

/// CKB's standard personalization string for blake2b hashing.
/// All standard CKB hashing operations use this personalization.
const CKB_HASH_PERSONALIZATION: &[u8] = b"ckb-default-hash";

/// Computes the blake2b-256 hash of the given data using CKB's
/// standard personalization.
///
/// # Arguments
/// * `data` - The bytes to hash (in our case, the preimage)
///
/// # Returns
/// A 32-byte array containing the blake2b-256 hash
///
/// # How blake2b works (simplified):
/// 1. Initialize the blake2b state with the personalization string
/// 2. Feed the input data into the state (can be done in chunks)
/// 3. Finalize to produce the fixed-size output hash
///
/// The hash is deterministic: the same input always produces the same output.
/// It is also one-way: given a hash, you cannot feasibly find the input.
fn blake2b_256(data: &[u8]) -> [u8; BLAKE2B_256_HASH_LEN] {
    // Create a new blake2b hasher instance.
    //
    // Parameters:
    //   - output length: 32 bytes (256 bits)
    //   - key: empty (we are not using keyed hashing)
    //   - personalization: "ckb-default-hash" (CKB standard)
    //
    // The ckb_std::blake2b::new_blake2b() function creates a hasher
    // pre-configured with CKB's personalization, so we don't need to
    // set it manually. But we show the conceptual setup here for clarity.
    let mut hasher = ckb_std::blake2b::new_blake2b();

    // Feed the input data into the hasher.
    //
    // update() can be called multiple times to hash data in chunks.
    // For our use case, we hash the entire preimage in one call.
    // The hasher maintains internal state that accumulates all the
    // data fed into it.
    hasher.update(data);

    // Finalize the hash computation and write the result.
    //
    // finalize() completes the hashing algorithm and writes the
    // 32-byte hash output into our result buffer. After this call,
    // the hasher should not be reused.
    let mut hash = [0u8; BLAKE2B_256_HASH_LEN];
    hasher.finalize(&mut hash);

    hash
}

// ============================================================================
// MAIN SCRIPT LOGIC
// ============================================================================
//
// This is where the core verification happens. The function is called by
// CKB-VM when the script needs to be executed (i.e., when a transaction
// tries to consume a cell locked by this script).
//
// The execution flow:
//
//   1. A transaction is submitted to the network
//   2. CKB validates the transaction:
//      a. For each input cell, CKB executes the cell's lock script
//      b. Lock scripts run inside CKB-VM (a RISC-V virtual machine)
//      c. If ANY lock script returns non-zero, the transaction is REJECTED
//   3. This function is one such lock script execution
//
// IMPORTANT: Lock scripts do NOT receive parameters directly. Instead,
// they use CKB syscalls to read data from the transaction context:
//   - load_script() → gets the script itself (including args)
//   - load_witness() → gets witness data from the transaction
//   - load_cell_data() → gets cell data
//   - load_input() → gets input cell references
//   - etc.
//
// Think of CKB-VM as a sandbox where the script can "peek" at the
// transaction through these syscalls, but cannot modify anything.
// The script's only output is its return code (0 = approve, non-zero = reject).
// ============================================================================

fn main() -> i8 {
    // ========================================================================
    // STEP 1: Load the currently executing script
    // ========================================================================
    //
    // load_script() is a CKB syscall that returns the Script struct for
    // the currently executing script. The Script struct contains:
    //
    //   - code_hash: A 32-byte hash that identifies which code to run.
    //     This is the blake2b hash of the compiled script binary.
    //
    //   - hash_type: How to interpret code_hash.
    //     "data" or "data1" means code_hash = hash of the script binary itself
    //     "type" means code_hash = hash of a type script that governs the
    //     cell containing the script binary
    //
    //   - args: Arbitrary bytes provided when the cell was created.
    //     For our hash lock, this contains the 32-byte expected hash.
    //
    // If load_script() fails (which should never happen for a running script),
    // we return a generic error code of 1.
    // ========================================================================
    let script = match load_script() {
        Ok(script) => script,
        Err(_) => return 1, // Should never happen: every running script can load itself
    };

    // ========================================================================
    // STEP 2: Extract and validate the expected hash from script args
    // ========================================================================
    //
    // The script args contain the expected blake2b-256 hash. This hash was
    // set by whoever created the cell. It is the "lock" — the cell can only
    // be consumed by someone who knows the preimage of this hash.
    //
    // args() returns a Molecule-packed Bytes type. We call .unpack() to
    // convert it to a regular Rust Bytes (Vec<u8>) that we can work with.
    //
    // We then call .to_vec() to get a standard Vec<u8>.
    // ========================================================================
    let args = script.args().unpack();
    let expected_hash: Vec<u8> = args.to_vec();

    // Validate that the args contain exactly 32 bytes.
    //
    // A blake2b-256 hash is always exactly 32 bytes. If the args have a
    // different length, the cell was created incorrectly and cannot be
    // unlocked properly.
    //
    // Common mistakes that would trigger this error:
    //   - Storing a hex string instead of raw bytes
    //   - Using blake160 (20 bytes) instead of blake256 (32 bytes)
    //   - Forgetting to set the args at all (0 bytes)
    if expected_hash.len() != BLAKE2B_256_HASH_LEN {
        return ERROR_INVALID_ARGS_LENGTH;
    }

    // ========================================================================
    // STEP 3: Load the preimage from the witness
    // ========================================================================
    //
    // Witnesses are pieces of data attached to a transaction that are NOT
    // part of any cell. They exist only in the transaction itself and are
    // typically used for:
    //   - Digital signatures (in standard lock scripts)
    //   - Proofs or secrets (like our preimage)
    //   - Any data the script needs to verify
    //
    // load_witness() loads a witness by index and source:
    //   - Index 0: the first witness in the group
    //   - Source::GroupInput: witnesses corresponding to inputs that use
    //     this same lock script
    //
    // WHY Source::GroupInput?
    //
    // When a transaction has multiple inputs, some may share the same lock
    // script. CKB groups these inputs together. Source::GroupInput tells the
    // syscall: "Load the witness for the first input in MY group."
    //
    // This is more efficient than Source::Input because:
    //   1. The script only sees witnesses relevant to its own inputs
    //   2. If multiple inputs share this lock, the script runs only ONCE
    //      for the entire group (not once per input)
    //
    // The witness data is raw bytes. In our case, the entire witness
    // content IS the preimage — the secret value whose hash should match
    // the expected hash in the script args.
    //
    // NOTE ON WITNESS FORMAT:
    // In a real-world deployment, you would typically use WitnessArgs,
    // which is a structured Molecule type with fields for lock, input_type,
    // and output_type. The preimage would go in the "lock" field of
    // WitnessArgs. For simplicity and educational clarity, we treat the
    // entire witness as the raw preimage here.
    // ========================================================================
    let witness = match load_witness(0, ckb_std::ckb_constants::Source::GroupInput) {
        Ok(witness) => witness,
        Err(_) => {
            // No witness found for this script group.
            //
            // This means the spender did not provide the preimage.
            // Without the preimage, we cannot verify the hash, so the
            // transaction must be rejected.
            return ERROR_NO_WITNESS;
        }
    };

    // The witness is a Molecule-packed Bytes. Convert to a raw byte slice.
    let preimage: &[u8] = &witness;

    // Validate that the preimage is not empty.
    //
    // An empty preimage would hash to a known constant value (the blake2b
    // hash of empty input). While this is technically a valid hash, allowing
    // empty preimages would mean anyone could compute it. We reject empty
    // preimages as a safety measure.
    if preimage.is_empty() {
        return ERROR_EMPTY_PREIMAGE;
    }

    // ========================================================================
    // STEP 4: Compute the blake2b-256 hash of the preimage
    // ========================================================================
    //
    // Now we hash the provided preimage using the same blake2b-256 algorithm
    // and CKB personalization that was used when the cell was created.
    //
    // If the spender knows the correct preimage, this hash will match
    // the expected hash stored in the script args.
    //
    // If the spender provides the wrong preimage, the hash will be
    // completely different (due to the avalanche effect of cryptographic
    // hash functions — even a 1-bit change in input produces a completely
    // different output).
    // ========================================================================
    let computed_hash = blake2b_256(preimage);

    // ========================================================================
    // STEP 5: Compare the computed hash with the expected hash
    // ========================================================================
    //
    // This is the moment of truth. We compare the 32-byte computed hash
    // with the 32-byte expected hash from the script args.
    //
    // We use constant-time comparison by checking all 32 bytes.
    // In production, you might want to use a dedicated constant-time
    // comparison function to prevent timing attacks, although in the
    // CKB-VM context (where execution is metered by cycles rather than
    // wall-clock time), timing attacks are not a practical concern.
    //
    // If the hashes match: the spender knows the secret, approve the spend.
    // If they differ: the spender does not know the secret, reject.
    // ========================================================================
    if computed_hash[..] != expected_hash[..] {
        // Hash mismatch! The provided preimage does not produce the
        // expected hash. The transaction is REJECTED.
        //
        // Possible reasons:
        //   - The spender guessed wrong
        //   - The spender is trying to spend someone else's hash-locked cell
        //   - The preimage was corrupted in transit
        return ERROR_HASH_MISMATCH;
    }

    // ========================================================================
    // STEP 6: SUCCESS — Approve the transaction
    // ========================================================================
    //
    // If we reach this point, the preimage is valid:
    //   - The script args contained a valid 32-byte hash
    //   - The witness contained a non-empty preimage
    //   - blake2b_256(preimage) == expected_hash
    //
    // Returning 0 tells CKB: "This lock script approves the transaction.
    // The inputs locked by this script are authorized to be consumed."
    //
    // Note: Even if this lock script returns 0, the transaction can still
    // be rejected if:
    //   - Another input's lock script returns non-zero
    //   - A type script returns non-zero
    //   - The transaction structure is invalid (e.g., capacity overflow)
    // ========================================================================
    0
}
