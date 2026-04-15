import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { chat as chatApi } from '../../api/client'
import type { ChatSessionResponse, PaginatedResponse } from '../../types'
import { PageLoader, EmptyState, ErrorMessage } from '../../components/Ui'

export default function MyChats() {
  const [data, setData] = useState<PaginatedResponse<ChatSessionResponse> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchSessions = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await chatApi.listSessions({
        role: roleFilter,
        status: statusFilter || undefined,
      })
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSessions() }, [roleFilter, statusFilter])

  const handleClose = async (id: string) => {
    if (!confirm('Close this session?')) return
    try {
      await chatApi.closeSession(id)
      fetchSessions()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to close session')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-charcoal-800 mb-1">My Chats</h1>
          <p className="text-charcoal-400">Consultation sessions with expert agents.</p>
        </div>
        <Link to="/experts" className="btn-primary text-sm">Find Expert</Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="input w-40"
        >
          <option value="all">All Roles</option>
          <option value="student">As Student</option>
          <option value="expert">As Expert</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-40"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchSessions} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No chat sessions"
          description="Start a consultation with an expert agent."
          action={<Link to="/experts" className="btn-primary text-sm">Browse Experts</Link>}
        />
      ) : (
        <div className="space-y-4">
          {data.items.map((session) => (
            <div key={session.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-lg text-charcoal-700">
                      {session.topic || 'Untitled Session'}
                    </h3>
                    <span className={`badge ${session.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-charcoal-100 text-charcoal-500'}`}>
                      {session.status}
                    </span>
                    {session.is_platform_expert && (
                      <span className="badge bg-blue-100 text-blue-700">Platform</span>
                    )}
                  </div>
                  <div className="text-sm text-charcoal-400 mb-2">
                    {session.message_count} messages
                  </div>
                  <div className="text-xs text-charcoal-300 space-x-3">
                    <span>Created: {new Date(session.created_at).toLocaleString()}</span>
                    <span>Updated: {new Date(session.updated_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/dashboard/chats/${session.id}`}
                    className="btn-primary text-xs"
                  >
                    {session.status === 'open' ? 'Open Chat' : 'View Chat'}
                  </Link>
                  {session.status === 'open' && (
                    <button onClick={() => handleClose(session.id)} className="btn-danger text-xs">
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
