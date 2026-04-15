import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { experts as expertsApi } from '../../api/client'
import type { ExpertResponse, PaginatedResponse } from '../../types'
import { PageLoader, EmptyState, ErrorMessage } from '../../components/Ui'

export default function Experts() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<PaginatedResponse<ExpertResponse> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const search = searchParams.get('search') || ''
  const domain = searchParams.get('domain') || ''
  const page = parseInt(searchParams.get('page') || '1')

  const fetchExperts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await expertsApi.list({ search, domain, page, page_size: 12 })
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load experts')
    } finally {
      setLoading(false)
    }
  }, [search, domain, page])

  useEffect(() => { fetchExperts() }, [fetchExperts])

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
        <h1 className="font-display text-3xl text-charcoal-800 mb-2">Expert Agents</h1>
        <p className="text-charcoal-400">
          Browse expert agents available for consultation. Start a chat to learn from domain specialists.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search experts..."
            value={search}
            onChange={(e) => updateParam('search', e.target.value)}
            className="input"
          />
        </div>
        <input
          type="text"
          placeholder="Filter by domain"
          value={domain}
          onChange={(e) => updateParam('domain', e.target.value)}
          className="input w-full sm:w-48"
        />
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchExperts} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No experts found" description="Try adjusting your search or check back later." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {data.items.map((expert, i) => (
              <Link
                to={`/experts/${expert.id}`}
                key={expert.id}
                className="card p-5 flex flex-col animate-slide-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-display text-lg text-charcoal-700 leading-snug flex-1 mr-2">
                    {expert.name}
                  </h3>
                  <div className="flex gap-1.5">
                    {expert.is_platform && (
                      <span className="badge bg-blue-100 text-blue-700">Platform</span>
                    )}
                    <span className={`badge ${expert.is_available ? 'bg-green-100 text-green-700' : 'bg-charcoal-100 text-charcoal-500'}`}>
                      {expert.is_available ? 'Available' : 'Busy'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-charcoal-400 line-clamp-2 mb-4 flex-1">
                  {expert.description || 'No description'}
                </p>
                <div className="mb-3">
                  <span className="badge badge-sage">{expert.domain}</span>
                </div>
                {expert.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {expert.tags.slice(0, 4).map((t) => (
                      <span key={t} className="badge badge-charcoal">{t}</span>
                    ))}
                  </div>
                )}
                <div className="pt-3 border-t border-cream-200 text-xs text-charcoal-300">
                  Registered {new Date(expert.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => updateParam('page', String(page - 1))}
                className="btn-ghost text-sm"
              >Previous</button>
              <span className="text-sm text-charcoal-400">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => updateParam('page', String(page + 1))}
                className="btn-ghost text-sm"
              >Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
