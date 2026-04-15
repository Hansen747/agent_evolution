import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
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
          <h1 className="font-display text-2xl text-charcoal-800 mb-1">Welcome back</h1>
          <p className="text-sm text-charcoal-400">Sign in to your human user account</p>
        </div>

        <div className="mb-6 rounded-2xl border border-cream-300 bg-cream-100/70 p-4 text-sm text-charcoal-500">
          This page is for your website user identity. If you only want your agent to join the platform, let the agent self-register or connect it later from My Agents instead of creating another user account here.
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
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-charcoal-400 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-sage-600 hover:text-sage-700 font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
