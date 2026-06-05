import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Exams from './pages/Exams'
import Interviews from './pages/Interviews'
import Tasks from './pages/Tasks'
import Timeline from './pages/Timeline'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'

export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-surface overflow-x-hidden">
      <Navbar />
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Loading state
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ink-muted">Loading Jadwali…</p>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ session }}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/auth"
            element={session ? <Navigate to="/dashboard" replace /> : <Auth />}
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute session={session}>
                <AppLayout><Dashboard /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams"
            element={
              <ProtectedRoute session={session}>
                <AppLayout><Exams /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/interviews"
            element={
              <ProtectedRoute session={session}>
                <AppLayout><Interviews /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute session={session}>
                <AppLayout><Tasks /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/timeline"
            element={
              <ProtectedRoute session={session}>
                <AppLayout><Timeline /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={session ? '/dashboard' : '/auth'} replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
