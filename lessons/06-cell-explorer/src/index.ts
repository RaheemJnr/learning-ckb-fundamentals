/**
 * ============================================================================
 * Lesson 6: Exploring Cells with CCC
 * ============================================================================
 *
 * This CLI application demonstrates how to search for, filter, and analyze
 * on-chain cells on the CKB (Nervos Common Knowledge Base) blockchain using
 * the CCC SDK (Common Chains Connector).
 *
 * What you will learn:
 *   1. How to connect to the CKB testnet using CCC
 *   2. Querying cells by lock script (find cells owned by an address)
 *   3. Querying cells by type script (find cells of a certain "type")
 *   4. Filtering cells by capacity range
 *   5. Searching cells by data patterns (prefix, exact, partial matching)
 *   6. Collecting statistics from cell iteration
 *   7. Classifying different cell types (plain CKB, UDT, NFT, etc.)
 *
 * Key Concepts:
 *   - Cells are the fundamental state unit in CKB (like UTXOs in Bitcoin).
 *   - A "live cell" is one that has been created but not yet consumed (spent).
 *   - A "dead cell" is one that has been consumed as a transaction input.
 *   - The CKB indexer tracks live cells and allows querying by script.
 *   - CCC provides async generators (for-await-of) to iterate through results.
 *
 * Prerequisites:
 *   - Node.js 18+ installed
 *   - npm install (to get @ckb-ccc/core, tsx, typescript)
 *
 * Run with:
 *   npx tsx src/index.ts
 *
 * ============================================================================
 */

import { ccc } from "@ckb-ccc/core";
import {
  formatCKB,
  formatCKBCompact,
  formatData,
  formatScript,
  truncateHex,
  printCell,
  printCellCompact,
  printStats,
  printSection,
  printInfo,
  printWarning,
  classifyCell,
  separator,
} from "./utils.js";

// ============================================================================
// Configuration
// ============================================================================

/**
 * We use a well-known testnet address for demonstration.
 *
 * In CKB, an address encodes a lock script. The lock script is what determines
 * ownership of a cell — only someone who can satisfy the lock script's
 * conditions (typically a signature check) can spend the cell.
 *
 * This is a CKB testnet faucet address that usually has many live cells,
 * making it ideal for exploring cell query patterns.
 */
const DEMO_TESTNET_ADDRESS = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqfkcv98jy3q3fhn84n7s6r7c0kpqtsx56salqyeg";

/**
 * Maximum number of cells to fetch per query.
 * We limit this to keep the demo fast and output manageable.
 * In production, you would paginate or stream through all results.
 */
const MAX_CELLS_PER_QUERY = 10;

// ============================================================================
// Main Application
// ============================================================================

