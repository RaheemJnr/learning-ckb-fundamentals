// ============================================================================
// Lesson 12: CKB-VM Deep Dive — VM Analysis and Cycle Exploration
// ============================================================================
//
// This script provides an interactive exploration of the CKB-VM (CKB Virtual
// Machine) — the RISC-V execution engine that powers all on-chain scripts
// in the Nervos CKB blockchain.
//
// WHAT IS CKB-VM?
//
//   CKB-VM is a virtual machine that executes RISC-V machine code inside a
//   deterministic sandbox. Every CKB script — whether it is a lock script
//   (controlling who can spend a cell) or a type script (controlling how a
//   cell can be created/updated) — is a RISC-V binary that runs inside
//   CKB-VM.
//
//   Key properties:
//     1. RISC-V rv64imc ISA (64-bit base integer + multiply + compressed)
//     2. Fully deterministic (same input always produces same output)
//     3. Sandboxed (no filesystem, no network, no I/O except syscalls)
//     4. Cycle-metered (every instruction has a cycle cost)
//     5. Memory-limited (4MB default)
//
// WHY RISC-V?
//
//   CKB chose RISC-V over other ISAs (x86, ARM, WASM) for several reasons:
//
//   1. Open Standard: RISC-V is an open instruction set architecture (ISA)
//      maintained by RISC-V International. Unlike x86 (Intel/AMD proprietary)
//      or ARM (licensed), anyone can implement RISC-V without fees or patents.
//
//   2. Simplicity: The base ISA (RV64I) has only ~47 instructions. This makes
//      the VM implementation small, auditable, and easy to formally verify.
//      Compare: x86-64 has thousands of instructions.
//
//   3. Determinism: RISC-V has no undefined behavior at the ISA level. Every
//      instruction has a precise specification, making it ideal for consensus-
//      critical computation where all nodes must produce identical results.
//
//   4. Mature Toolchain: GCC and LLVM both support RISC-V as a first-class
//      target. Rust, C, C++, Go (TinyGo), and Zig can all compile to RISC-V.
//
//   5. Hardware Future: RISC-V is rapidly gaining adoption in real hardware
//      (SiFive, Alibaba T-Head, etc.). Future CKB nodes could potentially
//      run scripts on native RISC-V hardware for near-zero overhead.
//
//   6. Extensions: The modular extension system (M for multiply, C for
//      compressed instructions, etc.) allows CKB to use exactly the features
//      needed without unnecessary complexity.
//
// WHAT THIS SCRIPT COVERS:
//
//   1. RISC-V architecture overview
//   2. CKB-VM execution model
//   3. Syscall reference (how scripts interact with the chain)
//   4. Cycle counting and estimation
//   5. Reading cycle information from the chain
//   6. Optimization strategies
//
// ============================================================================

import { ccc } from "@ckb-ccc/core";

// ============================================================================
// Section 1: RISC-V Architecture Overview
// ============================================================================
//
// CKB-VM implements the rv64imc variant of RISC-V:
//
//   rv64 = 64-bit registers and address space
//   i    = Base Integer instructions (arithmetic, logic, branches, loads/stores)
//   m    = Multiply/Divide extension (MUL, DIV, REM instructions)
//   c    = Compressed instructions (16-bit encodings for common instructions)
//
// The "c" extension is particularly important for CKB because it reduces
// binary size by ~25-30%. Since CKB scripts are stored on-chain and occupy
// cell capacity (which costs CKB), smaller binaries save real money.

/**
 * Prints an overview of the RISC-V architecture as used by CKB-VM.
 *
 * This function is purely educational — it does not interact with the chain.
 * It documents the registers, instruction categories, and extensions that
 * CKB-VM supports.
 */
