/**
 * ============================================================================
 * Lesson 22: Building a Token DEX on CKB
 * ============================================================================
 *
 * A decentralized exchange (DEX) allows two parties to swap assets without
 * trusting each other or a central intermediary. On CKB, we can build a
 * DEX using the "order cell" pattern, which exploits CKB's UTXO model to
 * guarantee atomic swaps at the consensus layer.
 *
 * WHAT THIS LESSON COVERS
 * =======================
 * 1. How DEXes work differently on UTXO vs account-based chains
 * 2. The order cell lifecycle: create → fill → (partial fill)* → done
 * 3. The atomic swap guarantee: both get what they want, or nothing happens
 * 4. How the DEX lock script enforces exchange rules on-chain
 * 5. Partial order fills and the remainder cell pattern
 * 6. Order cancellation (maker reclaims their CKB)
 * 7. Front-running resistance properties of this design
 *
 * THE KEY INSIGHT
 * ===============
 * On Ethereum, a DEX smart contract holds both sides of the trade in an
 * account. The contract can be hacked, upgraded (if upgradeable), or
 * front-run because the state lives in a mutable account.
 *
 * On CKB, the "contract" IS the lock script. The order cell literally IS
 * the locked CKB waiting to be swapped. There is no separate escrow account.
 * The exchange rules are enforced by the CKB-VM executing the lock script
 * during transaction validation - no server, no oracle, no trust required.
 *
 * Run with: npx tsx src/index.ts
 * ============================================================================
 */

import {
  OrderCell,
  CreateOrderParams,
  FillOrderParams,
  FillResult,
  encodeOrderArgs,
  decodeOrderArgs,
  calculateCkbToRelease,
  calculateExchangeRate,
  validateOrderParams,
  validateFillParams,
  formatCkb,
  formatToken,
  printOrder,
} from "./dex-helpers.js";

// ============================================================================
// SECTION 1: Understanding DEX Design on CKB vs Ethereum
// ============================================================================

function explainDexArchitecture(): void {
  console.log("\n" + "=".repeat(70));
  console.log("LESSON 22: BUILDING A TOKEN DEX ON CKB");
  console.log("=".repeat(70));

  console.log(`
HOW DEXes WORK: UTXO vs ACCOUNT MODEL
======================================

ETHEREUM-STYLE DEX (Uniswap/Orderbook):
  - A smart contract ACCOUNT holds all liquidity / open orders
  - Users call functions on the contract: addOrder(), fill(), cancel()
  - The contract stores state in its own storage slots
  - Problem: The contract is a central point of failure
  - Problem: Transactions can be front-run by MEV bots watching the mempool

CKB-STYLE DEX (UTXOSwap / Order Cells):
  - Each open order IS a cell sitting live on chain
  - The cell's lock script encodes the trade requirements
  - Anyone can see ALL open orders by scanning cells with the DEX lock
  - A "fill" transaction consumes the order cell and creates outputs
    satisfying all parties simultaneously in one atomic transaction
  - There is no "contract account" that can be hacked or upgraded
  - Front-running is harder: the filler and maker both get what the
    original order specified, regardless of mempool ordering

THE ATOMIC GUARANTEE
====================
  Transaction T (a fill):
    Inputs:  [order cell (1000 CKB)] + [taker token cell (500 TOKENS)]
    Outputs: [maker token cell (500 TOKENS)] + [taker CKB cell (1000 CKB)]
             + [fee to miner]

  CKB-VM executes the order cell's lock script, which checks:
    1. Is there an output sending >= 500 TOKENS to the maker's address?
    2. Does the taker receive the CKB from the order cell?

  If both conditions are TRUE -> transaction is VALID -> both parties get paid
  If either condition is FALSE -> transaction is INVALID -> rejected by all nodes

  This is "atomic" because the swap happens in a single transaction.
  There is NO intermediate state where the CKB is gone but tokens haven't arrived.
`);
}

// ============================================================================
// SECTION 2: Order Cell Structure Deep Dive
// ============================================================================

