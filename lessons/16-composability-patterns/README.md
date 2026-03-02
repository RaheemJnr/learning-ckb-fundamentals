# Lesson 16: CKB Composability Patterns

## Overview

CKB's composability model is fundamentally different from Solidity's. Instead of contracts calling each other, CKB composability is achieved by combining multiple independent scripts in a single transaction. Each script validates its own invariants and the transaction succeeds only when every script returns success. This lesson explores the patterns that emerge from this model: script-as-parameter, token-gated access, atomic swaps, and building permissionlessly on open protocols.

## What You Will Learn

- How CKB composability differs from Solidity's contract-call model
- The "open protocols" concept: anyone can use deployed scripts without permission
- Script-as-parameter pattern: using another script's identity as configuration
- Building a token-gated access system using xUDT + a custom gate script
- How multiple scripts interact in a single transaction (AND semantics)
- Atomic swaps using composable cell constraints
- Why re-entrancy attacks are impossible in CKB's model
- Designing dApps that compose existing protocols to reduce audit surface

## Prerequisites

- Completion of Lessons 1-15
- Understanding of CKB scripts (lock scripts and type scripts)
- Familiarity with xUDT tokens (Lesson 13)
- Node.js 18+

## Project Structure

```
16-composability-patterns/
├── src/
│   └── index.ts      # TypeScript CLI demonstrating composability patterns
├── package.json
├── tsconfig.json
└── README.md
```

## Quick Start

```bash
npm install
npm start
```

## Core Concept: Transaction-Level Composition

In Solidity, composability means Contract A calling Contract B:
```
ContractA.methodX() --CALL--> ContractB.methodY()
```

In CKB, composability means Script A and Script B both validating Transaction T:
```
Transaction T:
  Scripts run in parallel (logically):
    Script A: reads cells in T, returns 0 or error
    Script B: reads cells in T, returns 0 or error
  T is valid only if ALL scripts return 0
```

Scripts share no mutable state. Scripts cannot call each other. They see only the transaction's fixed cell data.

## Pattern 1: Script-as-Parameter

Configure your script by embedding another script's hash in its args:

```typescript
const gateScript = {
  codeHash: GATE_SCRIPT_CODE_HASH,
  hashType: "type",
  args: xudtTypeHash, // The gate is parameterized by WHICH token grants access
};
```

The gate script reads its args at runtime to know which token type to look for. The same gate binary works for any token — just change the args.

## Pattern 2: Token-Gated Access

Composition of two scripts for access control:

1. **Token cell** (`type: xUDT`): Proves the spender holds a specific token
2. **Content cell** (`type: gateScript`): Validates the spender's token is present

The gate script scans transaction inputs for a cell whose type hash matches the required token type. The xUDT type script independently validates token conservation. Neither script knows about the other — they just both validate the same transaction.

```
Transaction "Access Content":
  Inputs:  [content cell (gate type)] + [token cell (xUDT type)]
  Outputs: [consumed content] + [token cell returned to spender]

  gate script: "I see a token cell with the right type in inputs -> OK"
  xUDT script: "token in == token out -> OK"
  Both pass -> transaction valid
```

## Pattern 3: Atomic Swaps

On-chain swaps between two assets in a single transaction:

```
Inputs:  [Alice's TokenA cell] + [Bob's TokenB cell]
Outputs: [Bob's TokenA cell]  + [Alice's TokenB cell]

Scripts: Alice's lock + Bob's lock + TokenA type + TokenB type
All four must sign off for the swap to happen.
Atomic: either full swap or no swap.
```

For cross-chain swaps (CKB to Bitcoin), HTLCs use hash preimages to chain two separate transactions atomically.

## Pattern 4: Open Protocols

A script deployed with `hash_type: "data"` has a code_hash equal to `blake2b(binary)`. Anyone who knows this code_hash can reference the script. No permissions, no API keys, no onboarding.

| Protocol | What you can build on it (without asking) |
|----------|-------------------------------------------|
| xUDT | New tokens, DEXes, staking contracts, bridges |
| Spore | NFT marketplaces, rental protocols, IP licensing |
| Omnilock | Custom auth extensions, new wallet types |
| Nervos DAO | Staking aggregators, yield strategies |

## Composability vs Solidity: Key Differences

| Property | CKB | Solidity (Ethereum) |
|----------|-----|---------------------|
| Composition mechanism | Multiple scripts in same tx | Cross-contract CALL/DELEGATECALL |
| Re-entrancy attacks | Impossible (no calls) | Possible without guards |
| Mutable state during validation | None (scripts read tx only) | Yes (storage mutations) |
| Permission to compose | None needed (code_hash = public ID) | Owner can restrict via modifiers |
| Binary immutability | hash_type 'data' guarantees it | Upgradeability can change behavior |
| Audit surface | Per-script (bounded) | Per-call-path (unbounded) |

## Designing Composable dApps

Best practices for CKB dApp architecture:

1. **Reuse existing protocols** — use xUDT for tokens, Spore for NFTs, Omnilock for auth. You only write new scripts for your unique logic.

2. **Script-as-parameter** — make scripts generic by embedding referenced script hashes in args. Same binary, different configuration per cell.

3. **Minimize new script surface** — every new script is an audit target. More reuse = less risk.

4. **Think in cell types** — design your data model first (what cells exist and what they contain), then write scripts that validate transitions.

5. **AND semantics** — leverage the fact that all scripts must pass. Compose constraints by adding more scripts, not by building monolithic logic.

## Key Concepts

- **Open protocol**: A deployed script anyone can reference without permission
- **Script group**: All cells with the same script identity (code_hash + hash_type + args)
- **Atomic**: A CKB transaction fully succeeds or fully fails — no partial state
- **Cell dep**: Read-only reference in a transaction that provides script code
- **Script-as-parameter**: Using another script's hash as configuration in args

## Further Reading

- [CKB Script Programming](https://docs.nervos.org/docs/script/intro)
- [xUDT Protocol](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md)
- [Spore Protocol](https://spore.pro)
- [CKB Composability Blog Posts](https://blog.cryptape.com)
