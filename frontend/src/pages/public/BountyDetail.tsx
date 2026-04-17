import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { bounties as bountiesApi } from '../../api/client'
import type { BountyResponse, SolutionResponse } from '../../types'
import { PageLoader, ErrorMessage, EmptyState } from '../../components/Ui'
import { useAuth } from '../../contexts/AuthContext'

export default function BountyDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [bounty, setBounty] = useState<BountyResponse | null>(null)
  const [solutions, setSolutions] = useState<SolutionResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showManage, setShowManage] = useState(false)
  const [manageTitle, setManageTitle] = useState('')
  const [manageDescription, setManageDescription] = useState('')
  const [manageTags, setManageTags] = useState('')
  const [manageReward, setManageReward] = useState('0')
  const [manageStatus, setManageStatus] = useState<'open' | 'in_progress'>('open')
  const [manageBusy, setManageBusy] = useState(false)
  const [manageFeedback, setManageFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  // Solution submission
  const [showSubmit, setShowSubmit] = useState(false)
  const [solutionContent, setSolutionContent] = useState('')
  const [solutionAssetId, setSolutionAssetId] = useState('')
  const [submitMsg, setSubmitMsg] = useState('')

  const refreshDetail = async (bountyId: string) => {
    const [b, s] = await Promise.all([
      bountiesApi.get(bountyId),
      bountiesApi.solutions(bountyId),
    ])
    setBounty(b)
    setSolutions(s)
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)
    refreshDetail(id)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!bounty) return
    setManageTitle(bounty.title)
    setManageDescription(bounty.description)
    setManageTags(bounty.tags.join(', '))
    setManageReward(String(bounty.reward))
    setManageStatus(bounty.status === 'in_progress' ? 'in_progress' : 'open')
  }, [bounty])

  const handleSubmitSolution = async () => {
    if (!id || !solutionAssetId.trim()) return
    try {
      const sol = await bountiesApi.submitSolution(id, {
        content: solutionContent.trim() || undefined,
        asset_id: solutionAssetId.trim(),
      })
      setSolutions([...solutions, sol])
      setSolutionContent('')
      setSolutionAssetId('')
      setShowSubmit(false)
      setSubmitMsg('Solution submitted!')
      await refreshDetail(id)
    } catch (e: unknown) {
      setSubmitMsg(e instanceof Error ? e.message : 'Submission failed')
    }
  }

  const handleAcceptSolution = async (solutionId: string) => {
    if (!id) return
    try {
      await bountiesApi.acceptSolution(id, solutionId)
      await refreshDetail(id)
      setSubmitMsg('Solution accepted!')
    } catch (e: unknown) {
      setSubmitMsg(e instanceof Error ? e.message : 'Accept failed')
    }
  }

  const handleSaveBounty = async () => {
    if (!id || !manageTitle.trim() || !manageDescription.trim()) return

    const parsedReward = Number.parseFloat(manageReward || '0')
    if (Number.isNaN(parsedReward) || parsedReward < 0) {
      setManageFeedback({ tone: 'error', message: 'Reward must be a valid non-negative number.' })
      return
    }

    setManageBusy(true)
    setManageFeedback(null)
    try {
      await bountiesApi.update(id, {
        title: manageTitle.trim(),
        description: manageDescription.trim(),
        tags: manageTags.split(',').map((tag) => tag.trim()).filter(Boolean),
        reward: parsedReward,
        status: manageStatus,
      })
      await refreshDetail(id)
      setManageFeedback({ tone: 'success', message: 'Bounty updated.' })
    } catch (e: unknown) {
      setManageFeedback({ tone: 'error', message: e instanceof Error ? e.message : 'Update failed' })
    } finally {
      setManageBusy(false)
    }
  }

  const handleCloseBounty = async () => {
    if (!id) return

    setManageBusy(true)
    setManageFeedback(null)
    try {
      await bountiesApi.update(id, { status: 'closed' })
      await refreshDetail(id)
      setShowManage(false)
      setManageFeedback({ tone: 'success', message: 'Bounty closed and remaining escrow refunded.' })
    } catch (e: unknown) {
      setManageFeedback({ tone: 'error', message: e instanceof Error ? e.message : 'Close failed' })
    } finally {
      setManageBusy(false)
    }
  }

  if (loading) return <PageLoader />
  if (error) return <div className="max-w-4xl mx-auto px-4 py-10"><ErrorMessage message={error} /></div>
  if (!bounty) return null

  const isPoster = user?.id === bounty.poster_id
  const isLocked = ['solved', 'closed'].includes(bounty.status)
  const canManage = isPoster && !isLocked
  const canSubmit = user && !isPoster && ['open', 'in_progress'].includes(bounty.status)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <nav className="flex items-center gap-2 text-sm text-charcoal-400 mb-6">
        <Link to="/bounties" className="hover:text-sage-600 transition-colors">Bounties</Link>
        <span>/</span>
        <span className="text-charcoal-600 truncate">{bounty.title}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="font-display text-3xl text-charcoal-800">{bounty.title}</h1>
          <span className={`badge ${bounty.status === 'open' ? 'bg-green-100 text-green-700' : bounty.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-charcoal-100 text-charcoal-600'}`}>
            {bounty.status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-charcoal-400">
          <span>{new Date(bounty.created_at).toLocaleDateString()}</span>
          {bounty.reward > 0 && (
            <>
              <span>&middot;</span>
              <span className="font-display text-lg text-sage-600">{bounty.reward} cr reward</span>
            </>
          )}
          {bounty.expires_at && (
            <>
              <span>&middot;</span>
              <span>Expires: {new Date(bounty.expires_at).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="card p-6 mb-8">
        <h2 className="font-display text-xl text-charcoal-700 mb-3">Problem Description</h2>
        <p className="text-charcoal-500 leading-relaxed whitespace-pre-wrap">{bounty.description}</p>
        {bounty.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-cream-200">
            {bounty.tags.map((t) => (
              <span key={t} className="badge badge-sage">{t}</span>
            ))}
          </div>
        )}
      </div>

      {isPoster && (
        <div className="card p-6 mb-8 border-sage-200 bg-sage-50/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-xl text-charcoal-700">Manage Bounty</h2>
              <p className="text-sm text-charcoal-500 mt-1">
                Update the brief, adjust the reward, move between open and in-progress, or close the bounty to refund remaining escrow.
              </p>
            </div>
            {canManage && (
              <button onClick={() => setShowManage((value) => !value)} className="btn-secondary text-sm">
                {showManage ? 'Hide editor' : 'Edit bounty'}
              </button>
            )}
          </div>

          {manageFeedback && (
            <p className={`mt-4 text-sm ${manageFeedback.tone === 'success' ? 'text-sage-700' : 'text-red-700'}`}>
              {manageFeedback.message}
            </p>
          )}

          {isLocked && (
            <div className="mt-4 rounded-xl border border-cream-300 bg-white px-4 py-3 text-sm text-charcoal-500">
              This bounty is {bounty.status} and can no longer be edited from the UI.
            </div>
          )}

          {showManage && canManage && (
            <div className="mt-5 space-y-4 rounded-2xl border border-sage-200 bg-white p-5">
              <div>
                <label className="block text-sm font-medium text-charcoal-600 mb-1">Title</label>
                <input value={manageTitle} onChange={(e) => setManageTitle(e.target.value)} className="input" />
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal-600 mb-1">Description</label>
                <textarea
                  value={manageDescription}
                  onChange={(e) => setManageDescription(e.target.value)}
                  rows={6}
                  className="input"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-charcoal-600 mb-1">Tags</label>
                  <input
                    value={manageTags}
                    onChange={(e) => setManageTags(e.target.value)}
                    className="input"
                    placeholder="automation, evaluation, scraping"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-charcoal-600 mb-1">Reward</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={manageReward}
                    onChange={(e) => setManageReward(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-charcoal-600 mb-1">Status</label>
                  <select value={manageStatus} onChange={(e) => setManageStatus(e.target.value as 'open' | 'in_progress')} className="input">
                    <option value="open">open</option>
                    <option value="in_progress">in_progress</option>
                  </select>
                </div>

                <div className="rounded-xl border border-cream-300 bg-cream-100/70 px-4 py-3 text-sm text-charcoal-500">
                  Lowering the reward refunds the difference immediately. Closing the bounty refunds the remaining escrow in a separate action.
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-cream-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button onClick={handleCloseBounty} className="btn-danger" disabled={manageBusy || bounty.status === 'closed'}>
                  Close bounty
                </button>
                <button onClick={handleSaveBounty} className="btn-primary" disabled={manageBusy || !manageTitle.trim() || !manageDescription.trim()}>
                  {manageBusy ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Solutions */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-charcoal-700">
            Solutions ({solutions.length})
          </h2>
          {canSubmit && (
            <button onClick={() => setShowSubmit(!showSubmit)} className="btn-primary text-sm">
              {showSubmit ? 'Cancel' : 'Submit solution'}
            </button>
          )}
        </div>

        {/* Submit form */}
        {showSubmit && (
          <div className="card p-5 mb-4 bg-sage-50/50 border-sage-200">
            <h3 className="font-medium text-charcoal-700 mb-3">Your Solution</h3>
            <p className="text-sm text-charcoal-400 mb-3">
              Bounty answers must reference an uploaded EvoPack. Add a short note if you want to explain why this EvoPack solves the task.
            </p>
            <textarea
              value={solutionContent}
              onChange={(e) => setSolutionContent(e.target.value)}
              placeholder="Optional explanation of how the EvoPack solves the bounty..."
              rows={5}
              className="input mb-3"
            />
            <input
              value={solutionAssetId}
              onChange={(e) => setSolutionAssetId(e.target.value)}
              placeholder="Linked EvoPack ID (required)"
              className="input mb-3"
            />
            <button onClick={handleSubmitSolution} className="btn-primary" disabled={!solutionAssetId.trim()}>
              Submit
            </button>
          </div>
        )}

        {submitMsg && <p className="text-sm text-sage-600 mb-4">{submitMsg}</p>}

        {solutions.length === 0 ? (
          <EmptyState title="No solutions yet" description="Be the first to submit a solution!" />
        ) : (
          <div className="space-y-3">
            {solutions.map((sol) => (
              <div key={sol.id} className={`card p-5 ${sol.is_accepted ? 'border-sage-400 bg-sage-50/50' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {sol.is_accepted && <span className="badge bg-sage-200 text-sage-700">Accepted</span>}
                    {sol.rating !== null && (
                      <span className="badge badge-amber">{sol.rating}/5</span>
                    )}
                  </div>
                  <span className="text-xs text-charcoal-300">{new Date(sol.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-charcoal-500 whitespace-pre-wrap">{sol.content}</p>
                {sol.asset_id && (
                  <p className="text-xs text-charcoal-400 mt-2">
                    Linked EvoPack: <Link to={`/marketplace/${sol.asset_id}`} className="text-sage-600 underline">{sol.asset_id}</Link>
                  </p>
                )}
                {isPoster && !sol.is_accepted && bounty.status !== 'solved' && (
                  <button
                    onClick={() => handleAcceptSolution(sol.id)}
                    className="btn-primary text-xs mt-3"
                  >
                    Accept this solution
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
