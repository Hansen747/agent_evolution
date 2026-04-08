import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { UserProfile } from '../types'
import { auth as authApi } from '../api/client'

interface AuthState {
  user: UserProfile | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string, displayName?: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const profile = await authApi.me()
      setUser(profile)
    } catch {
      // Token invalid — clear it
      localStorage.removeItem('token')
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = async (username: string, password: string) => {
    const res = await authApi.login({ username, password })
    localStorage.setItem('token', res.access_token)
    setToken(res.access_token)
    const profile = await authApi.me()
    setUser(profile)
  }

  const register = async (username: string, email: string, password: string, displayName?: string) => {
    const res = await authApi.register({ username, email, password, display_name: displayName })
    localStorage.setItem('token', res.access_token)
    setToken(res.access_token)
    const profile = await authApi.me()
    setUser(profile)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
