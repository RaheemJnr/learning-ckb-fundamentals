# Lesson 13: Fungible Tokens with xUDT

This lesson covers **xUDT** (eXtensible User Defined Token), the primary standard for creating and managing fungible tokens on CKB.

## What is xUDT?

xUDT is CKB's token standard defined in [RFC-0052](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md). It is the evolution of sUDT (Simple UDT, RFC-0025) and adds support for:

- **Extension scripts**: Custom validation logic that runs alongside the base conservation check
- **Owner mode**: Special privileges for the token issuer
- **Backwards compatibility**: With flags=0x00, xUDT behaves identically to sUDT

### xUDT Cell Structure

Every xUDT token cell has this structure:

| Field | Content | Size |
|-------|---------|------|
| `capacity` | CKByte storage deposit (in Shannon) | 8 bytes |
| `data` | uint128 LE token amount (+ optional extension data) | >=16 bytes |
| `lock` | Owner's lock script (controls who can spend) | variable |
| `type` | xUDT type script (identifies the token, enforces rules) | variable |

### Token Identity

A token is uniquely identified by its **complete type script**:

```
{
  codeHash: <xUDT script binary hash>,
  hashType: "data1",
  args: [owner_lock_hash (32 bytes)] + [flags (1 byte)] + [extension_args]
}
```

The owner's lock script hash in `args` makes each token globally unique — no two issuers can create the same token.

### Amount Encoding

Token amounts are stored as **uint128 little-endian** in the first 16 bytes of cell data:

```
Amount 1000 -> encoded as: e803000000000000 0000000000000000 (hex LE)
```

### Conservation Rule

The xUDT type script enforces:

```
sum(input token amounts) == sum(output token amounts)
```

Violations cause the transaction to be rejected by CKB nodes. The issuer can bypass this via "owner mode" (minting).

## Project Structure

```
13-xudt-tokens/
├── package.json         # Project dependencies (CCC SDK, TypeScript)
├── tsconfig.json        # TypeScript configuration
├── README.md            # This file
└── src/
    ├── index.ts         # Main CLI demo (~400 lines, heavily commented)
    └── xudt-helpers.ts  # Helper functions for xUDT operations
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
cd lessons/13-xudt-tokens
npm install
```

### Running the Demo

```bash
npm start
```

This runs `src/index.ts` which demonstrates all xUDT concepts with interactive examples.

### Using with Testnet

To run actual transactions on CKB Pudge testnet:

1. Get testnet CKB from the faucet: https://faucet.nervos.org
2. Set your private key:
   ```bash
   export TESTNET_PRIVATE_KEY=0x<your_private_key>
   ```
3. Follow the code patterns in `src/index.ts` Section 9.

## Key Concepts Covered

### 1. xUDT vs sUDT

| Feature | sUDT (RFC-0025) | xUDT (RFC-0052) |
|---------|-----------------|-----------------|
| Amount format | uint128 LE | uint128 LE (same) |
| Extension scripts | Not supported | Supported via flags byte |
| Owner mode | No | Yes |
| Backwards compat | N/A | flags=0x00 behaves like sUDT |

### 2. Type Script Args Layout

```
bytes  0-31: owner lock script hash (blake2b of serialized lock)
byte   32:   flags byte
               0x00 = no extension (pure conservation)
               0x01 = extension by type hash
               0x02 = extension by data hash
bytes  33+:  optional extension script args
```

### 3. Issuing Tokens

To mint a new token:
1. Use your lock script hash as the token identifier
2. Build the xUDT type script with your lock hash in args
3. Create output cells with the type script and encoded amount
4. The xUDT script enters "owner mode" when no input token cells exist

### 4. Transferring Tokens

To transfer tokens:
1. Collect input token cells (same type script)
2. Create output cells with recipient's lock but same type script
3. Ensure: sum(input amounts) == sum(output amounts)
4. Provide sender's signature (to satisfy lock script)

### 5. Querying Balances

Token balance = sum of amounts in all live cells where:
- `cell.type` matches the token's type script
- `cell.lock` matches the owner's lock script

### 6. xUDT vs ERC-20

| Aspect | xUDT | ERC-20 |
|--------|------|--------|
| Balance location | User's own cells (UTXO) | Contract mapping (shared storage) |
| Transfer model | Consume + create cells | Contract state update |
| Freeze risk | None (user holds lock key) | Contract can blacklist |
| Contract bug risk | Cells are independent | All balances at risk |
| Parallelism | High (parallel cell ops) | Low (sequential state) |

## Helper Functions (src/xudt-helpers.ts)

| Function | Description |
|----------|-------------|
| `encodeAmount(amount)` | Encode bigint as 16-byte uint128 LE hex |
| `decodeAmount(hex)` | Decode 16-byte uint128 LE hex to bigint |
| `buildXudtTypeArgs(lockHash, flags)` | Build xUDT type script args |
| `buildXudtTypeScript(lockHash, flags)` | Build complete xUDT type Script object |
| `calculateMinCapacity(...)` | Calculate minimum CKByte capacity for a token cell |
| `sumTokenAmounts(cells)` | Sum amounts across multiple xUDT cells |
| `filterTokenCells(cells, typeScript)` | Filter cells by token type script |
| `verifyTransferBalance(inputs, outputs)` | Verify conservation rule off-chain |
| `formatTokenAmount(amount, decimals)` | Format amount for display |
| `printXudtCell(cell)` | Pretty-print an xUDT cell |
| `printUdtComparison()` | Print sUDT vs xUDT comparison table |

## Real-World xUDT Tokens

| Token | Description |
|-------|-------------|
| RUSD (Stable++) | CKB-native stablecoin backed by CKB collateral |
| RGB++ bridged assets | Bitcoin-native assets anchored to CKB via RGB++ protocol |
| Various DeFi tokens | Governance and utility tokens in CKB ecosystem |

## Further Reading

- [RFC-0052: Extensible UDT](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md)
- [RFC-0025: Simple UDT (sUDT)](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0025-simple-udt/0025-simple-udt.md)
- [CCC SDK Documentation](https://github.com/ckb-ecofund/ccc)
- [CKB Explorer](https://explorer.nervos.org) — view real xUDT tokens
- [Stable++ Protocol](https://stable.pp.finance) — real-world xUDT application
