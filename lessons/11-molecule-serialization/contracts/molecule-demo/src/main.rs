// ============================================================================
// Lesson 11: Molecule Serialization — On-Chain Script Demo
// ============================================================================
//
// This CKB script demonstrates how to read and validate molecule-encoded data
// stored in cells. In CKB, ALL on-chain data structures use molecule encoding:
// scripts, cell outputs, transactions, and any custom data you store in cells.
//
// This script acts as a TYPE SCRIPT that validates the data stored in cells.
// When attached to a cell, it ensures the cell data conforms to the expected
// molecule schema (in this case, a TokenInfo struct).
//
// IMPORTANT: This is a demonstration script for learning. A production token
// script would include much more validation (authorization, supply checks, etc.)
//
// ============================================================================

// CKB scripts run in a no_std environment (CKB-VM, a RISC-V virtual machine).
// There is no operating system, no heap allocator by default, and no standard
// library. We use ckb_std to interact with the VM.
#![no_std]
#![no_main]

// ============================================================================
// Imports
// ============================================================================

// ckb_std provides the runtime environment for CKB scripts
use ckb_std::{
    // Entry point macro — defines the script's main function
    default_alloc,
    entry,
    // Syscalls for reading data from the CKB-VM environment
    syscalls,
    // High-level wrappers around syscalls
    high_level,
    // Constants for specifying which cells/data to load
    ckb_constants::Source,
    // Debug output (only visible during development, stripped in production)
    debug,
};

// molecule provides the core traits and types for working with molecule data.
// The `prelude` module imports everything you typically need.
use molecule::prelude::*;

// ckb_types contains pre-generated Rust types for CKB's built-in molecule schemas.
// These correspond to the types defined in blockchain.mol (Script, CellOutput, etc.)
use ckb_types::{
    packed::{Script, Byte32, Bytes as PackedBytes},
    prelude::*,
};

// ============================================================================
// Memory Allocator
// ============================================================================
// CKB scripts need a memory allocator for any heap allocations. ckb_std provides
// a simple bump allocator suitable for the constrained CKB-VM environment.
// The parameters are: (heap_size, entry_function)
default_alloc!(4 * 1024, entry);

// ============================================================================
// Constants
// ============================================================================

// TokenInfo struct layout (matches our custom.mol schema):
//   name:         Byte32  = 32 bytes (offset 0..32)
//   symbol:       Byte32  = 32 bytes (offset 32..64)
//   decimals:     byte    =  1 byte  (offset 64)
//   total_supply: Uint128 = 16 bytes (offset 65..81)
//   TOTAL                 = 81 bytes
//
// Because TokenInfo is a molecule STRUCT (all fixed-size fields), there is no
// length prefix or offset table. The data is exactly 81 bytes, always.
const TOKEN_INFO_SIZE: usize = 81;
const NAME_OFFSET: usize = 0;
const NAME_SIZE: usize = 32;
const SYMBOL_OFFSET: usize = 32;
const SYMBOL_SIZE: usize = 32;
const DECIMALS_OFFSET: usize = 64;
const TOTAL_SUPPLY_OFFSET: usize = 65;
const TOTAL_SUPPLY_SIZE: usize = 16;

// Maximum allowed decimal places (sanity check)
const MAX_DECIMALS: u8 = 38;

// ============================================================================
// Entry Point
// ============================================================================
// The `entry!` macro defines the script's entry point. CKB-VM calls this
// function when the script is executed. The return value is an i8:
//   0  = success (validation passed)
//   != 0 = failure (validation failed, transaction is rejected)

fn entry() -> i8 {
    match main() {
        Ok(()) => 0,
        Err(e) => e as i8,
    }
}

// ============================================================================
// Error Codes
// ============================================================================
// CKB scripts communicate errors through non-zero return codes. By convention,
// codes below -100 are reserved for system errors. We define application-level
// errors starting from 5 to avoid conflicts.

#[repr(i8)]
enum Error {
    // Generic error loading data from the VM
    LoadDataFailed = 5,
    // Cell data is not exactly TOKEN_INFO_SIZE bytes
    InvalidDataLength = 6,
    // The decimals field exceeds MAX_DECIMALS
    InvalidDecimals = 7,
    // The total supply is zero (doesn't make sense for a token)
    ZeroTotalSupply = 8,
    // The name field is empty (all zeros)
    EmptyName = 9,
    // The symbol field is empty (all zeros)
    EmptySymbol = 10,
    // Error reading script's own arguments
    LoadScriptFailed = 11,
}

