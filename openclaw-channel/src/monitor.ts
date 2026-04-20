import WebSocket from "ws";
import type { ResolvedAgentevoAccount, PlatformInboundMessage } from "./types.js";

export interface MonitorAgentevoOpts {
  apiKey: string;
  wsUrl: string;
  accountId: string;
  abortSignal?: AbortSignal;
  statusSink?: (status: Partial<AgentevoConnectionStatus>) => void;
  onNewSession?: (msg: Extract<PlatformInboundMessage, { type: "new_session" }>) => Promise<void>;
  onSessionCreated?: (msg: Extract<PlatformInboundMessage, { type: "session_created" }>) => Promise<void>;
  onMessage?: (msg: Extract<PlatformInboundMessage, { type: "message" }>) => Promise<void>;
  onGuidance?: (msg: Extract<PlatformInboundMessage, { type: "guidance" }>) => Promise<void>;
  onEvoPackShared?: (msg: Extract<PlatformInboundMessage, { type: "evopack_shared" }>) => Promise<void>;
  onSessionClosed?: (msg: Extract<PlatformInboundMessage, { type: "session_closed" }>) => void;
  logger?: {
    info?: (msg: string) => void;
    error?: (msg: string) => void;
  };
}

export interface AgentevoConnectionStatus {
  connected: boolean;
  agentId: string | null;
  agentName: string | null;
  lastConnectedAt: number | null;
  lastError: string | null;
}

interface SendFn {
  (msg: { type: "ping" }): void;
  (msg: { type: "message"; session_id: string; content: string }): void;
  (msg: { type: "create_session"; expert_id: string; topic: string; message: string }): void;
  (msg: { type: "close_session"; session_id: string }): void;
}

let activeSendFn: SendFn | null = null;

export function getActiveSend(): SendFn | null {
  return activeSendFn;
}

export async function monitorAgentevo(opts: MonitorAgentevoOpts): Promise<void> {
  const { apiKey, wsUrl, abortSignal, statusSink, logger } = opts;

  await runWithReconnect(
    () => connectOnce(opts),
    {
      abortSignal,
      initialDelayMs: 2000,
      maxDelayMs: 60_000,
      jitterRatio: 0.2,
      onError: (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger?.error?.(`agentevo connection failed: ${msg}`);
        statusSink?.({ lastError: msg, connected: false });
      },
      onReconnect: (delayMs) => {
        logger?.info?.(`agentevo reconnecting in ${Math.round(delayMs / 1000)}s`);
      },
    },
  );
}

async function connectOnce(opts: MonitorAgentevoOpts): Promise<void> {
  const { apiKey, wsUrl, abortSignal, statusSink, logger } = opts;

  const url = `${wsUrl}?key=${encodeURIComponent(apiKey)}`;

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(url);
    let opened = false;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      activeSendFn = null;
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = undefined;
      }
    };

    const onAbort = () => {
      cleanup();
      ws.close();
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    ws.on("open", () => {
      opened = true;
      logger?.info?.("agentevo: WebSocket connected, awaiting auth confirmation");

      // Set up send function
      activeSendFn = ((msg: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      }) as SendFn;

      // Heartbeat every 30s
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30_000);
    });

    ws.on("message", async (data) => {
      let payload: PlatformInboundMessage;
      try {
        payload = JSON.parse(data.toString());
      } catch {
        return;
      }

      switch (payload.type) {
        case "connected":
          statusSink?.({
            connected: true,
            agentId: payload.agent_id,
            agentName: payload.agent_name,
            lastConnectedAt: Date.now(),
            lastError: null,
          });
          logger?.info?.(`agentevo: authenticated as ${payload.agent_name} (${payload.agent_id})`);
          break;

        case "pong":
          break;

        case "new_session":
          if (opts.onNewSession) {
            try {
              await opts.onNewSession(payload);
            } catch (err) {
              logger?.error?.(`agentevo new_session handler error: ${err}`);
            }
          }
          break;

        case "session_created":
          if (opts.onSessionCreated) {
            try {
              await opts.onSessionCreated(payload);
            } catch (err) {
              logger?.error?.(`agentevo session_created handler error: ${err}`);
            }
          }
          break;

        case "message":
          if (opts.onMessage) {
            try {
              await opts.onMessage(payload);
            } catch (err) {
              logger?.error?.(`agentevo message handler error: ${err}`);
            }
          }
          break;

        case "guidance":
          if (opts.onGuidance) {
            try {
              await opts.onGuidance(payload);
            } catch (err) {
              logger?.error?.(`agentevo guidance handler error: ${err}`);
            }
          }
          break;

        case "evopack_shared":
          if (opts.onEvoPackShared) {
            try {
              await opts.onEvoPackShared(payload);
            } catch (err) {
              logger?.error?.(`agentevo evopack_shared handler error: ${err}`);
            }
          }
          break;

        case "session_closed":
          opts.onSessionClosed?.(payload);
          break;

        case "error":
          logger?.error?.(`agentevo platform error: ${payload.detail}`);
          break;
      }
    });

    ws.on("close", (code, reason) => {
      cleanup();
      abortSignal?.removeEventListener("abort", onAbort);
      statusSink?.({ connected: false });

      if (opened) {
        logger?.info?.(`agentevo: connection closed (code=${code})`);
        resolve();
      } else {
        reject(new Error(`WebSocket closed before open: code=${code} reason=${reason?.toString()}`));
      }
    });

    ws.on("error", (err) => {
      cleanup();
      statusSink?.({ connected: false, lastError: err.message });
      if (!opened) {
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Reconnection with exponential backoff
// ---------------------------------------------------------------------------

interface ReconnectOpts {
  abortSignal?: AbortSignal;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  onError?: (err: unknown) => void;
  onReconnect?: (delayMs: number) => void;
}

async function runWithReconnect(
  connectFn: () => Promise<void>,
  opts: ReconnectOpts = {},
): Promise<void> {
  const { initialDelayMs = 2000, maxDelayMs = 60_000, jitterRatio = 0.2 } = opts;
  let retryDelay = initialDelayMs;

  while (!opts.abortSignal?.aborted) {
    try {
      await connectFn();
      retryDelay = initialDelayMs;
    } catch (err) {
      if (opts.abortSignal?.aborted) return;
      opts.onError?.(err);
    }

    if (opts.abortSignal?.aborted) return;

    const jitter = retryDelay * jitterRatio * (Math.random() * 2 - 1);
    const delayMs = Math.max(500, retryDelay + jitter);
    opts.onReconnect?.(delayMs);

    await sleep(delayMs, opts.abortSignal);
    retryDelay = Math.min(retryDelay * 2, maxDelayMs);
  }
}

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (abortSignal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    abortSignal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
