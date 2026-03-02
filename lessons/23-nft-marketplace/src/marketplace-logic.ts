/**
 * ============================================================================
 * Lesson 23: NFT Marketplace - Core Logic
 * ============================================================================
 *
 * This file contains the core marketplace functions: listing, buying, and
 * canceling listings. Each function is documented to show both what happens
 * in the TypeScript code and what the corresponding on-chain transaction
 * looks like.
 *
 * ARCHITECTURE OVERVIEW
 * =====================
 * The NFT marketplace combines three CKB primitives:
 *
 * 1. SPORE CELLS: The NFTs themselves. Each Spore cell contains:
 *    - A type script (Spore type script) that enforces NFT uniqueness
 *    - Content in the data field (text, image bytes, JSON, etc.)
 *    - A lock script controlling who owns the NFT
 *
 * 2. SALE ORDER CELLS: Announce that an NFT is for sale. These contain:
 *    - The Spore cell ID (which NFT is for sale)
 *    - The asking price in CKB shannons
 *    - The seller's address (to receive payment)
 *    - Lock: seller can cancel, or anyone can "fill" by sending enough CKB
 *
 * 3. CCC (CKB JavaScript SDK): Handles:
 *    - Wallet connection and signing
 *    - Transaction building (inputs, outputs, witnesses)
 *    - RPC calls to testnet/mainnet
 *
 * TRANSACTION FLOW
 * ================
 *
 * LIST:
 *   Inputs:  [seller's Spore cell] + [seller's fee cell]
 *   Outputs: [sale order cell (holds Spore + records price)]
 *            + [seller's change cell]
 *
 * BUY:
 *   Inputs:  [sale order cell] + [buyer's CKB cells]
 *   Outputs: [buyer's Spore cell (transferred to buyer's lock)]
 *            + [seller's CKB cell (price amount)]
 *            + [buyer's change cell]
 *
 * CANCEL:
 *   Inputs:  [sale order cell]
 *   Outputs: [seller's Spore cell (back to seller's lock)]
 *            + [seller's reclaimed CKB cell]
 * ============================================================================
 */

// ============================================================================
// SECTION 1: Data Types
// ============================================================================

/**
 * Represents a Spore NFT cell on-chain.
 *
 * The Spore protocol defines NFTs on CKB where each NFT is a cell:
 *   - type script: Spore type script (enforces uniqueness, birth/death rules)
 *   - data: SporeData encoded as molecule (content_type + content + cluster_id)
 *   - lock: owner's lock script (standard lock or Omnilock)
 *
 * Spore IDs are derived from the first input cell's outpoint during creation,
 * making them globally unique without any central registry.
 */
export interface SporeNft {
  /** The unique Spore ID (32 bytes, derived from creation transaction) */
  sporeId: string;

  /** Who currently owns this NFT */
  ownerAddress: string;

  /** MIME type of the content (e.g., "text/plain", "image/png", "application/json") */
  contentType: string;

  /**
   * The actual content, stored directly on-chain in the cell's data field.
   * This is what makes Spore different from most NFT standards where only
   * a URL to off-chain data is stored. Spore stores the ACTUAL content.
   */
  content: Uint8Array;

  /** Optional: which collection (cluster) this NFT belongs to */
  clusterId?: string;

  /** Capacity locked in this cell (includes Spore overhead + content size) */
  capacity: bigint;
}

/**
 * A sale listing - an order cell announcing an NFT is for sale.
 *
 * SALE ORDER CELL LAYOUT
 * ======================
 *   capacity  : minimum storage cost for the cell
 *   lock      : MarketplaceLock
 *     args    :
 *       [0..32]  spore_id        (which NFT is for sale)
 *       [32..52] seller_blake160 (who gets the CKB payment)
 *       [52..68] asking_price    (uint128 LE - minimum CKB to receive)
 *   type      : None
 *   data      : listing metadata (creation time, optional description)
 */
export interface NftListing {
  /** Unique listing ID (outpoint of the sale order cell) */
  listingId: string;

  /** The NFT being sold */
  spore: SporeNft;

  /** The seller's CKB address */
  sellerAddress: string;

  /**
   * Asking price in shannons (CKB's smallest unit).
   * 1 CKB = 100,000,000 shannons.
   * Note: the buyer ALSO pays the Spore cell's capacity, so the total
   * cost to the buyer = asking_price + spore_cell_capacity.
   */
  askingPrice: bigint;

  /** When this listing was created */
  listedAtBlock: bigint;

  /** Current status */
  status: "active" | "sold" | "canceled";
}

/**
 * Result of a buy transaction.
 */
export interface BuyResult {
  success: boolean;
  transactionHash: string;
  buyerReceivedSporeId: string;
  sellerReceivedCkb: bigint;
  totalBuyerCost: bigint;
}

