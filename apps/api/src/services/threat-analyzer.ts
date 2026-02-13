import { db } from "../db/index.js";
import { threats, events, vaults } from "../db/schema.js";
import { eq, and, gte, desc } from "drizzle-orm";

// ─── Threat Analyzer ────────────────────────────────────────────────
// Provides intelligent threat analysis with risk scoring, attack
// classification, historical context, and actionable recommendations.
// Uses heuristic-based analysis (no external AI API required).

export interface ThreatAnalysis {
  threatId: string;
  riskScore: number; // 0-100
  riskLevel: "critical" | "high" | "medium" | "low" | "info";
  classification: string;
  attackVector: string;
  confidence: number; // 0-100
  indicators: string[];
  context: {
    historicalThreats: number;
    recentActivity: number;
    vaultRiskProfile: string;
    estimatedTVL: number;
    addressReputation: string;
  };
  recommendations: string[];
  mitigations: string[];
  relatedThreats: Array<{
    id: string;
    type: string;
    severity: string;
    timestamp: string | null;
  }>;
  analyzedAt: string;
}

// Attack vector classification based on threat type and patterns
const ATTACK_VECTORS: Record<string, { vector: string; classification: string; baseScore: number }> = {
  "Unusual Large Transfer": {
    vector: "Value Extraction",
    classification: "Suspicious Fund Movement",
    baseScore: 45,
  },
  "Anomalous Rapid Transactions": {
    vector: "Transaction Flooding",
    classification: "Denial of Service / Drain Attack",
    baseScore: 65,
  },
  "Flash Loan Attack Pattern": {
    vector: "Flash Loan Exploitation",
    classification: "DeFi Protocol Exploit",
    baseScore: 85,
  },
  "TVL Drain Detected": {
    vector: "Vault Drain",
    classification: "Fund Extraction Attack",
    baseScore: 80,
  },
  "Correlated Multi-Vector Attack": {
    vector: "Coordinated Multi-Vector",
    classification: "Advanced Persistent Threat",
    baseScore: 95,
  },
  "Emergency Pause Detected": {
    vector: "Administrative Action",
    classification: "Emergency Response Trigger",
    baseScore: 30,
  },
};

