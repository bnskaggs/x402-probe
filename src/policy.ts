import type { Decide, Decision } from "./buyer.js";

const refuse = (reason: string): Decision => ({ pay: false, reason });

export interface GuardConfig {
  /** Pay-to addresses per origin, configured out of band. Unknown origins are refused. */
  payTo: Record<string, string[]>;
  maxTimeoutSeconds: number;
  /** Cumulative cap on signed authorizations (exposure, not just settled spend). */
  budget: bigint;
}

export function guarded(cfg: GuardConfig): Decide {
  const pinned = new Map<string, bigint>();
  return ({ origin, path, requirements: r }, ledger) => {
    const allowed = cfg.payTo[origin];
    if (!allowed) return refuse(`no pay-to configured for ${origin}`);
    if (!allowed.some(a => a.toLowerCase() === r.payTo.toLowerCase())) {
      return refuse(`pay-to ${r.payTo} not allowed for ${origin}`);
    }

    if (r.maxTimeoutSeconds > cfg.maxTimeoutSeconds) {
      return refuse(`signature window ${r.maxTimeoutSeconds}s exceeds ${cfg.maxTimeoutSeconds}s`);
    }

    const now = Date.now() / 1000;
    const open = ledger.find(a => a.origin === origin && a.path === path && !a.delivered && a.validBefore > now);
    if (open) return refuse(`unresolved authorization ${open.nonce.slice(0, 10)} for ${path}; reconcile before paying again`);

    const key = origin + path;
    const amount = BigInt(r.amount);
    const pin = pinned.get(key);
    if (pin === undefined) pinned.set(key, amount);
    else if (amount > pin) return refuse(`price ${amount} above pinned ${pin} for ${path}`);

    const exposure = ledger.reduce((sum, a) => sum + a.amount, 0n);
    if (exposure + amount > cfg.budget) return refuse(`budget: ${exposure} signed + ${amount} > ${cfg.budget}`);

    return { pay: true };
  };
}
