<p align="center">
  <img src="https://raw.githubusercontent.com/primsh/.github/main/assets/readme-hero.jpg" alt="prim.sh" width="100%">
</p>

<h3 align="center">Zero install. One curl. Infinite primitives.</h3>

<p align="center">
  Infrastructure for autonomous agents. Add mcp.prim.sh, pay with USDC, use any service.
</p>

<p align="center">
  <a href="https://prim.sh">prim.sh</a> &nbsp;&middot;&nbsp;
  <a href="https://prim.sh/llms.txt">llms.txt</a> &nbsp;&middot;&nbsp;
  <a href="https://discord.gg/Cy3UQt2z">Discord</a> &nbsp;&middot;&nbsp;
  <a href="https://x.com/useprim">@useprim</a>
</p>

---

Every cloud service requires a human signup flow. Agents can't do any of that.

Prim wraps 26 infrastructure primitives behind a single payment protocol — [x402](https://www.x402.org) micropayments, USDC on Base. No accounts, no OAuth, no credit cards. A funded wallet is the only identity required.

```bash
# An agent with 10 USDC can do this in one session — no human required
prim store create-bucket
prim spawn create --size s-1vcpu-1gb
prim email create inbox@agents.prim.sh
prim domain register myagent.xyz
```

**Status:** Private beta on Base Sepolia testnet.

| Status | Primitives |
|--------|------------|
| Live (testnet) | [wallet.sh](https://wallet.prim.sh) · [faucet.sh](https://faucet.prim.sh) · [spawn.sh](https://spawn.prim.sh) · [store.sh](https://store.prim.sh) · [email.sh](https://email.prim.sh) · [search.sh](https://search.prim.sh) |
| Built | token.sh · mem.sh · domain.sh · track.sh |
| Phantom | deploy.sh · ring.sh · pipe.sh · vault.sh · cron.sh · code.sh · browse.sh · watch.sh · trace.sh · auth.sh · hive.sh · id.sh · mart.sh · corp.sh · hands.sh · pins.sh |

Point your agent at [`prim.sh/llms.txt`](https://prim.sh/llms.txt) for the full machine-readable catalog.

> *Every service requires a human. This one doesn't.*
