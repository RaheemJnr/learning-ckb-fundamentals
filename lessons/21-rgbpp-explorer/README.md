# Lesson 21: RGB++ Protocol — Bitcoin & CKB Interoperability

## What You Will Learn

- What the RGB++ protocol is and how it extends the RGB concept
- The isomorphic binding between Bitcoin UTXOs and CKB Cells
- How the RGB++ lock script encodes Bitcoin UTXO references
- Dual-chain transaction verification (Bitcoin + CKB together)
- The "leap" operation: moving assets between Bitcoin-bound and CKB-native states
- Why RGB++ is NOT a bridge (no custodian, no wrapped tokens)
- The Fiber Network: Layer 2 payment channels for RGB++ assets
- How to find and decode RGB++ cells on the CKB blockchain
- Real-world RGB++ applications and ecosystem stats

## Prerequisites

- Lessons 1-20 completed
- Node.js 18+ installed
- Understanding of CKB cells and lock scripts (Lessons 1-7)
- Basic familiarity with Bitcoin UTXOs (helpful but not required)

---

## Background: The RGB Protocol

RGB is a protocol originally created for Bitcoin's Lightning Network ecosystem. It enables assets to be attached to Bitcoin UTXOs using "client-side validation" — meaning the asset rules are verified by the transaction participants, not by the broader Bitcoin network.

The original RGB is powerful but limited: it has no global verifiability, no smart contract support, and complex data management requirements.

**RGB++ extends RGB** by replacing client-side validation with on-chain validation on CKB. This makes asset state publicly verifiable, composable with CKB's smart contracts, and much simpler to reason about.

---

## The Core Concept: Isomorphic Binding

"Isomorphic" means "same structure." Bitcoin and CKB both use UTXO-like models:

- **Bitcoin**: Consume old UTXOs → create new UTXOs
- **CKB**: Consume old Cells → create new Cells

RGB++ exploits this structural similarity to create a one-to-one mapping:

```
Bitcoin UTXO (txid + vout)  ←→  CKB Cell (with RGB++ lock)
```

This is not metaphorical — it is a cryptographic binding. The Bitcoin UTXO and the CKB Cell are two representations of the same asset. Spending the UTXO means updating the Cell. Neither can change independently.

---

## The RGB++ Lock Script

Every RGB++ asset on CKB lives in a cell with this structure:

```
{
  code_hash: <RGB++ lock code hash>,
  hash_type: "type",
  args: <bitcoin_txid_reversed_bytes (32)> + <bitcoin_vout_le (4)>
}
```

