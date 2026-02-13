import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  type Hash,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { protectedVaultAbi, ccipSenderAbi } from "../lib/abi.js";
import { config } from "../lib/config.js";

// ─── Chain definitions ──────────────────────────────────────────────
const arbitrumSepolia: Chain = {
  id: 421614,
  name: "Arbitrum Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpc.arbitrumSepolia] },
  },
  testnet: true,
};

const baseSepolia: Chain = {
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpc.baseSepolia] },
  },
  testnet: true,
};

const CHAIN_MAP: Record<string, { chain: Chain; rpc: string }> = {
  "ethereum-sepolia": { chain: sepolia, rpc: config.rpc.sepolia },
  "arbitrum-sepolia": {
    chain: arbitrumSepolia,
    rpc: config.rpc.arbitrumSepolia,
  },
  "base-sepolia": { chain: baseSepolia, rpc: config.rpc.baseSepolia },
};

// ─── Defense Executor ───────────────────────────────────────────────
class DefenseExecutor {
  private account;

  constructor() {
    if (!config.privateKey) {
      console.warn(
        "[DefenseExecutor] No private key configured — on-chain defense disabled",
      );
    }
    this.account = config.privateKey
      ? privateKeyToAccount(config.privateKey)
      : null;
  }

  get isConfigured(): boolean {
    return this.account !== null;
  }

  get signerAddress(): string | null {
    return this.account?.address ?? null;
  }

