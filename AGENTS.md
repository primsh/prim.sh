# Repository Guidelines

## Project Structure & Module Organization
This repository is a pnpm monorepo.
- `packages/*`: TypeScript packages (`relay`, `spawn`, `wallet`, `x402-middleware`) with `src/` and `test/`.
- `site/`: static landing pages (`site/<name>/index.html`) and a minimal Python server (`site/serve.py`).
- `specs/`: product and architecture notes.
- `tasks/`: active/completed implementation task records.

Keep package code focused: public exports in `src/index.ts`, implementation in adjacent module files, and tests under `test/`.

## Build, Test, and Development Commands
Run from repository root unless noted.
- `pnpm lint`: runs Biome lint rules across the workspace.
- `pnpm format`: formats files with Biome.
- `pnpm typecheck`: runs `tsc --noEmit` in each package.
- `pnpm test`: runs Vitest suites in all packages.
- `pnpm check`: full quality gate (`lint + typecheck + test`).
- `pnpm --filter @agentstack/x402-middleware build`: build distributable `dist/` output for middleware package.
- `python3 site/serve.py`: serves static pages using the route map in `site/serve.py`.

## Coding Style & Naming Conventions
- Language: TypeScript (ES modules, `strict` mode).
- Formatting: Biome, 2-space indentation, 100-column line width.
- File naming: prefer descriptive lowercase names; package entrypoint is `src/index.ts`.
- Exports: use explicit exports from index modules (for example, `export * from "./middleware"`).
- Keep handlers and middleware small; move shared types to `types.ts`.

## Testing Guidelines
- Framework: Vitest (`*.test.ts` under each package `test/` directory).
- Current baseline is smoke coverage; add focused unit tests for new behavior and edge cases.
- Test names should describe behavior (for example, `it("creates a middleware function", ...)`).
- Run package-local tests with `pnpm --filter <package-name> test` before opening a PR.

## Commit & Pull Request Guidelines
Commit history favors short, imperative subjects with optional task IDs, e.g.:
- `S-5: expand landing hero to 26 primitives`
- `Fix x402 middleware build output paths`

Use this pattern:
- Keep subject concise and action-first.
- Reference task IDs (`S-#`, `P-#`) when applicable.
- One logical change per commit.

PRs should include:
- Clear summary of behavior changes.
- Linked task/issue.
- Validation steps and commands run (`pnpm check`, targeted tests).
- Screenshots for `site/` visual changes.