function explainOrderCellStructure(): void {
  console.log("\n" + "=".repeat(70));
  console.log("ORDER CELL STRUCTURE");
  console.log("=".repeat(70));

  console.log(`
An ORDER CELL is a regular CKB cell with a special lock script.
The lock script's CODE enforces the exchange rules.
The lock script's ARGS encode the specific trade parameters.

ORDER CELL LAYOUT
=================

  capacity  : [8 bytes]  = Amount of CKB the maker is selling
              This is the CKB "locked" in the order. When the order
              is filled, this CKB flows to the taker.

  lock      : OrderLock script
    code_hash : [32 bytes] = Hash of the DEX lock script code
                The same code is used for all orders! Only args differ.
    hash_type : [1 byte]   = "type" (points to deployed script cell)
    args      : [68 bytes] = Trade parameters (see below)
      [0..20]   maker_blake160   : Who receives the incoming tokens
      [20..52]  token_type_hash  : Which token contract is expected
      [52..68]  min_token_amount : uint128 LE - minimum tokens to receive
                                   (for partial fills: proportional CKB released)

  type      : None (order cells do not carry a type script)

  data      : Optional metadata (creation timestamp, order ID, etc.)

WHY ARGS FOR TRADE PARAMETERS?
================================
The lock script code is shared - it's the same bytecode for every order.
Only the ARGS differ between orders. This means:
  - One deployed script serves the entire exchange
  - Users pay less capacity (no need to include full code in each cell)
  - Indexers can find all orders with the same code_hash efficiently
  - The args are immutable once the cell is created (no parameter tampering)

EXAMPLE: Alice wants to sell 1000 CKB for 500 MYTOKEN

  capacity : 100,000,000,000 shannons (1000 CKB)
  lock args:
    maker_blake160  : 0xabcdef...  (Alice's pubkey hash)
    token_type_hash : 0x1234ef...  (MYTOKEN's type script hash)
    min_token_amount: 500_000_000  (500 MYTOKEN with 6 decimals)
`);

  // Show encoding example
  const exampleOrder: CreateOrderParams = {
    makerAddress: "0xabcdef1234567890abcdef1234567890ab",
    ckbToSell: 1_000n * 100_000_000n, // 1000 CKB in shannons
    tokenTypeHash: "0x" + "a".repeat(64),
    minTokensToReceive: 500_000_000n, // 500 tokens with 6 decimals
  };

  const encodedArgs = encodeOrderArgs(exampleOrder);
  console.log(`Example encoded order args: ${encodedArgs.slice(0, 40)}...`);
  console.log(`(68 bytes total: 20 maker + 32 token hash + 16 amount)`);
}

// ============================================================================
// SECTION 3: The In-Memory Order Book (Simulating On-Chain State)
// ============================================================================

/**
 * In a real application, open orders are found by querying the CKB node:
 *   - Use the Indexer API to find all cells with the DEX lock code_hash
 *   - Decode the args of each cell to reconstruct the order parameters
 *   - Display them sorted by price, time, etc.
 *
 * Here we simulate this with an in-memory store to demonstrate the logic.
 */
class SimulatedOrderBook {
  private orders: Map<string, OrderCell> = new Map();
  private nextId: number = 1;
  private currentBlock: bigint = 1_000_000n;

  /** Creates a new order cell on the simulated chain */
  createOrder(params: CreateOrderParams): OrderCell {
    const validation = validateOrderParams(params);
    if (!validation.valid) {
      throw new Error(`Invalid order: ${validation.errors.join("; ")}`);
    }

    const orderId = `0x${"order".padEnd(62, "0")}${this.nextId.toString().padStart(2, "0")}`;
    this.nextId++;

    const order: OrderCell = {
      id: orderId,
      makerAddress: params.makerAddress,
      ckbAmount: params.ckbToSell,
      tokenTypeHash: params.tokenTypeHash,
      minTokenAmount: params.minTokensToReceive,
      filledTokenAmount: 0n,
      status: "open",
      createdAtBlock: this.currentBlock,
    };

    this.orders.set(orderId, order);
    this.currentBlock += 5n; // Simulate time passing
    return order;
  }

