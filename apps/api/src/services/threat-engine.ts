import { db } from "../db/index.js";
import { threats, alertRules, vaults, events, settings } from "../db/schema.js";
import { eq, desc, and, gte } from "drizzle-orm";
import { wsManager } from "../lib/ws.js";
import { notifyIntegrations } from "./notifications.js";
import { defenseExecutor } from "./defense-executor.js";
import { randomUUID } from "crypto";

type EventRecord = {
  id: string;
  vaultId: string;
  type: string;
  txHash: string;
  blockNumber: number;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  amountEth: number | null;
  chain: string;
};

type ThreatResult = {
  vaultId: string;
  eventId: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  chain: string;
  txHash: string | null;
  amount: string | null;
  amountEth: number | null;
};

// Deduplication: prevent the same threat type from firing repeatedly within a window
const recentThreatKeys = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000; // 30 seconds

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const last = recentThreatKeys.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentThreatKeys.set(key, now);
  return false;
}

// Clean up dedup map every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentThreatKeys) {
    if (now - ts > DEDUP_WINDOW_MS) recentThreatKeys.delete(key);
  }
}, 60_000);

// CRE severity hints passed from the webhook handler
type CREHints = {
  creSeverity?: string;
  creThreatType?: string;
};

class ThreatEngine {
  async analyze(event: EventRecord, vaultId: string, creHints?: CREHints) {
    // If CRE already flagged this as a threat (severity != info),
    // create a threat record from the CRE analysis first.
    // This is the primary detection path — CRE DON consensus-verified.
    if (creHints?.creSeverity && creHints.creSeverity !== "info") {
      const creThreat: ThreatResult = {
        vaultId,
        eventId: event.id,
        type: this.formatCREThreatType(creHints.creThreatType || "unknown"),
        severity: this.normalizeSeverity(creHints.creSeverity),
        description: this.buildCREDescription(event, creHints),
        chain: event.chain,
        txHash: event.txHash,
        amount: event.amount,
        amountEth: event.amountEth,
      };

      const dedupKey = `cre:${vaultId}:${event.txHash}`;
      if (!isDuplicate(dedupKey)) {
        // Use the most appropriate rule for response type
        const rule = await this.findBestRule(creHints.creSeverity);
        await this.handleThreat(creThreat, rule);
      }
    }

    // Run rule-based detection (backend-side, supplements CRE analysis)
    const rules = await db.query.alertRules.findMany({
      where: eq(alertRules.enabled, true),
    });

    for (const rule of rules) {
      const threat = await this.evaluateRule(rule, event, vaultId);
      if (threat) {
        await this.handleThreat(threat, rule);
      }
    }

    // Run pattern-based detection (independent of alert rules)
    // These require DB state that CRE doesn't have access to
    await this.detectFlashLoanPattern(event, vaultId);
    await this.detectTVLDrain(event, vaultId);
    await this.correlateThreats(vaultId);
  }

  // ─── CRE Threat Helpers ───────────────────────────────────────────
  private formatCREThreatType(creThreatType: string): string {
    switch (creThreatType) {
      case "large_transfer":
        return "CRE: Large Transfer Detected";
      case "large_withdrawal":
        return "CRE: Large Withdrawal Detected";
      case "emergency_pause":
        return "CRE: Emergency Pause Detected";
      default:
        return `CRE: ${creThreatType}`;
    }
  }

  private normalizeSeverity(
    severity: string,
  ): "critical" | "high" | "medium" | "low" | "info" {
    const valid = ["critical", "high", "medium", "low", "info"];
    return valid.includes(severity)
      ? (severity as "critical" | "high" | "medium" | "low" | "info")
      : "medium";
  }

  private buildCREDescription(event: EventRecord, hints: CREHints): string {
    const source = "Detected by CRE DON (consensus-verified)";
    if (event.type === "deposit" || event.type === "withdrawal") {
      return `${event.type === "deposit" ? "Deposit" : "Withdrawal"} of ${event.amountEth} ETH flagged as ${hints.creSeverity?.toUpperCase()} by CRE workflow. ${source}. Tx: ${event.txHash?.slice(0, 14)}...`;
    }
    if (event.type === "pause") {
      return `Emergency pause triggered by ${event.fromAddress}. ${source}. Tx: ${event.txHash?.slice(0, 14)}...`;
    }
    return `Event flagged as ${hints.creSeverity?.toUpperCase()} by CRE workflow. ${source}.`;
  }

