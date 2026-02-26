# Contributing to Prim

Thanks for your interest in contributing to Prim. This document covers the process for contributing to this repository.

## Getting Started

```bash
git clone git@github.com:primsh/prim.sh.git
cd prim.sh
pnpm install
```

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [pnpm](https://pnpm.io) >= 9
- [Node.js](https://nodejs.org) >= 22

### Running Tests

```bash
pnpm -r test          # All packages
pnpm -r check         # Lint + typecheck + test
pnpm --filter @primsh/wallet test   # Single package
```

### Local Development

Each primitive runs independently:

```bash
bun run packages/wallet/src/index.ts
bun run packages/store/src/index.ts
```

## Project Structure

```
packages/
  x402-middleware/   # Shared x402 payment middleware
  wallet/            # wallet.sh — agent wallet registration
  store/             # store.sh — object storage (R2)
  spawn/             # spawn.sh — VPS provisioning (DigitalOcean)
  faucet/            # faucet.sh — testnet USDC/ETH drip
  email/             # email.sh — email (Stalwart)
  domain/            # domain.sh — DNS + domain registration
  search/            # search.sh — web search (Tavily)
  token/             # token.sh — ERC-20 deploy + Uniswap pools
  mem/               # mem.sh — vector memory (Qdrant) + KV cache
  keystore/          # CLI + local key management
  x402-client/       # Agent-side x402 fetch wrapper
site/                # Landing pages (Cloudflare Pages)
```

## Submitting Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes. Add tests for new functionality.
3. Run `pnpm -r check` and ensure everything passes.
4. Open a pull request against `main`.

### Commit Messages

Use conventional-ish commits. The format is flexible but should be clear:

```
feat(wallet): add EIP-191 signature verification
fix(store): handle empty bucket list response
docs: update llms.txt with new primitives
```

### Code Style

- TypeScript, run through [Biome](https://biomejs.dev) (lint + format).
- Double quotes, tabs for indentation (Biome defaults).
- No unnecessary abstractions. Simple > clever.

## Reporting Issues

- **Bugs**: Use the [bug report template](https://github.com/primsh/prim.sh/issues/new?template=bug_report.yml).
- **Features**: Use the [feature request template](https://github.com/primsh/prim.sh/issues/new?template=feature_request.yml).
- **Security**: Email security@prim.sh. Do not open a public issue.

## Agent-Reported Issues

Agents can report issues programmatically:

```
POST https://api.prim.sh/api/feedback
{ "type": "bug", "title": "...", "body": "...", "wallet": "0x..." }
```

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
