import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { assets as assetsApi } from '../../api/client'
import type { EvoPackBrief } from '../../types'
import { PageLoader, EmptyState, ErrorMessage, StarRating } from '../../components/Ui'

export default function MyAssets() {
  const [createdAssets, setCreatedAssets] = useState<EvoPackBrief[]>([])
  const [ownedAssets, setOwnedAssets] = useState<EvoPackBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const fetchAssets = async () => {
    setLoading(true)
    try {
      const [created, owned] = await Promise.all([
        assetsApi.myPublished(),
        assetsApi.myOwned(),
      ])
      setCreatedAssets(created)
      setOwnedAssets(owned)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAssets() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this EvoPack?')) return
    try {
      await assetsApi.delete(id)
      setMsg('EvoPack deleted')
      fetchAssets()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl text-charcoal-800 mb-1">My EvoPacks</h1>
          <p className="text-charcoal-400">EvoPacks you created yourself and EvoPacks you now own through the platform.</p>
        </div>
        <Link to="/dashboard/assets/new" className="btn-primary text-sm shrink-0">
          Publish New EvoPack
        </Link>
      </div>

      {msg && <p className="text-sm text-sage-600 mb-4">{msg}</p>}

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchAssets} />
      ) : createdAssets.length === 0 && ownedAssets.length === 0 ? (
        <EmptyState
          title="No EvoPacks yet"
          description="Publish an EvoPack or acquire one from the marketplace or an accepted bounty solution."
          action={<Link to="/dashboard/assets/new" className="btn-primary text-sm">Publish your first EvoPack</Link>}
        />
      ) : (
        <div className="space-y-10">
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-2xl text-charcoal-800">Created By You</h2>
                <p className="text-sm text-charcoal-400">EvoPacks you published to the platform.</p>
              </div>
              <span className="badge badge-sage">{createdAssets.length}</span>
            </div>
            {createdAssets.length === 0 ? (
              <div className="card p-6 bg-cream-100/60">
                <EmptyState title="No created EvoPacks" description="Publish an EvoPack to start your own library." />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {createdAssets.map((asset) => (
                  <div key={asset.id} className="card p-5 flex flex-col">
                    <div className="flex items-start justify-between mb-2">
                      <Link to={`/marketplace/${asset.id}`} className="font-display text-lg text-charcoal-700 hover:text-sage-600 transition-colors">
                        {asset.name}
                      </Link>
                      <span className="text-xs font-mono text-charcoal-300">v{asset.version}</span>
                    </div>
                    <p className="text-sm text-charcoal-400 line-clamp-2 mb-3 flex-1">{asset.description || 'No description'}</p>
                    {asset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {asset.tags.slice(0, 3).map((t) => (
                          <span key={t} className="badge badge-sage">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t border-cream-200">
                      <div className="flex items-center gap-2">
                        <StarRating rating={asset.avg_rating} />
                        <span className="text-xs text-charcoal-400">{asset.usage_count} uses</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-sage-600">
                          {asset.price > 0 ? `${asset.price} cr` : 'Free'}
                        </span>
                        <button onClick={() => handleDelete(asset.id)} className="btn-ghost text-xs text-red-500 hover:text-red-700 px-2">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-2xl text-charcoal-800">Owned By You</h2>
                <p className="text-sm text-charcoal-400">EvoPacks you acquired from the marketplace or accepted bounty solutions.</p>
              </div>
              <span className="badge badge-charcoal">{ownedAssets.length}</span>
            </div>
            {ownedAssets.length === 0 ? (
              <div className="card p-6 bg-cream-100/60">
                <EmptyState title="No owned EvoPacks" description="Buy, download, or accept a solution EvoPack to add it here." />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {ownedAssets.map((asset) => (
                  <div key={asset.id} className="card p-5 flex flex-col">
                    <div className="flex items-start justify-between mb-2">
                      <Link to={`/marketplace/${asset.id}`} className="font-display text-lg text-charcoal-700 hover:text-sage-600 transition-colors">
                        {asset.name}
                      </Link>
                      <span className="text-xs font-mono text-charcoal-300">v{asset.version}</span>
                    </div>
                    <p className="text-sm text-charcoal-400 line-clamp-2 mb-3 flex-1">{asset.description || 'No description'}</p>
                    {asset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {asset.tags.slice(0, 3).map((t) => (
                          <span key={t} className="badge badge-charcoal">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t border-cream-200">
                      <div className="flex items-center gap-2">
                        <StarRating rating={asset.avg_rating} />
                        <span className="text-xs text-charcoal-400">Owned</span>
                      </div>
                      <span className="text-sm font-medium text-sage-600">
                        {asset.price > 0 ? `${asset.price} cr` : 'Free'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
