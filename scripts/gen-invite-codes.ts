#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-invite-codes.ts — Generate invite codes via gate.sh and populate beta-invite.yaml
 *
 * Creates codes on gate.sh's internal API, then merges them into
 * docs/beta-invite.yaml with name/email mappings.
 *
 * Usage:
 *   # Generate codes for contacts in the default file (scripts/.env.beta-contacts.json):
 *   bun scripts/gen-invite-codes.ts
 *
 *   # Generate codes for a specific contact list (JSON):
 *   bun scripts/gen-invite-codes.ts --contacts '[{"name":"Bob","email":"bob@example.com"}]'
 *
 *   # Generate codes from a custom contacts file:
 *   bun scripts/gen-invite-codes.ts --contacts-file contacts.json
 *
 *   # Generate N codes with placeholder names (fill in YAML later):
 *   bun scripts/gen-invite-codes.ts --count 5
 *
 *   # Use a custom gate.sh URL (default: https://gate.prim.sh):
 *   bun scripts/gen-invite-codes.ts --gate-url http://localhost:3015
 *
 *   # Dry run — show what would happen without hitting the API:
 *   bun scripts/gen-invite-codes.ts --dry-run
 *
 * Env:
 *   PRIM_INTERNAL_KEY — required for gate.sh internal API auth
 *   PRIM_GATE_URL     — override gate.sh URL (default: https://gate.prim.sh)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ── Config ──────────────────────────────────────────────────────────────────

const YAML_PATH = resolve(import.meta.dirname, "..", "docs", "beta-invite.yaml");
const DEFAULT_CONTACTS = resolve(import.meta.dirname, ".env.beta-contacts.json");

interface Contact {
  name: string;
  email: string;
}

interface Invite extends Contact {
  code: string;
}

interface BetaInviteYaml {
  from: string;
  subject: string;
  hero: { tag: string; alt: string; link: string };
  body: string;
  signature: { name: string; url: string };
  footer: { logo: string; logo_alt: string; links: string; copyright: string };
  invites: Invite[];
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    count: { type: "string" },
    contacts: { type: "string" },
    "contacts-file": { type: "string" },
    "gate-url": { type: "string" },
    label: { type: "string", default: "v0-beta" },
    "dry-run": { type: "boolean", default: false },
  },
});

const GATE_URL =
  values["gate-url"] ??
  process.env.PRIM_GATE_URL ??
  "https://gate.prim.sh";

const INTERNAL_KEY = process.env.PRIM_INTERNAL_KEY;

if (!INTERNAL_KEY && !values["dry-run"]) {
  console.error("PRIM_INTERNAL_KEY is required. Export it or use --dry-run.");
  process.exit(1);
}

// ── Resolve contacts ────────────────────────────────────────────────────────

let contacts: Contact[] = [];

if (values.contacts) {
  contacts = JSON.parse(values.contacts);
} else if (values["contacts-file"]) {
  const raw = readFileSync(values["contacts-file"], "utf-8");
  contacts = JSON.parse(raw);
} else if (existsSync(DEFAULT_CONTACTS)) {
  const raw = readFileSync(DEFAULT_CONTACTS, "utf-8");
  contacts = JSON.parse(raw);
  console.log(`Loaded ${contacts.length} contact(s) from ${DEFAULT_CONTACTS}`);
}

const count = values.count ? Number.parseInt(values.count, 10) : contacts.length;

if (count <= 0) {
  console.error(
    "No contacts found. Options:\n" +
      "  1. Create scripts/.env.beta-contacts.json (auto-loaded)\n" +
      "  2. --contacts '[{\"name\":\"Bob\",\"email\":\"bob@x.com\"}]'\n" +
      "  3. --contacts-file path/to/contacts.json\n" +
      "  4. --count 5 (placeholder names, fill in YAML later)",
  );
  process.exit(1);
}

if (contacts.length > 0 && contacts.length !== count) {
  console.error(
    `Contact count (${contacts.length}) doesn't match --count (${count}). ` +
      "Omit --count to use the contact list length.",
  );
  process.exit(1);
}

// ── Generate codes via gate.sh ──────────────────────────────────────────────

async function createCodes(n: number, label: string): Promise<string[]> {
  const url = `${GATE_URL}/internal/codes`;
  console.log(`POST ${url} (count: ${n}, label: "${label}")`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
    },
    body: JSON.stringify({ count: n, label }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`gate.sh error ${res.status}: ${body}`);
    process.exit(1);
  }

  const data = (await res.json()) as { codes: string[]; created: number };
  console.log(`Created ${data.created} code(s): ${data.codes.join(", ")}`);
  return data.codes;
}

// ── Dry run placeholder codes ───────────────────────────────────────────────

function fakeCodes(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `PRIM-dry${String(i).padStart(4, "0")}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

const label = values.label ?? "v0-beta";
const dryRun = values["dry-run"];

console.log(`Gate URL: ${GATE_URL}`);
console.log(`Label: ${label}`);
console.log(`Count: ${count}`);
if (dryRun) console.log("DRY RUN — no API calls, no YAML writes\n");

const codes = dryRun ? fakeCodes(count) : await createCodes(count, label);

// Build invite entries
const newInvites: Invite[] = codes.map((code, i) => ({
  name: contacts[i]?.name ?? `Tester ${i + 1}`,
  email: contacts[i]?.email ?? `tester${i + 1}@example.com`,
  code,
}));

// ── Update YAML ─────────────────────────────────────────────────────────────

const yaml = parseYaml(readFileSync(YAML_PATH, "utf-8")) as BetaInviteYaml;

// Dedupe by code — don't add codes that already exist
const existingCodes = new Set(yaml.invites.map((inv) => inv.code));
const toAdd = newInvites.filter((inv) => !existingCodes.has(inv.code));

if (toAdd.length === 0) {
  console.log("\nAll codes already in beta-invite.yaml. Nothing to add.");
} else {
  yaml.invites.push(...toAdd);

  console.log(`\nNew invites to add (${toAdd.length}):`);
  for (const inv of toAdd) {
    console.log(`  ${inv.code}  ${inv.name} <${inv.email}>`);
  }

  if (!dryRun) {
    writeFileSync(YAML_PATH, stringifyYaml(yaml, { lineWidth: 120 }));
    console.log(`\nUpdated ${YAML_PATH}`);
  } else {
    console.log("\n(dry run — YAML not written)");
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log("\n── Summary ──────────────────────────────────────────");
console.log(`Total invites in YAML: ${yaml.invites.length}`);
console.log("\nAll invites:");
for (const inv of yaml.invites) {
  const isNew = toAdd.some((a) => a.code === inv.code);
  const marker = isNew ? " (new)" : "";
  console.log(`  ${inv.code}  ${inv.name} <${inv.email}>${marker}`);
}

if (!dryRun) {
  console.log("\nNext steps:");
  console.log("  1. Review docs/beta-invite.yaml — update names/emails for placeholder entries");
  console.log("  2. bun scripts/beta-invite.ts gen           # Generate HTML emails");
  console.log("  3. bun scripts/beta-invite.ts send --dry-run # Preview before sending");
  console.log("  4. bun scripts/beta-invite.ts send           # Send all");
}
