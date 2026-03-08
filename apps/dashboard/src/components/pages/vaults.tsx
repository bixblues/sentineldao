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
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Plus,
  ExternalLink,
  Pause,
  Play,
  Copy,
  MoreVertical,
  Activity,
  TrendingUp,
  AlertTriangle,
  Globe,
  Loader2,
  Link2,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVaults } from "@/lib/hooks";
import { api, type Vault } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAINS } from "@/lib/constants";
import { useState, useEffect } from "react";

function getChainColor(chain: string, chainId: number): string {
  const entry = Object.values(CHAINS).find((c) => c.id === chainId);
  return entry?.color || "#627EEA";
}

function getChainDisplayName(chain: string): string {
  const map: Record<string, string> = {
    "ethereum-sepolia": "Ethereum Sepolia",
    "arbitrum-sepolia": "Arbitrum Sepolia",
    "base-sepolia": "Base Sepolia",
  };
  return map[chain] || chain;
}

function VaultCard({
  vault,
  onRefetch,
}: {
  vault: Vault;
  onRefetch: () => void;
}) {
  const [actionLoading, setActionLoading] = useState<
    "pause" | "unpause" | null
  >(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  async function handlePause() {
    setActionLoading("pause");
    setLastTxHash(null);
    try {
      const result = await api.pauseVault(vault.id);
      setLastTxHash(result.txHash);
      onRefetch();
    } catch (err) {
      console.error("Pause failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnpause() {
    setActionLoading("unpause");
    setLastTxHash(null);
    try {
      const result = await api.unpauseVault(vault.id);
      setLastTxHash(result.txHash);
      onRefetch();
    } catch (err) {
      console.error("Unpause failed:", err);
    } finally {
      setActionLoading(null);
    }
  }
  const statusConfig = {
    monitoring: {
      label: "Monitoring",
      color: "text-primary",
      dot: "bg-primary",
      badge: "border-primary/30 bg-primary/10",
    },
    paused: {
      label: "Paused",
      color: "text-orange-400",
      dot: "bg-orange-400",
      badge: "border-orange-500/30 bg-orange-500/10",
    },
    pending: {
      label: "Pending",
      color: "text-yellow-400",
      dot: "bg-yellow-400",
      badge: "border-yellow-500/30 bg-yellow-500/10",
    },
  };

  const status = statusConfig[vault.status];
  const chainColor = getChainColor(vault.chain, vault.chainId);
  const balanceEth = vault.onChain?.balanceEth || "0";

  return (
    <Card className="group hover:border-primary/30 transition-all duration-200">
      <CardContent className="pt-5 pb-4 px-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${chainColor}15` }}
            >
              <Shield className="h-5 w-5" style={{ color: chainColor }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {vault.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground font-mono">
                  {vault.address.slice(0, 8)}...{vault.address.slice(-6)}
                </span>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => navigator.clipboard.writeText(vault.address)}
                >
                  <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => (window.location.href = "/threats")}
              >
                <Activity className="mr-2 h-4 w-4" /> View Events
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const explorers: Record<string, string> = {
                    "ethereum-sepolia": "https://sepolia.etherscan.io",
                    "arbitrum-sepolia": "https://sepolia.arbiscan.io",
                    "base-sepolia": "https://sepolia.basescan.org",
                  };
                  const base =
                    explorers[vault.chain] || "https://sepolia.etherscan.io";
                  window.open(`${base}/address/${vault.address}`, "_blank");
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" /> View on Explorer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(vault.address)}
              >
                <Copy className="mr-2 h-4 w-4" /> Copy Address
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {vault.status === "monitoring" ? (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={handlePause}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "pause" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="mr-2 h-4 w-4" />
                  )}
                  {actionLoading === "pause" ? "Pausing..." : "Emergency Pause"}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="text-primary"
                  onClick={handleUnpause}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "unpause" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {actionLoading === "unpause"
                    ? "Unpausing..."
                    : "Resume Monitoring"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Chain & Status */}
        <div className="flex items-center gap-2 mb-4">
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0.5"
            style={{ borderColor: `${chainColor}40`, color: chainColor }}
          >
            <Globe className="h-2.5 w-2.5 mr-1" />
            {getChainDisplayName(vault.chain)}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] px-2 py-0.5 ${status.badge} ${status.color}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${status.dot} mr-1 inline-block ${vault.status === "monitoring" ? "animate-pulse" : ""}`}
            />
            {status.label}
          </Badge>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {balanceEth} ETH
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paused</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {vault.onChain?.paused ? "Yes" : "No"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Threshold</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {vault.alertThresholdEth} ETH
            </p>
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Sentinel & Owner */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Sentinel</span>
            <span className="font-mono text-foreground">
              {vault.onChain?.sentinel
                ? `${vault.onChain.sentinel.slice(0, 8)}...${vault.onChain.sentinel.slice(-4)}`
                : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Owner</span>
            <span className="font-mono text-foreground">
              {vault.onChain?.owner
                ? `${vault.onChain.owner.slice(0, 8)}...${vault.onChain.owner.slice(-4)}`
                : "—"}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2">
          {vault.status === "monitoring" ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs gap-1.5 flex-1"
              onClick={handlePause}
              disabled={actionLoading !== null}
            >
              {actionLoading === "pause" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Pause className="h-3 w-3" />
              )}
              {actionLoading === "pause"
                ? "Pausing on-chain..."
                : "Emergency Pause"}
            </Button>
          ) : vault.status === "paused" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 flex-1 text-primary border-primary/30"
              onClick={handleUnpause}
              disabled={actionLoading !== null}
            >
              {actionLoading === "unpause" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {actionLoading === "unpause"
                ? "Unpausing on-chain..."
                : "Resume Monitoring"}
            </Button>
          ) : null}
          {lastTxHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline font-mono"
            >
              tx: {lastTxHash.slice(0, 10)}...
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AddVaultForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("");
  const [threshold, setThreshold] = useState("0.1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chainIdMap: Record<string, number> = {
    "ethereum-sepolia": 11155111,
    "arbitrum-sepolia": 421614,
    "base-sepolia": 84532,
  };

  async function handleSubmit() {
    if (!name || !address || !chain) {
      setError("All fields are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.createVault({
        name,
        address,
        chain,
        chainId: chainIdMap[chain] || 11155111,
        alertThresholdEth: Number(threshold) || 0.1,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create vault");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="vault-name">Vault Name</Label>
        <Input
          id="vault-name"
          placeholder="e.g., Treasury Vault"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vault-address">Contract Address</Label>
        <Input
          id="vault-address"
          placeholder="0x..."
          className="font-mono"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Chain</Label>
        <Select value={chain} onValueChange={setChain}>
          <SelectTrigger>
            <SelectValue placeholder="Select chain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ethereum-sepolia">Ethereum Sepolia</SelectItem>
            <SelectItem value="arbitrum-sepolia">Arbitrum Sepolia</SelectItem>
            <SelectItem value="base-sepolia">Base Sepolia</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Alert Threshold (ETH)</Label>
        <Input
          type="number"
          placeholder="0.1"
          step="0.01"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full mt-2" onClick={handleSubmit} disabled={loading}>
        <Shield className="h-4 w-4 mr-2" />
        {loading ? "Creating..." : "Start Monitoring"}
      </Button>
    </div>
  );
}

export function VaultsPage() {
  const { data: vaults, loading, refetch } = useVaults();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ccipLoading, setCcipLoading] = useState(false);
  const [ccipResult, setCcipResult] = useState<{
    localPause: { txHash: string; chain: string; explorerUrl: string } | null;
    ccipMessages: Array<{
      txHash: string;
      messageId: string;
      chain: string;
      fees: string;
      explorerUrl: string;
      ccipExplorerUrl: string;
    }>;
  } | null>(null);
  const [ccipStatus, setCcipStatus] = useState<{
    linkBalance: string;
    configured: boolean;
  } | null>(null);

  // Fetch CCIP status on mount
  useEffect(() => {
    api
      .getCCIPStatus()
      .then(setCcipStatus)
      .catch(() => {});
  }, []);

  async function handleCCIPPauseAll() {
    setCcipLoading(true);
    setCcipResult(null);
    try {
      const result = await api.ccipPauseAll();
      setCcipResult(result);
      refetch();
    } catch (err) {
      console.error("CCIP pause failed:", err);
    } finally {
      setCcipLoading(false);
    }
  }

  const activeCount =
    vaults?.filter((v) => v.status === "monitoring").length ?? 0;
  const totalTvl =
    vaults?.reduce((sum, v) => sum + Number(v.onChain?.balanceEth || 0), 0) ??
    0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Protected Vaults
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage and monitor your protected smart contracts
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Add Vault
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Protected Vault</DialogTitle>
              <DialogDescription>
                Register a new smart contract for SentinelDAO monitoring and
                protection.
              </DialogDescription>
            </DialogHeader>
            <AddVaultForm
              onSuccess={() => {
                setDialogOpen(false);
                refetch();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Vaults</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {vaults?.length ?? 0}
                  </p>
                </div>
                <Shield className="h-4 w-4 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Active Monitoring
                  </p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {activeCount}
                  </p>
                </div>
                <Activity className="h-4 w-4 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total TVL</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {totalTvl.toFixed(4)} ETH
                  </p>
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Paused Vaults</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {vaults?.filter((v) => v.status === "paused").length ?? 0}
                  </p>
                </div>
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CCIP Cross-Chain Defense - only show if vaults exist and CCIP is configured */}
      {vaults && vaults.length > 0 && ccipStatus?.configured && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Link2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    Chainlink CCIP Cross-Chain Defense
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-primary/30 text-primary"
                    >
                      LIVE
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pause all vaults across all chains simultaneously via
                    Chainlink CCIP messaging
                    {ccipStatus && (
                      <span className="ml-2 text-primary">
                        ({ccipStatus.linkBalance} LINK available)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {ccipResult && (
                  <div className="text-right text-xs space-y-0.5">
                    {ccipResult.localPause && (
                      <a
                        href={ccipResult.localPause.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline block"
                      >
                        Sepolia paused
                      </a>
                    )}
                    {ccipResult.ccipMessages.map((msg) => (
                      <a
                        key={msg.messageId}
                        href={msg.ccipExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline block"
                      >
                        CCIP to{" "}
                        {msg.chain === "arbitrum-sepolia" ? "Arb" : "Base"}:{" "}
                        {msg.messageId.slice(0, 10)}...
                      </a>
                    ))}
                  </div>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={handleCCIPPauseAll}
                  disabled={ccipLoading}
                >
                  {ccipLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {ccipLoading ? "Sending CCIP..." : "Cross-Chain Pause All"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vault grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-[280px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vaults?.map((vault) => (
            <VaultCard key={vault.id} vault={vault} onRefetch={refetch} />
          ))}

          {/* Add vault placeholder */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors flex flex-col items-center justify-center gap-3 p-8 min-h-[280px] group">
                <div className="rounded-full bg-muted p-3 group-hover:bg-primary/10 transition-colors">
                  <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    Add New Vault
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Register a contract for monitoring
                  </p>
                </div>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Protected Vault</DialogTitle>
                <DialogDescription>
                  Register a new smart contract for SentinelDAO monitoring and
                  protection.
                </DialogDescription>
              </DialogHeader>
              <AddVaultForm
                onSuccess={() => {
                  setDialogOpen(false);
                  refetch();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