async function main(): Promise<void> {
  console.log("\n");
  printSection("Lesson 6: Exploring Cells with CCC");
  console.log("\n  A hands-on guide to querying and analyzing CKB cells.\n");

  // --------------------------------------------------------------------------
  // Step 1: Connect to CKB Testnet
  // --------------------------------------------------------------------------
  // The CCC SDK provides a convenient client that connects to public testnet
  // RPC endpoints. This client abstracts away the raw JSON-RPC calls and
  // provides type-safe methods for all CKB operations.
  //
  // Under the hood, this connects to:
  //   - A CKB full node RPC (for submitting transactions, getting blocks)
  //   - A CKB indexer RPC (for querying cells and transactions by script)
  // --------------------------------------------------------------------------

  printSection("Step 1: Connecting to CKB Testnet");

  const client = new ccc.ClientPublicTestnet();
  printInfo("Connected to CKB public testnet via CCC SDK");

  // Fetch the current tip (latest block number) to verify our connection
  const tip = await client.getTip();
  printInfo(`Current chain tip: block #${tip}`);
  console.log("");

  // --------------------------------------------------------------------------
  // Step 2: Parse an Address into a Lock Script
  // --------------------------------------------------------------------------
  // CKB addresses encode a lock script. To search for cells owned by an
  // address, we first decode the address back into its lock script.
  //
  // A lock script has three fields:
  //   - codeHash: identifies which on-chain script program to run
  //   - hashType: how the codeHash references the program
  //   - args:     arguments passed to the script (usually a pubkey hash)
  //
  // The default lock script is "secp256k1-blake160", which verifies a
  // secp256k1 signature against a blake160 hash of the public key.
  // --------------------------------------------------------------------------

  printSection("Step 2: Decoding Address to Lock Script");

  // ccc.Address.fromString parses a CKB address and extracts the lock script
  const address = await ccc.Address.fromString(DEMO_TESTNET_ADDRESS, client);
  const lockScript = address.script;

  printInfo(`Address: ${DEMO_TESTNET_ADDRESS.slice(0, 30)}...`);
  printInfo("Decoded lock script:");
  console.log(formatScript(lockScript as any, 6));
  console.log("");

  // --------------------------------------------------------------------------
  // Step 3: Search Cells by Lock Script
  // --------------------------------------------------------------------------
  // The most common cell query: find all live cells owned by a given lock
  // script. This is equivalent to asking "What cells does this address own?"
  //
  // CCC's `findCellsByLock()` returns an AsyncGenerator. This means:
  //   - Results are streamed lazily (not all loaded into memory at once)
  //   - You iterate with `for await (const cell of generator)`
  //   - You can break out early once you have enough results
  //
  // Behind the scenes, CCC calls the CKB indexer's `get_cells` RPC method
  // with pagination, fetching results in batches.
  // --------------------------------------------------------------------------

  printSection("Step 3: Query Cells by Lock Script");
  printInfo("Searching for cells owned by the demo address...");
  printInfo(`(Limiting to first ${MAX_CELLS_PER_QUERY} cells)\n`);

  // Track statistics as we iterate
  let stats = {
    totalCells: 0,
    totalCapacity: 0n,
    cellsWithType: 0,
    cellsWithData: 0,
    minCapacity: BigInt(Number.MAX_SAFE_INTEGER),
    maxCapacity: 0n,
  };

  // findCellsByLock returns an AsyncGenerator<Cell>
  // Parameters:
  //   - lock: the lock script to search for
  //   - type: optional type script filter (null = any type)
  //   - withData: whether to include cell data in results (default true)
  //   - order: "asc" or "desc" by block number
  //   - limit: max number of cells to return
  const cellsByLock = client.findCellsByLock(
    lockScript,      // Lock script to match
    undefined,       // No type script filter (find all cell types)
    true,            // Include output data in results
    "desc",          // Newest cells first
    MAX_CELLS_PER_QUERY
  );

  // Iterate through the async generator using for-await-of
  // Each `cell` is a fully-hydrated Cell object with:
  //   - cell.outPoint: { txHash, index } — unique reference to this cell
  //   - cell.cellOutput: { capacity, lock, type } — the cell's metadata
  //   - cell.outputData: hex string of the cell's stored data
  for await (const cell of cellsByLock) {
    // Print detailed info for the first 3 cells
    if (stats.totalCells < 3) {
      printCell(cell, stats.totalCells);

      // Classify what kind of cell this is
      const cellType = classifyCell(cell);
      console.log(`  ${"\x1b[1m"}Type:${"\x1b[0m"} ${cellType}`);
    } else if (stats.totalCells === 3) {
      console.log("\n  ... showing remaining cells in compact format:\n");
    }

    // Show compact view for remaining cells
    if (stats.totalCells >= 3) {
      printCellCompact(cell, stats.totalCells);
    }

    // Accumulate statistics
    const capacity = cell.cellOutput.capacity;
    stats.totalCells++;
    stats.totalCapacity += capacity;
    if (cell.cellOutput.type) stats.cellsWithType++;
    if (cell.outputData && cell.outputData !== "0x") stats.cellsWithData++;
    if (capacity < stats.minCapacity) stats.minCapacity = capacity;
    if (capacity > stats.maxCapacity) stats.maxCapacity = capacity;
  }

  // Display aggregated statistics
  if (stats.totalCells > 0) {
    printStats(stats);
  } else {
    printWarning("No cells found for this lock script.");
    printInfo("This could mean the address has no funds on testnet.");
    printInfo("Try using a testnet faucet to send CKB to this address.\n");
  }

  // --------------------------------------------------------------------------
  // Step 4: Search Cells by Type Script
  // --------------------------------------------------------------------------
  // Type scripts define validation logic for cells. Querying by type script
  // lets you find all cells governed by a particular smart contract.
  //
  // Common use cases:
  //   - Find all UDT (User Defined Token) cells of a specific token
  //   - Find all Spore NFT cells
  //   - Find all Nervos DAO deposit cells
  //
  // Here we search for Nervos DAO cells as an example. The Nervos DAO is
  // CKB's built-in "savings account" — users deposit CKB and earn interest
  // from secondary issuance.
  // --------------------------------------------------------------------------

  printSection("Step 4: Query Cells by Type Script (Nervos DAO)");
  printInfo("Searching for Nervos DAO cells on testnet...\n");

  try {
    // Get the known Nervos DAO script info from the CCC SDK.
    // KnownScript is an enum of well-known scripts deployed on CKB.
    const daoScriptInfo = await client.getKnownScript(ccc.KnownScript.NervosDao);

    // Construct a type script for Nervos DAO
    // The Nervos DAO type script has fixed codeHash and hashType, with empty args
    const daoTypeScript = ccc.Script.from({
      codeHash: daoScriptInfo.codeHash,
      hashType: daoScriptInfo.hashType,
      args: "0x",
    });

    printInfo("Nervos DAO type script:");
    console.log(formatScript(daoTypeScript as any, 6));
    console.log("");

    // findCellsByType searches by the type script field instead of lock script.
    // This finds ALL cells with this type script, regardless of who owns them.
    let daoCount = 0;
    let daoTotalCapacity = 0n;

    for await (const cell of client.findCellsByType(
      daoTypeScript,
      true,       // include data
      "desc",     // newest first
      5           // limit to 5 results for demo
    )) {
      daoCount++;
      daoTotalCapacity += cell.cellOutput.capacity;

      // Nervos DAO cells store phase information in their data:
      //   - Deposit cells: data = 0x0000000000000000 (8 zero bytes)
      //   - Withdraw phase 1 cells: data = block number of deposit (8 bytes LE)
      const dataBytes = cell.outputData;
      const isDeposit = dataBytes === "0x0000000000000000";

      console.log(
        `  DAO Cell #${daoCount}: ` +
        `${formatCKBCompact(cell.cellOutput.capacity).padEnd(18)} | ` +
        `Phase: ${isDeposit ? "Deposit" : "Withdraw"} | ` +
        `OutPoint: ${truncateHex(cell.outPoint.txHash, 16)}:${cell.outPoint.index}`
      );
    }

    if (daoCount > 0) {
      separator();
      printInfo(`Found ${daoCount} Nervos DAO cells, total: ${formatCKB(daoTotalCapacity)}`);
    } else {
      printInfo("No Nervos DAO cells found (this is normal on a fresh testnet).");
    }
  } catch (error) {
    printWarning(`Could not query Nervos DAO cells: ${error}`);
  }

  console.log("");

  // --------------------------------------------------------------------------
  // Step 5: Filter Cells by Capacity Range
  // --------------------------------------------------------------------------
  // The CKB indexer supports filtering cells by their capacity (CKByte value).
  // This is useful when you need cells of a specific size, for example:
  //   - Finding cells large enough to cover a transaction
  //   - Identifying "dust" cells (cells near minimum capacity)
  //   - Finding high-value cells
  //
  // The filter is specified as part of a search key object that includes:
  //   - script / scriptType: the primary search criteria
  //   - filter.outputCapacityRange: [min, max) — note the exclusive upper bound
  //
  // Ranges use [inclusive, exclusive) semantics, like Python's range().
  // --------------------------------------------------------------------------

  printSection("Step 5: Filter Cells by Capacity Range");
  printInfo("Searching for cells between 100 and 1,000 CKB...\n");

  // Define capacity range: 100 CKB to 1,000 CKB (in shannons)
  const minCapacity = 100n * 100_000_000n;  // 100 CKB = 10,000,000,000 shannons
  const maxCapacity = 1_000n * 100_000_000n; // 1,000 CKB

  // Use the lower-level findCells method with a full search key.
  // This gives us access to all filter options available in the CKB indexer.
  const filteredCells = client.findCells(
    {
      script: lockScript,
      scriptType: "lock",             // We are searching by lock script
      scriptSearchMode: "exact",      // Match the full lock script exactly
      filter: {
        // outputCapacityRange is [min, max) — min inclusive, max exclusive
        outputCapacityRange: [minCapacity, maxCapacity],
      },
      withData: true,
    },
    "desc",
    5 // limit to 5 results
  );

  let filteredCount = 0;
  for await (const cell of filteredCells) {
    filteredCount++;
    printCellCompact(cell, filteredCount - 1);
  }

  if (filteredCount > 0) {
    printInfo(`\nFound ${filteredCount} cells in the 100-1,000 CKB range.`);
  } else {
    printInfo("No cells found in the 100-1,000 CKB range for this address.");
    printInfo("This is expected if the address has very few cells or only large ones.");
  }
  console.log("");

  // --------------------------------------------------------------------------
  // Step 6: Search Cells by Data Patterns
  // --------------------------------------------------------------------------
  // CKB cells can store arbitrary data. The indexer supports searching for
  // cells whose output data matches a specific pattern.
  //
  // Three search modes are available:
  //   - "prefix": data starts with the given hex bytes
  //   - "exact":  data is exactly the given hex bytes
  //   - "partial": data contains the given hex bytes anywhere
  //
  // This is powerful for finding specific types of on-chain state, such as:
  //   - UDT cells with a specific balance encoded in their data
  //   - Cells with a particular magic number header
  //   - Nervos DAO deposit cells (data = 0x0000000000000000)
  // --------------------------------------------------------------------------

  printSection("Step 6: Search Cells by Data Patterns");

  // Example: Find cells with data that starts with "0x00"
  // This catches many standard patterns including Nervos DAO deposits
  printInfo("Searching for cells with data starting with 0x00...\n");

  const dataPrefixCells = client.findCells(
    {
      script: lockScript,
      scriptType: "lock",
      scriptSearchMode: "exact",
      filter: {
        // outputData: the hex bytes to search for
        outputData: "0x00",
        // outputDataSearchMode: how to match the data
        outputDataSearchMode: "prefix",
      },
      withData: true,
    },
    "desc",
    5
  );

  let dataMatchCount = 0;
  for await (const cell of dataPrefixCells) {
    dataMatchCount++;
    const preview = cell.outputData.length > 20
      ? cell.outputData.slice(0, 20) + "..."
      : cell.outputData;
    console.log(
      `  ${dataMatchCount}. ${formatCKBCompact(cell.cellOutput.capacity).padEnd(18)} | ` +
      `Data: ${preview} | ` +
      `Type: ${classifyCell(cell)}`
    );
  }

  if (dataMatchCount === 0) {
    printInfo("No cells found with data prefix 0x00 for this address.");
  }
  console.log("");

  // --------------------------------------------------------------------------
  // Step 7: Get Total Balance with getCellsCapacity
  // --------------------------------------------------------------------------
  // Instead of iterating through all cells to sum capacities, you can use the
  // `getCellsCapacity` RPC method for an efficient server-side sum.
  //
  // This is much faster for addresses with many cells because:
  //   - No cell data needs to be transferred over the network
  //   - The indexer computes the sum internally
  //   - It returns a single number instead of thousands of cells
  // --------------------------------------------------------------------------

  printSection("Step 7: Efficient Balance Query");
  printInfo("Fetching total balance without iterating all cells...");

  const totalBalance = await client.getBalanceSingle(lockScript);
  printInfo(`Total balance: ${formatCKB(totalBalance)}`);
  printInfo(`(That's ${totalBalance.toString()} shannons)`);
  console.log("");

  // --------------------------------------------------------------------------
  // Step 8: Understanding Live vs Dead Cells
  // --------------------------------------------------------------------------
  // An important concept in CKB's Cell Model:
  //
  // LIVE CELLS:
  //   - Cells that exist in the current state (have been created, not consumed)
  //   - These are what the indexer tracks and what queries return
  //   - They can be used as inputs in new transactions
  //
  // DEAD CELLS:
  //   - Cells that have been consumed (used as a transaction input)
  //   - They no longer exist in the current state
  //   - Their data is still in the blockchain history but not in the live set
  //   - The indexer does NOT return dead cells in search results
  //
  // This is analogous to Bitcoin's UTXO model:
  //   - Live cell = Unspent Transaction Output (UTXO)
  //   - Dead cell = Spent Transaction Output
  //
  // When you spend a cell, it "dies" and new cells are created as outputs.
  // This is the fundamental state transition in CKB.
  // --------------------------------------------------------------------------

  printSection("Step 8: Live vs Dead Cells");
  printInfo("All cells returned by the indexer are LIVE cells.");
  printInfo("Dead cells have been consumed and are no longer in the current state.");
  printInfo("");
  printInfo("Live cell = Created as a transaction output, not yet spent.");
  printInfo("Dead cell = Was consumed as a transaction input.");
  printInfo("");
  printInfo("To check if a specific cell is still live, use getCellLive:");
  console.log("");

  // Demonstrate checking if a specific cell is live
  // We will use the first cell we found earlier (if any)
  if (stats.totalCells > 0) {
    // Re-query to get one cell for demonstration
    let sampleCell: ccc.Cell | undefined;
    for await (const cell of client.findCellsByLock(lockScript, undefined, true, "desc", 1)) {
      sampleCell = cell;
      break;
    }

    if (sampleCell) {
      printInfo(`Checking if cell ${truncateHex(sampleCell.outPoint.txHash, 16)}:${sampleCell.outPoint.index} is still live...`);

      // getCellLive queries the node to check if a cell is still alive.
      // Parameters:
      //   - outPoint: the cell to check
      //   - withData: whether to include the data field
      //   - includeTxPool: whether to consider pending transactions
      const liveCell = await client.getCellLive(
        sampleCell.outPoint,
        true,   // include data
        true    // include tx pool (considers pending transactions)
      );

      if (liveCell) {
        printInfo("Cell is LIVE (exists in current state)");
        printInfo(`  Capacity: ${formatCKB(liveCell.cellOutput.capacity)}`);
      } else {
        printInfo("Cell is DEAD (has been consumed)");
      }
    }
  }

  console.log("");

  // --------------------------------------------------------------------------
  // Step 9: Advanced — Iterating with Pagination
  // --------------------------------------------------------------------------
  // For large result sets, CCC handles pagination automatically through its
  // async generators. But you can also use the lower-level `findCellsPaged`
  // method for manual pagination control.
  //
  // Manual pagination is useful when you need:
  //   - To save/resume pagination cursors (e.g., for a UI with "Load More")
  //   - Custom batch processing logic
  //   - To measure how many pages of results there are
  // --------------------------------------------------------------------------

  printSection("Step 9: Manual Pagination Demo");
  printInfo("Demonstrating paginated cell queries...\n");

  // findCellsPaged returns a batch of results plus a cursor for the next page
  const searchKey = {
    script: lockScript,
    scriptType: "lock" as const,
    scriptSearchMode: "exact" as const,
    withData: false,    // skip data for faster pagination
  };

  let cursor: string | undefined = undefined;
  let pageNum = 0;
  let totalPaginated = 0;

  // Fetch up to 3 pages of 3 cells each
  while (pageNum < 3) {
    const response = await client.findCellsPaged(
      searchKey,
      "asc",         // oldest first
      3,             // 3 cells per page
      cursor         // pagination cursor (undefined for first page)
    );

    pageNum++;
    const cellCount = response.cells.length;
    totalPaginated += cellCount;

    console.log(`  Page ${pageNum}: ${cellCount} cells`);
    for (const cell of response.cells) {
      console.log(
        `    - ${truncateHex(cell.outPoint.txHash, 16)}:${cell.outPoint.index} | ${formatCKBCompact(cell.cellOutput.capacity)}`
      );
    }

    // Update cursor for the next page
    cursor = response.lastCursor;

    // If we got fewer cells than requested, there are no more pages
    if (cellCount < 3) {
      printInfo(`\nReached the end after ${pageNum} page(s).`);
      break;
    }
  }

  if (pageNum >= 3) {
    printInfo(`\nStopped after ${pageNum} pages (${totalPaginated} cells total).`);
    printInfo("More cells may be available with continued pagination.");
  }

  console.log("");

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------

  printSection("Summary");
  console.log("");
  printInfo("In this lesson, you learned how to:");
  printInfo("  1. Connect to CKB testnet with the CCC SDK");
  printInfo("  2. Decode a CKB address into its lock script");
  printInfo("  3. Search cells by lock script (find cells by owner)");
  printInfo("  4. Search cells by type script (find cells by contract)");
  printInfo("  5. Filter cells by capacity range");
  printInfo("  6. Search cells by data patterns (prefix, exact, partial)");
  printInfo("  7. Get total balance efficiently with getCellsCapacity");
  printInfo("  8. Understand live cells vs dead cells");
  printInfo("  9. Use manual pagination for large result sets");
  printInfo("  10. Classify cells into types (Plain CKB, UDT, NFT, etc.)");
  console.log("");
  printInfo("Key takeaways:");
  printInfo("  - The CKB indexer is your gateway to querying on-chain state");
  printInfo("  - CCC provides both high-level (findCellsByLock) and low-level (findCells) APIs");
  printInfo("  - Async generators let you stream results without loading everything into memory");
  printInfo("  - Filters (capacity range, data patterns) narrow results at the indexer level");
  console.log("");
  separator("=", 50);
  console.log("");
}

// ============================================================================
// Run the application
// ============================================================================

main().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
