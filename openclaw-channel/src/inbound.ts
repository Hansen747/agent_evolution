/**
 * Inbound message handlers: routes platform WebSocket events into OpenClaw's
 * agent execution pipeline with rich context about role and learning objective.
 */

import type { PlatformInboundMessage } from "./types.js";

type NewSessionMsg = Extract<PlatformInboundMessage, { type: "new_session" }>;
type SessionCreatedMsg = Extract<PlatformInboundMessage, { type: "session_created" }>;
type ChatMsg = Extract<PlatformInboundMessage, { type: "message" }>;
type GuidanceMsg = Extract<PlatformInboundMessage, { type: "guidance" }>;
type EvoPackSharedMsg = Extract<PlatformInboundMessage, { type: "evopack_shared" }>;

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

  await ctx.dispatch?.({
    channelId: "agentevo",
    accountId: "default",
    sessionKey: `agentevo:session:${msg.session_id}`,
    content,
    sender: msg.student.name,
    metadata: {
      sessionId: msg.session_id,
      role: "expert",
      topic: msg.topic,
      learningObjective: msg.learning_objective,
      student: msg.student,
      isNewSession: true,
    },
  });
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

  await ctx.dispatch?.({
    channelId: "agentevo",
    accountId: "default",
    sessionKey: `agentevo:session:${msg.session_id}`,
    content: systemContext,
    sender: "system",
    metadata: {
      sessionId: msg.session_id,
      role: "student",
      topic: msg.topic,
      learningObjective: msg.learning_objective,
      expert: msg.expert,
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
    sender: msg.sender_role,
    metadata: {
      sessionId: msg.session_id,
      senderRole: msg.sender_role,
      messageId: msg.message_id,
      createdAt: msg.created_at,
    },
  });
}

export async function handleInboundGuidance(
  msg: GuidanceMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] guidance received for session ${msg.session_id}`,
  );

  await ctx.dispatch?.({
    channelId: "agentevo",
    accountId: "default",
    sessionKey: `agentevo:session:${msg.session_id}`,
    content: `[Guidance from your owner]: ${msg.content}`,
    sender: "guidance",
    metadata: {
      sessionId: msg.session_id,
      senderRole: "guidance",
      messageId: msg.message_id,
      createdAt: msg.created_at,
      isGuidance: true,
    },
  });
}

export async function handleInboundEvoPackShared(
  msg: EvoPackSharedMsg,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log?.info(
    `[agentevo] EvoPack "${msg.asset_name}" shared in session ${msg.session_id}`,
  );

  await ctx.dispatch?.({
    channelId: "agentevo",
    accountId: "default",
    sessionKey: `agentevo:session:${msg.session_id}`,
    content: `The expert has shared a teaching EvoPack: "${msg.asset_name}" (asset_id: ${msg.asset_id}). You can download it from the platform.`,
    sender: "system",
    metadata: {
      sessionId: msg.session_id,
      assetId: msg.asset_id,
      assetName: msg.asset_name,
      isEvoPackShared: true,
    },
  });
}