  /**
   * Call emergencyPause() on a vault contract.
   * Returns the transaction hash or null on failure.
   */
  async pauseVault(
    vaultAddress: `0x${string}`,
    chainKey: string,
  ): Promise<{ txHash: Hash; chain: string } | null> {
    if (!this.account) {
      console.error(
        "[DefenseExecutor] Cannot pause — no private key configured",
      );
      return null;
    }

    const chainConfig = CHAIN_MAP[chainKey];
    if (!chainConfig) {
      console.error(`[DefenseExecutor] Unknown chain: ${chainKey}`);
      return null;
    }

    try {
      console.log(
        `[DefenseExecutor] Pausing vault ${vaultAddress} on ${chainKey}...`,
      );

      const publicClient = createPublicClient({
        chain: chainConfig.chain,
        transport: http(chainConfig.rpc),
      });

      // Check if already paused
      try {
        const isPaused = await publicClient.readContract({
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "paused",
        });
        if (isPaused) {
          console.log(
            `[DefenseExecutor] Vault ${vaultAddress} on ${chainKey} is already paused — skipping`,
          );
          return { txHash: "0x0" as Hash, chain: chainKey };
        }
      } catch {
        // If paused() call fails, proceed with pause attempt anyway
      }

      const walletClient = createWalletClient({
        account: this.account,
        chain: chainConfig.chain,
        transport: http(chainConfig.rpc),
      });

      const txHash = await walletClient.writeContract({
        address: vaultAddress,
        abi: protectedVaultAbi,
        functionName: "emergencyPause",
      });

      console.log(`[DefenseExecutor] emergencyPause tx sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });

      console.log(
        `[DefenseExecutor] emergencyPause confirmed in block ${receipt.blockNumber} (status: ${receipt.status})`,
      );

      return { txHash, chain: chainKey };
    } catch (error: any) {
      console.error(
        `[DefenseExecutor] Failed to pause vault:`,
        error?.message || error,
      );
      return null;
    }
  }

  /**
   * Call unpause() on a vault contract.
   * Returns the transaction hash or null on failure.
   */
  async unpauseVault(
    vaultAddress: `0x${string}`,
    chainKey: string,
  ): Promise<{ txHash: Hash; chain: string } | null> {
    if (!this.account) {
      console.error(
        "[DefenseExecutor] Cannot unpause — no private key configured",
      );
      return null;
    }

    const chainConfig = CHAIN_MAP[chainKey];
    if (!chainConfig) {
      console.error(`[DefenseExecutor] Unknown chain: ${chainKey}`);
      return null;
    }

    try {
      console.log(
        `[DefenseExecutor] Unpausing vault ${vaultAddress} on ${chainKey}...`,
      );

      const publicClient = createPublicClient({
        chain: chainConfig.chain,
        transport: http(chainConfig.rpc),
      });

      // Check if already unpaused
      try {
        const isPaused = await publicClient.readContract({
          address: vaultAddress,
          abi: protectedVaultAbi,
          functionName: "paused",
        });
        if (!isPaused) {
          console.log(
            `[DefenseExecutor] Vault ${vaultAddress} on ${chainKey} is already unpaused — skipping`,
          );
          return { txHash: "0x0" as Hash, chain: chainKey };
        }
      } catch {
        // If paused() call fails, proceed with unpause attempt anyway
      }

      const walletClient = createWalletClient({
        account: this.account,
        chain: chainConfig.chain,
        transport: http(chainConfig.rpc),
      });

      const txHash = await walletClient.writeContract({
        address: vaultAddress,
        abi: protectedVaultAbi,
        functionName: "unpause",
      });

      console.log(`[DefenseExecutor] unpause tx sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });

      console.log(
        `[DefenseExecutor] unpause confirmed in block ${receipt.blockNumber} (status: ${receipt.status})`,
      );

      return { txHash, chain: chainKey };
    } catch (error: any) {
      console.error(
        `[DefenseExecutor] Failed to unpause vault:`,
        error?.message || error,
      );
      return null;
    }
  }
  // ─── CCIP Cross-Chain Defense ─────────────────────────────────────

  /**
   * Send a CCIP pause command from the Sender contract on Sepolia
   * to a Receiver contract on a remote chain.
   */
  async crossChainPauseVault(destinationChainKey: string): Promise<{
    txHash: Hash;
    messageId: string;
    chain: string;
    fees: string;
  } | null> {
    if (!this.account) {
      console.error("[CCIP] Cannot send — no private key configured");
      return null;
    }

    const senderAddress = config.ccip.senderAddress;
    if (!senderAddress) {
      console.error("[CCIP] No CCIP sender address configured");
      return null;
    }

    const receiverAddress = (
      config.ccip.receivers as Record<string, `0x${string}`>
    )[destinationChainKey];
    if (!receiverAddress) {
      console.error(`[CCIP] No receiver configured for ${destinationChainKey}`);
      return null;
    }

    const chainSelector = (
      config.ccip.chainSelectors as Record<string, bigint>
    )[destinationChainKey];
    if (!chainSelector) {
      console.error(`[CCIP] No chain selector for ${destinationChainKey}`);
      return null;
    }

    try {
      console.log(
        `[CCIP] Sending cross-chain pause to ${destinationChainKey}...`,
      );
      console.log(`[CCIP]   Sender: ${senderAddress}`);
      console.log(`[CCIP]   Receiver: ${receiverAddress}`);
      console.log(`[CCIP]   Chain selector: ${chainSelector}`);

      // Estimate fee first
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(config.rpc.sepolia),
      });

      const estimatedFee = await publicClient.readContract({
        address: senderAddress,
        abi: ccipSenderAbi,
        functionName: "estimatePauseFee",
        args: [chainSelector, receiverAddress],
      });

      console.log(`[CCIP]   Estimated fee: ${formatEther(estimatedFee)} LINK`);

      // Send the CCIP message
      const walletClient = createWalletClient({
        account: this.account,
        chain: sepolia,
        transport: http(config.rpc.sepolia),
      });

      const txHash = await walletClient.writeContract({
        address: senderAddress,
        abi: ccipSenderAbi,
        functionName: "sendPauseCommand",
        args: [chainSelector, receiverAddress],
      });

      console.log(`[CCIP] sendPauseCommand tx sent: ${txHash}`);

      // Wait for confirmation and extract messageId from logs
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120_000,
      });

      // Find the CrossChainPauseSent event log
      let messageId = "0x";
      for (const log of receipt.logs) {
        // CrossChainPauseSent topic
        if (
          log.topics[0] ===
          "0x" + "e0" /* we'll just grab the first indexed topic as messageId */
        ) {
          messageId = log.topics[1] || "0x";
        }
      }

      // The messageId is the first indexed topic in the CrossChainPauseSent event
      // Event sig: CrossChainPauseSent(bytes32 indexed messageId, uint64 indexed destinationChainSelector, address receiver, uint256 fees)
      for (const log of receipt.logs) {
        if (
          log.address.toLowerCase() === senderAddress.toLowerCase() &&
          log.topics.length >= 2
        ) {
          messageId = log.topics[1] || "0x";
          break;
        }
      }

      console.log(
        `[CCIP] Cross-chain pause confirmed! Block: ${receipt.blockNumber}`,
      );
      console.log(`[CCIP]   Message ID: ${messageId}`);
      console.log(
        `[CCIP]   CCIP Explorer: https://ccip.chain.link/msg/${messageId}`,
      );

      return {
        txHash,
        messageId,
        chain: destinationChainKey,
        fees: formatEther(estimatedFee),
      };
    } catch (error: any) {
      console.error(
        `[CCIP] Failed to send cross-chain pause:`,
        error?.message || error,
      );
      return null;
    }
  }

  /**
   * Cross-chain pause ALL vaults:
   * - Pause the Sepolia vault directly (same chain as sender)
   * - Send CCIP messages to pause Arb Sepolia + Base Sepolia vaults
   */
  async crossChainPauseAll(sepoliaVaultAddress: `0x${string}`): Promise<{
    localPause: { txHash: Hash; chain: string } | null;
    ccipMessages: Array<{
      txHash: Hash;
      messageId: string;
      chain: string;
      fees: string;
    }>;
  }> {
    const results = {
      localPause: null as { txHash: Hash; chain: string } | null,
      ccipMessages: [] as Array<{
        txHash: Hash;
        messageId: string;
        chain: string;
        fees: string;
      }>,
    };

    console.log("[CCIP] === CROSS-CHAIN DEFENSE ACTIVATED ===");

    // 1. Pause the local Sepolia vault directly
    console.log("[CCIP] Step 1: Pausing local Sepolia vault...");
    results.localPause = await this.pauseVault(
      sepoliaVaultAddress,
      "ethereum-sepolia",
    );

    // 2. Send CCIP to Arbitrum Sepolia
    console.log("[CCIP] Step 2: Sending CCIP pause to Arbitrum Sepolia...");
    const arbResult = await this.crossChainPauseVault("arbitrum-sepolia");
    if (arbResult) results.ccipMessages.push(arbResult);

    // 3. Send CCIP to Base Sepolia
    console.log("[CCIP] Step 3: Sending CCIP pause to Base Sepolia...");
    const baseResult = await this.crossChainPauseVault("base-sepolia");
    if (baseResult) results.ccipMessages.push(baseResult);

    console.log("[CCIP] === CROSS-CHAIN DEFENSE COMPLETE ===");
    console.log(
      `[CCIP]   Local pause: ${results.localPause ? "SUCCESS" : "FAILED"}`,
    );
    console.log(
      `[CCIP]   CCIP messages sent: ${results.ccipMessages.length}/2`,
    );

    return results;
  }

  /**
   * Get the LINK balance of the CCIP Sender contract
   */
  async getCCIPSenderLinkBalance(): Promise<string> {
    try {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(config.rpc.sepolia),
      });

      const balance = await publicClient.readContract({
        address: config.ccip.senderAddress,
        abi: ccipSenderAbi,
        functionName: "getLinkBalance",
      });

      return formatEther(balance);
    } catch {
      return "0";
    }
  }
}

export const defenseExecutor = new DefenseExecutor();
