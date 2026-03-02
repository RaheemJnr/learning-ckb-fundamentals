/**
 * ============================================================================
 * Lesson 24: Mainnet Deployment and Security
 * ============================================================================
 *
 * You have built your dApp, tested it on devnet, verified it on testnet,
 * and now you are ready for mainnet. This lesson covers the complete
 * deployment process and the security practices that protect your users
 * and your protocol once it goes live.
 *
 * WHAT THIS LESSON COVERS
 * =======================
 * 1. The devnet → testnet → mainnet progression
 * 2. Pre-deployment verification (code hash checks, capacity, args)
 * 3. The deployment transaction and how to record deployment info
 * 4. Post-deployment verification on mainnet
 * 5. Monitoring deployed contracts (cell existence, TVL, anomalies)
 * 6. Upgradeability: hash_type "data" vs "type" trade-offs
 * 7. Security checklist highlights
 * 8. Emergency response planning
 * 9. Production best practices
 * 10. Congratulations and what comes next
 *
 * Run with: npx tsx src/index.ts
 * ============================================================================
 */

import { runSecurityChecklist } from "./security-checklist.js";

// ============================================================================
// SECTION 1: The Deployment Pipeline
// ============================================================================

function explainDeploymentPipeline(): void {
  console.log("\n" + "=".repeat(70));
  console.log("LESSON 24: MAINNET DEPLOYMENT AND SECURITY");
  console.log("=".repeat(70));

  console.log(`
THE THREE-ENVIRONMENT PIPELINE
================================

Every serious CKB deployment follows a three-stage process:

STAGE 1: DEVNET (Local Development)
  - Run a local CKB node (use 'offckb' for instant setup)
  - Instant block times, no waiting
  - Unlimited testnet CKB (pre-funded genesis accounts)
  - Full control: can reset chain state
  - Goal: basic functionality working, unit tests passing

  offckb init myproject  # Scaffold a local devnet environment
  offckb node start      # Start the local node

STAGE 2: TESTNET (Pre-Production Validation)
  - Deploy to https://testnet.ckb.dev (or run your own testnet node)
  - Real network conditions: real latency, real mempool
  - Get testnet CKB from faucet: https://faucet.nervos.org
  - Real block times (~10 seconds)
  - Goal: ALL transaction types verified under realistic conditions

STAGE 3: MAINNET (Production)
  - The real network: https://mainnet.ckb.dev
  - Real CKB, real value at stake
  - Irreversible: mistakes cannot be rolled back
  - Goal: deploy only after full testnet verification

CHECKLIST BEFORE EACH STAGE TRANSITION
========================================

  Devnet → Testnet:
    [ ] Unit tests pass (ckb-testtool)
    [ ] Integration tests pass on devnet
    [ ] Script binary hash computed and recorded
    [ ] Cell capacity requirements calculated
    [ ] Transaction flow documented

  Testnet → Mainnet:
    [ ] All transaction types tested on testnet
    [ ] Edge cases verified (dust outputs, max amounts, etc.)
    [ ] Security checklist completed (run: npm run checklist)
    [ ] Deployment documentation prepared
    [ ] Team sign-off on deployment plan
    [ ] Emergency response plan in place
    [ ] Hardware wallet configured for deployment key
`);
}

// ============================================================================
// SECTION 2: Script Verification
// ============================================================================

