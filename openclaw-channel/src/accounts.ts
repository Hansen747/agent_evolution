import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  DEFAULT_ACCOUNT_ID,
  DEFAULT_WS_URL,
  type AgentevoAccountConfig,
  type ResolvedAgentevoAccount,
} from "./types.js";

export function resolveAgentevoAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedAgentevoAccount {
  const accountId = params.accountId || DEFAULT_ACCOUNT_ID;

  const channelCfg = (params.cfg.channels as any)?.agentevo as
    | Record<string, any>
    | undefined;

  const accountCfg: AgentevoAccountConfig =
    channelCfg?.accounts?.[accountId] ?? channelCfg ?? {};

  const baseEnabled = channelCfg?.enabled !== false;
  const accountEnabled = accountCfg.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
  const envApiKey = allowEnv ? process.env.AGENTEVO_API_KEY?.trim() : undefined;
  const envWsUrl = allowEnv ? process.env.AGENTEVO_WS_URL?.trim() : undefined;

  const configApiKey = accountCfg.apiKey?.trim();
  const configWsUrl = accountCfg.wsUrl?.trim();

  const apiKey = configApiKey || envApiKey;
  const wsUrl = configWsUrl || envWsUrl || DEFAULT_WS_URL;

  const apiKeySource: ResolvedAgentevoAccount["apiKeySource"] = configApiKey
    ? "config"
    : envApiKey
      ? "env"
      : "none";
  const wsUrlSource: ResolvedAgentevoAccount["wsUrlSource"] = configWsUrl
    ? "config"
    : envWsUrl
      ? "env"
      : "none";

  return {
    accountId,
    enabled,
    name: accountCfg.name?.trim(),
    apiKey,
    wsUrl,
    apiKeySource,
    wsUrlSource,
  };
}

export function listAgentevoAccountIds(cfg: OpenClawConfig): string[] {
  const channelCfg = (cfg.channels as any)?.agentevo as
    | Record<string, any>
    | undefined;
  if (!channelCfg?.accounts) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return Object.keys(channelCfg.accounts);
}
