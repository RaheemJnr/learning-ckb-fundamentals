# Lesson 20: Light Client Development on CKB

## What You Will Learn

- What a light client is and why it exists
- CKB's FlyClient-based light client protocol
- How logarithmic header sampling works
- The difference between light client and full node APIs
- How to install and run the CKB light client binary
- How to register scripts and query cells via the light client
- Storage comparison: full node vs light client
- Real-world use cases for light clients

## Prerequisites

- Lessons 1-19 completed
- Node.js 18+ installed
- Basic understanding of CKB cells and scripts (Lessons 1-7)

---

## What Is a Light Client?

A **light client** (also called an SPV client — Simplified Payment Verification) participates in a blockchain network WITHOUT downloading and verifying every block. Instead of storing 100+ GB of block data, it:

1. Downloads only block **headers** (tiny, ~200 bytes each)
2. Asks full nodes for specific cell data
3. Verifies cell existence using **Merkle proofs**

This makes light clients viable for devices that cannot run a full node:

| Device | Full Node Viable? | Light Client Viable? |
|---|---|---|
| Server / Desktop | Yes | Yes |
| Laptop | Maybe (100+ GB) | Yes |
| Mobile Phone | No | Yes |
| Browser Extension | No | Yes |
| IoT Device | No | Yes (limited) |

---

## CKB's FlyClient-Based Protocol

### The Problem with Traditional SPV

Bitcoin's original SPV protocol requires downloading ALL block headers since genesis. For CKB:

- ~14 million blocks (as of 2025)
- ~200 bytes per header
- = ~2.8 GB of headers alone

That is still far too large for many environments.

### FlyClient: Logarithmic Header Downloads

CKB's light client implements a protocol inspired by the [FlyClient paper](https://eprint.iacr.org/2019/226.pdf) (Bunz et al., 2019). The key insight:

**You do not need to download ALL headers — just O(log n) randomly sampled ones.**

How it works:

1. **Merkle Mountain Range (MMR)**: Each block header commits to the total accumulated difficulty of all previous headers using an MMR structure embedded in the header.

2. **Sampling**: The light client samples headers at logarithmically spaced positions. Recent blocks are more densely sampled; ancient blocks are sparsely sampled.

3. **Verification**: By checking the sampled headers against each other's MMR commitments, the light client verifies the total proof-of-work with high probability.

4. **Security**: An attacker who tries to fake a long chain must fake specific headers that fall on the client's random sample positions — exponentially hard.

### Why NC-Max Makes This Efficient

CKB uses **NC-Max consensus** (an improvement on Nakamoto Consensus) that makes FlyClient more efficient:

- Difficulty adjusts **every epoch** (~4 hours of blocks), not every 2016 blocks like Bitcoin
- Uncle blocks are tracked and included in difficulty calculations
- MMR commitments are a native part of the header structure
- The header format was designed from the start with light clients in mind

### Storage Numbers

| Sync Mode | Storage Required | Download Time |
|---|---|---|
| Archive Full Node | 300+ GB | Days |
| Pruned Full Node | 100+ GB | Hours-Days |
| Light Client | < 1 MB | Minutes |
| Stateless Verification | ~0 MB | Seconds |

---

## What Can a Light Client Do?

### Supported Operations

| Operation | Light Client | Full Node |
|---|---|---|
| `get_tip_header` | Yes | Yes |
| `get_cells` (for registered scripts) | Yes | Yes |
| `send_transaction` | Yes | Yes |
| `get_transaction` (recent) | Yes (limited) | Yes |
| `set_scripts` (register watch) | Yes | No |
| `get_scripts` (list watched) | Yes | No |

### NOT Supported by Light Clients

| Operation | Reason |
|---|---|
| `get_block` (arbitrary block) | Light client only has sampled headers |
| `get_blockchain_info` | Requires full chain traversal |
| Complete transaction history | No historical block data |
| Arbitrary script queries (unregistered) | Must pre-register scripts |

The key limitation: the light client only indexes cells for scripts you explicitly registered via `set_scripts`. It has **no index** for arbitrary scripts.

---

## Installing the CKB Light Client

### Step 1: Download the Binary

```bash
# Visit the GitHub releases page
# https://github.com/nervosnetwork/ckb-light-client/releases

# Download the appropriate binary for your platform
# macOS (Apple Silicon):
curl -LO https://github.com/nervosnetwork/ckb-light-client/releases/latest/download/ckb-light-client-macos-arm64.tar.gz
tar xf ckb-light-client-macos-arm64.tar.gz

# macOS (Intel):
curl -LO https://github.com/nervosnetwork/ckb-light-client/releases/latest/download/ckb-light-client-macos-x86_64.tar.gz
tar xf ckb-light-client-macos-x86_64.tar.gz

# Linux (x86_64):
curl -LO https://github.com/nervosnetwork/ckb-light-client/releases/latest/download/ckb-light-client-linux-x86_64.tar.gz
tar xf ckb-light-client-linux-x86_64.tar.gz
```

### Step 2: Initialize Configuration for Testnet

```bash
# Create a directory for the light client data
mkdir -p ~/ckb-light-client
cd ~/ckb-light-client

# Initialize the configuration
./ckb-light-client init --chain testnet
```

This creates:
- `ckb-light-client.toml` — main configuration file
- `specs/` — network specifications

### Step 3: Configure the RPC Port

Edit `ckb-light-client.toml`:

```toml
[rpc]
listen_address = "127.0.0.1:9000"  # Default port for light client

[network]
# Testnet bootnodes are auto-configured
# You can add custom peers here
```

