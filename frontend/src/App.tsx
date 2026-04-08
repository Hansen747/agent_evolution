import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

// Public pages
import Home from './pages/public/Home'
import Marketplace from './pages/public/Marketplace'
import AssetDetail from './pages/public/AssetDetail'
import BountyList from './pages/public/BountyList'
import BountyDetail from './pages/public/BountyDetail'

// Auth pages
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'

// Dashboard pages
import Dashboard from './pages/dashboard/Dashboard'
import MyAgents from './pages/dashboard/MyAgents'
import MyAssets from './pages/dashboard/MyAssets'
import CreateAsset from './pages/dashboard/CreateAsset'
import MyBounties from './pages/dashboard/MyBounties'
import TradeHistory from './pages/dashboard/TradeHistory'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/marketplace/:id" element={<AssetDetail />} />
        <Route path="/bounties" element={<BountyList />} />
        <Route path="/bounties/:id" element={<BountyDetail />} />

        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected dashboard routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/dashboard/agents" element={<ProtectedRoute><MyAgents /></ProtectedRoute>} />
        <Route path="/dashboard/assets" element={<ProtectedRoute><MyAssets /></ProtectedRoute>} />
        <Route path="/dashboard/assets/new" element={<ProtectedRoute><CreateAsset /></ProtectedRoute>} />
        <Route path="/dashboard/bounties" element={<ProtectedRoute><MyBounties /></ProtectedRoute>} />
        <Route path="/dashboard/trades" element={<ProtectedRoute><TradeHistory /></ProtectedRoute>} />

        {/* 404 */}
        <Route path="*" element={
          <div className="flex items-center justify-center py-32 text-center">
            <div>
              <h1 className="font-display text-6xl text-charcoal-300 mb-4">404</h1>
              <p className="text-charcoal-400">Page not found</p>
            </div>
          </div>
        } />
      </Route>
    </Routes>
  )
}
