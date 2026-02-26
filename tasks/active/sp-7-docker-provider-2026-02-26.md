# SP-7: DockerProvider for spawn.sh

**Date:** 2026-02-26
**Status:** pending
**Owner:** Claude
**Depends on:** SP-6 (CloudProvider interface — done)

## Context

spawn.sh currently provisions full VMs (DigitalOcean). At $0.01/create charge vs $4/mo/VM provider cost, the pricing is fundamentally broken for the majority of agent use cases.

Most agents don't need a full VM. They need a place to run code — an isolated container with a shell, a port, and a lifetime. Docker containers on a shared host are 10–50× cheaper and provision in seconds vs minutes.

## Goal

Add `DockerProvider` as the default spawn.sh tier. Full VMs become an explicit `provider=do` option. This fixes the unit economics without breaking any existing interface.

## Cost model

| Tier | Provider | Charge | Actual cost | Margin |
|------|----------|--------|-------------|--------|
| Container (default) | Docker on shared host | $0.05/hr | ~$0.001/hr | ~98% |
| VM (premium) | DigitalOcean | $0.01/create + $0.006/hr | $0.006/hr | thin |

Container pricing at $0.05/hr = $36/mo if always-on. Agents rarely run containers >1hr. This is the right price point.

## Architecture

spawn.sh already has `CloudProvider` interface (`packages/spawn/src/providers/types.ts`). `DockerProvider` implements the same interface.

### DockerProvider implementation

- Talks to Docker daemon via socket (`/var/run/docker.sock`) or TCP on the shared VPS
- `createServer()` → `docker run -d --name prim-<id> --memory 512m --cpus 0.5 <image>`
- `deleteServer()` → `docker rm -f prim-<id>`
- `start/stop/reboot()` → `docker start/stop/restart`
- `getServer()` → `docker inspect`
- SSH access: expose port 22 via `docker run -p <dynamic-port>:22` or use `docker exec` passthrough endpoint
- Default image: `ubuntu:24.04` with sshd pre-installed (build a `prim-base` image)
- Resource limits: 512MB RAM, 0.5 CPU per container (configurable via request body)

### API changes

`POST /v1/servers` gains optional `provider` field:
- `provider: "docker"` (default) → DockerProvider
- `provider: "do"` → DigitalOceanProvider (existing)

Response adds `container_id` field when Docker. All other fields (id, ip, status, ssh_host, ssh_port) remain compatible.

### Shared host setup

Docker daemon runs on the same VPS (`157.230.187.207`). spawn.sh service talks to it via unix socket. No new infra needed.

Add to `setup.sh`: install Docker if not present, add `prim` user to `docker` group.

Build `prim-base` image on first setup:
- Ubuntu 24.04 + openssh-server + curl + git
- Root SSH key injected at runtime via env var or volume mount

### Pricing in x402-middleware

Container endpoints priced at `$0.05/hr`. Billing model: charge on create, track start time in SQLite, charge on delete for elapsed hours (round up to nearest hour). Add `billing_start` and `accumulated_cost` columns to `servers` table.

This requires a new `DELETE /v1/servers/:id` to trigger final billing — already exists in the API but needs billing logic.

## Files to modify

| File | Change |
|------|--------|
| `packages/spawn/src/providers/types.ts` | Add `containerPort?: number` to `Server` type |
| `packages/spawn/src/providers/docker.ts` | New file — DockerProvider implementation |
| `packages/spawn/src/providers/index.ts` | Export DockerProvider, set as default |
| `packages/spawn/src/index.ts` | Route `provider` param to correct provider; add hourly billing logic |
| `packages/spawn/src/db.ts` | Add `billing_start`, `accumulated_cost` columns |
| `deploy/prim/setup.sh` | Install Docker, build prim-base image |
| `specs/openapi/spawn.yaml` | Document `provider` field, container response shape |
| `specs/pricing.yaml` | Add container tier pricing |

## Dependency direction

`DockerProvider` → `CloudProvider` interface (same as `DigitalOceanProvider`). No circular deps. spawn.sh service layer is provider-agnostic.

## Execution guidance

**Sequential — do not parallelize.** This task modifies core spawn.sh logic (DB schema, billing, provider routing). Changes are interdependent. One agent, one pass.

Review the plan before starting. The billing model (charge-on-delete for elapsed hours) is the trickiest part — verify the implementation handles: container killed externally (cron cleanup), server restart (billing_start survives), delete before 1hr (charge minimum 1hr or pro-rated?).

Decision needed: **minimum billing unit** — 1hr minimum (simpler) or pro-rated by minute (fairer). Recommend 1hr minimum for now.

## Testing strategy

1. `docker run` integration test: create container, verify SSH reachable, delete container
2. Billing test: create, wait, delete — verify charged hours calculated correctly
3. Provider routing test: `provider=do` still routes to DigitalOcean
4. Default provider test: omitting `provider` → Docker
5. Resource limits test: container can't exceed 512MB RAM

## Before closing

- [ ] `pnpm --filter @primsh/spawn test` passes
- [ ] Docker container provisions and SSH works end-to-end on VPS
- [ ] Billing math verified for <1hr, 1hr, >1hr cases
- [ ] `specs/pricing.yaml` updated with container tier
- [ ] `setup.sh` installs Docker idempotently
