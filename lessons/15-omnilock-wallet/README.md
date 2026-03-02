# Lesson 15: Omnilock — The Universal Lock Script

## Overview

Omnilock is a production-deployed lock script on CKB that acts as a universal authentication gateway. Instead of requiring each wallet ecosystem to deploy its own lock script, Omnilock supports multiple signature formats through a single 1-byte auth flag. This lesson explores every Omnilock mode, its binary structure, the Anyone-Can-Pay extension, time locks, and real-world applications including JoyID and cross-chain wallet support.

## What You Will Learn

- The auth bytes structure: 1 flag byte + 20 auth content bytes
- All Omnilock authentication modes (0x00 through 0xFE)
- How Mode 0x00 mirrors the standard CKB lock script
- How Mode 0x01 lets Ethereum (MetaMask) users control CKB cells
- How Mode 0x06 implements M-of-N threshold multisig
- The Anyone-Can-Pay (ACP) extension and its use cases
- Time-lock configuration via the omnilockFlags bitmask
- Why JoyID uses Omnilock for passkey/WebAuthn authentication

## Prerequisites

- Completion of Lessons 1-14
- Node.js 18+
- Basic understanding of public-key cryptography
- Familiarity with Ethereum addresses (helpful for mode 0x01)

## Project Structure

```
15-omnilock-wallet/
├── src/
│   └── index.ts      # TypeScript CLI demonstrating all Omnilock modes
├── package.json
├── tsconfig.json
└── README.md
```

## Quick Start

```bash
npm install
npm start
```

## Omnilock Auth Byte Layout

Every Omnilock lock script's `args` field follows this binary layout:

```
Byte offset  | Length | Meaning
─────────────┼────────┼──────────────────────────────────────────────
0            | 1      | Auth flag (selects authentication mode)
1..20        | 20     | Auth content (pubkey hash, address, etc.)
21           | 1      | omnilockFlags (optional: ACP + time-lock bits)
22           | 1      | Min CKB exponent (when ACP is enabled)
23           | 1      | Min UDT exponent (when ACP is enabled)
24..31       | 8      | Since value (when time-lock is enabled)
```

The first 21 bytes (flag + content) are called the **auth bytes**.

## Authentication Modes

| Flag | Mode | Auth Content | Used By |
|------|------|-------------|---------|
| `0x00` | secp256k1-blake160 | blake160(secp256k1 pubkey) | CKB-native wallets |
| `0x01` | Ethereum | keccak160(eth pubkey) = ETH address | MetaMask, Portal Wallet |
| `0x02` | EOS | EOS account hash | EOS wallets |
| `0x03` | Tron | Tron address bytes | Tron wallets |
| `0x04` | Bitcoin | Bitcoin P2PKH hash | Bitcoin wallets |
| `0x05` | Dogecoin | Dogecoin address hash | Dogecoin wallets |
| `0x06` | CKB Multi-sig | blake160(multisig script) | Treasuries, DAOs |
| `0x07` | Lock script | blake160(lock_script) | Script-based auth |
| `0xFE` | Owner lock | blake160(owner_lock) | Advanced composability |

## Mode 0x00: secp256k1-blake160

Identical to the native CKB lock script but wrapped in Omnilock. Enables adding ACP and time-lock extensions to standard CKB keys.

```
auth flag    = 0x00
auth content = blake160(compressed secp256k1 pubkey)
               = first 20 bytes of blake2b-256(pubkey)
```

## Mode 0x01: Ethereum Auth

Allows Ethereum wallet holders to control CKB cells directly. The signature uses Ethereum's `personal_sign` format.

```
auth flag    = 0x01
auth content = keccak160(uncompressed eth pubkey)
             = last 20 bytes of keccak256(pubkey_without_0x04_prefix)
             = the Ethereum address itself
```

Transaction signing flow:
1. Format CKB tx hash as Ethereum personal_sign message
2. User signs with MetaMask / any Ethereum wallet
3. Omnilock recovers the ETH address from the signature
4. Recovered address is compared against `args[1..20]`

## Mode 0x06: M-of-N Multisig

Threshold signatures requiring M signatures out of N possible signers.

Multisig script bytes format:
```
Byte  0   : 0x00 (reserved)
Byte  1   : require_first_n
Byte  2   : threshold (M)
Byte  3   : pubkeys_count (N)
Bytes 4+  : N × 20-byte pubkey hashes
```

The auth content is `blake160(multisig_script_bytes)`.

## Anyone-Can-Pay (ACP)

Enable by setting bit 0 of `omnilockFlags` (args[21] = `0x01`).

ACP cells allow anyone to send CKB or tokens to the cell **without the owner's signature**. The constraint is:
- The output cell must have the same lock script as the input
- The output must contain at least as much value as the input
- Optionally, a minimum increment is enforced via exponent bytes

```
args = flag(1) + content(20) + 0x01(1) + minCkbExp(1) + minUdtExp(1)
```

Minimum amount = `10^exponent` shannon (for CKB) or smallest token unit (for UDT).

## Time Lock

Enable by setting bit 1 of `omnilockFlags` (args[21] = `0x02`).

Cells cannot be spent before a specified block number, epoch, or Unix timestamp. Uses the same encoding as CKB's `since` field (8-byte value with type bits in the high bits).

Combining flags:
- `0x01` = ACP only
- `0x02` = time-lock only
- `0x03` = ACP + time-lock (donation address with expiry)

## Real-World Applications

### JoyID Wallet

JoyID uses Omnilock with a WebAuthn/passkey mode. Users authenticate with Face ID or Touch ID — no seed phrase required. CKB-VM's ability to run arbitrary RISC-V code (including P-256 elliptic curve operations) makes this possible.

### Portal Wallet (Historical)

Portal Wallet used Omnilock mode 0x01 to let Ethereum users interact with CKB. Users' MetaMask addresses became their CKB receiving addresses with no additional setup.

### Cross-Chain dApps

Any dApp that wants to support users from Ethereum, Tron, Bitcoin, or other chains can use the appropriate Omnilock mode instead of forcing users to create new CKB keypairs.

## Testnet Deployment

```
Omnilock code_hash: 0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb
hash_type:          type
Cell dep tx_hash:   0x3d4af230dc95b2d958edc95676e5e2de02dd48cdaa07a5be11ee4bfe9d2a2660
Cell dep index:     0
Cell dep type:      depGroup
```

## Key Concepts

- **Auth bytes**: The 21-byte (flag + content) that identify the authentication mode and identity
- **omnilockFlags**: A bitmask byte enabling optional Omnilock features
- **ACP (Anyone-Can-Pay)**: Cells that can receive funds without owner involvement
- **Time lock**: Cells that become spendable only after a certain block/time
- **hash_type 'type'**: Omnilock is referenced via its type script hash, enabling upgrades

## Further Reading

- [Omnilock RFC](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0042-omnilock/0042-omnilock.md)
- [JoyID Documentation](https://docs.joy.id/)
- [CCC Library Omnilock Helpers](https://github.com/ckb-devrel/ccc)
