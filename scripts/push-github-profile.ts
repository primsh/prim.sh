#!/usr/bin/env bun
/**
 * push-github-profile.ts — Push github-org/profile/README.md to primsh/.github
 *
 * Reads the locally generated file (run gen:prims first), fetches the current
 * SHA from GitHub, then PUTs the updated content.
 *
 * Usage:
 *   bun scripts/push-github-profile.ts
 */

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dir, "..");
const LOCAL = join(ROOT, "github-org/profile/README.md");

const content = readFileSync(LOCAL, "utf8");
const encoded = Buffer.from(content).toString("base64");

// Get current file SHA (required by GitHub API for updates)
let sha: string | undefined;
try {
  sha = execSync(
    `gh api repos/primsh/.github/contents/profile/README.md --jq '.sha'`,
    { encoding: "utf8" }
  )
    .trim()
    .replace(/"/g, "");
} catch {
  // File doesn't exist yet — create without SHA
}

const payload: Record<string, string> = {
  message: "chore: sync org profile README",
  content: encoded,
};
if (sha) payload.sha = sha;

const tmp = join(tmpdir(), "github-profile-payload.json");
writeFileSync(tmp, JSON.stringify(payload));

try {
  execSync(
    `gh api repos/primsh/.github/contents/profile/README.md --method PUT --input ${tmp}`,
    { stdio: "inherit" }
  );
  console.log("✓ Pushed github-org/profile/README.md → primsh/.github/profile/README.md");
} finally {
  unlinkSync(tmp);
}
