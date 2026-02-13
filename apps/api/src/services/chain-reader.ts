import {
  createPublicClient,
  http,
  formatEther,
  type PublicClient,
} from "viem";
import { sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";
import { protectedVaultAbi } from "../lib/abi.js";
import { config } from "../lib/config.js";

// ─── Multi-chain RPC clients ──────────────────────────────────────────
// Provides read-only access to on-chain vault state across all chains.
// Event detection is handled by CRE DON — this module is only for
// on-demand reads (e.g., dashboard displaying vault balance/status).

const CHAIN_MAP = {
  "ethereum-sepolia": { chain: sepolia, rpc: config.rpc.sepolia },
  "arbitrum-sepolia": {
    chain: arbitrumSepolia,
    rpc: config.rpc.arbitrumSepolia,
  },
  "base-sepolia": { chain: baseSepolia, rpc: config.rpc.baseSepolia },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clients = new Map<string, any>();

export function getClient(chainKey: string) {
  let client = clients.get(chainKey);
  if (client) return client;

  const entry = CHAIN_MAP[chainKey as keyof typeof CHAIN_MAP];
  if (!entry) throw new Error(`Unknown chain: ${chainKey}`);

  client = createPublicClient({
    chain: entry.chain,
    transport: http(entry.rpc),
  });
  clients.set(chainKey, client);
  return client;
}

/**
 * Read on-chain vault state (balance, paused status, sentinel, owner).
 * Used by the API to serve dashboard requests — NOT for event detection.
 * Event detection is handled by CRE DON with consensus.
 */
export async function getVaultOnChainData(
  address: `0x${string}`,
  chain: string = "ethereum-sepolia",
) {
  try {
    const client = getClient(chain);
    const [balance, paused, sentinel, owner] = await Promise.all([
      client.readContract({
        address,
        abi: protectedVaultAbi,
        functionName: "getBalance",
      }),
      client.readContract({
        address,
        abi: protectedVaultAbi,
        functionName: "paused",
      }),
      client.readContract({
        address,
        abi: protectedVaultAbi,
        functionName: "sentinel",
      }),
      client.readContract({
        address,
        abi: protectedVaultAbi,
        functionName: "owner",
      }),
    ]);

    return {
      balance: balance.toString(),
      balanceEth: formatEther(balance),
      paused,
      sentinel,
      owner,
    };
  } catch (error) {
    console.error(
      `[ChainReader] Failed to read on-chain data for ${address} on ${chain}:`,
      error,
    );
    return null;
  }
}
