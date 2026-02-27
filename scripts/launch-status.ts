#!/usr/bin/env bun
/**
 * V0 Launch Readiness Dashboard
 *
 * Gate status is derived from tasks.json (each gate maps to task IDs).
 * Runtime checks (endpoints, DNS, tests) run live every time.
 * Next steps are derived from the first incomplete gate + runtime failures.
 *
 * Usage:
 *   bun scripts/launch-status.ts
 *
 * Exit 0 = all gates done + all runtime checks pass
 * Exit 1 = any gate pending or runtime check failing
 */

import { execSync } from "node:child_process";
import { resolve4 } from "node:dns/promises";
import { loadTasks, flatTasks } from "./lib/tasks.js";
import type { Task } from "./lib/tasks.js";

// ─── Config ──────────────────────────────────────────────────────────────

const VPS_IP = process.env.VPS_IP;
if (!VPS_IP) {
	console.error("Error: VPS_IP not set. Add to .env or pass as env var.");
	process.exit(1);
}
const FETCH_TIMEOUT = 10_000;

// V0 scope: 4 primitives
const V0_HOSTS = ["wallet.prim.sh", "store.prim.sh", "search.prim.sh", "feedback.prim.sh"];

// ─── Gate definitions ────────────────────────────────────────────────────
// Gate status = "done" only when ALL referenced tasks are done.
// parallelWith: other gate IDs that can run simultaneously (unblocked at the same time).

interface GateDef {
	id: string;
	name: string;
	taskIds: string[];
	description: string;
	parallelWith?: string[];
}

const V0_GATES: GateDef[] = [
	{
		id: "G1",
		name: "Secret scan",
		taskIds: ["SEC-1a", "SEC-1b", "SEC-1c"],
		description: "Full git history scan — no active secrets in repo",
	},
	{
		id: "G2",
		name: "Mainnet switchover",
		taskIds: ["L-22"],
		description: "VPS env vars → Base mainnet, Caddy logs, metrics cron",
	},
	{
		id: "G3",
		name: "Dogfood",
		taskIds: ["L-76"],
		description: "Golden path via CLI on mainnet (as tester, one-pager only)",
	},
	{
		id: "G4",
		name: "Mainnet smoke test",
		taskIds: ["L-77"],
		description: "smoke-mainnet.ts: x402 timing, spend limits, error shapes",
		parallelWith: ["G5"],
	},
	{
		id: "G5",
		name: "Build feedback.sh",
		taskIds: ["L-78"],
		description: "feedback.sh deployed, feedback_url in all error responses",
		parallelWith: ["G4"],
	},
	{
		id: "G6",
		name: "One-pager",
		taskIds: ["L-79"],
		description: "Beta onboarding doc (<1 page)",
	},
	{
		id: "G7",
		name: "Private beta",
		taskIds: ["L-80"],
		description: "5 testers, 1 week, success = 3/5 complete golden path",
	},
];

// ─── Output helpers ───────────────────────────────────────────────────────

let failures = 0;
const nextSteps: string[] = [];

function pass(label: string, detail?: string) {
	process.stdout.write(`  ✅ ${label}${detail ? `  (${detail})` : ""}\n`);
}

function fail(label: string, detail?: string) {
	process.stdout.write(`  ❌ ${label}${detail ? `  — ${detail}` : ""}\n`);
	failures++;
}

function waiting(label: string, detail?: string) {
	process.stdout.write(`  ⬜ ${label}${detail ? `  — ${detail}` : ""}\n`);
}

function active(label: string, detail?: string) {
	process.stdout.write(`  ⏳ ${label}${detail ? `  — ${detail}` : ""}\n`);
	failures++;
}

function header(emoji: string, title: string) {
	process.stdout.write(`\n${emoji} ${title}\n${"─".repeat(52)}\n\n`);
}

// ─── 1. Gates ─────────────────────────────────────────────────────────────

