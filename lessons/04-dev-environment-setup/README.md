# Lesson 04: Setting Up Your Dev Environment

Set up your local CKB development environment, verify your tools, and connect to the CKB testnet.

## Prerequisites

- **Computer** running macOS, Linux, or Windows (with WSL recommended)
- **Basic terminal/command line knowledge** (navigating directories, running commands)
- **Completion of Lessons 1-3** (conceptual understanding of Cells, transactions, and capacity)

## Installing Required Tools

### 1. Node.js (>= 18) — Required

Node.js is the JavaScript/TypeScript runtime we use to run CKB scripts and interact with the blockchain via the CCC SDK.

**macOS (using Homebrew):**

```bash
brew install node
```

**macOS / Linux (using nvm — recommended):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc   # or ~/.zshrc on macOS
nvm install 20
nvm use 20
```

**Windows:**

Download the LTS installer from [https://nodejs.org/](https://nodejs.org/) and follow the installation wizard. Alternatively, use WSL (Windows Subsystem for Linux) and follow the Linux instructions above.

**Verify installation:**

```bash
node --version   # Should print v18.x.x or higher
npm --version    # Should print 9.x.x or higher
```

### 2. CCC SDK (@ckb-ccc/core) — Required

The CCC (Common Chains Connector) SDK is the recommended TypeScript library for CKB development. It provides RPC clients, transaction builders, cell collectors, and signer abstractions.

You don't need to install it globally — it's listed as a project dependency and will be installed when you run `npm install` in this lesson's directory.

### 3. OffCKB CLI — Optional but Recommended

OffCKB lets you spin up a local CKB devnet with a single command. This gives you:

- Instant block production (no waiting for testnet block times)
- Pre-funded accounts for testing
- A clean environment you can reset at any time
- No internet connection required

**Install globally:**

```bash
npm install -g @offckb/cli
```

**Basic usage:**

```bash
offckb node          # Start a local CKB devnet
offckb accounts      # List pre-funded devnet accounts
offckb list-hashes   # Show deployed script hashes on devnet
```

### 4. CKB-CLI — Optional

CKB-CLI is the official command-line tool for managing CKB nodes and wallets. Most students won't need this until later lessons (e.g., Lesson 19: Running a Full Node), but you can install it now if you'd like to explore.

**macOS (using Homebrew):**

```bash
brew tap nervosnetwork/tap
brew install ckb-cli
```

**Other platforms:**

Download the latest release from [https://github.com/nervosnetwork/ckb-cli/releases](https://github.com/nervosnetwork/ckb-cli/releases).

## Running the Verification Script

### Step 1: Navigate to this lesson's directory

```bash
cd lessons/04-dev-environment-setup
```

### Step 2: Install dependencies

```bash
npm install
```

This installs the CCC SDK (`@ckb-ccc/core`), TypeScript, and `tsx` (a fast TypeScript runner).

### Step 3: Run the full verification

```bash
npm start
```

This runs `src/index.ts`, which:

1. Checks your local tools (Node.js, npm, OffCKB, CKB-CLI)
2. Connects to the CKB public testnet
3. Displays current chain information (tip block, epoch, etc.)
4. Generates a test address
5. Checks the balance of that address
6. Prints a final pass/fail summary

### Alternative: Run only the environment check

If you just want to verify your local tools without connecting to the testnet:

```bash
npm run check
```

This runs `src/setup-check.ts` in standalone mode.

## Understanding the Output

A successful run looks something like this:

```
  [PASS] Node.js (required)
        Node.js 20.11.0 detected — meets the >= 18 requirement.
  [PASS] npm (required)
        npm 10.2.4 detected.
  [SKIP] OffCKB CLI (optional)
        OffCKB is not installed...
  [SKIP] CKB-CLI (optional)
        CKB-CLI is not installed...

  All required tools are installed!

  ...

  Tip block number : 12345678
  ...

  All checks passed! Your environment is ready.
```

- `[PASS]` — The check succeeded
- `[FAIL]` — A required check failed (you need to fix this)
- `[SKIP]` — An optional tool is not installed (fine to skip for now)

## Getting Testnet CKB (Faucet)

Once your setup is verified, you'll want some testnet CKBytes for future lessons:

1. Copy the test address printed by the script (starts with `ckt1...`)
2. Visit [https://faucet.nervos.org/](https://faucet.nervos.org/)
3. Paste your address and complete the request
4. Wait a few minutes for the faucet transaction to confirm

You'll use testnet CKB in Lesson 5 (Your First CKB Transfer) and beyond.

## Troubleshooting

### "Cannot find module" or dependency errors

```bash
rm -rf node_modules
npm install
```

### Network timeout connecting to testnet

- Check your internet connection
- Try again in a few minutes (the testnet RPC may be temporarily overloaded)
- If you're behind a corporate firewall, ensure HTTPS traffic to `testnet.ckb.dev` is allowed

### Node.js version too old

```bash
node --version
```

If below v18, upgrade using nvm:

```bash
nvm install 20
nvm use 20
```

### npm permission errors (EACCES)

If you see permission errors when installing global packages:

```bash
# Fix npm global directory permissions (Linux/macOS)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
# Add the export line to your ~/.bashrc or ~/.zshrc
```

### OffCKB command not found after install

Make sure your npm global bin directory is in your PATH:

```bash
npm config get prefix
# Add <prefix>/bin to your PATH if it's not there
```

## Project Structure

```
04-dev-environment-setup/
  package.json          # Project metadata and dependencies
  tsconfig.json         # TypeScript configuration
  README.md             # This file
  src/
    index.ts            # Main script — full verification pipeline
    setup-check.ts      # Standalone environment checker (tools only)
```

## What's Next

With your environment verified, you're ready for **Lesson 5: Your First CKB Transfer**, where you'll build, sign, and submit a real CKB transaction on the testnet.
