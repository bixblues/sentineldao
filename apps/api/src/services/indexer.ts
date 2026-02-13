import {
  createPublicClient,
  http,
  formatEther,
  decodeEventLog,
  type Log,
  type PublicClient,
} from "viem";
import { sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";
import { db } from "../db/index.js";
import { events, vaults } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { protectedVaultAbi } from "../lib/abi.js";
import { config } from "../lib/config.js";
import { wsManager } from "../lib/ws.js";
import { threatEngine } from "./threat-engine.js";
import { randomUUID } from "crypto";

// ─── Multi-chain clients ──────────────────────────────────────────────
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

function getClient(chainKey: string) {
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

// Track polling intervals so we can stop them
const pollingIntervals: ReturnType<typeof setInterval>[] = [];

// Track last processed block per vault to avoid duplicates
const lastProcessedBlock = new Map<string, bigint>();

// Block ranges for getLogs — Alchemy free tier: 10 blocks on L2, ~2000 on L1
const MAX_BLOCK_RANGE: Record<string, bigint> = {
  "ethereum-sepolia": 2000n,
  "arbitrum-sepolia": 10n,
  "base-sepolia": 10n,
};

// Poll intervals — L2s poll fast to keep up with rapid block production
const POLL_INTERVALS: Record<string, number> = {
  "ethereum-sepolia": 12_000,
  "arbitrum-sepolia": 3_000,
  "base-sepolia": 3_000,
};

// Max getLogs chunks per poll tick
// L2 at 10 blocks/chunk × 50 chunks = 500 blocks/tick, every 3s
const MAX_CHUNKS_PER_TICK = 50;

// If we fall more than this many blocks behind, skip ahead to near-tip
// (Arb produces ~240 blocks/min, so 5000 = ~20 min of history)
const MAX_BLOCKS_BEHIND: Record<string, bigint> = {
  "ethereum-sepolia": 5000n,
  "arbitrum-sepolia": 5000n,
  "base-sepolia": 5000n,
};

export async function startIndexer() {
  // Monitor ALL vaults regardless of status — we need to detect events
  // even on paused vaults (unpause events, CCIP-triggered pauses, etc.)
  const activeVaults = await db.query.vaults.findMany();

  if (activeVaults.length === 0) {
    console.log("[Indexer] No vaults to monitor");
    return;
  }

  for (let i = 0; i < activeVaults.length; i++) {
    const vault = activeVaults[i];
    try {
      const client = getClient(vault.chain);
      const currentBlock = await client.getBlockNumber();
      lastProcessedBlock.set(`${vault.address}:${vault.chain}`, currentBlock);
      // Stagger start by 2s per vault to spread RPC load
      setTimeout(() => {
        startPolling(vault.address as `0x${string}`, vault.id, vault.chain);
      }, i * 2000);
      console.log(
        `[Indexer] Watching vault: ${vault.name} (${vault.address}) on ${vault.chain} from block ${currentBlock}`,
      );
    } catch (err: any) {
      console.warn(
        `[Indexer] Failed to start polling for ${vault.name} on ${vault.chain}: ${err.message?.slice(0, 100)}`,
      );
    }
  }

  console.log(
    `[Indexer] Monitoring ${activeVaults.length} vault(s) across ${new Set(activeVaults.map((v) => v.chain)).size} chain(s)`,
  );
}

function startPolling(address: `0x${string}`, vaultId: string, chain: string) {
  const client = getClient(chain);
  const maxRange = MAX_BLOCK_RANGE[chain] ?? 10n;
  const pollInterval = POLL_INTERVALS[chain] ?? 12_000;

  const interval = setInterval(async () => {
    try {
      const trackingKey = `${address}:${chain}`;
      let fromBlock = (lastProcessedBlock.get(trackingKey) ?? 0n) + 1n;
      const currentBlock = await client.getBlockNumber();

      if (currentBlock < fromBlock) return;

      // If too far behind, skip ahead to near chain tip
      const maxBehind = MAX_BLOCKS_BEHIND[chain] ?? 5000n;
      if (currentBlock - fromBlock > maxBehind) {
        const skipTo = currentBlock - 100n;
        console.log(
          `[Indexer] ${chain}: ${currentBlock - fromBlock} blocks behind, skipping to block ${skipTo}`,
        );
        fromBlock = skipTo;
        lastProcessedBlock.set(trackingKey, skipTo - 1n);
      }

      // Chunk into maxRange-sized batches to respect RPC limits
      let chunkStart = fromBlock;
      let chunksProcessed = 0;

      while (
        chunkStart <= currentBlock &&
        chunksProcessed < MAX_CHUNKS_PER_TICK
      ) {
        const chunkEnd =
          chunkStart + maxRange - 1n > currentBlock
            ? currentBlock
            : chunkStart + maxRange - 1n;

        const logs = await client.getLogs({
          address,
          fromBlock: chunkStart,
          toBlock: chunkEnd,
        });

        for (const log of logs) {
          try {
            const decoded = decodeEventLog({
              abi: protectedVaultAbi,
              data: log.data,
              topics: log.topics,
            });

            switch (decoded.eventName) {
              case "Deposit":
                await handleDepositEvent(log, decoded.args, vaultId, chain);
                break;
              case "Withdrawal":
                await handleWithdrawalEvent(log, decoded.args, vaultId, chain);
                break;
              case "EmergencyPause":
                await handlePauseEvent(log, decoded.args, vaultId, chain);
                break;
              case "SentinelUpdated":
                console.log(
                  `[Indexer] SentinelUpdated event on ${address} (${chain})`,
                );
                break;
            }
          } catch (decodeErr: any) {
            // Skip logs we can't decode (not our events)
          }
        }

        // Save progress per chunk so 429s don't lose work
        lastProcessedBlock.set(trackingKey, chunkEnd);
        chunkStart = chunkEnd + 1n;
        chunksProcessed++;
      }
    } catch (err: any) {
      console.warn(
        `[Indexer] Poll error for ${address} (${chain}): ${err.message?.slice(0, 100)}`,
      );
    }
  }, pollInterval);

  pollingIntervals.push(interval);
}

async function handleDepositEvent(
  log: Log,
  args: any,
  vaultId: string,
  chain: string,
) {
  const amountWei = args?.amount?.toString() || "0";
  const amountEth = Number(formatEther(BigInt(amountWei)));
  const from = args?.from || "unknown";

  console.log(`[Indexer] Deposit: ${amountEth} ETH from ${from}`);

  const eventRecord = {
    id: randomUUID(),
    vaultId,
    type: "deposit" as const,
    txHash: log.transactionHash || "",
    blockNumber: Number(log.blockNumber || 0),
    fromAddress: from,
    toAddress: log.address,
    amount: amountWei,
    amountEth,
    chain,
  };

  await db.insert(events).values(eventRecord);

  // Broadcast to dashboard
  wsManager.broadcast("new_event", {
    ...eventRecord,
    vaultId,
    timestamp: new Date().toISOString(),
  });

  // Run through threat engine
  await threatEngine.analyze(eventRecord, vaultId);
}

async function handleWithdrawalEvent(
  log: Log,
  args: any,
  vaultId: string,
  chain: string,
) {
  const amountWei = args?.amount?.toString() || "0";
  const amountEth = Number(formatEther(BigInt(amountWei)));
  const to = args?.to || "unknown";

  console.log(`[Indexer] Withdrawal: ${amountEth} ETH to ${to}`);

  const eventRecord = {
    id: randomUUID(),
    vaultId,
    type: "withdrawal" as const,
    txHash: log.transactionHash || "",
    blockNumber: Number(log.blockNumber || 0),
    fromAddress: log.address,
    toAddress: to,
    amount: amountWei,
    amountEth,
    chain,
  };

  await db.insert(events).values(eventRecord);

  wsManager.broadcast("new_event", {
    ...eventRecord,
    vaultId,
    timestamp: new Date().toISOString(),
  });

  await threatEngine.analyze(eventRecord, vaultId);
}

async function handlePauseEvent(
  log: Log,
  args: any,
  vaultId: string,
  chain: string,
) {
  const triggeredBy = args?.triggeredBy || "unknown";

  console.log(`[Indexer] EmergencyPause triggered by ${triggeredBy}`);

  const eventRecord = {
    id: randomUUID(),
    vaultId,
    type: "pause" as const,
    txHash: log.transactionHash || "",
    blockNumber: Number(log.blockNumber || 0),
    fromAddress: triggeredBy,
    toAddress: null,
    amount: null,
    amountEth: null,
    chain,
  };

  await db.insert(events).values(eventRecord);

  // Update vault status
  await db
    .update(vaults)
    .set({ status: "paused" })
    .where(eq(vaults.id, vaultId));

  wsManager.broadcast("new_event", {
    ...eventRecord,
    vaultId,
    timestamp: new Date().toISOString(),
  });

  wsManager.broadcast("vault_status_change", { vaultId, status: "paused" });

  // Run through threat engine (was missing — pause events were never analyzed)
  await threatEngine.analyze(eventRecord, vaultId);
}

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
      `[Indexer] Failed to read on-chain data for ${address} on ${chain}:`,
      error,
    );
    return null;
  }
}

// Export getClient for use by other services (defense executor, simulate)
export { getClient };

export function stopIndexer() {
  for (const interval of pollingIntervals) {
    clearInterval(interval);
  }
  pollingIntervals.length = 0;
  lastProcessedBlock.clear();
  console.log("[Indexer] Stopped all watchers");
}