  /**
   * Fills an order (fully or partially).
   *
   * WHAT HAPPENS ON-CHAIN (simulated here)
   * ========================================
   * A fill transaction:
   *   Inputs:
   *     [1] order cell (locked with DEX lock script)
   *     [2] taker's token cell (xUDT cell with enough tokens)
   *     [3] taker's capacity cell (for transaction fee)
   *
   *   Outputs:
   *     [1] maker's token cell (NEW cell, tokens go to maker's address)
   *     [2] taker's CKB cell (NEW cell, CKB from order goes to taker)
   *     [3] remainder order cell (if partial fill - same args, less CKB)
   *     [4] fee cell (to miner)
   *
   *   The order cell's lock script executes and checks:
   *     - Output[0] sends >= minTokenAmount tokens to maker
   *     - Output[1] sends correct CKB to taker (proportional for partial fills)
   *     - If partial: Output[2] has same args, correct remaining CKB
   */
  fillOrder(params: FillOrderParams): FillResult {
    const order = this.orders.get(params.orderId);
    if (!order) throw new Error(`Order ${params.orderId} not found`);

    const validation = validateFillParams(order, params.tokenAmountToProvide);
    if (!validation.valid) {
      throw new Error(`Invalid fill: ${validation.errors.join("; ")}`);
    }

    const ckbToRelease = calculateCkbToRelease(order, params.tokenAmountToProvide);
    const isPartialFill = params.tokenAmountToProvide < order.minTokenAmount;
    const remainingCkb = order.ckbAmount - ckbToRelease;

    // Update the order state
    order.filledTokenAmount += params.tokenAmountToProvide;

    if (isPartialFill) {
      // PARTIAL FILL: Update order with remaining CKB and token requirement
      // On-chain, this creates a NEW order cell (remainder) with:
      //   - Same lock script args (same maker, same token type, same rate)
      //   - Reduced capacity (remaining CKB)
      //   - Reduced min_token_amount (proportional to remaining CKB)
      const filledFraction = params.tokenAmountToProvide * 10_000n / order.minTokenAmount;
      order.minTokenAmount = order.minTokenAmount - params.tokenAmountToProvide;
      order.ckbAmount = remainingCkb;
      order.status = "partially_filled";
    } else {
      // FULL FILL: Order is completely consumed
      order.status = "filled";
      order.ckbAmount = 0n;
    }

    this.currentBlock += 5n;

    return {
      success: true,
      makerReceivedTokens: params.tokenAmountToProvide,
      takerReceivedCkb: ckbToRelease,
      isPartialFill,
      remainingCkb,
    };
  }

  /**
   * Cancels an order. Only the maker can cancel.
   *
   * HOW CANCELLATION WORKS ON CKB
   * ================================
   * The order cell's lock script has TWO ways to unlock it:
   *   1. FILL path: Anyone can unlock by satisfying the exchange conditions
   *   2. CANCEL path: The maker can unlock by signing with their private key
   *                   (standard SECP256K1 signature verification)
   *
   * This dual-path design is why the args include the maker's address:
   * the lock script needs it to verify the cancel signature.
   *
   * Cancellation transaction:
   *   Inputs:  [order cell] + [optional fee cell]
   *   Outputs: [maker's reclaimed CKB cell]
   *   Witness: maker's signature over the transaction hash
   */
  cancelOrder(orderId: string, cancelingAddress: string): boolean {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);

    if (order.makerAddress !== cancelingAddress) {
      throw new Error(
        `Only the maker can cancel this order. ` +
          `Maker: ${order.makerAddress}, Canceler: ${cancelingAddress}`
      );
    }

    if (order.status === "filled") {
      throw new Error("Cannot cancel a fully filled order");
    }

    order.status = "canceled";
    this.currentBlock += 3n;
    return true;
  }

  getOrder(orderId: string): OrderCell | undefined {
    return this.orders.get(orderId);
  }

  getOpenOrders(): OrderCell[] {
    return Array.from(this.orders.values()).filter(
      (o) => o.status === "open" || o.status === "partially_filled"
    );
  }

  getAllOrders(): OrderCell[] {
    return Array.from(this.orders.values());
  }
}