function explainScriptVerification(): void {
  console.log("\n" + "=".repeat(70));
  console.log("DEPLOYMENT VERIFICATION: CODE HASHES AND CELL DEPS");
  console.log("=".repeat(70));

  console.log(`
WHY CODE HASH VERIFICATION MATTERS
====================================

When you deploy a CKB script, you create a special "code cell" that holds
the compiled RISC-V binary. Other cells reference this code cell via
its "code hash" - the blake2b hash of the binary content.

If you reference the WRONG code hash (e.g., from a different deployment),
your transactions will fail cryptically. Worse, if someone deploys a
DIFFERENT script at the hash you expected (extremely unlikely but possible
in theory with hash_type "type"), your cells might be controlled by
different code than you thought.

COMPUTING AND RECORDING THE CODE HASH
=======================================

Step 1: Build your script
  cargo build --release --target riscv64imac-unknown-none-elf

Step 2: Compute the binary hash
  // In TypeScript, using CCC:
  import { ckbHash } from "@ckb-ccc/core";
  import { readFileSync } from "fs";

  const binary = readFileSync("./build/release/my-script");
  const codeHash = ckbHash(binary);
  console.log("code_hash:", codeHash);

  // Or using the ckb-cli tool:
  // ckb-cli util blake2b --binary-path ./build/release/my-script

Step 3: Record the deployment info PERMANENTLY
  Create a file like this in your project:
  {
    "scripts": {
      "myScript": {
        "mainnet": {
          "deploymentTxHash": "0xabc...",
          "cellIndex": 0,
          "codeHash": "0xdef...",
          "hashType": "data1"
        },
        "testnet": {
          "deploymentTxHash": "0x123...",
          "cellIndex": 0,
          "codeHash": "0xdef...",  // Same hash - same binary
          "hashType": "data1"
        }
      }
    }
  }

  IMPORTANT: The code_hash should be identical for testnet and mainnet
  deployments of the same binary. If they differ, you deployed different
  code - investigate why before proceeding!

VERIFYING ON CKB EXPLORER
===========================
After deployment:
  1. Go to https://explorer.nervos.org
  2. Search for your deployment transaction hash
  3. Find your code cell in the outputs
  4. Click the cell and verify the output data hash
  5. Compare with your expected code_hash
  6. Record the confirmation block number

CELL DEP REFERENCE
===================
In transactions using your script, reference it as a cell dep:
  {
    outPoint: {
      txHash: "0xabc...",  // Your deployment tx hash
      index: "0x0",        // Cell index (usually 0)
    },
    depType: "code",       // "code" for raw binary, "depGroup" for bundled deps
  }

Keep this cell dep reference in your SDK and dApp code.
`);
}

// ============================================================================
// SECTION 3: Upgradeability Trade-offs
// ============================================================================

function explainUpgradeability(): void {
  console.log("\n" + "=".repeat(70));
  console.log("UPGRADEABILITY: hash_type 'data' vs 'type'");
  console.log("=".repeat(70));

  console.log(`
CKB scripts can be referenced in two fundamentally different ways,
and this choice determines whether your protocol can ever be upgraded.

hash_type: "data1" (IMMUTABLE)
================================
  Script reference: { code_hash: blake2b(binary), hash_type: "data1" }

  - The code_hash is the ACTUAL HASH OF THE BINARY.
  - There is no way to replace this binary. Ever.
  - Cells using this lock/type script will ALWAYS run the same exact code.
  - The protocol is ossified. No admin can change it.

  PROS:
    + Users can trust the exact behavior of the script forever
    + No admin key can upgrade and steal funds
    + Consistent with "code is law" philosophy
    + Good for trustless, long-running protocols

  CONS:
    - Bugs cannot be fixed without user migration to a new script
    - No ability to add features
    - Users must manually move to a new deployment if needed

  USE WHEN: The script is simple, well-audited, and correctness is critical.
  Examples: Standard lock scripts, well-tested token type scripts

hash_type: "type" (UPGRADEABLE via Type ID)
=============================================
  Script reference: { code_hash: type_id, hash_type: "type" }

  Type IDs work like this:
  - The code cell has a special type script with a unique type_id
  - When you "upgrade" the script, you replace the code cell's content
    in a transaction that proves you control the type_id admin key
  - All cells referencing this type_id now automatically run the new code

  HOW TO UPGRADE:
    1. Deploy the new binary in a NEW transaction output
    2. In the same transaction, consume the OLD code cell
       (requires the admin key that controls it)
    3. The new code cell has the same type ID script
    4. All dependent cells now use the new code at the next transaction

  PROS:
    + Bugs can be fixed
    + Features can be added
    + Appropriate for protocols in active development

  CONS:
    - Requires an admin key (centralization risk)
    - Users must trust the admin not to upgrade maliciously
    - Complex governance needed for decentralized upgrades

  USE WHEN: Protocol is in early stages, bugs are likely, or features
  are expected to evolve. Must have a governance/timelock mechanism.

THE PRACTICAL RECOMMENDATION
==============================
  For first deployments:  Use "type" with a timelock mechanism.
    - Allows bug fixes during the critical early period
    - Lock the timelock to at least 7 days to allow users to exit

  For mature protocols:  Migrate to "data1" or transfer type_id to a
    multisig with a governance vote requirement.

  Never: Use a single-key admin with "type" hash_type on production scripts
    that hold significant user value. This is a centralization time bomb.

REAL-WORLD EXAMPLE: The Default Lock Script
=============================================
CKB's built-in SECP256K1 lock (the most commonly used lock script) uses
hash_type "data1". The Nervos Foundation deployed it once during genesis
and it has never been changed. This immutability is a feature, not a bug -
billions of dollars worth of CKB is protected by it precisely because
everyone knows the code cannot change.
`);
}

