import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { assets as assetsApi } from '../../api/client'
import type { EvoPackBrief, PaginatedResponse } from '../../types'
import { PageLoader, EmptyState, StarRating, ErrorMessage } from '../../components/Ui'

const SORT_OPTIONS = [
  { value: 'composite_score', label: 'Score' },
  { value: 'created_at', label: 'Newest' },
  { value: 'price', label: 'Price' },
  { value: 'usage_count', label: 'Usage' },
  { value: 'avg_rating', label: 'Rating' },
]

export default function Marketplace() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<PaginatedResponse<EvoPackBrief> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const search = searchParams.get('search') || ''
  const tag = searchParams.get('tag') || ''
  const sortBy = searchParams.get('sort_by') || 'composite_score'
  const order = searchParams.get('order') || 'desc'
  const page = parseInt(searchParams.get('page') || '1')

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await assetsApi.list({ search, tag, sort_by: sortBy, order, page, page_size: 12 })
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [search, tag, sortBy, order, page])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

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
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl text-charcoal-800 mb-2">EvoPack Marketplace</h1>
        <p className="text-charcoal-400">
          Browse and discover reusable EvoPacks published by the community.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search EvoPacks..."
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
          value={sortBy}
          onChange={(e) => updateParam('sort_by', e.target.value)}
          className="input w-full sm:w-36"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={() => updateParam('order', order === 'desc' ? 'asc' : 'desc')}
          className="btn-secondary px-3"
          title={`Sort ${order === 'desc' ? 'ascending' : 'descending'}`}
        >
          {order === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchAssets} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No EvoPacks found" description="Try adjusting your search or filters." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {data.items.map((asset, i) => (
              <Link
                to={`/marketplace/${asset.id}`}
                key={asset.id}
                className="card p-5 flex flex-col animate-slide-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-display text-lg text-charcoal-700 leading-snug flex-1 mr-2">
                    {asset.name}
                  </h3>
                  <span className="text-xs font-mono text-charcoal-300">v{asset.version}</span>
                </div>
                <p className="text-sm text-charcoal-400 line-clamp-2 mb-4 flex-1">
                  {asset.description || 'No description'}
                </p>
                {asset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {asset.tags.slice(0, 4).map((t) => (
                      <span key={t} className="badge badge-sage">{t}</span>
                    ))}
                    {asset.tags.length > 4 && (
                      <span className="badge badge-charcoal">+{asset.tags.length - 4}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-cream-200">
                  <div className="flex items-center gap-3">
                    <StarRating rating={asset.avg_rating} />
                    <span className="text-2xs text-charcoal-300">({asset.rating_count})</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-charcoal-400">
                    <span>{asset.usage_count} uses</span>
                    <span className="font-medium text-sage-600">
                      {asset.price > 0 ? `${asset.price} cr` : 'Free'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => updateParam('page', String(page - 1))}
                className="btn-ghost text-sm"
              >
                Previous
              </button>
              <span className="text-sm text-charcoal-400">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => updateParam('page', String(page + 1))}
                className="btn-ghost text-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
