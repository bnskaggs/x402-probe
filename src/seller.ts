import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import express, { type RequestHandler } from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { FACILITATOR_URL, NETWORK, SELLER_PORT, address } from "./config.js";

export const QUOTES = [
  "Measure twice, pay once.",
  "A signature is a promise with a deadline.",
  "Budgets are features.",
];

// Rejects a second request carrying an authorization nonce already seen or in flight.
export function nonceLock(): RequestHandler {
  const seen = new Set<string>();
  return (req, res, next) => {
    const header = req.header("PAYMENT-SIGNATURE");
    if (!header) return next();
    let nonce: string | undefined;
    try {
      nonce = (decodePaymentSignatureHeader(header).payload as { authorization?: { nonce?: string } }).authorization?.nonce;
    } catch {
      return next();
    }
    if (!nonce) return next();
    if (seen.has(nonce)) {
      res.status(409).json({ error: "authorization already used" });
      return;
    }
    seen.add(nonce);
    next();
  };
}

export function startHonestSeller(opts: { port?: number; price?: string; lockNonces?: boolean } = {}) {
  const port = opts.port ?? SELLER_PORT;
  const stats = { handlerRuns: 0 };
  const app = express();

  app.get("/stats", (_req, res) => {
    res.json(stats);
  });
  if (opts.lockNonces) app.use(nonceLock());
  app.use(
    paymentMiddleware(
      {
        "GET /quote": {
          accepts: { scheme: "exact", price: opts.price ?? "$0.01", network: NETWORK, payTo: address("SELLER") },
          description: "One quote",
          mimeType: "application/json",
        },
      },
      new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL })).register(
        NETWORK,
        new ExactEvmScheme(),
      ),
    ),
  );
  app.get("/quote", (_req, res) => {
    stats.handlerRuns++;
    res.json({ quote: QUOTES[stats.handlerRuns % QUOTES.length], servedAt: new Date().toISOString() });
  });

  return new Promise<{ server: Server; stats: typeof stats; url: string }>(resolve => {
    const server = app.listen(port, () => resolve({ server, stats, url: `http://localhost:${port}` }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await startHonestSeller();
  console.log(`honest seller on ${url}/quote, pays to ${address("SELLER")}`);
}