class ThreatAnalyzer {
  async analyze(threatId: string): Promise<ThreatAnalysis | null> {
    const threat = await db.query.threats.findFirst({
      where: eq(threats.id, threatId),
    });

    if (!threat) return null;

    const vault = await db.query.vaults.findFirst({
      where: eq(vaults.id, threat.vaultId),
    });

    // Get historical context
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
    const oneDayAgo = new Date(Date.now() - 86_400_000);

    const [recentThreats, dailyEvents, allVaultEvents] = await Promise.all([
      db.query.threats.findMany({
        where: and(
          eq(threats.vaultId, threat.vaultId),
          gte(threats.detectedAt, fiveMinutesAgo),
        ),
        orderBy: desc(threats.detectedAt),
      }),
      db.query.events.findMany({
        where: and(
          eq(events.vaultId, threat.vaultId),
          gte(events.timestamp, oneDayAgo),
        ),
      }),
      db.query.events.findMany({
        where: eq(events.vaultId, threat.vaultId),
      }),
    ]);

    // Calculate estimated TVL
    let totalDeposited = 0;
    let totalWithdrawn = 0;
    for (const e of allVaultEvents) {
      if (e.type === "deposit") totalDeposited += e.amountEth ?? 0;
      if (e.type === "withdrawal") totalWithdrawn += e.amountEth ?? 0;
    }
    const estimatedTVL = Math.max(0, totalDeposited - totalWithdrawn);

    // Get attack vector info
    const vectorInfo = ATTACK_VECTORS[threat.type] || {
      vector: "Unknown",
      classification: "Unclassified Threat",
      baseScore: 50,
    };

    // Calculate risk score with contextual modifiers
    let riskScore = vectorInfo.baseScore;

    // Severity modifier
    const severityMod: Record<string, number> = {
      critical: 20,
      high: 10,
      medium: 0,
      low: -10,
      info: -20,
    };
    riskScore += severityMod[threat.severity] ?? 0;

    // Recent threat density modifier
    if (recentThreats.length >= 5) riskScore += 15;
    else if (recentThreats.length >= 3) riskScore += 10;
    else if (recentThreats.length >= 2) riskScore += 5;

    // TVL at risk modifier
    if (estimatedTVL > 1) riskScore += 10;
    else if (estimatedTVL > 0.5) riskScore += 5;

    // Amount modifier
    const amountEth = threat.amountEth ?? 0;
    if (amountEth > 1) riskScore += 10;
    else if (amountEth > 0.5) riskScore += 5;

    // Vault already paused = lower risk (defense already active)
    if (vault?.status === "paused") riskScore -= 15;

    // Clamp to 0-100
    riskScore = Math.max(0, Math.min(100, riskScore));

    // Determine risk level from score
    const riskLevel = riskScore >= 80 ? "critical" :
      riskScore >= 60 ? "high" :
      riskScore >= 40 ? "medium" :
      riskScore >= 20 ? "low" : "info";

    // Calculate confidence based on data availability
    let confidence = 60; // base confidence
    if (allVaultEvents.length > 10) confidence += 10;
    if (recentThreats.length > 0) confidence += 10;
    if (threat.txHash) confidence += 10;
    if (threat.amountEth) confidence += 10;
    confidence = Math.min(100, confidence);

    // Generate indicators
    const indicators = this.generateIndicators(threat, recentThreats, dailyEvents, estimatedTVL);

    // Generate recommendations
    const recommendations = this.generateRecommendations(threat, vault, riskScore, recentThreats);

    // Generate mitigations
    const mitigations = this.generateMitigations(threat, vault, vectorInfo.vector);

    // Assess address reputation (heuristic)
    const addressReputation = this.assessAddressReputation(threat, allVaultEvents);

    // Vault risk profile
    const vaultRiskProfile = recentThreats.length >= 3 ? "High Risk" :
      recentThreats.length >= 1 ? "Elevated" : "Normal";

    // Related threats
    const relatedThreats = recentThreats
      .filter((t) => t.id !== threatId)
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        type: t.type,
        severity: t.severity,
        timestamp: t.detectedAt ? new Date(t.detectedAt).toISOString() : null,
      }));

    return {
      threatId,
      riskScore,
      riskLevel,
      classification: vectorInfo.classification,
      attackVector: vectorInfo.vector,
      confidence,
      indicators,
      context: {
        historicalThreats: recentThreats.length,
        recentActivity: dailyEvents.length,
        vaultRiskProfile,
        estimatedTVL,
        addressReputation,
      },
      recommendations,
      mitigations,
      relatedThreats,
      analyzedAt: new Date().toISOString(),
    };
  }

  private generateIndicators(
    threat: any,
    recentThreats: any[],
    dailyEvents: any[],
    estimatedTVL: number,
  ): string[] {
    const indicators: string[] = [];

    if (threat.amountEth && threat.amountEth > 0.5) {
      indicators.push(`Large value movement: ${threat.amountEth} ETH`);
    }

    if (recentThreats.length >= 3) {
      indicators.push(`${recentThreats.length} threats detected in 5-minute window — possible coordinated attack`);
    }

    if (dailyEvents.length > 20) {
      indicators.push(`Abnormally high activity: ${dailyEvents.length} events in 24 hours`);
    }

    if (threat.type === "Flash Loan Attack Pattern") {
      indicators.push("Deposit and withdrawal of similar amounts within 2 blocks — classic flash loan signature");
    }

    if (threat.type === "TVL Drain Detected" && estimatedTVL > 0) {
      const pct = ((threat.amountEth ?? 0) / estimatedTVL * 100).toFixed(1);
      indicators.push(`Withdrawal represents ${pct}% of estimated vault TVL`);
    }

    if (threat.type === "Correlated Multi-Vector Attack") {
      indicators.push("Multiple distinct attack patterns detected simultaneously");
    }

    if (threat.txHash) {
      indicators.push(`On-chain evidence: tx ${threat.txHash.slice(0, 14)}...`);
    }

    return indicators;
  }

  private generateRecommendations(
    threat: any,
    vault: any,
    riskScore: number,
    recentThreats: any[],
  ): string[] {
    const recs: string[] = [];

    if (riskScore >= 80) {
      recs.push("IMMEDIATE: Pause all vaults via CCIP cross-chain defense");
      recs.push("Investigate the source address for known exploit patterns");
      recs.push("Contact protocol security team immediately");
    } else if (riskScore >= 60) {
      recs.push("Pause the affected vault and monitor for further activity");
      recs.push("Review recent transactions for additional suspicious patterns");
    } else if (riskScore >= 40) {
      recs.push("Monitor the vault closely for the next 30 minutes");
      recs.push("Consider lowering the alert threshold temporarily");
    } else {
      recs.push("Continue monitoring — no immediate action required");
    }

    if (vault?.status !== "paused" && riskScore >= 60) {
      recs.push("Enable auto-pause in Settings to automatically respond to high-severity threats");
    }

    if (recentThreats.length >= 2) {
      recs.push("Review correlated threats to identify attack pattern");
    }

    recs.push(`Verify transaction on ${threat.chain} block explorer`);

    return recs;
  }

  private generateMitigations(
    threat: any,
    vault: any,
    attackVector: string,
  ): string[] {
    const mitigations: string[] = [];

    switch (attackVector) {
      case "Flash Loan Exploitation":
        mitigations.push("Add flash loan guards (require block delay between deposit and withdrawal)");
        mitigations.push("Implement reentrancy protection on all external calls");
        mitigations.push("Consider adding a withdrawal cooldown period");
        break;
      case "Vault Drain":
        mitigations.push("Implement withdrawal limits per block/time period");
        mitigations.push("Add multi-sig requirement for large withdrawals");
        mitigations.push("Consider timelocked withdrawals above threshold");
        break;
      case "Transaction Flooding":
        mitigations.push("Implement per-address rate limiting on-chain");
        mitigations.push("Add gas price checks to prevent spam transactions");
        break;
      case "Coordinated Multi-Vector":
        mitigations.push("Deploy circuit breaker pattern with automatic pause");
        mitigations.push("Implement cross-chain monitoring for coordinated attacks");
        mitigations.push("Add anomaly detection for unusual transaction patterns");
        break;
      default:
        mitigations.push("Review and update alert rule thresholds");
        mitigations.push("Consider adding more granular monitoring rules");
    }

    if (vault?.status !== "paused") {
      mitigations.push("Emergency pause is available via the Vaults dashboard");
    }

    return mitigations;
  }

  private assessAddressReputation(threat: any, allEvents: any[]): string {
    const fromAddress = threat.txHash ? "known" : "unknown";
    
    // Check if the address has been seen before in this vault's history
    const addressEvents = allEvents.filter(
      (e) => e.fromAddress === threat.txHash || e.toAddress === threat.txHash,
    );

    if (addressEvents.length > 5) return "Frequent Interactor";
    if (addressEvents.length > 0) return "Known Address";
    return "First-Time Interactor";
  }
}

export const threatAnalyzer = new ThreatAnalyzer();
