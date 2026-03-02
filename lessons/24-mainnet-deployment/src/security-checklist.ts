/**
 * ============================================================================
 * Lesson 24: Mainnet Deployment - Security Checklist
 * ============================================================================
 *
 * This file documents the most important security considerations before
 * deploying any CKB script or dApp to mainnet. It is organized as an
 * interactive checklist with detailed explanations for each item.
 *
 * HOW TO USE THIS FILE
 * ====================
 * Run: npx tsx src/security-checklist.ts
 *
 * The checklist prints each security item with a pass/warning/fail status
 * based on configurable project settings. In a real CI/CD pipeline, you
 * would connect these checks to actual contract code and deployment state.
 *
 * DISCLAIMER
 * ==========
 * This checklist covers the most common vulnerability patterns but is not
 * a substitute for a professional security audit. For any script managing
 * significant value, engage a CKB-specialized security firm before mainnet.
 * ============================================================================
 */

// ============================================================================
// SECTION 1: Checklist Item Types
// ============================================================================

/** Severity levels for security issues */
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

/** Status of a checklist item after evaluation */
type CheckStatus = "PASS" | "WARN" | "FAIL" | "SKIP";

/** A single checklist item with its evaluation result */
interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: Severity;
  status: CheckStatus;
  details?: string;
  recommendation?: string;
}

// ============================================================================
// SECTION 2: Key Management Security
// ============================================================================

/**
 * KEY MANAGEMENT: The most common cause of catastrophic loss in crypto
 *
 * Unlike Ethereum where contract state persists in the EVM regardless of
 * who holds the admin keys, CKB has cells that can be "owned" by specific
 * lock scripts. Compromising the key controlling important cells (like the
 * protocol treasury or admin capabilities) directly loses the funds.
 *
 * Common mistakes:
 *   - Storing mainnet private keys in environment variables in code repos
 *   - Using the same key for testnet and mainnet testing
 *   - Not having a key rotation plan for long-running protocols
 *   - Using a single key for high-value operations (single point of failure)
 */
const KEY_MANAGEMENT_CHECKS: ChecklistItem[] = [
  {
    id: "key-001",
    category: "Key Management",
    title: "Private keys are NOT in source code or version control",
    description:
      "No private keys, mnemonics, or keystore files should ever be committed " +
      "to git or stored in the source tree. Use environment variables or a " +
      "dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.).",
    severity: "CRITICAL",
    status: "WARN", // Warn by default - developer must confirm
    recommendation:
      "Run: git log --all --full-history -- '**/*.env' to check history. " +
      "Use 'git-secrets' pre-commit hooks to prevent future accidents.",
  },
  {
    id: "key-002",
    category: "Key Management",
    title: "Mainnet deployment key is stored on a hardware wallet",
    description:
      "For deploying scripts that will hold or manage significant value, " +
      "the deployment key should be on a Ledger, Trezor, or equivalent. " +
      "Software wallets are acceptable for testnet but not for mainnet " +
      "treasury or admin keys.",
    severity: "HIGH",
    status: "WARN",
    recommendation:
      "If using a software wallet for mainnet deployment, at minimum use " +
      "an air-gapped machine and encrypted key storage. Transfer admin " +
      "authority to a hardware wallet or multisig as soon as possible.",
  },
  {
    id: "key-003",
    category: "Key Management",
    title: "Protocol admin uses multisig (M-of-N) for critical operations",
    description:
      "Single-key admin authority is a single point of failure. " +
      "If the admin key is compromised, an attacker has full admin power. " +
      "Use a 2-of-3 or 3-of-5 multisig for any admin operations that " +
      "control significant value or protocol parameters. " +
      "On CKB, this can be implemented with Omnilock's multisig mode or " +
      "a custom multisig lock script.",
    severity: "HIGH",
    status: "WARN",
    recommendation:
      "Implement Omnilock multisig for admin cells. Store each key shard " +
      "with a different team member on a hardware wallet.",
  },
  {
    id: "key-004",
    category: "Key Management",
    title: "Testnet keys are DIFFERENT from mainnet keys",
    description:
      "Never reuse a private key between testnet and mainnet. " +
      "Testnet operations are inherently less secure (keys stored in CI, " +
      "shared among team members, etc.). If a testnet key is leaked, " +
      "it must not give access to any mainnet assets.",
    severity: "CRITICAL",
    status: "PASS", // Assume compliance - developer must verify
    details: "This check assumes developers use separate key generation for each network.",
  },
];

