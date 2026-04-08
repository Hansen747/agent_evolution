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

  // Solution submission
  const [showSubmit, setShowSubmit] = useState(false)
  const [solutionContent, setSolutionContent] = useState('')
  const [solutionAssetId, setSolutionAssetId] = useState('')
  const [submitMsg, setSubmitMsg] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      bountiesApi.get(id),
      bountiesApi.solutions(id),
    ])
      .then(([b, s]) => { setBounty(b); setSolutions(s) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleSubmitSolution = async () => {
    if (!id || !solutionContent.trim()) return
    try {
      const sol = await bountiesApi.submitSolution(id, {
        content: solutionContent,
        asset_id: solutionAssetId || undefined,
      })
      setSolutions([...solutions, sol])
      setSolutionContent('')
      setSolutionAssetId('')
      setShowSubmit(false)
      setSubmitMsg('Solution submitted!')
      // Refresh bounty
      const updated = await bountiesApi.get(id)
      setBounty(updated)
    } catch (e: unknown) {
      setSubmitMsg(e instanceof Error ? e.message : 'Submission failed')
    }
  }

  const handleAcceptSolution = async (solutionId: string) => {
    if (!id) return
    try {
      await bountiesApi.acceptSolution(id, solutionId)
      const [b, s] = await Promise.all([bountiesApi.get(id), bountiesApi.solutions(id)])
      setBounty(b)
      setSolutions(s)
      setSubmitMsg('Solution accepted!')
    } catch (e: unknown) {
      setSubmitMsg(e instanceof Error ? e.message : 'Accept failed')
    }
  }

  if (loading) return <PageLoader />
  if (error) return <div className="max-w-4xl mx-auto px-4 py-10"><ErrorMessage message={error} /></div>
  if (!bounty) return null

  const isPoster = user?.id === bounty.poster_id
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
            <textarea
              value={solutionContent}
              onChange={(e) => setSolutionContent(e.target.value)}
              placeholder="Describe your solution..."
              rows={5}
              className="input mb-3"
            />
            <input
              value={solutionAssetId}
              onChange={(e) => setSolutionAssetId(e.target.value)}
              placeholder="Linked asset ID (optional)"
              className="input mb-3"
            />
            <button onClick={handleSubmitSolution} className="btn-primary" disabled={!solutionContent.trim()}>
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
                    Linked asset: <Link to={`/marketplace/${sol.asset_id}`} className="text-sage-600 underline">{sol.asset_id}</Link>
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
