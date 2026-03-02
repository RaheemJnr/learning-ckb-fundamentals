// ============================================================================
// Lesson 9: Buggy Lock Script
// ============================================================================
//
// This is an intentionally buggy CKB lock script that implements a simple
// blake2b hash-based lock. The script is supposed to:
//
//   1. Read the expected hash from the script args (first 32 bytes)
//   2. Read a preimage from the transaction witness
//   3. Hash the preimage with blake2b
//   4. Compare the hash to the expected hash in args
//   5. Return success (0) if they match, or an error code if they don't
//
// There are 4 bugs hidden in this script. Each one represents a common mistake
// that CKB script developers encounter. Your task is to find all 4 bugs,
// understand why they cause failures, and fix them.
//
// Hints:
//   - Pay attention to how data is loaded from the CKB VM syscalls
//   - Think about what index the witness should be loaded from
//   - Check the lengths used in comparisons
//   - Consider all execution paths and what they return
//
// Use CKB-Debugger and ckb_debug! to trace through the execution.
//
// ============================================================================

#![no_std]
#![cfg_attr(not(test), no_main)]

#[cfg(not(test))]
use ckb_std::default_alloc;
#[cfg(not(test))]
ckb_std::entry!(program_entry);
#[cfg(not(test))]
default_alloc!();

use ckb_std::{
    ckb_constants::Source,
    debug,
    high_level::{load_script, load_witness},
    syscalls,
};

/// Error codes for this lock script.
/// In CKB, a script returns 0 for success and any non-zero value for failure.
/// It is best practice to use distinct error codes for different failure modes
/// so that you can quickly diagnose what went wrong when a transaction fails.
const ERROR_ARGS_TOO_SHORT: i8 = 1;
const ERROR_WITNESS_MISSING: i8 = 2;
const ERROR_HASH_MISMATCH: i8 = 3;
// Note: We defined these error codes, but are they all used properly?

/// The expected length of a blake2b hash (256 bits = 32 bytes).
const BLAKE2B_HASH_LEN: usize = 32;

/// CKB blake2b personalization string.
/// CKB uses a custom personalization for its blake2b hashing to avoid
/// collisions with other blake2b uses. This is "ckb-default-hash\0..."
/// padded to 16 bytes.
const CKB_HASH_PERSONALIZATION: &[u8] = b"ckb-default-hash";

// ============================================================================
// Helper: Compute blake2b hash of data
// ============================================================================

/// Computes the blake2b-256 hash of the given data using CKB's personalization.
///
/// Blake2b is the hashing algorithm used throughout CKB (instead of SHA-256).
/// The personalization string ensures that CKB hashes are domain-separated
/// from other uses of blake2b.
fn blake2b_hash(data: &[u8]) -> [u8; 32] {
    let mut hash = [0u8; 32];

    // Create a blake2b hasher with CKB personalization
    let mut hasher = blake2b_ref::Blake2bBuilder::new(32)
        .personal(CKB_HASH_PERSONALIZATION)
        .build();

    hasher.update(data);
    hasher.finalize(&mut hash);
    hash
}

// ============================================================================
// Main Script Entry Point
// ============================================================================

pub fn program_entry() -> i8 {
    debug!("buggy-lock: script execution started");

    // -----------------------------------------------------------------------
    // Step 1: Load the script and extract args
    // -----------------------------------------------------------------------
    // The lock script's args field contains the expected blake2b hash.
    // We need to read args and extract the first 32 bytes as our target hash.

    let script = match load_script() {
        Ok(script) => script,
        Err(_) => {
            debug!("buggy-lock: failed to load script");
            return ERROR_ARGS_TOO_SHORT;
        }
    };

    let args: Vec<u8> = script.args().unpack();
    debug!("buggy-lock: loaded script args, length = {}", args.len());

    // Validate that args contains at least a full blake2b hash
    if args.len() < BLAKE2B_HASH_LEN {
        debug!("buggy-lock: args too short, expected {} bytes, got {}", BLAKE2B_HASH_LEN, args.len());
        return ERROR_ARGS_TOO_SHORT;
    }

    // BUG: Off-by-one in args reading — starts at index 1 instead of 0,
    // which skips the first byte and reads one byte past the intended range.
    let expected_hash = &args[1..BLAKE2B_HASH_LEN + 1];
    debug!("buggy-lock: expected hash loaded from args");

    // -----------------------------------------------------------------------
    // Step 2: Load the witness containing the preimage
    // -----------------------------------------------------------------------
    // In CKB, witnesses provide auxiliary data for transaction verification.
    // For a lock script, the witness at the SAME INDEX as the input being
    // verified contains the authentication data (signature, preimage, etc.).
    //
    // The current input's index can be determined from the GroupInput source,
    // but for simplicity, our hash lock reads witness at a fixed index.

    // BUG: Wrong witness index — uses index 1 instead of 0.
    // The first input's witness is at index 0 in Source::Input.
    // Using index 1 either loads the wrong witness or fails entirely.
    let witness = match load_witness(1, Source::Input) {
        Ok(witness) => witness,
        Err(_) => {
            debug!("buggy-lock: failed to load witness at index 1");
            return ERROR_WITNESS_MISSING;
        }
    };

    debug!("buggy-lock: loaded witness, length = {}", witness.len());

    if witness.is_empty() {
        debug!("buggy-lock: witness is empty");
        return ERROR_WITNESS_MISSING;
    }

    // -----------------------------------------------------------------------
    // Step 3: Hash the preimage from the witness
    // -----------------------------------------------------------------------
    // We hash the entire witness data as the preimage. In a real-world script,
    // you would typically parse the witness structure (WitnessArgs) first.

    let preimage = &witness;
    let computed_hash = blake2b_hash(preimage);

    debug!("buggy-lock: computed hash of preimage");

    // -----------------------------------------------------------------------
    // Step 4: Compare the computed hash with the expected hash
    // -----------------------------------------------------------------------
    // We need to compare all 32 bytes of the blake2b hash to ensure the
    // preimage is correct.

    // BUG: Incorrect hash comparison — only compares the first 20 bytes
    // instead of the full 32-byte blake2b hash. This means 12 bytes of
    // the hash are unchecked, making the lock significantly weaker.
    // An attacker only needs to find a 20-byte partial collision.
    let compare_len = 20; // Should be BLAKE2B_HASH_LEN (32)

    let mut match_found = true;
    for i in 0..compare_len {
        if computed_hash[i] != expected_hash[i] {
            match_found = false;
            break;
        }
    }

    if match_found {
        debug!("buggy-lock: hash comparison PASSED (first {} bytes)", compare_len);
        return 0;
    }

    debug!("buggy-lock: hash comparison FAILED");

    // BUG: Missing error code return — this function falls through to the
    // end without returning an explicit error code when the hash doesn't match.
    // In Rust, the last expression is the return value, but there is no
    // expression here. The function should return ERROR_HASH_MISMATCH.
    // Without it, the compiler may produce undefined behavior, or in debug
    // mode it will return 0 (success) — letting invalid preimages pass!

    // The fix: uncomment the line below
    // ERROR_HASH_MISMATCH
    0 // This incorrectly returns success even when the hash doesn't match!
}
