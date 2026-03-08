"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Circle,
  Wallet,
  Shield,
  Link2,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ExternalLink,
  Zap,
  Settings,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

// Chain configurations
const CHAINS = [
  {
    id: sepolia.id,
    name: "Ethereum Sepolia",
    key: "ethereum-sepolia",
    chain: sepolia,
  },
  {
    id: arbitrumSepolia.id,
    name: "Arbitrum Sepolia",
    key: "arbitrum-sepolia",
    chain: arbitrumSepolia,
  },
  {
    id: baseSepolia.id,
    name: "Base Sepolia",
    key: "base-sepolia",
    chain: baseSepolia,
  },
];

type OnboardingStep =
  | "welcome"
  | "connect_wallet"
  | "deploy_vaults"
  | "setup_ccip"
  | "complete";

interface OnboardingStatus {
  onboardingCompleted: boolean;
  onboardingStep: string;
  walletAddress: string | null;
  vaultCount: number;
  ccipConfigured: boolean;
  ccipSenderAddress: string | null;
  ccipReceiverArbitrum: string | null;
  ccipReceiverBase: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Vault deployment state
  const [deployedVaults, setDeployedVaults] = useState<Record<string, string>>(
    {},
  );
  const [deployingChain, setDeployingChain] = useState<string | null>(null);

  // Manual address input state
  const [manualMode, setManualMode] = useState(false);
  const [manualAddresses, setManualAddresses] = useState({
    sepoliaVault: "",
    arbitrumVault: "",
    baseVault: "",
    ccipSender: "",
    ccipReceiverArbitrum: "",
    ccipReceiverBase: "",
  });

  // Copy state
  const [copied, setCopied] = useState<string | null>(null);