function checkGates() {
	header("🚦", "V0 Gates");

	const tasks = flatTasks(loadTasks());
	const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));

	type GateStatus = "done" | "in-progress" | "pending";
	const gateStatus = new Map<string, GateStatus>();

	for (const gate of V0_GATES) {
		const gateTasks = gate.taskIds.map((id) => taskMap.get(id));
		const allDone = gateTasks.every((t) => t?.status === "done");
		const anyInProgress = gateTasks.some((t) => t?.status === "in-progress");
		if (allDone) {
			gateStatus.set(gate.id, "done");
		} else if (anyInProgress) {
			gateStatus.set(gate.id, "in-progress");
		} else {
			gateStatus.set(gate.id, "pending");
		}
	}

	// First gate that isn't done = the active gate
	const firstActive = V0_GATES.find((g) => gateStatus.get(g.id) !== "done");

	for (const gate of V0_GATES) {
		const status = gateStatus.get(gate.id)!;
		const label = `${gate.id}: ${gate.name}`;

		if (status === "done") {
			pass(label);
		} else if (status === "in-progress") {
			active(`${label}  🔄`, gate.description);
		} else if (gate === firstActive) {
			active(label, gate.description);
		} else {
			// Gates that can run in parallel with the active gate are also "active"
			const isParallelActive =
				firstActive?.parallelWith?.includes(gate.id) ?? false;
			if (isParallelActive) {
				active(label, `${gate.description}  (parallel with ${firstActive!.id})`);
			} else {
				waiting(label);
			}
		}
	}

	// Derive next steps
	if (!firstActive) {
		nextSteps.push("All gates complete — execute G7 daily monitoring checklist");
		return;
	}

	nextSteps.push(`Complete ${firstActive.id}: ${firstActive.description}`);

	if (firstActive.parallelWith?.length) {
		const parallelGates = firstActive.parallelWith
			.map((id) => V0_GATES.find((g) => g.id === id))
			.filter(Boolean) as GateDef[];
		for (const pg of parallelGates) {
			nextSteps.push(`In parallel — ${pg.id}: ${pg.description}`);
		}
	}

	// What comes after this gate (and its parallel peers)?
	const activeAndParallel = new Set([firstActive.id, ...(firstActive.parallelWith ?? [])]);
	const nextGate = V0_GATES.find(
		(g) => gateStatus.get(g.id) !== "done" && !activeAndParallel.has(g.id),
	);
	if (nextGate) {
		nextSteps.push(`Then: ${nextGate.id} — ${nextGate.description}`);
	}
}

// ─── 2. Live Endpoints ────────────────────────────────────────────────────

async function checkEndpoints(): Promise<string[]> {
	header("🌐", "Live Endpoints");
	const issues: string[] = [];

	for (const host of V0_HOSTS) {
		try {
			const res = await fetch(`https://${host}`, {
				signal: AbortSignal.timeout(FETCH_TIMEOUT),
			});
			if (!res.ok) {
				fail(host, `HTTP ${res.status}`);
				issues.push(`${host} returned HTTP ${res.status}`);
				continue;
			}
			const data = (await res.json()) as { status?: string };
			if (data.status === "ok") {
				pass(host);
			} else {
				fail(host, `status=${data.status ?? "missing"}`);
				issues.push(`${host} status not ok`);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			fail(host, msg.slice(0, 80));
			issues.push(`${host} unreachable`);
		}
	}
	return issues;
}

// ─── 3. DNS ───────────────────────────────────────────────────────────────

async function checkDns(): Promise<string[]> {
	header("📡", "DNS");
	const issues: string[] = [];

	for (const host of V0_HOSTS) {
		try {
			const addrs = await resolve4(host);
			if (addrs.includes(VPS_IP)) {
				pass(host, VPS_IP);
			} else {
				fail(host, `resolves to ${addrs.join(", ")} (expected ${VPS_IP})`);
				issues.push(`${host} DNS → wrong IP`);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			fail(host, msg.slice(0, 80));
			issues.push(`${host} DNS not resolving`);
		}
	}
	return issues;
}

// ─── 4. Tests ─────────────────────────────────────────────────────────────

function checkTests(): string[] {
	header("🧪", "Tests");
	const issues: string[] = [];

	try {
		const output = execSync("pnpm -r test 2>&1", {
			cwd: process.cwd(),
			timeout: 120_000,
			encoding: "utf-8",
		});
		const testMatch = output.match(/Tests\s+(\d+) passed/);
		const fileMatch = output.match(/Test Files\s+(\d+) passed/);
		pass(
			testMatch && fileMatch
				? `${testMatch[1]} tests in ${fileMatch[1]} files`
				: "pnpm -r test passed",
		);
	} catch (err) {
		const stdout =
			typeof (err as { stdout?: string }).stdout === "string"
				? (err as { stdout: string }).stdout
				: "";
		const failMatch = stdout.match(/(\d+) failed/);
		fail(failMatch ? `${failMatch[1]} test(s) failed` : "pnpm -r test failed");
		issues.push("tests failing — run pnpm -r test");
	}
	return issues;
}

// ─── 5. Next Steps ────────────────────────────────────────────────────────

function printNextSteps(runtimeIssues: string[]) {
	header("📋", "Next Steps");

	const fixSteps = runtimeIssues.map((i) => `Fix: ${i}`);
	const allSteps = [...fixSteps, ...nextSteps];

	if (allSteps.length === 0) {
		process.stdout.write("  🟢 Ready to ship.\n");
		return;
	}

	for (const [i, step] of allSteps.entries()) {
		process.stdout.write(`  ${i + 1}. ${step}\n`);
	}
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
	process.stdout.write("\n🚀 Prim v0 Launch Status\n");

	checkGates();
	const testIssues = checkTests();
	const [endpointIssues, dnsIssues] = await Promise.all([checkEndpoints(), checkDns()]);

	printNextSteps([...testIssues, ...endpointIssues, ...dnsIssues]);

	process.stdout.write(`\n${"─".repeat(52)}\n`);
	if (failures === 0) {
		process.stdout.write("  🟢 All checks passed.\n\n");
		process.exit(0);
	} else {
		process.stdout.write(`  🔴 ${failures} check(s) not passing.\n\n`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("\nFatal:", err instanceof Error ? err.message : err);
	process.exit(1);
});