// ============================================================================
// SECTION 3: Script Vulnerability Patterns
// ============================================================================

/**
 * SCRIPT VULNERABILITIES: Common bugs in CKB lock and type scripts
 *
 * CKB scripts run in CKB-VM (RISC-V). The security model is different from
 * EVM contracts: scripts must explicitly verify everything they care about.
 * Missing a check is NOT caught by the language - the script just allows
 * something it shouldn't.
 */
const SCRIPT_VULNERABILITY_CHECKS: ChecklistItem[] = [
  {
    id: "script-001",
    category: "Script Vulnerabilities",
    title: "Lock script verifies ALL necessary conditions (no partial authorization)",
    description:
      "A lock script that only checks SOME conditions can be exploited by " +
      "constructing transactions that satisfy the checked conditions while " +
      "violating intended behavior via unchecked conditions. " +
      "\n\nExample: A multisig lock that checks 'signature count >= 2' but " +
      "doesn't verify the signers are from the authorized set. An attacker " +
      "provides 2 valid signatures from their own keys.",
    severity: "CRITICAL",
    status: "WARN",
    recommendation:
      "For each condition you INTEND to enforce, write a test that " +
      "violates ONLY that condition and verify the script rejects it.",
  },
  {
    id: "script-002",
    category: "Script Vulnerabilities",
    title: "Type script handles ALL operation types (create, update, destroy)",
    description:
      "CKB type scripts run for cells in BOTH inputs and outputs. " +
      "A common vulnerability is implementing the 'update' case correctly " +
      "but forgetting to restrict the 'destroy' case. " +
      "\n\nExample: A token type script that enforces conservation on updates " +
      "but allows destruction (no output cells) without authorization. " +
      "An attacker burns tokens they don't own by simply omitting the output.",
    severity: "CRITICAL",
    status: "WARN",
    recommendation:
      "Use the (input_count, output_count) tuple to handle: " +
      "(0, n): creation - who can mint? " +
      "(n, m): update/transfer - conservation rules " +
      "(n, 0): destruction - who can burn? Each case needs explicit handling.",
  },
  {
    id: "script-003",
    category: "Script Vulnerabilities",
    title: "Integer arithmetic uses overflow-safe operations",
    description:
      "CKB scripts work with raw 64-bit and 128-bit integers. " +
      "Overflow in token amount calculations can allow minting infinite tokens " +
      "or bypassing supply caps. " +
      "\n\nIn Rust: use checked_add(), checked_mul(), saturating_add() " +
      "instead of plain + and *. " +
      "\n\nExample: A token that has uint64 total supply. If the mint function " +
      "adds new tokens to total_supply without overflow checking, and " +
      "total_supply is near u64::MAX, the attacker can wrap around to zero.",
    severity: "HIGH",
    status: "WARN",
    recommendation:
      "In Rust scripts: replace all arithmetic operations on untrusted values " +
      "with checked_*, saturating_*, or wrapping_* methods. Add explicit " +
      "overflow tests to your test suite.",
  },
  {
    id: "script-004",
    category: "Script Vulnerabilities",
    title: "Script args are validated for correct length and format",
    description:
      "If a script assumes its args are a specific length (e.g., 20 bytes) " +
      "and does not check this, an attacker can create cells with malformed " +
      "args and potentially trigger out-of-bounds reads or logic errors. " +
      "\n\nCKB-VM itself will panic on out-of-bounds memory access, but " +
      "the resulting script failure may have unexpected consequences for " +
      "multi-script transactions.",
    severity: "MEDIUM",
    status: "WARN",
    recommendation:
      "At the top of every script, validate: " +
      "if script.args().len() != EXPECTED_ARGS_LENGTH { return Err(...); }",
  },
  {
    id: "script-005",
    category: "Script Vulnerabilities",
    title: "No unchecked dependency on cell ordering in transactions",
    description:
      "If a script logic assumes 'the payment output is always at index 0', " +
      "an attacker might construct a transaction where it is at a different " +
      "index. CKB transactions allow any input/output ordering. " +
      "\n\nSafer: iterate ALL outputs to find the one that matches your " +
      "criteria (correct lock hash, correct type, correct amount) rather " +
      "than assuming a fixed position.",
    severity: "MEDIUM",
    status: "WARN",
    recommendation:
      "When checking for a specific output cell, iterate all outputs: " +
      "for (i, output) in QueryIter::new(load_cell_output, Source::Output).enumerate() { " +
      "  if matches_criteria(output) { /* found it */ } " +
      "}",
  },
  {
    id: "script-006",
    category: "Script Vulnerabilities",
    title: "Replay attack prevention for cross-chain or multi-network scripts",
    description:
      "A transaction valid on testnet might be replayable on mainnet if it " +
      "references the same script code hashes and args. " +
      "\n\nFor scripts that lock high-value cells, consider including a " +
      "network identifier in the args or requiring a reference to a " +
      "mainnet-specific cell dep. This prevents testnet transactions from " +
      "being replayed on mainnet.",
    severity: "HIGH",
    status: "INFO",
    details:
      "CKB mainnet and testnet have different genesis hashes, so transactions " +
      "cannot be directly replayed across networks. However, WITHIN a network, " +
      "replay attacks between different protocol versions or deployments are possible.",
  },
];