// ============================================================================
// SECTION 4: Monitoring
// ============================================================================

function explainMonitoring(): void {
  console.log("\n" + "=".repeat(70));
  console.log("MONITORING DEPLOYED CONTRACTS");
  console.log("=".repeat(70));

  console.log(`
Once your contract is on mainnet, you need eyes on it.
Here is what to monitor and how:

1. SCRIPT CELL EXISTENCE (Critical)
=====================================
Your deployment cell should NEVER be consumed. Monitor it:

  // Subscribe to transactions using the WebSocket API
  const ws = new WebSocket("wss://mainnet.ckb.dev/ws");
  ws.send(JSON.stringify({
    id: 1,
    jsonrpc: "2.0",
    method: "subscribe",
    params: ["new_transaction"],
  }));

  ws.onmessage = (event) => {
    const tx = JSON.parse(event.data);
    for (const input of tx.transaction.inputs) {
      if (input.previousOutput.txHash === SCRIPT_DEPLOYMENT_TX_HASH) {
        ALERT("CRITICAL: Script cell consumed! Protocol may be broken!");
      }
    }
  };

2. TOTAL VALUE LOCKED (TVL)
============================
Track how much CKB is locked in your protocol's cells:

  async function getTVL(client) {
    const cells = await client.findCells({
      script: YOUR_SCRIPT,
      scriptType: "lock",
      scriptSearchMode: "prefix",
    });

    let tvl = 0n;
    for await (const cell of cells) {
      tvl += cell.cellOutput.capacity;
    }
    return tvl;
  }

3. ACTIVE USERS AND CELLS
===========================
Track the number of active cells (proxy for active users):

  async function getActiveCells(client) {
    let count = 0;
    for await (const _ of client.findCells({ ... })) {
      count++;
    }
    return count;
  }

4. ANOMALY DETECTION
=====================
Alert on:
  - TVL dropping by >20% in one block (potential mass exit or attack)
  - Unusual transaction sizes (very large inputs = aggregation attack?)
  - Failed transaction spike (users hitting a bug?)
  - Script cell's block confirmation resetting (reorg?)

5. SIMPLE MONITORING DASHBOARD
================================
Build a simple Node.js script that runs every few minutes:
  - Fetch current TVL and active cells
  - Compare to previous values
  - Alert via Telegram/Discord webhook if anomalies detected
  - Log all metrics to a time series database

This does not need to be complex - a simple Node.js cron job querying
the CKB indexer every 5 minutes with email alerts covers 90% of cases.
`);
}

// ============================================================================
// SECTION 5: Emergency Response
// ============================================================================