// ============================================================================
// SECTION 4: Demo - Creating Orders
// ============================================================================

function demoCreateOrders(book: SimulatedOrderBook): {
  aliceOrder: OrderCell;
  bobOrder: OrderCell;
} {
  console.log("\n" + "=".repeat(70));
  console.log("DEMO: CREATING ORDERS");
  console.log("=".repeat(70));

  // Known token type hash (simulates a deployed xUDT token)
  const MYTOKEN_TYPE_HASH = "0x" + "cafe".repeat(16); // 32 bytes

  console.log("\nAlice wants to sell 1,000 CKB and receive 500 MYTOKEN");
  console.log("This is like placing a limit order: sell CKB @ 2 CKB/TOKEN\n");

  const aliceOrder = book.createOrder({
    makerAddress: "ckb1alice000000000000000000000000000000",
    ckbToSell: 1_000n * 100_000_000n, // 1000 CKB
    tokenTypeHash: MYTOKEN_TYPE_HASH,
    minTokensToReceive: 500_000_000n, // 500 MYTOKEN (6 decimals)
  });

  console.log("Alice's order created successfully:");
  printOrder(aliceOrder);

  console.log("\nBob wants to sell 2,000 CKB and receive 800 MYTOKEN");
  console.log("Bob's rate: ~2.5 CKB/TOKEN (a different price point)\n");

  const bobOrder = book.createOrder({
    makerAddress: "ckb1bob0000000000000000000000000000000",
    ckbToSell: 2_000n * 100_000_000n, // 2000 CKB
    tokenTypeHash: MYTOKEN_TYPE_HASH,
    minTokensToReceive: 800_000_000n, // 800 MYTOKEN
  });

  console.log("Bob's order created successfully:");
  printOrder(bobOrder);

  console.log(`\nOrder book state: ${book.getOpenOrders().length} open orders`);
  return { aliceOrder, bobOrder };
}

// ============================================================================
// SECTION 5: Demo - Filling an Order (Full Fill)
// ============================================================================

function demoFullFill(book: SimulatedOrderBook, order: OrderCell): void {
  console.log("\n" + "=".repeat(70));
  console.log("DEMO: FULL ORDER FILL");
  console.log("=".repeat(70));

  console.log(`
Charlie has 500 MYTOKEN and wants to buy CKB at Alice's price.
Charlie will fill Alice's entire order.

TRANSACTION STRUCTURE (what would happen on-chain):
  Inputs:
    [0] Alice's order cell (1000 CKB, locked with DEX lock)
    [1] Charlie's xUDT cell (500 MYTOKEN)
    [2] Charlie's fee cell (0.001 CKB for transaction fee)

  Outputs:
    [0] Alice's token cell (NEW: 500 MYTOKEN sent to Alice's address)
    [1] Charlie's CKB cell (NEW: 1000 CKB sent to Charlie's address)
    [2] Miner fee (0.001 CKB)

  The DEX lock script on Alice's order cell runs and verifies:
    - Output[0] is an xUDT cell with type_hash = MYTOKEN_TYPE_HASH
    - Output[0] lock is Alice's standard lock (maker gets tokens)
    - xUDT amount in Output[0] >= 500 MYTOKEN (minTokenAmount)
    - Charlie gets 1000 CKB from the order cell

  If all checks pass -> VALID -> both parties get their assets atomically.
`);

  const fillResult = book.fillOrder({
    orderId: order.id,
    takerAddress: "ckb1charlie00000000000000000000000000",
    tokenAmountToProvide: order.minTokenAmount, // Provide exact amount = full fill
  });

  if (fillResult.success) {
    console.log("Full fill SUCCESSFUL:");
    console.log(`  Alice received: ${formatToken(fillResult.makerReceivedTokens, 6, "MYTOKEN")}`);
    console.log(`  Charlie received: ${formatCkb(fillResult.takerReceivedCkb)}`);
    console.log(`  Is partial fill: ${fillResult.isPartialFill}`);
    console.log(`  Remaining CKB in order: ${formatCkb(fillResult.remainingCkb)}`);
  }

  const updatedOrder = book.getOrder(order.id)!;
  console.log("\nOrder state after full fill:");
  printOrder(updatedOrder);
}