// ============================================================================
// SECTION 2: Simulated On-Chain State
// ============================================================================

/**
 * Simulates the on-chain state of the marketplace.
 *
 * In a real implementation, this state would be:
 * - Queried from a CKB indexer (Mercury, Lumos Indexer, or the built-in indexer)
 * - Filtered by the marketplace's sale order lock code_hash
 * - Decoded from cell args and data
 *
 * The marketplace indexer query would look like:
 *   await client.findCells({
 *     script: SALE_ORDER_LOCK,
 *     scriptType: "lock",
 *     scriptSearchMode: "prefix",  // Find all cells with this lock code_hash
 *   });
 */
export class MarketplaceState {
  private listings: Map<string, NftListing> = new Map();
  private ownedNfts: Map<string, SporeNft[]> = new Map();
  private nextId: number = 1;
  private currentBlock: bigint = 5_000_000n;

  /** Initialize with some sample NFTs owned by different addresses */
  seed(): void {
    // Alice owns two Spore NFTs
    this.mintNft("ckb1alice000000000000000000000000000000", {
      contentType: "text/plain",
      content: new TextEncoder().encode("Hello from CKB! This is my first Spore NFT."),
      clusterId: undefined,
    });

    this.mintNft("ckb1alice000000000000000000000000000000", {
      contentType: "application/json",
      content: new TextEncoder().encode(
        JSON.stringify({
          name: "CKB Pixel Art #1",
          description: "First pixel art NFT on CKB",
          attributes: [{ trait_type: "Background", value: "Blue" }],
        })
      ),
      clusterId: "0x" + "cluster".repeat(4) + "00000000",
    });

    // Bob owns one NFT
    this.mintNft("ckb1bob0000000000000000000000000000000", {
      contentType: "text/plain",
      content: new TextEncoder().encode("Bob's exclusive poem: Roses are red, CKB is cool..."),
      clusterId: undefined,
    });
  }

  private mintNft(
    ownerAddress: string,
    params: { contentType: string; content: Uint8Array; clusterId?: string }
  ): SporeNft {
    const sporeId = `0x${"spore".padEnd(62, "0")}${this.nextId.toString().padStart(2, "0")}`;
    this.nextId++;

    // Spore cell capacity calculation:
    // - Base cell overhead: 41 bytes (8 capacity + 33 lock)
    // - Spore type script: 53 bytes
    // - Spore data (molecule encoded): contentType + content + clusterId
    const dataSize =
      4 + // content_type length prefix
      params.contentType.length +
      4 + // content length prefix
      params.content.length +
      (params.clusterId ? 36 : 4); // cluster_id optional field
    const capacityBytes = 41 + 53 + dataSize;
    const capacity = BigInt(capacityBytes) * 100_000_000n; // 1 byte = 1 CKB

    const nft: SporeNft = {
      sporeId,
      ownerAddress,
      contentType: params.contentType,
      content: params.content,
      clusterId: params.clusterId,
      capacity,
    };

    const existing = this.ownedNfts.get(ownerAddress) ?? [];
    this.ownedNfts.set(ownerAddress, [...existing, nft]);
    return nft;
  }

  getNftsForAddress(address: string): SporeNft[] {
    return this.ownedNfts.get(address) ?? [];
  }

  getActiveListings(): NftListing[] {
    return Array.from(this.listings.values()).filter((l) => l.status === "active");
  }

  getListing(listingId: string): NftListing | undefined {
    return this.listings.get(listingId);
  }

  getAllListings(): NftListing[] {
    return Array.from(this.listings.values());
  }

  getCurrentBlock(): bigint {
    return this.currentBlock;
  }

  advanceBlock(n: bigint = 5n): void {
    this.currentBlock += n;
  }

  addListing(listing: NftListing): void {
    this.listings.set(listing.listingId, listing);
  }

  updateListing(listingId: string, updates: Partial<NftListing>): void {
    const existing = this.listings.get(listingId);
    if (existing) {
      this.listings.set(listingId, { ...existing, ...updates });
    }
  }

  transferNft(sporeId: string, fromAddress: string, toAddress: string): boolean {
    const fromNfts = this.ownedNfts.get(fromAddress) ?? [];
    const nftIndex = fromNfts.findIndex((n) => n.sporeId === sporeId);
    if (nftIndex === -1) return false;

    const nft = fromNfts[nftIndex];
    const updatedNft = { ...nft, ownerAddress: toAddress };

    this.ownedNfts.set(fromAddress, fromNfts.filter((_, i) => i !== nftIndex));
    const toNfts = this.ownedNfts.get(toAddress) ?? [];
    this.ownedNfts.set(toAddress, [...toNfts, updatedNft]);
    return true;
  }
}