function explainEmergencyResponse(): void {
  console.log("\n" + "=".repeat(70));
  console.log("EMERGENCY RESPONSE PLAN");
  console.log("=".repeat(70));

  console.log(`
No matter how well you test, emergencies happen. Have a plan BEFORE
you need it. The worst time to figure out your response is during an incident.

RESPONSE LEVELS
================

LEVEL 1: Unusual Activity (Investigate, no immediate action)
  - TVL changed unexpectedly
  - Error rate spike in frontend
  - Response: Investigate, prepare Level 2 response, do NOT panic-act

LEVEL 2: Confirmed Bug (Pause if possible, prepare migration)
  - A bug has been exploited or is being exploited
  - Response (if using "type" hash_type): prepare emergency upgrade
  - Response (if using "data1"): announce bug, guide users to migrate,
    deploy fixed version to a new address

LEVEL 3: Funds at Risk (Act immediately)
  - Private key compromise suspected
  - Active draining of protocol funds
  - Response:
    1. Move admin capability to a new secure key immediately
    2. Announce to community via official channels
    3. If upgrade is possible: deploy fix immediately
    4. Contact CKB Foundation and ecosystem partners for support

COMMUNICATION PLAN
===================
Prepare these templates before mainnet:
  - Twitter/X announcement template for various scenarios
  - Discord announcement template
  - Community mailing list emergency update format
  - How to reach your team members after hours

CONTACT LIST (CKB Ecosystem)
==============================
  CKB Foundation security: security@nervos.org
  CKB Developer forum: https://talk.nervos.org
  CKB Discord: https://discord.gg/nervosnetwork
  CKB Explorer team: (for transaction investigation help)

AFTER AN INCIDENT
==================
  1. Write a full post-mortem (what happened, how, why, timeline)
  2. Publish it publicly - transparency builds trust
  3. Implement all identified improvements
  4. Update your security checklist with new findings
  5. Consider a formal security audit before re-launch
`);
}

// ============================================================================
// SECTION 6: Deployment Simulation
// ============================================================================

interface DeploymentRecord {
  network: "devnet" | "testnet" | "mainnet";
  scriptName: string;
  deploymentTxHash: string;
  cellIndex: number;
  codeHash: string;
  hashType: "data" | "data1" | "type";
  deployedAt: string;
  verifiedAt?: string;
}

function simulateDeploymentFlow(): void {
  console.log("\n" + "=".repeat(70));
  console.log("DEPLOYMENT SIMULATION: TRACKING DEPLOYMENT RECORDS");
  console.log("=".repeat(70));

  // Simulate what a real deployment tracking system would record
  const deployments: DeploymentRecord[] = [
    {
      network: "devnet",
      scriptName: "TokenDexLock",
      deploymentTxHash: "0x" + "dead".repeat(16),
      cellIndex: 0,
      codeHash: "0x" + "cafe".repeat(16),
      hashType: "data1",
      deployedAt: "2024-01-15T10:30:00Z",
      verifiedAt: "2024-01-15T10:31:00Z",
    },
    {
      network: "testnet",
      scriptName: "TokenDexLock",
      deploymentTxHash: "0x" + "beef".repeat(16),
      cellIndex: 0,
      codeHash: "0x" + "cafe".repeat(16), // Same binary, same hash
      hashType: "data1",
      deployedAt: "2024-01-20T14:00:00Z",
      verifiedAt: "2024-01-20T14:05:00Z",
    },
    {
      network: "mainnet",
      scriptName: "TokenDexLock",
      deploymentTxHash: "0x" + "f00d".repeat(16),
      cellIndex: 0,
      codeHash: "0x" + "cafe".repeat(16), // Same binary, same hash
      hashType: "data1",
      deployedAt: "2024-02-01T12:00:00Z",
      verifiedAt: "2024-02-01T12:10:00Z",
    },
  ];

  console.log(`\nDeployment Records for TokenDexLock:`);
  deployments.forEach((d) => {
    console.log(`\n  Network:  ${d.network.toUpperCase()}`);
    console.log(`    TX Hash:   ${d.deploymentTxHash.slice(0, 20)}...`);
    console.log(`    Code Hash: ${d.codeHash.slice(0, 20)}...`);
    console.log(`    Hash Type: ${d.hashType}`);
    console.log(`    Deployed:  ${d.deployedAt}`);
    console.log(`    Verified:  ${d.verifiedAt ?? "PENDING"}`);
  });

  // Verify that all networks have the same code hash (critical check!)
  const devnetHash = deployments.find((d) => d.network === "devnet")?.codeHash;
  const testnetHash = deployments.find((d) => d.network === "testnet")?.codeHash;
  const mainnetHash = deployments.find((d) => d.network === "mainnet")?.codeHash;

  console.log(`\nCode Hash Consistency Check:`);
  if (devnetHash === testnetHash && testnetHash === mainnetHash) {
    console.log("  [PASS] All three networks have identical code hashes.");
    console.log("         The same binary was deployed to devnet, testnet, and mainnet.");
  } else {
    console.log("  [FAIL] Code hashes differ across networks!");
    console.log("         STOP: Different binaries may have been deployed. Investigate.");
  }
}

