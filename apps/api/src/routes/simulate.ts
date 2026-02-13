import { Hono } from "hono";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";
import { config } from "../lib/config.js";
import { protectedVaultAbi } from "../lib/abi.js";
import { db } from "../db/index.js";
import { vaults } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { wsManager } from "../lib/ws.js";
import { creRunner } from "../services/cre-runner.js";

const app = new Hono();

// Chain definitions for multi-chain support
const CHAINS: Record<string, { chain: any; rpc: string }> = {
  "ethereum-sepolia": { chain: sepolia, rpc: config.rpc.sepolia },
  "arbitrum-sepolia": {
    chain: arbitrumSepolia,
    rpc: config.rpc.arbitrumSepolia,
  },
  "base-sepolia": { chain: baseSepolia, rpc: config.rpc.baseSepolia },
};

function getClients(chainKey: string) {
  const entry = CHAINS[chainKey];
  if (!entry || !config.privateKey) return null;

  const account = privateKeyToAccount(config.privateKey);
  const walletClient = createWalletClient({
    account,
    chain: entry.chain,
    transport: http(entry.rpc),
  });
  const publicClient = createPublicClient({
    chain: entry.chain,
    transport: http(entry.rpc),
  });
  return { walletClient, publicClient, account, chain: entry.chain };
}

