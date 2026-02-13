import { db } from "../db/index.js";
import { integrations } from "../db/schema.js";
import { eq } from "drizzle-orm";

type ThreatPayload = {
  id: string;
  type: string;
  severity: string;
  description: string;
  chain: string;
  txHash: string | null;
  responseAction: string;
};

export async function notifyIntegrations(threat: ThreatPayload) {
  const activeIntegrations = await db.query.integrations.findMany({
    where: eq(integrations.enabled, true),
  });

  for (const integration of activeIntegrations) {
    const severities = (integration.severities as string[]) || [];
    if (!severities.includes(threat.severity)) continue;

    try {
      switch (integration.type) {
        case "slack":
          await sendSlackNotification(integration.webhookUrl!, threat);
          break;
        case "discord":
          await sendDiscordNotification(integration.webhookUrl!, threat);
          break;
        case "custom_webhook":
          await sendCustomWebhook(integration.webhookUrl!, threat);
          break;
        default:
          console.log(`[Notifications] Unsupported integration type: ${integration.type}`);
      }
    } catch (error) {
      console.error(`[Notifications] Failed to send to ${integration.name}:`, error);
    }
  }
}

async function sendSlackNotification(webhookUrl: string, threat: ThreatPayload) {
  if (!webhookUrl) return;

  const severityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🔵",
    info: "⚪",
  };

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${severityEmoji[threat.severity] || "⚠️"} SentinelDAO Alert: ${threat.type}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Severity:*\n${threat.severity.toUpperCase()}` },
          { type: "mrkdwn", text: `*Chain:*\n${threat.chain}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Description:*\n${threat.description}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Response:*\n${threat.responseAction}` },
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${res.statusText}`);
  }

  console.log(`[Notifications] Slack alert sent for ${threat.type}`);
}

async function sendDiscordNotification(webhookUrl: string, threat: ThreatPayload) {
  if (!webhookUrl) return;

  const colorMap: Record<string, number> = {
    critical: 0xff0000,
    high: 0xff8c00,
    medium: 0xffd700,
    low: 0x4169e1,
    info: 0x808080,
  };

  const payload = {
    embeds: [
      {
        title: `🛡️ SentinelDAO: ${threat.type}`,
        description: threat.description,
        color: colorMap[threat.severity] || 0x808080,
        fields: [
          { name: "Severity", value: threat.severity.toUpperCase(), inline: true },
          { name: "Chain", value: threat.chain, inline: true },
          { name: "Response", value: threat.responseAction },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${res.statusText}`);
  }

  console.log(`[Notifications] Discord alert sent for ${threat.type}`);
}

async function sendCustomWebhook(webhookUrl: string, threat: ThreatPayload) {
  if (!webhookUrl) return;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "sentineldao",
      event: "threat_detected",
      data: threat,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Custom webhook failed: ${res.status} ${res.statusText}`);
  }

  console.log(`[Notifications] Custom webhook sent for ${threat.type}`);
}

export async function testWebhook(type: string, webhookUrl: string): Promise<boolean> {
  const testThreat: ThreatPayload = {
    id: "test",
    type: "Test Alert",
    severity: "info",
    description: "This is a test notification from SentinelDAO.",
    chain: "ethereum-sepolia",
    txHash: null,
    responseAction: "No action — test only",
  };

  try {
    switch (type) {
      case "slack":
        await sendSlackNotification(webhookUrl, testThreat);
        return true;
      case "discord":
        await sendDiscordNotification(webhookUrl, testThreat);
        return true;
      case "custom_webhook":
        await sendCustomWebhook(webhookUrl, testThreat);
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
