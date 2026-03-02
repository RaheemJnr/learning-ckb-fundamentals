// ============================================================================
// Lesson 12: Simple Math - CKB-VM Cycle Counting Demo
// ============================================================================
//
// This script demonstrates how different operations in CKB-VM consume varying
// amounts of execution cycles. CKB-VM is a RISC-V (rv64imc) virtual machine
// that counts every instruction executed. Transactions on CKB have a maximum
// cycle budget, so understanding cycle costs is essential for writing efficient
// on-chain scripts.
//
// HOW CYCLE COUNTING WORKS IN CKB-VM:
//
//   CKB-VM assigns a cost to each RISC-V instruction. For example:
//     - Simple ALU ops (add, sub, and, or, xor): ~1 cycle each
//     - Multiply/divide: ~5 cycles each
//     - Memory load/store: ~3 cycles each
//     - Branch/jump: ~3 cycles each
//
//   The VM tracks a running total. If a script exceeds the transaction's
//   cycle limit, execution is terminated and the transaction is rejected.
//
// HOW TO USE THIS SCRIPT:
//
//   1. Compile with: cargo build --target riscv64imac-unknown-none-elf --release
//   2. Run under ckb-debugger to see debug output and cycle counts:
//      ckb-debugger --bin target/riscv64imac-unknown-none-elf/release/simple-math
//
//   The ckb-debugger reports the total cycle count after execution, and the
//   debug! messages help you correlate which section consumed how many cycles.
//
// ============================================================================

// ============================================================================
// no_std Preamble
// ============================================================================
// CKB scripts run on bare-metal RISC-V with no operating system. There is no
// libc, no filesystem, no network — just raw CPU instructions and a fixed
// amount of memory (4MB by default). We must use `no_std` and provide our
// own allocator and entry point.

#![no_std]
#![cfg_attr(not(test), no_main)]

// Import the default allocator from ckb-std.
// This sets up a simple bump allocator for heap allocations (Vec, String, etc.).
// Without this, any heap allocation would cause a linker error.
#[cfg(not(test))]
use ckb_std::default_alloc;
#[cfg(not(test))]
ckb_std::entry!(program_entry);
#[cfg(not(test))]
default_alloc!();

// The `debug!` macro writes messages to stderr when running under ckb-debugger.
// In production (on-chain), debug output is silently discarded, so these calls
// have near-zero overhead in real transactions.
use ckb_std::debug;

// ============================================================================
// Constants
// ============================================================================

/// Number of iterations for the loop benchmarks.
/// Higher values = more cycles consumed.
/// In a real script, you would minimize loop iterations to save cycles.
const LOOP_ITERATIONS_SMALL: u64 = 100;
const LOOP_ITERATIONS_MEDIUM: u64 = 1_000;
const LOOP_ITERATIONS_LARGE: u64 = 10_000;

/// Size of the buffer for memory allocation tests (in bytes).
/// CKB-VM has a default memory limit of 4MB, so we keep this modest.
const ALLOC_SIZE_SMALL: usize = 64;
const ALLOC_SIZE_MEDIUM: usize = 1024;
const ALLOC_SIZE_LARGE: usize = 4096;

/// Blake2b personalization string used by CKB.
/// CKB uses a custom personalization to domain-separate its hashes from
/// other uses of blake2b. This is a 16-byte string.
const CKB_HASH_PERSONALIZATION: &[u8] = b"ckb-default-hash";

// ============================================================================
// Section 1: Simple Arithmetic
// ============================================================================
//
// Basic arithmetic maps almost 1:1 to RISC-V instructions:
//   - Addition (ADD): ~1 cycle
//   - Multiplication (MUL): ~5 cycles (uses the M extension)
//   - Division (DIV): ~5 cycles (uses the M extension)
//   - Shift operations: ~1 cycle
//
// These are the cheapest operations you can perform in CKB-VM.

