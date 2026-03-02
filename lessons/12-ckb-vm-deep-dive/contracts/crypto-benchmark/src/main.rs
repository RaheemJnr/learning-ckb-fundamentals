// ============================================================================
// Lesson 12: Crypto Benchmark - Comparing Cryptographic Operations in CKB-VM
// ============================================================================
//
// This script demonstrates CKB's "cryptographic freedom" — the ability to
// use any cryptographic algorithm on-chain, not just the ones hardcoded into
// the protocol.
//
// WHY CRYPTOGRAPHIC FREEDOM MATTERS:
//
//   Most blockchains hardcode their cryptographic primitives:
//     - Bitcoin: SHA-256 + secp256k1 ECDSA
//     - Ethereum: keccak256 + secp256k1 ECDSA (via ecrecover precompile)
//
//   If you want to use a different algorithm (e.g., ed25519, BLS, RSA,
//   or a post-quantum scheme), you either cannot, or you pay enormous gas
//   costs to implement it in the EVM.
//
//   CKB takes a different approach: since CKB-VM executes general-purpose
//   RISC-V code, ANY algorithm that can be compiled to RISC-V runs natively.
//   There is no special "precompile" needed — just compile your crypto
//   library to RISC-V and deploy it.
//
//   This enables:
//     - Passkey/WebAuthn authentication (secp256r1)
//     - Bitcoin Schnorr signatures
//     - Ed25519 (used by Solana, Sui, etc.)
//     - BLS signatures (used by Ethereum 2.0 consensus)
//     - RSA (for legacy system integration)
//     - Post-quantum algorithms (Dilithium, Kyber, etc.)
//
// WHAT THIS SCRIPT DEMONSTRATES:
//
//   1. Blake2b-256 hashing (CKB's default hash function)
//   2. SHA-256 hashing (manual implementation for comparison)
//   3. How to think about cycle costs for different crypto operations
//
//   When run under ckb-debugger, you can observe that blake2b is more
//   efficient because CKB's blake2b-ref library is optimized for RISC-V,
//   while our SHA-256 implementation runs in pure software.
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

extern crate alloc;

use ckb_std::debug;

// ============================================================================
// CKB Blake2b Personalization
// ============================================================================
const CKB_HASH_PERSONALIZATION: &[u8] = b"ckb-default-hash";

// ============================================================================
// Section 1: Blake2b-256 Hashing
// ============================================================================
//
// Blake2b is CKB's native hash function. It was chosen for several reasons:
//   - Faster than SHA-256 in software (no need for hardware acceleration)
//   - More secure margin than SHA-256 (no length extension attacks)
//   - Configurable output length (1 to 64 bytes)
//   - Built-in personalization (domain separation)
//   - Used throughout CKB: script hashes, tx hashes, block hashes
//
// The blake2b-ref crate is optimized for the RISC-V target, making it
// the most efficient hash function available in CKB-VM.

/// Compute blake2b-256 hash of the given data.
/// Returns the 32-byte hash.
fn blake2b_256(data: &[u8]) -> [u8; 32] {
    let mut hash = [0u8; 32];
    let mut hasher = blake2b_ref::Blake2bBuilder::new(32)
        .personal(CKB_HASH_PERSONALIZATION)
        .build();
    hasher.update(data);
    hasher.finalize(&mut hash);
    hash
}

/// Benchmark blake2b at various data sizes.
/// Prints the hash result and allows cycle measurement via ckb-debugger.
fn benchmark_blake2b() {
    debug!("=== Blake2b-256 Benchmark ===");
    debug!("Blake2b is CKB's native hash function.");
    debug!("It processes data in 128-byte blocks.");
    debug!("");

    // Test 1: Small data (32 bytes) - typical for hashing a hash
    let small_data = [0x42u8; 32];
    let hash_small = blake2b_256(&small_data);
    debug!("  32 bytes:  hash[0..4] = {:02x}{:02x}{:02x}{:02x}",
        hash_small[0], hash_small[1], hash_small[2], hash_small[3]);

    // Test 2: Medium data (256 bytes) - typical for hashing a witness
    let medium_data = [0x42u8; 256];
    let hash_medium = blake2b_256(&medium_data);
    debug!("  256 bytes: hash[0..4] = {:02x}{:02x}{:02x}{:02x}",
        hash_medium[0], hash_medium[1], hash_medium[2], hash_medium[3]);

    // Test 3: Large data (1024 bytes) - typical for hashing cell data
    let large_data = [0x42u8; 1024];
    let hash_large = blake2b_256(&large_data);
    debug!("  1024 bytes: hash[0..4] = {:02x}{:02x}{:02x}{:02x}",
        hash_large[0], hash_large[1], hash_large[2], hash_large[3]);

    // Test 4: Multiple rounds of hashing (hash chaining)
    // This is common in Merkle tree constructions.
    debug!("");
    debug!("  Hash chaining (10 rounds of blake2b on 32 bytes):");
    let mut chain_data = [0u8; 32];
    for round in 0..10 {
        chain_data = blake2b_256(&chain_data);
        if round == 0 || round == 4 || round == 9 {
            debug!("    Round {}: hash[0..4] = {:02x}{:02x}{:02x}{:02x}",
                round, chain_data[0], chain_data[1], chain_data[2], chain_data[3]);
        }
    }

    debug!("  Blake2b benchmark complete.");
    debug!("");
}

