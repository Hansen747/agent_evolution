/**
 * Inbound message handlers: routes platform WebSocket events into OpenClaw's
 * agent execution pipeline via the SDK's dispatchInboundDirectDmWithRuntime.
 */

import { dispatchInboundDirectDmWithRuntime } from "openclaw/plugin-sdk/channel-inbound";
import type { PlatformInboundMessage } from "./types.js";
import { getActiveSend } from "./monitor.js";

type NewSessionMsg = Extract<PlatformInboundMessage, { type: "new_session" }>;
type SessionCreatedMsg = Extract<PlatformInboundMessage, { type: "session_created" }>;
type ChatMsg = Extract<PlatformInboundMessage, { type: "message" }>;
type GuidanceMsg = Extract<PlatformInboundMessage, { type: "guidance" }>;
type EvoPackSharedMsg = Extract<PlatformInboundMessage, { type: "evopack_shared" }>;
type DirectMsg = Extract<PlatformInboundMessage, { type: "direct_message" }>;

interface GatewayContext {
  cfg: any;
  accountId: string;
  channelRuntime?: any;
  log?: {
    info(msg: string): void;
    error?(msg: string): void;
  };
}

async function dispatchToAgent(
  ctx: GatewayContext,
  sessionKey: string,
  content: string,
  senderId: string,
  messageId: string,
): Promise<void> {
  if (!ctx.channelRuntime) {
    ctx.log?.error?.("[agentevo] channelRuntime not available — cannot dispatch to agent");
    return;
  }

  const send = getActiveSend();
  const isDirectMessage = sessionKey.startsWith("agentevo:direct:");

  try {
    await dispatchInboundDirectDmWithRuntime({
      cfg: ctx.cfg,
      runtime: { channel: ctx.channelRuntime },
      channel: "agentevo",
      channelLabel: "AgentEvolution",
      accountId: ctx.accountId,
      peer: { kind: "direct", id: sessionKey },
      senderId,
      senderAddress: senderId,
      recipientAddress: "agentevo",
      conversationLabel: senderId,
      rawBody: content,
      messageId,
      deliver: async (payload) => {
        const text = payload.text ?? "";
        if (!text) return;

        const currentSend = send ?? getActiveSend();
        if (!currentSend) {
          ctx.log?.error?.("[agentevo] no active WebSocket connection for delivery");
          return;
        }

        ctx.log?.info?.(`[agentevo] delivering reply (${text.length} chars, direct=${isDirectMessage})`);

        if (isDirectMessage) {
          currentSend({ type: "direct_message", content: text });
        } else {
          const sid = sessionKey.replace(/^agentevo:session:/, "");
          currentSend({ type: "message", session_id: sid, content: text });
        }
      },
      onRecordError: (err) => {
        ctx.log?.error?.(`[agentevo] record error: ${err}`);
      },
      onDispatchError: (err, info) => {
        ctx.log?.error?.(`[agentevo] dispatch error (${info.kind}): ${err}`);
      },
    });
  } catch (err) {
    ctx.log?.error?.(`[agentevo] dispatchToAgent failed: ${err}`);
  }
}

export async function handleInboundNewSession(
  msg: NewSessionMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] new session ${msg.session_id} as expert — topic: ${msg.topic}`,
  );

  const systemContext = [
    `You are an expert agent in a teaching session.`,
    `A student agent is consulting you.`,
    msg.learning_objective
      ? `Learning objective: ${msg.learning_objective}`
      : `Topic: ${msg.topic}`,
    `Student: ${msg.student.name}${msg.student.description ? ` — ${msg.student.description}` : ""}`,
    `Teach patiently and thoroughly. When the teaching is complete, summarize what was learned and generate an EvoPack with the key knowledge.`,
  ].join("\n");

  const content = msg.message
    ? `${systemContext}\n\n---\nStudent's first message:\n${msg.message}`
    : systemContext;

  await dispatchToAgent(
    ctx,
    `agentevo:session:${msg.session_id}`,
    content,
    msg.student.name,
    `new_session_${msg.session_id}`,
  );
}

export async function handleInboundSessionCreated(
  msg: SessionCreatedMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] session ${msg.session_id} created as student — learning from ${msg.expert.name}`,
  );

  const systemContext = [
    `You are a student agent in a learning session.`,
    `You are consulting an expert to learn something.`,
    msg.learning_objective
      ? `Your learning objective: ${msg.learning_objective}`
      : `Topic: ${msg.topic}`,
    `Expert: ${msg.expert.name} (${msg.expert.domain})${msg.expert.description ? ` — ${msg.expert.description}` : ""}`,
    `Ask questions actively and try to understand deeply. When you receive an EvoPack at the end, acknowledge it.`,
  ].join("\n");

  await dispatchToAgent(
    ctx,
    `agentevo:session:${msg.session_id}`,
    systemContext,
    "system",
    `session_created_${msg.session_id}`,
  );
}

export async function handleInboundMessage(
  msg: ChatMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] message in session ${msg.session_id} from ${msg.sender_role}`,
  );

  await dispatchToAgent(
    ctx,
    `agentevo:session:${msg.session_id}`,
    msg.content,
    msg.sender_role,
    msg.message_id,
  );
}

export async function handleInboundGuidance(
  msg: GuidanceMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] guidance received for session ${msg.session_id}`,
  );

  // Inject guidance into the same session conversation so the agent sees
  // the full expert dialogue history AND the owner's instruction, then
  // responds to the expert accordingly.
  await dispatchToAgent(
    ctx,
    `agentevo:session:${msg.session_id}`,
    `[Guidance from your owner — not visible to the expert]: ${msg.content}\n\nFollow this guidance in your next response to the expert.`,
    "guidance",
    msg.message_id,
  );
}

export async function handleInboundDirectMessage(
  msg: DirectMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(`[agentevo] direct message from owner`);

  await dispatchToAgent(
    ctx,
    `agentevo:direct:${msg.agent_id}`,
    msg.content,
    "owner",
    msg.message_id,
  );
}

export async function handleInboundEvoPackShared(
  msg: EvoPackSharedMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] EvoPack "${msg.asset_name}" shared in session ${msg.session_id}`,
  );

  await dispatchToAgent(
    ctx,
    `agentevo:session:${msg.session_id}`,
    `The expert has shared a teaching EvoPack: "${msg.asset_name}" (asset_id: ${msg.asset_id}). You can download it from the platform.`,
    "system",
    `evopack_${msg.asset_id}`,
  );
}
