# Getting Started

Prim gives agents access to infrastructure — storage, compute, email, DNS, and more — through HTTP APIs authenticated by [x402](https://www.x402.org) micropayments. No signup, no dashboard, no OAuth.

**Status:** Private beta on Base Sepolia testnet.

## Install the CLI

```bash
curl -fsSL prim.sh/install.sh | sh
```

Installs `prim` to `~/.prim/bin/`. Supports macOS (arm64/x86) and Linux (x86/arm64).

Verify:

```bash
prim --version
```

## Create a wallet

```bash
prim wallet create
```

Generates an EVM keypair, stores it encrypted at `~/.prim/keys/`, and registers the address on-chain via EIP-191 signature. Your wallet address is your identity — no username, no email.

You can also use any existing EVM private key:

```bash
prim wallet import --key 0xabc...
```

## Request access (private beta)

During private beta, wallets must be approved before using paid primitives.

```bash
prim wallet create
# note your wallet address from the output

curl -X POST https://api.prim.sh/access/request \
  -H "Content-Type: application/json" \
  -d '{"wallet": "0xYourAddress", "reason": "testing storage for my agent"}'
```

Or request via [prim.sh/access](https://prim.sh/access). You'll be notified via Discord once approved.

## Get test USDC

```bash
prim faucet usdc    # drips 1 USDC (rate-limited: 1/2hr per wallet)
prim faucet eth     # drips 0.001 ETH for gas (rate-limited: 1/1hr)
```

Testnet USDC has no monetary value. Once mainnet launches, you'll fund your wallet with real USDC on Base.

## Use a primitive

```bash
# Object storage
prim store create-bucket --name my-data
prim store put my-data hello.txt ./hello.txt
prim store get my-data hello.txt
prim store ls my-data
prim store rm my-data hello.txt

# VPS provisioning
prim spawn create --name my-server --ssh-key ~/.ssh/id_ed25519.pub
prim spawn list
prim spawn destroy <server-id>

# Web search
prim search web "latest Base L2 gas prices"
```

The CLI automatically signs x402 payments from your local wallet. No headers to construct, no payment logic to write.

## Without the CLI

If you prefer direct HTTP:

1. Generate any EVM keypair.
2. Register: `POST https://wallet.prim.sh/v1/wallets` (EIP-191 signature, free).
3. Get testnet funds: `POST https://faucet.prim.sh/v1/faucet/usdc`.
4. Call any primitive endpoint — handle the 402→sign→retry cycle.

See the [x402 guide](./x402.md) for the full payment flow, or use `@primsh/x402-client` (TypeScript):

```typescript
import { createPrimFetch } from "@primsh/x402-client";

const fetch402 = createPrimFetch({ privateKey: process.env.AGENT_PRIVATE_KEY });
const res = await fetch402("https://store.prim.sh/v1/buckets", {
  method: "POST",
  body: JSON.stringify({ name: "my-data" }),
});
```

## CLI reference

```
prim wallet create            Create and register a new wallet
prim wallet import            Import an existing private key
prim wallet address           Show current wallet address
prim wallet balance           Show USDC + ETH balance

prim faucet usdc              Drip 1 test USDC
prim faucet eth               Drip 0.001 test ETH

prim store create-bucket      Create a storage bucket
prim store ls [bucket]        List buckets or objects
prim store put <b> <k> <f>    Upload a file
prim store get <b> <k>        Download a file
prim store rm <b> <k>         Delete an object
prim store rm-bucket <b>      Delete a bucket

prim spawn create             Provision a VPS
prim spawn list               List your servers
prim spawn destroy <id>       Destroy a server

prim search web <query>       Web search
prim search news <query>      News search
prim search extract <url>     Extract content from URL
```

Run `prim <command> --help` for options on any subcommand.
