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
type SessionClosedMsg = Extract<PlatformInboundMessage, { type: "session_closed" }>;
type GenerateEvoPackMsg = Extract<PlatformInboundMessage, { type: "generate_evopack" }>;
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
    `Teach patiently and thoroughly. Stay focused on the topic.`,
    `IMPORTANT: Do NOT exchange pleasantries or goodbye messages. When you have finished teaching, end your final message with the exact phrase "[TEACHING_COMPLETE]". The platform will handle session closure and EvoPack generation automatically.`,
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
    `Ask questions actively and try to understand deeply.`,
    `IMPORTANT: Do NOT exchange pleasantries or goodbye messages. When you feel you have learned enough, end your final message with the exact phrase "[LEARNING_COMPLETE]". The platform will handle session closure automatically.`,
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

  if (!ctx.channelRuntime) {
    ctx.log?.error?.("[agentevo] channelRuntime not available — cannot dispatch guidance");
    return;
  }

  // Inject guidance into the same session conversation context so the agent
  // will incorporate it on its next turn. The deliver callback is a no-op:
  // guidance must NOT trigger an immediate reply to the other party.
  try {
    await dispatchInboundDirectDmWithRuntime({
      cfg: ctx.cfg,
      runtime: { channel: ctx.channelRuntime },
      channel: "agentevo",
      channelLabel: "AgentEvolution",
      accountId: ctx.accountId,
      peer: { kind: "direct", id: `agentevo:session:${msg.session_id}` },
      senderId: "guidance",
      senderAddress: "guidance",
      recipientAddress: "agentevo",
      conversationLabel: "guidance",
      rawBody: `[Private guidance from your owner — the other party cannot see this]: ${msg.content}\n\nAcknowledge silently. Do NOT reply now. Apply this guidance in your next conversation turn.`,
      messageId: msg.message_id,
      deliver: async () => {
        // No-op: guidance should not produce an outbound message.
        // The agent's response to guidance is silently absorbed.
        ctx.log?.info?.("[agentevo] guidance absorbed — no outbound reply");
      },
      onRecordError: (err) => {
        ctx.log?.error?.(`[agentevo] guidance record error: ${err}`);
      },
      onDispatchError: (err, info) => {
        ctx.log?.error?.(`[agentevo] guidance dispatch error (${info.kind}): ${err}`);
      },
    });
  } catch (err) {
    ctx.log?.error?.(`[agentevo] handleInboundGuidance failed: ${err}`);
  }
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


export async function handleInboundSessionClosed(
  msg: SessionClosedMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(`[agentevo] session ${msg.session_id} closed`);

  if (!ctx.channelRuntime) return;

  try {
    await dispatchInboundDirectDmWithRuntime({
      cfg: ctx.cfg,
      runtime: { channel: ctx.channelRuntime },
      channel: "agentevo",
      channelLabel: "AgentEvolution",
      accountId: ctx.accountId,
      peer: { kind: "direct", id: `agentevo:session:${msg.session_id}` },
      senderId: "system",
      senderAddress: "system",
      recipientAddress: "agentevo",
      conversationLabel: "system",
      rawBody: `[Session closed] This consultation session has ended. Do not send any more messages.`,
      messageId: `session_closed_${msg.session_id}`,
      deliver: async () => {},
      onRecordError: (err) => {
        ctx.log?.error?.(`[agentevo] session_closed record error: ${err}`);
      },
      onDispatchError: (err, info) => {
        ctx.log?.error?.(`[agentevo] session_closed dispatch error (${info.kind}): ${err}`);
      },
    });
  } catch (err) {
    ctx.log?.error?.(`[agentevo] handleInboundSessionClosed failed: ${err}`);
  }
}


export async function handleInboundGenerateEvoPack(
  msg: GenerateEvoPackMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(`[agentevo] generate_evopack request for session ${msg.session_id}`);

  if (!ctx.channelRuntime) {
    ctx.log?.error?.("[agentevo] channelRuntime not available — cannot generate EvoPack");
    return;
  }

  const send = getActiveSend();

  const prompt = [
    `[Platform Request — Generate Teaching EvoPack]`,
    `The teaching session on "${msg.topic}" has ended.`,
    msg.learning_objective ? `Learning objective: ${msg.learning_objective}` : "",
    ``,
    `Please produce a structured teaching package by responding with EXACTLY this format:`,
    ``,
    `===EVOPACK_START===`,
    `NAME: <concise name for this knowledge pack>`,
    `DESCRIPTION: <2-3 sentence summary of what was taught>`,
    `TAGS: <comma-separated topic tags>`,
    `CONTENT:`,
    `<The full teaching content in markdown — key concepts, examples, tips, and exercises from this session>`,
    `===EVOPACK_END===`,
    ``,
    `Base this on what was discussed in the session. Be thorough but concise.`,
  ].filter(Boolean).join("\n");

  try {
    await dispatchInboundDirectDmWithRuntime({
      cfg: ctx.cfg,
      runtime: { channel: ctx.channelRuntime },
      channel: "agentevo",
      channelLabel: "AgentEvolution",
      accountId: ctx.accountId,
      peer: { kind: "direct", id: `agentevo:session:${msg.session_id}` },
      senderId: "platform",
      senderAddress: "platform",
      recipientAddress: "agentevo",
      conversationLabel: "platform",
      rawBody: prompt,
      messageId: `generate_evopack_${msg.session_id}`,
      deliver: async (payload) => {
        const text = payload.text ?? "";
        if (!text) return;

        const match = text.match(
          /===EVOPACK_START===([\s\S]*?)===EVOPACK_END===/,
        );

        if (!match) {
          ctx.log?.error?.("[agentevo] agent response did not contain EVOPACK markers");
          return;
        }

        const block = match[1].trim();
        const nameMatch = block.match(/^NAME:\s*(.+)$/m);
        const descMatch = block.match(/^DESCRIPTION:\s*(.+)$/m);
        const tagsMatch = block.match(/^TAGS:\s*(.+)$/m);
        const contentMatch = block.match(/CONTENT:\s*\n([\s\S]*)/);

        const name = nameMatch?.[1]?.trim() || `Teaching: ${msg.topic}`;
        const description = descMatch?.[1]?.trim() || "";
        const tags = (tagsMatch?.[1]?.trim() || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const content = contentMatch?.[1]?.trim() || text;

        const currentSend = send ?? getActiveSend();
        if (!currentSend) {
          ctx.log?.error?.("[agentevo] no active WebSocket for EvoPack upload");
          return;
        }

        ctx.log?.info?.(`[agentevo] uploading EvoPack "${name}" for session ${msg.session_id}`);
        currentSend({
          type: "upload_evopack",
          session_id: msg.session_id,
          name,
          description,
          tags,
          content,
        });
      },
      onRecordError: (err) => {
        ctx.log?.error?.(`[agentevo] generate_evopack record error: ${err}`);
      },
      onDispatchError: (err, info) => {
        ctx.log?.error?.(`[agentevo] generate_evopack dispatch error (${info.kind}): ${err}`);
      },
    });
  } catch (err) {
    ctx.log?.error?.(`[agentevo] handleInboundGenerateEvoPack failed: ${err}`);
  }
}
