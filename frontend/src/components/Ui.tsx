export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
  return (
    <svg className={`${s} animate-spin text-sage-500`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <Spinner size="lg" />
    </div>
  )
}

export function EmptyState({ title, description, action }: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="text-center py-16 px-4">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cream-200 flex items-center justify-center">
        <svg className="w-8 h-8 text-charcoal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <h3 className="text-charcoal-600 font-medium mb-1">{title}</h3>
      {description && <p className="text-sm text-charcoal-400 mb-4 max-w-sm mx-auto">{description}</p>}
      {action}
    </div>
  )
}

export function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating.toFixed(1)} / ${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < Math.round(rating)
        return (
          <svg key={i} className={`w-3.5 h-3.5 ${filled ? 'text-amber-400' : 'text-cream-300'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )
      })}
    </span>
  )
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
      <p className="text-sm text-red-700 mb-2">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm text-red-600 underline hover:text-red-800">
          Try again
        </button>
      )}
    </div>
  )
}
