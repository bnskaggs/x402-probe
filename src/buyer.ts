import { pathToFileURL } from "node:url";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import type { PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { NETWORK, SELLER_URL, privateKey } from "./config.js";

export interface SignedAuthorization {
  origin: string;
  path: string;
  amount: bigint;
  payTo: string;
  nonce: string;
  validBefore: number;
  signedAt: number;
  delivered: boolean;
}

export interface PaymentTerms {
  /** Where the buyer actually sent the request. The 402's own `resource.url` is seller-supplied. */
  origin: string;
  path: string;
  requirements: PaymentRequirements;
  paymentRequired: PaymentRequired;
}

export type Decision = { pay: true } | { pay: false; reason: string };
export type Decide = (terms: PaymentTerms, ledger: readonly SignedAuthorization[]) => Decision | Promise<Decision>;

export const alwaysPay: Decide = () => ({ pay: true });

export interface Attempt {
  ok: boolean;
  status: number;
  body?: string;
  error?: string;
  signed: number;
  settle?: SettleResponse;
}

export function createBuyer(opts: { decide?: Decide } = {}) {
  const decide = opts.decide ?? alwaysPay;
  const account = privateKeyToAccount(privateKey("BUYER"));
  const client = new x402Client().register(NETWORK, new ExactEvmScheme(account));
  const ledger: SignedAuthorization[] = [];
  const refusals: string[] = [];
  let current: { origin: string; path: string } | undefined;

  client.onBeforePaymentCreation(async ctx => {
    if (!current) throw new Error("payment requested outside buyer.get()");
    const decision = await decide(
      { ...current, requirements: ctx.selectedRequirements, paymentRequired: ctx.paymentRequired },
      ledger,
    );
    if (!decision.pay) {
      refusals.push(decision.reason);
      return { abort: true, reason: decision.reason };
    }
  });

  client.onAfterPaymentCreation(async ctx => {
    const auth = (ctx.paymentPayload.payload as { authorization: Record<string, string> }).authorization;
    ledger.push({
      origin: current!.origin,
      path: current!.path,
      amount: BigInt(auth.value),
      payTo: auth.to,
      nonce: auth.nonce,
      validBefore: Number(auth.validBefore),
      signedAt: Date.now(),
      delivered: false,
    });
  });

  const paidFetch = wrapFetchWithPayment(fetch, client);

  async function get(url: string): Promise<Attempt> {
    const u = new URL(url);
    current = { origin: u.origin, path: u.pathname };
    const before = ledger.length;
    try {
      const res = await paidFetch(url);
      const body = await res.text();
      const signed = ledger.length - before;
      const header = res.headers.get("PAYMENT-RESPONSE");
      const settle = header ? decodePaymentResponseHeader(header) : undefined;
      if (res.ok && signed > 0) ledger[ledger.length - 1].delivered = true;
      return { ok: res.ok, status: res.status, body, signed, settle };
    } catch (err) {
      return { ok: false, status: 0, error: (err as Error).message, signed: ledger.length - before };
    } finally {
      current = undefined;
    }
  }

  return { get, ledger, refusals, client, address: account.address };
}

export type Buyer = ReturnType<typeof createBuyer>;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { withRetry } = await import("./retry.js");
  const { snapshot, settledSnapshot, writeReceipt } = await import("./receipts.js");
  const buyer = createBuyer();
  const url = `${SELLER_URL}/quote`;
  const before = await snapshot();
  const { result, attempts } = await withRetry(() => buyer.get(url), 3);
  const after = await settledSnapshot(before);
  console.log(`status ${result.status}  attempts ${attempts}  signed ${buyer.ledger.length}`);
  console.log(result.body ?? result.error);
  if (result.settle) console.log(`tx https://sepolia.basescan.org/tx/${result.settle.transaction}`);
  await writeReceipt({ attack: "loop", variant: "naive", before, after, buyer, extra: { attempts, result } });
}
