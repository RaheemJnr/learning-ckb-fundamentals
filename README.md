# Learning CKB Fundamentals

A comprehensive 24-lesson incremental learning platform for Nervos CKB blockchain development. Master the Cell Model, write custom scripts in Rust, deploy tokens and NFTs, and build real dApps — all through hands-on, interactive lessons.

**Live Platform:** [https://pocket-node-learn-ckb.vercel.app](https://pocket-node-learn-ckb.vercel.app)

**GitHub:** [https://github.com/RaheemJnr/learning-ckb-fundamentals](https://github.com/RaheemJnr/learning-ckb-fundamentals)

## Curriculum

### Phase 1: Foundations (Lessons 1-6)

| # | Lesson | Key Concepts |
|---|--------|-------------|
| 01 | [Cell Model Explorer](lessons/01-cell-model-explorer/) | CKB architecture, Cell structure (capacity/data/lock/type), comparison with account model |
| 02 | [Transaction Anatomy](lessons/02-transaction-anatomy/) | Transaction structure, inputs/outputs/cell deps, consuming and creating cells |
| 03 | [Capacity Calculator](lessons/03-capacity-calculator/) | CKBytes, state rent, primary/secondary issuance, Nervos DAO |
| 04 | [Dev Environment Setup](lessons/04-dev-environment-setup/) | OffCKB, CKB-CLI, CCC SDK installation, devnet bootstrap |
| 05 | [First Transfer](lessons/05-first-transfer/) | Building a CKB transfer app with CCC SDK |
| 06 | [Cell Explorer](lessons/06-cell-explorer/) | Cell collection, querying, filtering by lock/type script |

### Phase 2: Scripts & Smart Contracts (Lessons 7-12)

| # | Lesson | Key Concepts |
|---|--------|-------------|
| 07 | [Script Basics](lessons/07-script-basics/) | Script execution model, script groups, lock vs type scripts |
| 08 | [Hash Lock Script](lessons/08-hash-lock-script/) | Hash-lock script in Rust, ckb-script-templates |
| 09 | [Script Debugging](lessons/09-script-debugging/) | CKB-Debugger, error codes, testing patterns |
| 10 | [Type Script Counter](lessons/10-type-script-counter/) | State transition validation, counter pattern |
| 11 | [Molecule Serialization](lessons/11-molecule-serialization/) | Binary serialization, schemas, codegen |
| 12 | [CKB-VM Deep Dive](lessons/12-ckb-vm-deep-dive/) | RISC-V VM, syscalls, cycle costs, benchmarking |

### Phase 3: Token Standards & Composability (Lessons 13-17)

| # | Lesson | Key Concepts |
|---|--------|-------------|
| 13 | [xUDT Tokens](lessons/13-xudt-tokens/) | xUDT standard, issuing and transferring fungible tokens |
| 14 | [Spore NFTs](lessons/14-spore-nfts/) | Spore protocol, on-chain content, clusters, melting |
| 15 | [Omnilock Wallet](lessons/15-omnilock-wallet/) | Multisig, anyone-can-pay, time locks, cross-chain auth |
| 16 | [Composability Patterns](lessons/16-composability-patterns/) | First-class assets, script composition, cell deps |
| 17 | [Cell Management](lessons/17-cell-management/) | Cell strategies, capacity optimization, merging/splitting |

### Phase 4: Infrastructure (Lessons 18-20)

| # | Lesson | Key Concepts |
|---|--------|-------------|
| 18 | [RPC Dashboard](lessons/18-rpc-dashboard/) | Full RPC API, chain queries, subscriptions |
| 19 | [Full Node Setup](lessons/19-full-node-setup/) | Node setup, config, syncing, monitoring |
| 20 | [Light Client App](lessons/20-light-client-app/) | FlyClient protocol, light client SDK, proofs |

### Phase 5: Production (Lessons 21-24)

| # | Lesson | Key Concepts |
|---|--------|-------------|
| 21 | [RGB++ Explorer](lessons/21-rgbpp-explorer/) | RGB++ protocol, Bitcoin-CKB isomorphic binding |
| 22 | [Token DEX](lessons/22-token-dex/) | Orderbook, atomic swaps, composable transactions |
| 23 | [NFT Marketplace](lessons/23-nft-marketplace/) | Spore + Omnilock + Next.js, wallet connect |
| 24 | [Mainnet Deployment](lessons/24-mainnet-deployment/) | Testnet deploy, security auditing, production patterns |

## Tech Stack

### Learning Platform (Website)
- **Framework**: Next.js 16 (App Router), TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Content**: MDX via `next-mdx-remote/rsc`
- **Database**: Vercel Postgres + Drizzle ORM
- **Auth**: CCC SDK wallet connection (CKB wallet address as user ID)
- **Deployment**: Vercel

### Lesson Projects (Off-chain / dApps)
- **Language**: TypeScript
- **SDK**: CCC (`@ckb-ccc/ccc`) — current recommended CKB SDK
- **Dev Environment**: OffCKB (local devnet)

### Lesson Projects (On-chain Scripts)
- **Language**: Rust
- **Templates**: ckb-script-templates (via `cargo generate`)
- **Debugging**: CKB-Debugger
- **Target**: RISC-V (CKB-VM)

## Repository Structure

```
learning-ckb-fundamentals/
├── website/                 # Next.js learning platform
│   └── src/
│       ├── app/             # App Router pages and API routes
│       ├── components/      # React components
│       ├── content/         # 24 MDX lesson files + quiz JSONs
│       └── lib/             # DB, auth, and content utilities
├── lessons/                 # 24 standalone lesson projects
│   ├── 01-cell-model-explorer/
│   ├── 02-transaction-anatomy/
│   └── ... (through 24-mainnet-deployment/)
└── docs/
    └── plans/               # Design and implementation docs
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Rust toolchain (for Lessons 7-12 script development)
- Git

### Run the Website Locally

```bash
# Clone the repository
git clone https://github.com/RaheemJnr/learning-ckb-fundamentals.git
cd learning-ckb-fundamentals/website

# Install dependencies
npm install

# Set up environment variables (copy and fill in Vercel Postgres URL)
cp .env.example .env.local

# Start the development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to start learning.

### Work on a Lesson Project

Each lesson in `lessons/` is a standalone project. For TypeScript lessons:

```bash
cd lessons/01-cell-model-explorer
npm install
npm start
```

For Rust script lessons (07-12):

```bash
cd lessons/08-hash-lock-script
cargo build
```

### Environment Variables

To run the website with full functionality (progress tracking, quizzes), set up a Vercel Postgres database and add:

```
POSTGRES_URL=your_vercel_postgres_url
```

## Features

- **24 Progressive Lessons** from CKB basics to mainnet deployment
- **CCC Wallet Auth** — connect your CKB wallet, no email required
- **Progress Tracking** — resume where you left off
- **Interactive Quizzes** — 8 questions per lesson with instant feedback
- **Real-World Examples** — learn from projects like .bit, Spore, Stable++, RGB++
- **Dual Language** — TypeScript/CCC for dApps, Rust for on-chain scripts

## License

MIT
