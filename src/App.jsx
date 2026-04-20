import { Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DynastyProvider } from './context/DynastyContext'
import Layout from './components/Layout'
import { ToastProvider, ConfirmProvider } from './components/ui'
import ScrollToTop from './components/ScrollToTop'

// Eager: entry points, auth, and page wrappers (small + always-on-first-paint)
import Login from './pages/Login'
import Home from './pages/Home'
import CreateDynasty from './pages/CreateDynasty'
import DynastyDashboard from './pages/DynastyDashboard'
import Account from './pages/Account'
import ViewDynasty from './pages/ViewDynasty'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'

// Lazy pages with `.preload()` capability — see routes/lazyPages.js
import {
  Dashboard, Roster, Rankings, Stats, CoachCareer, Players, Player, PlayerEdit,
  PlayersByState, AllTimeLineup, Recruiting, Leaders, Awards, AllAmericans,
  AllConference, DynastyRecords, Teams, TeamYear, BowlHistory,
  ConferenceChampionshipHistory, ConferenceStandings, CFPBracket, Game,
  GameEdit, DangerZone, AISettings,
} from './routes/lazyPages'

// Suspense fallback. Prefetching warms most chunks before click so this
// rarely renders; when it does, a spinner only appears after 150ms to
// avoid a flash on fast/cached loads.
function RouteFallback() {
  return (
    <div
      className="flex items-center justify-center py-16"
      style={{ animation: 'suspense-delay 0.001s linear 150ms forwards', opacity: 0 }}
    >
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{
          borderColor: 'var(--surface-4)',
          borderTopColor: 'var(--team-primary, #ea580c)',
        }}
        aria-label="Loading page"
      />
    </div>
  )
}

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { user } = useAuth()
  const isDev = import.meta.env.VITE_DEV_MODE === 'true'

  // In dev mode, skip authentication
  if (isDev) {
    return children
  }

  return user ? children : <Navigate to="/login" />
}

function AppRoutes() {
  return (
    <Router>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public policy pages - no auth required */}
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />

          {/* Public view routes - no auth required, reuses same components */}
          <Route path="/view/:shareCode" element={<ViewDynasty />}>
            <Route index element={<Dashboard />} />
            <Route path="player/:pid" element={<Player />} />
            <Route path="roster" element={<Roster />} />
            <Route path="rankings" element={<Rankings />} />
            <Route path="rankings/:year" element={<Rankings />} />
            <Route path="stats" element={<Stats />} />
            <Route path="coach-career" element={<CoachCareer />} />
            <Route path="players" element={<Players />} />
            <Route path="all-time-lineup" element={<AllTimeLineup />} />
            <Route path="recruiting" element={<Recruiting />} />
            <Route path="recruiting/:tid/:year" element={<Recruiting />} />
            <Route path="recruiting/portal/:tid/:year" element={<Recruiting />} />
            <Route path="leaders" element={<Leaders />} />
            <Route path="awards" element={<Awards />} />
            <Route path="awards/:year" element={<Awards />} />
            <Route path="all-americans" element={<AllAmericans />} />
            <Route path="all-americans/:year" element={<AllAmericans />} />
            <Route path="all-conference" element={<AllConference />} />
            <Route path="all-conference/:year" element={<AllConference />} />
            <Route path="all-conference/:year/:conference" element={<AllConference />} />
            <Route path="dynasty-records" element={<DynastyRecords />} />
            <Route path="teams" element={<Teams />} />
            <Route path="team/:tid/:year" element={<TeamYear />} />
            <Route path="bowl-history" element={<BowlHistory />} />
            <Route path="conference-championship-history" element={<ConferenceChampionshipHistory />} />
            <Route path="conference-standings" element={<ConferenceStandings />} />
            <Route path="conference-standings/:year" element={<ConferenceStandings />} />
            <Route path="cfp-bracket" element={<CFPBracket />} />
            <Route path="cfp-bracket/:year" element={<CFPBracket />} />
            <Route path="game/:gameId" element={<Game />} />
            <Route path="admin" element={<DangerZone />} />
          </Route>

          {/* All other routes wrapped in DynastyProvider */}
          <Route path="/*" element={
            <DynastyProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={
                  <ProtectedRoute>
                    <Layout>
                      <Home />
                    </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/create" element={
                  <ProtectedRoute>
                    <Layout>
                      <CreateDynasty />
                    </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/ai-settings" element={
                  <ProtectedRoute>
                    <Layout>
                      <AISettings />
                    </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/account" element={
                  <ProtectedRoute>
                    <Layout>
                      <Account />
                    </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/dynasty/:id" element={
                  <ProtectedRoute>
                    <Layout>
                      <DynastyDashboard />
                    </Layout>
                  </ProtectedRoute>
                }>
                  <Route index element={<Dashboard />} />
                  <Route path="player/:pid" element={<Player />} />
                  <Route path="player/:pid/edit" element={<PlayerEdit />} />
                  <Route path="roster" element={<Roster />} />
                  <Route path="rankings" element={<Rankings />} />
                  <Route path="rankings/:year" element={<Rankings />} />
                  <Route path="stats" element={<Stats />} />
                  <Route path="coach-career" element={<CoachCareer />} />
                  <Route path="players" element={<Players />} />
                  <Route path="players/state/:state" element={<PlayersByState />} />
                  <Route path="all-time-lineup" element={<AllTimeLineup />} />
                  <Route path="recruiting" element={<Recruiting />} />
                  <Route path="recruiting/:tid/:year" element={<Recruiting />} />
                  <Route path="recruiting/portal/:tid/:year" element={<Recruiting />} />
                  <Route path="leaders" element={<Leaders />} />
                  <Route path="awards" element={<Awards />} />
                  <Route path="awards/:year" element={<Awards />} />
                  <Route path="all-americans" element={<AllAmericans />} />
                  <Route path="all-americans/:year" element={<AllAmericans />} />
                  <Route path="all-conference" element={<AllConference />} />
                  <Route path="all-conference/:year" element={<AllConference />} />
                  <Route path="all-conference/:year/:conference" element={<AllConference />} />
                  <Route path="dynasty-records" element={<DynastyRecords />} />
                  <Route path="teams" element={<Teams />} />
                  <Route path="team/:tid/:year" element={<TeamYear />} />
                  <Route path="bowl-history" element={<BowlHistory />} />
                  <Route path="conference-championship-history" element={<ConferenceChampionshipHistory />} />
                  <Route path="conference-standings" element={<ConferenceStandings />} />
                  <Route path="conference-standings/:year" element={<ConferenceStandings />} />
                  <Route path="cfp-bracket" element={<CFPBracket />} />
                  <Route path="cfp-bracket/:year" element={<CFPBracket />} />
                  <Route path="game/new" element={<GameEdit />} />
                  <Route path="game/:gameId" element={<Game />} />
                  <Route path="game/:gameId/edit" element={<GameEdit />} />
                  <Route path="admin" element={<DangerZone />} />
                </Route>
              </Routes>
            </DynastyProvider>
          } />
        </Routes>
      </Suspense>
    </Router>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AppRoutes />
        </ConfirmProvider>
      </ToastProvider>
      <Analytics />
    </AuthProvider>
  )
}

export default App
