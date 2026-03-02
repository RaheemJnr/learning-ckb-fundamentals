# Lesson 19: Running a CKB Full Node

A comprehensive guide and monitoring tool for setting up and running your own CKB full node. Includes a TypeScript monitoring dashboard that connects to your local node and displays real-time sync progress, peer connections, mempool status, and chain statistics.

## Why Run a Full Node?

- **No rate limits** — Unlimited RPC requests for your applications
- **Full access** — Net and admin RPC methods disabled on public endpoints
- **Trust** — Independently verify all transactions and blocks
- **Privacy** — Your queries stay local; public endpoints can see your addresses
- **Reliability** — Your apps work even if public endpoints go down
- **Decentralization** — Contributing to CKB's P2P network security

## Hardware Requirements

### Minimum
- CPU: 2 cores (x86_64 or ARM64)
- RAM: 4 GB
- Storage: 100 GB SSD (testnet), 500 GB SSD (mainnet)
- Network: 5 Mbps stable

### Recommended
- CPU: 4+ cores
- RAM: 8 GB+
- Storage: 1 TB NVMe SSD
- Network: 20+ Mbps

## Quick Start

### Option A: Use the Setup Script

```bash
# Testnet (recommended for learning)
bash scripts/setup.sh testnet

# Mainnet
bash scripts/setup.sh mainnet

# Local devnet
bash scripts/setup.sh dev
```

### Option B: Manual Setup

**1. Download CKB**

Visit https://github.com/nervosnetwork/ckb/releases and download the latest release for your platform.

```bash
# macOS (Apple Silicon)
curl -LO https://github.com/nervosnetwork/ckb/releases/download/v0.119.0/ckb_v0.119.0_aarch64-apple-darwin.tar.gz
tar -xzf ckb_v0.119.0_aarch64-apple-darwin.tar.gz
export PATH="$PATH:$(pwd)/ckb_v0.119.0_aarch64-apple-darwin"
```

Always verify the SHA256 checksum from the releases page before running.

**2. Initialize the node**

```bash
mkdir -p ~/ckb-testnet && cd ~/ckb-testnet
ckb init --chain testnet
```

This creates:
- `ckb.toml` — main node configuration
- `ckb-miner.toml` — mining configuration
- `specs/` — chain specification files

**3. Start the node**

```bash
ckb run
```

**4. Run the monitoring tool**

```bash
# In this lesson directory:
npm install
npm start
```

### Option C: OffCKB (Instant Local Devnet)

For development without syncing:

```bash
npx @offckb/cli@latest start
```

OffCKB provides a pre-configured local devnet with instant block production, pre-funded test accounts, and all system scripts deployed. The RPC endpoint is the same: `http://localhost:8114`.

## Running the Monitor

```bash
npm install
npm start
```

The monitor will:
1. Try to connect to `localhost:8114`
2. If a local node is found: display full monitoring dashboard
3. If no local node: display setup instructions + public testnet fallback

## Project Structure

```
19-full-node-setup/
├── src/
│   └── index.ts          # Node monitoring tool
├── scripts/
│   └── setup.sh          # OS-aware setup guide script
├── package.json
├── tsconfig.json
└── README.md
```

## ckb.toml Configuration Reference

The main configuration file created by `ckb init`. Key sections:

### [rpc] — JSON-RPC server

```toml
[rpc]
# HTTP RPC listen address (default port 8114)
listen_address = "127.0.0.1:8114"

# TCP listen address (optional, same port range)
tcp_listen_address = "127.0.0.1:18114"

# WebSocket listen address (for subscriptions)
# ws_listen_address = "127.0.0.1:28114"

# List of RPC modules to enable
modules = ["Net", "Pool", "Miner", "Chain", "Stats", "Subscription", "Experiment", "Debug", "Indexer"]
```

### [network] — P2P networking

```toml
[network]
# P2P listen addresses
listen_addresses = ["/ip4/0.0.0.0/tcp/8115"]

# Maximum peers
max_peers = 8
max_outbound_peers = 8

# Bootstrap nodes (pre-configured for mainnet/testnet by ckb init)
# bootnodes = [...]
```

### [store] — Data storage

```toml
[store]
# Directory for blockchain data (relative to ckb.toml location)
path = "data"

# Uncomment for pruned mode (less disk space):
# block_cache_size = 0  # Disable full block caching
```

### [indexer] — Cell indexer

The indexer is enabled by default in CKB 0.101+. It builds an index of cells by lock script and type script, enabling `get_cells`, `get_cells_capacity`, and `get_transactions` queries.

