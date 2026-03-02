// ============================================================================
// Lesson 9: Fixed Lock Script
// ============================================================================
//
// This is the corrected version of the buggy-lock script. Each of the 4 bugs
// from the buggy version has been fixed, with detailed comments explaining
// what was wrong and why the fix works.
//
// The script implements a simple blake2b hash-based lock:
//   1. Read the expected hash from the script args (first 32 bytes)
//   2. Read a preimage from the transaction witness (index 0)
//   3. Hash the preimage with blake2b-256
//   4. Compare all 32 bytes of the hash to the expected hash
//   5. Return 0 (success) if they match, or a specific error code if not
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
/// Each failure mode has a distinct code so we can immediately tell
/// from a transaction error what went wrong.
const ERROR_ARGS_TOO_SHORT: i8 = 1;
const ERROR_WITNESS_MISSING: i8 = 2;
const ERROR_HASH_MISMATCH: i8 = 3;

/// The expected length of a blake2b hash (256 bits = 32 bytes).
const BLAKE2B_HASH_LEN: usize = 32;

/// CKB blake2b personalization string.
const CKB_HASH_PERSONALIZATION: &[u8] = b"ckb-default-hash";

// ============================================================================
// Helper: Compute blake2b hash of data
// ============================================================================

fn blake2b_hash(data: &[u8]) -> [u8; 32] {
    let mut hash = [0u8; 32];
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
    debug!("fixed-lock: script execution started");

    // -----------------------------------------------------------------------
    // Step 1: Load the script and extract args
    // -----------------------------------------------------------------------

    let script = match load_script() {
        Ok(script) => script,
        Err(_) => {
            debug!("fixed-lock: failed to load script");
            return ERROR_ARGS_TOO_SHORT;
        }
    };

    let args: Vec<u8> = script.args().unpack();
    debug!("fixed-lock: loaded script args, length = {}", args.len());

    if args.len() < BLAKE2B_HASH_LEN {
        debug!(
            "fixed-lock: args too short, expected {} bytes, got {}",
            BLAKE2B_HASH_LEN,
            args.len()
        );
        return ERROR_ARGS_TOO_SHORT;
    }

    // FIX #1: Off-by-one in args reading
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // BUGGY:  let expected_hash = &args[1..BLAKE2B_HASH_LEN + 1];
    // FIXED:  let expected_hash = &args[0..BLAKE2B_HASH_LEN];
    //
    // The buggy version started reading at index 1 instead of 0, which:
    //   - Skipped the first byte of the expected hash
    //   - Read one byte past the intended 32-byte range
    //   - If args was exactly 32 bytes, this would panic with an out-of-bounds error
    //   - If args was longer, it would silently compare the wrong hash
    //
    // The fix starts at index 0 and reads exactly BLAKE2B_HASH_LEN (32) bytes.
    let expected_hash = &args[0..BLAKE2B_HASH_LEN];
    debug!("fixed-lock: expected hash loaded from args[0..32]");

    // -----------------------------------------------------------------------
    // Step 2: Load the witness containing the preimage
    // -----------------------------------------------------------------------

    // FIX #2: Wrong witness index
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // BUGGY:  load_witness(1, Source::Input)
    // FIXED:  load_witness(0, Source::Input)
    //
    // The buggy version loaded witness at index 1, but the first input's
    // corresponding witness is always at index 0. In CKB, witness indices
    // correspond to input indices:
    //   - Input 0 -> Witness 0
    //   - Input 1 -> Witness 1
    //   - etc.
    //
    // Loading witness at index 1 when verifying input 0 would either:
    //   - Load the wrong witness data (getting a different input's witness)
    //   - Fail with an IndexOutOfBound error if there is only one witness
    //
    // For a more robust implementation, you should use Source::GroupInput
    // with index 0, which automatically finds the witness matching the
    // current script group's first input.
    let witness = match load_witness(0, Source::Input) {
        Ok(witness) => witness,
        Err(_) => {
            debug!("fixed-lock: failed to load witness at index 0");
            return ERROR_WITNESS_MISSING;
        }
    };

    debug!("fixed-lock: loaded witness, length = {}", witness.len());

    if witness.is_empty() {
        debug!("fixed-lock: witness is empty");
        return ERROR_WITNESS_MISSING;
    }

    // -----------------------------------------------------------------------
    // Step 3: Hash the preimage from the witness
    // -----------------------------------------------------------------------

    let preimage = &witness;
    let computed_hash = blake2b_hash(preimage);

    debug!("fixed-lock: computed hash of preimage");

    // -----------------------------------------------------------------------
    // Step 4: Compare the computed hash with the expected hash
    // -----------------------------------------------------------------------

    // FIX #3: Incorrect hash comparison length
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // BUGGY:  let compare_len = 20;
    // FIXED:  let compare_len = BLAKE2B_HASH_LEN;  // 32 bytes
    //
    // The buggy version only compared the first 20 bytes of the 32-byte
    // blake2b hash. This is a serious security vulnerability because:
    //   - 12 bytes (96 bits) of the hash were completely unchecked
    //   - An attacker only needed to find a partial collision on 20 bytes
    //     instead of the full 32, reducing the security from 256 bits to 160 bits
    //   - While 160 bits is still computationally difficult to brute force,
    //     the principle is wrong: you must always compare the FULL hash
    //
    // The fix uses BLAKE2B_HASH_LEN (32) to compare all bytes.
    let compare_len = BLAKE2B_HASH_LEN;

    let mut match_found = true;
    for i in 0..compare_len {
        if computed_hash[i] != expected_hash[i] {
            match_found = false;
            break;
        }
    }

    if match_found {
        debug!("fixed-lock: hash comparison PASSED (all {} bytes)", compare_len);
        return 0;
    }

    debug!("fixed-lock: hash comparison FAILED");

    // FIX #4: Missing error code return
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // BUGGY:  0   (returned success even on hash mismatch!)
    // FIXED:  ERROR_HASH_MISMATCH
    //
    // The buggy version returned 0 (success) at the end of the function,
    // which meant that even when the hash comparison FAILED, the script
    // would still return success. This completely broke the lock script's
    // security — any transaction could unlock cells guarded by this script
    // regardless of whether they provided the correct preimage.
    //
    // This is perhaps the most dangerous bug because:
    //   - The lock script ALWAYS succeeds, making it an "anyone can spend" lock
    //   - It is easy to miss in code review because the comparison logic
    //     appears correct — it is only the return path that is wrong
    //   - In testing with the correct preimage, everything appears to work
    //     because the happy path returns 0 before reaching this line
    //
    // The fix returns ERROR_HASH_MISMATCH (3) when the hashes don't match.
    ERROR_HASH_MISMATCH
}