function printRiscVOverview(): void {
  console.log("=".repeat(70));
  console.log("  RISC-V Architecture Overview (rv64imc)");
  console.log("=".repeat(70));
  console.log("");

  // --- Registers ---
  // RISC-V has 32 general-purpose 64-bit registers (x0-x31).
  // x0 is hardwired to zero (reads always return 0, writes are ignored).
  // This simplifies instruction encoding and common patterns.
  console.log("  Registers (32 general-purpose, 64-bit each):");
  console.log("  -----------------------------------------------");

  const registers = [
    { name: "x0  (zero)", desc: "Hardwired to 0 (reads always return 0)" },
    { name: "x1  (ra)  ", desc: "Return address (set by JAL/JALR)" },
    { name: "x2  (sp)  ", desc: "Stack pointer" },
    { name: "x3  (gp)  ", desc: "Global pointer" },
    { name: "x4  (tp)  ", desc: "Thread pointer (unused in CKB-VM)" },
    { name: "x5  (t0)  ", desc: "Temporary register 0" },
    { name: "x6  (t1)  ", desc: "Temporary register 1" },
    { name: "x7  (t2)  ", desc: "Temporary register 2" },
    { name: "x8  (s0/fp)", desc: "Saved register 0 / frame pointer" },
    { name: "x9  (s1)  ", desc: "Saved register 1" },
    { name: "x10 (a0)  ", desc: "Function arg 0 / return value 0" },
    { name: "x11 (a1)  ", desc: "Function arg 1 / return value 1" },
    { name: "x12-x17   ", desc: "Function arguments 2-7 (a2-a7)" },
    { name: "x18-x27   ", desc: "Saved registers 2-11 (s2-s11)" },
    { name: "x28-x31   ", desc: "Temporary registers 3-6 (t3-t6)" },
  ];

  for (const reg of registers) {
    console.log(`    ${reg.name}  ${reg.desc}`);
  }

  console.log("");

  // --- Instruction Categories ---
  // The base integer ISA (RV64I) provides ~47 instructions organized into
  // categories. Each category corresponds to specific RISC-V instruction
  // formats (R-type, I-type, S-type, B-type, U-type, J-type).
  console.log("  Instruction Categories:");
  console.log("  -----------------------------------------------");

  const categories = [
    {
      name: "Arithmetic",
      instructions: "ADD, SUB, ADDI, ADDW, SUBW",
      cycles: "1 cycle each",
    },
    {
      name: "Logic",
      instructions: "AND, OR, XOR, ANDI, ORI, XORI",
      cycles: "1 cycle each",
    },
    {
      name: "Shift",
      instructions: "SLL, SRL, SRA, SLLI, SRLI, SRAI",
      cycles: "1 cycle each",
    },
    {
      name: "Compare",
      instructions: "SLT, SLTU, SLTI, SLTIU",
      cycles: "1 cycle each",
    },
    {
      name: "Load",
      instructions: "LB, LH, LW, LD, LBU, LHU, LWU",
      cycles: "3 cycles each",
    },
    {
      name: "Store",
      instructions: "SB, SH, SW, SD",
      cycles: "3 cycles each",
    },
    {
      name: "Branch",
      instructions: "BEQ, BNE, BLT, BGE, BLTU, BGEU",
      cycles: "3 cycles each",
    },
    {
      name: "Jump",
      instructions: "JAL, JALR",
      cycles: "3 cycles each",
    },
    {
      name: "Upper Imm",
      instructions: "LUI, AUIPC",
      cycles: "1 cycle each",
    },
    {
      name: "Multiply (M ext)",
      instructions: "MUL, MULH, MULHSU, MULHU, DIV, DIVU, REM, REMU",
      cycles: "5 cycles each",
    },
    {
      name: "System",
      instructions: "ECALL (syscall), EBREAK (debugger)",
      cycles: "varies (syscall-dependent)",
    },
  ];

  for (const cat of categories) {
    console.log(`    ${cat.name.padEnd(18)} ${cat.instructions}`);
    console.log(`    ${"".padEnd(18)} Cost: ${cat.cycles}`);
  }

  console.log("");

  // --- Compressed Extension (C) ---
  // The C extension provides 16-bit encodings for the most common
  // instructions. This is transparent to the programmer — the assembler
  // automatically uses compressed instructions when possible.
  console.log("  Compressed Extension (C):");
  console.log("  -----------------------------------------------");
  console.log("    16-bit encodings for common instructions.");
  console.log("    Reduces binary size by ~25-30%.");
  console.log("    Examples: C.ADD, C.LW, C.SW, C.BEQZ, C.J, C.LI");
  console.log("    Transparent to the programmer (compiler handles it).");
  console.log("    Critical for CKB: smaller binaries = less capacity cost.");
  console.log("");
}

