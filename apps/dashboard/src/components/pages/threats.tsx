"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Zap,
  Filter,
  ArrowUpRight,
  Copy,
  Brain,
  Loader2,
  ChevronDown,
  ChevronUp,
  Target,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
import { THREAT_SEVERITY, type ThreatSeverity } from "@/lib/constants";
import { useThreats, useWebSocket } from "@/lib/hooks";
import { api, type ThreatEvent } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useState } from "react";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RiskScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-red-500"
      : score >= 60
        ? "bg-orange-500"
        : score >= 40
          ? "bg-yellow-500"
          : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-bold w-8 text-right">{score}</span>
    </div>
  );
}

function ThreatCard({
  threat,
  onUpdate,
}: {
  threat: ThreatEvent;
  onUpdate: () => void;
}) {
  const severity = THREAT_SEVERITY[threat.severity];
  const [analysis, setAnalysis] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAnalysis = async () => {
    if (analysis) {
      setShowAnalysis(!showAnalysis);
      return;
    }
    setLoadingAnalysis(true);
    setShowAnalysis(true);
    try {
      const res = await api.getThreatAnalysis(threat.id);
      setAnalysis(res.analysis);
    } catch {
      setAnalysis(null);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleDismiss = async () => {
    setActionLoading(true);
    try {
      await api.updateThreat(threat.id, {
        responseStatus: "dismissed",
        responseAction: "Dismissed by operator — false positive",
      });
      onUpdate();
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    setActionLoading(true);
    try {
      await api.updateThreat(threat.id, {
        responseStatus: "executed",
        responseAction: "Acknowledged and resolved by operator",
      });
      onUpdate();
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Card
      className={`${severity.bg} ${severity.border} hover:shadow-md transition-all duration-200`}
    >
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge
                variant="outline"
                className={`text-[10px] px-2 py-0.5 ${severity.color} ${severity.border}`}
              >
                {severity.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {threat.chain}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(threat.detectedAt)}
              </span>
              {threat.amountEth && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-medium text-foreground">
                    {threat.amountEth} ETH
                  </span>
                </>
              )}
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {threat.type}
            </h3>

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {threat.description}
            </p>

            {/* Tx info */}
            {threat.txHash && (
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-mono">
                  tx: {threat.txHash.slice(0, 12)}...{threat.txHash.slice(-6)}
                </span>
                <button
                  className="opacity-60 hover:opacity-100 transition-opacity"
                  onClick={() => navigator.clipboard.writeText(threat.txHash!)}
                >
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Response */}
            <div className="rounded-lg bg-background/50 border border-border/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium text-foreground">
                  Response Action
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {threat.responseAction}
              </p>
            </div>
          </div>

          {/* Status indicator */}
          <div className="shrink-0 flex flex-col items-center gap-1.5">
            {threat.responseStatus === "executed" ? (
              <>
                <div className="rounded-full bg-primary/15 p-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
                <span className="text-[10px] text-primary font-medium">
                  Resolved
                </span>
              </>
            ) : threat.responseStatus === "dismissed" ? (
              <>
                <div className="rounded-full bg-muted p-2">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                  Dismissed
                </span>
              </>
            ) : (
              <>
                <div className="rounded-full bg-yellow-500/15 p-2">
                  <Clock className="h-4 w-4 text-yellow-400 animate-pulse" />
                </div>
                <span className="text-[10px] text-yellow-400 font-medium">
                  Pending
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
          {threat.txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${threat.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                <ExternalLink className="h-3 w-3" />
                View Tx
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={fetchAnalysis}
          >
            {loadingAnalysis ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Brain className="h-3 w-3" />
            )}
            {showAnalysis ? "Hide" : "Analyze"}
            {showAnalysis ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
          {threat.responseStatus === "pending" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 ml-auto"
                onClick={handleDismiss}
                disabled={actionLoading}
              >
                <XCircle className="h-3 w-3" />
                Dismiss
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleAcknowledge}
                disabled={actionLoading}
              >
                <CheckCircle2 className="h-3 w-3" />
                Resolve
              </Button>
            </>
          )}
        </div>

        {/* AI Analysis Panel */}
        {showAnalysis && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
            {loadingAnalysis ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-xs text-muted-foreground">
                  Analyzing threat...
                </span>
              </div>
            ) : analysis ? (
              <>
                {/* Risk Score */}
                <div className="rounded-lg bg-background/80 border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold">
                      Risk Assessment
                    </span>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {analysis.confidence}% confidence
                    </Badge>
                  </div>
                  <RiskScoreBar score={analysis.riskScore} />
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>
                      Classification:{" "}
                      <strong className="text-foreground">
                        {analysis.classification}
                      </strong>
                    </span>
                    <span>
                      Vector:{" "}
                      <strong className="text-foreground">
                        {analysis.attackVector}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Indicators */}
                {analysis.indicators?.length > 0 && (
                  <div className="rounded-lg bg-background/80 border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-semibold">
                        Threat Indicators
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {analysis.indicators.map((ind: string, i: number) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-1.5"
                        >
                          <span className="text-amber-500 mt-0.5">-</span>
                          {ind}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Context */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-background/80 border border-border p-2 text-center">
                    <div className="text-sm font-bold">
                      {analysis.context.historicalThreats}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Recent Threats
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/80 border border-border p-2 text-center">
                    <div className="text-sm font-bold">
                      {analysis.context.recentActivity}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      24h Events
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/80 border border-border p-2 text-center">
                    <div className="text-sm font-bold">
                      {analysis.context.estimatedTVL.toFixed(3)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Est. TVL (ETH)
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/80 border border-border p-2 text-center">
                    <div className="text-sm font-bold">
                      {analysis.context.vaultRiskProfile}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Risk Profile
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                {analysis.recommendations?.length > 0 && (
                  <div className="rounded-lg bg-background/80 border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-xs font-semibold">
                        Recommendations
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {analysis.recommendations.map(
                        (rec: string, i: number) => (
                          <li
                            key={i}
                            className="text-xs text-muted-foreground flex items-start gap-1.5"
                          >
                            <span className="text-blue-500 mt-0.5">
                              {i + 1}.
                            </span>
                            {rec}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

                {/* Mitigations */}
                {analysis.mitigations?.length > 0 && (
                  <div className="rounded-lg bg-background/80 border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs font-semibold">Mitigations</span>
                    </div>
                    <ul className="space-y-1">
                      {analysis.mitigations.map((mit: string, i: number) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-1.5"
                        >
                          <span className="text-green-500 mt-0.5">-</span>
                          {mit}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                Analysis unavailable
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SeverityCount({
  severity,
  count,
}: {
  severity: ThreatSeverity;
  count: number;
}) {
  const config = THREAT_SEVERITY[severity];
  return (
    <div
      className={`rounded-lg border ${config.border} ${config.bg} px-3 py-2 text-center`}
    >
      <p className={`text-lg font-bold ${config.color}`}>{count}</p>
      <p className="text-[10px] text-muted-foreground">{config.label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">All clear</p>
      <p className="text-xs text-muted-foreground mt-1">{message}</p>
    </div>
  );
}

export function ThreatsPage() {
  const { data: threats, loading, refetch } = useThreats();

  useWebSocket(
    useCallback(
      (msg: { type: string }) => {
        if (
          msg.type === "new_threat" ||
          msg.type === "threat_updated" ||
          msg.type === "threat_resolved"
        ) {
          refetch();
        }
      },
      [refetch],
    ),
  );

  const allThreats = threats ?? [];
  const severityCounts = {
    critical: allThreats.filter((t) => t.severity === "critical").length,
    high: allThreats.filter((t) => t.severity === "high").length,
    medium: allThreats.filter((t) => t.severity === "medium").length,
    low: allThreats.filter((t) => t.severity === "low").length,
    info: allThreats.filter((t) => t.severity === "info").length,
  };

  const pending = allThreats.filter((t) => t.responseStatus === "pending");
  const resolved = allThreats.filter((t) => t.responseStatus === "executed");
  const dismissed = allThreats.filter((t) => t.responseStatus === "dismissed");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Threat Detection
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Security events detected by CRE monitoring workflows
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            Export
          </Button>
        </div>
      </div>

      {/* Severity summary */}
      {loading ? (
        <div className="grid grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[60px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          <SeverityCount severity="critical" count={severityCounts.critical} />
          <SeverityCount severity="high" count={severityCounts.high} />
          <SeverityCount severity="medium" count={severityCounts.medium} />
          <SeverityCount severity="low" count={severityCounts.low} />
          <SeverityCount severity="info" count={severityCounts.info} />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({allThreats.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({pending.length})</TabsTrigger>
          <TabsTrigger value="resolved">
            Resolved ({resolved.length})
          </TabsTrigger>
          <TabsTrigger value="dismissed">
            Dismissed ({dismissed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-[160px] rounded-xl" />
              ))}
            </div>
          ) : allThreats.length > 0 ? (
            <div className="space-y-3">
              {allThreats.map((threat) => (
                <ThreatCard
                  key={threat.id}
                  threat={threat}
                  onUpdate={refetch}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No threats detected. Your protocols are safe." />
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          {pending.length > 0 ? (
            <div className="space-y-3">
              {pending.map((threat) => (
                <ThreatCard
                  key={threat.id}
                  threat={threat}
                  onUpdate={refetch}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No active threats requiring attention" />
          )}
        </TabsContent>

        <TabsContent value="resolved" className="mt-4">
          {resolved.length > 0 ? (
            <div className="space-y-3">
              {resolved.map((threat) => (
                <ThreatCard
                  key={threat.id}
                  threat={threat}
                  onUpdate={refetch}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No resolved threats yet" />
          )}
        </TabsContent>

        <TabsContent value="dismissed" className="mt-4">
          {dismissed.length > 0 ? (
            <div className="space-y-3">
              {dismissed.map((threat) => (
                <ThreatCard
                  key={threat.id}
                  threat={threat}
                  onUpdate={refetch}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No dismissed threats" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
