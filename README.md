# Learning CKB Fundamentals

A comprehensive 24-lesson incremental learning platform for Nervos CKB blockchain development. Master the Cell Model, write custom scripts, deploy tokens and NFTs, and build real dApps -- all through hands-on, interactive lessons.

## Curriculum

The curriculum is organized into six phases, progressing from foundational concepts to mainnet deployment.

### Phase 1: Foundation (Lessons 1-3)

| # | Lesson | Description |
|---|--------|-------------|
| 01 | [Cell Model Explorer](lessons/01-cell-model-explorer/) | Interactive visualization of CKB's Cell Model -- the fundamental data unit |
| 02 | [Transaction Anatomy](lessons/02-transaction-anatomy/) | Build and inspect CKB transactions step by step |
| 03 | [Capacity Calculator](lessons/03-capacity-calculator/) | Understand CKByte capacity requirements for cells |

### Phase 2: First Steps (Lessons 4-6)

| # | Lesson | Description |
|---|--------|-------------|
| 04 | [Dev Environment Setup](lessons/04-dev-environment-setup/) | Set up your local CKB development environment |
| 05 | [First Transfer](lessons/05-first-transfer/) | Send your first CKB transfer on devnet |
| 06 | [Cell Explorer](lessons/06-cell-explorer/) | Browse and inspect live cells on the network |

### Phase 3: Script Programming (Lessons 7-12)

| # | Lesson | Description |
|---|--------|-------------|
| 07 | [Script Basics](lessons/07-script-basics/) | Introduction to CKB Script (lock scripts and type scripts) |
| 08 | [Hash Lock Script](lessons/08-hash-lock-script/) | Write your first lock script using hash verification |
| 09 | [Script Debugging](lessons/09-script-debugging/) | Debug CKB scripts with the CKB Debugger |
| 10 | [Type Script Counter](lessons/10-type-script-counter/) | Build a stateful counter using type scripts |
| 11 | [Molecule Serialization](lessons/11-molecule-serialization/) | Master Molecule, CKB's serialization format |
| 12 | [CKB-VM Deep Dive](lessons/12-ckb-vm-deep-dive/) | Explore the RISC-V based CKB Virtual Machine |

### Phase 4: Ecosystem Standards (Lessons 13-16)

| # | Lesson | Description |
|---|--------|-------------|
| 13 | [xUDT Tokens](lessons/13-xudt-tokens/) | Create and manage fungible tokens with xUDT |
| 14 | [Spore NFTs](lessons/14-spore-nfts/) | Mint and manage NFTs using the Spore protocol |
| 15 | [Omnilock Wallet](lessons/15-omnilock-wallet/) | Build a multi-auth wallet with Omnilock |
| 16 | [Composability Patterns](lessons/16-composability-patterns/) | Compose multiple scripts and protocols together |

### Phase 5: Infrastructure (Lessons 17-20)

| # | Lesson | Description |
|---|--------|-------------|
| 17 | [Cell Management](lessons/17-cell-management/) | Advanced cell collection and management strategies |
| 18 | [RPC Dashboard](lessons/18-rpc-dashboard/) | Build a dashboard using CKB RPC endpoints |
| 19 | [Full Node Setup](lessons/19-full-node-setup/) | Run and configure a CKB full node |
| 20 | [Light Client App](lessons/20-light-client-app/) | Build an app using the CKB light client |

### Phase 6: Capstone Projects (Lessons 21-24)

| # | Lesson | Description |
|---|--------|-------------|
| 21 | [RGB++ Explorer](lessons/21-rgbpp-explorer/) | Explore the RGB++ protocol for Bitcoin-CKB interop |
| 22 | [Token DEX](lessons/22-token-dex/) | Build a decentralized exchange for xUDT tokens |
| 23 | [NFT Marketplace](lessons/23-nft-marketplace/) | Create an NFT marketplace using Spore |
| 24 | [Mainnet Deployment](lessons/24-mainnet-deployment/) | Deploy your project to CKB mainnet |

## Tech Stack

- **Website**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Interactive Components**: React, Monaco Editor, custom visualizations
- **CKB Integration**: @ckb-lumos/lumos, @nervosnetwork/ckb-sdk-core
- **Smart Contracts**: Rust, CKB Script, Molecule
- **Testing**: CKB Debugger, devnet
- **Deployment**: Vercel (website), CKB Testnet/Mainnet (scripts)

## Repository Structure

```
learning-ckb-fundamentals/
├── website/          # Next.js learning platform
├── lessons/          # 24 standalone lesson projects
│   ├── 01-cell-model-explorer/
│   ├── 02-transaction-anatomy/
│   └── ...
└── docs/
    └── plans/        # Design and implementation docs
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Rust toolchain (for script development lessons)
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/AjibsBaba/learning-ckb-fundamentals.git
cd learning-ckb-fundamentals

# Install website dependencies
cd website
npm install

# Start the development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to start learning.

### Working on Individual Lessons

Each lesson in `lessons/` is a standalone project with its own dependencies and instructions. Navigate to any lesson directory and follow its README for setup.

## Website

The interactive learning platform is hosted at: *Coming soon*

## Contributing

Contributions are welcome! Please see individual lesson READMEs for specific contribution guidelines.

## License

This project is open source. See individual components for specific licenses.
