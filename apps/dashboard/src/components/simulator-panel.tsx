"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Zap,
  X,
  Flame,
  Activity,
  ArrowDownToLine,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  TrendingDown,
  ShieldOff,
} from "lucide-react";
import { api, type WSMessage, type Vault } from "@/lib/api";
import { useVaults, useWebSocket } from "@/lib/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SimStep = {
  step: number;
  total: number;
  message: string;
  txHash?: string;
};

export function SimulatorPanel() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    txHash?: string;
  } | null>(null);
  const [steps, setSteps] = useState<SimStep[]>([]);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceAddress, setBalanceAddress] = useState<string | null>(null);
  const { data: vaults } = useVaults();
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);

  // Listen for simulation WebSocket events via callback
  useWebSocket((msg: WSMessage) => {
    if (msg.type === "simulation_step" && msg.payload) {
      setSteps((prev) => [...prev, msg.payload as SimStep]);
    }
  });

  // Load balance on open
  useEffect(() => {
    if (open && !balance) {
      api
        .getSimulatorBalance()
        .then((data) => {
          setBalance(data.balance);
          setBalanceAddress(data.address);
        })
        .catch(() => {});
    }
  }, [open, balance]);

  const selectedVault =
    vaults?.find((v) => v.id === selectedVaultId) || vaults?.[0] || null;

  function getExplorerUrl(chain: string, txHash: string): string {
    const explorers: Record<string, string> = {
      "ethereum-sepolia": "https://sepolia.etherscan.io",
      "arbitrum-sepolia": "https://sepolia.arbiscan.io",
      "base-sepolia": "https://sepolia.basescan.org",
    };
    return `${explorers[chain] || "https://sepolia.etherscan.io"}/tx/${txHash}`;
  }

  async function runSimulation(type: string, count?: number) {
    setRunning(true);
    setResult(null);
    setSteps([]);
    try {
      const data = await api.simulateAttack({
        type,
        vaultId: selectedVault?.id,
        count,
      });
      setResult({
        success: data.success,
        message: data.message,
        txHash: data.txHash,
      });
    } catch (err: any) {
      setResult({
        success: false,
        message: err?.message || "Simulation failed",
      });
    } finally {
      setRunning(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-destructive-foreground shadow-lg hover:bg-destructive/90 transition-all hover:scale-105 active:scale-95"
      >
        <Zap className="h-4 w-4" />
        <span className="text-sm font-medium">Simulate Attack</span>
      </button>
    );
  }

  const defaultVault = vaults?.[0];

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px]">
      <Card className="shadow-2xl border-destructive/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-destructive/10 p-1.5">
                <Zap className="h-4 w-4 text-destructive" />
              </div>
              <CardTitle className="text-sm">Attack Simulator</CardTitle>
              <Badge
                variant="outline"
                className="text-[10px] border-destructive/30 text-destructive"
              >
                Demo Mode
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {balance && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Wallet: {balanceAddress?.slice(0, 8)}...
              {balanceAddress?.slice(-4)} | Balance:{" "}
              {Number(balance).toFixed(4)} ETH
            </p>
          )}
          {vaults && vaults.length > 0 && (
            <Select
              value={selectedVault?.id || ""}
              onValueChange={(val) => setSelectedVaultId(val)}
            >
              <SelectTrigger className="h-7 text-[11px] mt-1">
                <SelectValue placeholder="Select target vault" />
              </SelectTrigger>
              <SelectContent>
                {vaults.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.name} ({v.chain})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Attack buttons */}
          <div className="space-y-2">
            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9 text-xs gap-2 justify-start"
              onClick={() => runSimulation("large_deposit")}
              disabled={running}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Flame className="h-3.5 w-3.5" />
              )}
              Large Deposit (Whale Alert)
              <span className="ml-auto text-[10px] opacity-70">
                &gt; {selectedVault?.alertThresholdEth || 0.1} ETH
              </span>
            </Button>

            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9 text-xs gap-2 justify-start"
              onClick={() => runSimulation("rapid_transactions", 6)}
              disabled={running}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Activity className="h-3.5 w-3.5" />
              )}
              Rapid Transactions (Flash Drain)
              <span className="ml-auto text-[10px] opacity-70">6 txns</span>
            </Button>

            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9 text-xs gap-2 justify-start"
              onClick={() => runSimulation("flash_loan")}
              disabled={running}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Flash Loan Attack
              <span className="ml-auto text-[10px] opacity-70">
                deposit+withdraw
              </span>
            </Button>

            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9 text-xs gap-2 justify-start"
              onClick={() => runSimulation("tvl_drain")}
              disabled={running}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              TVL Drain (60%)
              <span className="ml-auto text-[10px] opacity-70">
                vault drain
              </span>
            </Button>

            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9 text-xs gap-2 justify-start"
              onClick={() => runSimulation("unauthorized_pause")}
              disabled={running}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              Unauthorized Pause
              <span className="ml-auto text-[10px] opacity-70">emergency</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs gap-2 justify-start"
              onClick={() => runSimulation("withdrawal")}
              disabled={running}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-3.5 w-3.5" />
              )}
              Withdrawal
              <span className="ml-auto text-[10px] opacity-70">0.01 ETH</span>
            </Button>
          </div>

          {/* Live steps */}
          {steps.length > 0 && (
            <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1.5 max-h-[160px] overflow-y-auto">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="text-muted-foreground shrink-0 w-8">
                    [{step.step}/{step.total}]
                  </span>
                  <span className="text-foreground">{step.message}</span>
                </div>
              ))}
              {running && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing...
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className={`rounded-lg border p-3 ${
                result.success
                  ? "bg-primary/5 border-primary/20"
                  : "bg-destructive/5 border-destructive/20"
              }`}
            >
              <div className="flex items-start gap-2">
                {result.success ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-xs text-foreground">{result.message}</p>
                  {result.txHash && (
                    <a
                      href={getExplorerUrl(
                        selectedVault?.chain || "ethereum-sepolia",
                        result.txHash,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-1"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      View on Explorer
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            Sends real transactions on {selectedVault?.chain || "testnet"}.
            Watch the dashboard for live detection.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