/// Performs a series of arithmetic operations and returns the result.
/// Each operation here compiles to just 1-5 RISC-V instructions.
fn arithmetic_demo() -> u64 {
    debug!("=== Section 1: Simple Arithmetic ===");

    // Addition: compiles to a single RISC-V ADD instruction (~1 cycle)
    let a: u64 = 42;
    let b: u64 = 58;
    let sum = a + b;
    debug!("  Addition: {} + {} = {}", a, b, sum);

    // Multiplication: uses RISC-V MUL from the M extension (~5 cycles)
    let product = a * b;
    debug!("  Multiplication: {} * {} = {}", a, b, product);

    // Division: uses RISC-V DIV from the M extension (~5 cycles)
    let quotient = product / a;
    debug!("  Division: {} / {} = {}", product, a, quotient);

    // Bitwise shift: compiles to RISC-V SLL/SRL (~1 cycle each)
    let shifted = sum << 4;
    debug!("  Left shift: {} << 4 = {}", sum, shifted);

    // Bitwise XOR: compiles to RISC-V XOR (~1 cycle)
    let xored = a ^ b;
    debug!("  XOR: {} ^ {} = {}", a, b, xored);

    debug!("  Arithmetic section complete");
    sum + product + quotient + shifted + xored
}

// ============================================================================
// Section 2: Loop Iterations
// ============================================================================
//
// Loops scale linearly with iteration count. Each iteration involves:
//   - A comparison instruction (branch): ~3 cycles
//   - The loop body instructions
//   - An increment instruction: ~1 cycle
//
// This demonstrates that cycle cost grows proportionally with iteration count.
// When writing CKB scripts, minimize unnecessary iterations.

/// Runs addition in a loop of the given size and returns the accumulated sum.
/// This lets us compare cycle costs at different iteration counts.
fn loop_demo(iterations: u64) -> u64 {
    debug!("  Loop with {} iterations starting...", iterations);

    let mut accumulator: u64 = 0;
    let mut i: u64 = 0;

    // Each iteration: compare (3 cycles) + add (1 cycle) + increment (1 cycle)
    // So roughly ~5 cycles per iteration, plus branch prediction effects.
    while i < iterations {
        // Wrapping add to avoid overflow panic in debug builds.
        // In release builds with overflow-checks off, regular + would work,
        // but wrapping_add is explicit and safe.
        accumulator = accumulator.wrapping_add(i);
        i += 1;
    }

    debug!("  Loop result: {}", accumulator);
    accumulator
}

// ============================================================================
// Section 3: Memory Allocation
// ============================================================================
//
// Heap allocation (Vec, Box, etc.) in CKB-VM uses the bump allocator from
// ckb-std. Allocation itself is cheap (just moving a pointer), but:
//   - Writing to allocated memory costs ~3 cycles per store
//   - The 4MB memory limit constrains total allocation
//   - Filling large buffers means many store instructions
//
// Rule of thumb: allocation cost is proportional to the amount of data written.

/// Allocates a Vec of the given size, fills it, and returns the sum.
/// Demonstrates that memory operations scale with data size.
fn allocation_demo(size: usize) -> u64 {
    debug!("  Allocating and filling {} bytes...", size);

    // Vec::with_capacity allocates heap memory via the bump allocator.
    // The allocation itself is O(1) — just advancing a pointer.
    let mut buffer: alloc::vec::Vec<u8> = alloc::vec::Vec::with_capacity(size);

    // Filling the buffer is where the real cost is:
    // each push involves a store instruction (~3 cycles).
    for i in 0..size {
        buffer.push((i & 0xFF) as u8);
    }

    // Summing the buffer: one load (~3 cycles) + one add (~1 cycle) per byte.
    let sum: u64 = buffer.iter().map(|&b| b as u64).sum();
    debug!("  Allocation sum: {}", sum);
    sum
}

// We need alloc for Vec since we are in no_std
extern crate alloc;

