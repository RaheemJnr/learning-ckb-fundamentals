import type { LessonMeta } from './types';

/**
 * Master registry of all 24 lessons.
 * This is the single source of truth for lesson ordering, phases,
 * prerequisites, and metadata.
 *
 * Phase breakdown:
 *   1 - Foundations (Lessons 1-6)
 *   2 - Scripts & Smart Contracts (Lessons 7-12)
 *   3 - Token Standards & Composability (Lessons 13-17)
 *   4 - Infrastructure (Lessons 18-20)
 *   5 - Production (Lessons 21-24)
 */
export const lessonsData: LessonMeta[] = [
  // ── Phase 1: Foundations (Lessons 1-6) ───────────────────────────
  {
    id: 1,
    slug: '01-cell-model-explorer',
    title: 'What is CKB? The Cell Model',
    description:
      'Understand the fundamental building block of Nervos CKB: the Cell. Learn how cells store data, capacity, and scripts.',
    phase: 1,
    phaseName: 'Foundations',
    prerequisites: [],
    realWorldExamples: [
      {
        name: 'Bitcoin UTXO Model',
        description:
          'CKB cells generalize Bitcoin UTXOs by adding arbitrary data and script fields.',
        url: 'https://docs.nervos.org/docs/tech-explanation/cell-model',
      },
      {
        name: 'Ethereum Account Model',
        description:
          'Unlike Ethereum accounts, CKB cells are stateless objects owned by lock scripts.',
        url: 'https://docs.nervos.org/',
      },
    ],
    projectFolder: '01-cell-model-explorer',
    estimatedTime: '45 minutes',
  },
  {
    id: 2,
    slug: '02-transaction-anatomy',
    title: 'Transaction Anatomy',
    description:
      'Dive into CKB transactions: inputs, outputs, deps, witnesses. Understand how state transitions work.',
    phase: 1,
    phaseName: 'Foundations',
    prerequisites: [1],
    realWorldExamples: [
      {
        name: 'CKB Explorer Transactions',
        description:
          'View real transactions on CKB Explorer to see inputs and outputs in action.',
        url: 'https://explorer.nervos.org/',
      },
      {
        name: 'Bitcoin Transaction Structure',
        description:
          'CKB transactions follow a similar input/output model but with richer structure for scripts.',
      },
    ],
    projectFolder: '02-transaction-anatomy',
    estimatedTime: '50 minutes',
  },
  {
    id: 3,
    slug: '03-capacity-calculator',
    title: 'Capacity & CKBytes',
    description:
      'Learn how CKBytes fund on-chain storage. Build a capacity calculator to understand the economics of cell storage.',
    phase: 1,
    phaseName: 'Foundations',
    prerequisites: [1, 2],
    realWorldExamples: [
      {
        name: 'Nervos DAO',
        description:
          'The Nervos DAO compensates CKByte holders for state inflation, demonstrating capacity economics.',
        url: 'https://docs.nervos.org/docs/basics/guides/crypto-wallets/neuron',
      },
      {
        name: 'State Rent',
        description:
          'CKB implements state rent through the capacity model, ensuring on-chain storage is economically sustainable.',
      },
    ],
    projectFolder: '03-capacity-calculator',
    estimatedTime: '40 minutes',
  },
  {
    id: 4,
    slug: '04-dev-environment-setup',
    title: 'Dev Environment Setup',
    description:
      'Set up your local CKB development environment with devnet, CCC SDK, and essential tooling.',
    phase: 1,
    phaseName: 'Foundations',
    prerequisites: [1],
    realWorldExamples: [
      {
        name: 'CKB Devnet',
        description:
          'Run a local CKB node for development and testing without spending real CKBytes.',
      },
      {
        name: 'CCC SDK',
        description:
          'The Common Chains Connector SDK provides a unified interface for CKB development.',
        url: 'https://github.com/nickliu-ckb/ccc',
      },
    ],
    projectFolder: '04-dev-environment-setup',
    estimatedTime: '30 minutes',
  },
  {
    id: 5,
    slug: '05-first-transfer',
    title: 'Your First CKB Transfer',
    description:
      'Send your first CKB transaction programmatically. Build, sign, and submit a transfer using CCC SDK.',
    phase: 1,
    phaseName: 'Foundations',
    prerequisites: [2, 4],
    realWorldExamples: [
      {
        name: 'Neuron Wallet',
        description:
          'Neuron is the official CKB wallet that handles transfers, DAO deposits, and more.',
        url: 'https://github.com/nickliu-ckb/neuron',
      },
      {
        name: 'JoyID Wallet',
        description:
          'JoyID uses passkeys to send CKB transfers without seed phrases.',
        url: 'https://joy.id/',
      },
    ],
    projectFolder: '05-first-transfer',
    estimatedTime: '45 minutes',
  },
  {
    id: 6,
    slug: '06-cell-explorer',
    title: 'Building a Cell Explorer',
    description:
      'Build a mini explorer that queries live cells, displays their data, and visualizes the cell structure.',
    phase: 1,
    phaseName: 'Foundations',
    prerequisites: [4, 5],
    realWorldExamples: [
      {
        name: 'CKB Explorer',
        description:
          'The official CKB blockchain explorer lets you browse cells, transactions, and blocks.',
        url: 'https://explorer.nervos.org/',
      },
      {
        name: 'Nervos Pudge Testnet Explorer',
        description:
          'Testnet explorer for viewing cells and transactions on the CKB testnet.',
        url: 'https://pudge.explorer.nervos.org/',
      },
    ],
    projectFolder: '06-cell-explorer',
    estimatedTime: '60 minutes',
  },

  // ── Phase 2: Scripts & Smart Contracts (Lessons 7-12) ────────────
  {
    id: 7,
    slug: '07-script-basics',
    title: 'Script Basics: Lock & Type',
    description:
      'Understand CKB scripts: lock scripts for ownership, type scripts for validation. Learn the script execution model.',
    phase: 2,
    phaseName: 'Scripts & Smart Contracts',
    prerequisites: [1, 2],
    realWorldExamples: [
      {
        name: 'SECP256K1-Blake160 Lock',
        description:
          'The default CKB lock script uses secp256k1 signatures, similar to Bitcoin.',
      },
      {
        name: 'Anyone-Can-Pay Lock',
        description:
          'A lock script that allows anyone to add capacity to a cell, enabling payment channels.',
      },
    ],
    projectFolder: '07-script-basics',
    estimatedTime: '50 minutes',
  },
  {
    id: 8,
    slug: '08-hash-lock-script',
    title: 'Writing a Hash Lock Script',
    description:
      'Write your first CKB script in C: a hash time lock that requires a preimage to unlock.',
    phase: 2,
    phaseName: 'Scripts & Smart Contracts',
    prerequisites: [7],
    realWorldExamples: [
      {
        name: 'Hash Time-Locked Contracts (HTLCs)',
        description:
          'HTLCs are used in Lightning Network and cross-chain atomic swaps.',
      },
      {
        name: 'Commit-Reveal Schemes',
        description:
          'Hash locks are the foundation of commit-reveal patterns used in voting and auctions.',
      },
    ],
    projectFolder: '08-hash-lock-script',
    estimatedTime: '60 minutes',
  },
  {
    id: 9,
    slug: '09-script-debugging',
    title: 'Script Debugging & Testing',
    description:
      'Learn to debug CKB scripts using ckb-debugger, write tests, and handle common script errors.',
    phase: 2,
    phaseName: 'Scripts & Smart Contracts',
    prerequisites: [8],
    realWorldExamples: [
      {
        name: 'ckb-debugger',
        description:
          'The official CKB script debugger lets you step through script execution off-chain.',
        url: 'https://github.com/nickliu-ckb/ckb-standalone-debugger',
      },
      {
        name: 'Capsule Framework',
        description:
          'Capsule provides a testing framework for CKB scripts with simulated transactions.',
      },
    ],
    projectFolder: '09-script-debugging',
    estimatedTime: '45 minutes',
  },
  {
    id: 10,
    slug: '10-type-script-counter',
    title: 'Type Script: On-Chain Counter',
    description:
      'Build a type script that enforces state transitions, implementing an on-chain counter.',
    phase: 2,
    phaseName: 'Scripts & Smart Contracts',
    prerequisites: [7, 8],
    realWorldExamples: [
      {
        name: 'Solidity Counter Contract',
        description:
          'Compare CKB type scripts to Solidity state variables. CKB state lives in cells, not contracts.',
      },
      {
        name: 'State Channels',
        description:
          'Type scripts that validate state transitions are the basis for state channels on CKB.',
      },
    ],
    projectFolder: '10-type-script-counter',
    estimatedTime: '55 minutes',
  },
  {
    id: 11,
    slug: '11-molecule-serialization',
    title: 'Molecule Serialization',
    description:
      'Master Molecule, CKB\'s binary serialization format. Encode and decode complex data structures for on-chain use.',
    phase: 2,
    phaseName: 'Scripts & Smart Contracts',
    prerequisites: [7],
    realWorldExamples: [
      {
        name: 'Protocol Buffers',
        description:
          'Molecule is similar to protobuf but designed for deterministic, zero-copy deserialization on-chain.',
      },
      {
        name: 'CKB System Scripts',
        description:
          'All CKB system scripts use Molecule for data serialization in cells and witnesses.',
      },
    ],
    projectFolder: '11-molecule-serialization',
    estimatedTime: '50 minutes',
  },
  {
    id: 12,
    slug: '12-ckb-vm-deep-dive',
    title: 'CKB-VM Deep Dive',
    description:
      'Explore the CKB-VM: a RISC-V based virtual machine. Understand cycles, syscalls, and script execution.',
    phase: 2,
    phaseName: 'Scripts & Smart Contracts',
    prerequisites: [7, 8],
    realWorldExamples: [
      {
        name: 'RISC-V Architecture',
        description:
          'CKB-VM implements the RISC-V ISA, enabling scripts written in any language that compiles to RISC-V.',
        url: 'https://riscv.org/',
      },
      {
        name: 'Ethereum EVM',
        description:
          'Compare CKB-VM (real CPU ISA) to EVM (custom stack machine). CKB-VM supports more languages natively.',
      },
    ],
    projectFolder: '12-ckb-vm-deep-dive',
    estimatedTime: '55 minutes',
  },

  // ── Phase 3: Token Standards & Composability (Lessons 13-17) ─────
  {
    id: 13,
    slug: '13-xudt-tokens',
    title: 'xUDT: Fungible Tokens',
    description:
      'Create and manage fungible tokens using the xUDT (Extensible User Defined Token) standard on CKB.',
    phase: 3,
    phaseName: 'Token Standards & Composability',
    prerequisites: [7, 10],
    realWorldExamples: [
      {
        name: 'ERC-20 Tokens',
        description:
          'xUDT is CKB\'s equivalent of ERC-20, but tokens live in cells rather than contract storage.',
      },
      {
        name: 'Stable++ (RUSD)',
        description:
          'Stable++ uses xUDT to issue RUSD stablecoins on CKB.',
        url: 'https://stablepp.xyz/',
      },
    ],
    projectFolder: '13-xudt-tokens',
    estimatedTime: '55 minutes',
  },
  {
    id: 14,
    slug: '14-spore-nfts',
    title: 'Spore: NFTs on CKB',
    description:
      'Create fully on-chain NFTs using the Spore protocol. Store content directly in cells.',
    phase: 3,
    phaseName: 'Token Standards & Composability',
    prerequisites: [13],
    realWorldExamples: [
      {
        name: 'Spore Protocol',
        description:
          'Spore stores NFT content fully on-chain in cells, unlike IPFS-based NFTs.',
        url: 'https://spore.pro/',
      },
      {
        name: 'Ethereum ERC-721',
        description:
          'Compare Spore to ERC-721: Spore NFTs are truly on-chain with content in cell data.',
      },
    ],
    projectFolder: '14-spore-nfts',
    estimatedTime: '60 minutes',
  },
  {
    id: 15,
    slug: '15-omnilock-wallet',
    title: 'Omnilock: Universal Lock Script',
    description:
      'Explore Omnilock, the universal lock script supporting multiple auth methods: secp256k1, Ethereum, multisig, and more.',
    phase: 3,
    phaseName: 'Token Standards & Composability',
    prerequisites: [7],
    realWorldExamples: [
      {
        name: 'JoyID (WebAuthn)',
        description:
          'JoyID uses Omnilock with WebAuthn to enable passkey-based wallet authentication.',
        url: 'https://joy.id/',
      },
      {
        name: '.bit Accounts',
        description:
          '.bit uses Omnilock to allow cross-chain account management.',
        url: 'https://d.id/',
      },
    ],
    projectFolder: '15-omnilock-wallet',
    estimatedTime: '50 minutes',
  },
  {
    id: 16,
    slug: '16-composability-patterns',
    title: 'Composability Patterns',
    description:
      'Learn advanced cell composition: combining multiple scripts, cross-cell references, and pattern design.',
    phase: 3,
    phaseName: 'Token Standards & Composability',
    prerequisites: [13, 14],
    realWorldExamples: [
      {
        name: 'DeFi Composability',
        description:
          'CKB cells can be composed in a single transaction, enabling atomic DeFi operations.',
      },
      {
        name: 'Cobuild Protocol',
        description:
          'Cobuild defines composability patterns for building complex multi-script transactions.',
      },
    ],
    projectFolder: '16-composability-patterns',
    estimatedTime: '55 minutes',
  },
  {
    id: 17,
    slug: '17-cell-management',
    title: 'Cell Management Strategies',
    description:
      'Learn strategies for managing cells at scale: cell collection, merging, splitting, and indexing.',
    phase: 3,
    phaseName: 'Token Standards & Composability',
    prerequisites: [6, 13],
    realWorldExamples: [
      {
        name: 'UTXO Management in Bitcoin',
        description:
          'Cell management in CKB is analogous to UTXO management in Bitcoin wallets.',
      },
      {
        name: 'CKB Indexer',
        description:
          'The CKB indexer enables efficient cell querying by lock script, type script, and data hash.',
      },
    ],
    projectFolder: '17-cell-management',
    estimatedTime: '45 minutes',
  },

  // ── Phase 4: Infrastructure (Lessons 18-20) ─────────────────────
  {
    id: 18,
    slug: '18-rpc-dashboard',
    title: 'CKB RPC Dashboard',
    description:
      'Build a dashboard that interacts with CKB RPC endpoints. Monitor chain state, blocks, and mempool.',
    phase: 4,
    phaseName: 'Infrastructure',
    prerequisites: [6],
    realWorldExamples: [
      {
        name: 'CKB JSON-RPC',
        description:
          'CKB exposes a JSON-RPC interface for querying chain state, submitting transactions, and more.',
        url: 'https://docs.nervos.org/docs/reference/rpc',
      },
      {
        name: 'Infura / Alchemy',
        description:
          'Similar to Ethereum RPC providers, CKB RPC provides chain data access for dApps.',
      },
    ],
    projectFolder: '18-rpc-dashboard',
    estimatedTime: '50 minutes',
  },
  {
    id: 19,
    slug: '19-full-node-setup',
    title: 'Running a Full Node',
    description:
      'Set up and configure a CKB full node. Understand consensus, syncing, and node operations.',
    phase: 4,
    phaseName: 'Infrastructure',
    prerequisites: [4],
    realWorldExamples: [
      {
        name: 'CKB Node',
        description:
          'Running your own CKB node gives you trustless access to the blockchain.',
        url: 'https://github.com/nickliu-ckb/ckb',
      },
      {
        name: 'Bitcoin Core',
        description:
          'Like Bitcoin Core, running a CKB full node contributes to network decentralization.',
      },
    ],
    projectFolder: '19-full-node-setup',
    estimatedTime: '40 minutes',
  },
  {
    id: 20,
    slug: '20-light-client-app',
    title: 'Light Client Application',
    description:
      'Build an application using CKB Light Client for efficient on-device chain access without a full node.',
    phase: 4,
    phaseName: 'Infrastructure',
    prerequisites: [18],
    realWorldExamples: [
      {
        name: 'CKB Light Client',
        description:
          'The CKB light client enables mobile and browser apps to verify chain data efficiently.',
        url: 'https://github.com/nickliu-ckb/ckb-light-client',
      },
      {
        name: 'Ethereum Light Clients',
        description:
          'Similar to Ethereum light clients, CKB light clients download only headers and relevant proofs.',
      },
    ],
    projectFolder: '20-light-client-app',
    estimatedTime: '50 minutes',
  },

  // ── Phase 5: Production (Lessons 21-24) ──────────────────────────
  {
    id: 21,
    slug: '21-rgbpp-explorer',
    title: 'RGB++ Protocol Explorer',
    description:
      'Explore the RGB++ protocol: isomorphic binding between Bitcoin UTXOs and CKB cells for cross-chain assets.',
    phase: 5,
    phaseName: 'Production',
    prerequisites: [13, 15],
    realWorldExamples: [
      {
        name: 'RGB++ Protocol',
        description:
          'RGB++ enables Bitcoin assets to leverage CKB smart contracts through isomorphic binding.',
        url: 'https://www.rgbpp.io/',
      },
      {
        name: 'UTXO Stack',
        description:
          'UTXO Stack uses RGB++ to build Bitcoin L2 solutions powered by CKB.',
      },
    ],
    projectFolder: '21-rgbpp-explorer',
    estimatedTime: '60 minutes',
  },
  {
    id: 22,
    slug: '22-token-dex',
    title: 'Building a Token DEX',
    description:
      'Build a decentralized exchange for xUDT tokens using CKB cell composability and atomic swaps.',
    phase: 5,
    phaseName: 'Production',
    prerequisites: [13, 16],
    realWorldExamples: [
      {
        name: 'Uniswap on Ethereum',
        description:
          'Compare CKB DEX patterns (order book in cells) to AMM DEXes like Uniswap.',
      },
      {
        name: 'UTXOSwap',
        description:
          'UTXOSwap implements an AMM DEX on CKB using the cell model.',
        url: 'https://utxoswap.xyz/',
      },
    ],
    projectFolder: '22-token-dex',
    estimatedTime: '75 minutes',
  },
  {
    id: 23,
    slug: '23-nft-marketplace',
    title: 'NFT Marketplace',
    description:
      'Build an NFT marketplace using Spore protocol: listing, buying, and managing on-chain NFTs.',
    phase: 5,
    phaseName: 'Production',
    prerequisites: [14, 16],
    realWorldExamples: [
      {
        name: 'OpenSea',
        description:
          'Compare CKB NFT marketplaces to OpenSea. CKB NFTs (Spore) store content fully on-chain.',
      },
      {
        name: 'Omiga',
        description:
          'Omiga is an inscription marketplace on CKB leveraging the cell model for NFT trading.',
        url: 'https://omiga.io/',
      },
    ],
    projectFolder: '23-nft-marketplace',
    estimatedTime: '75 minutes',
  },
  {
    id: 24,
    slug: '24-mainnet-deployment',
    title: 'Mainnet Deployment',
    description:
      'Deploy your dApp to CKB mainnet. Learn about security auditing, deployment scripts, and production best practices.',
    phase: 5,
    phaseName: 'Production',
    prerequisites: [19, 22],
    realWorldExamples: [
      {
        name: 'CKB Mainnet (Lina)',
        description:
          'CKB mainnet (Lina) is the production Proof-of-Work network securing billions in assets.',
        url: 'https://explorer.nervos.org/',
      },
      {
        name: 'Smart Contract Auditing',
        description:
          'Production CKB scripts undergo formal verification and third-party audits before deployment.',
      },
    ],
    projectFolder: '24-mainnet-deployment',
    estimatedTime: '50 minutes',
  },
];
