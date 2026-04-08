/**
 * API client with JWT token handling.
 * All requests go through the Vite proxy to /api/v1.
 */

const BASE = '/api/v1'

function getToken(): string | null {
  return localStorage.getItem('token')
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  const token = getToken()
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: headers(init.headers as Record<string, string>),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail || 'Request failed')
  }
  return res.json()
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

function get<T>(path: string): Promise<T> {
  return request<T>(path)
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

import type {
  TokenResponse, UserProfile, AgentResponse,
  AssetBrief, AssetFull, BountyResponse, SolutionResponse,
  TradeResponse, PaginatedResponse, OperationLogResponse,
} from '../types'

export const auth = {
  register: (data: { username: string; email: string; password: string; display_name?: string }) =>
    post<TokenResponse>('/auth/register', data),
  login: (data: { username: string; password: string }) =>
    post<TokenResponse>('/auth/login', data),
  me: () => get<UserProfile>('/auth/me'),
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agents = {
  list: () => get<AgentResponse[]>('/agents/'),
  get: (id: string) => get<AgentResponse>(`/agents/${id}`),
  register: (data: { name: string; description?: string; agent_type?: string; capabilities?: string[] }) =>
    post<AgentResponse>('/agents/', data),
  delete: (id: string) => del<{ message: string }>(`/agents/${id}`),
  heartbeat: (id: string, data?: { status?: string }) =>
    post<{ message: string }>(`/agents/${id}/heartbeat`, data || {}),
  logs: (agentId: string, page = 1, pageSize = 20) =>
    get<PaginatedResponse<OperationLogResponse>>(`/agents/logs/${agentId}?page=${page}&page_size=${pageSize}`),
}

// ─── Assets ───────────────────────────────────────────────────────────────────

interface AssetListParams {
  page?: number
  page_size?: number
  search?: string
  tag?: string
  sort_by?: string
  order?: string
  min_price?: number
  max_price?: number
}

export const assets = {
  list: (params: AssetListParams = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return get<PaginatedResponse<AssetBrief>>(`/assets/?${qs}`)
  },
  get: (id: string) => get<AssetFull>(`/assets/${id}`),
  publish: (data: {
    name: string; description?: string; tags?: string[]; code: string;
    skill_md?: string; price?: number; license_type?: string;
  }) => post<AssetFull>('/assets/', data),
  update: (id: string, data: Record<string, unknown>) => put<AssetFull>(`/assets/${id}`, data),
  delete: (id: string) => del<{ message: string }>(`/assets/${id}`),
  rate: (id: string, rating: number, comment = '') =>
    post<{ message: string }>(`/assets/${id}/rate`, { rating, comment }),
  download: (id: string) => post<AssetFull>(`/assets/${id}/download`),
  myPublished: () => get<AssetBrief[]>('/assets/me/published'),
}

// ─── Bounties ─────────────────────────────────────────────────────────────────

interface BountyListParams {
  page?: number
  page_size?: number
  search?: string
  tag?: string
  status?: string
}

export const bounties = {
  list: (params: BountyListParams = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return get<PaginatedResponse<BountyResponse>>(`/bounties/?${qs}`)
  },
  get: (id: string) => get<BountyResponse>(`/bounties/${id}`),
  create: (data: { title: string; description: string; tags?: string[]; reward?: number }) =>
    post<BountyResponse>('/bounties/', data),
  solutions: (bountyId: string) => get<SolutionResponse[]>(`/bounties/${bountyId}/solutions`),
  submitSolution: (bountyId: string, data: { content: string; asset_id?: string }) =>
    post<SolutionResponse>(`/bounties/${bountyId}/solutions`, data),
  acceptSolution: (bountyId: string, solutionId: string) =>
    post<{ message: string }>(`/bounties/${bountyId}/solutions/${solutionId}/accept`),
  myPosted: () => get<BountyResponse[]>('/bounties/me/posted'),
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export const trades = {
  purchase: (assetId: string) => post<TradeResponse>('/trades/purchase', { asset_id: assetId }),
  history: (page = 1, pageSize = 20, role = 'all') =>
    get<PaginatedResponse<TradeResponse>>(`/trades/history?page=${page}&page_size=${pageSize}&role=${role}`),
  get: (id: string) => get<TradeResponse>(`/trades/${id}`),
}
