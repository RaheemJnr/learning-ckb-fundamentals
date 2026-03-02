# CKB Learning Platform - Design Document

**Date**: 2026-03-02
**Status**: Approved

## Overview

A comprehensive 24-lesson incremental learning platform for Nervos CKB blockchain development, served via a Vercel-hosted Next.js website with wallet-based auth, progress tracking, quizzes, and real-world examples.

## Tech Stack

### Website (Learning Platform)
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Content**: MDX for lesson pages
- **Database**: Vercel Postgres
- **Auth**: CCC SDK wallet connection (CKB wallet address as user ID)
- **Deployment**: Vercel
- **ORM**: Drizzle ORM

### Lesson Projects (Off-chain / dApps)
- **Language**: TypeScript
- **SDK**: CCC (@ckb-ccc/ccc)
- **Dev Environment**: OffCKB (local devnet)
- **Runtime**: Node.js

### Lesson Projects (On-chain Scripts)
- **Language**: Rust
- **Templates**: ckb-script-templates
- **Debugging**: CKB-Debugger
- **Target**: RISC-V (CKB-VM)

## Curriculum (24 Lessons)

### Phase 1: Foundations (Lessons 1-6)

| # | Title | Key Concepts | Project Folder |
|---|-------|-------------|----------------|
| 1 | What is CKB? The Cell Model | CKB architecture, Cell structure (capacity/data/lock/type), comparison with account model | `01-cell-model-explorer` |
| 2 | Transactions & the UTXO Flow | Transaction structure, inputs/outputs/cell deps, consuming and creating cells | `02-transaction-anatomy` |
| 3 | CKB Tokenomics & Capacity | CKBytes, state rent, primary/secondary issuance, Nervos DAO | `03-capacity-calculator` |
| 4 | Setting Up Your Dev Environment | OffCKB, CKB-CLI, CCC SDK installation, devnet bootstrap | `04-dev-environment-setup` |
| 5 | Your First CKB Transfer | Building a CKB transfer app with CCC SDK | `05-first-transfer` |
| 6 | Exploring Cells with CCC | Cell collection, querying, filtering by lock/type script | `06-cell-explorer` |

### Phase 2: Scripts & Smart Contracts (Lessons 7-12)

| # | Title | Key Concepts | Project Folder |
|---|-------|-------------|----------------|
| 7 | Lock Scripts & Type Scripts | Script execution model, script groups, deps | `07-script-basics` |
| 8 | Your First Lock Script (Rust) | Hash-lock script in Rust, ckb-script-templates | `08-hash-lock-script` |
| 9 | Debugging CKB Scripts | CKB-Debugger, error codes, testing patterns | `09-script-debugging` |
| 10 | Your First Type Script (Rust) | State transition validation, counter pattern | `10-type-script-counter` |
| 11 | Molecule Serialization | Binary serialization, schemas, codegen | `11-molecule-serialization` |
| 12 | CKB-VM Deep Dive | RISC-V VM, syscalls, cycle costs, benchmarking | `12-ckb-vm-deep-dive` |

### Phase 3: Token Standards & Composability (Lessons 13-17)

| # | Title | Key Concepts | Project Folder |
|---|-------|-------------|----------------|
| 13 | Fungible Tokens with xUDT | xUDT standard, issuing, transferring tokens | `13-xudt-tokens` |
| 14 | Digital Objects with Spore | Spore protocol, on-chain content, clusters, melting | `14-spore-nfts` |
| 15 | Omnilock: Universal Lock | Multisig, anyone-can-pay, time locks, cross-chain auth | `15-omnilock-wallet` |
| 16 | CKB Composability Patterns | First-class assets, script composition, cell deps | `16-composability-patterns` |
| 17 | Advanced Cell Management | Cell strategies, capacity optimization, merging/splitting | `17-cell-management` |

### Phase 4: Infrastructure (Lessons 18-20)

| # | Title | Key Concepts | Project Folder |
|---|-------|-------------|----------------|
| 18 | CKB RPC Interface | Full RPC API, chain queries, subscriptions | `18-rpc-dashboard` |
| 19 | Running a Full Node | Node setup, config, syncing, monitoring | `19-full-node-setup` |
| 20 | Light Client Development | FlyClient protocol, light client SDK, proofs | `20-light-client-app` |