// ============================================================================
// SECTION 6: Demo - Partial Fill
// ============================================================================

function demoPartialFill(book: SimulatedOrderBook, order: OrderCell): void {
  console.log("\n" + "=".repeat(70));
  console.log("DEMO: PARTIAL ORDER FILL");
  console.log("=".repeat(70));

  console.log(`
Dave only has 400 MYTOKEN but wants to fill part of Bob's order.
Bob wants 800 MYTOKEN total for 2000 CKB.
Dave provides 400 MYTOKEN (50% of the order).

PARTIAL FILL MATH:
  Total CKB in order: 2000 CKB
  Total tokens wanted: 800 MYTOKEN
  Dave provides:       400 MYTOKEN (50%)
  Dave receives:       400 / 800 * 2000 = 1000 CKB (50%)

REMAINDER CELL:
  After the partial fill, a NEW order cell is created on-chain:
  - Same lock script args (same maker Bob, same token type, same rate)
  - Reduced capacity: 2000 - 1000 = 1000 CKB
  - Reduced min tokens: 800 - 400 = 400 MYTOKEN
  - Anyone can fill the remainder with 400 MYTOKEN to get 1000 CKB

TRANSACTION STRUCTURE:
  Inputs:
    [0] Bob's order cell (2000 CKB)
    [1] Dave's token cell (400 MYTOKEN)

  Outputs:
    [0] Bob's token cell (400 MYTOKEN to Bob)
    [1] Dave's CKB cell (1000 CKB to Dave)
    [2] Remainder order cell (1000 CKB, same DEX lock, 400 MYTOKEN wanted)
`);

  const partialFillResult = book.fillOrder({
    orderId: order.id,
    takerAddress: "ckb1dave000000000000000000000000000000",
    tokenAmountToProvide: 400_000_000n, // 400 MYTOKEN = 50% of Bob's order
  });

  if (partialFillResult.success) {
    console.log("Partial fill SUCCESSFUL:");
    console.log(`  Bob received: ${formatToken(partialFillResult.makerReceivedTokens, 6, "MYTOKEN")}`);
    console.log(`  Dave received: ${formatCkb(partialFillResult.takerReceivedCkb)}`);
    console.log(`  Is partial fill: ${partialFillResult.isPartialFill}`);
    console.log(`  Remaining CKB in order: ${formatCkb(partialFillResult.remainingCkb)}`);
  }

  const updatedOrder = book.getOrder(order.id)!;
  console.log("\nBob's order after partial fill (remainder order cell):");
  printOrder(updatedOrder);

  console.log(`
The remainder order cell still exists on-chain with:
- 1000 CKB locked at the same exchange rate
- Waiting for 400 more MYTOKEN
- Any taker can fill it (Eve, Frank, multiple small fillers, etc.)
`);
}

// ============================================================================
// SECTION 7: Demo - Order Cancellation
// ============================================================================