// ============================================================================
// SECTION 4: Cell Data Validation
// ============================================================================

const CELL_DATA_CHECKS: ChecklistItem[] = [
  {
    id: "data-001",
    category: "Cell Data Validation",
    title: "Cell data length is validated before parsing",
    description:
      "If a type script expects 8 bytes of data but receives 0 or 100 bytes, " +
      "parsing without length validation can cause out-of-bounds access. " +
      "Always check data.len() == EXPECTED_LENGTH before parsing.",
    severity: "HIGH",
    status: "WARN",
    recommendation:
      "if data.len() != 8 { return Err(Error::InvalidDataLength); }",
  },
  {
    id: "data-002",
    category: "Cell Data Validation",
    title: "Capacity is sufficient for the cell's storage requirements",
    description:
      "A cell's capacity must be >= the sum of: 8 bytes (capacity field) + " +
      "lock script size + type script size (if present) + data size. " +
      "If a type script creates output cells with insufficient capacity, " +
      "those cells will be rejected by nodes. Test with minimal capacity values.",
    severity: "MEDIUM",
    status: "WARN",
    recommendation:
      "Calculate minimum capacity using: " +
      "min_capacity = 8 + lock.size() + type.size() + data.len(); " +
      "Verify output.capacity >= min_capacity in your type script.",
  },
  {
    id: "data-003",
    category: "Cell Data Validation",
    title: "Molecule encoding/decoding handles malformed input gracefully",
    description:
      "Molecule is CKB's binary encoding format. Malformed molecule input " +
      "will cause decoding to return an error, not crash. Ensure your script " +
      "handles molecule decode errors and doesn't panic on invalid input. " +
      "In Rust, molecule's generated code returns Result types - always handle them.",
    severity: "MEDIUM",
    status: "INFO",
  },
];

// ============================================================================
// SECTION 5: Testing Requirements
// ============================================================================

const TESTING_CHECKS: ChecklistItem[] = [
  {
    id: "test-001",
    category: "Testing",
    title: "Unit tests cover all script execution paths",
    description:
      "Every 'if' branch in your script logic should have at least one " +
      "passing test and one failing test. For a type script with " +
      "create/update/destroy paths, that is at minimum 6 tests. " +
      "For a lock script with multiple unlock conditions, each condition " +
      "needs positive and negative test cases.",
    severity: "HIGH",
    status: "WARN",
    recommendation:
      "Use ckb-testtool (Rust) or ckb-js-toolkit (JS) for unit tests. " +
      "Target 100% branch coverage on the security-critical paths.",
  },
  {
    id: "test-002",
    category: "Testing",
    title: "Integration tests run on devnet with realistic transaction sizes",
    description:
      "Unit tests mock the CKB environment. Integration tests deploy the " +
      "actual compiled RISC-V binary to a local devnet and submit real " +
      "transactions. This catches issues that mocking might miss: " +
      "- Actual binary size (affects capacity requirements) " +
      "- Real transaction fees " +
      "- Interaction between multiple scripts in one transaction",
    severity: "HIGH",
    status: "WARN",
    recommendation:
      "Run ckb-standalone-node locally and test all transaction flows " +
      "before testnet deployment. Use offckb for a quick dev environment.",
  },
  {
    id: "test-003",
    category: "Testing",
    title: "Testnet deployment and all transaction types verified",
    description:
      "Before mainnet: deploy to testnet, fund test accounts with testnet CKB, " +
      "and execute EVERY type of transaction your protocol supports. " +
      "This is your final pre-flight check. Testnet has the same consensus " +
      "rules as mainnet but losing testnet CKB has no consequences.",
    severity: "CRITICAL",
    status: "WARN",
    recommendation:
      "Create a testnet testing matrix: for each user action in your dApp, " +
      "write a testnet test script that performs it and verifies the result.",
  },
  {
    id: "test-004",
    category: "Testing",
    title: "Edge cases tested: zero amounts, max amounts, empty data",
    description:
      "Test with boundary values: " +
      "- Amount = 0: should usually be rejected " +
      "- Amount = u64::MAX: overflow in addition? " +
      "- Empty data field: does your type script handle this? " +
      "- Maximum args length: are there parsing limits? " +
      "These edge cases are common sources of vulnerabilities.",
    severity: "HIGH",
    status: "WARN",
  },
];

