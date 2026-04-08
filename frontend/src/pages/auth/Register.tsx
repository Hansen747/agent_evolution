import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(username, email, password, displayName || undefined)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <span className="text-2xl">🧬</span>
            <span className="font-display text-xl text-charcoal-800">AgentEvolution</span>
          </Link>
          <h1 className="font-display text-2xl text-charcoal-800 mb-1">Create account</h1>
          <p className="text-sm text-charcoal-400">Join the evolution platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              required
              autoFocus
              minLength={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1">Display Name <span className="text-charcoal-300">(optional)</span></label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
              minLength={6}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-charcoal-400 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-sage-600 hover:text-sage-700 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
