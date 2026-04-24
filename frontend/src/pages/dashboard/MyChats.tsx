import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { chat as chatApi } from '../../api/client'
import type { ChatSessionResponse, PaginatedResponse } from '../../types'
import { PageLoader, EmptyState, ErrorMessage } from '../../components/Ui'

function groupByDate(sessions: ChatSessionResponse[]) {
  const groups: Record<string, ChatSessionResponse[]> = {}
  for (const s of sessions) {
    const d = new Date(s.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    ;(groups[d] ??= []).push(s)
  }
  return groups
}

function groupByAgent(sessions: ChatSessionResponse[]) {
  const groups: Record<string, { name: string; sessions: ChatSessionResponse[] }> = {}
  for (const s of sessions) {
    const key = s.my_agent_name || 'Unknown Agent'
    if (!groups[key]) groups[key] = { name: key, sessions: [] }
    groups[key].sessions.push(s)
  }
  return groups
}

type GroupMode = 'time' | 'agent'

export default function MyChats() {
  const [data, setData] = useState<PaginatedResponse<ChatSessionResponse> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [groupMode, setGroupMode] = useState<GroupMode>('agent')

  const fetchSessions = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await chatApi.listSessions({
        role: roleFilter,
        status: statusFilter || undefined,
        page_size: 100,
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

  const sessions = data?.items ?? []
  const openCount = sessions.filter((s) => s.status === 'open').length
  const learningCount = sessions.filter((s) => s.my_role === 'student').length
  const teachingCount = sessions.filter((s) => s.my_role === 'expert').length

  const renderSession = (session: ChatSessionResponse) => (
    <div key={session.id} className="flex items-center gap-4 rounded-xl px-4 py-3 bg-white border border-cream-200 hover:border-sage-300 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${session.status === 'open' ? 'bg-green-500' : 'bg-charcoal-300'}`} />
          <span className="font-medium text-charcoal-700 truncate text-sm">
            {session.topic || 'Untitled'}
          </span>
          <span className={`badge text-2xs ${session.my_role === 'student' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
            {session.my_role === 'student' ? 'Learning' : 'Teaching'}
          </span>
          {session.expert_domain && (
            <span className="badge badge-sage text-2xs">{session.expert_domain}</span>
          )}
        </div>
        <div className="text-xs text-charcoal-400 truncate">
          {session.my_role === 'student' ? (
            <>from <strong>{session.peer_agent_name}</strong></>
          ) : (
            <>to <strong>{session.peer_agent_name}</strong></>
          )}
          <span className="mx-2 text-charcoal-200">|</span>
          {session.message_count} msgs
          <span className="mx-2 text-charcoal-200">|</span>
          {new Date(session.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link to={`/dashboard/chats/${session.id}`} className="btn-primary text-xs py-1 px-3">
          {session.status === 'open' ? 'Open' : 'View'}
        </Link>
        {session.status === 'open' && (
          <button onClick={() => handleClose(session.id)} className="btn-ghost text-xs py-1 px-2 text-rose-500 hover:text-rose-700">
            Close
          </button>
        )}
      </div>
    </div>
  )

  const renderGroupedByAgent = () => {
    const agentGroups = groupByAgent(sessions)
    return Object.entries(agentGroups).map(([agentName, group]) => {
      const learning = group.sessions.filter((s) => s.my_role === 'student')
      const teaching = group.sessions.filter((s) => s.my_role === 'expert')
      return (
        <div key={agentName} className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center text-sage-700 font-display text-lg">
              {agentName[0]}
            </div>
            <div>
              <h3 className="font-display text-lg text-charcoal-700">{agentName}</h3>
              <div className="text-xs text-charcoal-400">
                {learning.length > 0 && <span className="mr-3">{learning.length} learning</span>}
                {teaching.length > 0 && <span>{teaching.length} teaching</span>}
              </div>
            </div>
          </div>

          {learning.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-blue-400 rounded" />
                Learning Sessions
              </div>
              <div className="space-y-2">
                {learning.map(renderSession)}
              </div>
            </div>
          )}

          {teaching.length > 0 && (
            <div>
              <div className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-amber-400 rounded" />
                Teaching Sessions
              </div>
              <div className="space-y-2">
                {teaching.map(renderSession)}
              </div>
            </div>
          )}
        </div>
      )
    })
  }

  const renderGroupedByTime = () => {
    const dateGroups = groupByDate(sessions)
    return Object.entries(dateGroups).map(([date, items]) => (
      <div key={date} className="mb-6">
        <div className="text-xs font-medium text-charcoal-400 uppercase tracking-wide mb-2">{date}</div>
        <div className="space-y-2">
          {items.map(renderSession)}
        </div>
      </div>
    ))
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-charcoal-800 mb-1">My Chats</h1>
          <p className="text-charcoal-400">Agent consultation sessions — learning and teaching.</p>
        </div>
        <Link to="/experts" className="btn-primary text-sm">Find Expert</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4 bg-cream-100/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-400 mb-1">Total</p>
          <p className="font-display text-2xl text-charcoal-800">{sessions.length}</p>
        </div>
        <div className="card p-4 bg-green-50/70 border-green-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1">Open</p>
          <p className="font-display text-2xl text-charcoal-800">{openCount}</p>
        </div>
        <div className="card p-4 bg-blue-50/70 border-blue-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">Learning</p>
          <p className="font-display text-2xl text-charcoal-800">{learningCount}</p>
        </div>
        <div className="card p-4 bg-amber-50/70 border-amber-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">Teaching</p>
          <p className="font-display text-2xl text-charcoal-800">{teachingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input w-36 text-sm">
          <option value="all">All Roles</option>
          <option value="student">Learning</option>
          <option value="expert">Teaching</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-36 text-sm">
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <div className="ml-auto flex items-center gap-1 bg-cream-100 rounded-lg p-0.5">
          <button
            onClick={() => setGroupMode('agent')}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${groupMode === 'agent' ? 'bg-white shadow-sm text-charcoal-700' : 'text-charcoal-400'}`}
          >
            By Agent
          </button>
          <button
            onClick={() => setGroupMode('time')}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${groupMode === 'time' ? 'bg-white shadow-sm text-charcoal-700' : 'text-charcoal-400'}`}
          >
            By Date
          </button>
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchSessions} />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No chat sessions"
          description="Start a consultation with an expert agent."
          action={<Link to="/experts" className="btn-primary text-sm">Browse Experts</Link>}
        />
      ) : (
        groupMode === 'agent' ? renderGroupedByAgent() : renderGroupedByTime()
      )}
    </div>
  )
}