### Phase 5: Production (Lessons 21-24)

| # | Title | Key Concepts | Project Folder |
|---|-------|-------------|----------------|
| 21 | RGB++ & Bitcoin Interop | RGB++ protocol, Bitcoin-CKB mapping | `21-rgbpp-explorer` |
| 22 | Building a Token DEX | Orderbook, atomic swaps, composable tx | `22-token-dex` |
| 23 | Full-Stack dApp: NFT Marketplace | Spore + Omnilock + Next.js, wallet connect | `23-nft-marketplace` |
| 24 | Mainnet Deployment & Security | Testnet deploy, security auditing, production patterns | `24-mainnet-deployment` |

## Website Architecture

```
learning-ckb-fundamentals/
├── website/                      # Next.js 15 app
│   ├── app/
│   │   ├── layout.tsx           # Root layout with sidebar
│   │   ├── page.tsx             # Landing/home page
│   │   ├── (auth)/
│   │   │   └── connect/         # Wallet connection page
│   │   ├── lessons/
│   │   │   ├── page.tsx         # All lessons overview
│   │   │   └── [id]/
│   │   │       ├── page.tsx     # Lesson content (MDX)
│   │   │       └── quiz/
│   │   │           └── page.tsx # Lesson quiz
│   │   ├── dashboard/
│   │   │   └── page.tsx         # Progress dashboard
│   │   └── api/
│   │       ├── auth/            # Wallet auth endpoints
│   │       ├── progress/        # Progress CRUD
│   │       └── quiz/            # Quiz submission
│   ├── content/                 # MDX lesson content
│   │   ├── 01-cell-model-explorer.mdx
│   │   ├── 02-transaction-anatomy.mdx
│   │   └── ...
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── wallet-connect.tsx   # CCC wallet connector
│   │   ├── lesson-sidebar.tsx   # Navigation sidebar
│   │   ├── progress-bar.tsx     # Progress indicators
│   │   ├── quiz-card.tsx        # Quiz question component
│   │   └── code-block.tsx       # Syntax highlighted code
│   └── lib/
│       ├── db/                  # Drizzle schema + queries
│       ├── auth/                # Wallet auth utils
│       └── content/             # MDX processing
├── lessons/                     # 24 standalone project folders
│   ├── 01-cell-model-explorer/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── README.md
│   ├── 02-transaction-anatomy/
│   └── ...
└── README.md
```

## Database Schema (Vercel Postgres via Drizzle)

```sql
CREATE TABLE users (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP DEFAULT NOW()
);

CREATE TABLE lesson_progress (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT REFERENCES users(wallet_address),
  lesson_id INTEGER NOT NULL,
  status TEXT DEFAULT 'not_started', -- not_started, in_progress, completed
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(wallet_address, lesson_id)
);

CREATE TABLE quiz_attempts (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT REFERENCES users(wallet_address),
  lesson_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  answers_json JSONB,
  attempted_at TIMESTAMP DEFAULT NOW()
);
```

## Auth Flow (CCC Wallet)

1. User clicks "Connect Wallet" on the platform
2. CCC SDK opens wallet connection modal (supports MetaMask, JoyID, CKB wallets)
3. User approves connection
4. Platform receives wallet address
5. Backend creates/updates user record with wallet_address as PK
6. JWT session cookie created with wallet_address claim
7. All progress/quiz data keyed to wallet_address

## Lesson Page Structure

Each lesson MDX file follows this template:
1. **Title & Overview** - What you'll learn
2. **Prerequisites** - Which prior lessons are needed
3. **Concepts** - Theory explanation with diagrams
4. **Step-by-Step Tutorial** - Hands-on coding guide
5. **Running the Code** - How to execute the exercise
6. **Real-World Examples** - Projects built with these concepts
7. **Quiz Link** - Navigate to the quiz
8. **What's Next** - Preview of the next lesson

## Real-World Examples per Phase

- Phase 1: .bit (domain names), CKB Explorer
- Phase 2: Custom authentication scripts, on-chain games
- Phase 3: Stable++ (stablecoins), Spore ecosystem, JoyID
- Phase 4: Neuron wallet, CKB node operators
- Phase 5: RGB++ assets, Fiber Network, UTXOSwap
