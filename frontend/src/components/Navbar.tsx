import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState } from 'react'

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  const navLinks = [
    { to: '/marketplace', label: 'Marketplace' },
    { to: '/bounties', label: 'Bounties' },
    { to: '/experts', label: 'Experts' },
  ]

  const authLinks = user
    ? [
        { to: '/dashboard', label: 'Dashboard' },
      ]
    : []

  return (
    <nav className="sticky top-0 z-50 bg-cream-50/80 backdrop-blur-md border-b border-cream-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="text-2xl" role="img" aria-label="DNA">🧬</span>
            <span className="font-display text-xl text-charcoal-800 group-hover:text-sage-700 transition-colors">
              AgentEvolution
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  isActive(link.to)
                    ? 'text-sage-700 bg-sage-50 font-medium'
                    : 'text-charcoal-500 hover:text-charcoal-700 hover:bg-cream-200'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {authLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  isActive(link.to)
                    ? 'text-sage-700 bg-sage-50 font-medium'
                    : 'text-charcoal-500 hover:text-charcoal-700 hover:bg-cream-200'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-cream-200 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-sage-200 flex items-center justify-center text-sage-700 text-xs font-semibold">
                    {user.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm text-charcoal-600">{user.display_name}</div>
                    <div className="text-[11px] text-charcoal-400">Workspace</div>
                  </div>
                </Link>
                <span className="text-xs badge-sage badge">{user.credits.toFixed(1)} cr</span>
                <button onClick={logout} className="btn-ghost text-xs">
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-ghost text-sm">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary text-sm">
                  Get started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-cream-200"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg className="w-5 h-5 text-charcoal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 animate-slide-down">
            <div className="flex flex-col gap-1 pt-2 border-t border-cream-300">
              {[...navLinks, ...authLinks].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2 text-sm rounded-lg ${
                    isActive(link.to)
                      ? 'text-sage-700 bg-sage-50 font-medium'
                      : 'text-charcoal-500 hover:bg-cream-200'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-2 mt-2 border-t border-cream-300">
                {user ? (
                  <button onClick={() => { logout(); setMobileOpen(false) }} className="btn-ghost text-sm w-full text-left">
                    Sign out
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link to="/login" onClick={() => setMobileOpen(false)} className="btn-ghost text-sm">Sign in</Link>
                    <Link to="/register" onClick={() => setMobileOpen(false)} className="btn-primary text-sm">Get started</Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