// ============================================================================
// SECTION 6: Deployment Process
// ============================================================================

const DEPLOYMENT_CHECKS: ChecklistItem[] = [
  {
    id: "deploy-001",
    category: "Deployment",
    title: "Script binary hash recorded and committed to project documentation",
    description:
      "After deploying a script, record: " +
      "- The transaction hash of the deployment transaction " +
      "- The cell index of the script cell " +
      "- The code_hash (blake2b of the binary) " +
      "- The hash_type ('data1' for deployed code cells) " +
      "These values MUST be hardcoded into your dApp and documented. " +
      "If you lose them, you cannot interact with your deployed script.",
    severity: "CRITICAL",
    status: "WARN",
    recommendation:
      "Create a 'deployments.json' file in your project tracking all " +
      "deployed script info per network. Never rely on re-computing these values.",
  },
  {
    id: "deploy-002",
    category: "Deployment",
    title: "Script deployment uses 'data1' hash_type for production stability",
    description:
      "Scripts can be referenced with hash_type 'data' (by exact binary hash) " +
      "or 'type' (by type ID, allowing upgrades). " +
      "\n\n'data1'/'data': Immutable - the script code can never change. " +
      "Used when you want to guarantee the exact behavior users signed up for. " +
      "\n\n'type': Upgradeable - the script can be replaced via a special " +
      "deployment transaction. Used when you anticipate needing bug fixes. " +
      "\n\nFor high-security applications, 'data1' is preferred. " +
      "For protocols expecting iteration, 'type' with a governance mechanism.",
    severity: "HIGH",
    status: "INFO",
    details:
      "Choose based on your protocol's needs. Neither is universally better. " +
      "Many production CKB scripts use 'type' for upgradeability but that " +
      "requires a governance mechanism to prevent unauthorized upgrades.",
  },
  {
    id: "deploy-003",
    category: "Deployment",
    title: "Deployment transaction verified on mainnet before announcing",
    description:
      "After broadcasting the deployment transaction to mainnet: " +
      "1. Wait for 6+ confirmations " +
      "2. Look up the transaction on CKB Explorer " +
      "3. Verify the code_hash of the output cell matches your expected value " +
      "4. Confirm the capacity is correct " +
      "5. Try a simple test interaction with the deployed script " +
      "Only announce the deployment publicly after completing these steps.",
    severity: "HIGH",
    status: "WARN",
  },
];

// ============================================================================
// SECTION 7: Monitoring
// ============================================================================

const MONITORING_CHECKS: ChecklistItem[] = [
  {
    id: "monitor-001",
    category: "Monitoring",
    title: "Script cell existence monitored (ensure it hasn't been consumed)",
    description:
      "Your deployed script cell should NEVER be consumed (it's a code cell, " +
      "not a state cell). Set up monitoring to alert if the script cell's " +
      "outpoint is consumed in any transaction. If someone consumes your " +
      "script cell, all contracts depending on it will break. " +
      "\n\nThis is rare but can happen if an attacker gains control of the " +
      "key used to lock the script cell.",
    severity: "HIGH",
    status: "WARN",
    recommendation:
      "Use the CKB subscription WebSocket API to watch for transactions " +
      "consuming your script deployment cell. Alert immediately if detected.",
  },
  {
    id: "monitor-002",
    category: "Monitoring",
    title: "Protocol metrics tracked (active users, total value locked, etc.)",
    description:
      "For a production dApp, monitor key health metrics: " +
      "- Active cells count (are users creating/destroying as expected?) " +
      "- Total capacity locked (TVL equivalent on CKB) " +
      "- Transaction volume " +
      "- Error rates in your frontend " +
      "Abnormal patterns may indicate an attack or bug.",
    severity: "MEDIUM",
    status: "INFO",
    recommendation:
      "Build a simple dashboard querying your protocol's cells via the " +
      "CKB indexer. Log all indexer queries and alert on unusual patterns.",
  },
];

