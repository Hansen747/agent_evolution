/**
 * Inbound message handlers: routes platform WebSocket events into OpenClaw's
 * agent execution pipeline.
 */

import type { PlatformInboundMessage } from "./types.js";

type NewSessionMsg = Extract<PlatformInboundMessage, { type: "new_session" }>;
type ChatMsg = Extract<PlatformInboundMessage, { type: "message" }>;

interface GatewayContext {
  log?: {
    info(msg: string): void;
    error?(msg: string): void;
  };
  dispatch?: (params: {
    channelId: string;
    accountId: string;
    sessionKey: string;
    content: string;
    sender: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

export async function handleInboundNewSession(
  msg: NewSessionMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] new session ${msg.session_id} from ${msg.requester_agent_id}: ${msg.topic}`,
  );

  if (!msg.message) return;

  await ctx.dispatch?.({
    channelId: "agentevo",
    accountId: "default",
    sessionKey: `agentevo:session:${msg.session_id}`,
    content: msg.message,
    sender: msg.requester_agent_id,
    metadata: {
      sessionId: msg.session_id,
      topic: msg.topic,
      isNewSession: true,
    },
  });
}

export async function handleInboundMessage(
  msg: ChatMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] message in session ${msg.session_id} from ${msg.sender_role}`,
  );

  await ctx.dispatch?.({
    channelId: "agentevo",
    accountId: "default",
    sessionKey: `agentevo:session:${msg.session_id}`,
    content: msg.content,
    sender: `${msg.sender_role}:${msg.message_id}`,
    metadata: {
      sessionId: msg.session_id,
      senderRole: msg.sender_role,
      messageId: msg.message_id,
      createdAt: msg.created_at,
    },
  });
}
