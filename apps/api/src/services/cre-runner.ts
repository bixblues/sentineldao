import { spawn } from "child_process";
import { config } from "../lib/config.js";
import { wsManager } from "../lib/ws.js";

// ─── CRE Local Runner ──────────────────────────────────────────────
// Bridges the gap between the backend simulator and the CRE workflow.
// When a simulation produces a new on-chain transaction, this service
// invokes `cre workflow simulate` to run the CRE workflow locally.
//
// In production (with early access), the CRE DON handles this automatically.
// This local runner replicates that behavior for development and demos.
//
// Flow:
//   Simulator sends tx → tx confirmed → CRE Runner triggers simulate →
//   CRE workflow detects event → analyzes threat → POSTs to webhook →
//   Backend processes the CRE-verified event

// Path to the CRE workflow directory (relative to project root)
const CRE_WORKFLOW_DIR = "../../packages/cre-workflows/sentinel-defense";

// Map our chain keys to CRE trigger indices in the workflow
// The workflow registers triggers in this order:
//   0: Deposit, 1: Withdrawal, 2: EmergencyPause
const EVENT_TRIGGER_MAP: Record<string, number> = {
  deposit: 0,
  withdrawal: 1,
  pause: 2,
};

type SimulateResult = {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
};

class CRERunner {
  private running = false;
  private queue: Array<{
    txHash: string;
    eventType: string;
    eventIndex: number;
    resolve: (result: SimulateResult) => void;
  }> = [];

  get isAvailable(): boolean {
    // CRE CLI must be installed
    return true; // We check at runtime
  }

  // ─── Run CRE Simulation for a Transaction ──────────────────────
  // Triggers the CRE workflow simulation for a specific transaction.
  // This is the local equivalent of what the CRE DON does in production.
  async simulate(
    txHash: string,
    eventType: string,
    eventIndex: number = 0,
  ): Promise<SimulateResult> {
    const triggerIndex = EVENT_TRIGGER_MAP[eventType];
    if (triggerIndex === undefined) {
      return {
        success: false,
        output: "",
        error: `Unknown event type: ${eventType}. Expected: deposit, withdrawal, pause`,
        duration: 0,
      };
    }

    return new Promise((resolve) => {
      this.queue.push({ txHash, eventType, eventIndex, resolve });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;

    const item = this.queue.shift()!;
    const { txHash, eventType, eventIndex, resolve } = item;
    const triggerIndex = EVENT_TRIGGER_MAP[eventType]!;

    const startTime = Date.now();

    console.log(
      `[CRE Runner] Simulating ${eventType} event for tx ${txHash.slice(0, 14)}...`,
    );

    wsManager.broadcast("cre_simulation_started", {
      txHash,
      eventType,
      triggerIndex,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await this.runCRESimulate(
        txHash,
        triggerIndex,
        eventIndex,
      );
      const duration = Date.now() - startTime;

      if (result.success) {
        console.log(
          `[CRE Runner] Simulation complete (${duration}ms): ${eventType} on ${txHash.slice(0, 14)}...`,
        );
      } else {
        console.error(
          `[CRE Runner] Simulation failed (${duration}ms): ${result.error}`,
        );
      }

      wsManager.broadcast("cre_simulation_complete", {
        txHash,
        eventType,
        success: result.success,
        duration,
        timestamp: new Date().toISOString(),
      });

      resolve({ ...result, duration });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMsg = error?.message || "Unknown error";

      console.error(`[CRE Runner] Simulation error: ${errorMsg}`);

      wsManager.broadcast("cre_simulation_error", {
        txHash,
        eventType,
        error: errorMsg,
        duration,
        timestamp: new Date().toISOString(),
      });

      resolve({
        success: false,
        output: "",
        error: errorMsg,
        duration,
      });
    }

    this.running = false;
    this.processQueue();
  }

  // ─── Execute CRE CLI ──────────────────────────────────────────
  private runCRESimulate(
    txHash: string,
    triggerIndex: number,
    eventIndex: number,
  ): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const args = [
        "workflow",
        "simulate",
        ".",
        "--target",
        "staging-settings",
        "--evm-tx-hash",
        txHash,
        "--evm-event-index",
        String(eventIndex),
        "--trigger-index",
        String(triggerIndex),
        "--non-interactive",
      ];

      console.log(`[CRE Runner] Executing: cre ${args.join(" ")}`);

      let stdout = "";
      let stderr = "";

      const proc = spawn("cre", args, {
        cwd: new URL(CRE_WORKFLOW_DIR, import.meta.url).pathname,
        env: {
          ...process.env,
          // Ensure CRE CLI can find the project
          PATH: `${process.env.HOME}/.cre/bin:${process.env.PATH}`,
        },
        timeout: 120_000, // 2 minute timeout
      });

      proc.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        // Stream CRE output to console for debugging
        for (const line of text.split("\n").filter(Boolean)) {
          console.log(`[CRE] ${line}`);
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        for (const line of text.split("\n").filter(Boolean)) {
          console.warn(`[CRE stderr] ${line}`);
        }
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          resolve({
            success: false,
            output: stdout,
            error: stderr || `CRE CLI exited with code ${code}`,
          });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({
          success: false,
          output: "",
          error: `Failed to spawn CRE CLI: ${err.message}. Is 'cre' installed? Run: curl -sSL https://smartcontract.github.io/cre-cli/install | bash`,
        });
      });
    });
  }

  // ─── Get CRE CLI Version ──────────────────────────────────────
  async getVersion(): Promise<string> {
    return new Promise((resolve) => {
      const proc = spawn("cre", ["--version"], {
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.cre/bin:${process.env.PATH}`,
        },
        timeout: 10_000,
      });

      let output = "";
      proc.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      proc.on("close", () => {
        resolve(output.trim() || "unknown");
      });

      proc.on("error", () => {
        resolve("not installed");
      });
    });
  }
}

export const creRunner = new CRERunner();