### Step 4: Start the Light Client

```bash
# From the directory containing ckb-light-client binary
./ckb-light-client run
```

You should see output like:
```
2025-06-15 14:32:00 INFO  ckb_light_client  Starting light client on testnet
2025-06-15 14:32:01 INFO  network          Listening on /ip4/0.0.0.0/tcp/18114
2025-06-15 14:32:01 INFO  rpc              RPC server started at 127.0.0.1:9000
2025-06-15 14:32:02 INFO  sync             Starting FlyClient header sync
2025-06-15 14:32:45 INFO  sync             Header sync complete. Tip: #14523881
```

The initial sync typically completes in **1-5 minutes** depending on your connection.

---

## Running the Lesson Code

```bash
cd lessons/20-light-client-app
npm install
npm start
```

If the light client binary is not running, the demo runs in **demo mode** — it shows what the output would look like and explains each concept, but uses a public testnet full node for live data where possible.

---

## Using the Light Client in Your Application

### Step 1: Register Scripts to Watch

Before querying cells, you MUST tell the light client which lock scripts to index:

```typescript
// Using raw JSON-RPC
const response = await fetch("http://localhost:9000", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "set_scripts",
    params: [[
      {
        script: {
          code_hash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
          hash_type: "type",
          args: "0xYOUR_BLAKE160_HASH_HERE",
        },
        script_type: "lock",
        block_number: "0x0",  // Sync from genesis, or use current block for new wallets
      }
    ]],
  }),
});
```

### Step 2: Query Live Cells

After sync completes (usually seconds to minutes), query live cells:

```typescript
const cellsResponse = await fetch("http://localhost:9000", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "get_cells",
    params: [{
      script: yourLockScript,
      script_type: "lock",
      filter: null,
    }, "asc", "0x64", null],
  }),
});
```

### Step 3: Using @ckb-ccc/core

The `@ckb-ccc/core` library works with both full nodes and light clients transparently:

```typescript
import { ccc } from "@ckb-ccc/core";

// For light client, use a custom client pointing at localhost:9000
const client = new ccc.ClientPublicTestnet();
// (or configure it to point at your light client URL)

// The findCells API is identical regardless of full node or light client
for await (const cell of client.findCells({ script: lockScript, scriptType: "lock" })) {
  console.log(cell.outPoint.txHash, cell.cellOutput.capacity);
}
```

---

## API Reference: Light-Client-Specific Methods

### `set_scripts`

Registers lock/type scripts for the light client to watch and index.

```typescript
// Request
{
  "method": "set_scripts",
  "params": [[
    {
      "script": { "code_hash": "0x...", "hash_type": "type", "args": "0x..." },
      "script_type": "lock",      // "lock" or "type"
      "block_number": "0x0"       // Start syncing from this block
    }
  ]]
}

// Response: null (or error)
```

**Important**: Calling `set_scripts` with a new list **replaces** the existing list. To add a script, first call `get_scripts`, append to the list, then call `set_scripts`.

### `get_scripts`

Returns all currently registered scripts and their sync status.

```typescript
// Request
{ "method": "get_scripts", "params": [] }

// Response
[
  {
    "script": { "code_hash": "0x...", "hash_type": "type", "args": "0x..." },
    "script_type": "lock",
    "block_number": "0xDEA8A9"  // Current sync height for this script
  }
]
```

### Standard Methods (also available on full nodes)

- `get_tip_header` — Current chain tip header
- `get_cells` — Live cells for registered scripts
- `send_transaction` — Broadcast a transaction
- `get_transaction` — Get a transaction by hash (may not work for historical txs)
- `get_header` — Get header by block hash

---

## Security Properties

### What the Light Client Guarantees

1. **Header validity**: The chain tip has the highest accumulated proof-of-work among sampled chains. If this fails, the attacker had to do enormous work.

2. **Cell existence**: If a Merkle proof validates against a verified header, the cell provably exists in the chain.

3. **Transaction inclusion**: If a transaction's hash appears in a block's `transactions_root` (proved by Merkle proof), it is confirmed.

### What the Light Client Does NOT Guarantee

1. **Complete history**: The light client cannot prove that a specific transaction NEVER happened.

2. **Full validation**: Scripts are not executed locally. The light client trusts that full nodes executed them correctly.

3. **Finality certainty**: Like all PoW chains, finality is probabilistic. More confirmations = more certainty.

---

## Common Pitfalls

### Forgetting set_scripts Before Querying

If you query `get_cells` for a script you haven't registered, the light client returns empty results — not an error. Always call `set_scripts` first and wait for sync.

### Sync Delay

After registering a script, there is a delay before the index is populated. For wallets, register the lock script when the user first creates their wallet (block_number = current), not from genesis.

### set_scripts Replaces, Not Appends

Every call to `set_scripts` replaces the entire list. If you want to add a new script without removing the old ones, you must merge them:

```typescript
const existing = await getScripts();
const newList = [...existing, newScript];
await setScripts(newList);
```

---

## Summary

| Concept | Summary |
|---|---|
| Light client protocol | FlyClient-based, logarithmic header sampling |
| Storage savings | < 1 MB vs 100+ GB for full node |
| Security basis | MMR commitments + sampled header verification |
| Key API difference | Must call set_scripts before querying cells |
| Best use cases | Mobile wallets, browser extensions, IoT, dApps |
| Limitation | No historical data; only registered script queries |

In the next lesson, you will explore RGB++ — a protocol that uses CKB to bring smart contract capabilities to Bitcoin.