// ============================================================================
// Section 2: CKB-VM Execution Model
// ============================================================================
//
// When a CKB transaction is submitted, the following happens:
//
//   1. The node validates the transaction structure
//   2. For each input cell, the node loads and executes its lock script
//   3. For each output cell with a type script, the node executes it
//   4. For each input cell with a type script, the node executes it
//   5. All scripts must return 0 (success) for the transaction to be valid
//
// Each script execution creates a fresh CKB-VM instance with:
//   - The script binary loaded at the entry point
//   - 4MB of memory (configurable)
//   - Access to syscalls for reading transaction data
//   - A cycle counter that increments with each instruction
//   - A maximum cycle limit (shared across all scripts in the transaction)

/**
 * Prints a detailed explanation of the CKB-VM execution model.
 */
function printExecutionModel(): void {
  console.log("=".repeat(70));
  console.log("  CKB-VM Execution Model");
  console.log("=".repeat(70));
  console.log("");

  console.log("  Transaction Validation Flow:");
  console.log("  -----------------------------------------------");
  console.log("  1. Transaction arrives at a CKB node");
  console.log("  2. Node validates structure (inputs, outputs, deps)");
  console.log("  3. For each input cell:");
  console.log("     a. Load the lock script binary from cell deps");
  console.log("     b. Create a fresh CKB-VM instance");
  console.log("     c. Execute the script with transaction context");
  console.log("     d. Script returns 0 = authorized, non-zero = denied");
  console.log("  4. For each cell with a type script:");
  console.log("     a. Load the type script binary from cell deps");
  console.log("     b. Create a fresh CKB-VM instance");
  console.log("     c. Execute the script with transaction context");
  console.log("     d. Script returns 0 = valid, non-zero = invalid");
  console.log("  5. ALL scripts must return 0 for tx to be accepted");
  console.log("");

  console.log("  VM Instance Properties:");
  console.log("  -----------------------------------------------");

  const properties = [
    {
      property: "Memory",
      value: "4 MB (default)",
      detail: "Flat address space, no virtual memory",
    },
    {
      property: "Word Size",
      value: "64-bit",
      detail: "Registers and addresses are 64-bit",
    },
    {
      property: "Endianness",
      value: "Little-endian",
      detail: "Matches RISC-V convention",
    },
    {
      property: "Entry Point",
      value: "ELF _start",
      detail: "Script binary is a standard ELF executable",
    },
    {
      property: "Cycle Limit",
      value: "~70 billion",
      detail: "Shared across ALL scripts in the transaction",
    },
    {
      property: "I/O",
      value: "Syscalls only",
      detail: "No filesystem, network, or other I/O",
    },
    {
      property: "Determinism",
      value: "Guaranteed",
      detail: "Same input always produces same output",
    },
    {
      property: "Isolation",
      value: "Full sandbox",
      detail: "Cannot access host memory or other VMs",
    },
  ];

  for (const prop of properties) {
    console.log(
      `    ${prop.property.padEnd(14)} ${prop.value.padEnd(20)} ${prop.detail}`
    );
  }

  console.log("");

  // --- Script Groups ---
  // CKB optimizes execution by grouping scripts. If multiple inputs share
  // the same lock script (same code_hash + hash_type + args), the script
  // is only executed ONCE for the entire group. Inside the script, it can
  // iterate over all inputs in the group using Source::GroupInput.
  console.log("  Script Groups (Optimization):");
  console.log("  -----------------------------------------------");
  console.log("    If multiple inputs share the same lock script");
  console.log("    (same code_hash + hash_type + args), the script");
  console.log("    is executed ONLY ONCE for the entire group.");
  console.log("");
  console.log("    Example: A transaction with 10 inputs from the same");
  console.log("    address runs the lock script once, not 10 times.");
  console.log("    The script uses Source::GroupInput to iterate over");
  console.log("    all inputs in its group.");
  console.log("");
  console.log("    This dramatically reduces cycle consumption for");
  console.log("    transactions with many inputs from the same owner.");
  console.log("");
}

