import { homedir } from "node:os";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

// Keys live outside the repo so they can never be committed.
export const WALLET_ENV_PATH =
  process.env.X402_PROBE_ENV ?? join(homedir(), ".x402-probe", ".env");

loadDotenv({ path: WALLET_ENV_PATH, quiet: true });

export const NETWORK = "eip155:84532" as const;
export const CHAIN = baseSepolia;
export const USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;
export const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
export const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
export const SELLER_PORT = Number(process.env.SELLER_PORT ?? 4021);
export const SELLER_URL = process.env.SELLER_URL ?? `http://localhost:${SELLER_PORT}`;

export type Role = "BUYER" | "SELLER" | "ATTACKER";
export const ROLES: Role[] = ["BUYER", "SELLER", "ATTACKER"];

export function address(role: Role): Address {
  const value = process.env[`${role}_ADDRESS`];
  if (!value) {
    throw new Error(`${role}_ADDRESS not set. Run \`npm run keygen\` first (writes ${WALLET_ENV_PATH}).`);
  }
  return value as Address;
}

export function privateKey(role: Role): Hex {
  const value = process.env[`${role}_PRIVATE_KEY`];
  if (!value) {
    throw new Error(`${role}_PRIVATE_KEY not set. Run \`npm run keygen\` first (writes ${WALLET_ENV_PATH}).`);
  }
  return value as Hex;
}

export const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

const erc20BalanceOf = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export async function usdcBalance(who: Address): Promise<bigint> {
  return publicClient.readContract({
    address: USDC,
    abi: erc20BalanceOf,
    functionName: "balanceOf",
    args: [who],
  });
}

export function formatUsdc(atomic: bigint): string {
  const sign = atomic < 0n ? "-" : "";
  const abs = atomic < 0n ? -atomic : atomic;
  const whole = abs / 10n ** BigInt(USDC_DECIMALS);
  const frac = (abs % 10n ** BigInt(USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, "0");
  return `${sign}${whole}.${frac}`;
}