### [tx_pool] — Transaction pool

```toml
[tx_pool]
# Minimum fee rate (shannons per 1000 bytes)
min_fee_rate = 1000

# Maximum pool size in bytes
max_tx_pool_size = 180_000_000
```

## Starting the Node

### Testnet (Pudge)

```bash
cd ~/ckb-testnet
ckb run
```

Expected sync time: 1-4 hours. The Pudge testnet has been running since 2021.

### Mainnet

```bash
cd ~/ckb-mainnet
ckb run
```

Expected sync time: 12-48 hours. Storage: 500+ GB.

### Devnet (Local Development)

```bash
cd ~/ckb-dev
ckb run --ba-arg 0x <your-lock-arg>
```

Or use OffCKB which handles all configuration automatically.

## Pruned Mode vs Archive Mode

| Mode | Description | Use Case |
|------|-------------|---------|
| Archive (default) | Stores all historical block data | Block explorers, historical queries |
| Pruned | Stores only recent blocks + UTXO set | Wallets, DApps, lower storage requirements |

To enable pruned mode, modify `ckb.toml`:
```toml
[store]
# Keep only last N blocks (minimum required for security)
# block_cache_size = 0
```

## Indexer Configuration

The indexer is required for wallet balance queries and cell searches. It processes all historical blocks on first enable, which takes time proportional to chain length.

Check indexer status:
```bash
curl -s -X POST http://localhost:8114 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"get_indexer_tip","params":[]}'
```

## Monitoring Sync Progress

```bash
# Check sync state
curl -s -X POST http://localhost:8114 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"sync_state","params":[]}' \
  | python3 -m json.tool

# Check current block height
curl -s -X POST http://localhost:8114 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"get_tip_block_number","params":[]}'
```

## Connecting Your DApp to Your Local Node

```typescript
import { ccc } from "@ckb-ccc/core";

// Point CCC SDK at your local node
const client = new ccc.ClientTestnet("http://localhost:8114");

// Or use the raw RPC client from Lesson 18
const rpcClient = new CkbRpcClient("http://localhost:8114");
```

## Security Best Practices

1. **Firewall the RPC port** — Only expose port 8114 on localhost unless you specifically need remote access.

2. **Do not expose admin methods** — If running a public-facing node, restrict the modules list in ckb.toml to exclude `Debug` and administrative methods.

3. **Keep CKB updated** — Security patches are released regularly. Subscribe to releases at https://github.com/nervosnetwork/ckb/releases

4. **Use a dedicated machine or VM** — Running a node on the same machine as sensitive applications increases risk.

5. **Back up your data directory** — If you run a node with a wallet or as part of a business, back up the data directory regularly.

6. **Verify binary checksums** — Always verify SHA256 checksums of downloaded CKB binaries before running them.

## Troubleshooting

### Node won't start
- Check if port 8114 is already in use: `lsof -i :8114`
- Verify ckb.toml syntax (TOML is strict about syntax)
- Check the log output: `ckb run 2>&1 | head -50`

### Sync is very slow
- Check peer count: `curl ... get_peers` — you need at least 3 good peers
- Check your network bandwidth
- NVMe SSD significantly speeds up sync vs HDD
- Consider temporarily disabling the indexer during initial sync, then re-enabling

### RPC not responding
- Ensure `listen_address` in ckb.toml is correct
- Check firewall rules
- Verify the node is actually running: `ps aux | grep ckb`

### Out of disk space
- The blockchain grows over time — ensure you have enough headroom
- Consider pruned mode if storage is constrained
- Move the data directory to a larger disk: change `path` in ckb.toml

### Indexer behind chain tip
- Normal during initial sync or after enabling the indexer on an existing node
- The indexer processes blocks at ~10,000-50,000 blocks/minute depending on hardware
- Do not query the indexer until it catches up to the chain tip

## P2P Network Details

CKB uses a custom P2P network based on libp2p with:
- **TCP** on port 8115 (default) for block and transaction propagation
- **Peer discovery** using a Kademlia-based DHT
- **Bootstrap nodes** pre-configured in the chain spec
- **Peer scoring** that prioritizes well-behaved, responsive peers

The network automatically finds peers after connecting to bootstrap nodes. You typically see 5-10 peers within a minute of starting the node.

## Next Steps

- Lesson 20: Light Client Application -- build with CKB's light client protocol
- Explore the node logs: `tail -f ckb.log | grep CKB`
- Try mining on devnet: `ckb miner` (after `ckb run` in a separate terminal)