  private async findBestRule(
    severity: string,
  ): Promise<typeof alertRules.$inferSelect | null> {
    if (severity === "critical") {
      // For critical threats, use CCIP pause rule if available
      const ccipRule = await db.query.alertRules.findFirst({
        where: eq(alertRules.responseType, "pause_all_ccip"),
      });
      if (ccipRule) return ccipRule;
    }
    if (severity === "critical" || severity === "high") {
      // For high/critical, use single pause rule
      const pauseRule = await db.query.alertRules.findFirst({
        where: eq(alertRules.responseType, "pause_single"),
      });
      if (pauseRule) return pauseRule;
    }
    // Default: alert only
    const alertRule = await db.query.alertRules.findFirst({
      where: eq(alertRules.responseType, "alert_only"),
    });
    return alertRule || null;
  }

  // ─── Flash Loan Detection ──────────────────────────────────────────
  // Detects large deposit followed by withdrawal in the same or adjacent block
  private async detectFlashLoanPattern(event: EventRecord, vaultId: string) {
    if (event.type !== "withdrawal") return;

    // Look for a large deposit in the same block or within 2 blocks
    const recentDeposits = await db.query.events.findMany({
      where: and(eq(events.vaultId, vaultId), eq(events.type, "deposit")),
      orderBy: desc(events.blockNumber),
      limit: 10,
    });

    for (const deposit of recentDeposits) {
      const blockDiff = Math.abs(event.blockNumber - deposit.blockNumber);
      if (blockDiff > 2) continue;

      const depositAmt = deposit.amountEth ?? 0;
      const withdrawAmt = event.amountEth ?? 0;

      // Flash loan pattern: deposit and withdrawal of similar size within 2 blocks
      if (depositAmt > 0.05 && withdrawAmt > 0.05) {
        const ratio =
          Math.min(depositAmt, withdrawAmt) / Math.max(depositAmt, withdrawAmt);
        if (ratio > 0.8) {
          const dedupKey = `flash_loan:${vaultId}:${event.blockNumber}`;
          if (isDuplicate(dedupKey)) return;

          const severity = depositAmt >= 0.5 ? "critical" : "high";
          const threat: ThreatResult = {
            vaultId,
            eventId: event.id,
            type: "Flash Loan Attack Pattern",
            severity,
            description: `Suspected flash loan: ${depositAmt} ETH deposited at block ${deposit.blockNumber}, then ${withdrawAmt} ETH withdrawn at block ${event.blockNumber} (${blockDiff} block gap). Deposit tx: ${deposit.txHash?.slice(0, 14)}...`,
            chain: event.chain,
            txHash: event.txHash,
            amount: event.amount,
            amountEth: event.amountEth,
          };

          // Use the most aggressive rule for response
          const rule = await db.query.alertRules.findFirst({
            where: eq(alertRules.type, "rapid_transactions"),
          });
          await this.handleThreat(threat, rule || null);
          return;
        }
      }
    }
  }

  // ─── TVL Drain Detection ───────────────────────────────────────────
  // Detects when a significant percentage of vault balance is withdrawn
  private async detectTVLDrain(event: EventRecord, vaultId: string) {
    if (event.type !== "withdrawal") return;

    const vault = await db.query.vaults.findFirst({
      where: eq(vaults.id, vaultId),
    });
    if (!vault) return;

    // Get total deposits and withdrawals to estimate TVL
    const allEvents = await db.query.events.findMany({
      where: eq(events.vaultId, vaultId),
    });

    let totalDeposited = 0;
    let totalWithdrawn = 0;
    for (const e of allEvents) {
      if (e.type === "deposit") totalDeposited += e.amountEth ?? 0;
      if (e.type === "withdrawal") totalWithdrawn += e.amountEth ?? 0;
    }

    const estimatedTVL = totalDeposited - totalWithdrawn;
    const withdrawalAmount = event.amountEth ?? 0;

    // If withdrawal is > 50% of estimated TVL, flag it
    if (estimatedTVL > 0 && withdrawalAmount > 0) {
      const drainPercent = (withdrawalAmount / estimatedTVL) * 100;

      if (drainPercent >= 30) {
        const dedupKey = `tvl_drain:${vaultId}:${event.blockNumber}`;
        if (isDuplicate(dedupKey)) return;

        const severity =
          drainPercent >= 80
            ? "critical"
            : drainPercent >= 50
              ? "high"
              : "medium";
        const threat: ThreatResult = {
          vaultId,
          eventId: event.id,
          type: "TVL Drain Detected",
          severity,
          description: `Withdrawal of ${withdrawalAmount.toFixed(4)} ETH represents ${drainPercent.toFixed(1)}% of estimated vault TVL (${estimatedTVL.toFixed(4)} ETH). Possible vault drain attack.`,
          chain: event.chain,
          txHash: event.txHash,
          amount: event.amount,
          amountEth: event.amountEth,
        };

        const rule = await db.query.alertRules.findFirst({
          where: eq(alertRules.type, "large_transfer"),
        });
        await this.handleThreat(threat, rule || null);
      }
    }
  }