// ============================================================================
// Section 4: Blake2b Hashing
// ============================================================================
//
// Hashing is one of the most common operations in CKB scripts. Blake2b is
// CKB's default hash function (used for script hashes, tx hashes, etc.).
//
// Cycle cost depends on data size:
//   - Blake2b processes data in 128-byte blocks
//   - Each block requires ~700 cycles of compression
//   - Initialization: ~200 cycles
//   - Finalization: ~700 cycles
//
// So hashing N bytes costs roughly: 200 + ceil(N/128) * 700 + 700 cycles.
// For 32 bytes: ~1600 cycles. For 1KB: ~6500 cycles.

/// Hashes data of the given size and returns the first 8 bytes as a u64.
fn hashing_demo(data_size: usize) -> u64 {
    debug!("  Hashing {} bytes with blake2b...", data_size);

    // Create the data to hash (just sequential bytes)
    let mut data = alloc::vec::Vec::with_capacity(data_size);
    for i in 0..data_size {
        data.push((i & 0xFF) as u8);
    }

    // Create a blake2b hasher with CKB's personalization string.
    // The personalization ensures CKB hashes are domain-separated.
    let mut hasher = blake2b_ref::Blake2bBuilder::new(32)
        .personal(CKB_HASH_PERSONALIZATION)
        .build();

    // Feed the data into the hasher.
    // Internally, this processes data in 128-byte blocks.
    hasher.update(&data);

    // Finalize the hash. This processes any remaining partial block
    // and performs the final compression.
    let mut hash = [0u8; 32];
    hasher.finalize(&mut hash);

    // Convert first 8 bytes to u64 for a readable result
    let result = u64::from_le_bytes([
        hash[0], hash[1], hash[2], hash[3],
        hash[4], hash[5], hash[6], hash[7],
    ]);

    debug!("  Hash result (first 8 bytes as u64): {}", result);
    result
}

// ============================================================================
// Section 5: Byte Comparison
// ============================================================================
//
// Comparing byte arrays is critical for lock scripts (comparing hashes,
// verifying signatures, etc.). The cost depends on:
//   - Array length: O(n) comparison
//   - Whether arrays match: early exit on mismatch saves cycles
//
// For a 32-byte hash comparison:
//   - Best case (first byte differs): ~10 cycles
//   - Worst case (all bytes match): ~130 cycles

/// Compares two byte arrays and returns 1 if equal, 0 if not.
fn comparison_demo(size: usize) -> u64 {
    debug!("  Comparing two {}-byte arrays...", size);

    // Create two identical arrays
    let mut arr_a = alloc::vec::Vec::with_capacity(size);
    let mut arr_b = alloc::vec::Vec::with_capacity(size);
    for i in 0..size {
        arr_a.push((i & 0xFF) as u8);
        arr_b.push((i & 0xFF) as u8);
    }

    // Manual byte-by-byte comparison (how CKB scripts typically do it).
    // This compiles to a loop of load + compare + branch instructions.
    let mut equal = true;
    for i in 0..size {
        if arr_a[i] != arr_b[i] {
            equal = false;
            break; // Early exit saves cycles when arrays differ
        }
    }

    let result = if equal { 1u64 } else { 0u64 };
    debug!("  Comparison result: {} (1=equal, 0=not equal)", result);
    result
}

// ============================================================================
// Main Entry Point
// ============================================================================
//
// This function is called by CKB-VM when the script executes.
// It returns 0 for success (any non-zero value means failure).
//
// We run through all five sections, printing debug messages at each step.
// When run under ckb-debugger, you can observe the total cycle count
// reported at the end, and correlate it with the debug output.