// ============================================================================
// SECTION 3: Marketplace Operations
// ============================================================================

/**
 * Lists an NFT for sale by creating a sale order cell.
 *
 * ON-CHAIN TRANSACTION:
 * =====================
 *   Inputs:
 *     [0] Seller's Spore cell (the NFT being listed)
 *     [1] Seller's capacity cell (to cover sale order cell storage + fee)
 *
 *   Outputs:
 *     [0] Sale order cell:
 *           lock: MarketplaceLock {
 *             args: spore_id + seller_blake160 + asking_price
 *           }
 *           type: None
 *           data: listing_metadata (timestamp, optional description)
 *           capacity: minimum cell storage cost (~100 CKB)
 *
 *     [1] Seller's change cell (remaining CKB)
 *
 * Note: The Spore NFT itself is NOT in the sale order cell.
 * Instead, the sale order cell's args reference the Spore ID.
 * The actual NFT transfer happens in the BUY transaction.
 *
 * WHY NOT INCLUDE THE SPORE IN THE ORDER CELL?
 * =============================================
 * Including the Spore in the sale order cell would require the order cell
 * to carry a type script (the Spore type), which complicates the lock
 * script design and increases capacity costs.
 *
 * Instead, the marketplace uses a two-step approach:
 *   1. The sale order cell announces the intent to sell (with price)
 *   2. The buy transaction atomically transfers the Spore + CKB
 *
 * The Spore's lock script must be set to the MARKETPLACE LOCK during listing,
 * so that the marketplace lock (not the seller's personal lock) controls the Spore.
 * This is the equivalent of "approving" a token on Ethereum.
 */
export function listNft(
  state: MarketplaceState,
  sellerAddress: string,
  sporeId: string,
  askingPriceCkb: number
): NftListing | null {
  const sellerNfts = state.getNftsForAddress(sellerAddress);
  const nft = sellerNfts.find((n) => n.sporeId === sporeId);

  if (!nft) {
    console.log(`  [ERROR] ${sellerAddress} does not own Spore ${sporeId}`);
    return null;
  }

  const askingPriceShannons = BigInt(Math.floor(askingPriceCkb * 100_000_000));
  const listingId = `0x${"listing".padEnd(60, "0")}${Math.floor(Math.random() * 99)
    .toString()
    .padStart(4, "0")}`;

  const listing: NftListing = {
    listingId,
    spore: nft,
    sellerAddress,
    askingPrice: askingPriceShannons,
    listedAtBlock: state.getCurrentBlock(),
    status: "active",
  };

  state.addListing(listing);
  state.advanceBlock(3n);

  return listing;
}

/**
 * Buys an NFT from a listing.
 *
 * ON-CHAIN TRANSACTION:
 * =====================
 *   Inputs:
 *     [0] Spore cell (currently locked with MarketplaceLock, referencing this listing)
 *     [1] Sale order cell (the listing announcement)
 *     [2] Buyer's CKB cells (enough to cover price + Spore cell capacity + fee)
 *
 *   Outputs:
 *     [0] Buyer's Spore cell (same content, lock changed to buyer's lock)
 *     [1] Seller's CKB cell (asking price goes to seller)
 *     [2] Buyer's change cell (excess CKB returned)
 *
 * WHAT THE MARKETPLACE LOCK SCRIPT VERIFIES:
 * ============================================
 * When the sale order cell is consumed, the marketplace lock script runs and checks:
 *   1. Output[0] is the Spore cell with the correct spore_id (from args)
 *   2. Output[0] has the buyer's address as the lock (Spore transferred)
 *   3. Output[1] sends >= asking_price CKB to seller_blake160 (from args)
 *   4. The Spore type script still validates (Spore invariants preserved)
 *
 * The Spore cell's lock (MarketplaceLock) also runs for Input[0] and checks
 * that the corresponding sale order cell is being consumed in this transaction
 * (this prevents someone from bypassing the order cell and taking the Spore
 * without paying).
 *
 * TOTAL COST TO BUYER:
 * =====================
 * The buyer pays: asking_price + spore_cell_capacity + transaction_fee
 * The seller receives: asking_price
 * The buyer receives: the Spore cell (with its full capacity)
 */
