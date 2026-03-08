"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  MessageSquare,
  Shield,
  Webhook,
  Zap,
  Globe,
  Key,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Plus,
  Loader2,
  Send,
  User,
  Building2,
  LogOut,
  Mail,
  Calendar,
} from "lucide-react";
import { useSettings, useAlertRules, useIntegrations } from "@/lib/hooks";
import { api, type AlertRule, type Integration } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";

// ─── Profile Section ────────────────────────────────────────────────
function ProfileSection() {
  const { user, tenant, membership, logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      setIsLoggingOut(false);
    }
  };

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const planBadgeColor = {
    free: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    pro: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    enterprise: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  const roleBadgeColor = {
    owner: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    operator: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    viewer: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  return (
    <div className="space-y-6">
      {/* User Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Information</CardTitle>
          <CardDescription>
            Your account details and authentication status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <User className="w-8 h-8 text-emerald-500" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {user?.name || "N/A"}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="flex items-center gap-2 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-sm text-foreground">
                    {user?.email || "N/A"}
                  </p>
                  {user?.emailVerified && (
                    <Badge
                      variant="outline"
                      className="text-emerald-400 border-emerald-500/30 text-[10px] ml-1"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">User ID</Label>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  {user?.id || "N/A"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organization Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
          <CardDescription>
            Your organization details and membership role
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-blue-500" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Organization Name
                </Label>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {tenant?.name || "N/A"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Plan</Label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        tenant?.plan
                          ? planBadgeColor[tenant.plan]
                          : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                      }`}
                    >
                      {tenant?.plan || "N/A"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Status
                  </Label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        tenant?.status === "active"
                          ? "text-emerald-400 border-emerald-500/30"
                          : "text-orange-400 border-orange-500/30"
                      }`}
                    >
                      {tenant?.status || "N/A"}
                    </Badge>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Your Role
                </Label>
                <div className="mt-1">
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize ${
                      membership?.role
                        ? roleBadgeColor[membership.role]
                        : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                    }`}
                  >
                    {membership?.role || "N/A"}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Organization ID
                </Label>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  {tenant?.id || "N/A"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Actions</CardTitle>
          <CardDescription>
            Manage your session and account settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Sign Out
                  </p>
                  <p className="text-xs text-muted-foreground">
                    End your current session
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing out...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Alert Rule Card (real data) ────────────────────────────────────
function AlertRuleCard({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: AlertRule;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [enabled, setEnabled] = useState(rule.enabled);
  const [severity, setSeverity] = useState(rule.severity);
  const [responseType, setResponseType] = useState(rule.responseType);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const params = (rule.params || {}) as Record<string, unknown>;
  const [thresholdEth, setThresholdEth] = useState(
    String(params.thresholdEth ?? "0.1"),
  );
  const [maxTxns, setMaxTxns] = useState(
    String(params.maxTxnsPerMinute ?? "5"),
  );

  const iconMap: Record<string, React.ReactNode> = {
    large_transfer: <AlertTriangle className="h-4 w-4 text-orange-400" />,
    rapid_transactions: <Zap className="h-4 w-4 text-red-400" />,
    unauthorized_access: <Shield className="h-4 w-4 text-primary" />,
    custom: <Globe className="h-4 w-4 text-muted-foreground" />,
  };

  async function handleToggle(checked: boolean) {
    setEnabled(checked);
    await api.updateRule(rule.id, { enabled: checked } as Partial<AlertRule>);
    onUpdate();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const newParams: Record<string, unknown> = { ...params };
      if (rule.type === "large_transfer")
        newParams.thresholdEth = Number(thresholdEth);
      if (rule.type === "rapid_transactions")
        newParams.maxTxnsPerMinute = Number(maxTxns);

      await api.updateRule(rule.id, {
        severity,
        responseType,
        params: newParams,
      } as Partial<AlertRule>);
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteRule(rule.id);
      onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {iconMap[rule.type] || iconMap.custom}
          <span className="text-sm font-medium text-foreground">
            {rule.name}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {rule.type}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={handleToggle} />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {rule.type === "large_transfer" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Threshold (ETH)</Label>
            <Input
              type="number"
              value={thresholdEth}
              onChange={(e) => setThresholdEth(e.target.value)}
              step="0.01"
              className="h-8 text-sm"
            />
          </div>
        )}
        {rule.type === "rapid_transactions" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Max Txns / Minute</Label>
            <Input
              type="number"
              value={maxTxns}
              onChange={(e) => setMaxTxns(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Severity</Label>
          <Select
            value={severity}
            onValueChange={(v) => setSeverity(v as AlertRule["severity"])}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Response</Label>
          <Select
            value={responseType}
            onValueChange={(v) =>
              setResponseType(v as AlertRule["responseType"])
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alert_only">Alert only</SelectItem>
              <SelectItem value="pause_single">Pause single vault</SelectItem>
              <SelectItem value="pause_all_ccip">
                Cross-chain pause (CCIP)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="gap-1.5"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Save
      </Button>
    </div>
  );
}

// ─── Add Alert Rule Form ───────────────────────────────────────────
function AddAlertRuleForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<string>("large_transfer");
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState<AlertRule["severity"]>("medium");
  const [responseType, setResponseType] =
    useState<AlertRule["responseType"]>("alert_only");
  const [thresholdEth, setThresholdEth] = useState("0.1");
  const [maxTxns, setMaxTxns] = useState("5");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name) return;
    setCreating(true);
    try {
      const params: Record<string, unknown> = {};
      if (type === "large_transfer") {
        params.thresholdEth = Number(thresholdEth);
      } else if (type === "rapid_transactions") {
        params.maxTxnsPerMinute = Number(maxTxns);
      } else if (type === "unauthorized_access") {
        params.monitoredFunctions = ["setSentinel", "transferOwnership"];
      }

      await api.createRule({
        type: type as AlertRule["type"],
        name,
        enabled: true,
        severity,
        responseType,
        params,
      } as Partial<AlertRule>);

      // Reset form
      setName("");
      setType("large_transfer");
      setSeverity("medium");
      setResponseType("alert_only");
      setThresholdEth("0.1");
      setMaxTxns("5");
      onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
      <p className="text-sm font-medium text-foreground">Add Alert Rule</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Rule Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="large_transfer">Large Transfer</SelectItem>
              <SelectItem value="rapid_transactions">
                Rapid Transactions
              </SelectItem>
              <SelectItem value="unauthorized_access">
                Unauthorized Access
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Rule Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. High Value Transfer Alert"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {type === "large_transfer" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Threshold (ETH)</Label>
            <Input
              type="number"
              value={thresholdEth}
              onChange={(e) => setThresholdEth(e.target.value)}
              step="0.01"
              className="h-8 text-sm"
            />
          </div>
        )}
        {type === "rapid_transactions" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Max Txns / Minute</Label>
            <Input
              type="number"
              value={maxTxns}
              onChange={(e) => setMaxTxns(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Severity</Label>
          <Select
            value={severity}
            onValueChange={(v) => setSeverity(v as AlertRule["severity"])}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Response Type</Label>
          <Select
            value={responseType}
            onValueChange={(v) =>
              setResponseType(v as AlertRule["responseType"])
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alert_only">Alert Only</SelectItem>
              <SelectItem value="pause_single">Pause Vault</SelectItem>
              <SelectItem value="pause_all_ccip">Pause All (CCIP)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        size="sm"
        onClick={handleCreate}
        disabled={creating || !name}
        className="gap-1.5"
      >
        {creating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Add Alert Rule
      </Button>
    </div>
  );
}

// ─── Integration Card (real data) ───────────────────────────────────
const INTEGRATION_META: Record<
  string,
  { icon: React.ElementType; color: string; description: string }
> = {
  slack: {
    icon: MessageSquare,
    color: "#4A154B",
    description: "Send alerts to Slack channels via webhook",
  },
  discord: {
    icon: MessageSquare,
    color: "#5865F2",
    description: "Post threat notifications to Discord",
  },
  pagerduty: {
    icon: Bell,
    color: "#06AC38",
    description: "Trigger on-call incidents for critical threats",
  },
  telegram: {
    icon: MessageSquare,
    color: "#0088CC",
    description: "Receive alerts via Telegram bot",
  },
  custom_webhook: {
    icon: Webhook,
    color: "#666",
    description: "Custom webhook endpoint",
  },
};

function IntegrationCardReal({
  integration,
  onUpdate,
  onDelete,
}: {
  integration: Integration;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const meta =
    INTEGRATION_META[integration.type] || INTEGRATION_META.custom_webhook;
  const Icon = meta.icon;
  const [enabled, setEnabled] = useState(integration.enabled);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle(checked: boolean) {
    setEnabled(checked);
    await api.updateIntegration(integration.id, {
      enabled: checked,
    } as Partial<Integration>);
    onUpdate();
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { success } = await api.testIntegration(integration.id);
      setTestResult(success);
    } catch {
      setTestResult(false);
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteIntegration(integration.id);
      onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${meta.color}15` }}
          >
            <Icon className="h-5 w-5" style={{ color: meta.color }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {integration.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {meta.description}
            </p>
            {integration.webhookUrl && (
              <p className="text-[10px] text-muted-foreground font-mono mt-1">
                {integration.webhookUrl.slice(0, 40)}...
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {enabled ? (
            <Badge
              variant="outline"
              className="border-primary/30 text-primary text-[10px]"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Active
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-muted-foreground text-[10px]"
            >
              Disabled
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={handleToggle} />
          <span className="text-xs text-muted-foreground">
            Receiving alerts
          </span>
        </div>
        <div className="flex items-center gap-2">
          {testResult !== null && (
            <span
              className={`text-[10px] ${testResult ? "text-primary" : "text-destructive"}`}
            >
              {testResult ? "Test sent!" : "Test failed"}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Test
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Integration Form ───────────────────────────────────────────
function AddIntegrationForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<string>("slack");
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name || !webhookUrl) return;
    setCreating(true);
    try {
      await api.createIntegration({
        type: type as Integration["type"],
        name,
        webhookUrl,
        enabled: true,
        severities: ["critical", "high"],
      } as Partial<Integration>);
      setName("");
      setWebhookUrl("");
      onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
      <p className="text-sm font-medium text-foreground">Add Integration</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slack">Slack</SelectItem>
              <SelectItem value="discord">Discord</SelectItem>
              <SelectItem value="pagerduty">PagerDuty</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="custom_webhook">Custom Webhook</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. #security-alerts"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Webhook URL</Label>
        <Input
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
          className="h-8 text-xs font-mono"
        />
      </div>
      <Button
        size="sm"
        onClick={handleCreate}
        disabled={creating || !name || !webhookUrl}
        className="gap-1.5"
      >
        {creating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Add Integration
      </Button>
    </div>
  );
}

// ─── CCIP Configuration Section ─────────────────────────────────────
function CCIPConfigSection() {
  const [config, setConfig] = useState<{
    ccipSenderAddress: string | null;
    ccipReceiverArbitrum: string | null;
    ccipReceiverBase: string | null;
    ccipEnabled: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [senderAddress, setSenderAddress] = useState("");
  const [arbitrumReceiver, setArbitrumReceiver] = useState("");
  const [baseReceiver, setBaseReceiver] = useState("");
  const [enabled, setEnabled] = useState(false);

  // Load current config
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getCCIPConfig();
      setConfig(data);
      setSenderAddress(data.ccipSenderAddress || "");
      setArbitrumReceiver(data.ccipReceiverArbitrum || "");
      setBaseReceiver(data.ccipReceiverBase || "");
      setEnabled(data.ccipEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      await api.updateCCIPConfig({
        ccipSenderAddress: senderAddress || undefined,
        ccipReceiverArbitrum: arbitrumReceiver || undefined,
        ccipReceiverBase: baseReceiver || undefined,
        ccipEnabled: enabled,
      });
      setSuccess(true);
      await loadConfig();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">
            Chainlink CCIP Configuration
          </CardTitle>
        </div>
        <CardDescription>
          Configure your tenant-specific CCIP sender and receiver contracts for
          cross-chain defense capabilities
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Banner */}
        {config?.ccipEnabled ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                CCIP Enabled
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cross-chain defense is active. You can pause vaults across all
              chains simultaneously.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-foreground">
                CCIP Not Configured
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Deploy your CCIP contracts and configure them below to enable
              cross-chain defense.
            </p>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sender">CCIP Sender Address (Sepolia)</Label>
            <Input
              id="sender"
              placeholder="0x..."
              value={senderAddress}
              onChange={(e) => setSenderAddress(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Your SentinelCCIPSender contract deployed on Ethereum Sepolia
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="arb-receiver">
              CCIP Receiver Address (Arbitrum Sepolia)
            </Label>
            <Input
              id="arb-receiver"
              placeholder="0x..."
              value={arbitrumReceiver}
              onChange={(e) => setArbitrumReceiver(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Your SentinelCCIPReceiver contract on Arbitrum Sepolia
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-receiver">
              CCIP Receiver Address (Base Sepolia)
            </Label>
            <Input
              id="base-receiver"
              placeholder="0x..."
              value={baseReceiver}
              onChange={(e) => setBaseReceiver(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Your SentinelCCIPReceiver contract on Base Sepolia
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="ccip-enabled" className="text-sm font-medium">
                Enable CCIP Defense
              </Label>
              <p className="text-xs text-muted-foreground">
                Activate cross-chain pause functionality
              </p>
            </div>
            <Switch
              id="ccip-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-primary">
              Configuration saved successfully!
            </p>
          </div>
        )}

        {/* Save Button */}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save CCIP Configuration
            </>
          )}
        </Button>

        {/* Help Text */}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <h4 className="text-sm font-medium text-foreground mb-2">
            How to set up CCIP
          </h4>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Deploy SentinelCCIPSender contract on Ethereum Sepolia</li>
            <li>
              Deploy SentinelCCIPReceiver contracts on Arbitrum & Base Sepolia
            </li>
            <li>Fund your sender contract with LINK tokens</li>
            <li>Set the receiver contracts as sentinels on your vaults</li>
            <li>Enter the contract addresses above and enable CCIP</li>
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
      </CardContent>
    </Card>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────
export function SettingsPage() {
  const {
    data: settings,
    loading: loadingSettings,
    refetch: refetchSettings,
  } = useSettings();
  const {
    data: rules,
    loading: loadingRules,
    refetch: refetchRules,
  } = useAlertRules();
  const {
    data: integrations,
    loading: loadingIntegrations,
    refetch: refetchIntegrations,
  } = useIntegrations();

  // Defense config state (from real settings)
  const autoPause = settings?.auto_pause_enabled === true;
  const crossChain = settings?.cross_chain_propagation === true;
  const aiEnabled = settings?.ai_analysis_enabled === true;
  const cooldown = Number(settings?.cooldown_seconds ?? 300);

  const [savingDefense, setSavingDefense] = useState(false);
  const [cooldownValue, setCooldownValue] = useState<string>(String(cooldown));

  // Sync cooldown when settings load
  const prevCooldown = useState(cooldown)[0];
  if (cooldown !== prevCooldown && !savingDefense) {
    setCooldownValue(String(cooldown));
  }

  async function toggleSetting(key: string, value: unknown) {
    await api.updateSetting(key, value);
    refetchSettings();
  }

  async function saveCooldown() {
    setSavingDefense(true);
    try {
      await api.updateSetting("cooldown_seconds", Number(cooldownValue));
      refetchSettings();
    } finally {
      setSavingDefense(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure integrations, alerts, and defense parameters
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="integrations">
            Integrations
            {integrations && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                {integrations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts">
            Alert Rules
            {rules && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                {rules.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="defense">Defense Config</TabsTrigger>
          <TabsTrigger value="ccip">CCIP Setup</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <ProfileSection />
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Channels</CardTitle>
              <CardDescription>
                Connect Slack, Discord, or custom webhooks for real-time threat
                alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingIntegrations ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => (
                    <Skeleton key={i} className="h-[100px] rounded-lg" />
                  ))}
                </div>
              ) : integrations && integrations.length > 0 ? (
                integrations.map((integration) => (
                  <IntegrationCardReal
                    key={integration.id}
                    integration={integration}
                    onUpdate={refetchIntegrations}
                    onDelete={refetchIntegrations}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No integrations configured
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Add a Slack or Discord webhook below to receive alerts
                  </p>
                </div>
              )}
              <Separator />
              <AddIntegrationForm onCreated={refetchIntegrations} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alert Rules Tab */}
        <TabsContent value="alerts" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Alert Rules</CardTitle>
                  <CardDescription>
                    Define when alerts should be triggered based on on-chain
                    activity
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingRules ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-[140px] rounded-lg" />
                  ))}
                </div>
              ) : (
                <>
                  {rules && rules.length > 0 ? (
                    <div className="space-y-4">
                      {rules.map((rule) => (
                        <AlertRuleCard
                          key={rule.id}
                          rule={rule}
                          onUpdate={refetchRules}
                          onDelete={refetchRules}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No alert rules configured yet
                      </p>
                    </div>
                  )}

                  {/* Add Alert Rule Form */}
                  <AddAlertRuleForm onCreated={refetchRules} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Defense Config Tab */}
        <TabsContent value="defense" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Cross-Chain Defense (CCIP)
              </CardTitle>
              <CardDescription>
                Configure automated cross-chain emergency responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingSettings ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-[50px] rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Auto-pause on Critical Threats
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Automatically pause vaults when a critical threat is
                        detected
                      </p>
                    </div>
                    <Switch
                      checked={autoPause}
                      onCheckedChange={(v) =>
                        toggleSetting("auto_pause_enabled", v)
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Cross-chain Propagation
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Propagate pause commands to all chains via CCIP
                      </p>
                    </div>
                    <Switch
                      checked={crossChain}
                      onCheckedChange={(v) =>
                        toggleSetting("cross_chain_propagation", v)
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        AI Threat Analysis
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Use AI to analyze transaction patterns before triggering
                        defense
                      </p>
                    </div>
                    <Switch
                      checked={aiEnabled}
                      onCheckedChange={(v) =>
                        toggleSetting("ai_analysis_enabled", v)
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-sm">
                        Cooldown Period (seconds)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Minimum time between automated defense actions
                      </p>
                    </div>
                    <Input
                      type="number"
                      value={cooldownValue}
                      onChange={(e) => setCooldownValue(e.target.value)}
                      className="max-w-[120px]"
                    />
                    <Button
                      size="sm"
                      onClick={saveCooldown}
                      disabled={savingDefense}
                    >
                      {savingDefense ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">CRE Workflow Status</CardTitle>
              <CardDescription>
                Chainlink Runtime Environment workflow monitoring
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                      Monitor Workflow
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-primary/30 text-primary text-[10px]"
                  >
                    Configured
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-muted-foreground">Trigger</p>
                    <p className="font-medium text-foreground mt-0.5">
                      Log Trigger (EVM)
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Target</p>
                    <p className="font-medium text-foreground mt-0.5">
                      staging-settings
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium text-foreground mt-0.5">Ready</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Defense Workflow
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-muted-foreground text-[10px]"
                  >
                    Pending Setup
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-muted-foreground">Trigger</p>
                    <p className="font-medium text-foreground mt-0.5">
                      HTTP + EVM Write
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">CCIP Chains</p>
                    <p className="font-medium text-foreground mt-0.5">
                      3 chains
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium text-muted-foreground mt-0.5">
                      Not deployed
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CCIP Setup Tab */}
        <TabsContent value="ccip" className="mt-6 space-y-6">
          <CCIPConfigSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