// ============================================================================
// Section 3: CKB-VM Syscalls
// ============================================================================
//
// Syscalls are the ONLY way a CKB script can interact with the outside world.
// They are invoked using the RISC-V ECALL instruction and provide access to:
//   - Transaction data (inputs, outputs, witnesses, headers)
//   - Script metadata (script hash, script args)
//   - Debugging output
//   - VM control (exit, spawn child VMs)
//
// Each syscall has a number (passed in register a7) and parameters (in a0-a6).
// The ckb-std library wraps these into ergonomic Rust functions.

/**
 * Prints a complete reference of all CKB-VM syscalls.
 * This is a summary — see syscalls.ts for the detailed reference.
 */
function printSyscallOverview(): void {
  console.log("=".repeat(70));
  console.log("  CKB-VM Syscalls (How Scripts Talk to the Chain)");
  console.log("=".repeat(70));
  console.log("");

  console.log("  Syscalls are invoked via the RISC-V ECALL instruction.");
  console.log("  The syscall number is passed in register a7.");
  console.log("  Parameters are passed in registers a0-a6.");
  console.log("  Return value is placed in register a0.");
  console.log("");

  // Group syscalls by category for clarity
  const syscallGroups = [
    {
      category: "VM Control",
      syscalls: [
        {
          name: "exit",
          number: 93,
          desc: "Terminate script execution with a return code",
        },
        {
          name: "debug",
          number: 2177,
          desc: "Print a debug message (no-op in production)",
        },
      ],
    },
    {
      category: "Transaction Data",
      syscalls: [
        {
          name: "load_tx_hash",
          number: 2061,
          desc: "Load the hash of the current transaction",
        },
        {
          name: "load_transaction",
          number: 2051,
          desc: "Load the full serialized transaction",
        },
        {
          name: "load_script_hash",
          number: 2062,
          desc: "Load the hash of the currently executing script",
        },
        {
          name: "load_script",
          number: 2052,
          desc: "Load the full Script structure (code_hash, hash_type, args)",
        },
      ],
    },
    {
      category: "Cell Data",
      syscalls: [
        {
          name: "load_cell",
          number: 2071,
          desc: "Load a cell's metadata (capacity, lock, type)",
        },
        {
          name: "load_cell_data",
          number: 2092,
          desc: "Load a cell's data field",
        },
        {
          name: "load_cell_by_field",
          number: 2081,
          desc: "Load a specific field of a cell",
        },
      ],
    },
    {
      category: "Input/Output",
      syscalls: [
        {
          name: "load_input",
          number: 2073,
          desc: "Load an input cell's OutPoint (tx_hash + index)",
        },
        {
          name: "load_input_by_field",
          number: 2083,
          desc: "Load a specific field of an input",
        },
        {
          name: "load_witness",
          number: 2074,
          desc: "Load a witness at a given index",
        },
      ],
    },
    {
      category: "Header",
      syscalls: [
        {
          name: "load_header",
          number: 2072,
          desc: "Load a block header (for header deps)",
        },
        {
          name: "load_header_by_field",
          number: 2082,
          desc: "Load a specific field of a header",
        },
      ],
    },
    {
      category: "VM Management (CKB2023+)",
      syscalls: [
        {
          name: "spawn",
          number: 2601,
          desc: "Spawn a child VM instance to execute another script",
        },
        {
          name: "pipe",
          number: 2604,
          desc: "Create a pipe for inter-VM communication",
        },
        {
          name: "read",
          number: 2605,
          desc: "Read from a pipe",
        },
        {
          name: "write",
          number: 2606,
          desc: "Write to a pipe",
        },
        {
          name: "inherited_fd",
          number: 2607,
          desc: "Get inherited file descriptors from parent VM",
        },
        {
          name: "close",
          number: 2608,
          desc: "Close a file descriptor",
        },
        {
          name: "wait",
          number: 2603,
          desc: "Wait for a child VM to finish",
        },
        {
          name: "process_id",
          number: 2602,
          desc: "Get the current VM's process ID",
        },
        {
          name: "load_block_extension",
          number: 2104,
          desc: "Load block extension data",
        },
      ],
    },
    {
      category: "Current Cycles",
      syscalls: [
        {
          name: "current_cycles",
          number: 2042,
          desc: "Return the number of cycles consumed so far",
        },
        {
          name: "vm_version",
          number: 2041,
          desc: "Return the CKB-VM version (0 or 1)",
        },
      ],
    },
  ];

  for (const group of syscallGroups) {
    console.log(`  ${group.category}:`);
    for (const sc of group.syscalls) {
      console.log(
        `    [${sc.number.toString().padStart(4)}] ${sc.name.padEnd(24)} ${sc.desc}`
      );
    }
    console.log("");
  }

  console.log("  Source Parameter:");
  console.log("  -----------------------------------------------");
  console.log("  Many syscalls take a 'source' parameter that specifies");
  console.log("  which set of cells/data to access:");
  console.log("");
  console.log("    Source::Input       (1)  — Input cells of the transaction");
  console.log("    Source::Output      (2)  — Output cells of the transaction");
  console.log("    Source::CellDep     (3)  — Cell dependencies");
  console.log("    Source::HeaderDep   (4)  — Header dependencies");
  console.log(
    "    Source::GroupInput  (0x0100000000000001) — Inputs in the current script group"
  );
  console.log(
    "    Source::GroupOutput (0x0100000000000002) — Outputs in the current script group"
  );
  console.log("");
}

