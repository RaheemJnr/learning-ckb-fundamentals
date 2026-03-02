/**
 * ============================================================================
 * setup-check.ts — Environment Verification for CKB Development
 * ============================================================================
 *
 * This module performs a series of checks to verify that your local
 * development environment is correctly configured for CKB development.
 *
 * It checks:
 *   1. Node.js version (>= 18 required)
 *   2. npm availability
 *   3. OffCKB CLI (optional — for local devnet)
 *   4. CKB-CLI (optional — for advanced node management)
 *
 * Each check returns a structured result that can be displayed to the user.
 *
 * Usage:
 *   import { runAllChecks, printCheckResults } from "./setup-check";
 *   const results = await runAllChecks();
 *   printCheckResults(results);
 */

import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents the result of a single environment check.
 *
 * - `name`: A human-readable label for the check (e.g., "Node.js")
 * - `passed`: Whether the check succeeded
 * - `required`: If true, a failure here means the environment is NOT ready
 * - `version`: The detected version string (if applicable)
 * - `message`: Additional context or instructions
 */
export interface CheckResult {
  name: string;
  passed: boolean;
  required: boolean;
  version?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helper: safely run a shell command and capture its stdout
// ---------------------------------------------------------------------------

/**
 * Attempts to execute a shell command synchronously.
 * Returns the trimmed stdout on success, or `null` if the command fails.
 *
 * Why synchronous? These are one-shot version checks that complete instantly.
 * Using execSync keeps the code straightforward for a CLI verification script.
 */
function tryExec(command: string): string | null {
  try {
    // Execute the command, suppress stderr, and capture stdout as a string.
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr — all piped
      timeout: 10_000, // 10-second safety timeout
    });
    return output.trim();
  } catch {
    // Command not found, or it returned a non-zero exit code.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Individual check functions
// ---------------------------------------------------------------------------

/**
 * Check 1: Node.js
 *
 * CKB development with CCC SDK requires Node.js >= 18.
 * We parse the major version from `node --version` (e.g., "v20.11.0" -> 20).
 */
export function checkNodeJs(): CheckResult {
  const raw = tryExec("node --version");

  if (!raw) {
    return {
      name: "Node.js",
      passed: false,
      required: true,
      message:
        "Node.js is not installed. Install it from https://nodejs.org/ (LTS recommended).",
    };
  }

  // `node --version` returns something like "v20.11.0".
  // We strip the leading "v" and parse the major version number.
  const version = raw.replace(/^v/, "");
  const major = parseInt(version.split(".")[0], 10);

  if (major < 18) {
    return {
      name: "Node.js",
      passed: false,
      required: true,
      version,
      message: `Node.js ${version} detected, but >= 18 is required. Please upgrade at https://nodejs.org/`,
    };
  }

  return {
    name: "Node.js",
    passed: true,
    required: true,
    version,
    message: `Node.js ${version} detected — meets the >= 18 requirement.`,
  };
}

/**
 * Check 2: npm
 *
 * npm ships with Node.js, but it's worth confirming it's on the PATH
 * and reporting the version. We need npm to install project dependencies.
 */
export function checkNpm(): CheckResult {
  const raw = tryExec("npm --version");

  if (!raw) {
    return {
      name: "npm",
      passed: false,
      required: true,
      message:
        "npm is not found on your PATH. It usually ships with Node.js — try reinstalling Node.",
    };
  }

  return {
    name: "npm",
    passed: true,
    required: true,
    version: raw,
    message: `npm ${raw} detected.`,
  };
}

/**
 * Check 3: OffCKB CLI (optional)
 *
 * OffCKB is a one-line local CKB devnet tool. It spins up a local CKB node
 * with pre-funded accounts so you can test without touching the public testnet.
 *
 * Install: npm install -g @offckb/cli
 *
 * This check is optional — students can use the public testnet instead,
 * but OffCKB is recommended for faster, offline-capable development.
 */
export function checkOffCkb(): CheckResult {
  const raw = tryExec("offckb --version");

  if (!raw) {
    return {
      name: "OffCKB CLI",
      passed: false,
      required: false,
      message:
        "OffCKB is not installed. Install with: npm install -g @offckb/cli (optional but recommended for local devnet).",
    };
  }

  // offckb --version may return something like "offckb 0.3.0" or just "0.3.0"
  const version = raw.replace(/^offckb\s*/i, "").trim();

  return {
    name: "OffCKB CLI",
    passed: true,
    required: false,
    version,
    message: `OffCKB ${version} detected — you can run a local devnet with "offckb node".`,
  };
}

/**
 * Check 4: CKB-CLI (optional)
 *
 * CKB-CLI is the official command-line tool for interacting with CKB nodes.
 * It supports wallet management, transaction building, and node configuration.
 *
 * Most students won't need this for early lessons (CCC SDK covers most use cases),
 * but it's useful for advanced operations and running a full node.
 */
export function checkCkbCli(): CheckResult {
  const raw = tryExec("ckb-cli --version");

  if (!raw) {
    return {
      name: "CKB-CLI",
      passed: false,
      required: false,
      message:
        "CKB-CLI is not installed. This is optional — see https://github.com/nervosnetwork/ckb-cli for installation.",
    };
  }

  // ckb-cli --version returns something like "ckb-cli 1.7.0 (..."
  const version = raw.split("(")[0].replace(/^ckb-cli\s*/i, "").trim();

  return {
    name: "CKB-CLI",
    passed: true,
    required: false,
    version,
    message: `CKB-CLI ${version} detected.`,
  };
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

/**
 * Executes every environment check and returns an array of results.
 * The checks run synchronously (they're fast shell commands), so we
 * don't actually need async here, but we keep the signature async-friendly
 * in case future checks involve network calls.
 */
export async function runAllChecks(): Promise<CheckResult[]> {
  return [
    checkNodeJs(),
    checkNpm(),
    checkOffCkb(),
    checkCkbCli(),
  ];
}

// ---------------------------------------------------------------------------
// Pretty-print results
// ---------------------------------------------------------------------------

/**
 * Prints a nicely formatted summary of all check results to the console.
 * Returns `true` if all *required* checks passed, `false` otherwise.
 */
export function printCheckResults(results: CheckResult[]): boolean {
  console.log("\n====================================================");
  console.log("  CKB Development Environment Check");
  console.log("====================================================\n");

  let allRequiredPassed = true;

  for (const result of results) {
    // Use simple ASCII indicators for cross-platform compatibility
    const icon = result.passed ? "[PASS]" : result.required ? "[FAIL]" : "[SKIP]";
    const tag = result.required ? "(required)" : "(optional)";

    console.log(`  ${icon} ${result.name} ${tag}`);
    console.log(`        ${result.message}`);

    if (result.required && !result.passed) {
      allRequiredPassed = false;
    }
  }

  console.log("\n----------------------------------------------------");

  if (allRequiredPassed) {
    console.log("  All required tools are installed!");
    console.log("  Your environment is ready for CKB development.");
  } else {
    console.log("  Some required tools are missing.");
    console.log("  Please install them before continuing.");
  }

  console.log("----------------------------------------------------\n");

  return allRequiredPassed;
}

// ---------------------------------------------------------------------------
// Standalone execution
// ---------------------------------------------------------------------------

/**
 * If this file is run directly (e.g., `npx tsx src/setup-check.ts`),
 * perform all checks and exit with an appropriate code.
 */
async function main() {
  const results = await runAllChecks();
  const success = printCheckResults(results);
  process.exit(success ? 0 : 1);
}

// Detect if this module is the entry point.
// With tsx / ts-node, we check if the resolved script path matches this file.
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("setup-check.ts") ||
    process.argv[1].endsWith("setup-check.js"));

if (isMain) {
  main().catch((err) => {
    console.error("Unexpected error during setup check:", err);
    process.exit(1);
  });
}
