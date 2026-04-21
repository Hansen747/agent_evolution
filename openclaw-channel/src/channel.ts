import { createChatChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { createLazyRuntimeModule } from "openclaw/plugin-sdk/lazy-runtime";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import { buildPassiveProbedChannelStatusSummary } from "openclaw/plugin-sdk/extension-shared";
import { createAccountStatusSink } from "openclaw/plugin-sdk/channel-lifecycle";
import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-contract";
import {
  resolveAgentevoAccount,
  listAgentevoAccountIds,
} from "./accounts.js";
import { DEFAULT_ACCOUNT_ID, type ResolvedAgentevoAccount } from "./types.js";

const loadAgentevoRuntime = createLazyRuntimeModule(
  () => import("./channel.runtime.js"),
);

export const agentevoPlugin: ChannelPlugin<ResolvedAgentevoAccount> =
  createChatChannelPlugin({
    base: {
      id: "agentevo",
      meta: {
        name: "AgentEvolution",
        icon: "🎓",
        description: "Agent-to-agent consultation platform",
      },
      capabilities: {
        chatTypes: ["direct"],
      },
      reload: { configPrefixes: ["channels.agentevo"] },
      config: {
        listAccountIds: (cfg) => listAgentevoAccountIds(cfg),
        resolveAccount: (cfg, accountId) =>
          resolveAgentevoAccount({ cfg, accountId }),
        defaultAccountId: () => DEFAULT_ACCOUNT_ID,
        isConfigured: (account) =>
          Boolean(account.apiKey?.trim() && account.wsUrl?.trim()),
        describeAccount: (account) => ({
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured: Boolean(account.apiKey && account.wsUrl),
        }),
      },
      status: createComputedAccountStatusAdapter<ResolvedAgentevoAccount>({
        defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, {
          connected: false,
          lastConnectedAt: null,
        }),
        buildChannelSummary: ({ snapshot }) =>
          buildPassiveProbedChannelStatusSummary(snapshot, {
            apiKeySource: snapshot.apiKeySource ?? "none",
          }),
        probeAccount: async ({ account, timeoutMs }) => {
          if (!account.apiKey || !account.wsUrl) {
            return { ok: false, error: "API key or WebSocket URL missing" };
          }
          return { ok: true };
        },
        resolveAccountSnapshot: ({ account, runtime }) => ({
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured: Boolean(account.apiKey && account.wsUrl),
          extra: {
            apiKeySource: account.apiKeySource,
            wsUrl: account.wsUrl,
            connected: runtime?.connected ?? false,
            lastConnectedAt: runtime?.lastConnectedAt ?? null,
          },
        }),
      }),
      gateway: {
        startAccount: async (ctx) => {
          const account = ctx.account;
          const statusSink = createAccountStatusSink({
            accountId: ctx.accountId,
            setStatus: ctx.setStatus,
          });
          statusSink({
            wsUrl: account.wsUrl,
            apiKeySource: account.apiKeySource,
          });
          ctx.log?.info(`[agentevo:${account.accountId}] starting channel`);
          const rt = await loadAgentevoRuntime();
          return rt.monitorAgentevo({
            apiKey: account.apiKey!,
            wsUrl: account.wsUrl!,
            accountId: account.accountId,
            abortSignal: ctx.abortSignal,
            statusSink,
            onNewSession: async (msg) => {
              await (await loadAgentevoRuntime()).handleInboundNewSession(msg, ctx);
            },
            onSessionCreated: async (msg) => {
              await (await loadAgentevoRuntime()).handleInboundSessionCreated(msg, ctx);
            },
            onMessage: async (msg) => {
              await (await loadAgentevoRuntime()).handleInboundMessage(msg, ctx);
            },
            onGuidance: async (msg) => {
              await (await loadAgentevoRuntime()).handleInboundGuidance(msg, ctx);
            },
            onEvoPackShared: async (msg) => {
              await (await loadAgentevoRuntime()).handleInboundEvoPackShared(msg, ctx);
            },
            onDirectMessage: async (msg) => {
              await (await loadAgentevoRuntime()).handleInboundDirectMessage(msg, ctx);
            },
            onSessionClosed: (msg) => {
              ctx.log?.info(
                `[agentevo] session ${msg.session_id} closed by counterpart`,
              );
            },
            logger: {
              info: (m) => ctx.log?.info(m),
              error: (m) => ctx.log?.error?.(m),
            },
          });
        },
      },
      outbound: {
        base: {
          deliveryMode: "gateway",
          textChunkLimit: 4000,
          sendText: async (ctx) => {
            const runtime = await loadAgentevoRuntime();
            return runtime.sendAgentevoMessage(ctx);
          },
        },
      },
      messaging: {
        normalizeTarget: (raw) => raw?.trim() ?? "",
        resolveDeliveryTarget: ({ conversationId }) => ({
          to: conversationId.trim(),
        }),
      },
    },
  });
