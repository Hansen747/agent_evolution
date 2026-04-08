import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { bounties as bountiesApi } from '../../api/client'
import type { BountyResponse, PaginatedResponse } from '../../types'
import { PageLoader, EmptyState, ErrorMessage } from '../../components/Ui'

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'solved', label: 'Solved' },
]

function statusColor(status: string) {
  switch (status) {
    case 'open': return 'bg-green-100 text-green-700'
    case 'in_progress': return 'bg-amber-100 text-amber-700'
    case 'solved': return 'bg-charcoal-100 text-charcoal-600'
    default: return 'bg-cream-200 text-charcoal-500'
  }
}

export default function BountyList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<PaginatedResponse<BountyResponse> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const search = searchParams.get('search') || ''
  const tag = searchParams.get('tag') || ''
  const statusFilter = searchParams.get('status') || ''
  const page = parseInt(searchParams.get('page') || '1')

  const fetchBounties = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await bountiesApi.list({ search, tag, status: statusFilter, page, page_size: 12 })
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load bounties')
    } finally {
      setLoading(false)
    }
  }, [search, tag, statusFilter, page])

  useEffect(() => {
    fetchBounties()
  }, [fetchBounties])

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(key, value)
    else params.delete(key)
    if (key !== 'page') params.delete('page')
    setSearchParams(params)
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-charcoal-800 mb-2">Bounties</h1>
        <p className="text-charcoal-400">
          Problems seeking solutions. Submit your subagent to claim the reward.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search bounties..."
            value={search}
            onChange={(e) => updateParam('search', e.target.value)}
            className="input"
          />
        </div>
        <input
          type="text"
          placeholder="Filter by tag"
          value={tag}
          onChange={(e) => updateParam('tag', e.target.value)}
          className="input w-full sm:w-40"
        />
        <select
          value={statusFilter}
          onChange={(e) => updateParam('status', e.target.value)}
          className="input w-full sm:w-36"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchBounties} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No bounties found" description="Try adjusting your search or filters." />
      ) : (
        <>
          <div className="space-y-4 mb-8">
            {data.items.map((bounty, i) => (
              <Link
                to={`/bounties/${bounty.id}`}
                key={bounty.id}
                className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4 animate-slide-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-display text-lg text-charcoal-700">{bounty.title}</h3>
                    <span className={`badge ${statusColor(bounty.status)}`}>{bounty.status}</span>
                  </div>
                  <p className="text-sm text-charcoal-400 line-clamp-2 mb-2">{bounty.description}</p>
                  {bounty.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {bounty.tags.slice(0, 4).map((t) => (
                        <span key={t} className="badge badge-sage">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 shrink-0">
                  {bounty.reward > 0 && (
                    <span className="font-display text-xl text-sage-600">{bounty.reward} cr</span>
                  )}
                  <span className="text-xs text-charcoal-400">{bounty.solution_count} solution{bounty.solution_count !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-charcoal-300">{new Date(bounty.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))} className="btn-ghost text-sm">Previous</button>
              <span className="text-sm text-charcoal-400">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => updateParam('page', String(page + 1))} className="btn-ghost text-sm">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
