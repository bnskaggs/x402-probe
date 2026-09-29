import { formatEther } from "viem";
import { ROLES, address, formatUsdc, publicClient, usdcBalance } from "../src/config.js";

for (const role of ROLES) {
  const who = address(role);
  const [usdc, eth] = await Promise.all([usdcBalance(who), publicClient.getBalance({ address: who })]);
  console.log(`${role.padEnd(9)} ${who}  USDC ${formatUsdc(usdc).padStart(12)}  ETH ${formatEther(eth)}`);
}
