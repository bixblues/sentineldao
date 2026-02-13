"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Workflow,
  Activity,
  Shield,
  Zap,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  Terminal,
  ChevronRight,
  Radio,
  RefreshCw,
  BarChart3,
  XCircle,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

const WORKFLOW_ARCHITECTURE = [
  {
    step: 1,
    title: "EVM Log Trigger",
    description:
      "CRE DON monitors vault contract for Deposit/Withdrawal/Pause events on-chain",
    icon: Radio,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    step: 2,
    title: "Consensus Verification",
    description:
      "Multiple DON nodes independently verify the event via BFT consensus",
    icon: Shield,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    step: 3,
    title: "Threat Analysis",
    description:
      "Callback decodes event, evaluates thresholds, detects flash loans & TVL drains",
    icon: Eye,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    step: 4,
    title: "Defense Action",
    description:
      "Triggers emergency pause via CCIP cross-chain or notifies backend",
    icon: Zap,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "border-red-500/30 bg-red-500/10 text-red-500",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-500",
  medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500",
  low: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  info: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

export function WorkflowsPage() {
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(
    "sentinel-defense",
  );
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [wfRes, execRes] = await Promise.all([
        api.getWorkflows(),
        api.getWorkflowExecutions("sentinel-defense", 20),
      ]);
      setWorkflows(wfRes.workflows);
      setExecutions(execRes.executions);
    } catch (err: any) {
      setError(err.message || "Failed to load workflow data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRE Workflows</h1>
          <p className="text-muted-foreground">
            Chainlink Runtime Environment workflows for automated vault defense
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Badge
            variant="outline"
            className={
              workflows.length > 0 && workflows[0]?.status === "active"
                ? "border-green-500/30 bg-green-500/10 text-green-500"
                : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
            }
          >
            <Activity className="mr-1 h-3 w-3" />
            {workflows.length > 0 && workflows[0]?.status === "active"
              ? "CRE Active"
              : "CRE Inactive"}
          </Badge>
          <a
            href="https://cre.chain.link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              CRE Platform
            </Button>
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-500">{error}</span>
        </div>
      )}

      {/* Architecture Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            Workflow Architecture
          </CardTitle>
          <CardDescription>
            How CRE orchestrates decentralized vault defense
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {WORKFLOW_ARCHITECTURE.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.step} className="relative">
                  <div className="rounded-lg border border-border p-4 h-full">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${step.bgColor}`}
                      >
                        <Icon className={`h-4 w-4 ${step.color}`} />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        Step {step.step}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold mb-1">{step.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                  {i < WORKFLOW_ARCHITECTURE.length - 1 && (
                    <ChevronRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 z-10" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Active Workflows */}
      {loading && workflows.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Active Workflows</h2>
          {workflows.map((workflow) => (
            <Card
              key={workflow.id}
              className="overflow-hidden cursor-pointer transition-all hover:border-primary/30"
              onClick={() =>
                setExpandedWorkflow(
                  expandedWorkflow === workflow.id ? null : workflow.id,
                )
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Workflow className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {workflow.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {workflow.triggerType} on {workflow.chain}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        workflow.status === "active"
                          ? "border-green-500/30 bg-green-500/10 text-green-500"
                          : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
                      }
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      {workflow.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              {expandedWorkflow === workflow.id && (
                <CardContent
                  className="border-t border-border pt-4 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm text-muted-foreground">
                    {workflow.description}
                  </p>

                  {/* Live Stats */}
                  {workflow.stats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <div className="text-lg font-bold">
                          {workflow.stats.totalEventsDetected}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Total Events
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <div className="text-lg font-bold">
                          {workflow.stats.eventsToday}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Events Today
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <div className="text-lg font-bold text-red-500">
                          {workflow.stats.totalThreatsRaised}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Threats Raised
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <div className="text-lg font-bold text-green-500">
                          {workflow.stats.activeVaults}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Active Vaults
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <div className="text-lg font-bold text-amber-500">
                          {workflow.stats.pausedVaults}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Paused Vaults
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Config Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Monitored Vault
                      </div>
                      <code className="text-xs font-mono break-all">
                        {workflow.vaultAddress}
                      </code>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Alert Threshold
                      </div>
                      <div className="text-sm font-semibold">
                        {workflow.thresholdEth} ETH
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Chain
                      </div>
                      <div className="text-sm font-semibold">
                        {workflow.chain}
                      </div>
                    </div>
                  </div>

                  {/* Monitored Events */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Monitored Events
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(workflow.monitoredEvents || []).map((event: string) => (
                        <Badge
                          key={event}
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Capabilities */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Capabilities
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(workflow.capabilities || []).map((cap: string) => (
                        <Badge key={cap} variant="outline" className="text-xs">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Last Trigger */}
                  {workflow.lastTrigger && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Radio className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">
                          Last Trigger
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">
                          {workflow.lastTrigger.type}
                        </Badge>
                        <span>{workflow.lastTrigger.chain}</span>
                        {workflow.lastTrigger.txHash && (
                          <a
                            href={`https://sepolia.etherscan.io/tx/${workflow.lastTrigger.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono hover:text-primary transition-colors"
                          >
                            {workflow.lastTrigger.txHash.slice(0, 10)}...
                            {workflow.lastTrigger.txHash.slice(-6)}
                          </a>
                        )}
                        {workflow.lastTrigger.timestamp && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(
                              workflow.lastTrigger.timestamp,
                            ).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Last Threat */}
                  {workflow.lastThreat && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-medium">
                          Last Threat Detected
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            SEVERITY_COLORS[workflow.lastThreat.severity] || ""
                          }
                        >
                          {workflow.lastThreat.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {workflow.lastThreat.description}
                      </p>
                    </div>
                  )}

                  {/* Recent Executions */}
                  {executions.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          Recent Executions ({executions.length})
                        </span>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {executions.slice(0, 10).map((exec) => (
                          <div
                            key={exec.id}
                            className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={SEVERITY_COLORS[exec.severity] || ""}
                              >
                                {exec.severity}
                              </Badge>
                              <span className="font-medium">
                                {exec.threatType}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <Badge
                                variant={
                                  exec.responseStatus === "executed"
                                    ? "default"
                                    : exec.responseStatus === "failed"
                                      ? "destructive"
                                      : "secondary"
                                }
                                className="text-xs"
                              >
                                {exec.responseStatus}
                              </Badge>
                              {exec.txHash && (
                                <a
                                  href={`https://sepolia.etherscan.io/tx/${exec.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono hover:text-primary"
                                >
                                  {exec.txHash.slice(0, 8)}...
                                </a>
                              )}
                              {exec.timestamp && (
                                <span>
                                  {new Date(
                                    exec.timestamp,
                                  ).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Simulation Command */}
                  <div className="rounded-lg bg-zinc-950 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className="h-4 w-4 text-green-400" />
                      <span className="text-xs font-medium text-green-400">
                        Run Simulation
                      </span>
                    </div>
                    <code className="text-xs text-zinc-300 font-mono block whitespace-pre-wrap">
                      {`cre workflow simulate sentinel-defense \\
  --target staging-settings \\
  --evm-tx-hash <DEPOSIT_TX_HASH> \\
  --evm-event-index 0 \\
  --non-interactive --trigger-index 0`}
                    </code>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* CRE SDK Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            About Chainlink CRE
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Decentralized Execution</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                CRE workflows run across a Decentralized Oracle Network (DON).
                Every operation — event detection, data fetching, computation —
                is independently executed by multiple nodes and verified via
                Byzantine Fault Tolerant consensus.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">TypeScript SDK</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Built with <code className="text-xs">@chainlink/cre-sdk</code>{" "}
                using the trigger-and-callback model. Workflows are compiled to
                WebAssembly and deployed to the DON for tamper-proof,
                consensus-verified execution.
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <a
              href="https://docs.chain.link/cre"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                CRE Docs
              </Button>
            </a>
            <a
              href="https://docs.chain.link/cre/reference/sdk/triggers/evm-log-trigger-ts"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                EVM Log Trigger Reference
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