  // Load onboarding status
  const loadStatus = useCallback(async () => {
    try {
      const data = await api.getOnboardingStatus();
      setStatus(data);
      if (data.onboardingCompleted) {
        router.push("/vaults");
        return;
      }
      setCurrentStep(data.onboardingStep as OnboardingStep);
    } catch (error) {
      console.error("Failed to load onboarding status:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!authLoading && user) {
      loadStatus();
    } else if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, loadStatus, router]);

  // Update step in backend
  const updateStep = async (step: OnboardingStep, walletAddr?: string) => {
    setSaving(true);
    try {
      await api.updateOnboardingStep({ step, walletAddress: walletAddr });
      setCurrentStep(step);
      if (step === "complete") {
        router.push("/vaults");
      }
    } catch (error) {
      console.error("Failed to update step:", error);
    } finally {
      setSaving(false);
    }
  };

  // Skip onboarding
  const handleSkip = async () => {
    setSaving(true);
    try {
      await api.skipOnboarding();
      router.push("/vaults");
    } catch (error) {
      console.error("Failed to skip onboarding:", error);
    } finally {
      setSaving(false);
    }
  };

  // Register vault
  const registerVault = async (
    chain: (typeof CHAINS)[0],
    vaultAddress: string,
  ) => {
    try {
      await api.registerVault({
        name: `${chain.name} Vault`,
        address: vaultAddress,
        chain: chain.key,
        chainId: chain.id,
      });
      setDeployedVaults((prev) => ({ ...prev, [chain.key]: vaultAddress }));
    } catch (error) {
      console.error("Failed to register vault:", error);
    }
  };

  // Register CCIP
  const registerCCIP = async () => {
    setSaving(true);
    try {
      await api.registerCCIP({
        senderAddress: manualAddresses.ccipSender || undefined,
        receiverArbitrum: manualAddresses.ccipReceiverArbitrum || undefined,
        receiverBase: manualAddresses.ccipReceiverBase || undefined,
        enabled: true,
      });
      await updateStep("complete");
    } catch (error) {
      console.error("Failed to register CCIP:", error);
    } finally {
      setSaving(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const steps = [
    { id: "welcome", label: "Welcome", icon: Rocket },
    { id: "connect_wallet", label: "Connect Wallet", icon: Wallet },
    { id: "deploy_vaults", label: "Add Vaults", icon: Shield },
    { id: "setup_ccip", label: "CCIP Setup", icon: Link2 },
    { id: "complete", label: "Complete", icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground">
              SentinelDAO Setup
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={saving}
          >
            Skip Setup
          </Button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = step.id === currentStep;
            const isCompleted = index < currentStepIndex;

            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
                      isCompleted
                        ? "bg-primary text-primary-foreground"
                        : isActive
                          ? "bg-primary/20 text-primary border-2 border-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={`text-xs mt-2 ${
                      isActive
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-16 mx-2 ${
                      index < currentStepIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {/* Welcome Step */}
          {currentStep === "welcome" && (
            <Card>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Rocket className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">
                  Welcome to SentinelDAO
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Let's set up your autonomous protocol defense system. This
                  wizard will guide you through connecting your wallet, adding
                  your vaults, and configuring cross-chain defense.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Zap className="h-5 w-5 text-primary" />
                      <span className="font-medium">Quick Start</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Connect your wallet and add your existing vault contracts.
                      Perfect if you've already deployed your infrastructure.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Settings className="h-5 w-5 text-primary" />
                      <span className="font-medium">Full Setup</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Deploy new vaults and CCIP contracts directly from this
                      wizard. We'll guide you through each step.
                    </p>
                  </div>
                </div>

                <div className="flex justify-center pt-4">
                  <Button
                    size="lg"
                    onClick={() => updateStep("connect_wallet")}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Get Started
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Connect Wallet Step */}
          {currentStep === "connect_wallet" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Connect Your Wallet
                </CardTitle>
                <CardDescription>
                  Connect your wallet to deploy contracts and manage your
                  vaults. Your wallet will be used to sign transactions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center py-8">
                  <ConnectButton />

                  {isConnected && address && (
                    <div className="mt-6 text-center">
                      <Badge
                        variant="outline"
                        className="text-primary border-primary"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-2 font-mono">
                        {address.slice(0, 6)}...{address.slice(-4)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => updateStep("welcome")}
                    disabled={saving}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={() => updateStep("deploy_vaults", address)}
                    disabled={!isConnected || saving}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deploy Vaults Step */}
          {currentStep === "deploy_vaults" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Add Your Vaults
                    </CardTitle>
                    <CardDescription>
                      Enter the addresses of your deployed ProtectedVault
                      contracts on each chain you want to monitor.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {Object.keys(deployedVaults).length +
                      (status?.vaultCount || 0)}{" "}
                    / 3 Added
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {CHAINS.map((chain) => {
                  const isDeployed = deployedVaults[chain.key];
                  const inputKey =
                    chain.key === "ethereum-sepolia"
                      ? "sepoliaVault"
                      : chain.key === "arbitrum-sepolia"
                        ? "arbitrumVault"
                        : "baseVault";

                  return (
                    <div
                      key={chain.key}
                      className={`rounded-lg border p-4 ${
                        isDeployed
                          ? "border-primary/50 bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {isDeployed ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                          <span className="font-medium">{chain.name}</span>
                        </div>
                        {isDeployed && (
                          <Badge variant="secondary" className="text-xs">
                            Added
                          </Badge>
                        )}
                      </div>

                      {isDeployed ? (
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-muted-foreground font-mono flex-1 truncate">
                            {isDeployed}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(isDeployed, chain.key)
                            }
                          >
                            {copied === chain.key ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            placeholder="0x..."
                            value={manualAddresses[inputKey]}
                            onChange={(e) =>
                              setManualAddresses((prev) => ({
                                ...prev,
                                [inputKey]: e.target.value,
                              }))
                            }
                            className="font-mono text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() =>
                              registerVault(chain, manualAddresses[inputKey])
                            }
                            disabled={!manualAddresses[inputKey] || saving}
                          >
                            Add Vault
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">
                        Don't have vaults deployed?
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        You can deploy ProtectedVault contracts using Foundry.
                        Check our{" "}
                        <a
                          href="https://github.com/sentineldao/contracts"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          deployment guide
                        </a>{" "}
                        for instructions.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => updateStep("connect_wallet")}
                    disabled={saving}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={() => updateStep("setup_ccip")}
                    disabled={
                      Object.keys(deployedVaults).length === 0 &&
                      (status?.vaultCount || 0) === 0
                    }
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Continue to CCIP Setup
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* CCIP Setup Step */}
          {currentStep === "setup_ccip" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-primary" />
                  Configure CCIP Cross-Chain Defense
                </CardTitle>
                <CardDescription>
                  Enter your Chainlink CCIP contract addresses to enable
                  cross-chain emergency pause functionality.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>CCIP Sender Address (Sepolia)</Label>
                    <Input
                      placeholder="0x..."
                      value={manualAddresses.ccipSender}
                      onChange={(e) =>
                        setManualAddresses((prev) => ({
                          ...prev,
                          ccipSender: e.target.value,
                        }))
                      }
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your SentinelCCIPSender contract on Ethereum Sepolia
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>CCIP Receiver Address (Arbitrum Sepolia)</Label>
                    <Input
                      placeholder="0x..."
                      value={manualAddresses.ccipReceiverArbitrum}
                      onChange={(e) =>
                        setManualAddresses((prev) => ({
                          ...prev,
                          ccipReceiverArbitrum: e.target.value,
                        }))
                      }
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>CCIP Receiver Address (Base Sepolia)</Label>
                    <Input
                      placeholder="0x..."
                      value={manualAddresses.ccipReceiverBase}
                      onChange={(e) =>
                        setManualAddresses((prev) => ({
                          ...prev,
                          ccipReceiverBase: e.target.value,
                        }))
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <h4 className="text-sm font-medium mb-2">
                    CCIP Setup Instructions
                  </h4>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Deploy SentinelCCIPSender on Ethereum Sepolia</li>
                    <li>
                      Deploy SentinelCCIPReceiver on Arbitrum & Base Sepolia
                    </li>
                    <li>Fund the sender contract with LINK tokens</li>
                    <li>
                      Set receivers as sentinels on your destination vaults
                    </li>
                  </ol>
                  <a
                    href="https://docs.chain.link/ccip"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
                  >
                    View CCIP Documentation
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => updateStep("deploy_vaults")}
                    disabled={saving}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => updateStep("complete")}
                      disabled={saving}
                    >
                      Skip CCIP
                    </Button>
                    <Button onClick={registerCCIP} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Complete Setup
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Complete Step */}
          {currentStep === "complete" && (
            <Card>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Setup Complete!</CardTitle>
                <CardDescription className="text-base mt-2">
                  Your SentinelDAO defense system is now configured and ready to
                  protect your vaults.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-border p-4 text-center">
                    <Shield className="h-6 w-6 text-primary mx-auto mb-2" />
                    <p className="font-medium">
                      {status?.vaultCount || Object.keys(deployedVaults).length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vaults Protected
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-4 text-center">
                    <Link2 className="h-6 w-6 text-primary mx-auto mb-2" />
                    <p className="font-medium">
                      {status?.ccipConfigured ? "Enabled" : "Disabled"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      CCIP Defense
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-4 text-center">
                    <Zap className="h-6 w-6 text-primary mx-auto mb-2" />
                    <p className="font-medium">Active</p>
                    <p className="text-xs text-muted-foreground">
                      Threat Monitoring
                    </p>
                  </div>
                </div>

                <div className="flex justify-center pt-4">
                  <Button size="lg" onClick={() => router.push("/vaults")}>
                    Go to Dashboard
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
