# CKB Mainnet Deployment Checklist

Use this checklist before every production deployment. Work through each section in order. Do not skip items.

---

## Phase 1: Code Review and Auditing

- [ ] All script code reviewed by at least one other developer
- [ ] Security-critical paths have been manually traced and verified
- [ ] No hardcoded private keys, secrets, or sensitive data in codebase
- [ ] No TODO/FIXME comments in security-critical sections
- [ ] All arithmetic uses overflow-safe operations (checked_add, checked_mul)
- [ ] All script args are validated for correct length before use
- [ ] Lock script handles both the unlock path AND an invalid path (return error)
- [ ] Type script handles ALL cases: create (0 inputs), update (n inputs, m outputs), destroy (n inputs, 0 outputs)
- [ ] No assumptions about cell ordering in transactions (iterate, do not index)
- [ ] External security audit completed or explicitly waived with reasoning documented

---

## Phase 2: Test Coverage

- [ ] Unit tests cover ALL branches in the script logic
- [ ] Positive tests: every valid transaction type passes
- [ ] Negative tests: every invalid transaction type is rejected
- [ ] Edge case tests:
  - [ ] Zero amounts
  - [ ] Maximum amounts (u64::MAX, u128::MAX)
  - [ ] Empty data fields
  - [ ] Malformed args (wrong length)
  - [ ] Multiple inputs/outputs in one group
- [ ] Integration tests run on local devnet with the actual compiled binary
- [ ] All tests pass in CI

---

## Phase 3: Devnet Verification

- [ ] Script deployed to local devnet
- [ ] Code hash recorded and matches expected value
- [ ] All transaction types executed successfully on devnet:
  - [ ] Create / mint
  - [ ] Update / transfer
  - [ ] Destroy / burn
  - [ ] Cancel / reclaim
  - [ ] Partial fill (if applicable)
- [ ] Capacity requirements calculated and verified (cells have sufficient capacity)
- [ ] Transaction fee estimates are reasonable

---

## Phase 4: Testnet Deployment

- [ ] Testnet CKB obtained from faucet (https://faucet.nervos.org)
- [ ] Deployment key for testnet is DIFFERENT from mainnet key
- [ ] Script deployed to testnet
- [ ] Deployment transaction hash recorded: `___________________________`
- [ ] Cell index recorded: `___`
- [ ] Code hash verified on CKB Testnet Explorer: `___________________________`
- [ ] Code hash matches devnet deployment (same binary): YES / NO

---

## Phase 5: Testnet Testing

- [ ] All transaction types tested with real testnet transactions:
  - [ ] Transaction 1: `_______________________` - Create/deploy
  - [ ] Transaction 2: `_______________________` - Normal user operation
  - [ ] Transaction 3: `_______________________` - Edge case
  - [ ] Transaction 4: `_______________________` - Cancel/exit
- [ ] Failed transaction attempts verified to fail for the right reason
- [ ] Tested from multiple wallet types (if applicable):
  - [ ] JoyID
  - [ ] MetaMask (with CKB plugin)
  - [ ] Other: `_______________`
- [ ] Tested on multiple devices/browsers (for web dApps):
  - [ ] Desktop Chrome
  - [ ] Desktop Firefox
  - [ ] Mobile Safari (iOS)
  - [ ] Mobile Chrome (Android)

---

## Phase 6: Security and Key Management

- [ ] Mainnet deployment private key stored on hardware wallet (Ledger/Trezor)
- [ ] Mainnet key is NOT stored in any cloud service, password manager, or code repo
- [ ] If using admin/upgrade key: multisig configured (M-of-N: ___ of ___)
- [ ] Team members holding multisig shards confirmed and tested
- [ ] Emergency contacts list prepared (team members, CKB Foundation security)
- [ ] Security checklist tool run and reviewed: `npx tsx src/security-checklist.ts`

---

## Phase 7: Deployment Documentation

- [ ] deployments.json prepared with all deployment info
- [ ] README updated with deployment addresses and code hashes
- [ ] User-facing documentation updated (if applicable)
- [ ] API/SDK updated with mainnet addresses (if applicable)
- [ ] Community announcement prepared

---

## Phase 8: Mainnet Deployment

- [ ] Mainnet deployment performed during low-traffic period (avoid market volatility windows)
- [ ] Deployment transaction broadcast: `___________________________`
- [ ] Waited for 6+ block confirmations
- [ ] Deployment verified on CKB Mainnet Explorer (https://explorer.nervos.org)
- [ ] Code hash verified: `___________________________`
- [ ] Matches testnet code hash: YES / NO

---

## Phase 9: Post-Deployment Verification

- [ ] Test transaction submitted on mainnet with minimal funds (smoke test)
- [ ] All transaction types verified with small amounts:
  - [ ] Create/deploy type
  - [ ] Normal operation type
  - [ ] Exit/cancel type
- [ ] Monitoring set up:
  - [ ] Script cell existence monitoring
  - [ ] TVL tracking
  - [ ] Error/anomaly alerts

---

## Phase 10: Public Launch

- [ ] Community announcement published
- [ ] Documentation links confirmed working
- [ ] Support channel active (Discord, Telegram, etc.)
- [ ] Team monitoring for first 24 hours

---

## Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| Lead Developer | | |
| Security Lead | | |
| CKB Foundation | security@nervos.org | |
| Discord Moderator | | |

---

## Deployment Sign-Off

| Reviewer | Role | Date | Signature |
|----------|------|------|-----------|
| | Lead Developer | | |
| | Security Reviewer | | |
| | Project Lead | | |

**Deployment approved**: YES / NO

**Notes**:

---

*This checklist is based on Lesson 24 of the Learning CKB Fundamentals course. Update it with project-specific requirements as needed.*
