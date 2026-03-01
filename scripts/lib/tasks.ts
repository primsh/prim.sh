// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/lib/tasks.ts — Shared task loader and helpers
 *
 * Source of truth: tasks/tasks.json
 * Used by: scripts/launch-status.ts and any future scripts that query tasks.
 *
 * Dependency direction: launch-status.ts → scripts/lib/tasks.ts → tasks/tasks.json
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "in-progress" | "done" | "backlog";
export type Parallelism = "PARA" | "SRL";

export interface Task {
  id: string;
  description: string;
  owner: string[];
  depends: string[];
  status: TaskStatus;
  release: string | null;
  plan?: string;
}

export interface Phase {
  id: string;
  title: string;
  parallelism?: Parallelism;
  tasks: Task[];
}

export interface Wave {
  id: string;
  title: string;
  parallelism?: Parallelism;
  phases?: Phase[];
  tasks?: Task[];
}

export interface Section {
  id: string;
  title: string;
  description?: string;
  waves: Wave[];
}

export interface TasksFile {
  sections: Section[];
}

// ── Loader ─────────────────────────────────────────────────────────────────

/**
 * Load and parse tasks.json.
 * @param path - absolute path to tasks.json (defaults to <repo root>/tasks/tasks.json)
 */
export function loadTasks(path?: string): TasksFile {
  const root = resolve(new URL("../..", import.meta.url).pathname);
  const filePath = path ?? join(root, "tasks", "tasks.json");
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as TasksFile;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Flatten the entire task hierarchy into a single Task[].
 * Traverses: sections → waves → (phases →) tasks.
 */
export function flatTasks(data: TasksFile): Task[] {
  const result: Task[] = [];
  for (const section of data.sections) {
    for (const wave of section.waves) {
      if (wave.phases) {
        for (const phase of wave.phases) {
          result.push(...phase.tasks);
        }
      } else if (wave.tasks) {
        result.push(...wave.tasks);
      }
    }
  }
  return result;
}

/**
 * Filter tasks by release tag.
 * Returns only tasks whose `release` field equals the given semver string.
 */
export function filterByRelease(tasks: Task[], release: string): Task[] {
  return tasks.filter((t) => t.release === release);
}
