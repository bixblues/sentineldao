import {
  EVMClient,
  handler,
  bytesToHex,
  getNetwork,
  Runner,
  hexToBase64,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk";
import { keccak256, toBytes, formatUnits } from "viem";

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
};

// ─── Event Signatures ──────────────────────────────────────────────
// Deposit(address indexed from, uint256 amount)
const DEPOSIT_EVENT_SIG = keccak256(toBytes("Deposit(address,uint256)"));

// Withdrawal(address indexed to, uint256 amount)
const WITHDRAWAL_EVENT_SIG = keccak256(toBytes("Withdrawal(address,uint256)"));

// EmergencyPause(address indexed triggeredBy, uint256 timestamp)
const PAUSE_EVENT_SIG = keccak256(toBytes("EmergencyPause(address,uint256)"));

// ─── Callback: Handle Deposit Events ───────────────────────────────
// This fires when a Deposit event is emitted by the ProtectedVault.
// The CRE DON monitors the chain, detects the log, reaches consensus,
// and delivers the verified event to this callback.
const onDepositDetected = (runtime: Runtime<Config>, log: EVMLog): string => {
  const config = runtime.config;
  const contractAddress = bytesToHex(log.address);
  const txHash = bytesToHex(log.txHash);
  // blockNumber may be a BigInt wrapper in WASM runtime
  const blockNumber =
    log.blockNumber != null ? `${log.blockNumber}` : "unknown";

  runtime.log(
    `[SentinelDAO CRE] Deposit event detected on vault ${contractAddress}`,
  );
  runtime.log(`  Block: ${blockNumber} | Tx: ${txHash}`);

  // Decode the deposit amount from log.data (non-indexed uint256)
  // log.data contains the ABI-encoded uint256 amount
  const amountHex = bytesToHex(log.data);
  const amountWei = BigInt(amountHex);
  const amountEth = formatUnits(amountWei, 18);

  runtime.log(`  Amount: ${amountEth} ETH (${amountWei} wei)`);

  // Decode the depositor address from topics[1] (indexed param)
  let depositor = "unknown";
  if (log.topics.length >= 2) {
    // Address is in the last 20 bytes of the 32-byte topic
    depositor = bytesToHex(log.topics[1].slice(12));
  }
  runtime.log(`  From: ${depositor}`);

  // ─── Threat Analysis ───────────────────────────────────────────
  const threshold = BigInt(config.thresholdWei);
  const isLargeDeposit = amountWei >= threshold;
  const thresholdEth = formatUnits(threshold, 18);

  let severity: string;
  let threatType: string;

  if (isLargeDeposit) {
    severity = amountWei >= threshold * 5n ? "critical" : "high";
    threatType = "large_transfer";
    runtime.log(
      `  ⚠️  THREAT DETECTED: Deposit of ${amountEth} ETH exceeds ${thresholdEth} ETH threshold`,
    );
    runtime.log(`  Severity: ${severity.toUpperCase()}`);
  } else {
    severity = "info";
    threatType = "normal_activity";
    runtime.log(
      `  ✓ Normal deposit: ${amountEth} ETH (below ${thresholdEth} ETH threshold)`,
    );
  }

  // ─── Notify Backend via Webhook ────────────────────────────────
  // In production, this would use runtime.http() to call our API.
  // For simulation, we log the webhook payload that would be sent.
  const webhookPayload = JSON.stringify({
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
      isLargeDeposit,
      thresholdEth,
      timestamp: Date.now().toString(),
    },
  });

  runtime.log(`  Webhook payload: ${webhookPayload}`);

  if (isLargeDeposit) {
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
  const threshold = BigInt(config.thresholdWei);
  const isLargeWithdrawal = amountWei >= threshold;
  const thresholdEth = formatUnits(threshold, 18);

  let severity: string;
  let threatType: string;

  if (isLargeWithdrawal) {
    severity = amountWei >= threshold * 5n ? "critical" : "high";
    threatType = "large_withdrawal";
    runtime.log(
      `  ⚠️  THREAT DETECTED: Withdrawal of ${amountEth} ETH exceeds ${thresholdEth} ETH threshold`,
    );
    runtime.log(`  Severity: ${severity.toUpperCase()}`);
  } else {
    severity = "info";
    threatType = "normal_activity";
    runtime.log(
      `  ✓ Normal withdrawal: ${amountEth} ETH (below ${thresholdEth} ETH threshold)`,
    );
  }

  const webhookPayload = JSON.stringify({
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
      isLargeWithdrawal,
      thresholdEth,
      timestamp: Date.now().toString(),
    },
  });

  runtime.log(`  Webhook payload: ${webhookPayload}`);

  if (isLargeWithdrawal) {
    runtime.log(
      `  → Action: Flagging large withdrawal from vault ${contractAddress}`,
    );
  }

  return `Withdrawal analyzed: ${amountEth} ETH to ${recipient} | Severity: ${severity}`;
};

// ─── Callback: Handle EmergencyPause Events ────────────────────────
const onPauseDetected = (runtime: Runtime<Config>, log: EVMLog): string => {
  const contractAddress = bytesToHex(log.address);
  const txHash = bytesToHex(log.txHash);

  let triggeredBy = "unknown";
  if (log.topics.length >= 2) {
    triggeredBy = bytesToHex(log.topics[1].slice(12));
  }

  runtime.log(
    `[SentinelDAO CRE] EmergencyPause detected on vault ${contractAddress}`,
  );
  runtime.log(`  Triggered by: ${triggeredBy}`);
  runtime.log(`  Tx: ${txHash} | Block: ${log.blockNumber}`);

  return `Pause detected on ${contractAddress} by ${triggeredBy}`;
};

// ─── Workflow Initialization ───────────────────────────────────────
// Registers EVM Log Triggers with the CRE DON.
// The DON will monitor the specified contract for matching events
// and invoke our callbacks with consensus-verified log data.
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
