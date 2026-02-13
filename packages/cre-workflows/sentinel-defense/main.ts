import {
  EVMClient,
  HTTPClient,
  handler,
  bytesToHex,
  getNetwork,
  Runner,
  hexToBase64,
  ok,
  text,
  consensusIdenticalAggregation,
  type Runtime,
  type NodeRuntime,
  type EVMLog,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import { keccak256, toBytes, formatUnits, encodeFunctionData } from "viem";

// ─── Configuration ─────────────────────────────────────────────────
// Loaded from config.staging.json / config.production.json
type Config = {
  // Vault contract address to monitor
  vaultAddress: string;
  // Chain selector name (e.g. "ethereum-testnet-sepolia")
  chainSelectorName: string;
  // Threshold in wei — deposits above this trigger a threat
  thresholdWei: string;
  // Backend webhook URL to notify on threat detection
  webhookUrl: string;
  // Consumer contract address for EVM write (defense actions)
  consumerAddress: string;
  // Forwarder address for CRE EVM write (chain-specific)
  forwarderAddress: string;
};

// ─── Event Signatures ──────────────────────────────────────────────
// Deposit(address indexed from, uint256 amount)
const DEPOSIT_EVENT_SIG = keccak256(toBytes("Deposit(address,uint256)"));

// Withdrawal(address indexed to, uint256 amount)
const WITHDRAWAL_EVENT_SIG = keccak256(toBytes("Withdrawal(address,uint256)"));

// EmergencyPause(address indexed triggeredBy, uint256 timestamp)
const PAUSE_EVENT_SIG = keccak256(toBytes("EmergencyPause(address,uint256)"));

// ─── HTTP Client (DON consensus on HTTP responses) ─────────────────
const httpClient = new HTTPClient();

// ─── Helper: Send webhook notification to backend ──────────────────
// Uses CRE HTTP capability — each DON node independently calls the
// webhook, then consensus is reached on the response. This ensures
// the backend receives a verified, tamper-proof notification.
function sendWebhookNotification(
  runtime: Runtime<Config>,
  payload: Record<string, unknown>,
): void {
  const config = runtime.config;

  // runInNodeMode: each node independently sends the HTTP request,
  // then DON reaches consensus on the response status.
  const sendNotification = httpClient.sendRequest(
    runtime,
    (sendRequester: HTTPSendRequester) => {
      // RequestJson.body is a base64-encoded string
      const bodyBytes = new TextEncoder().encode(JSON.stringify(payload));
      const bodyBase64 = btoa(String.fromCharCode(...bodyBytes));

      const response = sendRequester.sendRequest({
        url: config.webhookUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: bodyBase64,
      });

      const result = response.result();
      const isOk = ok(result);
      const responseText = text(result);

      return {
        success: isOk,
        status: result.statusCode,
        body: responseText,
      };
    },
    consensusIdenticalAggregation(),
  );

  const result = sendNotification().result();
  runtime.log(
    `  Webhook response: status=${result.status}, success=${result.success}`,
  );
}

// ─── Helper: Build threat analysis result ──────────────────────────
function analyzeAmount(
  amountWei: bigint,
  thresholdWei: string,
): { severity: string; threatType: string; isLarge: boolean } {
  const threshold = BigInt(thresholdWei);
  const isLarge = amountWei >= threshold;

  if (!isLarge) {
    return { severity: "info", threatType: "normal_activity", isLarge: false };
  }

  const severity = amountWei >= threshold * 5n ? "critical" : "high";
  return { severity, threatType: "large_transfer", isLarge: true };
}

// ─── Callback: Handle Deposit Events ───────────────────────────────
// This fires when a Deposit event is emitted by the ProtectedVault.
// The CRE DON monitors the chain, detects the log, reaches consensus,
// and delivers the verified event to this callback.
const onDepositDetected = (runtime: Runtime<Config>, log: EVMLog): string => {
  const config = runtime.config;
  const contractAddress = bytesToHex(log.address);
  const txHash = bytesToHex(log.txHash);
  const blockNumber =
    log.blockNumber != null ? `${log.blockNumber}` : "unknown";

  runtime.log(
    `[SentinelDAO CRE] Deposit event detected on vault ${contractAddress}`,
  );
  runtime.log(`  Block: ${blockNumber} | Tx: ${txHash}`);

  // Decode the deposit amount from log.data (non-indexed uint256)
  const amountHex = bytesToHex(log.data);
  const amountWei = BigInt(amountHex);
  const amountEth = formatUnits(amountWei, 18);

  runtime.log(`  Amount: ${amountEth} ETH (${amountWei} wei)`);

  // Decode the depositor address from topics[1] (indexed param)
  let depositor = "unknown";
  if (log.topics.length >= 2) {
    depositor = bytesToHex(log.topics[1].slice(12));
  }
  runtime.log(`  From: ${depositor}`);

  // ─── Threat Analysis ───────────────────────────────────────────
  const { severity, threatType, isLarge } = analyzeAmount(
    amountWei,
    config.thresholdWei,
  );
  const thresholdEth = formatUnits(BigInt(config.thresholdWei), 18);

  if (isLarge) {
    runtime.log(
      `  ⚠️  THREAT DETECTED: Deposit of ${amountEth} ETH exceeds ${thresholdEth} ETH threshold`,
    );
    runtime.log(`  Severity: ${severity.toUpperCase()}`);
  } else {
    runtime.log(
      `  ✓ Normal deposit: ${amountEth} ETH (below ${thresholdEth} ETH threshold)`,
    );
  }

  // ─── Notify Backend via CRE HTTP Capability ────────────────────
  // DON nodes independently POST to our webhook, reach consensus on response
  const webhookPayload = {
    source: "cre-workflow",
    workflowName: "sentinel-defense",
    event: "deposit_detected",
    data: {
      vaultAddress: contractAddress,
      chain: config.chainSelectorName,
      txHash,
      blockNumber,
      depositor,
      amountWei: amountWei.toString(),
      amountEth,
      threatType,
      severity,
      isLargeDeposit: isLarge,
      thresholdEth,
      timestamp: Date.now().toString(),
    },
  };

  runtime.log(`  Sending webhook notification to ${config.webhookUrl}...`);
  sendWebhookNotification(runtime, webhookPayload);

  if (isLarge) {
    runtime.log(
      `  → Action: Recommending emergency pause for vault ${contractAddress}`,
    );
  }

  return `Deposit analyzed: ${amountEth} ETH from ${depositor} | Severity: ${severity}`;
};

// ─── Callback: Handle Withdrawal Events ─────────────────────────────
const onWithdrawalDetected = (
  runtime: Runtime<Config>,
  log: EVMLog,
): string => {
  const config = runtime.config;
  const contractAddress = bytesToHex(log.address);
  const txHash = bytesToHex(log.txHash);
  const blockNumber =
    log.blockNumber != null ? `${log.blockNumber}` : "unknown";

  runtime.log(
    `[SentinelDAO CRE] Withdrawal event detected on vault ${contractAddress}`,
  );
  runtime.log(`  Block: ${blockNumber} | Tx: ${txHash}`);

  // Decode the withdrawal amount from log.data (non-indexed uint256)
  const amountHex = bytesToHex(log.data);
  const amountWei = BigInt(amountHex);
  const amountEth = formatUnits(amountWei, 18);

  runtime.log(`  Amount: ${amountEth} ETH (${amountWei} wei)`);

  // Decode the recipient address from topics[1] (indexed param)
  let recipient = "unknown";
  if (log.topics.length >= 2) {
    recipient = bytesToHex(log.topics[1].slice(12));
  }
  runtime.log(`  To: ${recipient}`);

  // ─── Threat Analysis ───────────────────────────────────────────
  const { severity, threatType, isLarge } = analyzeAmount(
    amountWei,
    config.thresholdWei,
  );
  const thresholdEth = formatUnits(BigInt(config.thresholdWei), 18);

  if (isLarge) {
    runtime.log(
      `  ⚠️  THREAT DETECTED: Withdrawal of ${amountEth} ETH exceeds ${thresholdEth} ETH threshold`,
    );
    runtime.log(`  Severity: ${severity.toUpperCase()}`);
  } else {
    runtime.log(
      `  ✓ Normal withdrawal: ${amountEth} ETH (below ${thresholdEth} ETH threshold)`,
    );
  }

  // ─── Notify Backend via CRE HTTP Capability ────────────────────
  const webhookPayload = {
    source: "cre-workflow",
    workflowName: "sentinel-defense",
    event: "withdrawal_detected",
    data: {
      vaultAddress: contractAddress,
      chain: config.chainSelectorName,
      txHash,
      blockNumber,
      recipient,
      amountWei: amountWei.toString(),
      amountEth,
      threatType,
      severity,
      isLargeWithdrawal: isLarge,
      thresholdEth,
      timestamp: Date.now().toString(),
    },
  };

  runtime.log(`  Sending webhook notification to ${config.webhookUrl}...`);
  sendWebhookNotification(runtime, webhookPayload);

  if (isLarge) {
    runtime.log(
      `  → Action: Flagging large withdrawal from vault ${contractAddress}`,
    );
  }

  return `Withdrawal analyzed: ${amountEth} ETH to ${recipient} | Severity: ${severity}`;
};

// ─── Callback: Handle EmergencyPause Events ────────────────────────
const onPauseDetected = (runtime: Runtime<Config>, log: EVMLog): string => {
  const config = runtime.config;
  const contractAddress = bytesToHex(log.address);
  const txHash = bytesToHex(log.txHash);
  const blockNumber =
    log.blockNumber != null ? `${log.blockNumber}` : "unknown";

  let triggeredBy = "unknown";
  if (log.topics.length >= 2) {
    triggeredBy = bytesToHex(log.topics[1].slice(12));
  }

  runtime.log(
    `[SentinelDAO CRE] EmergencyPause detected on vault ${contractAddress}`,
  );
  runtime.log(`  Triggered by: ${triggeredBy}`);
  runtime.log(`  Tx: ${txHash} | Block: ${blockNumber}`);

  // ─── Notify Backend via CRE HTTP Capability ────────────────────
  const webhookPayload = {
    source: "cre-workflow",
    workflowName: "sentinel-defense",
    event: "pause_detected",
    data: {
      vaultAddress: contractAddress,
      chain: config.chainSelectorName,
      txHash,
      blockNumber,
      triggeredBy,
      threatType: "emergency_pause",
      severity: "critical",
      timestamp: Date.now().toString(),
    },
  };

  runtime.log(`  Sending webhook notification to ${config.webhookUrl}...`);
  sendWebhookNotification(runtime, webhookPayload);

  return `Pause detected on ${contractAddress} by ${triggeredBy}`;
};

// ─── Workflow Initialization ───────────────────────────────────────
// Registers EVM Log Triggers with the CRE DON.
// The DON will monitor the specified contract for matching events
// and invoke our callbacks with consensus-verified log data.
//
// This workflow uses:
//   - EVM Log Triggers (3x): Deposit, Withdrawal, EmergencyPause
//   - HTTP Capability: POST threat data to backend webhook (DON consensus)
//
// Architecture:
//   ProtectedVault emits event → CRE DON detects (consensus) →
//   Callback decodes + analyzes → HTTP POST to backend (consensus) →
//   Backend stores event + runs complex pattern detection
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  // Trigger 1: Watch for Deposit events on the vault
  const depositTrigger = evmClient.logTrigger({
    addresses: [hexToBase64(config.vaultAddress)],
    topics: [
      {
        values: [hexToBase64(DEPOSIT_EVENT_SIG)],
      },
    ],
  });

  // Trigger 2: Watch for Withdrawal events on the vault
  const withdrawalTrigger = evmClient.logTrigger({
    addresses: [hexToBase64(config.vaultAddress)],
    topics: [
      {
        values: [hexToBase64(WITHDRAWAL_EVENT_SIG)],
      },
    ],
  });

  // Trigger 3: Watch for EmergencyPause events on the vault
  const pauseTrigger = evmClient.logTrigger({
    addresses: [hexToBase64(config.vaultAddress)],
    topics: [
      {
        values: [hexToBase64(PAUSE_EVENT_SIG)],
      },
    ],
  });

  return [
    handler(depositTrigger, onDepositDetected),
    handler(withdrawalTrigger, onWithdrawalDetected),
    handler(pauseTrigger, onPauseDetected),
  ];
};

// ─── Entry Point ───────────────────────────────────────────────────
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
