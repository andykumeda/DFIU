import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import DashboardPage from './pages/DashboardPage'
import SettingsPage from './features/settings/SettingsPage'
import RaceDetailPage from './pages/RaceDetailPage'
import NewRacePage from './pages/NewRacePage'
import SplashPage from './pages/SplashPage'
import StravaCallback from './features/auth/StravaCallback'
import { ScrollToTop } from './components/ui/ScrollToTop'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className='min-h-screen bg-neutral-950 text-white flex items-center justify-center'>
        <div className='text-xl font-bold'>Checking Session...</div>
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
        <BrowserRouter>
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
              path='/settings'
              element={
                <ProtectedRoute>
                  <SettingsPage />
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
            <Route path='/race/:id' element={<RaceDetailPage />} />
            <Route path='/auth/strava/callback' element={<StravaCallback />} />
            <Route path='/' element={<SplashPage />} />
          </Routes>
          <ScrollToTop />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
