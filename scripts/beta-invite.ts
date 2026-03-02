#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * beta-invite.ts — Generate and send beta invite emails from YAML SOT
 *
 * Reads docs/beta-invite.yaml, fetches current version from CDN,
 * renders markdown body → inline-styled HTML email.
 *
 * Usage:
 *   bun scripts/beta-invite.ts gen                          # Generate all invites to /tmp/
 *   bun scripts/beta-invite.ts gen --name Alice              # Generate one invite
 *   bun scripts/beta-invite.ts gen --name Alice --out f.html # Generate to specific file
 *   bun scripts/beta-invite.ts send --dry-run                # Dry run all
 *   bun scripts/beta-invite.ts send --name Alice             # Send one
 *   bun scripts/beta-invite.ts send                          # Send all
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";

// ── Config ──────────────────────────────────────────────────────────────────

const YAML_PATH = resolve(import.meta.dirname, "..", "docs", "beta-invite.yaml");
const VERSION_URL = "https://dl.prim.sh/latest/VERSION";

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  body: "margin:0; padding:0; background-color:#0a0a0a; font-family:'SF Mono',SFMono-Regular,'Cascadia Code',Consolas,monospace; color:#e0e0e0; line-height:1.6;",
  link: "color:#00ff88; text-decoration:none;",
  code: "background:#111; padding:2px 6px; border-radius:3px; font-size:13px;",
  codeBlock: "background-color:#111; border:1px solid #333; border-radius:6px; padding:16px; font-size:13px; word-break:break-all;",
  p: "margin:0 0 16px 0;",
} as const;

// ── Markdown → inline-styled HTML ───────────────────────────────────────────

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim(); // e.g. "green" or ""
      const color = lang === "green" ? "#00ff88" : "#999";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```

      // Color specific lines: lines starting with "  " (indented) in muted, rest in specified color
      // For the stdout block, highlight "prim skill onboard" line in green
      const rendered = codeLines.map((l) => {
        // In the stdout block, highlight the "prim skill onboard" line
        if (l.includes("prim skill onboard") || l.includes("prim v")) {
          return `<span style="color:#e0e0e0;">${l}</span>`;
        }
        if (l.startsWith("Next:") || l.startsWith("&nbsp;")) {
          return l;
        }
        return l;
      });

      out.push(
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">` +
          `<tr><td style="${S.codeBlock} color:${color};">` +
          rendered.join("<br>") +
          `</td></tr></table>`,
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect lines until blank line or code fence
    const pLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].trimStart().startsWith("```")) {
      pLines.push(lines[i]);
      i++;
    }
    const pText = inlineMarkdown(pLines.join(" "));
    out.push(`<p style="${S.p}">${pText}</p>`);
  }

  return out.join("\n");
}

