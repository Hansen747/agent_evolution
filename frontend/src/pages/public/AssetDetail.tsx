import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { assets as assetsApi } from '../../api/client'
import type { AssetFull } from '../../types'
import { PageLoader, StarRating, ErrorMessage } from '../../components/Ui'
import { useAuth } from '../../contexts/AuthContext'

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [asset, setAsset] = useState<AssetFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    assetsApi.get(id)
      .then(setAsset)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleRate = async (rating: number) => {
    if (!id) return
    try {
      const res = await assetsApi.rate(id, rating)
      setActionMsg(res.message)
      const updated = await assetsApi.get(id)
      setAsset(updated)
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Rating failed')
    }
  }

  const handleDownload = async () => {
    if (!id) return
    try {
      await assetsApi.download(id)
      setActionMsg('Asset downloaded successfully')
      const updated = await assetsApi.get(id)
      setAsset(updated)
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Download failed')
    }
  }

  if (loading) return <PageLoader />
  if (error) return <div className="max-w-4xl mx-auto px-4 py-10"><ErrorMessage message={error} /></div>
  if (!asset) return null

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-charcoal-400 mb-6">
        <Link to="/marketplace" className="hover:text-sage-600 transition-colors">Marketplace</Link>
        <span>/</span>
        <span className="text-charcoal-600">{asset.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl text-charcoal-800 mb-1">{asset.name}</h1>
          <div className="flex items-center gap-3 text-sm text-charcoal-400">
            <span className="font-mono">v{asset.version}</span>
            <span>&middot;</span>
            <span>{asset.license_type}</span>
            <span>&middot;</span>
            <span>{new Date(asset.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {asset.price > 0 ? (
            <span className="text-xl font-display text-sage-600">{asset.price} cr</span>
          ) : (
            <span className="badge badge-sage text-sm py-1 px-3">Free</span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          {[
            { label: 'Score', value: asset.composite_score.toFixed(2) },
            { label: 'Quality', value: (asset.quality_score * 100).toFixed(0) + '%' },
            { label: 'Uses', value: String(asset.usage_count) },
            { label: 'Downloads', value: String(asset.download_count) },
            { label: 'Solves', value: String(asset.solve_count) },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-lg font-semibold text-charcoal-700">{s.value}</div>
              <div className="text-xs text-charcoal-400">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Rating */}
      <div className="flex items-center gap-4 mb-6">
        <StarRating rating={asset.avg_rating} />
        <span className="text-sm text-charcoal-400">
          {asset.avg_rating.toFixed(1)} / 5 ({asset.rating_count} rating{asset.rating_count !== 1 ? 's' : ''})
        </span>
      </div>

      {/* Description */}
      <div className="mb-8">
        <h2 className="font-display text-xl text-charcoal-700 mb-3">Description</h2>
        <p className="text-charcoal-500 leading-relaxed whitespace-pre-wrap">
          {asset.description || 'No description provided.'}
        </p>
      </div>

      {/* Tags */}
      {asset.tags.length > 0 && (
        <div className="mb-8">
          <h2 className="font-display text-xl text-charcoal-700 mb-3">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {asset.tags.map((t) => (
              <Link key={t} to={`/marketplace?tag=${t}`} className="badge badge-sage hover:bg-sage-200 transition-colors">
                {t}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* SKILL.md */}
      {asset.skill_md && (
        <div className="mb-8">
          <h2 className="font-display text-xl text-charcoal-700 mb-3">SKILL.md</h2>
          <div className="bg-cream-100 rounded-xl p-5 text-sm text-charcoal-600 font-mono whitespace-pre-wrap border border-cream-300">
            {asset.skill_md}
          </div>
        </div>
      )}

      {/* Code */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-charcoal-700">Source Code</h2>
          <button onClick={() => setShowCode(!showCode)} className="btn-ghost text-sm">
            {showCode ? 'Hide' : 'Show'} code
          </button>
        </div>
        {showCode && (
          <div className="bg-charcoal-800 rounded-xl p-5 text-sm text-cream-200 font-mono whitespace-pre-wrap overflow-x-auto border border-charcoal-700">
            {asset.code}
          </div>
        )}
        <p className="text-xs text-charcoal-300 mt-2">Entry file: {asset.entry_file}</p>
      </div>

      {/* Dependencies / Tools */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        {asset.dependencies.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-charcoal-600 mb-2">Dependencies</h3>
            <div className="flex flex-wrap gap-1.5">
              {asset.dependencies.map((d) => (
                <span key={d} className="badge badge-charcoal">{d}</span>
              ))}
            </div>
          </div>
        )}
        {asset.tools_used.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-charcoal-600 mb-2">Tools Used</h3>
            <div className="flex flex-wrap gap-1.5">
              {asset.tools_used.map((t) => (
                <span key={t} className="badge badge-charcoal">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Evolution info */}
      {(asset.parent_asset_id || asset.supersedes_id || asset.evolution_note) && (
        <div className="card p-5 mb-8 bg-sage-50/50 border-sage-200">
          <h3 className="font-display text-lg text-sage-700 mb-2">Evolution</h3>
          {asset.evolution_note && <p className="text-sm text-charcoal-500 mb-2">{asset.evolution_note}</p>}
          {asset.parent_asset_id && (
            <p className="text-xs text-charcoal-400">
              Derived from: <Link to={`/marketplace/${asset.parent_asset_id}`} className="text-sage-600 underline">{asset.parent_asset_id}</Link>
            </p>
          )}
          {asset.supersedes_id && (
            <p className="text-xs text-charcoal-400">
              Supersedes: <Link to={`/marketplace/${asset.supersedes_id}`} className="text-sage-600 underline">{asset.supersedes_id}</Link>
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {user && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-4">
            {asset.price === 0 && (
              <button onClick={handleDownload} className="btn-primary">
                Download (Free)
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-charcoal-500">Rate:</span>
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} onClick={() => handleRate(r)} className="btn-ghost px-2 py-1 text-sm">
                  {r}
                </button>
              ))}
            </div>
          </div>
          {actionMsg && <p className="text-sm text-sage-600 mt-3">{actionMsg}</p>}
        </div>
      )}
    </div>
  )
}
