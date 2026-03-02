# Lesson 22: Building a Token DEX on CKB

## Overview

This lesson teaches you how to build a decentralized exchange (DEX) on CKB using the **order cell pattern** - a UTXO-native approach to atomic swaps that requires no central contract or trusted intermediary.

## What You Will Learn

- How DEXes work differently on UTXO chains vs account-based chains (Ethereum)
- The **order cell pattern**: encoding trade parameters in a cell's lock script args
- How the DEX lock script enforces atomic swaps at the consensus layer
- Creating, filling, partially filling, and canceling orders
- Front-running resistance as a structural property of the UTXO model
- The difference between AMM-style DEXes and orderbook DEXes

## Key Concepts

### The Order Cell

An order cell is a regular CKB cell with a special lock script. The lock script has two "unlock paths":

1. **Fill path**: Anyone can unlock the cell by satisfying the exchange conditions (sending the required tokens to the maker)
2. **Cancel path**: The maker can reclaim their CKB by signing with their private key

The trade parameters are stored in the lock script's `args` field:
- `[0..20]` - Maker's blake160 hash (who receives the incoming tokens)
- `[20..52]` - Token type hash (which xUDT token is expected)
- `[52..68]` - Minimum token amount as uint128 little-endian

### Atomic Swaps

A fill transaction atomically:
1. Consumes the order cell (CKB leaves the maker's order)
2. Receives the taker's token cell as input
3. Creates a token output for the maker
4. Creates a CKB output for the taker

Because CKB transactions are atomic (all inputs consumed and all outputs created simultaneously), there is no intermediate state where one party has given their asset without receiving the other.

### Partial Fills

When a taker only provides a fraction of the required tokens:
- They receive a proportional fraction of the CKB
- A new "remainder order cell" is created with the same lock args but reduced capacity
- The remainder can be filled by any other taker

## Project Structure

```
22-token-dex/
├── src/
│   ├── index.ts          # Main demo - all DEX concepts explained step by step
│   └── dex-helpers.ts    # Data structures and helper functions
├── package.json
├── tsconfig.json
└── README.md
```

## Running the Demo

```bash
npm install
npm start
```

The demo runs through:
1. Architecture explanation (UTXO DEX vs Ethereum DEX)
2. Order cell structure deep dive
3. Creating orders (Alice and Bob)
4. Full fill (Charlie fills Alice's entire order)
5. Partial fill (Dave fills 50% of Bob's order)
6. Order cancellation (Bob reclaims remaining CKB)
7. Atomic swap guarantee explanation
8. AMM vs Orderbook comparison
9. Final order book summary

## Real-World Context

**UTXOSwap** is a production DEX on CKB that uses exactly this pattern, combining:
- Order cells for the limit orderbook
- An AMM pool for instant liquidity
- A matching engine that routes between them
- CCC for wallet integration

Learn more: https://utxoswap.xyz

## DEX Lock Script Design

In production, the DEX lock script (written in Rust/C, compiled to RISC-V for CKB-VM) would:

```rust
// Pseudocode - actual implementation is in Rust targeting CKB-VM
pub fn entry() -> Result<(), Error> {
    // Read the args: maker_blake160 + token_type_hash + min_token_amount
    let args = load_script()?.args();
    let maker_hash = &args[0..20];
    let token_type_hash = &args[20..52];
    let min_token_amount = u128::from_le_bytes(args[52..68]);

    // Check if this is a cancel (maker's signature present)
    if has_valid_signature(maker_hash) {
        return Ok(()); // Cancel path
    }

    // Fill path: verify the maker receives enough tokens
    let maker_tokens = sum_output_tokens_for_address(maker_hash, token_type_hash)?;
    if maker_tokens < min_token_amount {
        return Err(Error::InsufficientTokens);
    }

    // Verify remainder order cell (if this is a partial fill)
    verify_remainder_cell(args, min_token_amount, maker_tokens)?;

    Ok(())
}
```

## Security Considerations

1. **No admin keys**: The DEX lock has no owner who can upgrade or pause it
2. **Deterministic rules**: The exchange rate is fixed at order creation time
3. **Atomic execution**: No partial execution states possible
4. **Cell indexing**: All orders are discoverable by scanning cells with the DEX code_hash

## Related Lessons

- Lesson 10: Type Script Counter (understanding script groups)
- Lesson 15: Omnilock Wallet (lock script design patterns)
- Lesson 21: RGB++ Explorer (cross-chain asset understanding)
- Lesson 23: NFT Marketplace (applying DEX patterns to NFTs)
