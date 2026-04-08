import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from './Ui'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />

  return <>{children}</>
}