// POST /api/simulate/attack — simulate an attack scenario
app.post("/attack", async (c) => {
  const body = await c.req.json();
  const { type, vaultId } = body;

  if (!config.privateKey) {
    return c.json(
      { error: "No private key configured — cannot simulate" },
      503,
    );
  }

  // Find the vault
  const vault = vaultId
    ? await db.query.vaults.findFirst({ where: eq(vaults.id, vaultId) })
    : await db.query.vaults.findFirst(); // default to first vault

  if (!vault) {
    return c.json({ error: "No vault found to simulate against" }, 404);
  }

  const clients = getClients(vault.chain);
  if (!clients) {
    return c.json(
      { error: `Chain ${vault.chain} not supported for simulation` },
      400,
    );
  }

  const { walletClient, publicClient, account, chain: clientChain } = clients;
  const vaultAddress = vault.address as `0x${string}`;

  // Broadcast simulation start
  wsManager.broadcast("simulation_started", {
    type,
    vaultId: vault.id,
    vaultName: vault.name,
    chain: vault.chain,
    timestamp: new Date().toISOString(),
  });

  // Helper: auto-unpause vault if it's currently paused (needed for deposit/withdraw sims)
  async function ensureUnpaused() {
    try {
      const paused = await publicClient.readContract({
        address: vaultAddress,
        abi: protectedVaultAbi,
        functionName: "paused",
      });
      if (paused) {
        wsManager.broadcast("simulation_step", {
          step: 0,
          total: 0,
          message: "Vault is paused — auto-unpausing before simulation...",
        });
        const unpauseTx = await walletClient.writeContract({
          chain: clientChain,
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "unpause",
        });
        await publicClient.waitForTransactionReceipt({
          hash: unpauseTx,
          timeout: 60_000,
        });
        // Update DB status
        await db
          .update(vaults)
          .set({ status: "monitoring", updatedAt: new Date() })
          .where(eq(vaults.id, vault!.id));
        wsManager.broadcast("simulation_step", {
          step: 0,
          total: 0,
          message: "Vault unpaused successfully. Proceeding with simulation...",
        });
      }
    } catch (err: any) {
      console.warn(
        `[Simulate] Failed to auto-unpause: ${err.message?.slice(0, 100)}`,
      );
    }
  }

  try {
    switch (type) {
      case "large_deposit": {
        await ensureUnpaused();
        // Single large deposit above threshold to trigger large_transfer alert
        const amount = parseEther(
          String(Math.max((vault.alertThresholdEth || 0.1) * 2, 0.01)),
        );
        const amountEth = formatEther(amount);

        wsManager.broadcast("simulation_step", {
          step: 1,
          total: 3,
          message: `Sending ${amountEth} ETH deposit to vault...`,
        });

        const txHash = await walletClient.writeContract({
          chain: clientChain,
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "deposit",
          value: amount,
        });

        wsManager.broadcast("simulation_step", {
          step: 2,
          total: 3,
          message: `Transaction sent: ${txHash.slice(0, 14)}... Waiting for confirmation...`,
          txHash,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 60_000,
        });

        wsManager.broadcast("simulation_step", {
          step: 3,
          total: 3,
          message: `Deposit confirmed in block ${receipt.blockNumber}. Triggering CRE workflow...`,
          txHash,
          blockNumber: Number(receipt.blockNumber),
        });

        return c.json({
          success: true,
          type: "large_deposit",
          txHash,
          amount: amountEth,
          blockNumber: Number(receipt.blockNumber),
          message: `Deposited ${amountEth} ETH (above ${vault.alertThresholdEth} threshold). CRE workflow will detect and analyze this event.`,
          creSimulation: triggerCRESimulation(txHash, "deposit"),
        });
      }

      case "rapid_transactions": {
        await ensureUnpaused();
        // Multiple rapid small deposits to trigger rapid_transactions alert
        const count = body.count || 6;
        const amount = parseEther("0.001");
        const txHashes: string[] = [];

        // Get current nonce to fire all txs in parallel
        let nonce = await publicClient.getTransactionCount({
          address: account.address,
        });

        wsManager.broadcast("simulation_step", {
          step: 1,
          total: 3,
          message: `Sending ${count} rapid deposits in parallel...`,
        });

        // Fire all transactions without waiting for confirmation (parallel send)
        for (let i = 0; i < count; i++) {
          const txHash = await walletClient.writeContract({
            chain: clientChain,
            address: vaultAddress,
            abi: protectedVaultAbi,
            functionName: "deposit",
            value: amount,
            nonce: nonce + i,
          });
          txHashes.push(txHash);
        }

        wsManager.broadcast("simulation_step", {
          step: 2,
          total: 3,
          message: `All ${count} transactions sent. Waiting for confirmations...`,
        });

        // Wait for all confirmations in parallel
        await Promise.all(
          txHashes.map((hash) =>
            publicClient.waitForTransactionReceipt({
              hash: hash as `0x${string}`,
              timeout: 120_000,
            }),
          ),
        );

        wsManager.broadcast("simulation_step", {
          step: 3,
          total: 3,
          message: `All ${count} transactions confirmed. CRE workflow will detect the rapid transaction pattern.`,
        });

        return c.json({
          success: true,
          type: "rapid_transactions",
          txHashes,
          count,
          message: `Sent ${count} rapid deposits in quick succession. CRE workflow will detect the rapid transaction pattern.`,
          creSimulation: triggerCRESimulation(
            txHashes[txHashes.length - 1],
            "deposit",
          ),
        });
      }

      case "withdrawal": {
        await ensureUnpaused();
        // Withdraw from vault (if there's balance)
        const balance = await publicClient.readContract({
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "getBalance",
        });

        if (balance === 0n) {
          return c.json({ error: "Vault has no balance to withdraw" }, 400);
        }

        const withdrawAmount =
          balance > parseEther("0.01") ? parseEther("0.01") : balance;

        wsManager.broadcast("simulation_step", {
          step: 1,
          total: 2,
          message: `Withdrawing ${formatEther(withdrawAmount)} ETH from vault...`,
        });

        const txHash = await walletClient.writeContract({
          chain: clientChain,
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "withdraw",
          args: [withdrawAmount],
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 60_000,
        });

        wsManager.broadcast("simulation_step", {
          step: 2,
          total: 2,
          message: `Withdrawal confirmed in block ${receipt.blockNumber}.`,
          txHash,
        });

        return c.json({
          success: true,
          type: "withdrawal",
          txHash,
          amount: formatEther(withdrawAmount),
          message: `Withdrew ${formatEther(withdrawAmount)} ETH from vault.`,
        });
      }

      case "flash_loan": {
        await ensureUnpaused();
        // Simulate flash loan: large deposit immediately followed by withdrawal of similar size
        const flashAmount = parseEther(
          String(Math.max((vault.alertThresholdEth || 0.1) * 3, 0.05)),
        );
        const flashAmountEth = formatEther(flashAmount);

        wsManager.broadcast("simulation_step", {
          step: 1,
          total: 4,
          message: `Flash loan simulation: depositing ${flashAmountEth} ETH...`,
        });

        const depositHash = await walletClient.writeContract({
          chain: clientChain,
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "deposit",
          value: flashAmount,
        });

        const depositReceipt = await publicClient.waitForTransactionReceipt({
          hash: depositHash,
          timeout: 60_000,
        });

        wsManager.broadcast("simulation_step", {
          step: 2,
          total: 4,
          message: `Deposit confirmed in block ${depositReceipt.blockNumber}. Now withdrawing same amount...`,
          txHash: depositHash,
        });

        // Withdraw immediately — same amount to mimic flash loan
        const withdrawHash = await walletClient.writeContract({
          chain: clientChain,
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "withdraw",
          args: [flashAmount],
        });

        wsManager.broadcast("simulation_step", {
          step: 3,
          total: 4,
          message: `Withdrawal sent. Waiting for confirmation...`,
          txHash: withdrawHash,
        });

        const withdrawReceipt = await publicClient.waitForTransactionReceipt({
          hash: withdrawHash,
          timeout: 60_000,
        });

        const blockGap =
          Number(withdrawReceipt.blockNumber) -
          Number(depositReceipt.blockNumber);

        wsManager.broadcast("simulation_step", {
          step: 4,
          total: 4,
          message: `Flash loan complete: deposit block ${depositReceipt.blockNumber}, withdrawal block ${withdrawReceipt.blockNumber} (${blockGap} block gap). CRE workflow will detect the pattern.`,
        });

        return c.json({
          success: true,
          type: "flash_loan",
          depositTxHash: depositHash,
          withdrawTxHash: withdrawHash,
          txHash: withdrawHash,
          amount: flashAmountEth,
          blockGap,
          message: `Flash loan simulated: ${flashAmountEth} ETH deposited and withdrawn within ${blockGap} block(s). CRE workflow will detect the flash loan pattern.`,
          creSimulation: triggerCRESimulation(withdrawHash, "withdrawal"),
        });
      }

      case "tvl_drain": {
        await ensureUnpaused();
        // Withdraw a large percentage of the vault's TVL to trigger TVL drain detection
        const vaultBalance = await publicClient.readContract({
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "getBalance",
        });

        if (vaultBalance === 0n) {
          // Deposit first, then drain
          const seedAmount = parseEther("0.05");
          wsManager.broadcast("simulation_step", {
            step: 1,
            total: 3,
            message: `Vault empty. Seeding with ${formatEther(seedAmount)} ETH first...`,
          });

          const seedHash = await walletClient.writeContract({
            chain: clientChain,
            address: vaultAddress,
            abi: protectedVaultAbi,
            functionName: "deposit",
            value: seedAmount,
          });
          await publicClient.waitForTransactionReceipt({
            hash: seedHash,
            timeout: 60_000,
          });
        } else {
          wsManager.broadcast("simulation_step", {
            step: 1,
            total: 3,
            message: `Vault balance: ${formatEther(vaultBalance)} ETH. Preparing drain...`,
          });
        }

        // Read updated balance
        const currentBalance = (await publicClient.readContract({
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "getBalance",
        })) as bigint;

        // Withdraw 50%+ of TVL to trigger the 30% threshold
        const drainAmount =
          currentBalance > parseEther("0.01")
            ? (currentBalance * 60n) / 100n // 60% drain
            : currentBalance;

        wsManager.broadcast("simulation_step", {
          step: 2,
          total: 3,
          message: `Draining ${formatEther(drainAmount)} ETH (${((Number(drainAmount) / Number(currentBalance)) * 100).toFixed(0)}% of vault TVL)...`,
        });

        const drainHash = await walletClient.writeContract({
          chain: clientChain,
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "withdraw",
          args: [drainAmount],
        });

        const drainReceipt = await publicClient.waitForTransactionReceipt({
          hash: drainHash,
          timeout: 60_000,
        });

        wsManager.broadcast("simulation_step", {
          step: 3,
          total: 3,
          message: `TVL drain confirmed in block ${drainReceipt.blockNumber}. CRE workflow will flag the TVL drain pattern.`,
          txHash: drainHash,
        });

        return c.json({
          success: true,
          type: "tvl_drain",
          txHash: drainHash,
          amount: formatEther(drainAmount),
          message: `Drained ${formatEther(drainAmount)} ETH from vault. CRE workflow will detect the TVL drain pattern.`,
          creSimulation: triggerCRESimulation(drainHash, "withdrawal"),
        });
      }

      case "unauthorized_pause": {
        // Ensure vault is unpaused first so we can trigger a fresh EmergencyPause
        await ensureUnpaused();

        wsManager.broadcast("simulation_step", {
          step: 1,
          total: 2,
          message: `Triggering emergency pause on vault...`,
        });

        const pauseHash = await walletClient.writeContract({
          chain: clientChain,
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "emergencyPause",
        });

        const pauseReceipt = await publicClient.waitForTransactionReceipt({
          hash: pauseHash,
          timeout: 60_000,
        });

        wsManager.broadcast("simulation_step", {
          step: 2,
          total: 2,
          message: `Emergency pause confirmed in block ${pauseReceipt.blockNumber}. CRE workflow will flag the unauthorized access.`,
          txHash: pauseHash,
        });

        return c.json({
          success: true,
          type: "unauthorized_pause",
          txHash: pauseHash,
          message: `Emergency pause triggered on vault. CRE workflow will detect this as an unauthorized access event.`,
          creSimulation: triggerCRESimulation(pauseHash, "pause"),
        });
      }

      default:
        return c.json(
          {
            error: `Unknown attack type: ${type}. Supported: large_deposit, rapid_transactions, flash_loan, tvl_drain, unauthorized_pause, withdrawal`,
          },
          400,
        );
    }
  } catch (error: any) {
    wsManager.broadcast("simulation_error", {
      type,
      error: error?.message || "Unknown error",
    });
    return c.json({ error: error?.message || "Simulation failed" }, 500);
  }
});

