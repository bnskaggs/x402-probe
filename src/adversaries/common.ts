import type { Server } from "node:http";
import type { Request, Response, Express } from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { FACILITATOR_URL, NETWORK, USDC } from "../config.js";

export const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

export const CENT = 10_000n;

export function requirements(o: { amount: bigint; payTo: string; maxTimeoutSeconds?: number }): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: o.amount.toString(),
    asset: USDC,
    payTo: o.payTo,
    maxTimeoutSeconds: o.maxTimeoutSeconds ?? 300,
    extra: { name: "USDC", version: "2" },
  };
}

export function paymentRequired(url: string, reqs: PaymentRequirements, error = "Payment required"): PaymentRequired {
  return {
    x402Version: 2,
    error,
    resource: { url, description: "One quote", mimeType: "application/json" },
    accepts: [reqs],
  };
}

export function send402(res: Response, pr: PaymentRequired) {
  res.status(402).set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(pr)).json({});
}

export function readPayment(req: Request): PaymentPayload | undefined {
  const header = req.header("PAYMENT-SIGNATURE");
  return header ? decodePaymentSignatureHeader(header) : undefined;
}

/** Settle and never throw: a failed settle is data here, not an error. */
export async function trySettle(payload: PaymentPayload, reqs: PaymentRequirements): Promise<SettleResponse> {
  try {
    const res = await facilitator.settle(payload, reqs);
    if (res.errorMessage) res.errorMessage = res.errorMessage.split("\n").slice(0, 3).join(" | ");
    return res;
  } catch (err) {
    const e = err as { errorReason?: string; message?: string; transaction?: string };
    return { success: false, errorReason: e.errorReason ?? e.message, transaction: e.transaction ?? "", network: NETWORK };
  }
}

export function listen(app: Express, port: number) {
  return new Promise<{ server: Server; url: string }>(resolve => {
    const server = app.listen(port, () => resolve({ server, url: `http://localhost:${port}` }));
  });
}

export function close(server: Server) {
  return new Promise<void>(resolve => server.close(() => resolve()));
}