function demoCancelOrder(book: SimulatedOrderBook, order: OrderCell): void {
  console.log("\n" + "=".repeat(70));
  console.log("DEMO: ORDER CANCELLATION");
  console.log("=".repeat(70));

  console.log(`
Bob wants to cancel the remaining portion of his order and reclaim his CKB.
Only Bob can do this - the lock script verifies his signature.

CANCELLATION TRANSACTION:
  Inputs:
    [0] Bob's remainder order cell (1000 CKB)

  Outputs:
    [0] Bob's reclaimed CKB cell (1000 CKB - fee)

  Witness:
    Bob's SECP256K1 signature over the transaction hash

  The DEX lock script sees no valid "fill" conditions met, then falls
  through to the "cancel" path and verifies the signature matches the
  maker_blake160 stored in the args. If valid -> Bob gets his CKB back.
`);

  try {
    const canceled = book.cancelOrder(order.id, order.makerAddress);
    if (canceled) {
      console.log("Order canceled successfully.");
      console.log(`Bob reclaimed his CKB: ${formatCkb(order.ckbAmount)}`);
    }

    const updatedOrder = book.getOrder(order.id)!;
    console.log("\nOrder state after cancellation:");
    printOrder(updatedOrder);
  } catch (e) {
    console.log(`Cancellation failed: ${(e as Error).message}`);
  }

  // Try to cancel someone else's order (should fail)
  console.log("\nTrying to cancel Bob's order as Eve (should fail):");
  try {
    // Create a fresh order to try canceling
    const evilOrder = book.createOrder({
      makerAddress: "ckb1bob0000000000000000000000000000000",
      ckbToSell: 500n * 100_000_000n,
      tokenTypeHash: "0x" + "cafe".repeat(16),
      minTokensToReceive: 100_000_000n,
    });
    book.cancelOrder(evilOrder.id, "ckb1eve0000000000000000000000000000000");
  } catch (e) {
    console.log(`[EXPECTED ERROR]: ${(e as Error).message}`);
    console.log("Correct! The lock script rejects unauthorized cancel attempts.");
  }
}

// ============================================================================
// SECTION 8: Atomic Swap Guarantee Explanation
// ============================================================================

function explainAtomicSwaps(): void {
  console.log("\n" + "=".repeat(70));
  console.log("THE ATOMIC SWAP GUARANTEE");
  console.log("=".repeat(70));

  console.log(`
WHY SWAPS ARE ATOMIC ON CKB
============================

CKB transactions are atomic by design: ALL inputs are consumed and ALL
outputs are created simultaneously. There is no "step 1, step 2" where
intermediate states exist. Either the full transaction is valid and included
in a block, or it is rejected entirely.

This means a fill transaction like this:

  Inputs:  [order cell (1000 CKB)] + [taker tokens (500 MYTOKEN)]
  Outputs: [maker tokens (500 MYTOKEN)] + [taker CKB (1000 CKB)]

...can NEVER result in a state where:
  - The CKB leaves the order cell but the tokens don't arrive (maker cheated)
  - The tokens move but no CKB is received (taker cheated)
  - The order cell disappears without the maker being compensated

The lock script is the ONLY code that can authorize consumption of the
order cell. It runs on CKB-VM and has access to the full transaction
context. It can check every input and output before approving.

FRONT-RUNNING RESISTANCE
=========================
On Ethereum, a DEX transaction in the mempool reveals what price a user
will accept. MEV bots can insert their own transaction before yours with
a higher gas fee, buying the asset at the lower price and leaving you
with nothing (or a worse price). This is "front-running."

On CKB's UTXO model:
  1. The order cell specifies EXACTLY what the maker will accept.
     The taker cannot change the terms - the lock script enforces them.
  2. If Eve front-runs Bob's fill attempt, Eve just fills Alice's order
     at Alice's specified price. Bob's fill attempt then fails because
     the order cell is already consumed (UTXOs can only be spent once).
  3. No one can get a WORSE price than the order specifies.
  4. The worst that can happen: your fill fails because someone else
     filled the order first. You still have your tokens. You can try
     the next best order.

This is fundamentally better than EVM-based MEV, where attackers can
manipulate prices and extract value from users' trades.

REAL-WORLD IMPLEMENTATION: UTXOSwap
=====================================
UTXOSwap is a production DEX on CKB that uses exactly this pattern.
It combines:
  - Order cells (as described above) for the orderbook
  - An AMM liquidity pool for price discovery
  - A matching engine that fills orders against the AMM or other orders
  - CCC for wallet integration

Learn more: https://utxoswap.xyz
`);
}

// ============================================================================
// SECTION 9: Comparing AMM vs Orderbook DEX
// ============================================================================

