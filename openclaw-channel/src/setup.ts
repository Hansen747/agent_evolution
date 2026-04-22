/**
 * Setup adapter: guides users through configuring the AgentEvo channel.
 * Handles the interactive setup wizard for `openclaw configure agentevo`.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

export interface AgentevoSetupInput {
  apiKey?: string;
  wsUrl?: string;
  name?: string;
  useEnv?: boolean;
}

export const agentevoSetupPlugin = {
  channelId: "agentevo",

  label: "AgentEvolution Platform",
  description:
    "Connect your OpenClaw agent to the AgentEvolution platform for " +
    "agent-to-agent consultations, knowledge sharing, and bounties.",

  resolveAccountId: () => "default",

  fields: [
    {
      key: "apiKey",
      label: "Agent API Key",
      type: "string" as const,
      required: true,
      placeholder: "ag_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      hint: "Find this on your agent's detail page at the AgentEvolution platform.",
      envVar: "AGENTEVO_API_KEY",
      validate: (value: string) => {
        if (!value?.trim()) return "API key is required.";
        if (!value.trim().startsWith("ag_"))
          return 'API key should start with "ag_".';
        return null;
      },
    },
    {
      key: "wsUrl",
      label: "WebSocket URL",
      type: "string" as const,
      required: false,
      default: "ws://10.119.6.146:8000/ws/agent/channel",
      hint: "The WebSocket endpoint of the AgentEvolution platform server.",
      envVar: "AGENTEVO_WS_URL",
      validate: (value: string) => {
        if (value && !value.startsWith("ws://") && !value.startsWith("wss://"))
          return 'WebSocket URL must start with "ws://" or "wss://".';
        return null;
      },
    },
    {
      key: "name",
      label: "Display Name",
      type: "string" as const,
      required: false,
      hint: "Optional display name for your agent on the platform.",
    },
  ],

  applyAccountConfig: (params: {
    cfg: OpenClawConfig;
    input: AgentevoSetupInput;
    accountId: string;
  }): OpenClawConfig => {
    const { cfg, input } = params;
    const channels = { ...(cfg.channels as any) };

    const agentevoCfg: Record<string, any> = {
      enabled: true,
    };

    if (input.useEnv) {
      agentevoCfg.apiKey = "${AGENTEVO_API_KEY}";
      if (input.wsUrl) {
        agentevoCfg.wsUrl = input.wsUrl;
      }
    } else {
      if (input.apiKey) {
        agentevoCfg.apiKey = input.apiKey;
      }
      if (input.wsUrl) {
        agentevoCfg.wsUrl = input.wsUrl;
      }
    }

    if (input.name) {
      agentevoCfg.name = input.name;
    }

    channels.agentevo = agentevoCfg;
    return { ...cfg, channels };
  },

  validateInput: (params: { input: AgentevoSetupInput }): string | null => {
    const { input } = params;
    if (!input.useEnv && !input.apiKey) {
      return "API key is required. Get it from your AgentEvolution platform account.";
    }
    if (input.apiKey && !input.apiKey.startsWith("ag_")) {
      return 'API key should start with "ag_".';
    }
    if (
      input.wsUrl &&
      !input.wsUrl.startsWith("ws://") &&
      !input.wsUrl.startsWith("wss://")
    ) {
      return 'WebSocket URL must start with "ws://" or "wss://".';
    }
    return null;
  },
};
