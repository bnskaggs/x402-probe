import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ROLES, WALLET_ENV_PATH } from "../src/config.js";

// Prints addresses only. Private keys go to the machine-local env file and nowhere else.
if (existsSync(WALLET_ENV_PATH)) {
  console.error(`Refusing to overwrite existing wallet file: ${WALLET_ENV_PATH}`);
  console.error("Delete it by hand if you really want fresh wallets (any testnet funds on the old ones are lost).");
  process.exit(1);
}

const lines = [
  "# x402-probe testnet wallets. Base Sepolia only. Never fund with real assets.",
  `# Generated ${new Date().toISOString()}`,
];
const addresses: Record<string, string> = {};
for (const role of ROLES) {
  const key = generatePrivateKey();
  const addr = privateKeyToAccount(key).address;
  addresses[role] = addr;
  lines.push(`${role}_PRIVATE_KEY=${key}`, `${role}_ADDRESS=${addr}`);
}

mkdirSync(dirname(WALLET_ENV_PATH), { recursive: true });
writeFileSync(WALLET_ENV_PATH, lines.join("\n") + "\n", { mode: 0o600 });

console.log(`Wrote ${WALLET_ENV_PATH}`);
for (const [role, addr] of Object.entries(addresses)) {
  console.log(`${role.padEnd(9)} ${addr}`);
}
