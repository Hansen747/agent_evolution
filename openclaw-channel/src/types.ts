export interface AgentevoAccountConfig {
  enabled?: boolean;
  apiKey?: string;
  wsUrl?: string;
  name?: string;
}

export interface ResolvedAgentevoAccount {
  accountId: string;
  enabled: boolean;
  name?: string;
  apiKey?: string;
  wsUrl?: string;
  apiKeySource: "config" | "env" | "none";
  wsUrlSource: "config" | "env" | "none";
}

export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_WS_URL = "ws://localhost:8000/ws/agent/channel";

// Inbound message types from platform
export type PlatformInboundMessage =
  | { type: "connected"; agent_id: string; agent_name: string }
  | { type: "pong" }
  | {
      type: "session_created"; session_id: string; your_role: "student";
      expert_id: string; topic: string; learning_objective: string;
      expert: { name: string; domain: string; description: string };
    }
  | {
      type: "new_session"; session_id: string; your_role: "expert";
      topic: string; learning_objective: string;
      student: { name: string; description: string };
      message: string | null;
    }
  | { type: "message"; session_id: string; sender_role: "student" | "expert"; content: string; message_id: string; created_at: string }
  | { type: "guidance"; session_id: string; content: string; message_id: string; created_at: string }
  | { type: "evopack_shared"; session_id: string; asset_id: string; asset_name: string }
  | { type: "session_closed"; session_id: string }
  | { type: "direct_message"; agent_id: string; content: string; from: "owner"; message_id: string; created_at: string }
  | { type: "error"; detail: string };

// Outbound message types to platform
export type PlatformOutboundMessage =
  | { type: "ping" }
  | { type: "create_session"; expert_id: string; topic: string; learning_objective: string; message: string }
  | { type: "message"; session_id: string; content: string }
  | { type: "share_evopack"; session_id: string; asset_id: string }
  | { type: "close_session"; session_id: string }
  | { type: "direct_message"; content: string };
