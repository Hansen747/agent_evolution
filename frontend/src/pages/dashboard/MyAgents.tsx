import { useState, useEffect } from 'react'
import { agents as agentsApi } from '../../api/client'
import type { AgentResponse } from '../../types'
import { PageLoader, EmptyState, ErrorMessage } from '../../components/Ui'

export default function MyAgents() {
  const [agentsList, setAgentsList] = useState<AgentResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Register form
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [agentType, setAgentType] = useState('generic')
  const [capabilities, setCapabilities] = useState('')
  const [formMsg, setFormMsg] = useState('')

  const fetchAgents = async () => {
    setLoading(true)
    try {
      const list = await agentsApi.list()
      setAgentsList(list)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAgents() }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormMsg('')
    try {
      await agentsApi.register({
        name,
        description,
        agent_type: agentType,
        capabilities: capabilities.split(',').map(s => s.trim()).filter(Boolean),
      })
      setName(''); setDescription(''); setCapabilities('')
      setShowForm(false)
      setFormMsg('Agent registered!')
      fetchAgents()
    } catch (err: unknown) {
      setFormMsg(err instanceof Error ? err.message : 'Failed to register agent')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this agent?')) return
    try {
      await agentsApi.delete(id)
      fetchAgents()
    } catch (e: unknown) {
      setFormMsg(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-charcoal-800 mb-1">My Agents</h1>
          <p className="text-charcoal-400">AI agents connected to your account.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? 'Cancel' : 'Register Agent'}
        </button>
      </div>

      {formMsg && <p className="text-sm text-sage-600 mb-4">{formMsg}</p>}

      {showForm && (
        <form onSubmit={handleRegister} className="card p-5 mb-6 bg-sage-50/50 border-sage-200">
          <h3 className="font-display text-lg text-charcoal-700 mb-4">Register New Agent</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-charcoal-600 mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal-600 mb-1">Type</label>
              <select value={agentType} onChange={(e) => setAgentType(e.target.value)} className="input">
                <option value="generic">Generic</option>
                <option value="researcher">Researcher</option>
                <option value="coder">Coder</option>
                <option value="analyst">Analyst</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-charcoal-600 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={2} />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-charcoal-600 mb-1">Capabilities <span className="text-charcoal-300">(comma-separated)</span></label>
            <input value={capabilities} onChange={(e) => setCapabilities(e.target.value)} className="input" placeholder="web_search, code_gen, analysis" />
          </div>
          <button type="submit" className="btn-primary">Register</button>
        </form>
      )}

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchAgents} />
      ) : agentsList.length === 0 ? (
        <EmptyState title="No agents registered" description="Register an AI agent to start publishing assets." />
      ) : (
        <div className="space-y-4">
          {agentsList.map((agent) => (
            <div key={agent.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-lg text-charcoal-700">{agent.name}</h3>
                    <span className={`badge ${agent.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-charcoal-100 text-charcoal-500'}`}>
                      {agent.status}
                    </span>
                    <span className="badge badge-charcoal">{agent.agent_type}</span>
                  </div>
                  <p className="text-sm text-charcoal-400 mb-2">{agent.description || 'No description'}</p>
                  {agent.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {agent.capabilities.map((c) => (
                        <span key={c} className="badge badge-sage">{c}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-charcoal-300 space-x-3">
                    <span>Created: {new Date(agent.created_at).toLocaleDateString()}</span>
                    {agent.last_heartbeat && <span>Last heartbeat: {new Date(agent.last_heartbeat).toLocaleString()}</span>}
                  </div>
                </div>
                <button onClick={() => handleDelete(agent.id)} className="btn-danger text-xs">Delete</button>
              </div>
              <div className="mt-3 pt-3 border-t border-cream-200">
                <p className="text-xs text-charcoal-400">
                  API Key: <code className="text-xs font-mono bg-cream-200 px-1.5 py-0.5 rounded">{agent.api_key}</code>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
