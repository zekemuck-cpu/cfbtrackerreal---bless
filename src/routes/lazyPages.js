import { lazy } from 'react'

// Retry a dynamic import a couple of times before giving up. React.lazy
// memoizes the FIRST settled promise forever — a single transient network
// blip (wifi flicker, backgrounded PWA waking up) used to permanently
// poison that page for the rest of the session: every visit re-threw the
// cached rejection and the page rendered blank ("the Coach Career page
// just randomly disappears"). Retrying inside the factory means the
// memoized promise only rejects after several genuine failures, and the
// RouteErrorBoundary + stale-chunk reload handle that terminal case.
function retryImport(factory, retries = 2, delayMs = 750) {
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      factory().then(resolve).catch((err) => {
        if (remaining <= 0) {
          reject(err)
          return
        }
        setTimeout(() => attempt(remaining - 1), delayMs)
      })
    }
    attempt(retries)
  })
}

// Wraps React.lazy with a `.preload()` method so we can warm chunks on hover
// or during idle time. Vite dedupes concurrent dynamic imports, so calling
// preload() multiple times is cheap. Preload failures are swallowed — they
// are an optimization, and the click-time lazy factory retries anyway; a
// hover-time rejection must never surface as an unhandled error.
function lazyWithPreload(factory) {
  const Comp = lazy(() => retryImport(factory))
  Comp.preload = () => factory().catch(() => {})
  return Comp
}

export const Dashboard = lazyWithPreload(() => import('../pages/dynasty/Dashboard'))
export const Roster = lazyWithPreload(() => import('../pages/dynasty/Roster'))
export const Rankings = lazyWithPreload(() => import('../pages/dynasty/Rankings'))
export const Stats = lazyWithPreload(() => import('../pages/dynasty/Stats'))
export const CoachCareer = lazyWithPreload(() => import('../pages/dynasty/CoachCareer'))
export const CoachBuild = lazyWithPreload(() => import('../pages/dynasty/CoachBuild'))
export const Coaches = lazyWithPreload(() => import('../pages/dynasty/Coaches'))
export const Players = lazyWithPreload(() => import('../pages/dynasty/Players'))
export const ComparePlayers = lazyWithPreload(() => import('../pages/dynasty/ComparePlayers'))
export const Player = lazyWithPreload(() => import('../pages/dynasty/Player'))
export const PlayerEdit = lazyWithPreload(() => import('../pages/dynasty/PlayerEdit'))
export const PlayersByState = lazyWithPreload(() => import('../pages/dynasty/PlayersByState'))
export const AllTimeLineup = lazyWithPreload(() => import('../pages/dynasty/AllTimeLineup'))
export const Recruiting = lazyWithPreload(() => import('../pages/dynasty/Recruiting'))
export const Leaders = lazyWithPreload(() => import('../pages/dynasty/Leaders'))
export const Awards = lazyWithPreload(() => import('../pages/dynasty/Awards'))
export const AllAmericans = lazyWithPreload(() => import('../pages/dynasty/AllAmericans'))
export const AllConference = lazyWithPreload(() => import('../pages/dynasty/AllConference'))
export const DynastyRecords = lazyWithPreload(() => import('../pages/dynasty/DynastyRecords'))
export const Records = lazyWithPreload(() => import('../pages/dynasty/Records'))
export const SeasonStats = lazyWithPreload(() => import('../pages/dynasty/SeasonStats'))
export const TeamStats = lazyWithPreload(() => import('../pages/dynasty/TeamStats'))
export const Teams = lazyWithPreload(() => import('../pages/dynasty/Teams'))
export const TeamYear = lazyWithPreload(() => import('../pages/dynasty/TeamYear'))
export const BowlHistory = lazyWithPreload(() => import('../pages/dynasty/BowlHistory'))
export const ConferenceChampionshipHistory = lazyWithPreload(() => import('../pages/dynasty/ConferenceChampionshipHistory'))
export const ConferenceStandings = lazyWithPreload(() => import('../pages/dynasty/ConferenceStandings'))
export const CFPBracket = lazyWithPreload(() => import('../pages/dynasty/CFPBracket'))
export const WeeklyScores = lazyWithPreload(() => import('../pages/dynasty/WeeklyScores'))
export const CardCollection = lazyWithPreload(() => import('../pages/dynasty/CardCollection'))
// Renamed from ManageRivalries.jsx to RivalriesPage.jsx (Aug 2026) — the
// old filename was stuck on a deployment serving pre-rewrite code no
// matter how many times it was redeployed, while every other file in the
// same and later commits updated normally. Confirmed by directly
// inspecting the live production JS bundle: it still contained the old
// standalone rivalry-CRUD component, byte for byte, across three separate
// redeploys spanning several hours. A pure rename gives the module an
// identity nothing could have a stale build/cache entry for yet.
export const ManageRivalries = lazyWithPreload(() => import('../pages/dynasty/RivalriesPage'))
export const Game = lazyWithPreload(() => import('../pages/dynasty/Game'))
export const GameEdit = lazyWithPreload(() => import('../pages/dynasty/GameEdit'))
export const SocialCharacter = lazyWithPreload(() => import('../pages/dynasty/SocialCharacter'))
export const LeaguePreferences = lazyWithPreload(() => import('../pages/dynasty/LeaguePreferences'))
export const DangerZone = lazyWithPreload(() => import('../pages/dynasty/DangerZone'))
export const LeagueSettings = lazyWithPreload(() => import('../pages/dynasty/LeagueSettings'))
export const PromptStudio = lazyWithPreload(() => import('../pages/dynasty/PromptStudio'))
export const DynastyBlueprint = lazyWithPreload(() => import('../pages/dynasty/DynastyBlueprint'))
export const CoachProfile = lazyWithPreload(() => import('../pages/dynasty/CoachProfile'))
export const CoachEdit = lazyWithPreload(() => import('../pages/dynasty/CoachEdit'))
export const DevTools = lazyWithPreload(() => import('../pages/dynasty/DevTools'))
export const ImageGallery = lazyWithPreload(() => import('../pages/admin/ImageGallery'))
export const ScoutStaff = lazyWithPreload(() => import('../components/ScoutStaff'))
export const SchemeBuilder = lazyWithPreload(() => import('../pages/dynasty/SchemeBuilder'))
export const TopClasses = lazyWithPreload(() => import('../pages/dynasty/TopClasses'))
export const PlayersOfWeek = lazyWithPreload(() => import('../pages/dynasty/PlayersOfWeek'))
export const HeismanWatch = lazyWithPreload(() => import('../pages/dynasty/HeismanWatch'))
export const InjuryReport = lazyWithPreload(() => import('../pages/dynasty/InjuryReport'))
export const WeeklyScouting = lazyWithPreload(() => import('../pages/dynasty/WeeklyScouting'))
export const WeeklyInstall = lazyWithPreload(() => import('../pages/dynasty/WeeklyInstall'))
export const PlayersLeaving = lazyWithPreload(() => import('../pages/dynasty/PlayersLeaving'))
export const TrainingResults = lazyWithPreload(() => import('../pages/dynasty/TrainingResults'))

