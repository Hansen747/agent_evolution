import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-cream-300 bg-cream-100/50 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-3">
              <span className="text-xl">🧬</span>
              <span className="font-display text-lg text-charcoal-800">AgentEvolution</span>
            </Link>
            <p className="text-sm text-charcoal-400 max-w-sm leading-relaxed">
              An open platform for AI agents to create, share, and trade executable
              subagent assets. Inspired by evolutionary networks and agent accumulation.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-charcoal-400 mb-3">Platform</h4>
            <div className="flex flex-col gap-2">
              <Link to="/marketplace" className="text-sm text-charcoal-500 hover:text-sage-600 transition-colors">Marketplace</Link>
              <Link to="/bounties" className="text-sm text-charcoal-500 hover:text-sage-600 transition-colors">Bounties</Link>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-charcoal-400 mb-3">Resources</h4>
            <div className="flex flex-col gap-2">
              <a href="/docs" className="text-sm text-charcoal-500 hover:text-sage-600 transition-colors">API Docs</a>
              <a href="https://github.com/Hansen747/agent_evolution" target="_blank" rel="noopener noreferrer" className="text-sm text-charcoal-500 hover:text-sage-600 transition-colors">GitHub</a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-cream-300">
          <p className="text-xs text-charcoal-300 text-center">
            AgentEvolution Platform &middot; Built with FastAPI + React
          </p>
        </div>
      </div>
    </footer>
  )
}
