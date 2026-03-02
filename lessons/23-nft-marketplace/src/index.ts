/**
 * ============================================================================
 * Lesson 23: Full-Stack dApp - NFT Marketplace
 * ============================================================================
 *
 * This is the capstone lesson before the final deployment lesson. We bring
 * together everything learned so far to build a complete NFT marketplace:
 *
 *   - SPORE PROTOCOL: On-chain NFTs with real content stored in cells
 *   - ORDER CELL PATTERN: From Lesson 22, applied to NFT sales
 *   - CCC: Wallet connection, transaction building, testnet interaction
 *   - OMNILOCK: Flexible wallet support (JoyID, MetaMask, hardware wallets)
 *   - FULL-STACK: TypeScript backend logic + React frontend patterns
 *
 * WHAT THIS LESSON COVERS
 * =======================
 * 1. Spore NFT structure and how content lives on-chain
 * 2. Querying the indexer to find NFTs and sale listings
 * 3. Listing a Spore NFT for sale (creating a sale order cell)
 * 4. Buying a Spore NFT (atomic swap: CKB for Spore)
 * 5. Canceling a listing (reclaiming the NFT)
 * 6. Wallet connection patterns using CCC connector-react
 * 7. Reading and displaying NFT content from cell data
 * 8. Security considerations and transaction validation
 *
 * THE BIG PICTURE
 * ===============
 * A marketplace on CKB is essentially a specialized DEX where the "token"
 * being traded is a non-fungible Spore cell. The same atomic swap pattern
 * from Lesson 22 applies here, with the additional complexity that:
 *   1. The Spore protocol has its own type script that must remain valid
 *   2. NFTs have unique IDs and cannot be partially filled
 *   3. The content is stored on-chain and must be displayed in the UI
 *
 * Run with: npx tsx src/index.ts
 * ============================================================================
 */

import {
  SporeNft,
  NftListing,
  BuyResult,
  MarketplaceState,
  listNft,
  buyNft,
  cancelListing,
  formatCkb,
  printNft,
  printListing,
  decodeNftContent,
} from "./marketplace-logic.js";

// ============================================================================
// SECTION 1: Architecture Overview
// ============================================================================

function explainMarketplaceArchitecture(): void {
  console.log("\n" + "=".repeat(70));
  console.log("LESSON 23: FULL-STACK NFT MARKETPLACE ON CKB");
  console.log("=".repeat(70));

  console.log(`
BRINGING IT ALL TOGETHER
========================

This lesson combines the key building blocks from the course:

  LAYER 1: CKB CELL MODEL (Lessons 1-3)
  ├── Cells are the fundamental data unit
  ├── capacity = storage cost (1 CKB = 1 byte)
  └── Each NFT is a cell with content stored on-chain

  LAYER 2: SCRIPTS (Lessons 7-12)
  ├── Spore type script: enforces NFT uniqueness and burn rules
  ├── Marketplace lock script: enforces sale terms (from Lesson 22)
  └── Omnilock: enables JoyID, MetaMask, hardware wallet signing

  LAYER 3: PROTOCOLS (Lessons 13-17)
  ├── xUDT: fungible tokens (CKB is used as payment currency here)
  ├── Spore: non-fungible tokens (the assets being traded)
  └── Composability: Spore + marketplace lock = listed NFT

  LAYER 4: SDK AND WALLET (Lessons 15, 18)
  ├── CCC (ckb-ccc): Transaction building, RPC calls, signing
  ├── CCC connector-react: Wallet connection in React/Next.js
  └── JoyID/MetaMask/hardware: User-facing wallet options

  LAYER 5: FRONTEND (This Lesson)
  ├── Next.js app router for the marketplace UI
  ├── Reading cell data to display NFT content
  ├── Building and submitting transactions from the browser
  └── Wallet connection flow

WHAT MAKES THIS DIFFERENT FROM WEB2 MARKETPLACES?
===================================================
  Traditional marketplace (OpenSea-style):
    - Backend database stores listings
    - Smart contract escrows NFTs
    - Company controls the database and can delist NFTs
    - NFT content is usually a URL to an external server

  CKB Spore marketplace (JoyID-style):
    - On-chain cells store listings (no central database)
    - Lock scripts enforce atomic swaps (no escrow contract needed)
    - No one can delist an order cell (only the seller can cancel)
    - NFT CONTENT IS ON-CHAIN (no external server, no dead links)
`);
}