// ============================================================================
// SECTION 7: Production Best Practices Summary
// ============================================================================

function explainBestPractices(): void {
  console.log("\n" + "=".repeat(70));
  console.log("PRODUCTION BEST PRACTICES: QUICK REFERENCE");
  console.log("=".repeat(70));

  const practices = [
    {
      title: "1. DOCUMENT EVERYTHING",
      items: [
        "Record all deployment transaction hashes and code hashes",
        "Maintain a deployments.json for each network",
        "Write a runbook: step-by-step operational procedures",
        "Document the expected behavior of each transaction type",
      ],
    },
    {
      title: "2. KEY HYGIENE",
      items: [
        "Hardware wallet for mainnet deployment and admin keys",
        "Separate keys for testnet and mainnet",
        "Multisig for any admin capability",
        "Regular key rotation schedule (at least annually)",
      ],
    },
    {
      title: "3. TESTING DISCIPLINE",
      items: [
        "100% branch coverage on security-critical paths",
        "Integration tests on devnet before any testnet deployment",
        "Full transaction flow tests on testnet before mainnet",
        "Automated regression tests in CI/CD pipeline",
      ],
    },
    {
      title: "4. SECURITY MINDSET",
      items: [
        "Assume every input is malicious until proven safe",
        "Validate lengths before parsing any field",
        "Use checked arithmetic (checked_add, checked_mul)",
        "Consider professional audit for high-value protocols",
      ],
    },
    {
      title: "5. MONITORING AND RESPONSE",
      items: [
        "Monitor script cell existence (should never be consumed)",
        "Track TVL and alert on unusual drops",
        "Have an emergency communication plan ready",
        "Write post-mortems after any incident",
      ],
    },
    {
      title: "6. UPGRADEABILITY STRATEGY",
      items: [
        "Choose hash_type based on protocol maturity",
        "If using 'type', have a governance mechanism",
        "Plan for the 'no upgrade' path even with upgradeable scripts",
        "Document the migration path for users if you change scripts",
      ],
    },
  ];

  practices.forEach(({ title, items }) => {
    console.log(`\n${title}`);
    items.forEach((item) => console.log(`  • ${item}`));
  });
}

// ============================================================================
// SECTION 8: Congratulations - What You Have Learned
// ============================================================================

