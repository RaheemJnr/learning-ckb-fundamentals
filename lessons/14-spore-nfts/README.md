# Lesson 14: Digital Objects with Spore

## Overview

This lesson introduces the Spore protocol, CKB's framework for creating **Digital Objects (DOBs)** -- a fundamentally different approach to on-chain digital assets compared to traditional NFT standards like Ethereum's ERC-721.

By the end of this lesson, you will understand:

- Why Spore Digital Objects have **intrinsic value** backed by locked CKB tokens
- How ALL Spore content is stored **fully on-chain** (no IPFS, no external servers)
- How to create a Spore with text content and link it to a Cluster collection
- How Spore **Clusters** organize related Digital Objects into named collections
- How **melting** a Spore destroys it while returning the locked CKB to the creator
- The economic model that gives every Spore a guaranteed minimum floor value
- How Spore compares to traditional NFT standards

## Prerequisites

- Node.js 18 or later
- Completion of Lessons 1-13 (especially Lessons 7-10 for script knowledge)
- A testnet CKB address funded with at least 300 CKB
  - Get testnet CKB from the faucet: https://faucet.nervos.org/

## Setup

```bash
cd lessons/14-spore-nfts
npm install
```

## Running

```bash
npm start
# or
npx tsx src/index.ts
```

If your testnet account has insufficient balance, the script will run in **demonstration mode**, which explains all concepts and shows encoding/decoding without sending transactions.

## What This Lesson Covers

### 1. Spore Protocol Introduction

The Spore protocol defines a standard for creating "Digital Objects" on CKB. Unlike traditional NFTs:

| Property | Traditional NFT | Spore Digital Object |
|----------|-----------------|----------------------|
| Content storage | IPFS or HTTP URL | 100% on-chain (cell data) |
| Floor value | None (market only) | Locked CKB (always recoverable) |
| Receive without funds | No (need gas) | Yes (cell is self-funded) |
| Destroying | Burns forever | Melting returns CKB |
| Content permanence | Depends on IPFS/server | Permanent (on-chain) |
| Content mutability | Mutable if URL changes | Immutable by protocol |

### 2. Spore Cell Structure

Every Spore is a CKB cell with this structure:

```
Cell {
  capacity:  <CKB locked in shannons>
  lock:      <owner's lock script>
  type: {
    code_hash: <Spore script code_hash>
    hash_type: "data1"
    args:      <32-byte Spore ID>
  }
  data: <Molecule-encoded SporeData {
    content_type: bytes  -- MIME type (e.g., "text/plain")
    content:      bytes  -- The actual content
    cluster_id:   bytes? -- Optional: collection reference
  }>
}
```

### 3. Intrinsic Value

Creating a Spore **locks CKB tokens** inside it. The minimum locked amount covers:

```
minimum_capacity = 8   (capacity field)
                + 32  (lock code_hash)
                + 1   (lock hash_type)
                + 20  (lock args)
                + 32  (type code_hash)
                + 1   (type hash_type)
                + 32  (type args = spore_id)
                + N   (data = encoded SporeData)
                      bytes total
```

**This CKB is always yours.** You can melt the Spore at any time to recover it.

### 4. Spore Clusters

Clusters are separate CKB cells that group related Spores into named collections:

```
Cluster Cell {
  type: { code_hash: CLUSTER_SCRIPT, args: <cluster_id> }
  data: <Molecule ClusterData { name: bytes, description: bytes }>
}
```

Spores can reference a Cluster by including its ID in the `cluster_id` field of their SporeData. The Spore type script validates the cluster exists on-chain.

### 5. Supported Content Types

Spore supports standard MIME types for diverse digital objects:

| MIME Type | Use Case |
|-----------|----------|
| `text/plain` | Text messages, poems, descriptions |
| `text/markdown` | Rich text with Markdown formatting |
| `image/png` | PNG images (raster) |
| `image/jpeg` | JPEG images |
| `image/svg+xml` | SVG vector graphics |
| `image/gif` | Animated GIFs |
| `audio/mp3` | Music and audio clips |
| `video/mp4` | Short video clips |
| `application/json` | Structured metadata, traits |
| `application/lua` | Interactive/programmable DOBs |
| `model/obj` | 3D object files |