// ============================================================================
// SECTION 2: Spore NFT Deep Dive
// ============================================================================

function explainSporeProtocol(): void {
  console.log("\n" + "=".repeat(70));
  console.log("THE SPORE PROTOCOL: NFTs WITH ON-CHAIN CONTENT");
  console.log("=".repeat(70));

  console.log(`
WHAT IS SPORE?
==============
Spore is an NFT protocol built natively for CKB's cell model. Unlike most
NFT standards (ERC-721, ERC-1155), Spore stores the ACTUAL CONTENT of the
NFT on-chain. There is no external server, IPFS gateway, or URL that can
disappear and break your NFT.

SPORE CELL STRUCTURE
=====================

  capacity  : 8 bytes (must cover all fields below)
  lock      : Owner's lock script (JoyID / Omnilock / SECP256K1)
  type      : Spore type script
                code_hash: Spore type script code hash (deployed)
                hash_type: "data1"
                args: spore_id (32 bytes, globally unique)
  data      : SporeData (molecule-encoded binary)
                content_type: string (MIME type, e.g., "image/png")
                content     : bytes  (the actual file/text/image bytes)
                cluster_id  : Option<[u8; 32]>  (optional collection ID)

SPORE ID UNIQUENESS
====================
A Spore's ID is computed from the FIRST input cell's outpoint in the creation
transaction:
  spore_id = blake2b(first_input_tx_hash + first_input_index)

Since each outpoint can only be spent once (UTXO model), each Spore ID is
cryptographically unique. No central registry or counter is needed.

SPORE CONTENT TYPES
====================
  "text/plain"       - Plain text poetry, messages, descriptions
  "image/png"        - PNG image files stored as raw bytes
  "image/svg+xml"    - SVG vector art (very popular - small and on-chain)
  "application/json" - Structured data (traits, metadata, game items)
  "text/html"        - Interactive HTML NFTs that run in browsers!
  Any MIME type works - the protocol is content-type agnostic.

ON-CHAIN STORAGE COST
======================
Storing content on CKB costs CKBytes (capacity):
  Base overhead:  ~94 bytes  (~94 CKB minimum)
  Per content byte: 1 byte = 1 CKB

Examples:
  A short text NFT (100 bytes): ~194 CKB total
  A small SVG (1 KB):          ~1,094 CKB total
  A photo (1 MB):              ~1,000,094 CKB (~10,000 USD at time of writing)

This cost encourages small, efficient content and has led to a thriving
ecosystem of generative art, text poetry, and SVG animations on CKB.

SPORE BURN MECHANICS
=====================
Unlike most NFTs, Spore cells can be BURNED (permanently destroyed). When a
Spore is burned, the locked CKBytes are released back to the burner. This
creates an interesting economic property: the NFT has a guaranteed floor
price equal to the cost of its storage.

A Spore NFT is never truly "worthless" - at minimum it is worth its
capacity in CKB, which can always be recovered by burning it.
`);
}

// ============================================================================
// SECTION 3: Initialize Marketplace and Display NFTs
// ============================================================================

function demoDisplayNfts(state: MarketplaceState): void {
  console.log("\n" + "=".repeat(70));
  console.log("DEMO: QUERYING NFTs FROM THE CHAIN");
  console.log("=".repeat(70));

  console.log(`
In a real marketplace, we would query the CKB indexer:

  // Find all Spore cells (cells with Spore type script)
  const sporeCells = await client.findCells({
    script: SPORE_TYPE_SCRIPT,
    scriptType: "type",
    scriptSearchMode: "prefix",  // Match on code_hash prefix
  });

  // Decode each cell's data field using Spore's molecule schema
  const nfts = sporeCells.map(cell => decodeSporeData(cell.outputData));

For this demo, we use a simulated state with pre-seeded NFTs.
`);

  const aliceNfts = state.getNftsForAddress("ckb1alice000000000000000000000000000000");
  const bobNfts = state.getNftsForAddress("ckb1bob0000000000000000000000000000000");

  console.log(`Alice's NFTs (${aliceNfts.length} total):`);
  aliceNfts.forEach((nft, i) => {
    console.log(`\n  NFT #${i + 1}:`);
    printNft(nft);
  });

  console.log(`\nBob's NFTs (${bobNfts.length} total):`);
  bobNfts.forEach((nft, i) => {
    console.log(`\n  NFT #${i + 1}:`);
    printNft(nft);
  });
}