// ============================================================================
// Section 2: SHA-256 (Manual Implementation)
// ============================================================================
//
// SHA-256 is the hash function used by Bitcoin and widely used in TLS, SSH,
// and other internet protocols. CKB does not provide a built-in SHA-256
// syscall, but because CKB-VM runs general-purpose RISC-V code, we can
// implement SHA-256 entirely in software.
//
// This demonstrates CKB's flexibility: any algorithm that can be written
// in Rust (or C, or any RISC-V-targeting language) can run on-chain.
//
// IMPORTANT: This is a simplified, educational SHA-256 implementation.
// In production, you would use a well-audited crate compiled to RISC-V.
//
// SHA-256 processes data in 64-byte (512-bit) blocks, compared to blake2b's
// 128-byte blocks. Each block requires 64 rounds of compression.

/// SHA-256 initial hash values (first 32 bits of the fractional parts
/// of the square roots of the first 8 primes).
const SHA256_H: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/// SHA-256 round constants (first 32 bits of the fractional parts
/// of the cube roots of the first 64 primes).
const SHA256_K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/// Compute SHA-256 hash of the given data.
///
/// This is a straightforward implementation following FIPS 180-4.
/// In CKB-VM, each of the 64 rounds per block involves several
/// rotations, additions, and logical operations — making SHA-256
/// more cycle-expensive than blake2b for the same data size.
fn sha256(data: &[u8]) -> [u8; 32] {
    // Initialize hash state with the standard initial values
    let mut h = SHA256_H;

    // --- Padding ---
    // SHA-256 requires the message to be padded to a multiple of 64 bytes:
    //   1. Append a single 0x80 byte
    //   2. Append zero bytes until length = 56 mod 64
    //   3. Append the original message length in bits as a 64-bit big-endian integer
    let msg_len_bits = (data.len() as u64) * 8;
    let mut padded = alloc::vec::Vec::with_capacity(data.len() + 72);
    padded.extend_from_slice(data);
    padded.push(0x80);

    // Pad with zeros until we are 8 bytes short of a 64-byte boundary
    while padded.len() % 64 != 56 {
        padded.push(0x00);
    }

    // Append the message length in bits as big-endian u64
    padded.extend_from_slice(&msg_len_bits.to_be_bytes());

    // --- Process each 64-byte block ---
    for chunk in padded.chunks(64) {
        // Prepare the message schedule (W[0..63])
        let mut w = [0u32; 64];

        // W[0..15]: direct from the block (big-endian u32s)
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }

        // W[16..63]: derived from previous W values using sigma functions
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        // Initialize working variables
        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        // 64 rounds of compression
        // Each round: 2 rotations + several XOR/AND/additions = ~20 RISC-V instructions
        // Total per block: ~1280 instructions = ~2000+ cycles
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(SHA256_K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        // Add the compressed chunk to the running hash
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    // Produce the final 32-byte hash (big-endian)
    let mut result = [0u8; 32];
    for i in 0..8 {
        result[i * 4..i * 4 + 4].copy_from_slice(&h[i].to_be_bytes());
    }
    result
}

/// Benchmark SHA-256 at various data sizes.
fn benchmark_sha256() {
    debug!("=== SHA-256 Benchmark ===");
    debug!("SHA-256 is Bitcoin's hash function, implemented here in software.");
    debug!("It processes data in 64-byte blocks (vs blake2b's 128-byte blocks).");
    debug!("");

    // Test 1: Small data (32 bytes)
    let small_data = [0x42u8; 32];
    let hash_small = sha256(&small_data);
    debug!("  32 bytes:  hash[0..4] = {:02x}{:02x}{:02x}{:02x}",
        hash_small[0], hash_small[1], hash_small[2], hash_small[3]);

    // Test 2: Medium data (256 bytes)
    let medium_data = [0x42u8; 256];
    let hash_medium = sha256(&medium_data);
    debug!("  256 bytes: hash[0..4] = {:02x}{:02x}{:02x}{:02x}",
        hash_medium[0], hash_medium[1], hash_medium[2], hash_medium[3]);

    // Test 3: Large data (1024 bytes)
    let large_data = [0x42u8; 1024];
    let hash_large = sha256(&large_data);
    debug!("  1024 bytes: hash[0..4] = {:02x}{:02x}{:02x}{:02x}",
        hash_large[0], hash_large[1], hash_large[2], hash_large[3]);

    debug!("  SHA-256 benchmark complete.");
    debug!("");

    // Use results to prevent optimization
    let _ = (hash_small, hash_medium, hash_large);
}

// ============================================================================
// Section 3: Comparing Blake2b vs SHA-256
// ============================================================================
//
// When run under ckb-debugger, you will observe that blake2b is significantly
// faster than our SHA-256 implementation. This is because:
//
//   1. Blake2b was designed for software efficiency (fewer rounds, simpler ops)
//   2. The blake2b-ref crate is optimized for RISC-V
//   3. SHA-256 was designed with hardware acceleration in mind (SHA-NI on x86)
//      but RISC-V has no SHA-256 hardware support
//   4. Blake2b uses 128-byte blocks vs SHA-256's 64-byte blocks (fewer blocks)
//
// In practice, this means CKB scripts that use blake2b will consume fewer
// cycles and be cheaper to execute than scripts using SHA-256.
//
// However, the point is not that blake2b is "better" — the point is that
// CKB gives you the CHOICE. If your application requires SHA-256 (e.g., for
// Bitcoin interoperability), you can use it. If it requires ed25519 (e.g.,
// for Solana interoperability), you can implement that too.

/// Run a side-by-side comparison of blake2b and SHA-256.
fn compare_hash_functions() {
    debug!("=== Hash Function Comparison ===");
    debug!("");

    // Hash the same data with both functions
    let test_data = [0xAB; 64];

    debug!("  Hashing 64 bytes with both algorithms:");

    // Blake2b
    let blake2b_result = blake2b_256(&test_data);
    debug!("    Blake2b: {:02x}{:02x}{:02x}{:02x}...",
        blake2b_result[0], blake2b_result[1], blake2b_result[2], blake2b_result[3]);

    // SHA-256
    let sha256_result = sha256(&test_data);
    debug!("    SHA-256: {:02x}{:02x}{:02x}{:02x}...",
        sha256_result[0], sha256_result[1], sha256_result[2], sha256_result[3]);

    debug!("");
    debug!("  Both produce 32-byte (256-bit) hashes.");
    debug!("  Blake2b uses fewer cycles due to software-optimized design.");
    debug!("  SHA-256 is available when Bitcoin interop is needed.");
    debug!("");

    // Demonstrate that different algorithms produce different hashes
    // of the same data (as expected — they are different functions).
    let mut same = true;
    for i in 0..32 {
        if blake2b_result[i] != sha256_result[i] {
            same = false;
            break;
        }
    }
    debug!("  Same output? {} (expected: no — different algorithms)", if same { "yes" } else { "no" });
    debug!("");
}

// ============================================================================
// Section 4: Secp256k1 and CKB's Approach to Signature Verification
// ============================================================================
//
// CKB handles signature verification differently from other blockchains:
//
//   1. CKB does NOT have built-in opcodes for signature verification
//   2. Instead, signature algorithms are implemented as regular scripts
//   3. The default secp256k1 lock script is deployed as a system cell
//   4. Any script can implement any signature scheme
//
// The default secp256k1-blake160 lock script:
//   - Takes a 20-byte blake160 hash of a public key in the script args
//   - Reads the signature from the transaction witness
//   - Verifies the secp256k1 ECDSA signature against the transaction hash
//   - Returns 0 (success) if the signature is valid
//
// Because this is a regular script (not a VM opcode), you can deploy
// alternative lock scripts that use different signature schemes:
//   - secp256r1 (for WebAuthn/Passkeys)
//   - ed25519 (for Solana-style keys)
//   - Schnorr (for Bitcoin Taproot-style keys)
//   - BLS (for aggregated signatures)
//   - RSA (for legacy systems)
//   - Multisig (M-of-N verification)
//
// This is what makes Omnilock possible: a single lock script that supports
// multiple authentication methods.

/// Demonstrate the concept of CKB's signature verification model.
/// We cannot actually verify a real signature here without proper
/// transaction context, but we show the conceptual flow.
fn signature_verification_concept() {
    debug!("=== Signature Verification in CKB ===");
    debug!("");
    debug!("  CKB does NOT have built-in signature opcodes.");
    debug!("  Instead, signatures are verified by regular scripts:");
    debug!("");
    debug!("  1. The lock script loads the public key hash from script args");
    debug!("  2. It loads the signature from the witness");
    debug!("  3. It loads the transaction hash via the load_tx_hash syscall");
    debug!("  4. It runs the signature algorithm (e.g., secp256k1 ECDSA)");
    debug!("  5. It returns 0 if valid, non-zero if invalid");
    debug!("");
    debug!("  This means you can use ANY signature algorithm on CKB!");
    debug!("");

    // Demonstrate loading the transaction hash via syscall.
    // In a real script, this would be used as the message for
    // signature verification.
    debug!("  Typical cycle costs for signature verification:");
    debug!("    secp256k1 ECDSA:   ~1.2M cycles (via optimized C library)");
    debug!("    secp256r1 ECDSA:   ~3.0M cycles (WebAuthn/Passkeys)");
    debug!("    ed25519:           ~2.5M cycles");
    debug!("    Schnorr:           ~1.5M cycles");
    debug!("    RSA-2048:          ~5.0M cycles");
    debug!("    blake2b (32 bytes): ~1,600 cycles (for comparison)");
    debug!("");
    debug!("  The cycle limit per transaction is ~70 billion cycles,");
    debug!("  so even expensive operations fit comfortably.");
    debug!("");
}

// ============================================================================
// Section 5: Multi-language Support
// ============================================================================
//
// Because CKB-VM executes RISC-V machine code, any programming language
// that can compile to the RISC-V target can be used to write CKB scripts:
//
//   - Rust (most popular, via ckb-std)
//   - C/C++ (via riscv-gcc or clang)
//   - Go (via TinyGo or custom RISC-V backend)
//   - Zig (native RISC-V support)
//   - AssemblyScript (via WebAssembly-to-RISC-V compilation)
//   - JavaScript (via embedded JS engine compiled to RISC-V)
//   - Lua (via embedded Lua interpreter compiled to RISC-V)
//
// Rust is the most popular choice because:
//   - Excellent RISC-V support
//   - no_std ecosystem for bare-metal development
//   - Zero-cost abstractions
//   - Strong type system catches bugs at compile time
//   - ckb-std provides ergonomic bindings to CKB syscalls

fn language_support_info() {
    debug!("=== Multi-Language Support ===");
    debug!("");
    debug!("  CKB-VM runs RISC-V machine code, so any language");
    debug!("  that compiles to RISC-V can be used:");
    debug!("");
    debug!("  - Rust   (most popular, via ckb-std)");
    debug!("  - C/C++  (via riscv-gcc or clang)");
    debug!("  - Zig    (native RISC-V support)");
    debug!("  - Go     (via TinyGo)");
    debug!("");
    debug!("  The CKB-VM only sees RISC-V instructions.");
    debug!("  It does not know or care what language generated them.");
    debug!("");
}

// ============================================================================
// Main Entry Point
// ============================================================================

pub fn program_entry() -> i8 {
    debug!("============================================");
    debug!("Lesson 12: CKB Crypto Benchmark");
    debug!("============================================");
    debug!("");
    debug!("This script compares cryptographic operations");
    debug!("to demonstrate CKB's cryptographic freedom.");
    debug!("");

    // Run all benchmarks
    benchmark_blake2b();
    benchmark_sha256();
    compare_hash_functions();
    signature_verification_concept();
    language_support_info();

    debug!("============================================");
    debug!("Key Takeaways:");
    debug!("============================================");
    debug!("1. CKB-VM can run ANY crypto algorithm");
    debug!("2. Blake2b is cheapest (native to CKB)");
    debug!("3. SHA-256 works but costs more cycles");
    debug!("4. Signature verification is done by scripts, not opcodes");
    debug!("5. Any RISC-V-targeting language can write CKB scripts");
    debug!("============================================");

    // Return success
    0
}
