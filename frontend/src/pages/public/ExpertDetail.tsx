import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { experts as expertsApi, agents as agentsApi, chat as chatApi } from '../../api/client'
import type { ExpertResponse, AgentResponse } from '../../types'
import { PageLoader, ErrorMessage } from '../../components/Ui'

export default function ExpertDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [expert, setExpert] = useState<ExpertResponse | null>(null)
  const [myAgents, setMyAgents] = useState<AgentResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Chat creation form
  const [showChat, setShowChat] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [topic, setTopic] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const e = await expertsApi.get(id!)
        setExpert(e)
        try {
          const agents = await agentsApi.list()
          setMyAgents(agents)
          if (agents.length > 0) setSelectedAgent(agents[0].id)
        } catch {
          // Not logged in — that's ok
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load expert')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent || !expert) return
    setCreating(true)
    setCreateError('')
    try {
      const session = await chatApi.createSession({
        expert_id: expert.id,
        agent_id: selectedAgent,
        topic,
      })
      navigate(`/dashboard/chats/${session.id}`)
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <PageLoader />
  if (error) return <div className="max-w-3xl mx-auto px-4 py-10"><ErrorMessage message={error} /></div>
  if (!expert) return null

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="font-display text-2xl text-charcoal-800 mb-1">{expert.name}</h1>
            <div className="flex items-center gap-2">
              <span className="badge badge-sage">{expert.domain}</span>
              {expert.is_platform && <span className="badge bg-blue-100 text-blue-700">Platform Expert</span>}
              <span className={`badge ${expert.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {expert.is_available ? 'Available' : 'Unavailable'}
              </span>
            </div>
          </div>
        </div>

        <p className="text-charcoal-500 mb-4">{expert.description || 'No description provided.'}</p>

        {expert.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {expert.tags.map((t) => <span key={t} className="badge badge-charcoal">{t}</span>)}
          </div>
        )}

        <div className="text-xs text-charcoal-300 space-x-4">
          <span>Registered: {new Date(expert.created_at).toLocaleDateString()}</span>
          {expert.is_platform && <span>Max concurrent: {expert.max_concurrent}</span>}
        </div>
      </div>

      {/* Start consultation */}
      {myAgents.length > 0 && expert.is_available ? (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg text-charcoal-700">Start Consultation</h2>
            {!showChat && (
              <button onClick={() => setShowChat(true)} className="btn-primary text-sm">
                Start Chat
              </button>
            )}
          </div>

          {showChat && (
            <form onSubmit={handleCreateSession}>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal-600 mb-1">Your Agent</label>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="input"
                    required
                  >
                    {myAgents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.agent_type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal-600 mb-1">Topic (optional)</label>
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="input"
                    placeholder="What would you like to discuss?"
                  />
                </div>
              </div>
              {createError && <p className="text-sm text-red-600 mb-3">{createError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={creating} className="btn-primary text-sm">
                  {creating ? 'Creating...' : 'Create Session'}
                </button>
                <button type="button" onClick={() => setShowChat(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : myAgents.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-charcoal-400 mb-2">Register an agent to start consulting with experts.</p>
          <button onClick={() => navigate('/dashboard/agents')} className="btn-primary text-sm">
            Go to My Agents
          </button>
        </div>
      ) : null}
    </div>
  )
}
