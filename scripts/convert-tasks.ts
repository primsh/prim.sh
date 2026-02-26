#!/usr/bin/env bun
/**
 * scripts/convert-tasks.ts — One-shot migration: TASKS.md → tasks/tasks.json
 *
 * Run: bun scripts/convert-tasks.ts
 *
 * Parses the full TASKS.md hierarchy (sections → waves → phases → tasks)
 * and emits a validated JSON file at tasks/tasks.json.
 *
 * Special cases:
 *   - BKLG section: flat task table (no wave/phase). Also has a "Future Primitives"
 *     reference table which is NOT tasks — it is skipped.
 *   - Owner field: normalized to array ("Garric + Claude" → ["Garric", "Claude"])
 *   - Depends: "--" → [], otherwise split on ", " or ","
 *   - Release: "--" → null
 *   - Plan refs: extracted from description ("Plan: `path`"), stored as `plan` field
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

// ── Types ──────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  description: string;
  owner: string[];
  depends: string[];
  status: "pending" | "in-progress" | "done" | "backlog";
  release: string | null;
  plan?: string;
}

interface Phase {
  id: string;
  title: string;
  parallelism?: "PARA" | "SRL";
  tasks: Task[];
}

interface Wave {
  id: string;
  title: string;
  parallelism?: "PARA" | "SRL";
  phases?: Phase[];
  tasks?: Task[];
}

interface Section {
  id: string;
  title: string;
  description?: string;
  waves: Wave[];
}

interface TasksFile {
  sections: Section[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeOwner(raw: string): string[] {
  if (!raw || raw.trim() === "--" || raw.trim() === "") return [];
  return raw
    .split(/\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeDepends(raw: string): string[] {
  if (!raw || raw.trim() === "--" || raw.trim() === "") return [];
  return raw
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeRelease(raw: string): string | null {
  const v = raw.trim();
  if (!v || v === "--") return null;
  return v;
}

function normalizeStatus(raw: string): Task["status"] {
  const s = raw.trim().toLowerCase();
  if (s === "pending" || s === "in-progress" || s === "done" || s === "backlog") {
    return s as Task["status"];
  }
  throw new Error(`Unknown status: ${raw}`);
}

/** Extract plan reference and strip it from description */
function extractPlan(desc: string): { description: string; plan?: string } {
  // Matches: Plan: `tasks/active/foo.md`
  const match = desc.match(/\s*Plan:\s*`([^`]+)`/);
  if (!match) return { description: desc.trim() };
  const plan = match[1].trim();
  const description = desc.replace(match[0], "").trim();
  return { description, plan };
}

/** Parse a markdown table row into cells */
function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  const cells = trimmed
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
  return cells;
}

/** Check if a line is a separator row (|---|...) */
function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

/** Parse a task table and return Task[] */
function parseTasks(lines: string[], isBacklog = false): Task[] {
  const tasks: Task[] = [];
  let inTable = false;
  let headerParsed = false;

  for (const line of lines) {
    if (isSeparatorRow(line)) {
      if (inTable) headerParsed = true;
      continue;
    }

    const cells = parseTableRow(line);
    if (!cells) {
      if (inTable && headerParsed) break; // End of table
      continue;
    }

    // Detect table header: | ID | Task | Owner | ...
    if (!inTable) {
      if (cells[0].toLowerCase() === "id" || cells[0].toLowerCase() === "primitive") {
        inTable = true;
        // If this is the "Future Primitives" table, skip it (Primitive column)
        if (isBacklog && cells[0].toLowerCase() === "primitive") {
          return tasks;
        }
        continue;
      }
      continue;
    }

    if (!headerParsed) continue;

    // cells: [id, task, owner, depends, status, release]
    if (cells.length < 6) continue;

    const [id, taskRaw, ownerRaw, dependsRaw, statusRaw, releaseRaw] = cells;
    if (!id || !taskRaw) continue;

    const { description, plan } = extractPlan(taskRaw);

    const task: Task = {
      id,
      description,
      owner: normalizeOwner(ownerRaw),
      depends: normalizeDepends(dependsRaw),
      status: normalizeStatus(statusRaw),
      release: normalizeRelease(releaseRaw),
    };
    if (plan) task.plan = plan;
    tasks.push(task);
  }

  return tasks;
}

/** Parse parallelism annotation from a heading: "(PARA)" or "(SRL)" */
function parseParallelism(heading: string): "PARA" | "SRL" | undefined {
  if (/\(PARA\)/i.test(heading)) return "PARA";
  if (/\(SRL\)/i.test(heading)) return "SRL";
  return undefined;
}

/** Strip annotation and ID prefix from heading title
 * e.g. "HRD-W1: Open-Source Readiness (PARA)" → "Open-Source Readiness"
 * e.g. "HRD-W1-PA: Service Layer + Middleware (SRL)" → "Service Layer + Middleware"
 */
function parseHeadingTitle(heading: string): string {
  return heading
    .replace(/\s*\(PARA\)\s*/gi, "")
    .replace(/\s*\(SRL\)\s*/gi, "")
    .replace(/^[A-Z0-9\-]+:\s*/, "") // strip ID prefix "HRD-W1: "
    .trim();
}

/** Split text into blocks at a given heading level (## or ### or ####) */
function splitAtLevel(text: string, level: number): string[] {
  const prefix = "#".repeat(level) + " ";
  const parts = text.split(new RegExp(`(?=^${prefix})`, "m"));
  return parts.filter((p) => p.trim());
}

// ── Main Parser ────────────────────────────────────────────────────────────

function parseTASKSmd(content: string): TasksFile {
  const sections: Section[] = [];

  // Split at ## level, skip the preamble (first block before any ##)
  const sectionBlocks = splitAtLevel(content, 2);

  for (const sectionBlock of sectionBlocks) {
    const sectionLines = sectionBlock.split("\n");
    const headingLine = sectionLines[0].trim();
    if (!headingLine.startsWith("## ")) continue;

    // Parse section heading: "## HRD — Hardening" or "## BKLG — Backlog"
    const sectionHeading = headingLine.slice(3).trim();
    const dashMatch = sectionHeading.match(/^([A-Z]+)\s+[—–-]\s+(.+)$/);
    if (!dashMatch) continue;

    const sectionId = dashMatch[1];
    const sectionTitle = dashMatch[2].trim();

    // Description: lines after heading until first ### or table
    const descLines: string[] = [];
    let i = 1;
    while (
      i < sectionLines.length &&
      !sectionLines[i].startsWith("### ") &&
      !sectionLines[i].startsWith("| ")
    ) {
      const l = sectionLines[i].trim();
      if (l && !l.startsWith("---")) descLines.push(l);
      i++;
    }
    const description = descLines.join(" ").trim() || undefined;

    const waves: Wave[] = [];

    // Check if section has proper ### wave headings (with ID prefix like "PRIMS-W1:")
    // BKLG has "### Future Primitives" but no ID-prefixed waves
    const hasWaves = /^### [A-Z0-9\-]+:/m.test(sectionBlock);

    if (!hasWaves) {
      // BKLG-style: flat task table at section level, wrapped in synthetic wave
      const isBacklog = sectionId === "BKLG";
      const taskLines = sectionLines.slice(i);

      // Stop at any ### heading (e.g. "### Future Primitives" in BKLG) or
      // at a reference table whose header is "Primitive" not "ID"
      const taskTableLines: string[] = [];
      let hitFuture = false;
      for (const line of taskLines) {
        if (line.startsWith("### ") || line.includes("Future Primitives")) {
          hitFuture = true;
        }
        if (hitFuture) continue;
        taskTableLines.push(line);
      }

      const tasks = parseTasks(taskTableLines, isBacklog);
      if (tasks.length > 0) {
        waves.push({
          id: `${sectionId}-W1`,
          title: sectionTitle,
          tasks,
        });
      }
    } else {
      // Parse ### waves
      const waveBlocks = splitAtLevel(sectionBlock, 3);
      for (const waveBlock of waveBlocks) {
        const waveLines = waveBlock.split("\n");
        const waveHeading = waveLines[0].trim();
        if (!waveHeading.startsWith("### ")) continue;

        const waveHeadingText = waveHeading.slice(4).trim();
        const waveIdMatch = waveHeadingText.match(/^([A-Z0-9\-]+):/);
        if (!waveIdMatch) continue;

        const waveId = waveIdMatch[1];
        const waveTitle = parseHeadingTitle(waveHeadingText);
        const waveParallelism = parseParallelism(waveHeadingText);

        const wave: Wave = { id: waveId, title: waveTitle };
        if (waveParallelism) wave.parallelism = waveParallelism;

        // Check if wave has #### phases
        if (waveBlock.includes("\n#### ")) {
          const phases: Phase[] = [];
          const phaseBlocks = splitAtLevel(waveBlock, 4);

          for (const phaseBlock of phaseBlocks) {
            const phaseLines = phaseBlock.split("\n");
            const phaseHeading = phaseLines[0].trim();
            if (!phaseHeading.startsWith("#### ")) continue;

            const phaseHeadingText = phaseHeading.slice(5).trim();
            const phaseIdMatch = phaseHeadingText.match(/^([A-Z0-9\-]+):/);
            if (!phaseIdMatch) continue;

            const phaseId = phaseIdMatch[1];
            const phaseTitle = parseHeadingTitle(phaseHeadingText);
            const phaseParallelism = parseParallelism(phaseHeadingText);

            const tasks = parseTasks(phaseLines.slice(1));
            const phase: Phase = { id: phaseId, title: phaseTitle, tasks };
            if (phaseParallelism) phase.parallelism = phaseParallelism;
            phases.push(phase);
          }

          wave.phases = phases;
        } else {
          // Tasks directly in wave
          const tasks = parseTasks(waveLines.slice(1));
          wave.tasks = tasks;
        }

        waves.push(wave);
      }
    }

    const section: Section = { id: sectionId, title: sectionTitle, waves };
    if (description) section.description = description;
    sections.push(section);
  }

  return { sections };
}

// ── Main ───────────────────────────────────────────────────────────────────

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const tasksContent = readFileSync(`${ROOT}/TASKS.md`, "utf-8");
const data = parseTASKSmd(tasksContent);

// Validate against schema
const schemaRaw = readFileSync(`${ROOT}/tasks/tasks.schema.json`, "utf-8");
const schema = JSON.parse(schemaRaw);

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = validate(data);

if (!valid) {
  console.error("Schema validation errors:");
  for (const err of validate.errors ?? []) {
    console.error(`  ${err.instancePath} ${err.message}`);
  }
  process.exit(1);
}

const outputPath = `${ROOT}/tasks/tasks.json`;
writeFileSync(outputPath, JSON.stringify(data, null, 2) + "\n");

// Summary
let taskCount = 0;
for (const section of data.sections) {
  for (const wave of section.waves) {
    if (wave.phases) {
      for (const phase of wave.phases) taskCount += phase.tasks.length;
    } else if (wave.tasks) {
      taskCount += wave.tasks.length;
    }
  }
}

console.log(`✅ tasks/tasks.json written — ${data.sections.length} sections, ${taskCount} tasks`);
console.log(`   Validated against tasks/tasks.schema.json`);
