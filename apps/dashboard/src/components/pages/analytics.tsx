"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  Zap,
  Clock,
  Activity,
  Globe,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { useOverview, useThreats, useEvents, useVaults } from "@/lib/hooks";

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {subtext && (
              <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
            )}
          </div>
          <div
            className={`rounded-lg p-2.5 ${accent ? "bg-primary/15" : "bg-muted"}`}
          >
            <Icon
              className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 h-5 rounded bg-muted/30 overflow-hidden">
        <div
          className="h-full rounded transition-all duration-500"
          style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-medium text-foreground w-8">{value}</span>
    </div>
  );
}

export function AnalyticsPage() {
  const { data: overview, loading: loadingOverview } = useOverview();
  const { data: threats, loading: loadingThreats } = useThreats();
  const { data: events, loading: loadingEvents } = useEvents({ limit: 500 });
  const { data: vaults, loading: loadingVaults } = useVaults();

  const loading = loadingOverview || loadingThreats || loadingEvents;

  // Compute chain distribution from events
  const chainStats = useMemo(() => {
    if (!events) return [];
    const map = new Map<string, number>();
    for (const e of events) {
      map.set(e.chain, (map.get(e.chain) || 0) + 1);
    }
    const colorMap: Record<string, string> = {
      "ethereum-sepolia": "#627EEA",
      "arbitrum-sepolia": "#28A0F0",
      "base-sepolia": "#0052FF",
    };
    return Array.from(map.entries())
      .map(([chain, count]) => ({
        chain,
        count,
        color: colorMap[chain] || "#888",
      }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  const maxChainEvents = Math.max(...chainStats.map((c) => c.count), 1);

  // Compute event type breakdown
  const eventTypeStats = useMemo(() => {
    if (!events) return { deposit: 0, withdrawal: 0, pause: 0, unpause: 0 };
    return {
      deposit: events.filter((e) => e.type === "deposit").length,
      withdrawal: events.filter((e) => e.type === "withdrawal").length,
      pause: events.filter((e) => e.type === "pause").length,
      unpause: events.filter((e) => e.type === "unpause").length,
    };
  }, [events]);

  // Compute threat response breakdown
  const responseStats = useMemo(() => {
    if (!threats) return { alertOnly: 0, paused: 0, pending: 0, dismissed: 0 };
    return {
      alertOnly: threats.filter(
        (t) =>
          t.responseStatus === "executed" &&
          t.responseAction?.includes("Alert"),
      ).length,
      paused: threats.filter(
        (t) =>
          t.responseAction?.includes("pause") ||
          t.responseAction?.includes("Pause"),
      ).length,
      pending: threats.filter((t) => t.responseStatus === "pending").length,
      dismissed: threats.filter((t) => t.responseStatus === "dismissed").length,
    };
  }, [threats]);

  // TVL from vaults
  const totalTvl = useMemo(() => {
    if (!vaults) return 0;
    return vaults.reduce(
      (sum, v) => sum + Number(v.onChain?.balanceEth || 0),
      0,
    );
  }, [vaults]);

  const sevCounts = overview?.threatsBySeverity || {};
  const totalThreats = overview?.totalThreats ?? 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Protocol defense metrics and performance insights
        </p>
      </div>

      {/* Key metrics */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[100px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Events"
            value={String(overview?.totalEvents ?? 0)}
            subtext={`${overview?.eventsToday ?? 0} today`}
            icon={Activity}
          />
          <MetricCard
            label="Threats Detected"
            value={String(totalThreats)}
            subtext={`${overview?.pendingThreats ?? 0} pending`}
            icon={AlertTriangle}
          />
          <MetricCard
            label="Threats Resolved"
            value={String(overview?.resolvedThreats ?? 0)}
            subtext={
              totalThreats > 0
                ? `${Math.round(((overview?.resolvedThreats ?? 0) / totalThreats) * 100)}% resolution rate`
                : "No threats yet"
            }
            icon={CheckCircle2}
          />
          <MetricCard
            label="Protected TVL"
            value={`${totalTvl.toFixed(4)} ETH`}
            subtext={`${overview?.activeVaults ?? 0} active vaults`}
            icon={Shield}
            accent
          />
        </div>
      )}

      {/* Severity + Chain distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Threat Severity Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Threat Severity Breakdown
            </CardTitle>
            <CardDescription>
              Distribution of detected threats by severity
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] rounded-lg" />
            ) : totalThreats > 0 ? (
              <div className="space-y-3">
                {[
                  { label: "Critical", key: "critical", color: "#ef4444" },
                  { label: "High", key: "high", color: "#f97316" },
                  { label: "Medium", key: "medium", color: "#eab308" },
                  { label: "Low", key: "low", color: "#3b82f6" },
                  { label: "Info", key: "info", color: "#6b7280" },
                ].map(({ label, key, color }) => {
                  const count = (sevCounts as Record<string, number>)[key] || 0;
                  const pct =
                    totalThreats > 0
                      ? Math.round((count / totalThreats) * 100)
                      : 0;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-foreground">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(pct, count > 0 ? 3 : 0)}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No threats detected yet
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chain Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Chain Distribution</CardTitle>
            <CardDescription>Events by chain</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-[200px] rounded-lg" />
            ) : chainStats.length > 0 ? (
              <>
                {chainStats.map(({ chain, count, color }) => (
                  <TimelineBar
                    key={chain}
                    label={chain.replace("ethereum-", "").replace("-", " ")}
                    value={count}
                    max={maxChainEvents}
                    color={color}
                  />
                ))}
                <Separator className="my-3" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total Events</span>
                    <span className="font-medium text-foreground">
                      {events?.length ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Chains Monitored
                    </span>
                    <span className="font-medium text-foreground">
                      {chainStats.length}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Globe className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No events recorded yet
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event types + Response actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Event Type Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Event Types</CardTitle>
            <CardDescription>
              Breakdown of on-chain events by type
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[160px] rounded-lg" />
            ) : (
              <div className="space-y-3">
                <TimelineBar
                  label="Deposits"
                  value={eventTypeStats.deposit}
                  max={Math.max(
                    eventTypeStats.deposit,
                    eventTypeStats.withdrawal,
                    1,
                  )}
                  color="#22c55e"
                />
                <TimelineBar
                  label="Withdrawals"
                  value={eventTypeStats.withdrawal}
                  max={Math.max(
                    eventTypeStats.deposit,
                    eventTypeStats.withdrawal,
                    1,
                  )}
                  color="#f97316"
                />
                <TimelineBar
                  label="Pauses"
                  value={eventTypeStats.pause}
                  max={Math.max(
                    eventTypeStats.deposit,
                    eventTypeStats.withdrawal,
                    1,
                  )}
                  color="#ef4444"
                />
                <TimelineBar
                  label="Unpauses"
                  value={eventTypeStats.unpause}
                  max={Math.max(
                    eventTypeStats.deposit,
                    eventTypeStats.withdrawal,
                    1,
                  )}
                  color="#3b82f6"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Response Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Defense Response Summary
            </CardTitle>
            <CardDescription>
              Actions taken in response to detected threats
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[160px] rounded-lg" />
            ) : totalThreats > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Alerts Sent</p>
                  <p className="text-lg font-bold text-foreground mt-1">
                    {responseStats.alertOnly}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Vaults Paused</p>
                  <p className="text-lg font-bold text-foreground mt-1">
                    {responseStats.paused}
                  </p>
                </div>
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="text-lg font-bold text-yellow-400 mt-1">
                    {responseStats.pending}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Dismissed</p>
                  <p className="text-lg font-bold text-muted-foreground mt-1">
                    {responseStats.dismissed}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No defense actions taken yet
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">System Status</CardTitle>
          <CardDescription>Real-time system health metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Active Vaults</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {overview?.activeVaults ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {overview?.pausedVaults ?? 0} paused
              </p>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">WebSocket Clients</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {overview?.wsClients ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">
                live connections
              </p>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Events Today</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {overview?.eventsToday ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">last 24 hours</p>
            </div>
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
              <p className="text-xs text-muted-foreground">Protected TVL</p>
              <p className="text-lg font-bold text-primary mt-1">
                {totalTvl.toFixed(4)} ETH
              </p>
              <p className="text-[10px] text-muted-foreground">
                across {vaults?.length ?? 0} vaults
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
