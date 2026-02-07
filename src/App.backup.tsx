import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import DashboardPage from './pages/DashboardPage'
import RaceDetailPage from './pages/RaceDetailPage'
import NewRacePage from './pages/NewRacePage'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className='min-h-screen bg-neutral-950 text-white flex items-center justify-center'>
        <div className='animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white'></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to='/login' replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter><div className="bg-blue-500 text-white p-4 text-center text-xl font-bold border-4 border-yellow-500" style={{ zIndex: 9999, position: "relative" }}>ROUTER MOUNTED</div>
          <Routes>
            <Route path='/login' element={<LoginPage />} />
            <Route path='/signup' element={<SignupPage />} />
            <Route
              path='/dashboard'
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/race/new'
              element={
                <ProtectedRoute>
                  <NewRacePage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/race/:id'
              element={
                <ProtectedRoute>
                  <RaceDetailPage />
                </ProtectedRoute>
              }
            />
            <Route path='/' element={<Navigate to='/dashboard' replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