// ============================================================================
// SECTION 8: Display and Report Generation
// ============================================================================

function getSeverityColor(severity: Severity): string {
  const colors: Record<Severity, string> = {
    CRITICAL: "[CRITICAL]",
    HIGH: "[HIGH]    ",
    MEDIUM: "[MEDIUM]  ",
    LOW: "[LOW]     ",
    INFO: "[INFO]    ",
  };
  return colors[severity];
}

function getStatusSymbol(status: CheckStatus): string {
  const symbols: Record<CheckStatus, string> = {
    PASS: "[PASS]",
    WARN: "[WARN]",
    FAIL: "[FAIL]",
    SKIP: "[SKIP]",
  };
  return symbols[status];
}

function printChecklistSection(title: string, items: ChecklistItem[]): void {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`${title.toUpperCase()}`);
  console.log("─".repeat(70));

  items.forEach((item) => {
    const statusSymbol = getStatusSymbol(item.status);
    const severityLabel = getSeverityColor(item.severity);
    console.log(`\n${statusSymbol} ${severityLabel} ${item.id}: ${item.title}`);

    // Print description (truncated for readability)
    const descLines = item.description.split("\n");
    descLines.slice(0, 3).forEach((line) => {
      if (line.trim()) console.log(`         ${line.trim()}`);
    });

    if (item.recommendation) {
      console.log(`         Recommendation: ${item.recommendation.slice(0, 100)}...`);
    }
    if (item.details) {
      console.log(`         Note: ${item.details.slice(0, 100)}...`);
    }
  });
}

function generateReport(allChecks: ChecklistItem[]): void {
  const passing = allChecks.filter((c) => c.status === "PASS").length;
  const warnings = allChecks.filter((c) => c.status === "WARN").length;
  const failing = allChecks.filter((c) => c.status === "FAIL").length;
  const critical = allChecks.filter(
    (c) => c.severity === "CRITICAL" && c.status !== "PASS"
  ).length;

  console.log(`\n${"=".repeat(70)}`);
  console.log("SECURITY CHECKLIST REPORT");
  console.log("=".repeat(70));
  console.log(`\nTotal checks: ${allChecks.length}`);
  console.log(`  Passing:    ${passing}`);
  console.log(`  Warnings:   ${warnings}`);
  console.log(`  Failing:    ${failing}`);
  console.log(`  Critical issues unresolved: ${critical}`);

  if (critical > 0) {
    console.log(`\n[!] DO NOT DEPLOY TO MAINNET until all CRITICAL items are resolved.`);
  } else if (warnings > 0) {
    console.log(`\n[~] Review all WARN items before mainnet. Some may be acceptable risks.`);
  } else {
    console.log(`\n[+] All checks passed. Ready for mainnet deployment review.`);
  }
}

/** Main entry point for the security checklist */
export function runSecurityChecklist(): void {
  console.log("\n" + "=".repeat(70));
  console.log("CKB SCRIPT SECURITY CHECKLIST");
  console.log("Pre-deployment review for mainnet safety");
  console.log("=".repeat(70));

  const allChecks = [
    ...KEY_MANAGEMENT_CHECKS,
    ...SCRIPT_VULNERABILITY_CHECKS,
    ...CELL_DATA_CHECKS,
    ...TESTING_CHECKS,
    ...DEPLOYMENT_CHECKS,
    ...MONITORING_CHECKS,
  ];

  printChecklistSection("1. Key Management", KEY_MANAGEMENT_CHECKS);
  printChecklistSection("2. Script Vulnerabilities", SCRIPT_VULNERABILITY_CHECKS);
  printChecklistSection("3. Cell Data Validation", CELL_DATA_CHECKS);
  printChecklistSection("4. Testing Requirements", TESTING_CHECKS);
  printChecklistSection("5. Deployment Process", DEPLOYMENT_CHECKS);
  printChecklistSection("6. Monitoring", MONITORING_CHECKS);

  generateReport(allChecks);
}

// Run if executed directly
runSecurityChecklist();
