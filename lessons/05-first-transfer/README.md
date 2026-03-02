# Lesson 05: Your First CKB Transfer

Build, sign, and send a real CKB transfer transaction on the testnet using the CCC SDK.

## What You'll Learn

- How to connect to the CKB testnet programmatically
- How to create a signer (private key management) using the CCC SDK
- How to check CKB balances
- How to build a transfer transaction with inputs, outputs, and fees
- How to sign a transaction to authorize spending
- How to submit a transaction and wait for on-chain confirmation
- How to verify the transfer by checking post-transaction balances

## Prerequisites

1. **Lesson 4 Complete**: You should have your development environment set up with Node.js and TypeScript.
2. **Testnet CKB**: You need testnet CKB in a wallet to perform the transfer. See "Getting Testnet CKB" below.
3. **Basic Understanding of Cells and Transactions**: Review Lessons 1-2 if needed. You should understand that CKB stores state in cells and that transactions consume and create cells.

## Getting Testnet CKB

The CKB testnet (called "Pudge") uses test CKB that has no real-world value. You can get free testnet CKB from the faucet:

1. Visit the CKB Testnet Faucet: [https://faucet.nervos.org/](https://faucet.nervos.org/)
2. You will need a CKB testnet address. When you run the script, it will display the sender address derived from the demo private key.
3. Alternatively, run the script once -- it will print the sender address and exit with an "Insufficient balance" error. Copy that address.
4. Paste the address into the faucet and request testnet CKB.
5. Wait a few minutes for the faucet transaction to be confirmed.
6. Run the script again.

**Tip**: The demo uses a pre-configured test private key. The corresponding address is printed when the script starts. You can also use your own private key by editing the `SENDER_PRIVATE_KEY` constant in `src/index.ts`.

## How to Run

### Install Dependencies

```bash
cd lessons/05-first-transfer
npm install
```

### Run the Transfer Script

```bash
npm start
```

Or directly:

```bash
npx tsx src/index.ts
```

### Using Your Own Private Key

Edit `src/index.ts` and replace the `SENDER_PRIVATE_KEY` value with your own testnet private key:

```typescript
const SENDER_PRIVATE_KEY = "0xYOUR_PRIVATE_KEY_HERE";
```

Then fund the corresponding address via the faucet.

## Expected Output

```
======================================================================
  Lesson 05: Your First CKB Transfer
======================================================================

Step 1: Connecting to CKB Testnet...
  Connected to CKB Testnet (Pudge)

Step 2: Creating signer from private key...
  WARNING: This uses a TEST-ONLY private key.
  NEVER use hardcoded keys in production!

  Sender address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq...

Step 3: Checking sender balance...
  Sender balance: 10,000.00 CKB
  Transfer amount: 100.00 CKB
  Sufficient balance confirmed.

Step 4: Building transfer transaction...
  Recipient: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq...
  Amount: 100.00 CKB

Step 5: Completing transaction (selecting inputs, fee)...
  Transaction built successfully!
  Inputs:  1 cell(s)
  Outputs: 2 cell(s)
    Output[0]: 100.00 CKB
    Output[1]: 9,899.99 CKB
  Fee: 0.00000373 CKB (373 shannons)

Step 6: Signing the transaction...
  Transaction signed successfully!
  Witnesses: 1 (contains the signature)

Step 7: Sending transaction to the network...
  Transaction sent!
  Transaction hash: 0xabc123...
  Explorer URL: https://pudge.explorer.nervos.org/transaction/0xabc123...

Step 8: Waiting for confirmation...
  (This may take 10-60 seconds on testnet)
  Transaction CONFIRMED!
  Block hash: 0xdef456...

Step 9: Checking balance after transfer...
  Balance before: 10,000.00 CKB
  Balance after:  9,900.00 CKB
  Difference:     100.00 CKB
  (Difference includes transfer amount + transaction fee)

======================================================================
  Transfer Complete!
======================================================================
```

**Note**: Actual values will differ based on your balance and the current network state.

## Understanding the Transaction Flow

### 1. Cell Selection (Coin Selection)

When you send 100 CKB, the SDK must find cells you own that contain at least 100 CKB plus fees. This is similar to selecting bills from a wallet.

### 2. Transaction Construction

The transaction has:
- **Inputs**: References to your existing cells (which will be consumed)
- **Outputs**: New cells being created:
  - One output for the recipient (100 CKB)
  - One output for your change (remaining CKB minus fee)
- **Witnesses**: Cryptographic signatures proving you authorized the spend

### 3. Fee Calculation

The transaction fee is calculated from the serialized transaction size:
```
fee = transaction_size_bytes * fee_rate_per_kilobyte / 1000
```

The fee is implicit -- it is the difference between total input capacity and total output capacity. There is no explicit "fee" field in the transaction.

### 4. Signing

The transaction is hashed (blake2b-256) and signed with your secp256k1 private key. The signature is placed in the witnesses array. When miners verify the transaction, they execute the lock script which checks that the signature matches the public key hash in the lock args.

### 5. Confirmation

After submission, the transaction enters the mempool. A miner will include it in a block. Once the block is added to the chain, the transaction is "committed" (confirmed). The consumed input cells are destroyed, and the new output cells become live.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Signer** | An object that can sign transactions (proves ownership) |
| **Shannon** | The smallest CKB unit (1 CKB = 10^8 shannons) |
| **Live Cell** | An unspent cell that exists on-chain |
| **Dead Cell** | A cell that has been consumed by a transaction |
| **Mempool** | The pool of unconfirmed transactions on a node |
| **Witnesses** | Signatures and other proof data attached to a transaction |
| **Lock Script** | The script that controls who can spend a cell |
| **Capacity** | Both the CKB value and the size limit of a cell |

## Troubleshooting

### "Insufficient balance" Error
Fund the sender address via the testnet faucet: [https://faucet.nervos.org/](https://faucet.nervos.org/)

### "PoolRejected" Error
- The cells may have already been spent (try again with fresh cells)
- The fee may be too low (unlikely with default settings)
- The transaction structure may be invalid

### Transaction Not Confirming
- Testnet can sometimes be slow; wait a few minutes
- Check the transaction on the explorer using the provided URL

### Connection Errors
- The public testnet RPC node may be temporarily unavailable
- Try again after a short wait

## Security Reminders

- **NEVER** hardcode private keys in production applications
- **NEVER** commit real private keys to version control
- **NEVER** reuse testnet keys on mainnet
- Use environment variables, keystore files, or hardware wallets in production
- The test key in this demo is publicly known and should ONLY be used on testnet

## Next Steps

After completing this lesson, you'll be ready to:
- Explore live cells on the testnet (Lesson 6)
- Understand CKB scripts and how lock scripts work (Lesson 7)
- Build more complex transactions with type scripts