// Preload map: sidebar nav name → chunk preload fn.
// Called on mouseenter/focus of nav links so chunks warm up before click.
export const preloadByNavName = {
  'Dashboard': Dashboard.preload,
  'Coach Career': CoachCareer.preload,
  'Leaderboard': DynastyRecords.preload,
  'Records': Records.preload,
  'Season Stats': SeasonStats.preload,
  'Team Stats': TeamStats.preload,
  'Recruiting': Recruiting.preload,
  'Scout Staff': ScoutStaff.preload,
  'Awards': Awards.preload,
  'All-Americans': AllAmericans.preload,
  'All-Conference': AllConference.preload,
  'All-Time Team': AllTimeLineup.preload,
  'CFP Bracket': CFPBracket.preload,
  'Bowl History': BowlHistory.preload,
  'CC History': ConferenceChampionshipHistory.preload,
  'Conf. Standings': ConferenceStandings.preload,
  'Top 25': Rankings.preload,
  'Around the Country': WeeklyScores.preload,
  'All Teams': Teams.preload,
  'All Players': Players.preload,
  'Compare Players': ComparePlayers.preload,
  'Danger Zone': DangerZone.preload,
  'AI Prompts': PromptStudio.preload,
  'Dynasty Blueprint': TeamYear.preload,
  'Scheme Builder': SchemeBuilder.preload,
  'Top Classes': TopClasses.preload,
  'Players of the Week': PlayersOfWeek.preload,
  'Heisman Watch': HeismanWatch.preload,
  'Injury Report': InjuryReport.preload,
}

// Warm the most commonly-visited pages during browser idle time.
// Dashboard is the landing page; Teams/Players are high-traffic nav.
export function preloadCommonDynastyPages() {
  const warm = () => {
    Dashboard.preload()
    Teams.preload()
    Players.preload()
    TeamYear.preload()
    Player.preload()
  }
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 2000 })
  } else {
    setTimeout(warm, 500)
  }
}
