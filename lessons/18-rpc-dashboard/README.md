# Lesson 18: CKB RPC Interface

A hands-on dashboard that demonstrates the full CKB JSON-RPC API by connecting to the Pudge testnet and displaying live chain statistics, block data, transaction details, and real-time monitoring.

## What You Will Learn

- How the CKB JSON-RPC 2.0 protocol works
- Every major RPC method category: chain, pool, net, indexer
- Direct HTTP RPC calls without a SDK
- Typed TypeScript wrappers for RPC responses
- Real-time chain monitoring via polling
- Error handling and retry patterns
- How the CCC SDK wraps the underlying RPC

## Prerequisites

- Node.js 18 or later
- npm 9 or later

## Setup

```bash
npm install
```

## Running

```bash
npm start
```

The dashboard will:
1. Connect to the CKB Pudge testnet
2. Display the current chain tip
3. Fetch a recent block with all transaction data
4. Look up a transaction by hash
5. Query a wallet balance via the indexer
6. Check if a specific cell is live
7. Compute chain statistics over the last 10 blocks
8. Display mempool status
9. Monitor for new blocks for 20 seconds

## Project Structure

```
18-rpc-dashboard/
├── src/
│   ├── index.ts          # Main dashboard CLI (~450 lines)
│   └── rpc-client.ts     # Typed RPC client wrapper with JSDoc
├── package.json
├── tsconfig.json
└── README.md
```

## Key Concepts

### CKB JSON-RPC Overview

CKB exposes a JSON-RPC 2.0 API. Every request is a POST to the node's HTTP endpoint:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "get_tip_header",
  "params": []
}
```

All numeric values are hex-encoded strings with `0x` prefix because JSON numbers cannot represent 64-bit integers accurately.

### RPC Method Categories

| Category | Methods |
|----------|---------|
| **Chain** | `get_tip_header`, `get_tip_block_number`, `get_block`, `get_block_by_number`, `get_header`, `get_header_by_number`, `get_transaction`, `get_blockchain_info` |
| **Cell** | `get_live_cell` |
| **Pool** | `send_transaction`, `get_raw_tx_pool`, `get_pool_tx_detail_info` |
| **Miner** | `get_block_template`, `submit_block` |
| **Stats** | `get_blockchain_info`, `get_deployments_info` |
| **Net** | `local_node_info`, `get_peers`, `get_banned_addresses` |
| **Indexer** | `get_cells`, `get_transactions`, `get_cells_capacity`, `get_indexer_tip` |

### Transport Options

| Transport | Port | Use Case |
|-----------|------|---------|
| HTTP | 8114 | Standard request/response (default) |
| TCP | 8114 | Low-overhead batch requests |
| WebSocket | 18114 | Real-time subscriptions |

### WebSocket Subscriptions

For real-time updates, WebSocket subscriptions push events to your client:

```typescript
// Connect to a local node with WebSocket enabled
const ws = new WebSocket("ws://localhost:18114");

ws.onopen = () => {
  ws.send(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "subscribe",
    params: ["new_tip_header"]
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.method === "subscribe") {
    console.log("New block:", data.params.result);
  }
};
```

Available subscription topics:
- `new_tip_header` - emitted when a new block is committed
- `new_tip_block` - like `new_tip_header` but includes full block data
- `new_transaction` - emitted when a transaction enters the mempool

### Pagination for Cell Queries

The `get_cells` indexer method supports cursor-based pagination:

```typescript
// First page
const page1 = await rpcCall("get_cells", [searchKey, "asc", "0x10"]);

// Next page using the cursor
if (page1.last_cursor !== "0x") {
  const page2 = await rpcCall("get_cells", [searchKey, "asc", "0x10", page1.last_cursor]);
}
```

### Error Handling

CKB RPC uses standard JSON-RPC 2.0 error codes:

| Code | Meaning |
|------|---------|
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -1 to -999 | CKB-specific errors (invalid transaction, etc.) |

### Rate Limiting and Retry

For production applications:

```typescript
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}
```

### How CCC SDK Wraps RPC

The `@ckb-ccc/core` SDK provides a high-level API that wraps the raw RPC:

```typescript
import { ccc } from "@ckb-ccc/core";

// SDK creates a managed client with retry, error handling, and type safety
const client = new ccc.ClientPublicTestnet();

// SDK method (wraps get_tip_header internally)
const tipBlock = await client.getHeaderByNumber("latest");

// SDK method (wraps get_cells + builds transaction)
const tx = ccc.Transaction.from({...});
await tx.completeInputsByCapacity(signer);
```

For advanced use cases -- custom indexer queries, monitoring tools, block explorers -- direct RPC access gives you more control.

## Public RPC Endpoints

| Network | HTTP | Notes |
|---------|------|-------|
| Testnet (Pudge) | https://testnet.ckb.dev | Public, rate limited |
| Mainnet | https://mainnet.ckb.dev | Public, rate limited |
| Local | http://localhost:8114 | Full access, requires local node |

## Real-World Uses

- **CKB Explorer** (explorer.nervos.org) -- fetches blocks and transactions via RPC
- **Wallet backends** -- use `get_cells` and `get_cells_capacity` for balances
- **Monitoring tools** -- poll `get_tip_header` and `get_raw_tx_pool` for health metrics
- **Block indexers** -- fetch every block via `get_block_by_number` in sequence
- **DApp backends** -- submit transactions via `send_transaction`

## Next Steps

- Lesson 19: Running a Full Node -- set up your own CKB node for unrestricted RPC access
- Review the CKB RPC documentation at https://github.com/nervosnetwork/ckb/tree/develop/rpc
- Try the WebSocket subscription API with a local node
