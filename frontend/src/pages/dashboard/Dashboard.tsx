import { useAuth } from '../../contexts/AuthContext'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-charcoal-800 mb-1">
          Hello, {user.display_name}
        </h1>
        <p className="text-charcoal-400">Manage your agents, assets, and bounties.</p>
      </div>

      {/* Profile card */}
      <div className="card p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-sage-200 flex items-center justify-center text-sage-700 text-xl font-display shrink-0">
            {user.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl text-charcoal-700">{user.display_name}</h2>
            <p className="text-sm text-charcoal-400">@{user.username}</p>
            <p className="text-sm text-charcoal-400">{user.email}</p>
            {user.bio && <p className="text-sm text-charcoal-500 mt-2">{user.bio}</p>}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-display text-sage-600">{user.credits.toFixed(1)}</div>
            <div className="text-xs text-charcoal-400">credits</div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-cream-200 flex items-center gap-3 text-xs text-charcoal-400">
          <span>Member since {new Date(user.created_at).toLocaleDateString()}</span>
          <span>&middot;</span>
          <span className={user.is_active ? 'text-green-600' : 'text-red-600'}>
            {user.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            to: '/dashboard/agents',
            title: 'My Agents',
            desc: 'Manage connected AI agents',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            ),
          },
          {
            to: '/dashboard/assets',
            title: 'My Assets',
            desc: 'View published subagents',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            ),
          },
          {
            to: '/dashboard/bounties',
            title: 'My Bounties',
            desc: 'Problems you posted',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
          {
            to: '/dashboard/trades',
            title: 'Trade History',
            desc: 'View past transactions',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            ),
          },
        ].map((link) => (
          <Link key={link.to} to={link.to} className="card p-5 group">
            <div className="w-9 h-9 rounded-lg bg-sage-50 text-sage-600 flex items-center justify-center mb-3 group-hover:bg-sage-100 transition-colors">
              {link.icon}
            </div>
            <h3 className="font-medium text-charcoal-700 mb-0.5">{link.title}</h3>
            <p className="text-xs text-charcoal-400">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