// ============================================================================
// Main Logic
// ============================================================================

fn main() -> Result<(), Error> {
    // ========================================================================
    // Step 1: Load our own script (to read args if needed)
    // ========================================================================
    // Every CKB script can inspect its own Script structure. This is useful
    // for reading configuration passed via the `args` field.
    //
    // The Script type is a molecule TABLE with this schema:
    //   table Script {
    //       code_hash: Byte32,   // Identifies the script's code
    //       hash_type: byte,     // How code_hash is interpreted
    //       args:      Bytes,    // Arguments passed to the script
    //   }

    let script = high_level::load_script().map_err(|_| Error::LoadScriptFailed)?;

    // Demonstrate reading fields from the Script molecule type.
    // Script is a TABLE, so we use accessor methods generated by moleculec.
    let code_hash: Byte32 = script.code_hash();
    let hash_type: u8 = script.hash_type().into();
    let args: PackedBytes = script.args();

    debug!(
        "Script loaded: code_hash={}, hash_type={}, args_len={}",
        code_hash,
        hash_type,
        args.len()
    );

    // ========================================================================
    // Step 2: Determine what we are validating
    // ========================================================================
    // As a TYPE SCRIPT, we are invoked for every cell in the transaction that
    // has our script as its type. We need to check:
    //   - GroupOutput cells (cells being CREATED with our type script)
    //   - GroupInput cells (cells being CONSUMED with our type script)
    //
    // For this demo, we validate all output cells in our script group.

    // Count how many output cells belong to our script group
    let mut output_index: usize = 0;

    loop {
        // Try to load cell data for the next output in our group.
        // Source::GroupOutput means "outputs that have the same type script as me".
        let cell_data = match high_level::load_cell_data(output_index, Source::GroupOutput) {
            Ok(data) => data,
            Err(_) => {
                // No more outputs in our group — we've validated them all
                break;
            }
        };

        debug!(
            "Validating output cell {} (data length: {} bytes)",
            output_index,
            cell_data.len()
        );

        // ====================================================================
        // Step 3: Validate the molecule-encoded data
        // ====================================================================
        // Since TokenInfo is a STRUCT, validation is straightforward: we just
        // need to check the data length. Structs are fixed-size, so if the
        // length matches, the layout is guaranteed to be correct.
        //
        // For TABLEs, validation is more complex: you need to verify the
        // offset table, check that all offsets are in bounds, and ensure
        // the total size matches the first 4 bytes.

        if cell_data.len() != TOKEN_INFO_SIZE {
            debug!(
                "ERROR: Expected {} bytes, got {}",
                TOKEN_INFO_SIZE,
                cell_data.len()
            );
            return Err(Error::InvalidDataLength);
        }

        // ====================================================================
        // Step 4: Read individual fields using zero-copy access
        // ====================================================================
        // This is the beauty of molecule structs: we can read any field by
        // simply slicing into the byte buffer at the known offset. No parsing,
        // no deserialization, no memory allocation needed.
        //
        // This is "zero-copy" access — we read directly from the raw bytes.

        // --- Read the name field (bytes 0..32) ---
        let name_bytes = &cell_data[NAME_OFFSET..NAME_OFFSET + NAME_SIZE];

        // Check that the name is not all zeros
        if name_bytes.iter().all(|&b| b == 0) {
            debug!("ERROR: Token name is empty (all zeros)");
            return Err(Error::EmptyName);
        }

        // Find the actual length (exclude trailing zeros for display)
        let name_len = name_bytes.iter().rposition(|&b| b != 0).map_or(0, |i| i + 1);
        debug!("Token name: {} bytes (non-zero)", name_len);

        // --- Read the symbol field (bytes 32..64) ---
        let symbol_bytes = &cell_data[SYMBOL_OFFSET..SYMBOL_OFFSET + SYMBOL_SIZE];

        if symbol_bytes.iter().all(|&b| b == 0) {
            debug!("ERROR: Token symbol is empty (all zeros)");
            return Err(Error::EmptySymbol);
        }

        let symbol_len = symbol_bytes
            .iter()
            .rposition(|&b| b != 0)
            .map_or(0, |i| i + 1);
        debug!("Token symbol: {} bytes (non-zero)", symbol_len);

        // --- Read the decimals field (byte 64) ---
        let decimals = cell_data[DECIMALS_OFFSET];
        debug!("Token decimals: {}", decimals);

        if decimals > MAX_DECIMALS {
            debug!(
                "ERROR: Decimals {} exceeds maximum {}",
                decimals, MAX_DECIMALS
            );
            return Err(Error::InvalidDecimals);
        }

        // --- Read the total_supply field (bytes 65..81) ---
        // This is a Uint128 stored as 16 bytes in little-endian order.
        // We convert it to a u128 for validation.
        let supply_bytes = &cell_data[TOTAL_SUPPLY_OFFSET..TOTAL_SUPPLY_OFFSET + TOTAL_SUPPLY_SIZE];
        let total_supply = u128::from_le_bytes(
            supply_bytes.try_into().expect("slice is exactly 16 bytes"),
        );

        debug!("Token total supply: {}", total_supply);

        if total_supply == 0 {
            debug!("ERROR: Total supply is zero");
            return Err(Error::ZeroTotalSupply);
        }

        // ====================================================================
        // Step 5: Additional validation examples
        // ====================================================================

        // Demonstrate reading the cell's capacity (from the CellOutput molecule type).
        // CellOutput is a TABLE:
        //   table CellOutput {
        //       capacity: Uint64,
        //       lock:     Script,
        //       type_:    ScriptOpt,
        //   }
        //
        // We use the high-level API which handles molecule deserialization for us.
        let capacity = high_level::load_cell_capacity(output_index, Source::GroupOutput)
            .map_err(|_| Error::LoadDataFailed)?;

        debug!(
            "Cell capacity: {} shannons ({} CKB)",
            capacity,
            capacity / 100_000_000
        );

        // The minimum capacity for a cell with our TokenInfo data:
        // Base: 8 (capacity) + 32 (lock code_hash) + 1 (lock hash_type) + 4 (lock args length)
        //       + lock_args_length
        //       + 32 (type code_hash) + 1 (type hash_type) + 4 (type args length)
        //       + type_args_length
        //       + data_length (81 for TokenInfo)
        // This varies based on script args, but the cell must hold at least its own data.

        debug!(
            "Output cell {} validated successfully!",
            output_index
        );

        output_index += 1;
    }

    // ========================================================================
    // Step 6: Validate input cells (cells being consumed)
    // ========================================================================
    // For a simple demo, we also read input cells to demonstrate molecule
    // deserialization from inputs. In a real token script, you would compare
    // input totals vs output totals to enforce conservation rules.

    let mut input_index: usize = 0;
    let mut total_input_supply: u128 = 0;
    let mut total_output_supply: u128 = 0;

    // Sum total_supply from all input cells in our group
    loop {
        let cell_data = match high_level::load_cell_data(input_index, Source::GroupInput) {
            Ok(data) => data,
            Err(_) => break,
        };

        if cell_data.len() == TOKEN_INFO_SIZE {
            let supply_bytes =
                &cell_data[TOTAL_SUPPLY_OFFSET..TOTAL_SUPPLY_OFFSET + TOTAL_SUPPLY_SIZE];
            let supply = u128::from_le_bytes(
                supply_bytes.try_into().expect("slice is exactly 16 bytes"),
            );
            total_input_supply += supply;
        }

        input_index += 1;
    }

    // Sum total_supply from all output cells in our group
    let mut out_idx: usize = 0;
    loop {
        let cell_data = match high_level::load_cell_data(out_idx, Source::GroupOutput) {
            Ok(data) => data,
            Err(_) => break,
        };

        if cell_data.len() == TOKEN_INFO_SIZE {
            let supply_bytes =
                &cell_data[TOTAL_SUPPLY_OFFSET..TOTAL_SUPPLY_OFFSET + TOTAL_SUPPLY_SIZE];
            let supply = u128::from_le_bytes(
                supply_bytes.try_into().expect("slice is exactly 16 bytes"),
            );
            total_output_supply += supply;
        }

        out_idx += 1;
    }

    debug!(
        "Supply check: inputs={}, outputs={}",
        total_input_supply, total_output_supply
    );

    // In a real token script, you would enforce:
    // total_output_supply <= total_input_supply (no minting without authorization)
    // For this demo, we just log the values.

    debug!("All validations passed!");
    Ok(())
}
