import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardShell from './components/DashboardShell'
import ProtectedRoute from './components/ProtectedRoute'

// Public pages
import Home from './pages/public/Home'
import Marketplace from './pages/public/Marketplace'
import AssetDetail from './pages/public/AssetDetail'
import BountyList from './pages/public/BountyList'
import BountyDetail from './pages/public/BountyDetail'
import Experts from './pages/public/Experts'
import ExpertDetail from './pages/public/ExpertDetail'

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
import MyChats from './pages/dashboard/MyChats'
import ChatRoom from './pages/dashboard/ChatRoom'
import AgentChat from './pages/dashboard/AgentChat'

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
        <Route path="/experts" element={<Experts />} />
        <Route path="/experts/:id" element={<ExpertDetail />} />

        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected dashboard routes */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardShell /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="agents" element={<MyAgents />} />
          <Route path="agents/:agentId/chat" element={<AgentChat />} />
          <Route path="assets" element={<MyAssets />} />
          <Route path="assets/new" element={<CreateAsset />} />
          <Route path="bounties" element={<MyBounties />} />
          <Route path="trades" element={<TradeHistory />} />
          <Route path="chats" element={<MyChats />} />
          <Route path="chats/:id" element={<ChatRoom />} />
        </Route>

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
