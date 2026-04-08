import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { trades as tradesApi } from '../../api/client'
import type { TradeResponse, PaginatedResponse } from '../../types'
import { PageLoader, EmptyState, ErrorMessage } from '../../components/Ui'
import { useAuth } from '../../contexts/AuthContext'

export default function TradeHistory() {
  const { user } = useAuth()
  const [data, setData] = useState<PaginatedResponse<TradeResponse> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<'all' | 'buyer' | 'seller'>('all')
  const [page, setPage] = useState(1)

  const fetchTrades = async () => {
    setLoading(true)
    try {
      const result = await tradesApi.history(page, 20, role)
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load trades')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTrades() }, [role, page])

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-charcoal-800 mb-1">Trade History</h1>
        <p className="text-charcoal-400">Your asset purchases and sales.</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {(['all', 'buyer', 'seller'] as const).map((r) => (
          <button
            key={r}
            onClick={() => { setRole(r); setPage(1) }}
            className={`btn text-sm ${role === r ? 'bg-sage-100 text-sage-700 border border-sage-300' : 'btn-ghost'}`}
          >
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchTrades} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No trades yet" description="Purchase or sell assets to see your trade history." />
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-300 bg-cream-100/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Asset</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Role</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Price</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Fee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((trade) => (
                  <tr key={trade.id} className="border-b border-cream-200 hover:bg-cream-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/marketplace/${trade.asset_id}`} className="text-sage-600 hover:underline font-mono text-xs">
                        {trade.asset_id.slice(0, 12)}...
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${trade.buyer_id === user?.id ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {trade.buyer_id === user?.id ? 'Buyer' : 'Seller'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{trade.price} cr</td>
                    <td className="px-4 py-3 text-right text-charcoal-400">{trade.platform_fee} cr</td>
                    <td className="px-4 py-3">
                      <span className="badge badge-sage">{trade.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-charcoal-400">{new Date(trade.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-ghost text-sm">Previous</button>
              <span className="text-sm text-charcoal-400">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn-ghost text-sm">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
