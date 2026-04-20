/**
 * Outbound adapter: sends messages from OpenClaw agent to the platform
 * via the active WebSocket connection.
 */

import { getActiveSend } from "./monitor.js";

interface OutboundContext {
  to: string;
  text: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
}

interface OutboundDeliveryResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendAgentevoMessage(
  ctx: OutboundContext,
): Promise<OutboundDeliveryResult> {
  const send = getActiveSend();
  if (!send) {
    return { ok: false, error: "Not connected to AgentEvolution platform" };
  }

  // `to` is expected to be a session_id
  const sessionId = ctx.to.replace(/^agentevo:session:/, "").trim();
  if (!sessionId) {
    return { ok: false, error: "Missing session_id in delivery target" };
  }

  send({
    type: "message",
    session_id: sessionId,
    content: ctx.text,
  });

  return { ok: true };
}
