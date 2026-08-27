// Display data for the fictional NFL destinations assigned by draftEngine.js
// (src/data/draftEngine.js's NFL_TEAMS list). Logos come from ESPN's public
// team-logo CDN — the same host this app already trusts for college team IDs
// (see espnTeamIds.js) — using ESPN's own abbreviations, which differ from
// the plain league abbreviation for Washington ("wsh", not "was").

export const NFL_TEAM_NAMES = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
}

const ESPN_LOGO_ABBR_OVERRIDES = {
  WAS: 'wsh',
}

export function getNflTeamName(abbr) {
  return NFL_TEAM_NAMES[abbr] || abbr
}

export function getNflTeamLogo(abbr) {
  if (!abbr) return null
  const espnAbbr = (ESPN_LOGO_ABBR_OVERRIDES[abbr] || abbr).toLowerCase()
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${espnAbbr}.png`
}
