import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { bounties as bountiesApi } from '../../api/client'
import type { BountyResponse } from '../../types'
import { PageLoader, EmptyState, ErrorMessage } from '../../components/Ui'

export default function MyBounties() {
  const [bountiesList, setBountiesList] = useState<BountyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [reward, setReward] = useState('')
  const [formMsg, setFormMsg] = useState('')

  const fetchBounties = async () => {
    setLoading(true)
    try {
      const list = await bountiesApi.myPosted()
      setBountiesList(list)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load bounties')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchBounties() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormMsg('')
    try {
      await bountiesApi.create({
        title,
        description,
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        reward: reward ? parseFloat(reward) : 0,
      })
      setTitle(''); setDescription(''); setTags(''); setReward('')
      setShowForm(false)
      setFormMsg('Bounty created!')
      fetchBounties()
    } catch (err: unknown) {
      setFormMsg(err instanceof Error ? err.message : 'Failed to create bounty')
    }
  }

  function statusColor(status: string) {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-700'
      case 'in_progress': return 'bg-amber-100 text-amber-700'
      case 'solved': return 'bg-charcoal-100 text-charcoal-600'
      default: return 'bg-cream-200 text-charcoal-500'
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-charcoal-800 mb-1">My Bounties</h1>
          <p className="text-charcoal-400">Problems you've posted to the platform.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? 'Cancel' : 'Post Bounty'}
        </button>
      </div>

      {formMsg && <p className="text-sm text-sage-600 mb-4">{formMsg}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 bg-sage-50/50 border-sage-200">
          <h3 className="font-display text-lg text-charcoal-700 mb-4">New Bounty</h3>
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-charcoal-600 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal-600 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={4} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal-600 mb-1">Tags <span className="text-charcoal-300">(comma-separated)</span></label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} className="input" placeholder="nlp, web_scraping" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal-600 mb-1">Reward (credits)</label>
                <input type="number" step="0.1" min="0" value={reward} onChange={(e) => setReward(e.target.value)} className="input" placeholder="0" />
              </div>
            </div>
          </div>
          <button type="submit" className="btn-primary">Create Bounty</button>
        </form>
      )}

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchBounties} />
      ) : bountiesList.length === 0 ? (
        <EmptyState title="No bounties posted" description="Post a problem to attract solutions from the community." />
      ) : (
        <div className="space-y-4">
          {bountiesList.map((bounty) => (
            <Link to={`/bounties/${bounty.id}`} key={bounty.id} className="card p-5 flex items-center gap-4 group">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-display text-lg text-charcoal-700 group-hover:text-sage-600 transition-colors">{bounty.title}</h3>
                  <span className={`badge ${statusColor(bounty.status)}`}>{bounty.status}</span>
                </div>
                <p className="text-sm text-charcoal-400 line-clamp-1">{bounty.description}</p>
              </div>
              <div className="text-right shrink-0">
                {bounty.reward > 0 && <div className="font-display text-lg text-sage-600">{bounty.reward} cr</div>}
                <div className="text-xs text-charcoal-400">{bounty.solution_count} solutions</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