The `args` field (36 bytes total) encodes exactly one Bitcoin UTXO:
- Bytes 0-31: The Bitcoin transaction ID in reversed byte order (Bitcoin's internal format)
- Bytes 32-35: The output index as a uint32 in little-endian byte order

When this cell is spent, the RGB++ lock script:
1. Reads the bound Bitcoin UTXO from `args`
2. Verifies that UTXO was spent in a Bitcoin transaction
3. Verifies that Bitcoin transaction's `OP_RETURN` commits to this CKB transaction
4. Verifies the output cell has the correct new UTXO binding
5. Returns success only if ALL checks pass

---

## Dual-Chain Transactions

Every RGB++ transfer requires coordinated transactions on BOTH Bitcoin and CKB:

### Bitcoin Side
```
Input:   UTXO_old (the currently bound Bitcoin UTXO)
Output:  UTXO_new (the new Bitcoin UTXO that will bind the asset)
Output:  OP_RETURN <hash(CKB_transaction)>
```

The `OP_RETURN` is crucial — it embeds a commitment to the CKB transaction in Bitcoin's blockchain permanently. Bitcoin's proof-of-work then secures this commitment.

### CKB Side
```
Input:   RGB++ Cell with lock.args = encode(UTXO_old)
Output:  RGB++ Cell with lock.args = encode(UTXO_new)
```

The cell type script (e.g., xUDT for tokens, Spore for NFTs) enforces asset-specific rules like conservation of token supply.

### Why Both Are Required

- The CKB transaction is only valid if the Bitcoin UTXO was actually spent
- The Bitcoin transaction alone is "incomplete" — the CKB state hasn't been updated
- Both must succeed for the transfer to be valid

This dual-chain validation is what makes RGB++ trustless — it combines Bitcoin's proof-of-work security with CKB's smart contract programmability.

---

## The Leap Operation

"Leap" moves an RGB++ asset between two ownership models:

### Bitcoin-Bound (RGB++ Lock)
- Asset is controlled by whoever controls the Bitcoin UTXO
- Every transfer requires a Bitcoin + CKB transaction pair
- Settles on Bitcoin L1

### CKB-Native (Regular CKB Lock)
- Asset is controlled by whoever controls the CKB private key
- Transfers only require a CKB transaction
- Settles on CKB L1
- Can participate in CKB DeFi protocols
- Can enter Fiber Network payment channels

### Leaping to CKB

```
Bitcoin tx:  Input UTXO_old → OP_RETURN <leap_marker + ckb_recipient>
CKB tx:      Input RGB++ Cell → Output regular CKB cell (secp256k1-blake160 lock)
```

After the leap, the asset is a regular CKB cell with no Bitcoin dependency.

### Leaping to Bitcoin

```
CKB tx:      Input regular CKB cell → Output RGB++ Cell (args = encode(new_UTXO))
Bitcoin tx:  Output new_UTXO + OP_RETURN <reverse_leap_commitment>
```

After the reverse leap, the asset is Bitcoin-bound again.

---

## RGB++ vs Traditional Bridges

| Property | Traditional Bridge (e.g., WBTC) | RGB++ |
|---|---|---|
| Custodian | Required (multisig federation) | None |
| Hack risk | High (billions lost in bridge hacks) | Low (no central custody) |
| Asset | Wrapped token (not the original) | Original asset |
| Bitcoin security | Not preserved | Preserved (same UTXO model) |
| Regulatory risk | High (custodian can be pressured) | Low (no custodian) |
| Smart contracts | Yes (on destination chain) | Yes (on CKB) |
| Single point of failure | Yes (bridge contract or custodian) | No |

RGB++ achieves cross-chain programmability WITHOUT the custodian risk that makes bridges vulnerable. There is no "bridge" to hack — just cryptographic commitments.

---

## The Fiber Network

The Fiber Network is CKB's Layer 2 payment channel network, analogous to Bitcoin's Lightning Network.

Key properties:
- Payment channels for CKB and RGB++ assets
- Sub-second finality for off-chain payments
- Dispute resolution settles on CKB L1
- Cross-network atomic swaps possible
- After "leaping to CKB," RGB++ assets can enter Fiber channels

The full stack:
```
Bitcoin L1      →  PoW security, settlement finality
    ↓
RGB++ Protocol  →  Isomorphic binding, smart contract logic (on CKB)
    ↓
Fiber Network   →  Fast payments, payment channels (L2)
```

---

## Real-World Ecosystem

As of Q2 2025:
- **623 new RGB++ assets** launched in Q2 2025
- **Stable++** (stablecoin protocol) uses RGB++ in production
- Multiple wallets support RGB++ (JoyID, UTXO Global, etc.)
- RGB++ Explorer available at https://rgbpp.io

---

## Running the Lesson Code

```bash
cd lessons/21-rgbpp-explorer
npm install
npm start
```

The code demonstrates:
1. The isomorphic binding concept with visual diagrams
2. RGB++ lock script structure and args encoding/decoding
3. Querying live RGB++ cells on CKB testnet
4. A complete dual-chain transfer walkthrough
5. The leap operation (Bitcoin-bound ↔ CKB-native)
6. RGB++ vs traditional bridges comparison
7. How to detect RGB++ transactions programmatically

The code connects to the CKB public testnet RPC — no local node required.

---

## Key Code Patterns

### Computing RGB++ Lock Args from Bitcoin UTXO

```typescript
function buildRgbppLockArgs(txid: string, vout: number): string {
  // Bitcoin txid display order is reversed from internal byte order
  const txidBytes = Buffer.from(txid, "hex");
  const reversedTxid = Buffer.from(txidBytes).reverse();

  // vout as uint32 little-endian
  const voutBuffer = Buffer.allocUnsafe(4);
  voutBuffer.writeUInt32LE(vout, 0);

  const args = Buffer.concat([reversedTxid, voutBuffer]);
  return "0x" + args.toString("hex");
}
```

### Finding RGB++ Cells on CKB

```typescript
import { ccc } from "@ckb-ccc/core";

const client = new ccc.ClientPublicTestnet();

// Find ALL RGB++ cells (prefix search with empty args)
for await (const cell of client.findCells({
  script: {
    codeHash: RGBPP_LOCK_CODE_HASH,
    hashType: "type",
    args: "0x",
  },
  scriptType: "lock",
  scriptSearchMode: "prefix",
})) {
  const { txid, vout } = parseRgbppLockArgs(cell.cellOutput.lock.args);
  console.log(`Bitcoin UTXO: ${txid}:${vout}`);
}
```

### Finding the CKB Cell for a Specific Bitcoin UTXO

```typescript
const lockArgs = buildRgbppLockArgs(btcTxid, btcVout);

for await (const cell of client.findCells({
  script: { codeHash: RGBPP_LOCK_CODE_HASH, hashType: "type", args: lockArgs },
  scriptType: "lock",
  scriptSearchMode: "exact",
})) {
  console.log("Found RGB++ cell:", cell.outPoint);
}
```

---

## Further Reading

- [RGB++ Protocol Paper](https://github.com/ckb-cell/RGBplusplus-Protocol) — Original protocol specification
- [RGB++ Lock Script](https://github.com/ckb-cell/rgbpp-sdk) — SDK and lock script implementation
- [Fiber Network](https://github.com/nervosnetwork/fiber) — Payment channel network
- [UTXO Global Wallet](https://utxo.global) — Wallet supporting RGB++ assets
- [RGB++ Explorer](https://rgbpp.io) — Browse RGB++ assets on mainnet

---

## Summary

| Concept | Summary |
|---|---|
| Isomorphic binding | Bitcoin UTXO ↔ CKB Cell, one-to-one cryptographic mapping |
| RGB++ lock | Lock script whose args encode the bound Bitcoin UTXO (36 bytes) |
| Dual-chain validation | Both Bitcoin tx and CKB tx required for every transfer |
| Leap | Move asset between Bitcoin-bound and CKB-native ownership |
| vs bridges | No custodian, no wrapped token, purely cryptographic |
| Fiber Network | L2 payment channels for RGB++ assets after leap to CKB |
| Use cases | Bitcoin DeFi, tokenized BTC, Bitcoin programmability |
| Real-world | 623+ assets in Q2 2025, Stable++ uses it in production |