// ============================================================================
// Section 4: Cycle Counting and Estimation
// ============================================================================
//
// Every RISC-V instruction executed in CKB-VM consumes cycles. The total
// cycle count determines how "expensive" a script execution is. Understanding
// cycle costs helps you:
//
//   1. Estimate whether a transaction will fit within the cycle limit
//   2. Optimize scripts for lower execution costs
//   3. Choose efficient algorithms and data structures
//   4. Compare different implementation approaches

/**
 * Prints a guide on cycle counting, estimation, and the cycle limit.
 */
function printCycleGuide(): void {
  console.log("=".repeat(70));
  console.log("  Cycle Counting and Estimation");
  console.log("=".repeat(70));
  console.log("");

  // --- Instruction Costs ---
  console.log("  Instruction Cycle Costs:");
  console.log("  -----------------------------------------------");

  const costs = [
    { instruction: "ADD, SUB, AND, OR, XOR", cost: 1, note: "ALU operations" },
    { instruction: "SLL, SRL, SRA (shifts)", cost: 1, note: "Shift operations" },
    {
      instruction: "MUL, MULH, DIV, REM",
      cost: 5,
      note: "M extension multiply/divide",
    },
    {
      instruction: "LB, LH, LW, LD (loads)",
      cost: 3,
      note: "Memory read operations",
    },
    {
      instruction: "SB, SH, SW, SD (stores)",
      cost: 3,
      note: "Memory write operations",
    },
    {
      instruction: "BEQ, BNE, BLT (branches)",
      cost: 3,
      note: "Conditional branches",
    },
    { instruction: "JAL, JALR (jumps)", cost: 3, note: "Unconditional jumps" },
    { instruction: "ECALL (syscall)", cost: "500+", note: "Depends on the specific syscall" },
    { instruction: "LUI, AUIPC", cost: 1, note: "Upper immediate" },
  ];

  for (const c of costs) {
    console.log(
      `    ${String(c.instruction).padEnd(30)} ${String(c.cost).padStart(5)} cycles    ${c.note}`
    );
  }

  console.log("");

  // --- Syscall Costs ---
  console.log("  Syscall Cycle Costs (approximate):");
  console.log("  -----------------------------------------------");

  const syscallCosts = [
    { syscall: "exit", cost: "~500", note: "Fixed cost" },
    { syscall: "debug", cost: "~500", note: "Fixed cost (no-op in production)" },
    { syscall: "load_tx_hash", cost: "~500", note: "32 bytes of data" },
    { syscall: "load_script", cost: "~600-1000", note: "Depends on script size" },
    { syscall: "load_cell", cost: "~1000-3000", note: "Depends on cell structure" },
    { syscall: "load_cell_data", cost: "~500 + N", note: "N = bytes of data loaded" },
    {
      syscall: "load_witness",
      cost: "~500 + N",
      note: "N = bytes of witness data",
    },
    { syscall: "load_input", cost: "~500-1000", note: "OutPoint structure" },
    { syscall: "load_header", cost: "~1000-2000", note: "Block header data" },
    {
      syscall: "current_cycles",
      cost: "~500",
      note: "Returns cycle counter value",
    },
    { syscall: "spawn", cost: "~10000+", note: "Creates a new VM instance" },
  ];

  for (const sc of syscallCosts) {
    console.log(
      `    ${sc.syscall.padEnd(22)} ${sc.cost.padStart(12)}    ${sc.note}`
    );
  }

  console.log("");

  // --- Cycle Limit ---
  console.log("  Transaction Cycle Limit:");
  console.log("  -----------------------------------------------");
  console.log("    Maximum cycles per transaction: ~70,000,000,000 (70 billion)");
  console.log("    This limit is SHARED across ALL scripts in the transaction.");
  console.log("");
  console.log("    Example budget for a typical transaction:");
  console.log("      - Lock script verification:  ~1-3 million cycles");
  console.log("      - Type script validation:    ~0.5-2 million cycles");
  console.log("      - Total for simple tx:       ~2-5 million cycles");
  console.log("      - Remaining budget:          ~69.99 billion cycles");
  console.log("");
  console.log("    The cycle limit is generous by design. Most transactions");
  console.log("    use less than 0.01% of the available budget.");
  console.log("");

  // --- Common Operation Costs ---
  console.log("  Common Operation Costs (approximate):");
  console.log("  -----------------------------------------------");

  const opCosts = [
    { operation: "blake2b hash (32 bytes)", cost: "~1,600" },
    { operation: "blake2b hash (1 KB)", cost: "~6,500" },
    { operation: "SHA-256 hash (32 bytes)", cost: "~3,000" },
    { operation: "SHA-256 hash (1 KB)", cost: "~15,000" },
    { operation: "secp256k1 ECDSA verify", cost: "~1,200,000" },
    { operation: "secp256r1 ECDSA verify", cost: "~3,000,000" },
    { operation: "ed25519 verify", cost: "~2,500,000" },
    { operation: "RSA-2048 verify", cost: "~5,000,000" },
    { operation: "Molecule deserialization", cost: "~500-2,000" },
    { operation: "Simple lock script (total)", cost: "~1,200,000" },
    { operation: "Counter type script (total)", cost: "~500,000" },
  ];

  for (const op of opCosts) {
    console.log(`    ${op.operation.padEnd(35)} ${op.cost.padStart(12)} cycles`);
  }

  console.log("");
}

