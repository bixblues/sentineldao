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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  Zap,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Globe,
  Layers,
  Loader2,
} from "lucide-react";
import { THREAT_SEVERITY, CHAINS, type ThreatSeverity } from "@/lib/constants";
import {
  useOverview,
  useVaults,
  useThreats,
  useEvents,
  useWebSocket,
} from "@/lib/hooks";
import type { ThreatEvent, ActivityEvent } from "@/lib/api";
import { api } from "@/lib/api";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
          <div
            className={`rounded-lg p-2.5 ${accent ? "bg-primary/15" : "bg-muted"}`}
          >
            <Icon
              className={`h-4.5 w-4.5 ${accent ? "text-primary" : "text-muted-foreground"}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ThreatLevelIndicator({
  severity,
}: {
  severity: Record<string, number>;
}) {
  const c = severity.critical || 0;
  const h = severity.high || 0;
  const m = severity.medium || 0;
  const total = c + h + m + (severity.low || 0) + (severity.info || 0);

  const threatLevel = c > 0 ? "ELEVATED" : h > 0 ? "GUARDED" : "NORMAL";
  const threatColor =
    c > 0
      ? "text-red-400 border-red-500/30 bg-red-500/5"
      : h > 0
        ? "text-orange-400 border-orange-500/30 bg-orange-500/5"
        : "text-primary border-primary/30 bg-primary/5";

  return (
    <Card className={`border ${threatColor.split(" ").slice(1).join(" ")}`}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Threat Level
            </p>
            <p
              className={`text-xl font-bold mt-1 ${threatColor.split(" ")[0]}`}
            >
              {threatLevel}
            </p>
          </div>
          <div
            className={`rounded-full p-3 ${threatColor.split(" ").slice(1).join(" ")}`}
          >
            <Shield className={`h-5 w-5 ${threatColor.split(" ")[0]}`} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Active threats</span>
            <span className="font-medium text-foreground">{total}</span>
          </div>
          <div className="flex gap-1">
            {c > 0 && (
              <div
                className="h-1.5 rounded-full bg-red-500"
                style={{ flex: c }}
              />
            )}
            {h > 0 && (
              <div
                className="h-1.5 rounded-full bg-orange-500"
                style={{ flex: h }}
              />
            )}
            {m > 0 && (
              <div
                className="h-1.5 rounded-full bg-yellow-500"
                style={{ flex: m }}
              />
            )}
            <div
              className="h-1.5 rounded-full bg-muted"
              style={{ flex: Math.max(1, 10 - c - h - m) }}
            />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {c}{" "}
              Critical
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> {h}{" "}
              High
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> {m}{" "}
              Medium
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChainStatusRow({
  chain,
  color,
  vaultCount,
}: {
  chain: string;
  color: string;
  vaultCount: number;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Globe className="h-4 w-4" style={{ color }} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{chain}</p>
          <p className="text-xs text-muted-foreground">
            {vaultCount} vault{vaultCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <div className="h-2 w-2 rounded-full bg-primary" />
    </div>
  );
}

function EventFeedItem({ event }: { event: ActivityEvent }) {
  const iconMap: Record<string, React.ReactNode> = {
    deposit: <ArrowDownRight className="h-3.5 w-3.5 text-primary" />,
    withdrawal: <ArrowUpRight className="h-3.5 w-3.5 text-orange-400" />,
    pause: <XCircle className="h-3.5 w-3.5 text-destructive" />,
    unpause: <CheckCircle2 className="h-3.5 w-3.5 text-primary" />,
    sentinel_updated: <Shield className="h-3.5 w-3.5 text-yellow-400" />,
  };

  const desc =
    event.type === "deposit"
      ? `Deposit of ${event.amountEth ?? "?"} ETH from ${event.fromAddress?.slice(0, 10)}...`
      : event.type === "withdrawal"
        ? `Withdrawal of ${event.amountEth ?? "?"} ETH to ${event.toAddress?.slice(0, 10)}...`
        : event.type === "pause"
          ? `Emergency pause triggered by ${event.fromAddress?.slice(0, 10)}...`
          : event.type === "unpause"
            ? "Vault unpaused"
            : `Sentinel updated by ${event.fromAddress?.slice(0, 10)}...`;

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 rounded-full bg-muted p-1.5">
        {iconMap[event.type] || <Activity className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">{desc}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{event.chain}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {formatTimeAgo(event.timestamp)}
          </span>
          {event.txHash && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground font-mono">
                {event.txHash.slice(0, 10)}...
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreatFeedItem({ threat }: { threat: ThreatEvent }) {
  const sev = THREAT_SEVERITY[threat.severity];
  return (
    <div className={`rounded-lg border p-3.5 ${sev.bg} ${sev.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${sev.color} ${sev.border}`}
            >
              {sev.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {threat.chain}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {formatTimeAgo(threat.detectedAt)}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground">{threat.type}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {threat.description}
          </p>
        </div>
        <div className="shrink-0">
          {threat.responseStatus === "executed" ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : threat.responseStatus === "dismissed" ? (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Clock className="h-4 w-4 text-yellow-400 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

export function OverviewPage() {
  const {
    data: overview,
    loading: loadingOverview,
    refetch: refetchOverview,
  } = useOverview();
  const { data: vaults, loading: loadingVaults } = useVaults();
  const {
    data: threats,
    loading: loadingThreats,
    refetch: refetchThreats,
  } = useThreats();
  const {
    data: events,
    loading: loadingEvents,
    refetch: refetchEvents,
  } = useEvents({ limit: 20 });

  // Fetch system health data
  const [health, setHealth] = useState<any>(null);
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await api.health();
        setHealth(data);
      } catch {
        // Health endpoint may not be available yet
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket for real-time updates
  useWebSocket(
    useCallback(
      (msg: { type: string }) => {
        if (msg.type === "new_event") {
          refetchEvents();
          refetchOverview();
        }
        if (msg.type === "new_threat") {
          refetchThreats();
          refetchOverview();
        }
      },
      [refetchEvents, refetchOverview, refetchThreats],
    ),
  );

  const loading = loadingOverview || loadingVaults;

  // Compute TVL from vaults
  const totalTvl =
    vaults?.reduce((sum, v) => sum + Number(v.onChain?.balanceEth || 0), 0) ??
    0;

  // Chain breakdown from vaults
  const chainBreakdown = new Map<string, { count: number; color: string }>();
  vaults?.forEach((v) => {
    const existing = chainBreakdown.get(v.chain) || {
      count: 0,
      color: "#627EEA",
    };
    // Find color from CHAINS config
    const chainEntry = Object.values(CHAINS).find(
      (c) =>
        v.chain.includes(c.shortName.toLowerCase().replace(" ", "-")) ||
        v.chainId === c.id,
    );
    chainBreakdown.set(v.chain, {
      count: existing.count + 1,
      color: chainEntry?.color || "#627EEA",
    });
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time protocol defense across {chainBreakdown.size || 1} chain
            {chainBreakdown.size !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/workflows">
            <Button variant="outline" size="sm" className="gap-2">
              <Activity className="h-3.5 w-3.5" />
              Workflow Logs
            </Button>
          </Link>
          <Link href="/vaults">
            <Button size="sm" className="gap-2">
              <Shield className="h-3.5 w-3.5" />
              Add Vault
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <ThreatLevelIndicator severity={overview?.threatsBySeverity || {}} />
          <StatCard
            label="Protected TVL"
            value={`${totalTvl.toFixed(4)} ETH`}
            icon={Layers}
            accent
          />
          <StatCard
            label="Active Vaults"
            value={String(overview?.activeVaults ?? 0)}
            icon={Shield}
          />
          <StatCard
            label="Threats Detected"
            value={String(overview?.totalThreats ?? 0)}
            icon={Zap}
          />
          <StatCard
            label="Events Today"
            value={String(overview?.eventsToday ?? 0)}
            icon={Clock}
          />
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Threats */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Threats</CardTitle>
                <CardDescription>
                  Latest security events across all chains
                </CardDescription>
              </div>
              <Link href="/threats">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  View All <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingThreats ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-[80px] rounded-lg" />
                ))}
              </div>
            ) : threats && threats.length > 0 ? (
              <div className="space-y-3">
                {threats.slice(0, 4).map((threat) => (
                  <ThreatFeedItem key={threat.id} threat={threat} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">All clear</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No threats detected. Your protocols are safe.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {/* Chain Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Chain Status</CardTitle>
              <CardDescription>
                Network health across monitored chains
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {chainBreakdown.size > 0 ? (
                  Array.from(chainBreakdown.entries()).map(
                    ([chain, { count, color }]) => (
                      <ChainStatusRow
                        key={chain}
                        chain={chain}
                        color={color}
                        vaultCount={count}
                      />
                    ),
                  )
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No chains monitored yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* System metrics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">System Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">API Status</span>
                <Badge
                  variant="outline"
                  className="text-green-500 border-green-500/30 text-[10px]"
                >
                  <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> Online
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium text-foreground">
                  {health ? formatUptime(health.uptime) : "..."}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">API Key Auth</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${health?.security?.apiKeyAuth ? "text-green-500 border-green-500/30" : "text-zinc-400 border-zinc-500/30"}`}
                >
                  {health?.security?.apiKeyAuth ? "Enabled" : "Dev Mode"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Webhook HMAC</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${health?.security?.webhookHmac ? "text-green-500 border-green-500/30" : "text-zinc-400 border-zinc-500/30"}`}
                >
                  {health?.security?.webhookHmac ? "Enabled" : "Dev Mode"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Rate Limiting</span>
                <Badge
                  variant="outline"
                  className="text-green-500 border-green-500/30 text-[10px]"
                >
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Audit Logging</span>
                <Badge
                  variant="outline"
                  className="text-green-500 border-green-500/30 text-[10px]"
                >
                  Active
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Defense Executor</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${health?.system?.defense?.configured ? "text-green-500 border-green-500/30" : "text-red-500 border-red-500/30"}`}
                >
                  {health?.system?.defense?.configured ? "Ready" : "No Key"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">CCIP Cross-Chain</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${health?.system?.defense?.ccipConfigured ? "text-green-500 border-green-500/30" : "text-zinc-400 border-zinc-500/30"}`}
                >
                  {health?.system?.defense?.ccipConfigured
                    ? "Configured"
                    : "Not Set"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">CRE Workflow</span>
                <Badge
                  variant="outline"
                  className="text-primary border-primary/30 text-[10px]"
                >
                  {health?.system?.cre?.workflowId || "sentinel-defense"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">WebSocket Clients</span>
                <span className="font-medium text-foreground">
                  {overview?.wsClients ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Detection Patterns
                </span>
                <span className="font-medium text-foreground">
                  {health?.system?.cre?.detectionPatterns?.length ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Activity Feed</CardTitle>
              <CardDescription>
                All on-chain events across monitored protocols
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {events?.length ?? 0} events
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loadingEvents ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-[50px] rounded-lg" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <ScrollArea className="h-[320px]">
              <div className="divide-y divide-border">
                {events.map((event) => (
                  <EventFeedItem key={event.id} event={event} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12">
              <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">
                No events yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Events will appear here when your vaults receive transactions.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
