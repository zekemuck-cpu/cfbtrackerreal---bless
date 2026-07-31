import { lazy } from 'react'

// Wraps React.lazy with a `.preload()` method so we can warm chunks on hover
// or during idle time. Vite dedupes concurrent dynamic imports, so calling
// preload() multiple times is cheap.
function lazyWithPreload(factory) {
  const Comp = lazy(factory)
  Comp.preload = factory
  return Comp
}

export const Dashboard = lazyWithPreload(() => import('../pages/dynasty/Dashboard'))
export const Roster = lazyWithPreload(() => import('../pages/dynasty/Roster'))
export const Rankings = lazyWithPreload(() => import('../pages/dynasty/Rankings'))
export const Stats = lazyWithPreload(() => import('../pages/dynasty/Stats'))
export const CoachCareer = lazyWithPreload(() => import('../pages/dynasty/CoachCareer'))
export const Coaches = lazyWithPreload(() => import('../pages/dynasty/Coaches'))
export const Players = lazyWithPreload(() => import('../pages/dynasty/Players'))
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
export const CoachBuild = lazyWithPreload(() => import('../pages/dynasty/CoachBuild'))
export const SchemeBuilder = lazyWithPreload(() => import('../pages/dynasty/SchemeBuilder'))
export const TopClasses = lazyWithPreload(() => import('../pages/dynasty/TopClasses'))
export const PlayersOfWeek = lazyWithPreload(() => import('../pages/dynasty/PlayersOfWeek'))
export const HeismanWatch = lazyWithPreload(() => import('../pages/dynasty/HeismanWatch'))
export const InjuryReport = lazyWithPreload(() => import('../pages/dynasty/InjuryReport'))
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