// ============================================================================
// SECTION 4: Listing NFTs for Sale
// ============================================================================

function demoListNft(state: MarketplaceState): NftListing[] {
  console.log("\n" + "=".repeat(70));
  console.log("DEMO: LISTING NFTs FOR SALE");
  console.log("=".repeat(70));

  console.log(`
Alice wants to sell her two NFTs. She creates a sale listing for each.

WHAT HAPPENS ON-CHAIN:
======================
For each listing, Alice signs a transaction that:

1. Changes the Spore cell's lock from her standard lock to the MARKETPLACE LOCK:
   - The marketplace lock allows the Spore to be transferred only when
     a matching sale order cell is consumed in the same transaction
   - This "approves" the marketplace to control the Spore during the sale

2. Creates a SALE ORDER CELL:
   - This is the equivalent of an "order cell" from Lesson 22
   - It encodes: spore_id + seller_address + asking_price
   - Anyone scanning for this code_hash can find all active listings

WHY TWO CELLS (Spore + Order Cell)?
=====================================
We could put all the info in one cell, but separating them is cleaner:
  - The Spore cell retains its full Spore type script (protocol compliance)
  - The order cell is a simple reference cell with no type script
  - Future protocol upgrades can change the order format without touching Spore

This separation is an example of the composability principle on CKB:
use existing standards as building blocks without modifying them.
`);

  const aliceNfts = state.getNftsForAddress("ckb1alice000000000000000000000000000000");

  console.log(`\nAlice listing NFT #1 for 500 CKB...`);
  const listing1 = listNft(
    state,
    "ckb1alice000000000000000000000000000000",
    aliceNfts[0].sporeId,
    500 // CKB
  );

  if (listing1) {
    console.log("Listing created successfully:");
    printListing(listing1);
  }

  console.log(`\nAlice listing NFT #2 for 1200 CKB...`);
  const listing2 = listNft(
    state,
    "ckb1alice000000000000000000000000000000",
    aliceNfts[1].sporeId,
    1200
  );

  if (listing2) {
    console.log("Listing created successfully:");
    printListing(listing2);
  }

  console.log(`\nBob listing his NFT for 300 CKB...`);
  const bobNfts = state.getNftsForAddress("ckb1bob0000000000000000000000000000000");
  const listing3 = listNft(
    state,
    "ckb1bob0000000000000000000000000000000",
    bobNfts[0].sporeId,
    300
  );

  if (listing3) {
    console.log("Listing created successfully:");
    printListing(listing3);
  }

  console.log(`\nActive marketplace listings: ${state.getActiveListings().length}`);
  return [listing1!, listing2!, listing3!].filter(Boolean);
}

// ============================================================================
// SECTION 5: Buying an NFT
// ============================================================================

function demoBuyNft(state: MarketplaceState, listing: NftListing): void {
  console.log("\n" + "=".repeat(70));
  console.log("DEMO: BUYING AN NFT");
  console.log("=".repeat(70));

  console.log(`
Charlie wants to buy Alice's first NFT for 500 CKB.

WHAT THE BUYER PAYS:
=====================
  Asking price:        ${formatCkb(listing.askingPrice)}
  Spore cell capacity: ${formatCkb(listing.spore.capacity)} (transferred to buyer)
  Transaction fee:     ~0.001 CKB
  ─────────────────────────────────
  Total from buyer:    ${formatCkb(listing.askingPrice + listing.spore.capacity)}

  Note: The buyer ends up with the Spore cell AND its capacity.
  The "price" is purely the asking price - the capacity is just
  transferred along with the NFT (the buyer now backs the storage).

TRANSACTION STRUCTURE:
======================
  Inputs:
    [0] Spore cell (locked with MarketplaceLock, controlled by listing)
    [1] Sale order cell (the listing announcement)
    [2] Charlie's CKB cells (price + capacity + fee)

  Outputs:
    [0] Charlie's Spore cell (same content, now locked with Charlie's lock)
    [1] Alice's payment cell (500 CKB to Alice)
    [2] Charlie's change cell (excess CKB returned)

  The marketplace lock script verifies all conditions before allowing
  the sale order cell and Spore cell to be consumed.

CONNECTING TO CKB TESTNET (what CCC handles for us):
======================================================
  const signer = new ccc.SignerCkbPrivateKey(client, privateKey);
  const tx = ccc.Transaction.from({
    inputs: [sporeCellInput, orderCellInput, ...paymentInputs],
    outputs: [buyerSporeOutput, sellerPaymentOutput, changeOutput],
    witnesses: [...],
  });
  await signer.signTransaction(tx);
  const txHash = await client.sendTransaction(tx);
`);

  const charlieBalance = 2_000n * 100_000_000n; // 2000 CKB
  const result = buyNft(state, "ckb1charlie00000000000000000000000000", listing.listingId, charlieBalance);

  if (result) {
    console.log("\nPurchase SUCCESSFUL:");
    console.log(`  Transaction hash: ${result.transactionHash.slice(0, 30)}...`);
    console.log(`  Buyer received:   Spore ${result.buyerReceivedSporeId.slice(0, 20)}...`);
    console.log(`  Seller received:  ${formatCkb(result.sellerReceivedCkb)}`);
    console.log(`  Total buyer cost: ${formatCkb(result.totalBuyerCost)}`);

    console.log(`\nCharlie's NFTs after purchase:`);
    const charlieNfts = state.getNftsForAddress("ckb1charlie00000000000000000000000000");
    charlieNfts.forEach((nft) => {
      console.log(`\n  Transferred NFT:`);
      printNft(nft);
    });
  }
}