// ============================================================================
// Section 5: Reading Cycle Information from the Chain
// ============================================================================
//
// When a transaction is confirmed on CKB, the node records the cycle
// consumption. You can query this information using RPC methods:
//
//   - `get_transaction`: Returns the transaction details including cycle count
//   - `dry_run_transaction`: Estimates cycles without broadcasting
//
// The CCC SDK wraps these RPCs for convenient access.

/**
 * Demonstrates how to read cycle information from the chain using the CCC SDK.
 * Connects to the testnet and queries a real transaction.
 */
async function readCycleInfo(): Promise<void> {
  console.log("=".repeat(70));
  console.log("  Reading Cycle Information from the Chain");
  console.log("=".repeat(70));
  console.log("");

  // --- Connect to the CKB testnet ---
  // ClientPublicTestnet connects to a public CKB testnet node.
  // This is the same connection pattern used in previous lessons.
  const client = new ccc.ClientPublicTestnet();

  try {
    // Verify connection by checking the current tip block number.
    // The tip is the highest confirmed block.
    const tip = await client.getTip();
    console.log(`  Connected to CKB testnet. Current tip: block #${tip}`);
    console.log("");

    // --- Query Genesis Block ---
    // The genesis block (block 0) always exists and contains the initial
    // system cells (including the default lock script binary).
    console.log("  Querying genesis block info...");

    // Get the genesis block header to show chain information
    // Block 0 is the genesis block containing initial system cells.
    const genesisHeader = await client.getHeaderByNumber(0);
    if (genesisHeader) {
      console.log(`    Genesis block hash: ${genesisHeader.hash}`);
      console.log(`    Epoch: ${genesisHeader.epoch}`);
      console.log(
        `    Timestamp: ${new Date(Number(genesisHeader.timestamp)).toISOString()}`
      );
    }
    console.log("");

    // --- Script Hash Explanation ---
    // Every script on CKB is identified by its code_hash (the blake2b hash
    // of the script binary). The default secp256k1-blake160 lock script
    // has a well-known code_hash on testnet.
    console.log("  Well-Known Script Code Hashes (Testnet):");
    console.log("  -----------------------------------------------");

    const knownScripts = [
      {
        name: "secp256k1-blake160 (lock)",
        codeHash:
          "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
        desc: "Default lock script for CKB addresses",
      },
      {
        name: "secp256k1-blake160-multisig",
        codeHash:
          "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
        desc: "M-of-N multisig lock script",
      },
      {
        name: "Nervos DAO (type)",
        codeHash:
          "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
        desc: "Nervos DAO deposit/withdrawal type script",
      },
    ];

    for (const script of knownScripts) {
      console.log(`    ${script.name}`);
      console.log(`      Code Hash: ${script.codeHash}`);
      console.log(`      Purpose:   ${script.desc}`);
      console.log("");
    }

    // --- Estimating Cycles for a Transaction ---
    // In practice, you estimate cycles by:
    //   1. Building the transaction
    //   2. Using dry_run_transaction RPC (or ckb-debugger locally)
    //   3. The RPC returns the total cycles consumed
    //
    // The CCC SDK handles this automatically when building transactions.
    console.log("  Estimating Cycles:");
    console.log("  -----------------------------------------------");
    console.log("  Method 1: ckb-debugger (local, offline)");
    console.log("    $ ckb-debugger --bin my-script.elf");
    console.log("    Reports exact cycle count after execution.");
    console.log("");
    console.log("  Method 2: dry_run_transaction RPC (online)");
    console.log("    Build a transaction and call dry_run_transaction.");
    console.log("    Returns cycle count without broadcasting the tx.");
    console.log("");
    console.log("  Method 3: get_transaction RPC (after confirmation)");
    console.log("    Query a confirmed transaction to see its actual");
    console.log("    cycle consumption recorded in the block.");
    console.log("");
  } catch (error) {
    console.error("  Error connecting to testnet:", error);
    console.log("  (This section requires network access to the CKB testnet.)");
    console.log("");
  }
}