pub fn program_entry() -> i8 {
    debug!("============================================");
    debug!("Lesson 12: CKB-VM Cycle Counting Demo");
    debug!("============================================");
    debug!("");
    debug!("This script demonstrates how different operations");
    debug!("consume different numbers of CKB-VM cycles.");
    debug!("");

    // --- Section 1: Arithmetic ---
    // Expected: Very low cycle cost (< 50 cycles for all operations)
    let arith_result = arithmetic_demo();
    debug!("");

    // --- Section 2: Loops ---
    // Expected: Cost scales linearly with iteration count.
    // 100 iterations: ~500 cycles
    // 1000 iterations: ~5000 cycles
    // 10000 iterations: ~50000 cycles
    debug!("=== Section 2: Loop Iterations ===");
    let loop_small = loop_demo(LOOP_ITERATIONS_SMALL);
    let loop_medium = loop_demo(LOOP_ITERATIONS_MEDIUM);
    let loop_large = loop_demo(LOOP_ITERATIONS_LARGE);
    debug!("  Observe: 10x more iterations = ~10x more cycles");
    debug!("");

    // --- Section 3: Memory Allocation ---
    // Expected: Cost proportional to bytes written.
    // 64 bytes: ~300 cycles
    // 1024 bytes: ~4000 cycles
    // 4096 bytes: ~16000 cycles
    debug!("=== Section 3: Memory Allocation ===");
    let alloc_small = allocation_demo(ALLOC_SIZE_SMALL);
    let alloc_medium = allocation_demo(ALLOC_SIZE_MEDIUM);
    let alloc_large = allocation_demo(ALLOC_SIZE_LARGE);
    debug!("  Observe: More bytes = proportionally more cycles");
    debug!("");

    // --- Section 4: Blake2b Hashing ---
    // Expected: ~200 base + ceil(N/128)*700 + 700 finalization cycles.
    // 32 bytes: ~1600 cycles
    // 256 bytes: ~2300 cycles
    // 1024 bytes: ~6500 cycles
    debug!("=== Section 4: Blake2b Hashing ===");
    let hash_small = hashing_demo(32);
    let hash_medium = hashing_demo(256);
    let hash_large = hashing_demo(1024);
    debug!("  Observe: Hashing cost grows with data size (128-byte blocks)");
    debug!("");

    // --- Section 5: Byte Comparison ---
    // Expected: Cost proportional to array length.
    // 32 bytes: ~130 cycles (matching arrays, worst case)
    // 256 bytes: ~1000 cycles
    // 1024 bytes: ~4000 cycles
    debug!("=== Section 5: Byte Comparison ===");
    let cmp_small = comparison_demo(32);
    let cmp_medium = comparison_demo(256);
    let cmp_large = comparison_demo(1024);
    debug!("  Observe: Comparison cost proportional to array length");
    debug!("");

    // --- Summary ---
    debug!("============================================");
    debug!("Summary of Cycle Cost Patterns:");
    debug!("============================================");
    debug!("1. Arithmetic: Cheapest (~1-5 cycles per op)");
    debug!("2. Loops: Linear scaling with iterations");
    debug!("3. Memory: Proportional to bytes read/written");
    debug!("4. Hashing: ~700 cycles per 128-byte block");
    debug!("5. Comparison: Proportional to array length");
    debug!("");
    debug!("Key Optimization Tips:");
    debug!("  - Minimize loop iterations");
    debug!("  - Avoid allocating more memory than needed");
    debug!("  - Hash only what is necessary");
    debug!("  - Use early-exit comparisons");
    debug!("============================================");

    // Use all results to prevent the compiler from optimizing them away.
    // Without this, the compiler might eliminate dead code in release builds.
    let _total = arith_result
        .wrapping_add(loop_small)
        .wrapping_add(loop_medium)
        .wrapping_add(loop_large)
        .wrapping_add(alloc_small)
        .wrapping_add(alloc_medium)
        .wrapping_add(alloc_large)
        .wrapping_add(hash_small)
        .wrapping_add(hash_medium)
        .wrapping_add(hash_large)
        .wrapping_add(cmp_small)
        .wrapping_add(cmp_medium)
        .wrapping_add(cmp_large);

    debug!("Script completed successfully. Total result: {}", _total);

    // Return 0 = success.
    // In CKB, any non-zero return from a script means the transaction is invalid.
    0
}
