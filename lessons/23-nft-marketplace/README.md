# Lesson 23: Full-Stack dApp - NFT Marketplace

## Overview

This lesson brings together everything from the course to build a complete NFT marketplace on CKB. It combines the **Spore NFT protocol**, the **order cell pattern** from Lesson 22, **CCC wallet integration**, and explains how to build the **Next.js frontend**.

## What You Will Learn

- How Spore NFTs work (on-chain content, cell structure, uniqueness guarantee)
- Querying the CKB indexer to find NFTs and sale listings
- Listing a Spore NFT for sale using sale order cells
- Buying an NFT atomically (CKB payment + Spore transfer in one transaction)
- Canceling a listing and recovering the NFT
- Connecting wallets with `@ckb-ccc/connector-react` (JoyID, MetaMask, Neuron, hardware)
- Reading NFT content from cell data and rendering it in a React component
- Security considerations: transaction validation, race conditions, spoofing prevention

## Key Concepts

### Spore NFTs

Spore is CKB's native NFT protocol. Unlike most NFT standards, Spore stores the actual content (image bytes, text, SVG, JSON) on-chain in the cell's data field. There is no URL that can break, no IPFS gateway that can go offline.

```
Spore Cell:
  type script args: spore_id (32 bytes, globally unique)
  data:             SporeData (molecule-encoded)
    content_type:   "image/svg+xml" | "text/plain" | etc.
    content:        [actual file bytes]
    cluster_id:     Option<[u8; 32]>  (collection membership)
```

### Sale Order Cells

The marketplace uses the same order cell pattern as the DEX in Lesson 22, adapted for NFTs. A sale order cell encodes:
- `spore_id`: which NFT is being sold
- `seller_blake160`: who receives the CKB payment
- `asking_price`: minimum CKB (uint128, little-endian) to receive

### Atomic Swaps

A buy transaction atomically:
1. Consumes the Spore cell (transfers NFT from seller to buyer)
2. Consumes the sale order cell (removes the listing)
3. Creates a new Spore cell owned by the buyer
4. Creates a CKB payment cell for the seller

Either all of this happens in one block, or nothing does. The buyer cannot receive the NFT without paying, and the seller cannot receive payment without delivering the NFT.

## Project Structure

```
23-nft-marketplace/
├── src/
│   ├── index.ts              # Main demo - full marketplace walkthrough
│   └── marketplace-logic.ts  # Core functions: list, buy, cancel
├── package.json
├── tsconfig.json
└── README.md
```

## Running the Demo

```bash
npm install
npm start
```

The demo covers:
1. Architecture overview (Spore + order cells + CCC)
2. Spore protocol deep dive (content types, storage costs, burn mechanics)
3. Querying and displaying owned NFTs
4. Creating listings (Alice and Bob list their NFTs)
5. Buying an NFT (Charlie buys Alice's NFT atomically)
6. Canceling a listing (Alice reclaims her second NFT)
7. Wallet connection patterns with CCC connector-react
8. Security considerations
9. Real-world context (JoyID marketplace, Spore SDK)

## Frontend Architecture (Next.js)

A full Next.js implementation would have:

```
app/
├── layout.tsx          # CccProvider wrapping
├── page.tsx            # Marketplace listing grid
├── nft/[id]/page.tsx   # Individual NFT detail page
├── profile/page.tsx    # User's owned NFTs and listings
└── sell/page.tsx       # Create new listing form

components/
├── ConnectButton.tsx   # Wallet connection UI
├── NftCard.tsx         # Listing card with price and "Buy" button
├── SporeViewer.tsx     # Render NFT content (text, image, SVG, HTML)
└── TransactionStatus.tsx  # Show pending/confirmed/failed

hooks/
├── useMarketplace.ts   # Query listings from indexer
└── useSpore.ts         # Fetch and decode Spore cells
```

## Wallet Support via CCC

CCC's `connector-react` handles:

| Wallet | Authentication | CKB Network |
|--------|---------------|-------------|
| JoyID | Passkey (biometric) | Mainnet + Testnet |
| MetaMask | ECDSA (secp256k1) | Via CKB plugin |
| UTXO Global | Multi-chain | Mainnet |
| Neuron | Full node | Mainnet |
| Ledger | Hardware | Via generic signing |

## Real-World Reference

This marketplace design is based on how **JoyID** and other CKB NFT platforms operate:

- **Spore SDK**: https://github.com/sporeprotocol/spore-sdk
- **Spore Docs**: https://docs.spore.pro
- **JoyID**: https://app.joy.id
- **CKB Explorer**: https://explorer.nervos.org

## Security Checklist

Before submitting any marketplace transaction, verify:
- The Spore ID in transaction matches the displayed NFT
- Seller payment output has the correct amount and address
- No unexpected outputs draining user funds
- Type script code hash matches deployed Spore code
- Lock script code hash matches marketplace lock

## Related Lessons

- Lesson 13-14: xUDT tokens (payment token concepts)
- Lesson 15: Omnilock (multi-wallet support)
- Lesson 21: RGB++ (NFTs across chains)
- Lesson 22: Token DEX (order cell pattern foundation)
- Lesson 24: Mainnet Deployment (taking this to production)
