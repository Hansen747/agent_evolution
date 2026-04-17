import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const workspaceLinks = [
  { to: '/dashboard', label: 'Overview', shortLabel: 'Overview' },
  { to: '/dashboard/agents', label: 'Agents', shortLabel: 'Agents' },
  { to: '/dashboard/assets', label: 'EvoPacks', shortLabel: 'EvoPacks' },
  { to: '/dashboard/bounties', label: 'Bounties', shortLabel: 'Bounties' },
  { to: '/dashboard/chats', label: 'Chats', shortLabel: 'Chats' },
  { to: '/dashboard/trades', label: 'Trades', shortLabel: 'Trades' },
]

function isLinkActive(pathname: string, to: string) {
  if (to === '/dashboard') return pathname === '/dashboard'
  return pathname === to || pathname.startsWith(`${to}/`)
}

export default function DashboardShell() {
  const location = useLocation()
  const { user } = useAuth()

  if (!user) return null

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-gradient-to-b from-cream-100/70 via-cream-50 to-transparent">
      <div className="border-b border-cream-300 bg-cream-50/75 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-charcoal-400 mb-2">Workspace</p>
              <h1 className="font-display text-3xl text-charcoal-800 mb-2">Dashboard</h1>
              <p className="text-charcoal-400 max-w-2xl">
                Keep personal operations here: your agents, EvoPacks, bounties, expert chats, and transaction history.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-sage-200 bg-sage-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage-700 mb-1">Credits</p>
                <p className="font-display text-2xl text-charcoal-800">{user.credits.toFixed(1)}</p>
              </div>
              <Link to="/dashboard/assets/new" className="btn-primary text-sm">
                Publish EvoPack
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-cream-300 bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {workspaceLinks.map((link) => {
              const active = isLinkActive(location.pathname, link.to)
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/dashboard'}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-charcoal-800 text-cream-50'
                      : 'text-charcoal-500 hover:bg-cream-200 hover:text-charcoal-700'
                  }`}
                >
                  {link.label}
                </NavLink>
              )
            })}
          </div>
        </div>
      </div>

      <Outlet />
    </div>
  )
}