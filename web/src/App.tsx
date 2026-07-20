import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Saved from './pages/Saved'
import Winnings from './pages/Winnings'
import Friends from './pages/Friends'
import LiveGame from './pages/LiveGame'
import Games from './pages/Games'
import Layout from './components/Layout'
import './App.css'

function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--neu-text-muted)' }}>Loading…</div>
  if (!isAuthenticated) return <Navigate to="/" replace />
  return <Layout />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/winnings" element={<Winnings />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/live-game" element={<LiveGame />} />
        <Route path="/games" element={<Games />} />
        <Route path="/games/join" element={<Games />} />
        <Route path="/games/:gameId" element={<Games />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