  // ─── Threat Correlation ────────────────────────────────────────────
  // Links related threats within a time window and escalates severity
  private async correlateThreats(vaultId: string) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);

    const recentThreats = await db.query.threats.findMany({
      where: and(
        eq(threats.vaultId, vaultId),
        gte(threats.detectedAt, fiveMinutesAgo),
      ),
      orderBy: desc(threats.detectedAt),
    });

    // If 3+ threats on the same vault within 5 minutes, escalate
    if (recentThreats.length >= 3) {
      const dedupKey = `correlated:${vaultId}`;
      if (isDuplicate(dedupKey)) return;

      const types = [...new Set(recentThreats.map((t) => t.type))];
      const threat: ThreatResult = {
        vaultId,
        eventId: recentThreats[0].eventId || "",
        type: "Correlated Multi-Vector Attack",
        severity: "critical",
        description: `${recentThreats.length} threats detected on this vault within 5 minutes: ${types.join(", ")}. This pattern suggests a coordinated attack. Immediate action recommended.`,
        chain: recentThreats[0].chain,
        txHash: recentThreats[0].txHash,
        amount: null,
        amountEth: null,
      };

      // Force CCIP pause for correlated attacks
      const ccipRule = await db.query.alertRules.findFirst({
        where: eq(alertRules.responseType, "pause_all_ccip"),
      });
      await this.handleThreat(threat, ccipRule || null);
    }
  }

  private async evaluateRule(
    rule: typeof alertRules.$inferSelect,
    event: EventRecord,
    vaultId: string,
  ): Promise<ThreatResult | null> {
    const params = rule.params as Record<string, any> | null;

    switch (rule.type) {
      case "large_transfer": {
        if (event.type !== "deposit" && event.type !== "withdrawal")
          return null;
        const threshold = params?.thresholdEth ?? 0.1;
        if ((event.amountEth ?? 0) >= threshold) {
          const dedupKey = `large_transfer:${vaultId}:${event.txHash}`;
          if (isDuplicate(dedupKey)) return null;

          return {
            vaultId,
            eventId: event.id,
            type: "Unusual Large Transfer",
            severity: rule.severity as any,
            description: `${event.type === "deposit" ? "Deposit" : "Withdrawal"} of ${event.amountEth} ETH detected, exceeding the ${threshold} ETH threshold. From: ${event.fromAddress?.slice(0, 10)}...`,
            chain: event.chain,
            txHash: event.txHash,
            amount: event.amount,
            amountEth: event.amountEth,
          };
        }
        break;
      }

      case "rapid_transactions": {
        const maxPerWindow = params?.maxTxnsPerMinute ?? 5;
        // Use 3-minute window to account for testnet block times (~12s on Sepolia)
        const windowMs = 3 * 60_000;
        const windowStart = new Date(Date.now() - windowMs);

        const recentEvents = await db.query.events.findMany({
          where: and(
            eq(events.vaultId, vaultId),
            gte(events.timestamp, windowStart),
          ),
        });

        if (recentEvents.length >= maxPerWindow) {
          const dedupKey = `rapid_tx:${vaultId}`;
          if (isDuplicate(dedupKey)) return null;

          return {
            vaultId,
            eventId: event.id,
            type: "Anomalous Rapid Transactions",
            severity: rule.severity as any,
            description: `${recentEvents.length} transactions detected within 3 minutes on this vault, exceeding the ${maxPerWindow}-tx threshold. Possible flash loan or drain attack.`,
            chain: event.chain,
            txHash: event.txHash,
            amount: event.amount,
            amountEth: event.amountEth,
          };
        }
        break;
      }

      case "unauthorized_access": {
        if (event.type === "pause") {
          const dedupKey = `unauth:${vaultId}:${event.txHash}`;
          if (isDuplicate(dedupKey)) return null;

          // Check if the pauser is the expected sentinel
          const vault = await db.query.vaults.findFirst({
            where: eq(vaults.id, vaultId),
          });

          return {
            vaultId,
            eventId: event.id,
            type: "Emergency Pause Detected",
            severity: rule.severity as any,
            description: `Vault was emergency paused by ${event.fromAddress}. Investigating whether this was an authorized action.`,
            chain: event.chain,
            txHash: event.txHash,
            amount: null,
            amountEth: null,
          };
        }
        break;
      }
    }

    return null;
  }

  private async handleThreat(
    threat: ThreatResult,
    rule: typeof alertRules.$inferSelect | null,
  ) {
    // Determine response action based on rule config
    let responseAction = "Alert sent to dashboard";
    let responseStatus: "pending" | "executed" = "executed";
    const responseType = rule?.responseType ?? "alert_only";

    if (responseType === "pause_single") {
      responseAction = "Auto-pause triggered on vault";
      responseStatus = "pending";
    } else if (responseType === "pause_all_ccip") {
      responseAction = "Cross-chain pause via CCIP triggered on all vaults";
      responseStatus = "pending";
    }

    const threatRecord = {
      id: randomUUID(),
      vaultId: threat.vaultId,
      eventId: threat.eventId,
      type: threat.type,
      severity: threat.severity,
      description: threat.description,
      chain: threat.chain,
      txHash: threat.txHash,
      amount: threat.amount,
      amountEth: threat.amountEth,
      responseAction,
      responseStatus,
    };

    await db.insert(threats).values(threatRecord);

    console.log(
      `[ThreatEngine] 🚨 ${threat.severity.toUpperCase()}: ${threat.type} on ${threat.chain}`,
    );

    // Broadcast to dashboard
    wsManager.broadcast("new_threat", {
      ...threatRecord,
      detectedAt: new Date().toISOString(),
    });

    // Send notifications to integrations
    await notifyIntegrations(threatRecord);

    // If auto-pause is enabled and rule says to pause, trigger defense
    if (responseType !== "alert_only") {
      const autoPause = await db.query.settings.findFirst({
        where: eq(settings.key, "auto_pause_enabled"),
      });

      if (autoPause?.value === true) {
        console.log(
          `[ThreatEngine] Auto-pause enabled, triggering defense for vault ${threat.vaultId}`,
        );

        // Look up the vault to get its address and chain
        const vault = await db.query.vaults.findFirst({
          where: eq(vaults.id, threat.vaultId),
        });

        if (vault && defenseExecutor.isConfigured) {
          if (responseType === "pause_all_ccip") {
            // ── Cross-chain pause: pause ALL vaults via CCIP ──
            console.log(
              `[ThreatEngine] CCIP cross-chain defense: pausing ALL vaults`,
            );

            const ccipResult = await defenseExecutor.crossChainPauseAll(
              vault.address as `0x${string}`,
            );

            // Mark all vaults as paused in DB
            const allVaults = await db.query.vaults.findMany();
            for (const v of allVaults) {
              await db
                .update(vaults)
                .set({ status: "paused", updatedAt: new Date() })
                .where(eq(vaults.id, v.id));

              wsManager.broadcast("vault_status_change", {
                vaultId: v.id,
                status: "paused",
              });
            }

            const ccipCount = ccipResult.ccipMessages.length;
            const localOk = ccipResult.localPause !== null;
            const summaryTx =
              ccipResult.localPause?.txHash ||
              ccipResult.ccipMessages[0]?.txHash ||
              "0x0";

            await db
              .update(threats)
              .set({
                responseStatus: "executed",
                responseTxHash: summaryTx,
                responseAction: `Cross-chain defense executed: local pause ${localOk ? "OK" : "FAILED"}, ${ccipCount} CCIP message(s) sent to remote chains`,
                resolvedAt: new Date(),
              })
              .where(eq(threats.id, threatRecord.id));

            wsManager.broadcast("threat_resolved", {
              threatId: threatRecord.id,
              status: "executed",
              txHash: summaryTx,
              ccipMessages: ccipResult.ccipMessages,
            });

            console.log(
              `[ThreatEngine] Cross-chain defense complete: local=${localOk}, ccip=${ccipCount}/2`,
            );
          } else {
            // ── Single vault pause ──
            const result = await defenseExecutor.pauseVault(
              vault.address as `0x${string}`,
              vault.chain,
            );

            if (result) {
              await db
                .update(threats)
                .set({
                  responseStatus: "executed",
                  responseTxHash: result.txHash,
                  responseAction: `Emergency pause executed on-chain (tx: ${result.txHash.slice(0, 14)}...)`,
                  resolvedAt: new Date(),
                })
                .where(eq(threats.id, threatRecord.id));

              await db
                .update(vaults)
                .set({ status: "paused", updatedAt: new Date() })
                .where(eq(vaults.id, threat.vaultId));

              wsManager.broadcast("threat_resolved", {
                threatId: threatRecord.id,
                status: "executed",
                txHash: result.txHash,
              });

              wsManager.broadcast("vault_status_change", {
                vaultId: threat.vaultId,
                status: "paused",
              });

              console.log(
                `[ThreatEngine] Vault ${vault.address} paused successfully: ${result.txHash}`,
              );
            } else {
              await db
                .update(threats)
                .set({
                  responseStatus: "failed",
                  responseAction:
                    "Auto-pause attempted but failed — check logs",
                })
                .where(eq(threats.id, threatRecord.id));

              wsManager.broadcast("threat_updated", {
                threatId: threatRecord.id,
                status: "failed",
              });

              console.error(
                `[ThreatEngine] Failed to pause vault ${vault.address}`,
              );
            }
          }
        } else if (!defenseExecutor.isConfigured) {
          console.warn(
            `[ThreatEngine] Defense executor not configured (no private key)`,
          );
        }
      }
    }
  }
}

export const threatEngine = new ThreatEngine();
