# Lesson 24: Mainnet Deployment and Security

## Overview

This is the final lesson of the Learning CKB Fundamentals course. It covers the complete production deployment process: security auditing, the devnet → testnet → mainnet progression, script verification, monitoring, upgradeability strategies, and emergency response planning.

## What You Will Learn

- The three-environment deployment pipeline (devnet → testnet → mainnet)
- Pre-deployment script verification: computing and recording code hashes
- Deploying a script and building the deployment record
- Upgradeability trade-offs: `hash_type "data1"` (immutable) vs `hash_type "type"` (upgradeable via Type ID)
- Monitoring deployed contracts: script cell existence, TVL, anomalies
- Common vulnerability patterns in CKB scripts
- Key management for production (hardware wallets, multisig)
- Emergency response planning
- Production best practices

## Project Structure

```
24-mainnet-deployment/
├── src/
│   ├── index.ts              # Main demo - full deployment lifecycle walkthrough
│   └── security-checklist.ts # Interactive security checklist with explanations
├── scripts/
│   └── deploy-checklist.md   # Markdown checklist for production deployments
├── package.json
├── tsconfig.json
└── README.md
```

## Running the Demo

```bash
npm install
npm start          # Full deployment lifecycle walkthrough
npm run checklist  # Run the security checklist tool only
```

## Key Concepts

### The Three-Environment Pipeline

Every CKB deployment follows this path:

1. **Devnet**: Local node (`offckb`). Instant blocks, unlimited test CKB. Goal: basic functionality and unit tests passing.
2. **Testnet**: Public test network. Real network conditions, testnet CKB from faucet. Goal: all transaction types verified under realistic conditions.
3. **Mainnet**: Production. Real CKB, irreversible. Deploy only after full testnet verification.

### Script Verification

After deploying a script binary, record:
- `deploymentTxHash`: The transaction that created the code cell
- `cellIndex`: Which output in that transaction holds the code
- `codeHash`: `blake2b(binary)` — must match across all environments
- `hashType`: `"data1"` (immutable) or `"type"` (upgradeable)

The `codeHash` for the same binary should be identical on devnet, testnet, and mainnet. If they differ, different code was deployed — stop and investigate.

### Upgradeability Trade-offs

| | `hash_type: "data1"` | `hash_type: "type"` |
|--|--|--|
| Upgradeable? | No — immutable forever | Yes — via Type ID |
| Security | Higher (no admin key risk) | Lower (requires admin key) |
| Bug fixes | Requires user migration | Can upgrade in place |
| Use when | Mature, audited protocol | Early development |

### Common Vulnerability Patterns

- **Incomplete authorization**: Lock scripts that check some conditions but miss others
- **Missing operation cases**: Type scripts that handle update but not destroy (or vice versa)
- **Integer overflow**: Using `+` instead of `checked_add()` in token amount math
- **Fixed-index assumptions**: Assuming a specific cell is always at output index 0
- **Args length unchecked**: Reading args without validating their expected length

## Security Checklist

Run the interactive checklist:

```bash
npm run checklist
```

This covers:
1. Key management (hardware wallets, no keys in git, multisig)
2. Script vulnerability patterns
3. Cell data validation
4. Testing requirements (branch coverage, integration tests)
5. Deployment process (code hash recording, hash_type choice)
6. Monitoring setup

## Deployment Checklist

See `scripts/deploy-checklist.md` for a comprehensive phase-by-phase checklist covering code review, testing, testnet deployment, security review, mainnet deployment, and post-deployment verification.

## Monitoring Your Deployed Contract

Key things to monitor after mainnet deployment:

1. **Script cell existence**: The deployment cell should NEVER be consumed. Set up alerts if it is.
2. **TVL (Total Value Locked)**: Track capacity locked in your protocol's cells.
3. **Active cell count**: Number of live cells using your script (proxy for user count).
4. **Anomaly detection**: Alert on TVL drops >20%, unusual transaction patterns, error spikes.

## Emergency Response

Have a plan before you need it:

- **Level 1 (Unusual activity)**: Investigate, prepare response, do not act impulsively.
- **Level 2 (Confirmed bug)**: Prepare upgrade (if upgradeable) or migration path.
- **Level 3 (Funds at risk)**: Move admin key immediately, announce to community, contact CKB Foundation.

Contact: security@nervos.org

## What Comes Next

After completing this course, explore:
- **Fiber Network**: CKB's Lightning Network for fast off-chain payments
- **RGB++**: Cross-chain assets binding Bitcoin UTXOs to CKB cells
- **UTXOSwap**: Production DEX using the order cell pattern from Lesson 22
- **Spore Protocol**: Advanced NFT features (clusters, mutations, generative art)
- **CKB Community**: https://talk.nervos.org, https://discord.gg/nervosnetwork

## Related Lessons

- Lesson 7: Script Basics (understanding lock and type scripts)
- Lesson 10: Type Script Counter (deployment with code cells)
- Lesson 22: Token DEX (the script you might be deploying)
- Lesson 23: NFT Marketplace (the dApp you might be launching)
