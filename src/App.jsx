import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DynastyProvider } from './context/DynastyContext'
import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import Login from './pages/Login'
import Home from './pages/Home'
import CreateDynasty from './pages/CreateDynasty'
import DynastyDashboard from './pages/DynastyDashboard'
import Dashboard from './pages/dynasty/Dashboard'
import Roster from './pages/dynasty/Roster'
import Rankings from './pages/dynasty/Rankings'
import Stats from './pages/dynasty/Stats'
import CoachCareer from './pages/dynasty/CoachCareer'
import Players from './pages/dynasty/Players'
import Player from './pages/dynasty/Player'
import AllTimeLineup from './pages/dynasty/AllTimeLineup'
import Recruiting from './pages/dynasty/Recruiting'
import Leaders from './pages/dynasty/Leaders'
import Awards from './pages/dynasty/Awards'
import AllAmericans from './pages/dynasty/AllAmericans'
import AllConference from './pages/dynasty/AllConference'
import DynastyRecords from './pages/dynasty/DynastyRecords'
import Teams from './pages/dynasty/Teams'
import Team from './pages/dynasty/Team'
import TeamYear from './pages/dynasty/TeamYear'
import BowlHistory from './pages/dynasty/BowlHistory'
import ConferenceChampionshipHistory from './pages/dynasty/ConferenceChampionshipHistory'
import ConferenceStandings from './pages/dynasty/ConferenceStandings'
import CFPBracket from './pages/dynasty/CFPBracket'
import Game from './pages/dynasty/Game'
import TeamStats from './pages/dynasty/TeamStats'
import DangerZone from './pages/dynasty/DangerZone'
import AISettings from './pages/dynasty/AISettings'
// View-only wrapper (no auth required)
import ViewDynasty from './pages/ViewDynasty'
// Public pages
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'

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
          <Route path="team/:tid" element={<Team />} />
          <Route path="team/:tid/:year" element={<TeamYear />} />
          <Route path="bowl-history" element={<BowlHistory />} />
          <Route path="conference-championship-history" element={<ConferenceChampionshipHistory />} />
          <Route path="conference-standings" element={<ConferenceStandings />} />
          <Route path="conference-standings/:year" element={<ConferenceStandings />} />
          <Route path="cfp-bracket" element={<CFPBracket />} />
          <Route path="cfp-bracket/:year" element={<CFPBracket />} />
          <Route path="game/:gameId" element={<Game />} />
          <Route path="team-stats/:tid/:year" element={<TeamStats />} />
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
              <Route path="/dynasty/:id" element={
                <ProtectedRoute>
                  <Layout>
                    <DynastyDashboard />
                  </Layout>
                </ProtectedRoute>
              }>
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
                <Route path="team/:tid" element={<Team />} />
                <Route path="team/:tid/:year" element={<TeamYear />} />
                <Route path="bowl-history" element={<BowlHistory />} />
                <Route path="conference-championship-history" element={<ConferenceChampionshipHistory />} />
                <Route path="conference-standings" element={<ConferenceStandings />} />
                <Route path="conference-standings/:year" element={<ConferenceStandings />} />
                <Route path="cfp-bracket" element={<CFPBracket />} />
                <Route path="cfp-bracket/:year" element={<CFPBracket />} />
                <Route path="game/:gameId" element={<Game />} />
                <Route path="team-stats/:tid/:year" element={<TeamStats />} />
                <Route path="admin" element={<DangerZone />} />
              </Route>
            </Routes>
          </DynastyProvider>
        } />
      </Routes>
    </Router>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <Analytics />
    </AuthProvider>
  )
}

export default App
