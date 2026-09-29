import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Buyer } from "./buyer.js";
import { ROLES, address, formatUsdc, usdcBalance, type Role } from "./config.js";

export type Snapshot = Record<Role, bigint>;

export async function snapshot(): Promise<Snapshot> {
  const entries = await Promise.all(ROLES.map(async r => [r, await usdcBalance(address(r))] as const));
  return Object.fromEntries(entries) as Snapshot;
}

function same(a: Snapshot, b: Snapshot): boolean {
  return ROLES.every(r => a[r] === b[r]);
}

/**
 * Public RPC nodes lag. Poll until two consecutive reads agree, and until the
 * snapshot differs from `before` if `expectChange`, or the timeout passes.
 */
export async function settledSnapshot(before: Snapshot, opts: { expectChange?: boolean; timeoutMs?: number } = {}) {
  const { expectChange = true, timeoutMs = 30_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  let prev = await snapshot();
  for (;;) {
    await new Promise(r => setTimeout(r, 2_000));
    const next = await snapshot();
    const stable = same(prev, next);
    const changed = !same(before, next);
    if ((stable && (changed || !expectChange)) || Date.now() > deadline) return next;
    prev = next;
  }
}

export function delta(before: Snapshot, after: Snapshot): Record<Role, string> {
  return Object.fromEntries(ROLES.map(r => [r, formatUsdc(after[r] - before[r])])) as Record<Role, string>;
}

const jsonSafe = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export type Variant = "naive" | "mitigated" | "llm";

export async function writeReceipt(r: {
  attack: string;
  variant: Variant;
  before: Snapshot;
  after: Snapshot;
  buyer: Buyer;
  extra?: Record<string, unknown>;
}) {
  const record = {
    at: new Date().toISOString(),
    attack: r.attack,
    variant: r.variant,
    delta: delta(r.before, r.after),
    before: r.before,
    after: r.after,
    signed: r.buyer.ledger.length,
    delivered: r.buyer.ledger.filter(a => a.delivered).length,
    refusals: r.buyer.refusals,
    ledger: r.buyer.ledger,
    ...r.extra,
  };
  mkdirSync("runs", { recursive: true });
  const file = join("runs", `${record.at.slice(0, 10)}.jsonl`);
  appendFileSync(file, JSON.stringify(record, jsonSafe) + "\n");
  console.log(`receipt -> ${file}`);
  console.log(`delta   ${JSON.stringify(record.delta)}`);
  return record;
}
