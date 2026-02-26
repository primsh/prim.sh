# Secrets Audit

## Git History Check
Run before any public release:
```bash
git log -p | grep -E "(password|secret|api.key|private.key|token)" -i | grep "^+" | grep -v "^+++ " | head -50
```
Also check for specific known patterns:
```bash
git log -p | grep -E "(0x[a-fA-F0-9]{64}|sk_|sk-|Bearer [a-zA-Z0-9])" | grep "^+" | head -20
```

## VPS File Permissions
All .env files on VPS must be 600:
```bash
find /opt/prim -name "*.env" -exec chmod 600 {} \;
find /opt/prim -name ".env*" -exec chmod 600 {} \;
ls -la /opt/prim/*/  # verify no world-readable files
```

## Rotation Schedule
| Secret | Location | Rotate every | Last rotated |
|--------|----------|-------------|--------------|
| Stalwart admin password | VPS /opt/prim/email/.env | 90 days | L-15 (pre-launch) |
| Stalwart relay-wrapper API key | VPS /opt/prim/email/.env | 90 days | L-15 (pre-launch) |
| PRIM_INTERNAL_KEY | All service .env files | 90 days | L-15 (pre-launch) |
| DO_API_TOKEN | VPS spawn .env | 180 days | — |
| CF API Token | VPS domain .env | 180 days | — |
| Circle API key | VPS faucet .env | 180 days | — |
| Tavily API key | VPS search .env | 180 days | — |
| Google API key | VPS mem .env | 180 days | — |
| TOKEN_MASTER_KEY | VPS token .env | Never (AES key for encrypted deployer) | — |
| TOKEN_DEPLOYER_ENCRYPTED_KEY | VPS token .env | Never (rotate via key ceremony) | — |

## Gitignore Verification
```bash
git check-ignore -v .env .env.local .env.testnet scripts/.env.testnet
# All should show as ignored
```

## Pre-Public Checklist (L-15)
- [ ] Run git history grep above, verify no secrets exposed
- [ ] Rotate Stalwart admin password
- [ ] Rotate relay-wrapper API key (update VPS .env + Stalwart config)
- [ ] Rotate PRIM_INTERNAL_KEY (update all service .env files, redeploy all)
- [ ] Verify all .env files are chmod 600 on VPS
- [ ] Verify .gitignore covers all .env patterns