// ============================================================================
// Section 6: Optimization Techniques
// ============================================================================
//
// Writing efficient CKB scripts is about minimizing cycle consumption.
// Here are the key optimization strategies.

/**
 * Prints optimization techniques for CKB script development.
 */
function printOptimizationGuide(): void {
  console.log("=".repeat(70));
  console.log("  Optimization Techniques for CKB Scripts");
  console.log("=".repeat(70));
  console.log("");

  const techniques = [
    {
      name: "1. Minimize Syscalls",
      tips: [
        "Each syscall costs ~500+ cycles of overhead.",
        "Load data once and cache it in local variables.",
        "Use load_cell_by_field to load only the fields you need.",
        "Avoid loading entire cells when you only need one field.",
      ],
    },
    {
      name: "2. Use Partial Loading",
      tips: [
        "Syscalls support offset and length parameters.",
        "Load only the bytes you need, not the entire data blob.",
        "Example: load_cell_data with offset=0, length=16 for UDT balance.",
        "Saves both cycles and memory.",
      ],
    },
    {
      name: "3. Choose Efficient Algorithms",
      tips: [
        "Use blake2b over SHA-256 when possible (~2x faster in CKB-VM).",
        "Use blake160 (20-byte truncated blake2b) for address hashing.",
        "Avoid unnecessary cryptographic operations.",
        "Pre-compute values off-chain when possible.",
      ],
    },
    {
      name: "4. Minimize Binary Size",
      tips: [
        "Use opt-level='s' (optimize for size) in Cargo.toml.",
        "Enable LTO (Link-Time Optimization) to eliminate dead code.",
        "Use panic='abort' (no unwinding support needed).",
        "Strip debug symbols in release builds.",
        "Use the C extension for compressed instructions (automatic).",
        "Smaller binaries load faster and cost less capacity to store.",
      ],
    },
    {
      name: "5. Reduce Memory Usage",
      tips: [
        "CKB-VM has a 4MB memory limit.",
        "Use stack allocation over heap when possible.",
        "Avoid creating large vectors or buffers unnecessarily.",
        "Process data in chunks rather than loading everything at once.",
      ],
    },
    {
      name: "6. Early Exit",
      tips: [
        "Return errors as soon as possible.",
        "Check the cheapest conditions first (e.g., length checks before hashing).",
        "Use short-circuit evaluation in conditional chains.",
        "Fail fast to avoid wasting cycles on invalid transactions.",
      ],
    },
    {
      name: "7. Script Groups",
      tips: [
        "Design scripts to handle multiple inputs efficiently.",
        "Use Source::GroupInput to iterate only over relevant inputs.",
        "A script executed once for 10 grouped inputs is much cheaper",
        "than executing 10 separate script instances.",
      ],
    },
    {
      name: "8. Use the Spawn Syscall Wisely",
      tips: [
        "Spawn creates a new VM instance (~10,000+ cycle overhead).",
        "Use spawn for code reuse (calling shared libraries).",
        "Avoid spawning for simple operations — inline them instead.",
        "Spawn is useful for modular script architectures (like Omnilock).",
      ],
    },
  ];

  for (const tech of techniques) {
    console.log(`  ${tech.name}:`);
    for (const tip of tech.tips) {
      console.log(`    - ${tip}`);
    }
    console.log("");
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log("");
  console.log(
    "######################################################################"
  );
  console.log(
    "#                                                                    #"
  );
  console.log(
    "#           Lesson 12: CKB-VM Deep Dive                             #"
  );
  console.log(
    "#           Exploring the RISC-V Virtual Machine                     #"
  );
  console.log(
    "#                                                                    #"
  );
  console.log(
    "######################################################################"
  );
  console.log("");

  // Section 1: Architecture overview (no network required)
  printRiscVOverview();

  // Section 2: Execution model (no network required)
  printExecutionModel();

  // Section 3: Syscall overview (no network required)
  printSyscallOverview();

  // Section 4: Cycle counting guide (no network required)
  printCycleGuide();

  // Section 5: Reading cycle info from the chain (requires network)
  await readCycleInfo();

  // Section 6: Optimization techniques (no network required)
  printOptimizationGuide();

  console.log("=".repeat(70));
  console.log("  Lesson Complete!");
  console.log("=".repeat(70));
  console.log("");
  console.log("  Key Takeaways:");
  console.log("  1. CKB-VM is a RISC-V (rv64imc) virtual machine");
  console.log("  2. Scripts interact with the chain ONLY through syscalls");
  console.log("  3. Every instruction consumes cycles (1-5 for ALU, 3 for memory)");
  console.log("  4. Transaction cycle limit is ~70 billion (shared across scripts)");
  console.log("  5. Any language that compiles to RISC-V can be used");
  console.log("  6. Any cryptographic algorithm can be implemented on-chain");
  console.log("  7. Optimization = fewer syscalls + efficient algorithms + small binaries");
  console.log("");
  console.log("  Next: Run `npm run syscalls` for the detailed syscall reference.");
  console.log("");

  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