function printCongratulations(): void {
  console.log("\n" + "=".repeat(70));
  console.log("CONGRATULATIONS! YOU HAVE COMPLETED THE COURSE");
  console.log("=".repeat(70));

  console.log(`
You have come a long way. Here is what you have mastered across 24 lessons:

FOUNDATIONS (Lessons 1-5)
==========================
  Lesson  1: The Cell Model - CKB's fundamental data structure
  Lesson  2: Transaction Anatomy - inputs, outputs, witnesses
  Lesson  3: Capacity - the economics of on-chain storage
  Lesson  4: Developer Environment - offckb, CKB-VM, toolchain
  Lesson  5: Your First Transfer - sending CKB programmatically

BLOCKCHAIN PRIMITIVES (Lessons 6-12)
======================================
  Lesson  6: Cell Explorer - querying and understanding live cells
  Lesson  7: Script Basics - lock and type script architecture
  Lesson  8: Hash Lock - building a simple custom lock script in Rust
  Lesson  9: Script Debugging - ckb-debugger, ckb-testtool
  Lesson 10: Type Script Counter - state machines on CKB
  Lesson 11: xUDT Tokens - the fungible token standard
  Lesson 12: CKB-VM Deep Dive - RISC-V, syscalls, optimizations

ADVANCED PROTOCOLS (Lessons 13-17)
=====================================
  Lesson 13: Token Economics - supply caps, inflation, governance
  Lesson 14: Multi-Asset Wallets - managing multiple token types
  Lesson 15: Omnilock - supporting every wallet with one lock script
  Lesson 16: Composability Patterns - combining scripts safely
  Lesson 17: Cell Management - dust, batching, lifecycle

INFRASTRUCTURE (Lessons 18-21)
================================
  Lesson 18: RPC Dashboard - direct JSON-RPC, monitoring tools
  Lesson 19: Full Node Setup - running your own CKB node
  Lesson 20: Light Client App - privacy-preserving sync
  Lesson 21: RGB++ Explorer - cross-chain assets on CKB

ADVANCED DEFI AND DAPPS (Lessons 22-24)
==========================================
  Lesson 22: Token DEX - atomic swaps, orderbook, partial fills
  Lesson 23: NFT Marketplace - Spore, CCC, full-stack dApp
  Lesson 24: Mainnet Deployment - security, monitoring, production

WHAT YOU CAN BUILD NOW
======================

  dApps:
    - Decentralized exchanges (UTXOSwap-style)
    - NFT marketplaces (JoyID-style)
    - Token vesting contracts
    - Escrow services
    - Decentralized governance

  Infrastructure:
    - Custom indexers for your protocol
    - Light-client mobile wallets
    - Multi-asset portfolio trackers
    - Cross-chain bridges (RGB++ pattern)

  DeFi:
    - Orderbook markets for any asset pair
    - Yield farming with xUDT
    - Stablecoin systems
    - Lending protocols

WHAT COMES NEXT
================

The CKB ecosystem is rapidly evolving. Here are areas to explore:

1. FIBER NETWORK (CKB's Lightning Network)
   Fast, cheap off-chain payments using the Lightning protocol
   adapted for CKB's cell model.
   https://github.com/nervosnetwork/fiber

2. RGB++ PROTOCOL
   Brings Bitcoin DeFi to CKB by binding Bitcoin UTXOs to CKB cells.
   Creates a cross-chain asset layer without a traditional bridge.
   https://rgbpp.io

3. UTXO SWAP
   Production DEX using the exact patterns from Lesson 22.
   Study its architecture and contribute.
   https://utxoswap.xyz

4. SPORE PROTOCOL
   Deep dive into Spore's advanced features: clusters, mutations,
   on-chain generative art.
   https://docs.spore.pro

5. CKB COMMUNITY
   - CKB Developer Forum: https://talk.nervos.org
   - GitHub: https://github.com/nervosnetwork
   - Discord: https://discord.gg/nervosnetwork
   - Twitter: @NervosNetwork

6. CONTRIBUTING TO CKB
   CKB is open-source and welcomes contributions to:
   - Core CKB node (Rust)
   - CCC JavaScript SDK
   - Spore SDK
   - Ecosystem tooling and documentation

FINAL THOUGHTS
==============

CKB is one of the most technically sophisticated blockchains in existence.
Its RISC-V VM, cell model, and programmable scripts create a platform where
the limits are set by your imagination, not by the platform's constraints.

The patterns you have learned — order cells, type script state machines,
composable lock scripts, atomic swaps — are not CKB-specific tricks. They
are fundamental ways of thinking about decentralized state that apply
broadly across UTXO-based systems.

You are now part of a small but growing community of developers who deeply
understand how CKB works. Use that knowledge to build things that matter.

Good luck, and welcome to the CKB ecosystem.
`);
}

// ============================================================================
// MAIN: Run All Sections
// ============================================================================

async function main(): Promise<void> {
  // Section 1: Deployment pipeline overview
  explainDeploymentPipeline();

  // Section 2: Script verification
  explainScriptVerification();

  // Section 3: Upgradeability trade-offs
  explainUpgradeability();

  // Section 4: Deployment simulation
  simulateDeploymentFlow();

  // Section 5: Monitoring
  explainMonitoring();

  // Section 6: Emergency response
  explainEmergencyResponse();

  // Section 7: Security checklist
  console.log("\n" + "=".repeat(70));
  console.log("RUNNING SECURITY CHECKLIST");
  console.log("=".repeat(70));
  runSecurityChecklist();

  // Section 8: Best practices
  explainBestPractices();

  // Section 9: Congratulations
  printCongratulations();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