// ============================================================================
// SECTION 6: Cancel a Listing
// ============================================================================

function demoCancelListing(state: MarketplaceState, listing: NftListing): void {
  console.log("\n" + "=".repeat(70));
  console.log("DEMO: CANCELING A LISTING");
  console.log("=".repeat(70));

  console.log(`
Alice decides not to sell her second NFT (1200 CKB asking price).
She cancels the listing and gets her Spore back.

CANCELLATION TRANSACTION:
==========================
  Inputs:
    [0] Spore cell (locked with MarketplaceLock)
    [1] Sale order cell (the listing announcement)

  Outputs:
    [0] Alice's Spore cell (lock changed back to Alice's standard lock)
    [1] Alice's reclaimed capacity (sale order cell capacity returned)

  Witness:
    Alice's signature (proves she is the seller in the listing args)

  The marketplace lock detects no valid purchase conditions and falls
  through to the cancel path, verifying Alice's signature.
`);

  const canceled = cancelListing(
    state,
    "ckb1alice000000000000000000000000000000",
    listing.listingId
  );

  if (canceled) {
    console.log("Listing canceled successfully.");
    const aliceNfts = state.getNftsForAddress("ckb1alice000000000000000000000000000000");
    console.log(`Alice still owns ${aliceNfts.length} NFT(s):`);
    aliceNfts.forEach((nft) => {
      console.log(`  - Spore ${nft.sporeId.slice(0, 20)}... (${nft.contentType})`);
    });
  }

  // Try to cancel someone else's listing
  console.log("\nEve tries to cancel Bob's listing (should fail):");
  const bobListings = state.getActiveListings().filter(
    (l) => l.sellerAddress === "ckb1bob0000000000000000000000000000000"
  );
  if (bobListings.length > 0) {
    const success = cancelListing(state, "ckb1eve0000000000000000000000000000000", bobListings[0].listingId);
    if (!success) {
      console.log("[EXPECTED] Cancel rejected - Eve is not the seller.");
    }
  }
}

// ============================================================================
// SECTION 7: Wallet Connection with CCC (conceptual)
// ============================================================================

