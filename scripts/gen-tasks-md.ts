#!/usr/bin/env bun
/**
 * scripts/gen-tasks-md.ts — Regenerate TASKS.md from tasks/tasks.json
 *
 * Run: bun scripts/gen-tasks-md.ts > TASKS.md
 *
 * Reads tasks.json (SOT) and emits a human-readable TASKS.md.
 * Plan references are re-inserted inline in the Task column.
 */

import { loadTasks } from "./lib/tasks.js";
import type { Task, Phase, Wave, Section } from "./lib/tasks.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function ownerStr(owner: string[]): string {
  return owner.join(" + ") || "--";
}

function dependsStr(depends: string[]): string {
  return depends.length > 0 ? depends.join(", ") : "--";
}

function releaseStr(release: string | null): string {
  return release ?? "--";
}

function taskDescription(task: Task): string {
  let desc = task.description;
  if (task.plan) {
    desc += ` Plan: \`${task.plan}\``;
  }
  return desc;
}

function renderTable(tasks: Task[]): string {
  const lines = [
    "| ID | Task | Owner | Depends | Status | Release |",
    "|----|------|-------|---------|--------|---------|",
  ];
  for (const task of tasks) {
    lines.push(
      `| ${task.id} | ${taskDescription(task)} | ${ownerStr(task.owner)} | ${dependsStr(task.depends)} | ${task.status} | ${releaseStr(task.release)} |`,
    );
  }
  return lines.join("\n");
}

function renderPhase(phase: Phase): string {
  const parts: string[] = [];
  const par = phase.parallelism ? ` (${phase.parallelism})` : "";
  parts.push(`#### ${phase.id}: ${phase.title}${par}`);
  parts.push("");
  parts.push(renderTable(phase.tasks));
  return parts.join("\n");
}

function renderWave(wave: Wave): string {
  const parts: string[] = [];
  const par = wave.parallelism ? ` (${wave.parallelism})` : "";
  parts.push(`### ${wave.id}: ${wave.title}${par}`);
  parts.push("");

  if (wave.phases) {
    for (const phase of wave.phases) {
      parts.push(renderPhase(phase));
      parts.push("");
    }
  } else if (wave.tasks) {
    parts.push(renderTable(wave.tasks));
  }

  return parts.join("\n");
}

function renderSection(section: Section): string {
  const parts: string[] = [];
  parts.push(`## ${section.id} — ${section.title}`);
  parts.push("");
  if (section.description) {
    parts.push(section.description);
    parts.push("");
  }

  for (const wave of section.waves) {
    parts.push(renderWave(wave));
    parts.push("");
  }

  return parts.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

const data = loadTasks();

const header = `# TASKS

<!--
Hierarchy: Section (##) → Wave (###) → Phase (####) → Task (row)
- Section: topical grouping. NOT a parallelism boundary.
- Wave/Phase: optional grouping. Annotated PARA or SRL.
- Lanes are implicit: PARA children are in separate lanes (no file conflicts). SRL children share a lane.
- Task: table row. Depends column encodes serial ordering.
- IDs: Waves = <SECTION>-W<n> (e.g. HRD-W1). Phases = <WAVE>-P<X> (e.g. HRD-W1-PA). Tasks = prefix-<n> (e.g. HRD-3).
- Release column: semver tag (e.g. v1.0.0) if task blocks a release, \`--\` otherwise.

Table: | ID | Task | Owner | Depends | Status | Release |
Archival: done → tasks/completed/log.md, then removed from this file.
Full conventions: tasks/README.md
-->
`;

const sectionDivider = "\n---\n";

const sectionTexts: string[] = [];
for (const section of data.sections) {
  sectionTexts.push(renderSection(section));
}

// Special case: BKLG section should include the Future Primitives reference table.
// This content lives outside tasks.json (it's not task data), so we preserve it
// by appending a static note at the end of the BKLG section.
const bklgNote = `
### Future Primitives

| Primitive | Wraps | Notes |
|-----------|-------|-------|
| vault.sh | HashiCorp Vault or custom | Encrypted store |
| cron.sh | Custom | Lightweight job scheduler |
| pipe.sh | NATS or Redis Streams | Message streaming |
| code.sh | E2B or Firecracker | Sandboxed execution |
| ring.sh | Telnyx API | Regulatory prep needed |
| infer.sh | OpenRouter or direct provider APIs | LLM gateway |
| seek.sh | Brave Search or SearXNG | Web search (alternative to search.sh Tavily) |
| browse.sh | Playwright or Browserbase | Web browsing |
| auth.sh | Custom OAuth broker | Builds on vault.sh |
| watch.sh | OpenTelemetry collector | Monitoring |
| trace.sh | OpenTelemetry + Jaeger | Distributed tracing |
| docs.sh | Custom OpenAPI→MCP converter | API documentation |
| id.sh | Custom on-chain reputation | Needs ecosystem first |
| pins.sh | Google Places or Overture Maps | Location data |
| hive.sh | A2A protocol | Agent discovery + collaboration |
| ads.sh | Custom | Needs ecosystem first |
| skills.sh | Custom marketplace | Buy/sell agent skills |
| mart.sh | Amazon/eBay API proxy | Heavy regulatory |
| ship.sh | EasyPost or Shippo | Shipping labels |
| hands.sh | Custom gig platform | Heaviest regulatory burden |
| pay.sh | Stripe + x402 bridge | Fiat payment bridge |
| borrow.sh | Custom on-chain escrow | Agent-to-agent USDC lending |
| guard.sh | Custom + sentinel patterns | Security scanning |
| trade.sh | Broker APIs + Polymarket | Trading for agents |
| insure.sh | Custom actuarial + escrow | Agent operation insurance |
| know.sh | Custom knowledge graph | Structured canonical knowledge |
| props.sh | ATTOM Data, Zillow APIs | Real estate data |
| mktdata.sh | Polygon.io, Unusual Whales | Market data feeds |
| corp.sh | Stripe Atlas API or custom | Legal entity formation |
`;

// Join sections with dividers, except BKLG is the last section
const output = [
  header,
  sectionTexts.slice(0, -1).join(sectionDivider),
  sectionDivider,
  sectionTexts[sectionTexts.length - 1].trimEnd(),
  bklgNote,
].join("\n");

process.stdout.write(output);