function inlineMarkdown(text: string): string {
  // Inline code
  let result = text.replace(/`([^`]+)`/g, `<code style="${S.code}">$1</code>`);
  // Links
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    `<a href="$2" style="${S.link}">$1</a>`,
  );
  return result;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/ {2}/g, "&nbsp;&nbsp;");
}

// ── HTML shell ──────────────────────────────────────────────────────────────

interface EmailConfig {
  from: string;
  subject: string;
  hero: { src: string; alt: string; link: string };
  heroes?: string[];
  body: string;
  signature: { name: string; url: string };
  footer: { logo: string; logo_alt: string; links: string; copyright: string };
  invites: Array<{ name: string; email: string; code: string; hero?: string }>;
}

function renderEmail(config: EmailConfig, invite: { name: string; code: string; hero?: string }, version: string): string {
  // Substitute variables in body
  const body = config.body
    .replace(/\{name\}/g, invite.name)
    .replace(/\{code\}/g, invite.code)
    .replace(/\{version\}/g, version);

  const bodyHtml = mdToHtml(body);
  const subject = config.subject.replace(/\{version\}/g, version);

  const footerLinksHtml = inlineMarkdown(config.footer.links);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

<!-- Hero -->
<tr><td style="padding:0;">
  <a href="${config.hero.link}" style="display:block;">
    <img src="${invite.hero || config.hero.src}" alt="${escapeHtml(config.hero.alt)}" width="600" style="width:100%; height:auto; display:block; border-radius:8px;" />
  </a>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px 0 0 0; font-size:14px;">
${bodyHtml}

<!-- Signature (text, in body) -->
<p style="margin:32px 0 0 0; color:#e0e0e0;">\u2014 ${escapeHtml(config.signature.name)}</p>

</td></tr>
</table>

<!-- Footer (outside card) -->
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; margin-top:40px; border-top:1px solid #222; padding-top:24px;">
<tr><td align="center" style="padding:0 0 12px 0;">
  <a href="${config.signature.url}" style="display:block;">
    <img src="${config.footer.logo}" alt="${escapeHtml(config.footer.logo_alt)}" width="32" height="32" style="display:block; margin:0 auto;" />
  </a>
</td></tr>
<tr><td align="center" style="font-size:12px; color:#666;">
  ${footerLinksHtml}
</td></tr>
<tr><td align="center" style="font-size:11px; color:#444; padding-top:12px;">
  ${escapeHtml(config.footer.copyright)}
</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    out: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const command = positionals[0];
if (!command || !["gen", "send"].includes(command)) {
  console.error(
    "Usage:\n" +
      "  bun scripts/beta-invite.ts gen [--name NAME] [--out FILE]\n" +
      "  bun scripts/beta-invite.ts send [--name NAME] [--dry-run]",
  );
  process.exit(1);
}

// Load YAML — template + local overrides (from, invites)
const config = parseYaml(readFileSync(YAML_PATH, "utf-8")) as EmailConfig;
const LOCAL_PATH = YAML_PATH.replace(".yaml", ".local.yaml");
try {
  const local = parseYaml(readFileSync(LOCAL_PATH, "utf-8")) as Partial<EmailConfig>;
  Object.assign(config, local);
} catch {
  console.error(`Missing ${LOCAL_PATH} — copy from beta-invite.yaml and add from + invites`);
  process.exit(1);
}

// Fetch version
const versionRes = await fetch(VERSION_URL);
if (!versionRes.ok) {
  console.error(`Failed to fetch version: ${versionRes.status}`);
  process.exit(1);
}
const version = (await versionRes.text()).trim();

// Filter invites
const invites = values.name
  ? config.invites.filter((inv) => inv.name.toLowerCase() === values.name?.toLowerCase())
  : config.invites;

if (invites.length === 0) {
  console.error(values.name ? `No invite found for "${values.name}"` : "No invites in YAML");
  process.exit(1);
}

// Assign unique hero images round-robin from heroes pool
if (config.heroes?.length) {
  for (let i = 0; i < invites.length; i++) {
    if (!invites[i].hero) {
      invites[i].hero = config.heroes[i % config.heroes.length];
    }
  }
}

const subject = config.subject.replace(/\{version\}/g, version);

if (command === "gen") {
  for (const invite of invites) {
    const html = renderEmail(config, invite, version);

    if (values.out && invites.length === 1) {
      writeFileSync(values.out, html);
      console.log(`Generated: ${values.out}`);
    } else {
      const outPath = `/tmp/beta-invite-${invite.code}.html`;
      writeFileSync(outPath, html);
      console.log(`Generated: ${outPath}`);
    }
    console.log(`  To: ${invite.email}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Version: v${version}`);
    console.log(`  Code: ${invite.code}`);
    if (invite.hero) console.log(`  Hero: ${invite.hero}`);
    console.log();
  }
} else if (command === "send") {
  const dryRun = values["dry-run"];

  for (const invite of invites) {
    const html = renderEmail(config, invite, version);
    const tmp = `/tmp/beta-invite-${invite.code}.html`;
    writeFileSync(tmp, html);

    console.log(`From: ${config.from}`);
    console.log(`To: ${invite.email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Code: ${invite.code}`);

    if (dryRun) {
      console.log(`  --dry-run: skipped. HTML at ${tmp}`);
      console.log();
      continue;
    }

    const cmd = `himalaya send --from "${config.from}" --to "${invite.email}" --subject "${subject}" --body "${tmp}"`;
    console.log("Sending via himalaya...");

    try {
      execSync(cmd, { stdio: "inherit" });
      console.log("Sent.");
    } catch {
      console.error(`Failed to send to ${invite.email}. HTML saved at: ${tmp}`);
    }
    console.log();
  }
}