function explainWalletConnection(): void {
  console.log("\n" + "=".repeat(70));
  console.log("WALLET CONNECTION WITH CCC CONNECTOR-REACT");
  console.log("=".repeat(70));

  console.log(`
CCC (ckb-ccc) provides a React component for wallet connection that works
with JoyID, MetaMask (via CKB plugin), Neuron, and hardware wallets.

SETUP IN NEXT.JS
================
// app/layout.tsx
import { CccProvider } from "@ckb-ccc/connector-react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CccProvider>
          {children}
        </CccProvider>
      </body>
    </html>
  );
}

CONNECTING A WALLET IN A COMPONENT
====================================
// components/ConnectButton.tsx
"use client";
import { useCcc } from "@ckb-ccc/connector-react";

export function ConnectButton() {
  const { open, wallet, client } = useCcc();

  return (
    <button onClick={() => open()}>
      {wallet ? \`Connected: \${wallet.name}\` : "Connect Wallet"}
    </button>
  );
}

BUILDING AND SIGNING A TRANSACTION
====================================
// In your buy NFT handler:
const { signer } = useCcc();

async function handleBuy(listing: NftListing) {
  if (!signer) {
    alert("Please connect your wallet first");
    return;
  }

  // 1. Build the transaction (using CCC's transaction builder)
  const tx = await buildBuyTransaction(listing, await signer.getAddress());

  // 2. Complete the transaction (adds fee, change cells, etc.)
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000); // 1000 shannons per byte fee rate

  // 3. Sign and send
  const txHash = await signer.sendTransaction(tx);
  console.log("NFT purchased! Transaction:", txHash);
}

READING NFT CONTENT FROM CELLS
================================
// Fetch a Spore cell from the chain and decode its content
async function fetchSporeContent(sporeId: string, client: ccc.Client) {
  // Find the cell with this Spore type script arg
  const [cell] = await client.findCells({
    script: {
      ...SPORE_TYPE_SCRIPT,
      args: sporeId,
    },
    scriptType: "type",
    scriptSearchMode: "exact",
  });

  if (!cell) return null;

  // Decode the molecule-encoded SporeData
  const sporeData = decodeSporeData(cell.outputData);
  // sporeData.contentType, sporeData.content, sporeData.clusterId

  return sporeData;
}

// Display in React:
function SporeViewer({ contentType, content }) {
  if (contentType.startsWith("text/")) {
    return <p>{new TextDecoder().decode(content)}</p>;
  }
  if (contentType.startsWith("image/")) {
    const url = URL.createObjectURL(new Blob([content], { type: contentType }));
    return <img src={url} alt="Spore NFT" />;
  }
  // Handle other types...
}

SUPPORTED WALLETS VIA CCC
===========================
  JoyID:      Passkey-based wallet, no seed phrase, best UX
  MetaMask:   Via a CKB plugin/snap (familiar to Ethereum users)
  UTXO Global: Multi-chain wallet with CKB support
  Neuron:     Official CKB desktop wallet (full node)
  Hardware:   Ledger support via CCC's generic signing protocol

CCC's connector-react automatically shows the appropriate wallet
options based on the user's browser and available extensions.
`);
}

// ============================================================================
// SECTION 8: Security Considerations
// ============================================================================

function explainSecurity(): void {
  console.log("\n" + "=".repeat(70));
  console.log("SECURITY CONSIDERATIONS FOR THE MARKETPLACE");
  console.log("=".repeat(70));

  console.log(`
1. VALIDATING TRANSACTIONS BEFORE SUBMISSION
============================================
Always validate the transaction client-side before signing:
  - Verify the Spore cell being purchased matches the listing
  - Check that outputs send the correct CKB amount to the seller
  - Confirm no unexpected outputs (ensure no funds are being drained)
  - Validate that the buyer receives the correct Spore cell

CCC provides transaction inspection APIs:
  tx.outputs.forEach((output, index) => {
    console.log("Output", index, ":", output.capacity, "to", output.lock.args);
  });

2. PREVENTING BAIT-AND-SWITCH
===============================
An attacker might try to:
  - Create a listing with a different Spore cell than advertised
  - Change the listing between when you view it and when you sign

Defense: The sale order cell's args commit to the exact Spore ID.
Your frontend should always verify the Spore ID in the transaction
matches what the user saw in the UI before they signed.

3. HANDLING RACE CONDITIONS
============================
Two buyers might try to purchase the same NFT simultaneously. One will
succeed and one will get a "cell consumed" error. Your frontend should:
  - Catch transaction rejection errors gracefully
  - Inform the user that the NFT was sold to someone else
  - Reload the listing status to reflect the current state

4. INDEXER LAG
===============
The CKB indexer might lag behind the actual chain tip by a few blocks.
A listing shown as "active" might actually be sold. Always handle the
case where a cell cannot be found when building a transaction.

5. SCRIPT HASH VERIFICATION
============================
Before displaying an NFT or listing, verify that:
  - The type script code_hash matches the deployed Spore code hash
  - The lock script code_hash matches the marketplace lock code hash
  This prevents spoofed "NFTs" with fake type scripts from appearing
  as legitimate Spore NFTs in your marketplace.
`);
}

// ============================================================================
// SECTION 9: Real-World Context
// ============================================================================

