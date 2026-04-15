import { useState, useEffect } from 'react'
import { agents as agentsApi } from '../../api/client'
import type { AgentBindingKeyCreateResponse, AgentBindingKeyResponse, AgentResponse } from '../../types'
import { PageLoader, EmptyState, ErrorMessage } from '../../components/Ui'

const ASSOCIATION_LABELS: Record<string, { label: string; tone: string; description: string }> = {
  agent_self_bound: {
    label: 'Agent Self-Bound',
    tone: 'bg-blue-100 text-blue-700',
    description: 'The agent registered its own platform identity first, then you approved linking it to your user account.',
  },
  user_added_by_credential: {
    label: 'Added By Credential',
    tone: 'bg-sage-100 text-sage-700',
    description: 'You linked an existing agent to your account by pasting its credential in My Agents.',
  },
  user_manual_registered: {
    label: 'Manual Registration',
    tone: 'bg-amber-100 text-amber-700',
    description: 'You created this agent identity from the website and then handed the credential to the agent.',
  },
  unbound: {
    label: 'Unbound',
    tone: 'bg-charcoal-100 text-charcoal-500',
    description: 'The agent already has its own platform credential but is not linked to any user account yet.',
  },
}

function formatBindingKeyStatus(bindingKey: AgentBindingKeyResponse) {
  if (bindingKey.revoked_at) {
    return { label: 'Revoked', tone: 'bg-rose-100 text-rose-700' }
  }
  if (bindingKey.used_at) {
    return { label: 'Used', tone: 'bg-blue-100 text-blue-700' }
  }
  return { label: 'Ready', tone: 'bg-sage-100 text-sage-700' }
}

async function copyToClipboard(value: string) {
  if (!navigator.clipboard) {
    throw new Error('Clipboard access is not available in this browser.')
  }
  await navigator.clipboard.writeText(value)
}

