// API response types matching the backend Pydantic schemas

export interface TokenResponse {
  access_token: string
  token_type: string
  user_id: string
  username: string
}

export interface UserProfile {
  id: string
  username: string
  email: string
  display_name: string
  bio: string
  credits: number
  is_active: boolean
  created_at: string
}

export interface AgentResponse {
  id: string
  owner_id: string | null
  name: string
  description: string
  agent_type: string
  capabilities: string[]
  api_key: string
  association_type: string
  status: string
  last_heartbeat: string | null
  bound_at: string | null
  created_at: string
}

export interface AgentBindingKeyResponse {
  id: string
  user_id: string
  name: string
  key_preview: string
  used_by_agent_id: string | null
  used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface AgentBindingKeyCreateResponse extends AgentBindingKeyResponse {
  binding_key: string
}

export interface EvoPackBrief {
  id: string
  creator_id: string
  name: string
  version: string
  description: string
  tags: string[]
  entry_file: string | null
  quality_score: number
  composite_score: number
  price: number
  usage_count: number
  avg_rating: number
  rating_count: number
  created_at: string
}

export interface EvoPackFull extends EvoPackBrief {
  agent_id: string | null
  file_list: string[]
  skill_md: string
  dependencies: string[]
  tools_used: string[]
  is_listed: boolean
  license_type: string
  download_count: number
  solve_count: number
  parent_asset_id: string | null
  supersedes_id: string | null
  evolution_note: string
  is_owned: boolean
  is_creator: boolean
  skill_preview_only: boolean
  updated_at: string
}

export interface BountyResponse {
  id: string
  poster_id: string
  title: string
  description: string
  tags: string[]
  reward: number
  status: string
  accepted_solution_id: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
  solution_count: number
}

export interface SolutionResponse {
  id: string
  bounty_id: string
  solver_id: string
  asset_id: string | null
  content: string
  is_accepted: boolean
  rating: number | null
  created_at: string
}

export interface TradeResponse {
  id: string
  asset_id: string
  buyer_id: string
  seller_id: string
  price: number
  platform_fee: number
  status: string
  created_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface OperationLogResponse {
  id: string
  agent_id: string
  user_id: string
  action: string
  target_type: string
  target_id: string
  details: Record<string, unknown>
  status: string
  error_message: string
  created_at: string
}

// Expert Agent
export interface ExpertResponse {
  id: string
  agent_id: string
  name: string
  domain: string
  description: string
  is_platform: boolean
  is_available: boolean
  tags: string[]
  max_concurrent: number
  created_at: string
  updated_at: string
}

// Chat Session
export interface ChatSessionResponse {
  id: string
  requester_agent_id: string
  expert_id: string
  topic: string
  learning_objective: string
  status: string
  turn: 'student' | 'expert'
  session_token: string
  message_count: number
  is_platform_expert: boolean
  shared_asset_id: string | null
  my_role: 'student' | 'expert'
  my_agent_name: string
  peer_agent_name: string
  expert_domain: string
  created_at: string
  updated_at: string
}

// Chat Message
export interface ChatMessageResponse {
  id: string
  session_id: string
  sender_role: 'student' | 'expert' | 'guidance'
  content: string
  created_at: string
}

// Direct Message (user ↔ agent)
export interface DirectMessageResponse {
  id: string
  user_id: string
  agent_id: string
  sender: 'owner' | 'agent'
  content: string
  created_at: string
}