### 6. Melting (Destruction)

Melting destroys a Spore and returns its locked CKB to the creator:

```typescript
// Melt transaction structure:
const meltTx = ccc.Transaction.from({
  cellDeps: [SPORE_CELL_DEP],
  inputs: [
    { previousOutput: sporeOutPoint },  // The Spore (consumed)
  ],
  outputs: [
    {
      capacity: sporeCapacity - fee,    // CKB returned to creator
      lock: creatorLock,
    },
  ],
});
```

Key restriction: Only the **original creator** can melt a Spore. The Spore type script enforces this by requiring the creator's lock hash to be present in the transaction's inputs.

### 7. Molecule Serialization

Spore data uses [Molecule](https://github.com/nervosnetwork/molecule), CKB's binary serialization format. The encoding for SporeData is a Molecule table:

```
Bytes: [total_size(4)] [offset_0(4)] [offset_1(4)] [offset_2(4)] [content_type] [content] [cluster_id]
         little-endian uint32 for all integers
```

The offsets point to where each field starts in the byte array, enabling efficient random access.

### 8. Using the Official Spore SDK

For production use, the `@spore-sdk/core` package handles all encoding, cell dep resolution, and transaction building automatically:

```typescript
import { createSpore, createCluster, meltSpore } from "@spore-sdk/core";

// Create a Cluster
const { txSkeleton: clusterSkeleton } = await createCluster({
  data: {
    name: "My Collection",
    description: "A curated collection",
  },
  toLock: creatorScript,
  fromInfos: [creatorAddress],
});

// Create a Spore
const { txSkeleton, outputIndex } = await createSpore({
  data: {
    contentType: "text/plain",
    content: new TextEncoder().encode("Hello, on-chain world!"),
    clusterId: myClusterId,
  },
  toLock: creatorScript,
  fromInfos: [creatorAddress],
});

// Melt a Spore
const { txSkeleton: meltSkeleton } = await meltSpore({
  outPoint: sporeOutPoint,
  fromInfos: [creatorAddress],
});
```

## Real-World Examples

- **.bit Domains**: Domain name NFTs implemented as Spore DOBs with JSON data
- **Gaming Assets**: On-chain game items with stats stored as JSON or Lua
- **Digital Certificates**: Permanent, tamper-proof credentials on-chain
- **On-Chain Art**: SVG or pixel art stored entirely in cell data
- **Interactive DOBs**: Lua-scripted objects with programmable behavior
- **Music**: Audio clips stored directly on the blockchain

## Capacity Cost Examples

| Content | Approx Size | Min CKB Locked |
|---------|-------------|----------------|
| Short text (50 chars) | ~66 bytes | ~192 CKB |
| Long text (1000 chars) | ~1,016 bytes | ~202 CKB |
| Small SVG icon | ~500 bytes | ~197 CKB |
| Small PNG (64x64) | ~5,000 bytes | ~242 CKB |
| Full PNG image (1024x768) | ~500,000 bytes | ~5,127 CKB |
| JSON metadata | ~200 bytes | ~193 CKB |
| Lua script | ~2,000 bytes | ~211 CKB |

All of these CKB amounts are **recoverable by melting**.

## Project Structure

```
14-spore-nfts/
├── package.json        # Dependencies: @ckb-ccc/core, @spore-sdk/core, tsx
├── tsconfig.json       # TypeScript configuration
├── README.md           # This file
└── src/
    └── index.ts        # Main educational script
```

## Key Resources

- [Spore Protocol SDK](https://github.com/sporeprotocol/spore-sdk)
- [Spore Documentation](https://docs.spore.pro/)
- [Spore Demo Application](https://a-simple-demo.spore.pro/)
- [Molecule Serialization Spec](https://github.com/nervosnetwork/molecule)
- [CKB Testnet Explorer](https://pudge.explorer.nervos.org/)
- [Testnet Faucet](https://faucet.nervos.org/)

## Next Lesson

Lesson 15 covers **Omnilock**, CKB's universal lock script that enables signing CKB transactions with wallets from other blockchains (Ethereum, Solana, Bitcoin) using their native signature formats.