export function buyNft(
  state: MarketplaceState,
  buyerAddress: string,
  listingId: string,
  buyerCkbBalance: bigint
): BuyResult | null {
  const listing = state.getListing(listingId);
  if (!listing || listing.status !== "active") {
    console.log(`  [ERROR] Listing ${listingId} is not active`);
    return null;
  }

  const totalCost = listing.askingPrice + listing.spore.capacity;
  if (buyerCkbBalance < totalCost) {
    console.log(
      `  [ERROR] Insufficient balance. Need ${totalCost} shannons, have ${buyerCkbBalance}`
    );
    return null;
  }

  // Simulate the atomic transfer
  state.transferNft(
    listing.spore.sporeId,
    listing.sellerAddress,
    buyerAddress
  );
  state.updateListing(listingId, { status: "sold" });
  state.advanceBlock(3n);

  // Generate a deterministic fake transaction hash for demo purposes
  const txHash = `0x${"buy".padEnd(60, "0")}${listingId.slice(-4)}`;

  return {
    success: true,
    transactionHash: txHash,
    buyerReceivedSporeId: listing.spore.sporeId,
    sellerReceivedCkb: listing.askingPrice,
    totalBuyerCost: totalCost,
  };
}

/**
 * Cancels a listing, returning the Spore NFT to the seller's control.
 *
 * ON-CHAIN TRANSACTION:
 * =====================
 *   Inputs:
 *     [0] Spore cell (locked with MarketplaceLock)
 *     [1] Sale order cell (the listing announcement)
 *
 *   Outputs:
 *     [0] Seller's Spore cell (lock changed back to seller's standard lock)
 *     [1] Seller's reclaimed capacity cell (sale order cell capacity returned)
 *
 *   Witness:
 *     Seller's signature (proving they own the seller_blake160 in the order args)
 *
 * The marketplace lock detects the cancel path (seller's signature present,
 * no matching buyer payment found) and verifies the signature.
 * The Spore's lock (also MarketplaceLock) runs and verifies the sale order
 * cell is being consumed in the same transaction.
 */
export function cancelListing(
  state: MarketplaceState,
  sellerAddress: string,
  listingId: string
): boolean {
  const listing = state.getListing(listingId);
  if (!listing) {
    console.log(`  [ERROR] Listing ${listingId} not found`);
    return false;
  }

  if (listing.sellerAddress !== sellerAddress) {
    console.log(
      `  [ERROR] Only the seller can cancel. Seller: ${listing.sellerAddress}, Caller: ${sellerAddress}`
    );
    return false;
  }

  if (listing.status !== "active") {
    console.log(`  [ERROR] Cannot cancel a ${listing.status} listing`);
    return false;
  }

  state.updateListing(listingId, { status: "canceled" });
  state.advanceBlock(3n);
  return true;
}

// ============================================================================
// SECTION 4: Display Utilities
// ============================================================================

/** Formats shannons as a human-readable CKB string */
export function formatCkb(shannons: bigint): string {
  const ckb = shannons / 100_000_000n;
  const remainder = shannons % 100_000_000n;
  if (remainder === 0n) return `${ckb} CKB`;
  return `${ckb}.${remainder.toString().padStart(8, "0").replace(/0+$/, "")} CKB`;
}

/** Decodes NFT content based on its MIME type */
export function decodeNftContent(nft: SporeNft): string {
  if (nft.contentType.startsWith("text/")) {
    return new TextDecoder().decode(nft.content);
  } else if (nft.contentType === "application/json") {
    try {
      return JSON.stringify(JSON.parse(new TextDecoder().decode(nft.content)), null, 2);
    } catch {
      return "[Invalid JSON]";
    }
  } else if (nft.contentType.startsWith("image/")) {
    return `[Binary image data: ${nft.content.length} bytes]`;
  }
  return `[Binary data: ${nft.content.length} bytes]`;
}

/** Prints a formatted NFT summary */
export function printNft(nft: SporeNft, indent: string = "  "): void {
  console.log(`${indent}Spore ID:     ${nft.sporeId.slice(0, 20)}...`);
  console.log(`${indent}Owner:        ${nft.ownerAddress}`);
  console.log(`${indent}Content Type: ${nft.contentType}`);
  console.log(`${indent}Content Size: ${nft.content.length} bytes`);
  console.log(`${indent}Content:      ${decodeNftContent(nft).slice(0, 60)}...`);
  console.log(`${indent}Capacity:     ${formatCkb(nft.capacity)}`);
  if (nft.clusterId) {
    console.log(`${indent}Cluster:      ${nft.clusterId.slice(0, 20)}...`);
  }
}

/** Prints a formatted listing summary */
export function printListing(listing: NftListing): void {
  const statusLabel = {
    active: "[ACTIVE]",
    sold: "[SOLD]",
    canceled: "[CANCELED]",
  }[listing.status];

  console.log(`  Listing ${listing.listingId.slice(0, 20)}...`);
  console.log(`    Status:      ${statusLabel} ${listing.status}`);
  console.log(`    Seller:      ${listing.sellerAddress}`);
  console.log(`    Asking:      ${formatCkb(listing.askingPrice)}`);
  console.log(`    Spore:       ${listing.spore.sporeId.slice(0, 20)}... (${listing.spore.contentType})`);
  console.log(`    Listed:      Block #${listing.listedAtBlock}`);
}
