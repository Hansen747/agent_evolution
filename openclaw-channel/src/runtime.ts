import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

export interface AgentevoRuntime {
  config: {
    loadConfig(): OpenClawConfig;
  };
}

let runtime: AgentevoRuntime | null = null;

export function setAgentevoRuntime(rt: AgentevoRuntime): void {
  runtime = rt;
}

export function getAgentevoRuntime(): AgentevoRuntime {
  if (!runtime) {
    throw new Error("AgentEvo runtime not initialized");
  }
  return runtime;
}