function compareAmmVsOrderbook(): void {
  console.log("\n" + "=".repeat(70));
  console.log("AMM vs ORDERBOOK DEX: DESIGN TRADEOFFS");
  console.log("=".repeat(70));

  console.log(`
AUTOMATED MARKET MAKER (AMM) - like Uniswap
============================================
How it works:
  - Liquidity providers deposit token pairs into a pool
  - The pool uses a formula (x * y = k) to price swaps automatically
  - Traders swap against the pool, not against individual orders

Pros:
  + Always has liquidity (as long as LPs exist)
  + Simple user experience (just swap at current price)
  + Passive income for liquidity providers

Cons:
  - Impermanent loss for LPs (a fundamental risk)
  - Price slippage on large trades
  - Not efficient for assets with low liquidity
  - On CKB: harder to implement (pool cell needs complex state management)

ORDERBOOK DEX - like UTXOSwap's limit order side
=================================================
How it works:
  - Makers place limit orders (specific price, amount, duration)
  - Takers fill orders that meet their price requirements
  - Classic market structure: bids and asks

Pros:
  + No slippage for limit orders (get exactly what you asked for)
  + No impermanent loss (makers choose their exact price)
  + Natural fit for CKB's UTXO model (order = cell)
  + Transparent: all orders visible on-chain

Cons:
  - Requires counterparty at your exact price
  - May sit unfilled if price moves away
  - Off-chain matching engine needed for efficiency

CKB's UTXO model is naturally suited to the ORDERBOOK design:
Each open order is a live UTXO (cell) that any taker can consume.
The AMM pattern requires more complex state management because the
pool's invariant must be maintained across many concurrent fills.
`);
}

// ============================================================================
// SECTION 10: Order Book Summary
// ============================================================================

function printOrderBookSummary(book: SimulatedOrderBook): void {
  console.log("\n" + "=".repeat(70));
  console.log("FINAL ORDER BOOK STATE");
  console.log("=".repeat(70));

  const allOrders = book.getAllOrders();
  const openOrders = allOrders.filter(
    (o) => o.status === "open" || o.status === "partially_filled"
  );
  const filledOrders = allOrders.filter((o) => o.status === "filled");
  const canceledOrders = allOrders.filter((o) => o.status === "canceled");

  console.log(`\nOrder Book Summary:`);
  console.log(`  Total orders created: ${allOrders.length}`);
  console.log(`  Open/Partial:        ${openOrders.length}`);
  console.log(`  Filled:              ${filledOrders.length}`);
  console.log(`  Canceled:            ${canceledOrders.length}`);

  if (openOrders.length > 0) {
    console.log(`\nOpen Orders:`);
    openOrders.forEach((o) => printOrder(o));
  }

  console.log(`
KEY TAKEAWAYS
=============
1. Order cells are regular CKB cells with a specialized lock script
2. The lock script enforces fair exchange - no trust required
3. Fills are atomic: both parties receive their assets in one transaction
4. Partial fills create remainder order cells (same rate, less CKB)
5. Cancellation uses the maker's signature to reclaim CKB
6. Front-running resistance is a structural property of the UTXO model
7. One deployed DEX lock script serves the entire exchange (shared code)
8. All orders are visible on-chain via cell indexing

This pattern enables trustless, permissionless DeFi on CKB without
the central contract risks common in account-based blockchain DEXes.
`);
}

// ============================================================================
// MAIN: Run All Demos
// ============================================================================

async function main(): Promise<void> {
  // Section 1: Architecture explanation
  explainDexArchitecture();

  // Section 2: Order cell structure
  explainOrderCellStructure();

  // Initialize the simulated order book
  const orderBook = new SimulatedOrderBook();

  // Section 4: Create orders
  const { aliceOrder, bobOrder } = demoCreateOrders(orderBook);

  // Section 5: Full fill (Alice's order)
  demoFullFill(orderBook, aliceOrder);

  // Section 6: Partial fill (Bob's order)
  demoPartialFill(orderBook, bobOrder);

  // Section 7: Cancel (Bob's remainder)
  const bobRemainder = orderBook.getOrder(bobOrder.id)!;
  demoCancelOrder(orderBook, bobRemainder);

  // Section 8: Atomic swap explanation
  explainAtomicSwaps();

  // Section 9: AMM vs Orderbook comparison
  compareAmmVsOrderbook();

  // Section 10: Final summary
  printOrderBookSummary(orderBook);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