function explainRealWorld(): void {
  console.log("\n" + "=".repeat(70));
  console.log("REAL-WORLD: CKB NFT MARKETPLACES");
  console.log("=".repeat(70));

  console.log(`
HOW JoyID MARKETPLACE WORKS
==============================
JoyID is both a wallet and an NFT marketplace on CKB. It uses:
  - Spore protocol for all NFTs (on-chain content)
  - Passkey (biometric) authentication instead of seed phrases
  - Omnilock for wallet flexibility
  - The same order cell pattern described in this lesson

JoyID's approach to NFT content is pioneering: instead of storing URLs
to IPFS or Arweave, every NFT's content is ON-CHAIN. Svg animations,
generative art, text poems, and JSON metadata all live in Spore cells.

NOTABLE SPORE NFT COLLECTIONS
================================
  - "The First Spore": First NFT minted on the Spore protocol
  - CKB "Legends": PFP collection using on-chain SVG generation
  - Various generative poetry and text art collections

SPORE SDK (spore-sdk)
======================
The official Spore SDK (https://github.com/sporeprotocol/spore-sdk)
provides TypeScript functions for:
  - createSpore(): Create a new NFT
  - transferSpore(): Change ownership
  - burnSpore(): Destroy an NFT and reclaim capacity
  - createCluster(): Create a collection
  - createSporeWithCluster(): Mint into a collection

These functions build CKB transactions that you then sign with CCC.

ECOSYSTEM
==========
  Spore Docs:    https://docs.spore.pro
  JoyID:         https://app.joy.id
  Spore SDK:     https://github.com/sporeprotocol/spore-sdk
  CKB Explorer:  https://explorer.nervos.org (view cells and NFTs)
`);
}

// ============================================================================
// SECTION 10: Marketplace Summary
// ============================================================================

function printMarketplaceSummary(state: MarketplaceState): void {
  console.log("\n" + "=".repeat(70));
  console.log("FINAL MARKETPLACE STATE");
  console.log("=".repeat(70));

  const allListings = state.getAllListings();
  const activeListings = allListings.filter((l) => l.status === "active");
  const soldListings = allListings.filter((l) => l.status === "sold");
  const canceledListings = allListings.filter((l) => l.status === "canceled");

  console.log(`\nMarketplace Summary:`);
  console.log(`  Total listings: ${allListings.length}`);
  console.log(`  Active:         ${activeListings.length}`);
  console.log(`  Sold:           ${soldListings.length}`);
  console.log(`  Canceled:       ${canceledListings.length}`);

  if (activeListings.length > 0) {
    console.log(`\nActive Listings:`);
    activeListings.forEach((l) => printListing(l));
  }

  console.log(`
KEY TAKEAWAYS
=============
1. Spore NFTs store real content on-chain - no URLs, no external servers
2. Each NFT is a cell with a Spore type script encoding its uniqueness
3. Sale order cells announce listings (no central database required)
4. Buying is an atomic swap: CKB payment + Spore transfer in one transaction
5. CCC handles wallet connection, transaction building, and signing
6. Multiple wallet types work via Omnilock (JoyID, MetaMask, hardware)
7. Content is read from cell data and rendered directly in the frontend
8. Security requires validating transaction outputs before signing

This is a complete dApp: from on-chain NFT storage to browser-based
wallet interaction, all without any centralized server components.

Next lesson: Deploying to mainnet and production security practices.
`);
}

// ============================================================================
// MAIN: Run All Demos
// ============================================================================

async function main(): Promise<void> {
  // Section 1: Architecture overview
  explainMarketplaceArchitecture();

  // Section 2: Spore protocol explanation
  explainSporeProtocol();

  // Initialize marketplace with seeded NFTs
  const state = new MarketplaceState();
  state.seed();

  // Section 3: Display owned NFTs
  demoDisplayNfts(state);

  // Section 4: Create listings
  const listings = demoListNft(state);

  // Section 5: Buy the first listing
  if (listings.length > 0) {
    demoBuyNft(state, listings[0]);
  }

  // Section 6: Cancel the second listing (Alice's 1200 CKB listing)
  if (listings.length > 1) {
    demoCancelListing(state, listings[1]);
  }

  // Section 7: Wallet connection patterns
  explainWalletConnection();

  // Section 8: Security
  explainSecurity();

  // Section 9: Real-world context
  explainRealWorld();

  // Section 10: Final summary
  printMarketplaceSummary(state);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