// GET /api/simulate/balance — check deployer wallet balance across all chains
app.get("/balance", async (c) => {
  if (!config.privateKey) {
    return c.json({ error: "No private key configured" }, 503);
  }

  const account = privateKeyToAccount(config.privateKey);

  const balances = await Promise.all(
    Object.entries(CHAINS).map(async ([chainKey, entry]) => {
      try {
        const publicClient = createPublicClient({
          chain: entry.chain,
          transport: http(entry.rpc),
        });
        const bal = await publicClient.getBalance({ address: account.address });
        return { chain: chainKey, balance: formatEther(bal) };
      } catch {
        return { chain: chainKey, balance: "0" };
      }
    }),
  );

  // Total across all chains
  const totalEth = balances.reduce((sum, b) => sum + Number(b.balance), 0);

  return c.json({
    address: account.address,
    balance: totalEth.toFixed(6),
    balances,
    chain: "multi-chain",
  });
});

// ─── CRE Simulation Helper ──────────────────────────────────────────
// Fire-and-forget: triggers CRE workflow simulation for a transaction.
// Returns immediately with a tracking status; the CRE simulation runs
// in the background and delivers results via the webhook.
function triggerCRESimulation(txHash: string, eventType: string): string {
  // Fire and forget — don't await
  creRunner.simulate(txHash, eventType).catch((err) => {
    console.error(`[CRE Runner] Background simulation failed: ${err}`);
  });
  return "triggered";
}

// POST /api/simulate/cre — manually trigger CRE simulation for a tx hash
app.post("/cre", async (c) => {
  const body = await c.req.json();
  const { txHash, eventType, eventIndex } = body;

  if (!txHash) {
    return c.json({ error: "txHash is required" }, 400);
  }

  const validTypes = ["deposit", "withdrawal", "pause"];
  if (!validTypes.includes(eventType || "deposit")) {
    return c.json(
      { error: `Invalid eventType. Supported: ${validTypes.join(", ")}` },
      400,
    );
  }

  const result = await creRunner.simulate(
    txHash,
    eventType || "deposit",
    eventIndex || 0,
  );

  return c.json({
    success: result.success,
    duration: result.duration,
    output: result.output.slice(0, 2000),
    error: result.error,
  });
});

// GET /api/simulate/cre-status — check CRE CLI availability
app.get("/cre-status", async (c) => {
  const version = await creRunner.getVersion();
  return c.json({
    available: version !== "not installed",
    version,
    workflowDir: "packages/cre-workflows/sentinel-defense",
  });
});

export default app;
