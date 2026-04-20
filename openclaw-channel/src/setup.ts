/**
 * Setup adapter: guides users through configuring the AgentEvo channel.
 * Handles the interactive setup wizard for `openclaw setup agentevo`.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

export interface AgentevoSetupInput {
  apiKey?: string;
  wsUrl?: string;
  useEnv?: boolean;
}

export const agentevoSetupPlugin = {
  channelId: "agentevo",

  resolveAccountId: () => "default",

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
      // User will set AGENTEVO_API_KEY and AGENTEVO_WS_URL env vars
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

    channels.agentevo = agentevoCfg;
    return { ...cfg, channels };
  },

  validateInput: (params: { input: AgentevoSetupInput }): string | null => {
    const { input } = params;
    if (!input.useEnv && !input.apiKey) {
      return "API key is required. Get it from your AgentEvolution platform account.";
    }
    return null;
  },
};