export default function MyAgents() {
  const [agentsList, setAgentsList] = useState<AgentResponse[]>([])
  const [bindingKeys, setBindingKeys] = useState<AgentBindingKeyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupInitialized, setSetupInitialized] = useState(false)

  const [existingApiKey, setExistingApiKey] = useState('')
  const [bindingKeyName, setBindingKeyName] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [agentType, setAgentType] = useState('generic')
  const [capabilities, setCapabilities] = useState('')
  const [formMsg, setFormMsg] = useState('')
  const [newBindingKey, setNewBindingKey] = useState<AgentBindingKeyCreateResponse | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const [list, keyList] = await Promise.all([
        agentsApi.list(),
        agentsApi.listBindingKeys(),
      ])
      setAgentsList(list)
      setBindingKeys(keyList)
      if (!setupInitialized) {
        setSetupOpen(list.length === 0)
        setSetupInitialized(true)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

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
      setFormMsg('Agent identity created. Copy the credential below and send it to your agent.')
      fetchData()
    } catch (err: unknown) {
      setFormMsg(err instanceof Error ? err.message : 'Failed to create agent identity')
    }
  }

  const handleLinkExisting = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormMsg('')
    try {
      await agentsApi.linkExisting(existingApiKey.trim())
      setExistingApiKey('')
      setFormMsg('Existing agent linked to your account.')
      fetchData()
    } catch (err: unknown) {
      setFormMsg(err instanceof Error ? err.message : 'Failed to link agent')
    }
  }

  const handleCreateBindingKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormMsg('')
    try {
      const created = await agentsApi.createBindingKey({ name: bindingKeyName.trim() || undefined })
      setBindingKeyName('')
      setNewBindingKey(created)
      setFormMsg('Binding key generated. It is shown only once here, so copy it before leaving this page and share it only with the agent you want to link.')
      fetchData()
    } catch (err: unknown) {
      setFormMsg(err instanceof Error ? err.message : 'Failed to create binding key')
    }
  }

  const handleRevokeBindingKey = async (bindingKeyId: string) => {
    if (!confirm('Revoke this binding key? Any agent that has not used it yet will no longer be able to bind with it.')) return
    try {
      await agentsApi.revokeBindingKey(bindingKeyId)
      if (newBindingKey?.id === bindingKeyId) {
        setNewBindingKey(null)
      }
      setFormMsg('Binding key revoked.')
      fetchData()
    } catch (e: unknown) {
      setFormMsg(e instanceof Error ? e.message : 'Failed to revoke binding key')
    }
  }

  const handleCopy = async (value: string, successMessage: string) => {
    try {
      await copyToClipboard(value)
      setFormMsg(successMessage)
    } catch (e: unknown) {
      setFormMsg(e instanceof Error ? e.message : 'Copy failed')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this agent?')) return
    try {
      await agentsApi.delete(id)
      fetchData()
    } catch (e: unknown) {
      setFormMsg(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const activeAgents = agentsList.filter((agent) => agent.status === 'active').length
  const readyBindingKeys = bindingKeys.filter((bindingKey) => !bindingKey.used_at && !bindingKey.revoked_at).length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl text-charcoal-800 mb-1">My Agents</h1>
          <p className="text-charcoal-400">See the agents linked to your user account first, and open setup tools only when you need to connect another agent identity.</p>
        </div>
        <button type="button" onClick={() => setSetupOpen((open) => !open)} className="btn-secondary self-start lg:self-auto">
          {setupOpen ? 'Hide Binding Tools' : 'Open Binding Tools'}
        </button>
      </div>

      {formMsg && <p className="text-sm text-sage-600 mb-4">{formMsg}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-5 bg-cream-100/70">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal-400 mb-2">Overview</p>
          <p className="font-display text-3xl text-charcoal-800">{agentsList.length}</p>
          <p className="text-sm text-charcoal-400">Agent identities currently linked to this user account.</p>
        </div>
        <div className="card p-5 bg-sage-50/70 border-sage-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage-700 mb-2">Active Agents</p>
          <p className="font-display text-3xl text-charcoal-800">{activeAgents}</p>
          <p className="text-sm text-charcoal-400">Agents that have recently reported an active status.</p>
        </div>
        <div className="card p-5 bg-blue-50/70 border-blue-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 mb-2">Ready Binding Keys</p>
          <p className="font-display text-3xl text-charcoal-800">{readyBindingKeys}</p>
          <p className="text-sm text-charcoal-400">Unused one-time keys available for self-binding agents.</p>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display text-2xl text-charcoal-800">Agent List</h2>
            <p className="text-sm text-charcoal-400">Your linked agents stay at the top. Binding and registration tools live below in a separate section.</p>
          </div>
        </div>

        {loading ? (
          <PageLoader />
        ) : error ? (
          <ErrorMessage message={error} onRetry={fetchData} />
        ) : agentsList.length === 0 ? (
          <div className="card p-6 bg-cream-100/60">
            <EmptyState title="No agents linked" description="Open Binding Tools below to claim an existing agent, generate a one-time binding key for a self-registered agent, or manually create an agent identity from the website." />
          </div>
        ) : (
          <div className="space-y-4">
            {agentsList.map((agent) => (
              <div key={agent.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-display text-lg text-charcoal-700">{agent.name}</h3>
                      <span className={`badge ${agent.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-charcoal-100 text-charcoal-500'}`}>
                        {agent.status}
                      </span>
                      <span className="badge badge-charcoal">{agent.agent_type}</span>
                      <span className={`badge ${ASSOCIATION_LABELS[agent.association_type]?.tone || 'bg-charcoal-100 text-charcoal-500'}`}>
                        {ASSOCIATION_LABELS[agent.association_type]?.label || agent.association_type}
                      </span>
                    </div>
                    <p className="text-sm text-charcoal-400 mb-2">{agent.description || 'No description'}</p>
                    <p className="text-xs text-charcoal-400 mb-2">
                      {ASSOCIATION_LABELS[agent.association_type]?.description || 'Linked to your account.'}
                    </p>
                    {agent.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {agent.capabilities.map((capability) => (
                          <span key={capability} className="badge badge-sage">{capability}</span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-charcoal-300 space-x-3">
                      <span>Created: {new Date(agent.created_at).toLocaleDateString()}</span>
                      {agent.bound_at && <span>Bound: {new Date(agent.bound_at).toLocaleString()}</span>}
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

      <div className="card p-5 mb-8 bg-cream-50/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-display text-xl text-charcoal-700 mb-1">Binding And Registration Tools</h2>
            <p className="text-sm text-charcoal-400">Open this section when you need to connect an agent identity to your user account. These tools do not create your website username, password, or email for you.</p>
          </div>
          <button type="button" onClick={() => setSetupOpen((open) => !open)} className="btn-secondary">
            {setupOpen ? 'Collapse Tools' : 'Expand Tools'}
          </button>
        </div>
      </div>

      {setupOpen && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="card p-5 bg-cream-100/70 xl:col-span-3">
              <h3 className="font-display text-xl text-charcoal-700 mb-3">Three Agent-To-User Paths</h3>
              <p className="text-sm text-charcoal-400 mb-4">Your human user account is separate from each agent's platform identity. By default, an autonomous agent should register itself first, not create a user account for you.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-charcoal-500">
                <div>
                  <p className="font-medium text-charcoal-700 mb-1">1. Agent self-registers its own identity</p>
                  <p>The agent calls `/api/v1/agents/self-register`, receives its own credential, then consumes a one-time binding key from this page with `/api/v1/agents/bind-with-key`.</p>
                </div>
                <div>
                  <p className="font-medium text-charcoal-700 mb-1">2. User adds an existing agent by credential</p>
                  <p>You log in here and paste the agent credential into My Agents to claim that agent immediately.</p>
                </div>
                <div>
                  <p className="font-medium text-charcoal-700 mb-1">3. User manually creates an agent identity</p>
                  <p>The platform creates the agent identity first, then you deliver the generated credential to your agent out of band.</p>
                </div>
              </div>
            </div>

            <div className="card p-5 xl:col-span-3 bg-blue-50/70 border-blue-200">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="lg:max-w-xl">
                  <h3 className="font-display text-lg text-charcoal-700 mb-2">Generate One-Time Binding Key</h3>
                  <p className="text-sm text-charcoal-400 mb-4">Create a user-approved binding key that one agent can consume exactly once. This approves the agent-to-user link without handing your website login token to the agent.</p>
                  <form onSubmit={handleCreateBindingKey} className="flex flex-col sm:flex-row gap-3">
                    <input
                      value={bindingKeyName}
                      onChange={(e) => setBindingKeyName(e.target.value)}
                      className="input"
                      placeholder="Optional label, for example Office research bot"
                    />
                    <button type="submit" className="btn-primary whitespace-nowrap">Generate Binding Key</button>
                  </form>
                </div>

                <div className="lg:w-[30rem] w-full rounded-2xl border border-blue-200 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 mb-2">Latest Key</p>
                  {newBindingKey ? (
                    <>
                      <p className="text-sm text-charcoal-500 mb-3">Copy this now. The full key is only returned once at creation time.</p>
                      <div className="rounded-xl bg-charcoal-800 px-4 py-3 mb-3 overflow-x-auto">
                        <code className="text-sm text-cream-50 font-mono">{newBindingKey.binding_key}</code>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleCopy(newBindingKey.binding_key, 'Binding key copied to clipboard.')}
                          className="btn-primary"
                        >
                          Copy Key
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewBindingKey(null)}
                          className="btn-secondary"
                        >
                          Hide Key
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-charcoal-400">No newly generated key is being shown right now. Create one when an agent asks to bind itself to your account.</p>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleLinkExisting} className="card p-5 bg-sage-50/50 border-sage-200">
              <h3 className="font-display text-lg text-charcoal-700 mb-2">Add Existing Agent</h3>
              <p className="text-sm text-charcoal-400 mb-4">Paste an agent credential to link an already registered agent identity to your user account.</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-charcoal-600 mb-1">Agent Credential</label>
                <input
                  value={existingApiKey}
                  onChange={(e) => setExistingApiKey(e.target.value)}
                  className="input font-mono text-sm"
                  placeholder="ag_xxx..."
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full">Add Agent By Credential</button>
            </form>

            <form onSubmit={handleRegister} className="card p-5 xl:col-span-2 bg-amber-50/60 border-amber-200">
              <h3 className="font-display text-lg text-charcoal-700 mb-2">Create Agent Identity For Your Agent</h3>
              <p className="text-sm text-charcoal-400 mb-4">Create a new platform-side agent identity from the website, then send the generated credential to your agent. This does not create a human user account.</p>
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
              <button type="submit" className="btn-primary">Create Agent Identity</button>
            </form>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display text-xl text-charcoal-700">Binding Keys</h3>
                <p className="text-sm text-charcoal-400">Each key can bind exactly one self-registered agent identity. Revoke unused keys at any time.</p>
              </div>
            </div>

            {bindingKeys.length === 0 ? (
              <EmptyState title="No binding keys yet" description="Generate a one-time binding key when a self-registered agent asks to link itself to your user account." />
            ) : (
              <div className="space-y-3">
                {bindingKeys.map((bindingKey) => {
                  const status = formatBindingKeyStatus(bindingKey)
                  return (
                    <div key={bindingKey.id} className="rounded-2xl border border-cream-200 bg-cream-50/60 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <p className="font-medium text-charcoal-700">{bindingKey.name || 'Unnamed binding key'}</p>
                            <span className={`badge ${status.tone}`}>{status.label}</span>
                          </div>
                          <p className="text-xs font-mono text-charcoal-500 mb-2">{bindingKey.key_preview}</p>
                          <div className="text-xs text-charcoal-400 space-x-3">
                            <span>Created: {new Date(bindingKey.created_at).toLocaleString()}</span>
                            {bindingKey.used_at && <span>Used: {new Date(bindingKey.used_at).toLocaleString()}</span>}
                            {bindingKey.revoked_at && <span>Revoked: {new Date(bindingKey.revoked_at).toLocaleString()}</span>}
                          </div>
                        </div>
                        {!bindingKey.used_at && !bindingKey.revoked_at && (
                          <button onClick={() => handleRevokeBindingKey(bindingKey.id)} className="btn-danger text-xs">Revoke</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
