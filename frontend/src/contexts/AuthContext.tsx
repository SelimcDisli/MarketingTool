import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import api from '@/lib/api'
import type { User, Workspace } from '@/types'

interface AuthContextType {
  user: User | null
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { email: string; password: string; firstName: string; lastName: string; workspaceName: string }) => Promise<void>
  logout: () => void
  switchWorkspace: (workspace: Workspace) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetchUser()
    } else {
      setIsLoading(false)
    }
  }, [])

  async function fetchUser() {
    try {
      const { data } = await api.get('/auth/me')
      // /auth/me returns flat: { id, email, firstName, lastName, workspaces }
      const userData = data.user || data
      setUser({
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
      } as User)
      const wsList = data.workspaces || userData.workspaces || []
      setWorkspaces(wsList)
      const wsId = localStorage.getItem('workspaceId')
      const ws = wsList.find((w: Workspace) => w.id === wsId) || wsList[0]
      if (ws) {
        setCurrentWorkspace(ws)
        localStorage.setItem('workspaceId', ws.id)
      }
    } catch {
      localStorage.removeItem('token')
      localStorage.removeItem('workspaceId')
    } finally {
      setIsLoading(false)
    }
  }

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    setUser(data.user)
    const wsList = data.workspaces || []
    setWorkspaces(wsList)
    const ws = wsList[0]
    if (ws) {
      setCurrentWorkspace(ws)
      localStorage.setItem('workspaceId', ws.id)
    }
  }

  async function register(regData: { email: string; password: string; firstName: string; lastName: string; workspaceName: string }) {
    const { data } = await api.post('/auth/register', regData)
    localStorage.setItem('token', data.token)
    setUser(data.user)
    // register returns singular `workspace`, not `workspaces` array
    const wsList = data.workspaces || (data.workspace ? [data.workspace] : [])
    setWorkspaces(wsList)
    const ws = wsList[0]
    if (ws) {
      setCurrentWorkspace(ws)
      localStorage.setItem('workspaceId', ws.id)
    }
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('workspaceId')
    setUser(null)
    setWorkspaces([])
    setCurrentWorkspace(null)
  }

  function switchWorkspace(workspace: Workspace) {
    setCurrentWorkspace(workspace)
    localStorage.setItem('workspaceId', workspace.id)
  }

  return (
    <AuthContext.Provider value={{
      user,
      workspaces,
      currentWorkspace,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      switchWorkspace,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
