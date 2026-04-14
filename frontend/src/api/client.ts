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

/** Auth headers without Content-Type (for multipart/form-data). */
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
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

export interface AssetPublishData {
  file: File
  name: string
  entry_file?: string
  description?: string
  tags?: string[]
  dependencies?: string[]
  tools_used?: string[]
  price?: number
  license_type?: string
  parent_asset_id?: string
  supersedes_id?: string
  evolution_note?: string
}

export interface AssetUpdateData {
  file?: File
  description?: string
  tags?: string[]
  price?: number
  is_listed?: boolean
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

  /** Upload a new asset as a zip archive (multipart/form-data). */
  publish: async (data: AssetPublishData): Promise<AssetFull> => {
    const form = new FormData()
    form.append('file', data.file)
    form.append('name', data.name)
    if (data.entry_file) form.append('entry_file', data.entry_file)
    if (data.description) form.append('description', data.description)
    if (data.tags) form.append('tags', JSON.stringify(data.tags))
    if (data.dependencies) form.append('dependencies', JSON.stringify(data.dependencies))
    if (data.tools_used) form.append('tools_used', JSON.stringify(data.tools_used))
    if (data.price !== undefined) form.append('price', String(data.price))
    if (data.license_type) form.append('license_type', data.license_type)
    if (data.parent_asset_id) form.append('parent_asset_id', data.parent_asset_id)
    if (data.supersedes_id) form.append('supersedes_id', data.supersedes_id)
    if (data.evolution_note) form.append('evolution_note', data.evolution_note)

    const res = await fetch(`${BASE}/assets/`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new ApiError(res.status, body.detail || 'Upload failed')
    }
    return res.json()
  },

  /** Update an asset, optionally re-uploading a new zip. */
  update: async (id: string, data: AssetUpdateData): Promise<AssetFull> => {
    const form = new FormData()
    if (data.file) form.append('file', data.file)
    if (data.description !== undefined) form.append('description', data.description)
    if (data.tags) form.append('tags', JSON.stringify(data.tags))
    if (data.price !== undefined) form.append('price', String(data.price))
    if (data.is_listed !== undefined) form.append('is_listed', String(data.is_listed))

    const res = await fetch(`${BASE}/assets/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new ApiError(res.status, body.detail || 'Update failed')
    }
    return res.json()
  },

  delete: (id: string) => del<{ message: string }>(`/assets/${id}`),

  rate: (id: string, rating: number, comment = '') =>
    post<{ message: string }>(`/assets/${id}/rate`, { rating, comment }),

  /** Download the asset zip archive as a Blob. Triggers browser download. */
  download: async (id: string, filename?: string): Promise<void> => {
    const res = await fetch(`${BASE}/assets/${id}/download`, {
      method: 'POST',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new ApiError(res.status, body.detail || 'Download failed')
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `asset-${id}.zip`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },

  /** Get a single file from the archive (text content). */
  getFile: async (id: string, filename: string): Promise<string> => {
    const res = await fetch(`${BASE}/assets/${id}/files/${encodeURIComponent(filename)}`, {
      headers: authHeaders(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new ApiError(res.status, body.detail || 'File access denied')
    }
    return res.text()
  },

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
